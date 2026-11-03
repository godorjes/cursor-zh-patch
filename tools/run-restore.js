'use strict';

const fs = require('fs');
const path = require('path');
const { restoreApp } = require('./lib/apply');

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) out[arg.slice(2)] = argv[++i];
  }
  return out;
}

function main() {
  const args = parseArgs(process.argv);
  if (!args.app || !args.backup) {
    console.error('usage: node tools/run-restore.js --app <resources/app> --backup <dir>');
    process.exit(1);
  }
  if (!fs.existsSync(path.join(args.backup, 'manifest.json'))) {
    console.error(`找不到备份：${path.join(args.backup, 'manifest.json')}`);
    process.exit(1);
  }
  try {
    restoreApp({ appRoot: args.app, backupDir: args.backup });
    console.log('已从备份还原。');
  } catch (error) {
    console.error(error.message || String(error));
    process.exit(error.code || 1);
  }
}

main();
