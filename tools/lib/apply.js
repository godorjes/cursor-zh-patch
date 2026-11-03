'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { vscodeChecksum, updateProductChecksums, sha256Hex } = require('./checksum');
const { applyStringMap } = require('./literals');
const { translationProblem, isFunctionalShape } = require('./strings');

const PATCH_FILES = [
  'out/vs/workbench/workbench.desktop.main.js',
  'out/vs/workbench/workbench.glass.main.js',
  'out/nls.messages.json',
];

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

function loadAllowlist(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return {};
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const allow = {};
  for (const [key, value] of Object.entries(raw)) {
    if (key.startsWith('_')) continue;
    if (Array.isArray(value)) allow[key] = value;
  }
  return allow;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function decodeBuffer(buf) {
  let text = buf.toString('utf8');
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
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

function readProductIdentity(appRoot) {
  const productPath = path.join(appRoot, 'product.json');
  let product;
  try {
    product = JSON.parse(fs.readFileSync(productPath, 'utf8'));
  } catch (error) {
    const wrapped = new Error('无法读取版本：product.json 无法解析。');
    wrapped.code = 3;
    throw wrapped;
  }
  if (!product || typeof product.version !== 'string' || product.version.length === 0) {
    const wrapped = new Error('无法读取版本：product.json 缺少 version 字段。');
    wrapped.code = 3;
    throw wrapped;
  }
  return {
    version: product.version,
    commit: typeof product.commit === 'string' ? product.commit : '',
    text: fs.readFileSync(productPath, 'utf8'),
    buf: fs.readFileSync(productPath),
    productPath,
  };
}

function buildId(version, commit) {
  return `${version}__${commit || 'nocommit'}`.replace(/[^A-Za-z0-9._-]+/g, '_');
}

function readManifest(dir) {
  const manifestPath = path.join(dir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) return null;
  return readJson(manifestPath);
}

function sameIdentity(manifest, version, commit) {
  return !!manifest && manifest.version === version && (manifest.commit || '') === (commit || '');
}

function resolveBackupDir(requested, version, commit) {
  const rootManifest = readManifest(requested);
  if (!rootManifest || sameIdentity(rootManifest, version, commit)) {
    return { dir: requested, manifest: rootManifest && sameIdentity(rootManifest, version, commit) ? rootManifest : (rootManifest ? null : null) };
  }
  if (rootManifest && !sameIdentity(rootManifest, version, commit)) {
    const nested = path.join(requested, 'by-build', buildId(version, commit));
    return { dir: nested, manifest: readManifest(nested) };
  }
  return { dir: requested, manifest: null };
}

function locateRestoreDir(requested, version, commit) {
  const rootManifest = readManifest(requested);
  if (sameIdentity(rootManifest, version, commit)) return { dir: requested, manifest: rootManifest };
  const nested = path.join(requested, 'by-build', buildId(version, commit));
  const nestedManifest = readManifest(nested);
  if (sameIdentity(nestedManifest, version, commit)) return { dir: nested, manifest: nestedManifest };
  const found = rootManifest ? `${rootManifest.version} ${rootManifest.commit || ''}`.trim() : '无';
  throw new Error(`备份版本与当前安装不一致（备份 ${found}，当前 ${version} ${commit}）。已拒绝还原。`);
}

function hashBuf(buf) {
  return sha256Hex(buf);
}

function loadTracked(rel, abs, manifest, backupDir) {
  if (!fs.existsSync(abs)) return null;
  const current = fs.readFileSync(abs);
  const currentHash = hashBuf(current);
  const entry = manifest && manifest.files ? manifest.files[rel] : null;
  if (!entry) {
    return { abs, rel, buf: current, text: decodeBuffer(current), currentHash, entry: null };
  }
  const backupPath = path.join(backupDir, rel);
  if (!fs.existsSync(backupPath)) {
    throw new Error(`备份缺少 ${rel}，已拒绝继续。`);
  }
  const backupBuf = fs.readFileSync(backupPath);
  if (hashBuf(backupBuf) !== entry.sha256) {
    throw new Error(`备份校验失败：${rel}`);
  }
  if (currentHash === entry.sha256) {
    return { abs, rel, buf: current, text: decodeBuffer(current), currentHash, entry };
  }
  if (entry.patchedSha256 && currentHash === entry.patchedSha256) {
    return { abs, rel, buf: backupBuf, text: decodeBuffer(backupBuf), currentHash, entry };
  }
  throw new Error(`文件 ${rel} 与备份中的原始哈希和上次补丁哈希都不一致，已拒绝继续。`);
}

function patchApp(options) {
  const appRoot = options.appRoot;
  const identity = readProductIdentity(appRoot);
  const located = resolveBackupDir(options.backupDir, identity.version, identity.commit);
  const backupDir = located.dir;
  const manifest = located.manifest;
  const { map, rejected } = loadMap(options.mapPath, options.excludePath);
  const allowlist = loadAllowlist(options.allowlistPath);

  const sources = new Map();
  for (const rel of PATCH_FILES) {
    const loaded = loadTracked(rel, path.join(appRoot, rel), manifest, backupDir);
    if (loaded) sources.set(rel, loaded);
  }
  const productRel = 'product.json';
  sources.set(productRel, loadTracked(productRel, identity.productPath, manifest, backupDir));

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

  const nextText = new Map();
  const perFile = new Map();
  const keysSeen = new Set();
  let replacedLiterals = 0;
  let nlsKept = 0;
  let skippedOccurrences = 0;
  const skippedKeys = new Map();

  for (const [rel, source] of sources) {
    if (rel === productRel) {
      nextText.set(rel, source.text);
      continue;
    }
    const result = applyStringMap(source.text, map, { nlsMessages, allowlist });
    nextText.set(rel, result.code);
    perFile.set(rel, result);
    replacedLiterals += result.stats.replaced;
    nlsKept += result.stats.nlsOriginalKept + result.stats.originalFieldKept;
    skippedOccurrences += result.stats.skippedOccurrences;
    for (const key of result.stats.keysSeen) keysSeen.add(key);
    for (const item of result.skipped) {
      if (!skippedKeys.has(item.key)) skippedKeys.set(item.key, item.reason);
    }
  }

  const changed = [];
  for (const rel of PATCH_FILES) {
    if (!sources.has(rel)) continue;
    if (nextText.get(rel) !== sources.get(rel).text) changed.push(rel);
  }

  let checksumResult = { text: sources.get(productRel).text, changed: [], missing: [] };
  const updates = {};
  for (const rel of changed) {
    const key = rel.slice('out/'.length);
    updates[key] = vscodeChecksum(Buffer.from(nextText.get(rel), 'utf8'));
  }
  checksumResult = updateProductChecksums(sources.get(productRel).text, updates);
  if (checksumResult.text !== sources.get(productRel).text) {
    nextText.set(productRel, checksumResult.text);
    changed.push(productRel);
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cursor-zh-patch-'));
  try {
    for (const rel of changed) {
      if (!rel.endsWith('.js')) continue;
      const tmp = path.join(tmpDir, rel.replace(/[\\/]/g, '__'));
      fs.writeFileSync(tmp, nextText.get(rel));
      syntaxCheck(tmp);
    }
    if (changed.includes(nlsRel)) JSON.parse(nextText.get(nlsRel));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  const files = Object.assign({}, (manifest && manifest.files) || {});
  if (changed.length) ensureDir(backupDir);
  for (const rel of changed) {
    if (!files[rel]) {
      const dest = path.join(backupDir, rel);
      ensureDir(path.dirname(dest));
      fs.writeFileSync(dest, sources.get(rel).buf);
      files[rel] = { sha256: hashBuf(sources.get(rel).buf) };
    }
  }

  for (const rel of changed) {
    const body = Buffer.from(nextText.get(rel), 'utf8');
    fs.writeFileSync(sources.get(rel).abs, body);
    files[rel].patchedSha256 = hashBuf(body);
  }

  if (changed.length || manifest) {
    ensureDir(backupDir);
    fs.writeFileSync(path.join(backupDir, 'manifest.json'), JSON.stringify({
      version: identity.version,
      commit: identity.commit,
      createdAt: (manifest && manifest.createdAt) || new Date().toISOString(),
      files,
    }, null, 2));
  }

  const unmatched = [];
  for (const key of Object.keys(map)) {
    if (!keysSeen.has(key)) unmatched.push(key);
  }

  const report = {
    matched: replacedLiterals + nlsKept,
    unmatched: unmatched.length,
    skipped: skippedOccurrences,
    replacedLiterals,
    nlsKept,
    unmatchedKeys: unmatched,
    rejected,
    skippedDualUse: [...skippedKeys.entries()].map(([key, reason]) => ({ key, reason })),
    changed,
    checksumsChanged: checksumResult.changed,
    checksumsNotListed: checksumResult.missing.filter((key) => changed.some((rel) => rel === `out/${key}`)),
    backupPreserved: !!(manifest && manifest.files && Object.keys(manifest.files).length),
    backupDir,
    version: identity.version,
    commit: identity.commit,
  };
  if (changed.length || manifest) {
    const diskReport = Object.assign({}, report);
    delete diskReport.backupPreserved;
    const reportPath = path.join(backupDir, 'patch-report.json');
    const body = JSON.stringify(diskReport, null, 2);
    if (!fs.existsSync(reportPath) || fs.readFileSync(reportPath, 'utf8') !== body) {
      fs.writeFileSync(reportPath, body);
    }
  }
  return report;
}

function restoreApp(options) {
  const identity = readProductIdentity(options.appRoot);
  const located = locateRestoreDir(options.backupDir, identity.version, identity.commit);
  const manifest = located.manifest;
  const planned = [];
  for (const rel of Object.keys(manifest.files || {})) {
    const backupFile = path.join(located.dir, rel);
    const backupBuf = fs.readFileSync(backupFile);
    if (hashBuf(backupBuf) !== manifest.files[rel].sha256) {
      throw new Error(`备份校验失败：${rel}`);
    }
    const dest = path.join(options.appRoot, rel);
    if (!fs.existsSync(dest)) {
      throw new Error(`安装目录缺少 ${rel}，已拒绝还原。`);
    }
    const currentHash = hashBuf(fs.readFileSync(dest));
    const entry = manifest.files[rel];
    if (currentHash !== entry.sha256 && currentHash !== entry.patchedSha256) {
      throw new Error(`文件 ${rel} 与备份中的原始哈希和上次补丁哈希都不一致，已拒绝还原。`);
    }
    planned.push({ dest, backupBuf });
  }
  for (const item of planned) fs.writeFileSync(item.dest, item.backupBuf);
  return { backupDir: located.dir, version: identity.version, commit: identity.commit };
}

module.exports = {
  PATCH_FILES,
  loadMap,
  loadAllowlist,
  patchApp,
  restoreApp,
  syntaxCheck,
  resolveBackupDir,
};
