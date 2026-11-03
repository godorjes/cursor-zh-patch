'use strict';

const fs = require('fs');
const path = require('path');
const { extractStrings } = require('./lib/extract');

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) out[arg.slice(2)] = argv[++i];
  }
  return out;
}

function read(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function main() {
  const args = parseArgs(process.argv);
  const repoRoot = path.resolve(__dirname, '..');
  let desktop;
  let glass;
  let nlsText;
  if (args.app) {
    desktop = read(path.join(args.app, 'out/vs/workbench/workbench.desktop.main.js'));
    glass = read(path.join(args.app, 'out/vs/workbench/workbench.glass.main.js'));
    nlsText = read(path.join(args.app, 'out/nls.messages.json'));
  } else if (args.desktop && args.glass) {
    desktop = read(args.desktop);
    glass = read(args.glass);
    nlsText = args.nls ? read(args.nls) : '[]';
  } else {
    console.error('usage: node tools/extract.js --app <resources/app> [--out i18n/pending.json] [--previous i18n/extracted.json] [--map i18n/zh-CN.json]');
    process.exit(1);
  }

  const previousPath = args.previous || path.join(repoRoot, 'i18n/extracted.json');
  const mapPath = args.map || path.join(repoRoot, 'i18n/zh-CN.json');
  const outPath = args.out || path.join(repoRoot, 'i18n/pending.json');
  const dualUsePath = args['dual-use'] || path.join(repoRoot, 'i18n/dual-use.json');

  const result = extractStrings({
    sources: [desktop, glass],
    nlsText,
    mapPath: fs.existsSync(mapPath) ? mapPath : null,
    previousPath: fs.existsSync(previousPath) ? previousPath : null,
  });

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(result.pending, null, 2) + '\n');
  fs.writeFileSync(dualUsePath, JSON.stringify(result.dualUse, null, 2) + '\n');

  const extractedPath = previousPath;
  const previous = fs.existsSync(extractedPath) ? JSON.parse(fs.readFileSync(extractedPath, 'utf8')) : {};
  const union = Object.assign({}, previous, result.all);
  fs.mkdirSync(path.dirname(extractedPath), { recursive: true });
  fs.writeFileSync(extractedPath, JSON.stringify(union, null, 2) + '\n');

  console.log(JSON.stringify(Object.assign({ out: outPath, previous: extractedPath, dualUse: dualUsePath }, result.counts)));
}

main();
