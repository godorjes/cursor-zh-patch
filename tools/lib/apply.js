'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { vscodeChecksum, updateProductChecksums, sha256Hex } = require('./checksum');
const { applyStringMap } = require('./literals');
const { translationProblem, isFunctionalShape } = require('./strings');

const TEXT_EXT = new Set(['.js', '.json', '.css']);

function loadMap(mapPath, excludePath) {
  const raw = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
  const exclude = excludePath && fs.existsSync(excludePath) ? JSON.parse(fs.readFileSync(excludePath, 'utf8')) : {};
  const excluded = new Set(Array.isArray(exclude) ? exclude : exclude.exact || exclude.strings || []);
  const map = {};
  const rejected = [];
  for (const [key, value] of Object.entries(raw)) {
    if (key.startsWith('_') || typeof value !== 'string') continue;
    if (excluded.has(key) || isFunctionalShape(key)) {
      rejected.push({ key, reason: 'excluded functional token' });
      continue;
    }
    const problem = translationProblem(key, value);
    if (problem) {
      rejected.push({ key, reason: problem });
      continue;
    }
    map[key] = value;
  }
  return { map, rejected };
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function relFrom(root, filePath) {
  return path.relative(root, filePath).split(path.sep).join('/');
}

function listTextFiles(appRoot) {
  const files = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (TEXT_EXT.has(path.extname(entry.name).toLowerCase())) files.push(full);
    }
  }
  walk(appRoot);
  return files;
}

function decodeBuffer(buf) {
  let text = buf.toString('utf8');
  const hadBom = text.charCodeAt(0) === 0xfeff;
  if (hadBom) text = text.slice(1);
  return text;
}

function syntaxCheck(filePath) {
  const result = spawnSync(process.execPath, ['--check', filePath], { encoding: 'utf8' });
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || '').trim();
    throw new Error(`syntax check failed for ${filePath}\n${detail}`);
  }
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function hashFile(filePath) {
  return sha256Hex(fs.readFileSync(filePath));
}

function loadSources(appRoot, backupDir, manifest) {
  const sources = new Map();
  for (const abs of listTextFiles(appRoot)) {
    const rel = relFrom(appRoot, abs);
    let buf;
    if (manifest && manifest.files && manifest.files[rel]) {
      const backupFile = path.join(backupDir, rel);
      buf = fs.readFileSync(backupFile);
      const hash = sha256Hex(buf);
      if (manifest.files[rel].sha256 !== hash) {
        throw new Error(`backup for ${rel} does not match its manifest; refusing to continue`);
      }
    } else {
      buf = fs.readFileSync(abs);
    }
    sources.set(rel, { abs, buf, text: decodeBuffer(buf) });
  }
  return sources;
}

function applyToSources(sources, map, nlsMessages) {
  const productRel = 'product.json';
  let active = map;
  const run = (dict) => {
    const out = new Map();
    const skipped = [];
    for (const [rel, source] of sources) {
      if (rel === productRel) {
        out.set(rel, { text: source.text, stats: { replaced: 0, keysApplied: [], commandTitlesRewritten: 0, nlsOriginalKept: 0, originalFieldKept: 0 }, skipped: [] });
        continue;
      }
      try {
        const result = applyStringMap(source.text, dict, { nlsMessages });
        out.set(rel, { text: result.code, stats: result.stats, skipped: result.skipped });
        skipped.push(...result.skipped);
      } catch (error) {
        out.set(rel, {
          text: source.text,
          stats: { replaced: 0, keysApplied: [], commandTitlesRewritten: 0, nlsOriginalKept: 0, originalFieldKept: 0 },
          skipped: [],
          error: error.message,
        });
      }
    }
    return { out, skipped };
  };

  let pass = run(active);
  const dualUse = new Map();
  for (const item of pass.skipped) dualUse.set(item.key, item.reason);
  if (dualUse.size) {
    active = {};
    for (const [key, value] of Object.entries(map)) {
      if (!dualUse.has(key)) active[key] = value;
    }
    pass = run(active);
  }
  return { pass: pass.out, dualUse, activeMap: active };
}

/**
 * Patch resources/app in place.
 * Files with no replacements keep their original bytes.
 * A backup is written only after the result is known to be syntactically valid,
 * and an existing clean backup is never overwritten.
 */
function patchApp(options) {
  const appRoot = options.appRoot;
  const backupDir = options.backupDir;
  const { map, rejected } = loadMap(options.mapPath, options.excludePath);
  const manifestPath = path.join(backupDir, 'manifest.json');
  const hadBackup = fs.existsSync(manifestPath);
  const manifest = hadBackup ? readJson(manifestPath) : null;

  const sources = loadSources(appRoot, backupDir, manifest);
  const nlsRel = 'out/nls.messages.json';
  let nlsMessages = null;
  if (sources.has(nlsRel)) {
    try {
      const parsed = JSON.parse(sources.get(nlsRel).text);
      if (Array.isArray(parsed)) nlsMessages = parsed;
    } catch {
      nlsMessages = null;
    }
  }

  const { pass, dualUse, activeMap } = applyToSources(sources, map, nlsMessages);
  const nextText = new Map();
  const appliedKeys = new Set();
  for (const [rel, result] of pass) {
    nextText.set(rel, result.text);
    for (const key of result.stats.keysApplied || []) appliedKeys.add(key);
  }

  const productRel = 'product.json';
  const changed = [];
  for (const [rel, text] of nextText) {
    if (rel === productRel) continue;
    if (text !== sources.get(rel).text) changed.push(rel);
  }

  let checksumResult = { text: sources.has(productRel) ? sources.get(productRel).text : '', changed: [], missing: [] };
  if (sources.has(productRel)) {
    const updates = {};
    for (const rel of changed) {
      if (!rel.startsWith('out/')) continue;
      const key = rel.slice('out/'.length);
      updates[key] = vscodeChecksum(Buffer.from(nextText.get(rel), 'utf8'));
    }
    checksumResult = updateProductChecksums(sources.get(productRel).text, updates);
    if (checksumResult.text !== sources.get(productRel).text) {
      nextText.set(productRel, checksumResult.text);
      changed.push(productRel);
    }
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cursor-zh-patch-'));
  try {
    for (const rel of changed) {
      if (!rel.endsWith('.js')) continue;
      const tmp = path.join(tmpDir, rel.replace(/[\\/]/g, '__'));
      fs.writeFileSync(tmp, nextText.get(rel));
      syntaxCheck(tmp);
    }
    if (nextText.has(nlsRel) && changed.includes(nlsRel)) {
      JSON.parse(nextText.get(nlsRel));
    }
  } catch (error) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    throw error;
  }
  fs.rmSync(tmpDir, { recursive: true, force: true });

  if (!hadBackup && changed.length) {
    const files = {};
    for (const rel of changed) {
      const dest = path.join(backupDir, rel);
      ensureDir(path.dirname(dest));
      fs.writeFileSync(dest, sources.get(rel).buf);
      files[rel] = { sha256: hashFile(dest) };
    }
    let version = null;
    try {
      version = JSON.parse(sources.get(productRel).text).version;
    } catch {
      version = null;
    }
    fs.writeFileSync(manifestPath, JSON.stringify({
      version,
      createdAt: new Date().toISOString(),
      files,
    }, null, 2));
  }

  for (const rel of changed) {
    fs.writeFileSync(sources.get(rel).abs, Buffer.from(nextText.get(rel), 'utf8'));
  }

  const matched = [];
  const unmatched = [];
  for (const key of Object.keys(activeMap)) {
    if (appliedKeys.has(key)) matched.push(key);
    else unmatched.push(key);
  }

  const report = {
    matched: matched.length,
    unmatched: unmatched.length,
    matchedKeys: matched,
    unmatchedKeys: unmatched,
    rejected,
    skippedDualUse: [...dualUse.entries()].map(([key, reason]) => ({ key, reason })),
    changed,
    checksumsChanged: checksumResult.changed,
    checksumsNotListed: checksumResult.missing.filter((key) => changed.some((rel) => rel === `out/${key}`)),
    backupPreserved: hadBackup,
  };
  if (changed.length || hadBackup) {
    ensureDir(backupDir);
    fs.writeFileSync(path.join(backupDir, 'patch-report.json'), JSON.stringify(report, null, 2));
  }
  return report;
}

function restoreApp(options) {
  const manifestPath = path.join(options.backupDir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`找不到备份：${manifestPath}`);
  }
  const manifest = readJson(manifestPath);
  for (const rel of Object.keys(manifest.files || {})) {
    const backupFile = path.join(options.backupDir, rel);
    const hash = hashFile(backupFile);
    if (manifest.files[rel].sha256 !== hash) {
      throw new Error(`backup for ${rel} failed hash check during restore`);
    }
    const dest = path.join(options.appRoot, rel);
    ensureDir(path.dirname(dest));
    fs.copyFileSync(backupFile, dest);
  }
}

module.exports = {
  loadMap,
  patchApp,
  restoreApp,
  syntaxCheck,
  listTextFiles,
};
