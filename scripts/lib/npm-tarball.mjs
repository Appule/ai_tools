import { gunzipSync } from 'node:zlib';

export function extractFromTgz(tgzBytes, path) {
  const tar = gunzipSync(tgzBytes);
  const seen = new Set();
  let result;
  const fail = message => { throw new Error('Invalid tar: ' + message); };
  const octal = (bytes, field) => {
    const text = bytes.toString('ascii').replace(/[\0 ]+$/, '');
    if (!/^[0-7]+$/.test(text)) fail('invalid ' + field);
    const value = Number.parseInt(text, 8);
    if (!Number.isSafeInteger(value)) fail(field + ' is too large');
    return value;
  };
  const text = bytes => bytes.subarray(0, bytes.indexOf(0) < 0 ? bytes.length : bytes.indexOf(0)).toString('utf8');
  for (let offset = 0; offset < tar.length;) {
    if (offset + 512 > tar.length) fail('truncated header');
    const header = tar.subarray(offset, offset + 512);
    if (header.every(byte => byte === 0)) break;
    let sum = 0;
    for (let i = 0; i < 512; i++) sum += i >= 148 && i < 156 ? 0x20 : header[i];
    if (sum !== octal(header.subarray(148, 156), 'checksum')) fail('checksum mismatch');
    if (!header.subarray(257, 265).equals(Buffer.from('ustar\0' + '00'))) fail('unsupported format');
    const type = header[156];
    if (![0, 48, 53].includes(type)) fail('unsupported entry type');
    const size = octal(header.subarray(124, 136), 'size');
    const start = offset + 512;
    if (size > tar.length - start) fail('truncated data');
    const prefix = text(header.subarray(345, 500));
    const name = (prefix ? prefix + '/' : '') + text(header.subarray(0, 100));
    const slash = name.indexOf('/');
    if (slash < 0) fail('path has no top-level directory');
    const relative = name.slice(slash + 1);
    if (type !== 53) {
      if (seen.has(relative)) fail('duplicate path: ' + relative);
      seen.add(relative);
      if (relative === path) result = Buffer.from(tar.subarray(start, start + size));
    }
    offset = start + Math.ceil(size / 512) * 512;
    if (offset > tar.length) fail('truncated padding');
  }
  if (result === undefined) fail('file not found: ' + path);
  return result;
}
