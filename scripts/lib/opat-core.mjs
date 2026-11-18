export const CSP_CONTENT = "default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' blob:; worker-src blob:; style-src 'unsafe-inline'; img-src data: blob:; media-src data: blob:; font-src data: blob:; connect-src data: blob:; form-action 'none'; base-uri 'none'";
const CSP_TAG = '<meta http-equiv="Content-Security-Policy" content="' + CSP_CONTENT + '">';
const SIZE_WARNING = 3 * 1024 * 1024;
const SIZE_ERROR = 10 * 1024 * 1024;
const blank = text => /^[\t\n\f\r ]*$/.test(text);
const normalize = text => text.replaceAll('\r\n', '\n').trim();
const newline = text => text.includes('\r\n') ? '\r\n' : '\n';
const csp = t => t.name === 'meta' &&
  t.attrs?.['http-equiv']?.toLowerCase() === 'content-security-policy';
const charset = t => t.name === 'meta' && t.attrs && 'charset' in t.attrs;
const trimAscii = value => value.replace(/^[\t\n\f\r ]+|[\t\n\f\r ]+$/g, '');

const declaresNonUtf8 = attrs =>
  ('charset' in attrs && trimAscii(attrs.charset).toLowerCase() !== 'utf-8') ||
  (attrs['http-equiv']?.toLowerCase() === 'content-type' &&
    !(attrs.content ?? '').replace(/[\t\n\f\r ]/g, '').toLowerCase().includes('charset=utf-8'));
const emptyVendor = new Map();

const messages = {
  'not-utf8': ['UTF-8 で保存してください。', 'Save the file as UTF-8.'],
  'charset-not-utf8': ['UTF-8 以外の文字コードを宣言しています。<meta charset="utf-8"> にしてください。',
    'The page declares a character encoding other than UTF-8. Use <meta charset="utf-8">.'],
  'no-head': ['<head> を追加してください。', 'Add a <head> element.'],
  'csp-missing': ['--apply-csp で CSP を挿入してください。', 'Insert the CSP with --apply-csp.'],
  'csp-duplicate': ['CSP を1つにしてください。', 'Keep only one CSP tag.'],
  'csp-mismatch': ['--apply-csp で指定の CSP に置き換えてください。', 'Restore the required CSP with --apply-csp.'],
  'csp-position': ['CSP を <head> の先頭付近に置いてください。', 'Place the CSP near the start of <head>.'],
  'external-script': ['スクリプトをファイル内に埋め込んでください。', 'Embed the script in the HTML file.'],
  'external-link': ['リンク先のリソースをファイル内に埋め込んでください。', 'Embed the linked resource in the HTML file.'],
  'forbidden-element': ['この要素を取り除いてください。', 'Remove this element.'],
  'form-action': ['フォームの送信先を取り除いてください。', 'Remove the form target.'],
  'external-media': ['メディアをページ内のデータとして埋め込んでください。', 'Embed the media as page data.'],
  'ping-attr': ['ping 属性を取り除いてください。', 'Remove the ping attribute.'],
  'css-import': ['@import を使わず CSS を埋め込んでください。', 'Embed the CSS without @import.'],
  'css-external-url': ['CSS の参照先をページ内のデータに変更してください。', 'Change the CSS URL to refer to page data.'],
  'vendor-unknown': ['manifest.json に登録されたライブラリ ID を指定してください。', 'Use a library ID registered in manifest.json.'],
  'vendor-mismatch': ['同梱ライブラリを原本から埋め込み直してください。', 'Regenerate the embedded library from its original file.'],
  'vendor-notice-missing': ['ライブラリの直前に指定のライセンス表記を入れてください。', 'Add the required license notice immediately before the library.'],
  'bypass-webrtc': ['WebRTC を使うコードを取り除いてください。', 'Remove code that uses WebRTC.'],
  'bypass-window-open': ['別ウィンドウを開く処理を確認してください。', 'Review the code that opens another window.'],
  'bypass-navigation': ['ページ移動の処理を確認してください。', 'Review the code that navigates to another page.'],
  'parent-access': ['親ページや呼び出し元へのアクセスを確認してください。', 'Review access to the parent or opener page.'],
  'folder-name': ['フォルダ名には小文字の英字、数字、_ を使ってください。', 'Use lowercase letters, digits, and underscores in the folder name.'],
  'missing-index': ['index.html を追加してください。', 'Add index.html.'],
  'missing-meta': ['meta.json を追加してください。', 'Add meta.json.'],
  'subdir-not-allowed': ['サブフォルダを取り除いてください。', 'Remove this subfolder.'],
  'file-not-allowed': ['このファイルを取り除いてください。', 'Remove this file from the app folder.'],
  'size-error': ['HTML を 10 MB 以下にしてください。', 'Reduce the HTML to 10 MB or less.'],
  'size-warning': ['HTML が 3 MB を超えています。', 'The HTML exceeds 3 MB.'],
  'meta-invalid-json': ['meta.json を正しい JSON オブジェクトにしてください。', 'Save meta.json as a valid JSON object.'],
  'meta-id-mismatch': ['id をフォルダ名に合わせてください。', 'Match id to the folder name.'],
  'meta-missing-field': ['必須項目を追加してください。', 'Add the required field.'],
  'meta-invalid-type': ['この項目の型または値を確認してください。', 'Check the type or value of this field.'],
  'meta-invalid-url': ['この項目に有効な URL を指定してください。', 'Use a valid URL for this field.'],
  'meta-unknown-field': ['未定義の項目を確認してください。', 'Review the unrecognized field.'],
};
const warnings = new Set(['bypass-window-open', 'bypass-navigation', 'parent-access',
  'size-warning', 'meta-unknown-field']);

export function finding(ruleId, line = 1, detail = '') {
  const [ja, en] = messages[ruleId];
  const suffix = detail ? ' (' + detail + ')' : '';
  return { ruleId, line, severity: warnings.has(ruleId) ? 'warning' : 'error',
    message: { ja: ja + suffix, en: en + suffix } };
}

export function decodeUtf8(bytes) {
  return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
}

const rawTags = new Set(['script', 'style', 'textarea', 'title']);
export function tokenizeHtml(html) {
  const tokens = [];
  let offset = 0;
  let line = 1;
  const emit = (type, end, properties = {}) => {
    tokens.push({ type, start: offset, end, line, ...properties });
    for (; offset < end; offset++) {
      if (html[offset] === '\n' || (html[offset] === '\r' && html[offset + 1] !== '\n')) line++;
    }
  };
  const tagStart = /<(?:\/?[a-z]|!|\?)/gi;
  const tagName = /<\/?([a-z][^\t\n\f\r />]*)/iy;
  const attribute = /([^\t\n\f\r />][^\t\n\f\r /=>]*)(?:[\t\n\f\r ]*=[\t\n\f\r ]*(?:"([^"]*)"|'([^']*)'|([^ \t\n\f\r >]*)))?/y;
  const spaces = /[\t\n\f\r ]*/y;
  const commentEnd = /--!?>/g;

  while (offset < html.length) {
    tagStart.lastIndex = offset;
    const next = tagStart.exec(html)?.index ?? html.length;
    if (next > offset) {
      const body = html.slice(offset, next);
      emit('text', next, { body: offset === 0 ? body.replace(/^\uFEFF/, '') : body });
      continue;
    }
    if (html.startsWith('<!--', offset)) {
      const bodyStart = offset + 4;
      if (html[bodyStart] === '>') {
        emit('comment', bodyStart + 1, { body: '' });
        continue;
      }
      if (html.startsWith('->', bodyStart)) {
        emit('comment', bodyStart + 2, { body: '' });
        continue;
      }
      commentEnd.lastIndex = bodyStart;
      const match = commentEnd.exec(html);
      emit('comment', match ? commentEnd.lastIndex : html.length,
        { body: html.slice(bodyStart, match?.index) });
      continue;
    }
    tagName.lastIndex = offset;
    const tag = tagName.exec(html);
    if (!tag) {
      const close = html.indexOf('>', offset + 2);
      const end = close < 0 ? html.length : close + 1;
      const type = /^<!doctype(?:[\t\n\f\r >])/i.test(html.slice(offset, offset + 11))
        ? 'doctype' : 'other';
      emit(type, end);
      continue;
    }
    const name = tag[1].toLowerCase();
    const attrs = Object.create(null);
    let cursor = tagName.lastIndex;
    while (cursor < html.length && html[cursor] !== '>') {
      spaces.lastIndex = cursor;
      spaces.exec(html);
      cursor = spaces.lastIndex;
      if (cursor === html.length || html[cursor] === '>') break;
      attribute.lastIndex = cursor;
      const attr = attribute.exec(html);
      if (!attr) {
        cursor++;
        continue;
      }
      attrs[attr[1].toLowerCase()] ??= attr[2] ?? attr[3] ?? attr[4] ?? '';
      cursor = attribute.lastIndex;
    }
    const openEnd = Math.min(cursor + 1, html.length);
    if (html[offset + 1] === '/') {
      emit('end', openEnd, { name });
      continue;
    }
    const properties = { name, attrs, openEnd };
    let end = openEnd;
    if (rawTags.has(name)) {
      const close = new RegExp('</' + name + '(?=[\\t\\n\\f\\r />])[^>]*>', 'gi');
      close.lastIndex = openEnd;
      const match = close.exec(html);
      properties.bodyEnd = match?.index ?? html.length;
      properties.body = html.slice(openEnd, properties.bodyEnd);
      end = match ? close.lastIndex : html.length;
    }
    emit('start', end, properties);
  }
  return tokens;
}

const resourceRels = new Set(['stylesheet', 'preload', 'modulepreload', 'prefetch',
  'prerender', 'dns-prefetch', 'preconnect', 'manifest', 'icon', 'apple-touch-icon']);
const rels = attrs => (attrs.rel ?? '').toLowerCase().split(/[\t\n\f\r ]+/);
const media = new Set(['img', 'audio', 'video', 'source', 'track', 'input']);
const forbidden = new Set(['base', 'iframe', 'frame', 'object', 'embed']);
const isPageData = value => /^(?:$|data:|blob:|#)/i.test(value.trim());
const nonScriptTypes = new Set(['application/json', 'application/ld+json', 'importmap',
  'application/octet-stream', 'text/plain']);
const scriptRules = [
  ['bypass-webrtc', /RTCPeerConnection|RTCDataChannel/],
  ['bypass-window-open', /window\.open\s*\(/],
  ['bypass-navigation', /\blocation(\.href)?\s*=[^=]|\blocation\.(assign|replace)\s*\(/],
  ['parent-access', /\bwindow\.(parent|top|opener)\b/],
];

function srcsetUrls(value) {
  const urls = [];
  const candidates = /[^\t\n\f\r ,][^\t\n\f\r ]*/g;
  let match;
  while ((match = candidates.exec(value))) {
    const url = match[0];
    urls.push(url.replace(/,+$/, ''));
    if (url.endsWith(',')) continue;
    const comma = value.indexOf(',', candidates.lastIndex);
    candidates.lastIndex = comma < 0 ? value.length : comma + 1;
  }
  return urls;
}

const blankToken = t => t.type === 'text' && blank(t.body);
function cspPosition(tokens, index) {
  let head = false;
  let html = false;
  for (let i = 0; i < index; i++) {
    const t = tokens[i];
    if (blankToken(t) || t.type === 'comment') continue;
    if (t.type === 'doctype' && !head) continue;
    if (t.type !== 'start') return false;
    if (t.name === 'html' && !html && !head) html = true;
    else if (t.name === 'head' && !head) head = true;
    else if (!head || !charset(t)) return false;
  }
  return head;
}

function precedingComment(tokens, index) {
  let previous = index - 1;
  while (tokens[previous] && blankToken(tokens[previous])) previous--;
  return tokens[previous]?.type === 'comment' ? tokens[previous] : undefined;
}

const noticeBody = entry => ' opat-vendor-notice: ' + entry.id + '\n' + entry.noticeText + '\n';
const completeBody = token => token.body !== undefined && token.bodyEnd !== token.end;
const binaryTag = attrs => attrs['data-opat-encoding'] === 'base64' &&
  attrs.type?.toLowerCase() === 'application/octet-stream';

function vendorMatches(token, entry) {
  if (token.name !== entry.element || !completeBody(token)) return false;
  if (entry.kind === 'text') return normalize(token.body) === normalize(entry.content);
  if (!binaryTag(token.attrs)) return false;
  const value = token.body.replace(/\s/g, '');
  const decoded = Buffer.from(value, 'base64');
  return decoded.toString('base64') === value && decoded.equals(Buffer.from(entry.content));
}

export function checkHtml(input, { vendor = emptyVendor } = {}) {
  let html;
  try {
    html = typeof input === 'string' ? input : decodeUtf8(input);
  } catch {
    return [finding('not-utf8')];
  }
  const tokens = tokenizeHtml(html);
  const findings = [];
  const add = (rule, token, detail) => findings.push(finding(rule, token?.line, detail));
  if (!tokens.some(t => t.type === 'start' && t.name === 'head')) add('no-head');
  const policies = tokens.filter(csp);
  if (!policies.length) add('csp-missing');
  if (policies.length > 1) add('csp-duplicate', policies[1]);
  for (const policy of policies) {
    if (policy.attrs.content !== CSP_CONTENT) add('csp-mismatch', policy);
  }
  if (policies.length && !cspPosition(tokens, tokens.indexOf(policies[0]))) add('csp-position', policies[0]);

  for (const [index, token] of tokens.entries()) {
    if (token.type !== 'start') continue;
    const { attrs, name, body } = token;
    if (name === 'meta' && declaresNonUtf8(attrs)) add('charset-not-utf8', token);
    if (name === 'script' && 'src' in attrs) add('external-script', token, attrs.src);
    if (name === 'link' && 'href' in attrs && rels(attrs).some(rel =>
      rel === 'dns-prefetch' || rel === 'preconnect' ||
      (resourceRels.has(rel) && !/^data:/i.test(attrs.href.trim())))) add('external-link', token, attrs.href);
    if (forbidden.has(name) || (name === 'meta' && attrs['http-equiv']?.toLowerCase() === 'refresh')) {
      add('forbidden-element', token, name);
    }
    if (name === 'form' && attrs.action) add('form-action', token, attrs.action);
    if ('ping' in attrs) add('ping-attr', token);
    const urls = media.has(name) ? [attrs.src, attrs.poster, ...srcsetUrls(attrs.srcset ?? '')]
      : name === 'image' ? [attrs.href, attrs['xlink:href']] : [];
    for (const url of urls) {
      if (url !== undefined && !isPageData(url)) add('external-media', token, url);
    }

    for (const css of [attrs.style, name === 'style' ? body : undefined]) {
      if (css === undefined) continue;
      const source = css.replace(/\/\*[\s\S]*?\*\//g, '');
      if (/@import\b/i.test(source)) add('css-import', token);
      for (const match of source.matchAll(/\burl\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*))\s*\)/gi)) {
        const url = match[1] ?? match[2] ?? match[3];
        if (!isPageData(url)) add('css-external-url', token, url);
      }
    }

    let verified = false;
    if ('data-opat-vendor' in attrs) {
      const id = attrs['data-opat-vendor'];
      const entry = vendor.get(id);
      if (!entry) {
        add('vendor-unknown', token, id);
      } else {
        verified = vendorMatches(token, entry);
        if (!verified) add('vendor-mismatch', token, id);
        if (entry.notice && normalize(precedingComment(tokens, index)?.body ?? '') !== normalize(noticeBody(entry))) {
          add('vendor-notice-missing', token, id);
        }
      }
    }
    const code = Object.entries(attrs).filter(([key]) => key.startsWith('on')).map(([, value]) => value);
    if (!verified && name === 'script' && (!('type' in attrs) || !nonScriptTypes.has(trimAscii(attrs.type).toLowerCase()))) {
      code.push(body);
    }
    for (const [rule, pattern] of scriptRules) {
      if (code.some(source => pattern.test(source))) add(rule, token);
    }
  }
  return findings;
}

export function checkFiles(entries, { folderName } = {}) {
  const findings = [];
  const add = (rule, path) => findings.push({ ...finding(rule, 1, path), path });
  if (folderName !== undefined && !/^[a-z0-9_]+$/.test(folderName)) add('folder-name', '');
  const files = new Set();
  const subdirs = new Set();
  for (const entry of entries) {
    const [top, nested] = entry.path.replaceAll('\\', '/').split('/');
    if (nested !== undefined || entry.directory) {
      subdirs.add(top);
      continue;
    }
    if (!entry.special) files.add(top);
    if (entry.special || (top !== 'meta.json' && !/\.(html|txt|md|png|jpe?g|webp)$/i.test(top))) {
      add('file-not-allowed', top);
    }
    if (/\.html$/i.test(top) && entry.size > SIZE_WARNING) {
      add(entry.size > SIZE_ERROR ? 'size-error' : 'size-warning', top);
    }
  }
  for (const subdir of subdirs) add('subdir-not-allowed', subdir);
  if (!files.has('index.html')) add('missing-index', '');
  if (!files.has('meta.json')) add('missing-meta', '');
  return findings;
}

const string = value => typeof value === 'string';
const nonempty = value => string(value) && value.trim().length > 0;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const arrayOf = predicate => value => Array.isArray(value) && value.every(predicate);
const records = keys => arrayOf(value => object(value) && keys.every(key => string(value[key])));
const required = {
  id: string, name: nonempty, shortDescription: nonempty,
  tags: value => arrayOf(nonempty)(value) && value.length > 0,
  manual: string, author: nonempty, aiInfo: object,
};
const optional = {
  searchKeywords: arrayOf(string), promptUrl: string, promptLicense: string,
  referencedOSS: records(['name', 'url', 'license']),
  referenceArticles: records(['title', 'url']), downloadUrl: string,
};

function absoluteUrl(value) {
  if (!/^https?:\/\//i.test(value)) return false;
  try {
    return Boolean(new URL(value).hostname);
  } catch {
    return false;
  }
}

export function checkMeta(text, { folderName, fileNames = [] } = {}) {
  let meta;
  try {
    meta = JSON.parse(text.replace(/^\uFEFF/, ''));
  } catch {
    return [finding('meta-invalid-json')];
  }
  if (!object(meta)) return [finding('meta-invalid-json')];
  const results = [];
  const add = (rule, field) => results.push(finding(rule, 1, field));
  for (const [field, validate] of Object.entries({ ...required, ...optional })) {
    if (!Object.hasOwn(meta, field)) {
      if (Object.hasOwn(required, field)) add('meta-missing-field', field);
    } else if (!validate(meta[field])) {
      add('meta-invalid-type', field);
    }
  }
  for (const field of Object.keys(meta)) {
    if (!Object.hasOwn(required, field) && !Object.hasOwn(optional, field)) add('meta-unknown-field', field);
  }
  if (string(meta.id) && folderName !== undefined && meta.id !== folderName) add('meta-id-mismatch', 'id');
  if (object(meta.aiInfo)) {
    if (!Object.hasOwn(meta.aiInfo, 'model')) add('meta-missing-field', 'aiInfo.model');
    else if (!nonempty(meta.aiInfo.model)) add('meta-invalid-type', 'aiInfo.model');
    if ('version' in meta.aiInfo && !string(meta.aiInfo.version)) add('meta-invalid-type', 'aiInfo.version');
  }
  if (string(meta.downloadUrl) && !absoluteUrl(meta.downloadUrl)) add('meta-invalid-url', 'downloadUrl');
  if (string(meta.promptUrl) && meta.promptUrl !== '' && !absoluteUrl(meta.promptUrl)) {
    const prefix = './apps/' + folderName + '/';
    const name = meta.promptUrl.slice(prefix.length);
    if (!meta.promptUrl.startsWith(prefix) || /[/\\?#]/.test(name) || !Array.from(fileNames).includes(name)) {
      add('meta-invalid-url', 'promptUrl');
    }
  }
  for (const field of ['referencedOSS', 'referenceArticles']) {
    if (!Array.isArray(meta[field])) continue;
    for (const [index, value] of meta[field].entries()) {
      if (string(value?.url) && !absoluteUrl(value.url)) add('meta-invalid-url', field + '[' + index + '].url');
    }
  }
  return results;
}

function replaceSpans(text, changes) {
  const parts = [];
  let cursor = 0;
  for (const { start, end, value } of changes) {
    parts.push(text.slice(cursor, start), value);
    cursor = end;
  }
  parts.push(text.slice(cursor));
  return parts.join('');
}

function removeTagLine(html, token) {
  const start = html.lastIndexOf('\n', token.start - 1) + 1;
  const nextLine = html.indexOf('\n', token.end);
  const end = nextLine < 0 ? html.length : nextLine + 1;
  if (blank(html.slice(start, token.start)) && blank(html.slice(token.end, end))) {
    return { start, end, value: '' };
  }
  return { start: token.start, end: token.end, value: '' };
}

export class TransformError extends Error {
  constructor(ruleId, line, ja, en) {
    super(en);
    this.finding = { ruleId, line, severity: 'error', message: { ja, en } };
  }
}

export function applyCsp(html) {
  const tokens = tokenizeHtml(html);
  const head = tokens.findIndex(t => t.type === 'start' && t.name === 'head');
  if (head < 0) throw new TransformError('no-head', 1, ...messages['no-head']);
  const policies = tokens.filter(csp);
  if (policies.length === 1 && policies[0].attrs.content === CSP_CONTENT &&
      cspPosition(tokens, tokens.indexOf(policies[0]))) return html;
  const cleaned = replaceSpans(html, policies.map(t => removeTagLine(html, t)));
  const remaining = tokenizeHtml(cleaned);
  const start = remaining.findIndex(t => t.type === 'start' && t.name === 'head');
  const next = remaining.slice(start + 1).find(t => t.type !== 'comment' && !blankToken(t));
  const anchor = next && charset(next) ? next : remaining[start];
  const after = cleaned.slice(anchor.end);
  const eol = newline(html);
  const indent = after.match(/^[\t ]*\r?\n([\t ]*)(?=\S)/)?.[1] ??
    cleaned.slice(cleaned.lastIndexOf('\n', anchor.start - 1) + 1, anchor.start).match(/^[\t ]*/)[0];
  const lineBreak = /^[\t ]*\r?\n/.test(after) ? '' : eol;
  return cleaned.slice(0, anchor.end) + eol + indent + CSP_TAG + lineBreak + after;
}

const unsafeVendorPatterns = new Map([
  ['script', /<\/script|<!--/i],
  ['style', /<\/style/i],
]);
// 当たった場合は RegExp の exec の結果（match[0] と match.index がある）、当たらなければ null を返す。
// element が 'script' と 'style' 以外なら TypeError を投げる。
export function unsafeVendorText(element, text) {
  const pattern = unsafeVendorPatterns.get(element);
  if (!pattern) throw new TypeError('Unknown vendor element: ' + element);
  return pattern.exec(text);
}

export function inlineVendor(html, { vendor = emptyVendor } = {}) {
  const tokens = tokenizeHtml(html);
  const eol = newline(html);
  const urls = new Map(Array.from(vendor.values()).flatMap(entry => entry.urls.map(url => [url, entry])));
  const changes = [];
  for (const [index, token] of tokens.entries()) {
    if (token.type !== 'start') continue;
    const { name, attrs, line } = token;
    const id = attrs['data-opat-vendor'];
    const url = name === 'script' ? attrs.src :
      name === 'link' && rels(attrs).includes('stylesheet') ? attrs.href : undefined;
    const replacing = id === undefined;
    const entry = replacing ? urls.get(url) : vendor.get(id);
    if (!entry) continue;
    const error = (ja, en) => {
      throw new TransformError('vendor-mismatch', line, ja + ' (' + entry.id + ')', en + ' (' + entry.id + ')');
    };
    if (replacing && ((name === 'script' ? 'script' : 'style') !== entry.element ||
        (name === 'script' && ('defer' in attrs || 'async' in attrs || attrs.type?.toLowerCase() === 'module')))) {
      error('実行方式が変わるため埋め込めません。', 'Cannot inline this tag without changing how it executes.');
    }
    if (!replacing && (name !== entry.element || !completeBody(token) ||
        (entry.kind === 'binary' && !binaryTag(attrs)))) {
      error('同梱ライブラリ用のタグと属性を確認してください。', 'Check the embedded library tag and attributes.');
    }
    if (entry.kind === 'text' && unsafeVendorText(entry.element, entry.content)) {
      error('HTML に埋め込めない文字列が原本に含まれます。', 'The original contains text that cannot be embedded safely.');
    }
    const content = entry.kind === 'text' ? entry.content.replaceAll('\r\n', '\n')
      : (Buffer.from(entry.content).toString('base64').match(/.{1,76}/g) ?? []).join('\n');
    const opening = replacing ? '<' + entry.element + ' data-opat-vendor="' + entry.id + '">'
      : html.slice(token.start, token.openEnd);
    const closing = replacing ? '</' + entry.element + '>' : html.slice(token.bodyEnd, token.end);
    const previous = precedingComment(tokens, index);
    const oldNotice = previous && /^\s*opat-vendor-notice:/.test(previous.body);
    const indent = html.slice(html.lastIndexOf('\n', token.start - 1) + 1, token.start);
    const gap = oldNotice ? html.slice(previous.end, token.start) : eol + (blank(indent) ? indent : '');
    const notice = entry.notice ? '<!--' + noticeBody(entry).replace(/\r?\n/g, eol) + '-->' + gap : '';
    changes.push({ start: oldNotice ? previous.start : token.start, end: token.end,
      value: notice + opening + eol + content.replaceAll('\n', eol) + eol + closing });
  }
  return replaceSpans(html, changes);
}
