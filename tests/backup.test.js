'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { patchApp, restoreApp } = require('../tools/lib/apply');
const { sha256Hex } = require('../tools/lib/checksum');

function writeApp(root, options) {
  const version = options.version || '3.27.22';
  const commit = options.commit || 'a'.repeat(40);
  const desktop = options.desktop || 'const row = {label:"Settings", title:"Only Glass"};\n';
  const glass = options.glass || 'const glass = {title:"New Agent"};\n';
  const nls = options.nls || '["Settings"]\n';
  fs.mkdirSync(path.join(root, 'out/vs/workbench'), { recursive: true });
  fs.mkdirSync(path.join(root, 'extensions'), { recursive: true });
  fs.writeFileSync(path.join(root, 'out/vs/workbench/workbench.desktop.main.js'), desktop);
  fs.writeFileSync(path.join(root, 'out/vs/workbench/workbench.glass.main.js'), glass);
  fs.writeFileSync(path.join(root, 'out/nls.messages.json'), nls);
  fs.writeFileSync(path.join(root, 'extensions/sample.js'), 'const leaked = "Settings";\nconst kind = { kind: "Apply" };\n');
  fs.writeFileSync(path.join(root, 'out/nls.keys.json'), '["Marketplace"]\n');
  fs.writeFileSync(path.join(root, 'product.json'), JSON.stringify({
    version,
    commit,
    checksums: {},
  }, null, 2));
}

function materialize(prefix) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const app = path.join(root, 'app');
  const backup = path.join(root, 'backup');
  const mapPath = path.join(root, 'map.json');
  const allowPath = path.join(root, 'allow.json');
  fs.writeFileSync(mapPath, JSON.stringify({
    Settings: '设置',
    'New Agent': '新建 Agent',
    'Only Glass': '仅玻璃',
  }));
  fs.writeFileSync(allowPath, JSON.stringify({
    Settings: ['display'],
    'New Agent': ['display'],
    'Only Glass': ['display'],
  }));
  writeApp(app, {});
  return { root, app, backup, mapPath, allowPath };
}

test('re-patch backs up a file the first glossary did not touch', () => {
  const { app, backup, mapPath, allowPath } = materialize('zh-grow-');
  const glassPath = path.join(app, 'out/vs/workbench/workbench.glass.main.js');
  const originalGlass = fs.readFileSync(glassPath);
  const firstMap = path.join(path.dirname(mapPath), 'map1.json');
  fs.writeFileSync(firstMap, JSON.stringify({ Settings: '设置' }));
  patchApp({ appRoot: app, backupDir: backup, mapPath: firstMap, allowlistPath: allowPath });
  assert.equal(fs.existsSync(path.join(backup, 'out/vs/workbench/workbench.glass.main.js')), false);
  assert.equal(fs.readFileSync(glassPath).equals(originalGlass), true);

  patchApp({ appRoot: app, backupDir: backup, mapPath, allowlistPath: allowPath });
  const manifest = JSON.parse(fs.readFileSync(path.join(backup, 'manifest.json'), 'utf8'));
  assert.equal(manifest.files['out/vs/workbench/workbench.glass.main.js'].sha256, sha256Hex(originalGlass));
  assert.equal(fs.readFileSync(glassPath, 'utf8').includes('新建 Agent'), true);
  restoreApp({ appRoot: app, backupDir: backup });
  assert.equal(fs.readFileSync(glassPath).equals(originalGlass), true);
  assert.equal(fs.readFileSync(path.join(app, 'out/vs/workbench/workbench.desktop.main.js'), 'utf8').includes('设置'), false);
});

test('a reused BackupDir after an upgrade does not write the old files back', () => {
  const { app, backup, mapPath, allowPath } = materialize('zh-up-');
  patchApp({ appRoot: app, backupDir: backup, mapPath, allowlistPath: allowPath });
  const oldManifest = fs.readFileSync(path.join(backup, 'manifest.json'));
  const oldDesktopBackup = fs.readFileSync(path.join(backup, 'out/vs/workbench/workbench.desktop.main.js'));

  const upgradedDesktop = 'const row = {label:"Settings"};\nconst build = "3.28";\n';
  fs.writeFileSync(path.join(app, 'out/vs/workbench/workbench.desktop.main.js'), upgradedDesktop);
  fs.writeFileSync(path.join(app, 'out/vs/workbench/workbench.glass.main.js'), 'const glass = "New Agent";\n');
  fs.writeFileSync(path.join(app, 'out/nls.messages.json'), '["Settings"]\n');
  const product = JSON.parse(fs.readFileSync(path.join(app, 'product.json'), 'utf8'));
  product.version = '3.28.0';
  product.commit = 'b'.repeat(40);
  fs.writeFileSync(path.join(app, 'product.json'), JSON.stringify(product, null, 2));

  assert.throws(() => restoreApp({ appRoot: app, backupDir: backup }), /拒绝还原/);
  const second = patchApp({ appRoot: app, backupDir: backup, mapPath, allowlistPath: allowPath });
  assert.notEqual(second.backupDir, backup);
  assert.equal(fs.readFileSync(path.join(backup, 'manifest.json')).equals(oldManifest), true);
  assert.equal(fs.readFileSync(path.join(backup, 'out/vs/workbench/workbench.desktop.main.js')).equals(oldDesktopBackup), true);
  assert.equal(fs.readFileSync(path.join(app, 'out/vs/workbench/workbench.desktop.main.js'), 'utf8').includes('设置'), true);
  assert.equal(fs.readFileSync(path.join(app, 'out/vs/workbench/workbench.desktop.main.js'), 'utf8').includes('3.28'), true);
  restoreApp({ appRoot: app, backupDir: backup });
  assert.equal(fs.readFileSync(path.join(app, 'out/vs/workbench/workbench.desktop.main.js'), 'utf8'), upgradedDesktop);
});

test('a file that matches neither hash is refused before any write', () => {
  const { app, backup, mapPath, allowPath } = materialize('zh-tamper-');
  patchApp({ appRoot: app, backupDir: backup, mapPath, allowlistPath: allowPath });
  const desktop = path.join(app, 'out/vs/workbench/workbench.desktop.main.js');
  const patched = fs.readFileSync(desktop);
  fs.writeFileSync(desktop, 'const label = "hand edited";\n');
  assert.throws(() => patchApp({ appRoot: app, backupDir: backup, mapPath, allowlistPath: allowPath }), /都不一致/);
  assert.equal(fs.readFileSync(desktop, 'utf8').includes('hand edited'), true);
  assert.throws(() => restoreApp({ appRoot: app, backupDir: backup }), /都不一致/);
  assert.equal(fs.readFileSync(desktop, 'utf8').includes('hand edited'), true);
  fs.writeFileSync(desktop, patched);
  restoreApp({ appRoot: app, backupDir: backup });
  assert.equal(fs.readFileSync(desktop, 'utf8').includes('Settings'), true);
});

test('extensions and nls.keys.json stay byte-for-byte', () => {
  const { app, backup, mapPath, allowPath } = materialize('zh-scope-');
  const extension = path.join(app, 'extensions/sample.js');
  const keys = path.join(app, 'out/nls.keys.json');
  const beforeExt = fs.readFileSync(extension);
  const beforeKeys = fs.readFileSync(keys);
  patchApp({ appRoot: app, backupDir: backup, mapPath, allowlistPath: allowPath });
  assert.equal(fs.readFileSync(extension).equals(beforeExt), true);
  assert.equal(fs.readFileSync(keys).equals(beforeKeys), true);
  assert.equal(fs.readFileSync(keys, 'utf8').includes('"Marketplace"'), true);
});

test('a second patch does not rewrite patch-report.json', () => {
  const { app, backup, mapPath, allowPath } = materialize('zh-report-');
  patchApp({ appRoot: app, backupDir: backup, mapPath, allowlistPath: allowPath });
  const reportPath = path.join(backup, 'patch-report.json');
  const first = fs.readFileSync(reportPath);
  assert.equal(first.includes(Buffer.from('backupPreserved')), false);
  patchApp({ appRoot: app, backupDir: backup, mapPath, allowlistPath: allowPath });
  assert.equal(fs.readFileSync(reportPath).equals(first), true);
});

test('missing or unreadable version exits as code 3', () => {
  const { app, backup, mapPath } = materialize('zh-ver-');
  fs.writeFileSync(path.join(app, 'product.json'), '{}\n');
  try {
    patchApp({ appRoot: app, backupDir: backup, mapPath });
    assert.fail('expected throw');
  } catch (error) {
    assert.equal(error.code, 3);
  }
  assert.equal(fs.existsSync(path.join(backup, 'manifest.json')), false);
  fs.writeFileSync(path.join(app, 'product.json'), 'not json\n');
  try {
    patchApp({ appRoot: app, backupDir: backup, mapPath });
    assert.fail('expected throw');
  } catch (error) {
    assert.equal(error.code, 3);
  }
  assert.equal(fs.existsSync(backup), false);
});

test('restore exits 3 on a BOM product.json and prints the message only', () => {
  const { app, backup, mapPath, allowPath } = materialize('zh-bom-');
  patchApp({ appRoot: app, backupDir: backup, mapPath, allowlistPath: allowPath });
  const productPath = path.join(app, 'product.json');
  const original = fs.readFileSync(productPath);
  fs.writeFileSync(productPath, Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), original]));
  const result = require('child_process').spawnSync(process.execPath, [
    path.join(__dirname, '../tools/run-restore.js'),
    '--app', app,
    '--backup', backup,
  ], { encoding: 'utf8' });
  assert.equal(result.status, 3);
  assert.match(result.stderr, /无法读取版本：product.json 无法解析。/);
  assert.equal(/\n\s+at /.test(result.stderr), false);
  assert.equal(fs.readFileSync(productPath).equals(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), original])), true);
});
