'use strict';

const fs = require('fs');
const path = require('path');
const { writeLocale, readLocaleFile } = require('./lib/locale');

function parseArgs(argv) {
  const out = { locale: 'zh-cn' };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) out[arg.slice(2)] = argv[++i];
  }
  return out;
}

function main() {
  const args = parseArgs(process.argv);
  if (!args.file) {
    console.error('usage: node tools/set-locale.js --file <argv.json> [--locale zh-cn] [--backup <dest>]');
    process.exit(1);
  }
  if (args.backup && !fs.existsSync(args.backup)) {
    const previous = readLocaleFile(args.file);
    const meta = {
      existed: previous !== null,
      path: path.resolve(args.file),
    };
    fs.mkdirSync(path.dirname(args.backup), { recursive: true });
    if (previous !== null) fs.writeFileSync(args.backup, previous);
    fs.writeFileSync(args.backup + '.meta.json', JSON.stringify(meta, null, 2));
  }
  const result = writeLocale(args.file, args.locale || 'zh-cn');
  console.log(JSON.stringify({ file: args.file, locale: args.locale || 'zh-cn', created: result.created }));
}

if (require.main === module) main();

module.exports = { main };
