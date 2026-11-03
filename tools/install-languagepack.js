'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const { spawnSync } = require('child_process');
const { upsertLanguagePack } = require('./lib/languagepack');

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) out[arg.slice(2)] = argv[++i];
  }
  return out;
}

async function download(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`download failed ${response.status} ${url}`);
  const buf = Buffer.from(await response.arrayBuffer());
  if (buf.length >= 2 && buf[0] === 0x1f && buf[1] === 0x8b) return zlib.gunzipSync(buf);
  return buf;
}

function extractZip(zipPath, dest) {
  fs.mkdirSync(dest, { recursive: true });
  const result = spawnSync('tar', ['-xf', zipPath, '-C', dest], { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(result.stderr || 'tar could not extract the language pack');
  }
}

async function main() {
  const args = parseArgs(process.argv);
  const config = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config.json'), 'utf8'));
  const pack = config.languagePack;
  if (!args['extensions-dir'] || !args['user-data'] || !args.cursor) {
    console.error('usage: node tools/install-languagepack.js --cursor <Cursor.exe> --extensions-dir <dir> --user-data <dir> [--vsix <file>]');
    process.exit(1);
  }
  if (!fs.existsSync(args.cursor)) {
    throw new Error(`找不到 Cursor.exe：${args.cursor}`);
  }

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cursor-zh-lp-'));
  try {
    const zipPath = path.join(tmp, 'pack.vsix');
    let bytes = args.vsix ? fs.readFileSync(args.vsix) : await download(pack.vsixUrl);
    if (bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b) bytes = zlib.gunzipSync(bytes);
    fs.writeFileSync(zipPath, bytes);
    const extracted = path.join(tmp, 'extracted');
    extractZip(zipPath, extracted);
    const extensionRoot = path.join(extracted, 'extension');
    const manifestPath = path.join(extensionRoot, 'package.json');
    if (!fs.existsSync(manifestPath)) throw new Error('VSIX is missing extension/package.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const folderName = `${pack.id}-${manifest.version}`;
    const target = path.join(args['extensions-dir'], folderName);
    fs.rmSync(target, { recursive: true, force: true });
    fs.mkdirSync(args['extensions-dir'], { recursive: true });
    fs.cpSync(extensionRoot, target, { recursive: true });

    const packsPath = path.join(args['user-data'], 'languagepacks.json');
    const existing = fs.existsSync(packsPath) ? fs.readFileSync(packsPath, 'utf8') : '';
    const updated = upsertLanguagePack(existing, target, manifest);
    fs.mkdirSync(args['user-data'], { recursive: true });
    fs.writeFileSync(packsPath, updated.text);
    const installed = spawnSync(args.cursor, ['--install-extension', zipPath, '--force'], { encoding: 'utf8' });
    if (installed.status !== 0) {
      throw new Error(installed.stderr || installed.stdout || 'Cursor.exe --install-extension failed');
    }
    console.log(JSON.stringify({
      installed: target,
      version: manifest.version,
      hash: updated.pack.hash,
      languagepacks: packsPath,
      cursor: args.cursor,
    }));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
