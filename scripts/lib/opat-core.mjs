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
  'not-utf8': ['ファイルを UTF-8 として読めません。UTF-8 で保存し直してください。',
    'The file cannot be read as UTF-8. Save it again as UTF-8.'],
  'charset-not-utf8': ['UTF-8 以外の文字コードを宣言しています。<meta charset="utf-8"> にしてください。',
    'The page declares a character encoding other than UTF-8. Use <meta charset="utf-8">.'],
  'no-head': ['<head> がないため、CSP を置く場所がありません。<head> を追加してください。',
    'The page has no <head> element, so there is no place for the CSP. Add a <head> element.'],
  'csp-missing': ['CSP のタグがありません。--apply-csp で挿入してください。',
    'The CSP tag is missing. Insert it with --apply-csp.'],
  'csp-duplicate': ['CSP のタグが2つ以上あります。--apply-csp で1つにしてください。',
    'There is more than one CSP tag. Run --apply-csp to keep only one.'],
  'csp-mismatch': ['CSP の内容が、決められたものと違います。--apply-csp で置き換えてください。',
    'The CSP differs from the required one. Replace it with --apply-csp.'],
  'csp-position': ['CSP のタグより前に、ほかのタグや文字があります。CSP のタグを <head> の先頭（<meta charset> の直後）に置いてください。--apply-csp で移せます。',
    'Other tags or text come before the CSP tag. Place the CSP tag at the start of <head>, right after <meta charset>. --apply-csp can move it there.'],
  'external-script': ['外部のスクリプトを読み込んでいます。スクリプトはファイルの中に埋め込んでください。登録済みのライブラリなら、--inline-vendor で埋め込めます。',
    'The page loads an external script. Embed the script in the HTML file. For a registered library, --inline-vendor can embed it.'],
  'external-link': ['<link> で、ファイルの外のものを読み込もうとしています。中身をファイルの中に埋め込むか、この <link> を取り除いてください。登録済みのライブラリの CSS なら、--inline-vendor で埋め込めます。',
    'A <link> element loads something from outside the file. Embed the content in the HTML file, or remove this <link>. For a registered library stylesheet, --inline-vendor can embed it.'],
  'forbidden-element': ['この要素は、ページの外のものを読み込んだり、ページを移動させたりするのに使えるため、許可していません。取り除いてください。',
    'This element is not allowed because it can load content from outside the page or move to another page. Remove it.'],
  'form-action': ['フォームに送信先（action 属性）が指定されています。ページの外へデータを送ることはできないため、action 属性を取り除いてください。',
    'The form has a destination in its action attribute. Sending data out of the page is not allowed, so remove the action attribute.'],
  'external-media': ['画像や音声などを、ファイルの外から読み込んでいます。data: URL にして、ファイルの中に埋め込んでください。',
    'An image, audio, or other media is loaded from outside the file. Embed it in the HTML file as a data: URL.'],
  'ping-attr': ['ping 属性（リンクを開いたことを外部に知らせる機能）があります。ping 属性を取り除いてください。',
    'The element has a ping attribute, which reports link clicks to a server. Remove the ping attribute.'],
  'css-import': ['CSS の @import で、別のファイルを読み込んでいます。読み込む CSS を、<style> の中に直接書いてください。',
    'The CSS uses @import to load another file. Write that CSS directly inside <style>.'],
  'css-external-url': ['CSS の url(...) が、ファイルの外を指しています。data: URL にして、ファイルの中に埋め込んでください。',
    'A url(...) in the CSS points outside the file. Embed the resource in the HTML file as a data: URL.'],
  'vendor-unknown': ['data-opat-vendor に、登録されていないライブラリが指定されています。vendor/manifest.json にある ID を指定してください。',
    'data-opat-vendor names a library that is not registered. Use an ID listed in vendor/manifest.json.'],
  'vendor-mismatch': ['埋め込まれたライブラリの中身が、vendor/ の原本と一致しません。--inline-vendor で埋め込み直してください。',
    'The embedded library does not match the original in vendor/. Run --inline-vendor to embed it again.'],
  'vendor-notice-missing': ['ライブラリの直前に、ライセンス表記のコメントがないか、内容が違います。--inline-vendor で埋め込み直してください。',
    'The license notice comment before the library is missing or different. Run --inline-vendor to embed it again.'],
  'bypass-webrtc': ['WebRTC（ブラウザ同士が直接通信する機能）を使っています。この機能は CSP で止められないため、使えません。該当するコードを取り除いてください。',
    'The script uses WebRTC, which lets browsers communicate directly. CSP cannot block it, so it is not allowed. Remove this code.'],
  'bypass-window-open': ['スクリプトが新しいウィンドウを開いています。開く URL にデータを載せると外部に送れるため、メンテナーが内容を確認します。',
    'The script opens a new window. Data placed in its URL can leave the browser, so a maintainer will review this.'],
  'bypass-navigation': ['スクリプトがページを移動させています。移動先の URL にデータを載せると外部に送れるため、メンテナーが内容を確認します。外部のサイトへ移動する処理であれば、取り除いてください。',
    'The script navigates to another page. Data placed in the destination URL can leave the browser, so a maintainer will review this. Remove it if it navigates to an external site.'],
  'parent-access': ['スクリプトが、親のページや、このページを開いたページを使っています。ほかのページを読み書きできるため、メンテナーが内容を確認します。',
    'The script uses the parent page or the page that opened it. This can read or change other pages, so a maintainer will review this.'],
  'folder-name': ['フォルダ名に、使えない文字があります。小文字の英字、数字、_ だけにしてください。',
    'The folder name contains characters that are not allowed. Use only lowercase letters, digits, and underscores.'],
  'missing-index': ['アプリのフォルダに index.html がありません。アプリ本体を index.html という名前で置いてください。',
    'The app folder has no index.html. Add the app as index.html.'],
  'missing-meta': ['アプリのフォルダに meta.json がありません。アプリの情報を書いた meta.json を追加してください。',
    'The app folder has no meta.json. Add a meta.json that describes the app.'],
  'subdir-not-allowed': ['アプリのフォルダの中に、サブフォルダがあります。必要なものは index.html の中に埋め込み、サブフォルダを取り除いてください。',
    'The app folder contains a subfolder. Embed what the app needs in index.html, and remove the subfolder.'],
  'file-not-allowed': ['アプリのフォルダに置けない種類のファイルです。必要なものは index.html の中に埋め込み、このファイルを取り除いてください。',
    'This kind of file is not allowed in the app folder. Embed what the app needs in index.html, and remove this file.'],
  'size-error': ['HTML のファイルが 10 MB を超えています。10 MB 以下にしてください。',
    'The HTML file is larger than 10 MB. Reduce it to 10 MB or less.'],
  'size-warning': ['HTML のファイルが 3 MB を超えています。開くのに時間がかかるため、できれば小さくしてください。',
    'The HTML file is larger than 3 MB. It may load slowly, so reduce its size if you can.'],
  'meta-invalid-json': ['meta.json を JSON のオブジェクトとして読めません。書き方を確かめて、{ } で囲んだ形にしてください。',
    'meta.json cannot be read as a JSON object. Check its syntax, and make it an object enclosed in { }.'],
  'meta-id-mismatch': ['meta.json の id が、フォルダ名と違います。id をフォルダ名と同じにしてください。',
    'The id in meta.json differs from the folder name. Make the id the same as the folder name.'],
  'meta-missing-field': ['meta.json に、必須の項目がありません。この項目を追加してください。',
    'A required field is missing from meta.json. Add this field.'],
  'meta-invalid-type': ['meta.json のこの項目の値が、種類が違うか、空になっています。値を直してください。',
    'The value of this field in meta.json has the wrong type or is empty. Fix the value.'],
  'meta-invalid-url': ['meta.json のこの項目が、正しい URL になっていません。http:// か https:// で始まる URL を指定してください。promptUrl では、アプリのフォルダにあるファイルへの相対パスも使えます。',
    'This field in meta.json is not a valid URL. Use a URL that starts with http:// or https://. For promptUrl, a relative path to a file in the app folder is also allowed.'],
  'meta-unknown-field': ['meta.json に、決められていない項目があります。名前の書き間違いでなければ、取り除いてください。',
    'meta.json has a field that is not defined. Check it for typos, or remove it.'],
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
      error('このタグは、埋め込むと実行のされ方が変わるため、置き換えられません。defer、async、type="module" を外すか、タグの種類（<script> か <link rel="stylesheet">）がライブラリと合っているかを確かめてください。', 'This tag cannot be replaced, because embedding it would change how it runs. Remove defer, async, or type="module", or check that the tag type (<script> or <link rel="stylesheet">) matches the library.');
    }
    if (!replacing && (name !== entry.element || !completeBody(token) ||
        (entry.kind === 'binary' && !binaryTag(attrs)))) {
      error('data-opat-vendor を付けた要素の、タグの種類・属性・閉じタグのどれかが正しくありません。ライブラリを読み込む元の <script src> か <link> のタグに戻して、--inline-vendor を実行し直してください。', 'The element with data-opat-vendor has the wrong tag or attributes, or is not closed. Restore the original <script src> or <link> tag that loads the library, and run --inline-vendor again.');
    }
    if (entry.kind === 'text' && unsafeVendorText(entry.element, entry.content)) {
      error('ライブラリの原本に、HTML の中に埋め込めない文字列（</script など）が含まれています。このライブラリは埋め込めないため、メンテナーに相談してください。', 'The original library contains text that cannot be placed inside HTML, such as </script. This library cannot be embedded, so ask a maintainer.');
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
