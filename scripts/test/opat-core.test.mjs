import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { applyCsp, checkFiles, checkHtml, checkMeta, CSP_CONTENT, finding, tokenizeHtml, buildCsp, collectCdnUrls, parseRegistry, TransformError } from '../lib/opat-core.mjs';

const policy = '<meta http-equiv="Content-Security-Policy" content="' + CSP_CONTENT + '">';
const page = (content = '', before = '') => '<!doctype html><html><head>' + before + policy +
  '</head><body>' + content + '</body></html>';
const ids = (html, options) => checkHtml(html, options).map(finding => finding.ruleId);
test('raw text, comments, and HTML attribute syntax', () => {
  const tokens = tokenizeHtml('<!-- <a> -->\n<SCRIPT><link rel="stylesheet" href="https://x"></SCRIPT >' +
    '<a TITLE="a>b" Class=foo hidden><textarea><img></textarea><title><base></title>');
  const tags = tokens.filter(t => t.type === 'start');
  assert.deepEqual(tags.map(t => t.name), ['script', 'a', 'textarea', 'title']);
  assert.equal(tags[0].line, 2);
  assert.equal(tags[0].body, '<link rel="stylesheet" href="https://x">');
  assert.deepEqual({ ...tags[1].attrs }, { title: 'a>b', class: 'foo', hidden: '' });
});

for (const [label, html, expected] of [
  ['valid page', page('<a href="https://example.test">Link</a>'), []],
  ['invalid UTF-8', Buffer.from([0xc0]), ['not-utf8']],
  ['no CSP', '<head></head>', ['csp-missing']],
  ['different CSP', page().replace(CSP_CONTENT, CSP_CONTENT + ' '), ['csp-mismatch']],
  ['duplicate CSP', page(policy), ['csp-duplicate']],
  ['script precedes CSP', page('', '<script></script>'), ['csp-position']],
  ['text precedes head', 'Text' + page(), ['csp-position']],
  ['CSP outside head', '<head></head>' + policy, ['csp-position']],
  ['charset and comment precede CSP', page('', '<!-- comment --><meta charset=utf-8>'), []],
  ['script source', page('<script src="./a.js"></script><script src=https://example.test/a.js></script>'),
    ['external-script', 'external-script']],
  ['resource links', page('<link rel="stylesheet" href=https://x><link rel=icon href=data:image/png,a>' +
    '<link rel=dns-prefetch href=data:,x>'), ['external-link', 'external-link']],
  ['forbidden tags', page('<iframe></iframe><base><meta http-equiv=refresh>'),
    ['forbidden-element', 'forbidden-element', 'forbidden-element']],
  ['media links', page('<img src=https://x><img src=data:image/png,a><img src=""><svg><image href=./a></image></svg>'),
    ['external-media', 'external-media']],
  ['srcset', page('<img srcset="data:image/png;base64,a 1x, https://x/image 2x">'), ['external-media']],
  ['CSS imports and links', page('<style>@import "x";a{a:url(https://x);b:url(data:,x);c:url(#a)}</style>'),
    ['css-import', 'css-external-url']],
  ['form and ping', page('<form action=./send><a href="https://x" ping=./ping></a></form>'),
    ['form-action', 'ping-attr']],
  ['WebRTC', page('<script>new RTCPeerConnection()</script>'), ['bypass-webrtc']],
  ['navigation', page('<script>location.href = x; location.replace(x)</script>'), ['bypass-navigation']],
  ['comparison and hash', page('<script>location.hash = x; if (location.href == x) {}</script>'), []],
  ['data script', page('<script type=application/json>"window.open("</script>'), []],
  ['event handlers', page('<a onclick="window.open(x)" onfocus="window.open(y); window.parent"></a>'),
    ['bypass-window-open', 'parent-access']],
]) {
  test(label, () => assert.deepEqual(ids(html), expected));
}

test('CSP placement, exact replacement, idempotence, and CRLF', () => {
  const html = '<head>\r\n  <meta charset=utf-8>\r\n  <title>Title</title>\r\n</head>';
  const output = applyCsp(html);
  assert.equal(output, html.replace('  <title>', '  ' + policy + '\r\n  <title>'));
  assert.equal(applyCsp(output), output);
  assert.equal(applyCsp('<head>\n  <title>x</title>\n</head>'), '<head>\n  ' + policy + '\n  <title>x</title>\n</head>');
  assert.equal(applyCsp('<head>\n  <meta http-equiv="content-security-policy" content="wrong">\n' +
    '  ' + policy + '\n</head>'), '<head>\n' + policy + '\n</head>');
  assert.throws(() => applyCsp('<body></body>'), /head/);
});

test('metadata rules and relative prompt validation', () => {
  const meta = { id: 'demo', name: 'Demo', shortDescription: 'App', tags: ['art'],
    manual: '', author: 'Author', aiInfo: { model: 'Model' }, promptUrl: './apps/demo/prompt.txt' };
  const validate = value => checkMeta(JSON.stringify(value), { folderName: 'demo', fileNames: ['prompt.txt'] })
    .map(result => result.ruleId);
  assert.deepEqual(validate(meta), []);
  assert.deepEqual(validate({ ...meta, id: 'other', manual: undefined, tags: [7],
    downloadUrl: 'javascript:alert(1)', extra: 1 }).sort(), [
    'meta-id-mismatch', 'meta-invalid-type', 'meta-invalid-url', 'meta-missing-field', 'meta-unknown-field',
  ]);
  assert.deepEqual(validate({ ...meta, promptUrl: './apps/demo/missing.txt' }), ['meta-invalid-url']);
});

test('folder layout and size thresholds', () => {
  const rules = checkFiles([
    { path: 'assets/' }, { path: 'assets/nested/file.js' }, { path: 'a.js' }, { path: 'meta.json' },
    { path: 'large.html', size: 4 * 1024 ** 2 }, { path: 'huge.html', size: 11 * 1024 ** 2 },
  ], { folderName: 'Bad' }).map(result => result.ruleId).sort();
  assert.deepEqual(rules, ['file-not-allowed', 'folder-name', 'missing-index',
    'size-error', 'size-warning', 'subdir-not-allowed']);
});

for (const [comment, body] of [
  ['<!-->', ''],
  ['<!--->', ''],
  ['<!---->', ''],
  ['<!-- a -->', ' a '],
  ['<!-- a --!>', ' a '],
]) {
  test('tokenizes a comment ending in ' + comment + ' before a tag', () => {
    const [first, second] = tokenizeHtml(comment + '<p>');
    assert.equal(first.type, 'comment');
    assert.equal(first.body, body);
    assert.equal(first.end, comment.length);
    assert.equal(second.type, 'start');
    assert.equal(second.name, 'p');
  });
}

test('keeps a leading equals sign in an attribute name', () => {
  const [meta] = tokenizeHtml('<meta =http-equiv="x" content="y">');
  assert.deepEqual({ ...meta.attrs }, { '=http-equiv': 'x', content: 'y' });
});

test('reports a CSP after a paragraph following an abruptly closed comment', () => {
  const html = '<!doctype html><!--><p>x</p><!-- --><html><head>' + policy + '</head><body></body></html>';
  assert.ok(ids(html).includes('csp-position'));
});

test('does not recognize a CSP with an attribute named =http-equiv', () => {
  const html = '<!doctype html><html><head>' + policy.replace('http-equiv', '=http-equiv') +
    '</head><body></body></html>';
  assert.ok(ids(html).includes('csp-missing'));
});

for (const [label, html, expected] of [
  ['non-UTF-8 charset', page('', '<meta charset="Shift_JIS">'), ['charset-not-utf8']],
  ['UTF-8 charset with surrounding spaces', page('', '<meta charset=" UTF-8 ">'), []],
  ['non-UTF-8 content type', page('<meta http-equiv="Content-Type" content="text/html; charset=iso-2022-jp">'),
    ['charset-not-utf8']],
  ['UTF-8 content type', page('<meta http-equiv="Content-Type" content="text/html; charset=UTF-8">'), []],
  ['WebRTC in a Babel script', page('<script type="text/babel">new RTCPeerConnection()</script>'), ['bypass-webrtc']],
  ['JSON script type with surrounding spaces', page('<script type=" Application/JSON ">"window.open("</script>'), []],
]) {
  test(label, () => assert.deepEqual(ids(html), expected));
}

test('all finding messages use sentence punctuation and no backticks', () => {
  const ruleIds = [
    'not-utf8', 'charset-not-utf8', 'no-head', 'csp-missing', 'csp-duplicate', 'csp-mismatch',
    'csp-position', 'external-script', 'external-link', 'forbidden-element', 'form-action',
    'cdn-integrity', 'cdn-crossorigin', 'cdn-connect-unknown', 'cdn-connect-no-integrity',
    'external-media', 'ping-attr', 'css-import', 'css-external-url',
    'bypass-webrtc', 'bypass-window-open',
    'bypass-navigation', 'parent-access', 'folder-name', 'missing-index', 'missing-meta',
    'subdir-not-allowed', 'file-not-allowed', 'size-error', 'size-warning', 'meta-invalid-json',
    'meta-id-mismatch', 'meta-missing-field', 'meta-invalid-type', 'meta-invalid-url', 'meta-unknown-field',
  ];
  for (const id of ruleIds) {
    const { ja, en } = finding(id).message;
    assert.ok(ja.endsWith('。'), id);
    assert.ok(en.endsWith('.'), id);
    assert.ok(!ja.includes('`'), id);
    assert.ok(!en.includes('`'), id);
  }
});

test('external script message includes the URL after the Japanese advice', () => {
  const { message } = finding('external-script', 1, 'https://example.com/a.js');
  assert.equal(message.ja,
    '外部のスクリプトを読み込んでいます。スクリプトはファイルの中に埋め込んでください。登録済みのライブラリなら、登録された URL のまま読み込めます（一覧は scripts/cdn-libraries.json）。 (https://example.com/a.js)');
});


const fixtureFiles = [['a.js', 'script'], ['b.css', 'style'], ['c.wasm', 'wasm']].map(([file, type]) => {
  const id = 'demo@1.0.0/' + file;
  return { id, type, integrity: 'sha384-' + createHash('sha384').update(file).digest('base64'),
    license: 'MIT', urls: ['https://cdn.jsdelivr.net/npm/' + id] };
});
const registry = parseRegistry(JSON.stringify({ files: fixtureFiles }));
const [js, css, wasm] = fixtureFiles.map(entry => entry.urls[0]);
const [jsHash, cssHash, wasmHash] = fixtureFiles.map(entry => entry.integrity);
const options = { registry };
const cdnPolicy = urls => '<meta http-equiv="Content-Security-Policy" content="' + buildCsp(urls) + '">';
const cdnPage = (body, urls = {}) => '<head>' + cdnPolicy(urls) + '</head><body>' + body + '</body>';
const scriptTag = (attrs = '') => '<script src="' + js + '"' + attrs + '></script>';
const goodScript = scriptTag(' integrity="' + jsHash + '" crossorigin="anonymous"');
const goodStyle = '<link rel=" stylesheet " href="' + css + '" integrity="' + cssHash + '" crossorigin="anonymous">';
const declaration = '<meta name="opat-cdn-connect" content="' + wasm + '">';

test('attribute spans preserve syntax and names preserve duplicates', () => {
  const html = '<a TITLE = "a>b" class=foo hidden title=second>';
  const [token] = tokenizeHtml(html);
  assert.equal(Object.getPrototypeOf(token.attrSpans), null);
  assert.deepEqual(token.attrNames, ['title', 'class', 'hidden', 'title']);
  for (const [name, expected] of [['title', 'TITLE = "a>b"'], ['class', 'class=foo'], ['hidden', 'hidden']]) {
    const { start, end } = token.attrSpans[name];
    assert.equal(html.slice(start, end), expected);
  }
  assert.equal(token.attrs.title, 'a>b');
});

test('buildCsp places sorted unique URLs in only their directives', () => {
  assert.equal(buildCsp(), CSP_CONTENT);
  assert.equal(buildCsp({ script: [js, 'https://a.test/a.js', js], style: [css], connect: [wasm] }),
    "default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' blob: https://a.test/a.js https://cdn.jsdelivr.net/npm/demo@1.0.0/a.js; worker-src blob:; style-src 'unsafe-inline' https://cdn.jsdelivr.net/npm/demo@1.0.0/b.css; img-src data: blob:; media-src data: blob:; font-src data: blob:; connect-src data: blob: https://cdn.jsdelivr.net/npm/demo@1.0.0/c.wasm; form-action 'none'; base-uri 'none'");
});
for (const value of ['https://a.test/a;bad', 'https://a.test/a b', "'self'", null, 1]) {
  test('buildCsp rejects unsafe URL ' + value, () => {
    for (const type of ['script', 'style', 'connect']) assert.throws(() => buildCsp({ [type]: [value] }), TypeError);
  });
}

test('collectCdnUrls uses tag type, exclusive rel, and exact meta name', () => {
  const html = goodScript + goodScript + goodStyle + declaration + declaration +
    '<link rel=stylesheet href="' + js + '"><script src="' + css + '"></script>' +
    '<link rel="stylesheet preload" href="' + css + '">' +
    '<meta name="OPAT-CDN-CONNECT" content="' + wasm + '">' +
    '<!-- ' + scriptTag() + ' --><script>' + declaration + '</script>';
  assert.deepEqual(collectCdnUrls(html, options), { script: [js], style: [css], connect: [wasm] });
  assert.deepEqual(collectCdnUrls(html), { script: [], style: [], connect: [] });
});

for (const [label, body, urls, expected] of [
  ['registered JS', goodScript, { script: [js] }, []],
  ['registered CSS', goodStyle, { style: [css] }, []],
  ['unregistered version', '<script src="' + js.replace('1.0.0', '1.0.1') + '"></script>', {}, ['external-script']],
  ['script href', '<script href=""></script>', {}, ['external-script']],
  ['script xlink:href', '<script xlink:href="x"></script>', {}, ['external-script']],
  ['src and href independently', scriptTag(' href=x xlink:href=y integrity="' + jsHash + '" crossorigin="anonymous"'), { script: [js] }, ['external-script']],
  ['CSS preload', goodStyle.replace(' stylesheet ', 'stylesheet preload'), {}, ['external-link']],
  ['unknown wasm', '<meta name=opat-cdn-connect content="https://unknown.test/a.wasm">', {}, ['cdn-connect-unknown']],
  ['missing wasm content', '<meta name=opat-cdn-connect>', {}, ['cdn-connect-unknown']],
  ['wrong wasm type', '<meta name=opat-cdn-connect content="' + js + '">', {}, ['cdn-connect-unknown']],
  ['missing script URL in CSP', goodScript, {}, ['csp-mismatch']],
  ['extra script URL in CSP', '', { script: [js] }, ['csp-mismatch']],
]) {
  test('CDN check: ' + label, () => assert.deepEqual(ids(cdnPage(body, urls), options), expected));
}
for (const integrity of ['', ' integrity="wrong"', ' integrity="' + jsHash + ' ' + jsHash + '"']) {
  test('rejects missing or nonexact integrity: ' + integrity, () => {
    assert.deepEqual(ids(cdnPage(scriptTag(integrity + ' crossorigin="anonymous"'), { script: [js] }), options), ['cdn-integrity']);
  });
}
for (const crossorigin of ['', ' crossorigin="use-credentials"', ' crossorigin']) {
  test('rejects missing or nonanonymous crossorigin: ' + crossorigin, () => {
    assert.deepEqual(ids(cdnPage(scriptTag(' integrity="' + jsHash + '"' + crossorigin), { script: [js] }), options), ['cdn-crossorigin']);
  });
}

test('wasm warning is unique and uses the first declaration line', () => {
  const html = '<head>\n' + cdnPolicy({ connect: [wasm] }) + '\n' + declaration + '\n' + declaration + '</head>';
  const findings = checkHtml(html, options);
  assert.deepEqual(findings, [finding('cdn-connect-no-integrity', 3, wasm)]);
  assert.equal(findings[0].severity, 'warning');
  assert.deepEqual(checkHtml(html + '<!-- ' + wasmHash + ' -->', options), []);
});

test('without registry, CDN scripts remain external', () => {
  assert.deepEqual(ids(page(goodScript)), ['external-script']);
});

test('applyCsp adds both attributes and preserves trailing spaces', () => {
  const html = cdnPage(scriptTag('  '), { script: [js] });
  const expected = cdnPage(scriptTag(' integrity="' + jsHash + '" crossorigin="anonymous"  '), { script: [js] });
  assert.equal(applyCsp(html, options), expected);
  assert.equal(applyCsp(expected, options), expected);
  assert.deepEqual(checkHtml(expected, options), []);
});

test('applyCsp replaces full attribute spans without moving other attributes', () => {
  const html = cdnPage(scriptTag(" defer integrity='bad' class=x crossorigin id=y"), { script: [js] });
  const expected = cdnPage(scriptTag(' defer integrity="' + jsHash + '" class=x crossorigin="anonymous" id=y'), { script: [js] });
  assert.equal(applyCsp(html, options), expected);
  assert.equal(applyCsp(expected, options), expected);
  assert.deepEqual(checkHtml(expected, options), []);
});

test('applyCsp adds CSS integrity before a self-closing delimiter', () => {
  const html = '<head>\n  <link rel=stylesheet href="' + css + '" />\n</head>';
  const expected = '<head>\n  ' + cdnPolicy({ style: [css] }) + '\n  <link rel=stylesheet href="' + css +
    '" integrity="' + cssHash + '" crossorigin="anonymous" />\n</head>';
  assert.equal(applyCsp(html, options), expected);
  assert.deepEqual(checkHtml(expected, options), []);
});

test('applyCsp declares wasm after CSP with CRLF and matching indentation', () => {
  const body = '<script>fetch("' + wasm + '", { integrity: "' + wasmHash + '" })</script>';
  const html = '<head>\r\n  <meta charset=utf-8>\r\n  <title>x</title>\r\n</head>' + body;
  const expected = html.replace('  <title>', '  ' + cdnPolicy({ connect: [wasm] }) + '\r\n  ' + declaration + '\r\n  <title>');
  assert.equal(applyCsp(html, options), expected);
  assert.equal(applyCsp(expected, options), expected);
  assert.deepEqual(checkHtml(expected, options), []);
});

for (const name of ['src', 'href', 'integrity', 'crossorigin']) {
  test('applyCsp rejects duplicated ' + name + ' before returning changes', () => {
    const extra = name === 'src' ? ' SRC=x' : ' ' + name + '=x ' + name.toUpperCase() + '=y';
    const html = cdnPage(scriptTag() + scriptTag(extra), { script: [js] });
    assert.throws(() => applyCsp(html, options), error => error instanceof TransformError &&
      error.finding.ruleId === 'cdn-integrity');
  });
}

test('applyCsp permits duplicated unrelated attributes', () => {
  for (const attrs of [' class=x CLASS=y', ' class=x CLASS="y>z" class=last/']) {
    const html = cdnPage(scriptTag(attrs), { script: [js] });
    const output = applyCsp(html, options);
    assert.ok(output.includes(attrs + ' integrity="'));
    assert.equal(applyCsp(output, options), output);
    assert.deepEqual(checkHtml(output, options), []);
  }
});
