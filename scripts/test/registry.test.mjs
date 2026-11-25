import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseLibraryId, parseRegistry } from '../lib/opat-core.mjs';
import { extractFromTgz } from '../lib/npm-tarball.mjs';
import { verifyEntry, buildEntry } from '../cdn-registry.mjs';

const hash = (data, algorithm = 'sha384') => algorithm + '-' + createHash(algorithm).update(data).digest('base64');
const id = 'example@1.2.3/dist/a.js';
const content = Buffer.from('const a = 1;');
const cdn = 'https://cdn.jsdelivr.net/npm/' + id;
const cdnjs = 'https://cdnjs.cloudflare.com/ajax/libs/example/1.2.3/a.js';
const valid = () => ({ id, type: 'script', integrity: hash(content), license: 'MIT', urls: [cdn] });
const parse = files => parseRegistry(JSON.stringify({ files }));

test('real registry contains seven URLs with shared entry objects', () => {
  const registry = parseRegistry(readFileSync(new URL('../cdn-libraries.json', import.meta.url), 'utf8'));
  assert.equal(registry.size, 7);
  const entries = [...new Set(registry.values())];
  assert.equal(entries.length, 6);
  const multiple = entries.find(entry => entry.urls.length === 2);
  assert.equal(registry.get(multiple.urls[0]), registry.get(multiple.urls[1]));
});

test('parseLibraryId splits normal and scoped names', () => {
  assert.deepEqual(parseLibraryId('jszip@3.10.1/dist/jszip.min.js'),
    { name: 'jszip', version: '3.10.1', path: 'dist/jszip.min.js' });
  assert.deepEqual(parseLibraryId('@scope/name@1.2.3/dist/x.js'),
    { name: '@scope/name', version: '1.2.3', path: 'dist/x.js' });
});
for (const bad of ['jszip@3.10/dist/a.js', 'jszip@latest/a.js', 'jszip@3.10.1',
  'jszip@3.10.1/./a.js', 'jszip@3.10.1/a/../b.js', 'JSZip@3.10.1/a.js',
  'jszip@03.10.1/a.js', 'jszip@3.10.1/a//b.js', 'jszip@3.10.1/a%20.js', null]) {
  test('rejects invalid library id: ' + bad, () => assert.throws(() => parseLibraryId(bad), /^Error: Invalid registry: /));
}

for (const text of ['{', 'null', '[]', '{}', '{"files":{}}', '{"files":[],"extra":1}']) {
  test('rejects invalid registry root: ' + text, () => assert.throws(() => parseRegistry(text), /Invalid registry: root/));
}
const changes = {
  'extra field': entry => { entry.extra = true; },
  'missing field': entry => { delete entry.type; },
  'invalid id': entry => { entry.id = 'bad'; },
  'nonstring id': entry => { entry.id = null; },
  'wrong type': entry => { entry.type = 'style'; },
  'unknown type': entry => { entry.type = 'binary'; },
  'unknown extension': entry => { entry.id = 'example@1.2.3/a.txt'; },
  'integrity padding': entry => { entry.integrity += '='; },
  'integrity list': entry => { entry.integrity += ' ' + entry.integrity; },
  'integrity option': entry => { entry.integrity += '?x'; },
  'integrity algorithm': entry => { entry.integrity = hash(content, 'sha256'); },
  'integrity type': entry => { entry.integrity = null; },
  'license leading space': entry => { entry.license = ' MIT'; },
  'license trailing space': entry => { entry.license = 'MIT '; },
  'license empty': entry => { entry.license = ''; },
  'license non-ASCII': entry => { entry.license = '許諾'; },
  'license too long': entry => { entry.license = 'a'.repeat(101); },
  'empty urls': entry => { entry.urls = []; },
  'urls type': entry => { entry.urls = cdn; },
  'URL value type': entry => { entry.urls = [null]; },
  'URL order': entry => { entry.urls = [cdnjs, cdn]; },
  'duplicate URL': entry => { entry.urls = [cdn, cdn]; },
  'trailing slash': entry => { entry.urls = [cdn + '/']; },
  'dot path': entry => { entry.urls = [cdn.replace('/dist/', '/./dist/')]; },
  'parent path': entry => { entry.urls = [cdn.replace('/dist/', '/x/../dist/')]; },
  'double slash': entry => { entry.urls = [cdn.replace('/dist/', '//dist/')]; },
  'terminal dot': entry => { entry.urls = [cdn + '/.']; },
  'terminal parent': entry => { entry.urls = [cdn + '/..']; },
  'different jsDelivr id': entry => { entry.urls = [cdn.replace('example@', 'other@')]; },
  'different cdnjs version': entry => { entry.urls = [cdnjs.replace('1.2.3', '1.2.4')]; },
  'different cdnjs extension': entry => { entry.urls = [cdnjs.replace('.js', '.css')]; },
  'invalid cdnjs path': entry => { entry.urls = [cdnjs.replace('/a.js', '/@bad/a.js')]; },
  'other host': entry => { entry.urls = ['https://example.com/a.js']; },
  'HTTP': entry => { entry.urls = [cdn.replace('https:', 'http:')]; },
};
for (const character of ['?', '%', '&', ';', ',', ' ', '#']) {
  changes['URL character ' + character] = entry => { entry.urls = [cdn + character]; };
}
for (const [label, change] of Object.entries(changes)) {
  test('rejects registry: ' + label, () => {
    const entry = valid();
    change(entry);
    assert.throws(() => parse([entry]), /Invalid registry: /);
  });
}
test('rejects invalid entries with their index', () => {
  for (const entry of [null, [], 1, {}]) assert.throws(() => parse([entry]), /Invalid registry: item 1:/);
});
test('rejects unordered and duplicate ids and cross-entry URL reuse', () => {
  const a = valid();
  const b = { ...valid(), id: 'other@1.2.3/dist/a.js', urls: ['https://cdn.jsdelivr.net/npm/other@1.2.3/dist/a.js'] };
  assert.throws(() => parse([b, a]), /sorted and unique/);
  assert.throws(() => parse([a, a]), /Invalid registry/);
  assert.throws(() => parse([{ ...a, urls: [cdnjs] }, { ...b, urls: [cdnjs] }]), /multiple entries/);
});
test('accepts cdnjs, scoped ids, and license boundary lengths', () => {
  assert.equal(parse([{ ...valid(), urls: [cdn, cdnjs] }]).size, 2);
  for (const license of ['X', 'a'.repeat(100)]) assert.equal(parse([{ ...valid(), license }]).size, 1);
  const scoped = '@scope/name@1.2.3/dist/x.js';
  assert.equal(parse([{ ...valid(), id: scoped, urls: ['https://cdn.jsdelivr.net/npm/' + scoped] }]).size, 1);
});

function checksum(header) {
  header.fill(32, 148, 156);
  const sum = header.reduce((a, b) => a + b, 0);
  header.write(sum.toString(8).padStart(6, '0') + '\0 ', 148, 'ascii');
}
function tarEntry({ name = 'package/dist/a.js', data = content, type = '0', prefix = '', mutate } = {}) {
  data = Buffer.from(data);
  const header = Buffer.alloc(512);
  header.write(name, 0, 100);
  header.write(data.length.toString(8).padStart(11, '0') + '\0', 124, 'ascii');
  header[156] = type.charCodeAt(0);
  header.write('ustar\0' + '00', 257, 'ascii');
  header.write(prefix, 345, 155);
  if (mutate) mutate(header);
  checksum(header);
  return Buffer.concat([header, data, Buffer.alloc((512 - data.length % 512) % 512)]);
}
const tgz = (...entries) => gzipSync(Buffer.concat([...entries, Buffer.alloc(1024)]));

for (const [label, entries] of [
  ['package directory', [tarEntry()]],
  ['other directory', [tarEntry({ name: 'other/dist/a.js' })]],
  ['prefix field', [tarEntry({ name: 'a.js', prefix: 'package/dist' })]],
  ['directory entry', [tarEntry({ name: 'package/dist/', data: '', type: '5' }), tarEntry()]],
  ['NUL file type', [tarEntry({ type: '\0' })]],
]) {
  test('extracts file using ' + label, () => assert.deepEqual(extractFromTgz(tgz(...entries), 'dist/a.js'), content));
}
const brokenChecksum = tarEntry();
brokenChecksum[0] ^= 1;
const badTars = {
  checksum: tgz(brokenChecksum),
  format: tgz(tarEntry({ mutate: header => header.fill(0, 257, 265) })),
  duplicate: tgz(tarEntry(), tarEntry({ name: 'other/dist/a.js' })),
  'unrelated duplicate': tgz(tarEntry(), tarEntry({ name: 'package/b.js' }), tarEntry({ name: 'other/b.js' })),
  missing: tgz(tarEntry({ name: 'package/b.js' })),
  'no slash': tgz(tarEntry({ name: 'a.js' })),
  'invalid size': tgz(tarEntry({ mutate: header => header.write('00000000008\0', 124, 'ascii') })),
  'truncated data': gzipSync(tarEntry().subarray(0, 515)),
  'truncated header': gzipSync(Buffer.alloc(20, 1)),
};
for (const type of ['2', 'x', 'g', 'L']) badTars['unsupported type ' + type] = tgz(tarEntry(), tarEntry({ name: 'package/b', type }));
for (const [label, bytes] of Object.entries(badTars)) {
  test('rejects tar: ' + label, () => assert.throws(() => extractFromTgz(bytes, 'dist/a.js'), /Invalid tar:/));
}

function fixture({ file = content, license = 'MIT', npmIntegrity, cdnBody = file, cdnStatus = 200,
  cors = '*', metadataStatus = 200, tarballStatus = 200, metadataDist, fileName = 'dist/a.js' } = {}) {
  const archive = tgz(tarEntry({ name: 'package/' + fileName, data: file }),
    tarEntry({ name: 'package/package.json', data: JSON.stringify({ license }) }));
  const calls = [];
  const fetch = async (url, options) => {
    calls.push({ url, options });
    assert.ok(options.signal instanceof AbortSignal);
    assert.equal(options.signal.aborted, false);
    if (url === 'https://registry.npmjs.org/example/1.2.3' || url === 'https://registry.npmjs.org/@scope%2Fname/1.2.3') {
      return new Response(JSON.stringify({ dist: metadataDist ?? { tarball: 'https://registry.npmjs.org/example/-/example.tgz',
        integrity: npmIntegrity ?? hash(archive, 'sha512') } }), { status: metadataStatus });
    }
    if (url === 'https://registry.npmjs.org/example/-/example.tgz') {
      assert.equal(options.redirect, 'error');
      return new Response(archive, { status: tarballStatus });
    }
    assert.equal(options.redirect, 'manual');
    assert.ok(url.startsWith('https://cdn.jsdelivr.net/npm/') || url === cdnjs);
    return new Response(cdnBody, { status: cdnStatus, headers: cors === null ? {} : { 'Access-Control-Allow-Origin': cors } });
  };
  return { fetch, calls };
}

test('verifies npm, file, license, and every CDN URL', async () => {
  const fake = fixture();
  const result = await verifyEntry({ ...valid(), urls: [cdn, cdnjs] }, fake);
  assert.equal(result.ok, true);
  assert.equal(result.lines.length, 5);
  assert.equal(fake.calls.length, 4);
});
for (const [label, options, entryChange, expectedLines] of [
  ['tarball hash', { npmIntegrity: hash('wrong', 'sha512') }, {}, 2],
  ['file hash', {}, { integrity: hash('wrong') }, 4],
  ['license', {}, { license: 'ISC' }, 4],
  ['CDN redirect', { cdnStatus: 301 }, {}, 4],
  ['CDN bytes', { cdnBody: 'wrong' }, {}, 4],
  ['missing CORS', { cors: null }, {}, 4],
  ['wrong CORS', { cors: 'https://example.com' }, {}, 4],
  ['metadata status', { metadataStatus: 404 }, {}, 2],
  ['tarball status', { tarballStatus: 404 }, {}, 2],
  ['tarball host', { metadataDist: { tarball: 'https://example.com/a.tgz', integrity: 'sha512-x' } }, {}, 2],
  ['metadata integrity', { metadataDist: { tarball: 'https://registry.npmjs.org/a.tgz', integrity: 'sha256-x' } }, {}, 2],
]) {
  test('verification fails for ' + label + ' and continues independent checks', async () => {
    const fake = fixture(options);
    const result = await verifyEntry({ ...valid(), ...entryChange }, fake);
    assert.equal(result.ok, false);
    assert.equal(result.lines.length, expectedLines);
    assert.ok(result.lines.some(line => line.startsWith('FAIL ')));
    assert.ok(fake.calls.some(call => call.url === cdn));
  });
}
test('verification handles fetch errors and continues other URLs', async () => {
  const fake = fixture();
  const result = await verifyEntry({ ...valid(), urls: [cdn, cdnjs] }, {
    fetch: (url, options) => url === cdn ? Promise.reject(new Error('offline')) : fake.fetch(url, options),
  });
  assert.equal(result.ok, false);
  assert.match(result.lines.at(-1), /^OK .*cdnjs/);
});
test('verification reports missing license as OK', async () => {
  const result = await verifyEntry(valid(), fixture({ license: null }));
  assert.equal(result.ok, true);
  assert.ok(result.lines.includes('OK   ' + id + ': license (package.json has no license field)'));
});
test('buildEntry hashes bytes and uses package license and default URL', async () => {
  const result = await buildEntry(id, { type: 'script' }, fixture());
  assert.deepEqual(result, { entry: valid(), warnings: [] });
});
test('buildEntry sorts URLs and supports scoped packages', async () => {
  const result = await buildEntry(id, { type: 'script', urls: [cdnjs, cdn] }, fixture());
  assert.deepEqual(result.entry.urls, [cdn, cdnjs]);
  const scoped = await buildEntry('@scope/name@1.2.3/dist/a.js', { type: 'script' }, fixture());
  assert.equal(scoped.entry.id, '@scope/name@1.2.3/dist/a.js');
});
test('buildEntry requires explicit license when absent and rejects disagreement', async () => {
  await assert.rejects(buildEntry(id, { type: 'script' }, fixture({ license: null })), /--license/);
  await assert.rejects(buildEntry(id, { type: 'script', license: 'ISC' }, fixture()), /license differs/);
  const result = await buildEntry(id, { type: 'script', license: 'ISC' }, fixture({ license: null }));
  assert.equal(result.entry.license, 'ISC');
});
for (const options of [{ cdnStatus: 301 }, { cdnBody: 'wrong' }, { cors: null }]) {
  test('buildEntry rejects failed CDN check: ' + JSON.stringify(options), async () => {
    await assert.rejects(buildEntry(id, { type: 'script' }, fixture(options)));
  });
}
test('buildEntry validates type and warns once about CSS resource references', async () => {
  await assert.rejects(buildEntry(id, { type: 'style' }, fixture()), /type and extension/);
  for (const file of ['a { background: url(x); }', '@import "x";', '@import "x"; a{background:url(x)}']) {
    const result = await buildEntry('example@1.2.3/dist/a.css', { type: 'style' },
      fixture({ file, fileName: 'dist/a.css' }));
    assert.equal(result.warnings.length, 1);
  }
});
test('CLI rejects missing, unknown, and malformed arguments without network', () => {
  for (const args of [[], ['nope'], ['add'], ['add', id], ['add', id, '--type'],
    ['add', id, '--type', 'script', '--oops', 'x'], ['verify', '--oops']]) {
    const result = spawnSync(process.execPath, [fileURLToPath(new URL('../cdn-registry.mjs', import.meta.url)), ...args], { encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Usage:/);
  }
});
