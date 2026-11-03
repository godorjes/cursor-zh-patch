'use strict';

const crypto = require('crypto');
const fs = require('fs');

/**
 * VS Code / Cursor product.json checksum:
 * SHA-256 digest, standard base64, trailing '=' stripped.
 * Verified against Cursor 3.27.22 resources/app/product.json.
 */
function vscodeChecksum(contents) {
  const buf = Buffer.isBuffer(contents) ? contents : Buffer.from(contents);
  return crypto.createHash('sha256').update(buf).digest('base64').replace(/=+$/, '');
}

function vscodeChecksumFile(filePath) {
  return vscodeChecksum(fs.readFileSync(filePath));
}

/**
 * Update existing checksum entries in product.json text.
 * Keys are paths relative to resources/app/out (for example
 * "vs/workbench/workbench.desktop.main.js").
 * Entries that are not already present are left absent: the integrity
 * checker only walks Object.keys(checksums).
 */
function updateProductChecksums(productText, updates) {
  let text = productText;
  const changed = [];
  const missing = [];
  for (const [key, checksum] of Object.entries(updates)) {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`("${escaped}"\\s*:\\s*")([^"]*)(")`);
    if (!re.test(text)) {
      missing.push(key);
      continue;
    }
    const next = text.replace(re, `$1${checksum}$3`);
    if (next !== text) changed.push(key);
    text = next;
  }
  return { text, changed, missing };
}

function sha256Hex(contents) {
  const buf = Buffer.isBuffer(contents) ? contents : Buffer.from(contents);
  return crypto.createHash('sha256').update(buf).digest('hex');
}

module.exports = {
  vscodeChecksum,
  vscodeChecksumFile,
  updateProductChecksums,
  sha256Hex,
};
