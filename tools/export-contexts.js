'use strict';

const fs = require('fs');
const path = require('path');
const { collectLiterals, classifyOccurrence, decodeLiteral } = require('./lib/literals');
const { loadMap, loadAllowlist, PATCH_FILES } = require('./lib/apply');

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) out[arg.slice(2)] = argv[++i];
  }
  return out;
}

function excerpt(source, start, end) {
  const from = Math.max(0, start - 48);
  const to = Math.min(source.length, end + 48);
  return source.slice(from, to).replace(/\n/g, '\\n');
}

function main() {
  const args = parseArgs(process.argv);
  if (!args.app || !args.map) {
    console.error('usage: node tools/export-contexts.js --app <resources/app> --map i18n/zh-CN.json [--allowlist i18n/short-allowlist.json] [--exclude i18n/exclude.json] [--out i18n/hit-contexts.json]');
    process.exit(1);
  }
  const { map } = loadMap(args.map, args.exclude);
  const allowlist = loadAllowlist(args.allowlist);
  const nlsPath = path.join(args.app, 'out/nls.messages.json');
  let nlsMessages = null;
  if (fs.existsSync(nlsPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(nlsPath, 'utf8'));
      if (Array.isArray(parsed)) nlsMessages = parsed;
    } catch {
      nlsMessages = null;
    }
  }
  const hits = [];
  for (const rel of PATCH_FILES) {
    const abs = path.join(args.app, rel);
    if (!fs.existsSync(abs)) continue;
    const source = fs.readFileSync(abs, 'utf8');
    for (const literal of collectLiterals(source)) {
      let decoded;
      try {
        decoded = decodeLiteral(source, literal);
      } catch {
        continue;
      }
      if (!Object.prototype.hasOwnProperty.call(map, decoded)) continue;
      const classified = classifyOccurrence(literal, decoded, nlsMessages, allowlist);
      hits.push({
        file: rel,
        key: decoded,
        kind: classified.kind,
        reason: classified.reason,
        excerpt: excerpt(source, literal.start, literal.end),
      });
    }
  }
  const outPath = args.out || path.join(path.dirname(args.map), 'hit-contexts.json');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(hits, null, 2) + '\n');
  const byReason = {};
  for (const hit of hits) byReason[hit.reason] = (byReason[hit.reason] || 0) + 1;
  console.log(JSON.stringify({ out: outPath, hits: hits.length, byReason }));
}

main();
