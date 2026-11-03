'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { patchApp, restoreApp, loadMap } = require('../tools/lib/apply');
const { vscodeChecksumFile, sha256Hex } = require('../tools/lib/checksum');

const DESKTOP = `
function De(index, message) { return { value: message, original: message }; }
const open = De(0, "Open Cursor Settings");
const command = { id: "cursor.sample", title: "Register Close Tooltip", category: "Tooltip", f1: true };
const label = "Save";
const longer = "Accept All";
function getData(name) { return name; }
getData("Terminals");
const menuLabel = "Terminals";
const keep = \`Keep\`;
const greeting = \`Hello \${1}\`;
const pattern = /{"Save"}/g;
const quoted = "Say \\"hi\\"";
const fileMenu = "&&File";
const untouched = "Not Save";
`;

const GLASS = `
function It(index, message) { return { value: message, original: message }; }
const open = It(0, "Open Cursor Settings");
const label = "Save";
`;

const NLS = [
  'Open Cursor Settings',
  '&&File',
  'Exported {0} notepad(s) to {1}',
  'Save',
];

function writeFixture(root) {
  const desktopPath = path.join(root, 'out/vs/workbench/workbench.desktop.main.js');
  const glassPath = path.join(root, 'out/vs/workbench/workbench.glass.main.js');
  const nlsPath = path.join(root, 'out/nls.messages.json');
  fs.mkdirSync(path.dirname(desktopPath), { recursive: true });
  fs.writeFileSync(desktopPath, DESKTOP);
  fs.writeFileSync(glassPath, GLASS);
  fs.writeFileSync(nlsPath, JSON.stringify(NLS, null, 2));
  const product = {
    nameShort: 'Cursor',
    version: '3.27.22',
    vscodeVersion: '1.128.0',
    checksums: {
      'vs/workbench/workbench.desktop.main.js': vscodeChecksumFile(desktopPath),
      'vs/workbench/workbench.desktop.main.css': 'UNTOUCHED',
    },
  };
  fs.writeFileSync(path.join(root, 'product.json'), JSON.stringify(product, null, 2) + '\n');
}

test('loadMap drops glossary violations and functional tokens', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zh-map-'));
  const mapPath = path.join(dir, 'map.json');
  const excludePath = path.join(dir, 'exclude.json');
  fs.writeFileSync(mapPath, JSON.stringify({
    Agent: '智能体',
    'Agent panel': '代理面板',
    'Bad {0}': '坏了',
    '&&File': '文件',
    '@Web': '网页',
    Save: '保存',
    '&&View': '查看(&&V)',
  }));
  fs.writeFileSync(excludePath, JSON.stringify({ exact: ['Save'] }));
  const loaded = loadMap(mapPath, excludePath);
  assert.deepEqual(loaded.map, { '&&View': '查看(&&V)' });
  const reasons = Object.fromEntries(loaded.rejected.map((item) => [item.key, item.reason]));
  assert.equal(reasons.Agent, 'contains 智能体');
  assert.equal(reasons['Agent panel'], 'Agent translated as 代理');
  assert.equal(reasons['Bad {0}'], 'placeholder mismatch');
  assert.equal(reasons['&&File'], 'missing && mnemonic');
  assert.equal(reasons['@Web'], 'excluded functional token');
  assert.equal(reasons.Save, 'excluded functional token');
});

test('patch is idempotent, syntax-clean, and restores the clean backup', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zh-app-'));
  const app = path.join(root, 'app');
  const backup = path.join(root, 'backup');
  const mapPath = path.join(root, 'zh-CN.json');
  fs.writeFileSync(mapPath, JSON.stringify({
    'Open Cursor Settings': '打开 Cursor 设置',
    'Register Close Tooltip': '注册关闭提示',
    Save: '保存',
    'Accept All': '全部接受',
    Terminals: '终端',
    Keep: '保留',
    'Say "hi"': '说"嗨"',
    '&&File': '文件(&&F)',
    'Exported {0} notepad(s) to {1}': '已将 {0} 个记事本导出到 {1}',
  }));
  writeFixture(app);
  const desktopPath = path.join(app, 'out/vs/workbench/workbench.desktop.main.js');
  const originalDesktop = fs.readFileSync(desktopPath);

  const first = patchApp({ appRoot: app, backupDir: backup, mapPath });
  const patchedDesktop = fs.readFileSync(desktopPath);
  const backupDesktopHash = sha256Hex(fs.readFileSync(path.join(backup, 'out/vs/workbench/workbench.desktop.main.js')));
  assert.equal(backupDesktopHash, sha256Hex(originalDesktop));
  assert.equal(first.backupPreserved, false);
  assert.equal(patchedDesktop.includes('De(0, "Open Cursor Settings")'), true);
  assert.equal(patchedDesktop.includes('const label = "保存"'), true);
  assert.equal(patchedDesktop.includes('全部接受'), true);
  assert.equal(patchedDesktop.includes('"终端"'), false);
  assert.equal(patchedDesktop.includes('getData("Terminals")'), true);
  assert.equal(patchedDesktop.includes('const untouched = "Not Save"'), true);
  assert.match(patchedDesktop.toString('utf8'), /title:\s*\{value:"注册关闭提示",original:"Register Close Tooltip"\}/);
  assert.equal(patchedDesktop.includes('`Hello ${1}`'), true);
  assert.equal(patchedDesktop.includes('/{"Save"}/g'), true);

  const nls = JSON.parse(fs.readFileSync(path.join(app, 'out/nls.messages.json'), 'utf8'));
  assert.equal(nls[0], '打开 Cursor 设置');
  assert.equal(nls[1], '文件(&&F)');
  assert.equal(nls[2], '已将 {0} 个记事本导出到 {1}');
  assert.equal(nls[3], '保存');

  const product = JSON.parse(fs.readFileSync(path.join(app, 'product.json'), 'utf8'));
  assert.equal(product.checksums['vs/workbench/workbench.desktop.main.js'], vscodeChecksumFile(desktopPath));
  assert.equal(product.checksums['vs/workbench/workbench.desktop.main.css'], 'UNTOUCHED');
  assert.equal(product.checksums['vs/workbench/workbench.glass.main.js'], undefined);
  assert.ok(first.checksumsNotListed.includes('vs/workbench/workbench.glass.main.js'));
  assert.ok(first.skippedDualUse.some((item) => item.key === 'Terminals'));

  require('child_process').execFileSync(process.execPath, ['--check', desktopPath], { stdio: 'pipe' });
  require('child_process').execFileSync(process.execPath, ['--check', path.join(app, 'out/vs/workbench/workbench.glass.main.js')], { stdio: 'pipe' });

  const second = patchApp({ appRoot: app, backupDir: backup, mapPath });
  assert.equal(second.backupPreserved, true);
  assert.equal(
    sha256Hex(fs.readFileSync(path.join(backup, 'out/vs/workbench/workbench.desktop.main.js'))),
    backupDesktopHash
  );
  assert.equal(sha256Hex(fs.readFileSync(desktopPath)), sha256Hex(patchedDesktop));

  restoreApp({ appRoot: app, backupDir: backup });
  assert.equal(sha256Hex(fs.readFileSync(desktopPath)), sha256Hex(originalDesktop));
  const restoredNls = fs.readFileSync(path.join(app, 'out/nls.messages.json'), 'utf8');
  assert.equal(restoredNls.includes('打开'), false);
  assert.equal(JSON.parse(fs.readFileSync(path.join(app, 'product.json'), 'utf8')).checksums['vs/workbench/workbench.desktop.main.js'], vscodeChecksumFile(desktopPath));
});
