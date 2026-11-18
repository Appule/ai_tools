import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { decodeUtf8, unsafeVendorText } from '../lib/opat-core.mjs';

const root = new URL('../../vendor/', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('manifest.json', root), 'utf8'));

for (const entry of manifest.files) {
  test(entry.id + ' has the expected bytes and can be embedded', async () => {
    const bytes = await readFile(new URL(entry.id, root));
    assert.equal('sha384-' + createHash('sha384').update(bytes).digest('base64'), entry.integrity);
    if (entry.kind === 'text') {
      const match = unsafeVendorText(entry.element, decodeUtf8(bytes));
      assert.ok(!match, match && 'Unsafe HTML marker ' + match[0] + ' at offset ' + match.index);
    }
    if (entry.notice) {
      const notice = decodeUtf8(await readFile(new URL(entry.notice, root)));
      assert.ok(notice.trim());
      assert.ok(!notice.includes('-->'));
    }
  });
}

test('vendor IDs and source URLs are unique', () => {
  for (const values of [manifest.files.map(entry => entry.id), manifest.files.flatMap(entry => entry.urls)]) {
    assert.equal(new Set(values).size, values.length);
  }
});
