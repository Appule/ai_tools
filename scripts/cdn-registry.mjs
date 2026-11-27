import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseLibraryId, parseRegistry } from './lib/opat-core.mjs';
import { extractFromTgz } from './lib/npm-tarball.mjs';

const digest = (bytes, algorithm) => algorithm + '-' + createHash(algorithm).update(bytes).digest('base64');
const ensure = (condition, message) => { if (!condition) throw new Error(message); };
const request = (fetch, url, options = {}) => fetch(url, { ...options, signal: AbortSignal.timeout(60000) });

async function getPackage(id, fetch) {
  const { name, version, path } = parseLibraryId(id);
  const metadata = await request(fetch, 'https://registry.npmjs.org/' + name.replace('/', '%2F') + '/' + version);
  ensure(metadata.status === 200, 'npm metadata status: ' + metadata.status);
  const { dist } = await metadata.json();
  ensure(typeof dist?.tarball === 'string' && dist.tarball.startsWith('https://registry.npmjs.org/'), 'Invalid npm tarball URL');
  ensure(typeof dist.integrity === 'string' && dist.integrity.startsWith('sha512-'), 'Invalid npm integrity');
  const response = await request(fetch, dist.tarball, { redirect: 'error' });
  ensure(response.status === 200, 'npm tarball status: ' + response.status);
  const tgz = Buffer.from(await response.arrayBuffer());
  ensure(digest(tgz, 'sha512') === dist.integrity, 'npm tarball SHA-512 mismatch');
  return { tgz, path };
}

async function checkCdn(url, integrity, fetch) {
  const response = await request(fetch, url, { redirect: 'manual' });
  const errors = [];
  if (response.status !== 200) errors.push('status ' + response.status);
  if (digest(Buffer.from(await response.arrayBuffer()), 'sha384') !== integrity) errors.push('SHA-384 mismatch');
  if (response.headers.get('Access-Control-Allow-Origin') !== '*') errors.push('Access-Control-Allow-Origin must be *');
  ensure(errors.length === 0, errors.join('; '));
}

export async function verifyEntry(entry, { fetch = globalThis.fetch } = {}) {
  const lines = [];
  const check = async (label, action) => {
    try {
      const detail = await action();
      lines.push('OK   ' + entry.id + ': ' + label + (detail ? ' ' + detail : ''));
      return true;
    } catch (error) {
      lines.push('FAIL ' + entry.id + ': ' + label + ': ' + error.message);
      return false;
    }
  };
  let pkg;
  if (await check('npm package', async () => { pkg = await getPackage(entry.id, fetch); })) {
    await check('file SHA-384', () => {
      ensure(digest(extractFromTgz(pkg.tgz, pkg.path), 'sha384') === entry.integrity, 'SHA-384 mismatch');
    });
    await check('license', () => {
      const manifest = JSON.parse(extractFromTgz(pkg.tgz, 'package.json').toString('utf8'));
      if (typeof manifest.license !== 'string') return '(package.json has no license field)';
      ensure(manifest.license === entry.license, 'license mismatch');
    });
  }
  for (const url of entry.urls) await check(url, () => checkCdn(url, entry.integrity, fetch));
  return { ok: lines.every(line => line.startsWith('OK   ')), lines };
}

export async function buildEntry(id, { type, urls, license }, { fetch = globalThis.fetch } = {}) {
  const pkg = await getPackage(id, fetch);
  const file = extractFromTgz(pkg.tgz, pkg.path);
  const manifest = JSON.parse(extractFromTgz(pkg.tgz, 'package.json').toString('utf8'));
  if (typeof manifest.license === 'string') {
    ensure(license === undefined || license === manifest.license, 'license differs from package.json');
    license = manifest.license;
  } else ensure(license !== undefined, 'package.json has no license field; specify --license');
  const entry = { id, type, integrity: digest(file, 'sha384'), license,
    urls: urls === undefined ? ['https://cdn.jsdelivr.net/npm/' + id] : [...urls].sort() };
  parseRegistry(JSON.stringify({ files: [entry] }));
  for (const url of entry.urls) await checkCdn(url, entry.integrity, fetch);
  const warnings = type === 'style' && /url\(|@import/i.test(file.toString('utf8'))
    ? ['Stylesheet contains url( or @import; CSP may block its resources.'] : [];
  return { entry, warnings };
}

const usage = 'Usage:\n  node scripts/cdn-registry.mjs verify [id...]\n' +
  '  node scripts/cdn-registry.mjs add <id> --type <script|style|wasm> [--url <URL>]... [--license <SPDX>]';

async function main(args) {
  const [command, ...rest] = args;
  ensure(command === 'verify' || command === 'add', usage);
  let id;
  const options = {};
  if (command === 'verify') {
    ensure(rest.every(value => !value.startsWith('-')), usage);
  } else {
    id = rest.shift();
    ensure(id && !id.startsWith('-'), usage);
    parseLibraryId(id);
    for (let i = 0; i < rest.length; i += 2) {
      const option = rest[i];
      const value = rest[i + 1];
      ensure(['--type', '--url', '--license'].includes(option) && value && !value.startsWith('-'), usage);
      const key = option.slice(2);
      if (key === 'url') (options.urls ??= []).push(value);
      else {
        ensure(options[key] === undefined, usage);
        options[key] = value;
      }
    }
    ensure(['script', 'style', 'wasm'].includes(options.type), usage);
  }
  const registryPath = new URL('./cdn-libraries.json', import.meta.url);
  const registry = parseRegistry(await readFile(registryPath, 'utf8'));
  const files = [...new Set(registry.values())];
  if (command === 'verify') {
    for (const selected of rest) ensure(files.some(entry => entry.id === selected), 'Unknown id: ' + selected);
    const entries = rest.length ? files.filter(entry => rest.includes(entry.id)) : files;
    let failures = 0;
    for (const entry of entries) {
      const result = await verifyEntry(entry);
      result.lines.forEach(line => console.log(line));
      failures += result.lines.filter(line => line.startsWith('FAIL ')).length;
    }
    console.log('Verified: ' + entries.length + ' entr' + (entries.length === 1 ? 'y' : 'ies') + ', ' + failures + ' failure(s)');
    if (failures) process.exitCode = 1;
  } else {
    ensure(!files.some(entry => entry.id === id), 'Already registered: ' + id);
    const { entry, warnings } = await buildEntry(id, options);
    warnings.forEach(warning => console.warn('WARN ' + warning));
    files.push(entry);
    files.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    const text = JSON.stringify({ files }, null, 2) + '\n';
    parseRegistry(text);
    await writeFile(registryPath, text, 'utf8');
    console.log('Added: ' + id);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch(error => {
    console.error(error.message.includes('Usage:') ? error.message : error.message + '\n' + usage);
    process.exitCode = 1;
  });
}
