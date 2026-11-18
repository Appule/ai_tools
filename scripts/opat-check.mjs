import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyCsp, checkFiles, checkHtml, checkMeta, decodeUtf8, finding, inlineVendor, TransformError } from './lib/opat-core.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const apps = join(root, 'apps');
const vendorDir = join(root, 'vendor');
const displayPath = path => relative(root, path).split(sep).join('/');
const onActions = process.env.GITHUB_ACTIONS === 'true';
const escapeData = value => value.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A');
const escapeProperty = value => escapeData(value).replaceAll(':', '%3A').replaceAll(',', '%2C');
const summary = (errors, warnings) => errors + ' error(s), ' + warnings + ' warning(s)';

async function loadVendor() {
  const manifest = JSON.parse(await readFile(join(vendorDir, 'manifest.json'), 'utf8'));
  const vendor = new Map();
  const urls = new Set();
  for (const entry of manifest.files) {
    if (!/^[\w.@-]+\/[\w.-]+$/.test(entry.id) ||
        (entry.notice && !/^[\w.@-]+\/[\w.-]+$/.test(entry.notice))) {
      throw new Error('Invalid vendor path: ' + entry.id);
    }
    if (vendor.has(entry.id) || entry.urls.some(url => urls.has(url))) {
      throw new Error('Duplicate vendor ID or URL: ' + entry.id);
    }
    const bytes = await readFile(join(vendorDir, entry.id));
    if ('sha384-' + createHash('sha384').update(bytes).digest('base64') !== entry.integrity) {
      throw new Error('Vendor integrity mismatch: ' + entry.id);
    }
    const noticeText = entry.notice ? decodeUtf8(await readFile(join(vendorDir, entry.notice))) : '';
    if (noticeText.includes('-->')) throw new Error('Invalid vendor notice: ' + entry.notice);
    vendor.set(entry.id, { ...entry, noticeText, content: entry.kind === 'text' ? decodeUtf8(bytes) : bytes });
    for (const url of entry.urls) urls.add(url);
  }
  return vendor;
}

async function checkApp(folder, vendor, flags, rewritten) {
  let errors = 0;
  let warnings = 0;
  function report(path, result) {
    const file = displayPath(path);
    const { line, severity, ruleId, message } = result;
    if (severity === 'error') errors++;
    else warnings++;
    const oneLine = value => value.replace(/[\r\n]+/g, ' ');
    console.log(file + ':' + line + '  ' + severity + '  [' + ruleId + ']  ' +
      oneLine(message.ja) + ' / ' + oneLine(message.en));
    if (onActions) {
      console.log('::' + severity + ' file=' + escapeProperty(file) + ',line=' + line +
        ',title=' + ruleId + '::' + escapeData(message.en));
    }
  }

  const children = await readdir(folder, { withFileTypes: true });
  const entries = await Promise.all(children.map(async child => ({
    path: child.name, directory: child.isDirectory(), special: !child.isFile() && !child.isDirectory(),
    size: child.isFile() ? (await stat(join(folder, child.name))).size : 0,
  })));
  const folderName = basename(folder);
  const fileNames = children.filter(child => child.isFile()).map(child => child.name);
  for (const result of checkFiles(entries, { folderName })) report(join(folder, result.path), result);

  for (const name of fileNames) {
    const path = join(folder, name);
    if (name !== 'meta.json' && !/\.html$/i.test(name)) continue;
    const bytes = await readFile(path);
    let original;
    try {
      original = decodeUtf8(bytes);
    } catch {
      report(path, finding('not-utf8'));
      continue;
    }
    if (name === 'meta.json') {
      for (const result of checkMeta(original, { folderName, fileNames })) report(path, result);
      continue;
    }
    let html = original;
    try {
      if (flags.has('--inline-vendor')) html = inlineVendor(html, { vendor });
      if (flags.has('--apply-csp')) html = applyCsp(html);
      if (html !== original) {
        await writeFile(path, html, 'utf8');
        rewritten.push(displayPath(path));
      }
    } catch (error) {
      if (!(error instanceof TransformError)) throw error;
      report(path, error.finding);
      html = original;
    }
    for (const result of checkHtml(html, { vendor })) report(path, result);
  }
  console.log(displayPath(folder) + ': ' + summary(errors, warnings));
  return { errors, warnings };
}

async function main() {
  const flags = new Set();
  const folders = [];
  const available = new Set((await readdir(apps, { withFileTypes: true }))
    .filter(entry => entry.isDirectory()).map(entry => entry.name));
  for (const arg of process.argv.slice(2)) {
    if (arg === '--inline-vendor' || arg === '--apply-csp') flags.add(arg);
    else if (arg.startsWith('-')) throw new Error('Unknown option: ' + arg);
    else {
      const folder = resolve(arg);
      const name = relative(apps, folder);
      if (isAbsolute(name) || !available.has(name)) throw new Error('Not an app folder: ' + arg);
      folders.push(name);
    }
  }
  const vendor = await loadVendor();
  const rewritten = [];
  let errors = 0;
  let warnings = 0;
  for (const name of new Set(folders.length ? folders : [...available].sort())) {
    const counts = await checkApp(join(apps, name), vendor, flags, rewritten);
    errors += counts.errors;
    warnings += counts.warnings;
  }
  if (rewritten.length) console.log('Rewritten files:\n' + rewritten.join('\n'));
  console.log('Total: ' + summary(errors, warnings));
  if (errors) process.exitCode = 1;
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
