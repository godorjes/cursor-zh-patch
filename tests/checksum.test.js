'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { vscodeChecksum, vscodeChecksumFile, updateProductChecksums } = require('../tools/lib/checksum');

test('sha256 base64 strips trailing padding', () => {
  assert.equal(vscodeChecksum(''), '47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU');
  const padded = vscodeChecksum('a');
  assert.equal(padded.includes('='), false);
  assert.equal(padded.length >= 42, true);
});

test('checksum of a file matches the buffer checksum', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zh-sum-'));
  const file = path.join(dir, 'sample.js');
  fs.writeFileSync(file, 'const label = "Save";\n');
  assert.equal(vscodeChecksumFile(file), vscodeChecksum(fs.readFileSync(file)));
});

test('product.json checksum update only touches existing keys', () => {
  const text = `{
  "checksums": {
    "vs/workbench/workbench.desktop.main.js": "OLDVALUE",
    "vs/workbench/workbench.desktop.main.css": "KEEP"
  }
}
`;
  const result = updateProductChecksums(text, {
    'vs/workbench/workbench.desktop.main.js': 'NEW+VALUE/abc',
    'vs/workbench/workbench.glass.main.js': 'NOTLISTED',
  });
  assert.deepEqual(result.changed, ['vs/workbench/workbench.desktop.main.js']);
  assert.deepEqual(result.missing, ['vs/workbench/workbench.glass.main.js']);
  assert.match(result.text, /"vs\/workbench\/workbench.desktop.main.js": "NEW\+VALUE\/abc"/);
  assert.match(result.text, /"vs\/workbench\/workbench.desktop.main.css": "KEEP"/);
  assert.equal(result.text.includes('glass'), false);
});
