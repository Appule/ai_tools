import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyCsp, checkFiles, checkHtml, checkMeta, decodeUtf8, finding, parseRegistry, TransformError } from './lib/opat-core.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const apps = join(root, 'apps');
const displayPath = path => relative(root, path).split(sep).join('/');
const onActions = process.env.GITHUB_ACTIONS === 'true';
const escapeData = value => value.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A');
const escapeProperty = value => escapeData(value).replaceAll(':', '%3A').replaceAll(',', '%2C');
const summary = (errors, warnings) => errors + ' error(s), ' + warnings + ' warning(s)';

async function checkApp(folder, flags, rewritten, registry) {
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
      if (flags.has('--apply-csp')) html = applyCsp(html, { registry });
      if (html !== original) {
        await writeFile(path, html, 'utf8');
        rewritten.push(displayPath(path));
      }
    } catch (error) {
      if (!(error instanceof TransformError)) throw error;
      report(path, error.finding);
      html = original;
    }
    for (const result of checkHtml(html, { registry })) report(path, result);
  }
  console.log(displayPath(folder) + ': ' + summary(errors, warnings));
  return { errors, warnings };
}

async function main() {
  const registry = parseRegistry(await readFile(join(root, 'scripts/cdn-libraries.json'), 'utf8'));
  const flags = new Set();
  const folders = [];
  const available = new Set((await readdir(apps, { withFileTypes: true }))
    .filter(entry => entry.isDirectory()).map(entry => entry.name));
  for (const arg of process.argv.slice(2)) {
    if (arg === '--apply-csp') flags.add(arg);
    else if (arg.startsWith('-')) throw new Error('Unknown option: ' + arg);
    else {
      const folder = resolve(arg);
      const name = relative(apps, folder);
      if (isAbsolute(name) || !available.has(name)) throw new Error('Not an app folder: ' + arg);
      folders.push(name);
    }
  }
  const rewritten = [];
  let errors = 0;
  let warnings = 0;
  for (const name of new Set(folders.length ? folders : [...available].sort())) {
    const counts = await checkApp(join(apps, name), flags, rewritten, registry);
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
