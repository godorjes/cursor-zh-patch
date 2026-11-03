'use strict';

const fs = require('fs');
const path = require('path');
const { patchApp } = require('./lib/apply');

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--force') out.force = true;
    else if (arg.startsWith('--')) out[arg.slice(2)] = argv[++i];
  }
  return out;
}

function main() {
  const args = parseArgs(process.argv);
  if (!args.app || !args.backup || !args.map) {
    console.error('usage: node tools/run-patch.js --app <resources/app> --backup <dir> --map <zh-CN.json> [--exclude <file>] [--allowlist <file>]');
    process.exit(1);
  }
  try {
    const report = patchApp({
      appRoot: args.app,
      backupDir: args.backup,
      mapPath: args.map,
      excludePath: args.exclude,
      allowlistPath: args.allowlist,
    });
    console.log(`匹配报告: 命中=${report.matched} 未命中=${report.unmatched}`);
    console.log(`跳过=${report.skipped}`);
  } catch (error) {
    console.error(error.message || String(error));
    process.exit(error.code || 1);
  }
}

main();
