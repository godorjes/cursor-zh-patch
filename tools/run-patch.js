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
    console.error('usage: node tools/run-patch.js --app <resources/app> --backup <dir> --map <zh-CN.json> [--exclude <file>]');
    process.exit(1);
  }
  const productPath = path.join(args.app, 'product.json');
  if (!fs.existsSync(args.app) || !fs.existsSync(productPath)) {
    console.error(`安装布局无法识别，缺少 ${productPath}`);
    process.exit(1);
  }
  try {
    const report = patchApp({
      appRoot: args.app,
      backupDir: args.backup,
      mapPath: args.map,
      excludePath: args.exclude,
    });
    console.log(`匹配 ${report.matched} 条，未匹配 ${report.unmatched} 条。`);
    if (report.skippedDualUse.length) {
      console.log(`因同时作为功能 token 而跳过 ${report.skippedDualUse.length} 条。`);
    }
    console.log(`改动文件 ${report.changed.length} 个。`);
  } catch (error) {
    console.error(error.stack || error.message);
    process.exit(1);
  }
}

main();
