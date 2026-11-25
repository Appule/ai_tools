import test from 'node:test';
import assert from 'node:assert/strict';
import { applyCsp, checkFiles, checkHtml, checkMeta, CSP_CONTENT, finding, tokenizeHtml } from '../lib/opat-core.mjs';

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
    '外部のスクリプトを読み込んでいます。スクリプトはファイルの中に埋め込んでください。 (https://example.com/a.js)');
});
