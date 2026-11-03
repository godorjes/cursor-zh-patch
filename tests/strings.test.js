'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { decodeJsString, encodeJsString, translationProblem, placeholders } = require('../tools/lib/strings');
const { applyStringMap } = require('../tools/lib/literals');

test('decode and encode round-trip quotes, templates, and escapes', () => {
  const samples = ['plain', 'say "hi"', "say 'hi'", 'line\nbreak', 'tick ` here', 'cost ${not}', '中文'];
  for (const quote of ['"', "'", '`']) {
    for (const sample of samples) {
      const raw = encodeJsString(sample, quote);
      assert.equal(decodeJsString(raw), sample);
      assert.equal(raw[0], quote);
      assert.equal(raw.at(-1), quote);
    }
  }
});

const SHORT = { Save: ['display', 'nls-original', 'command-title'] };

test('placeholder and glossary guards', () => {
  assert.deepEqual(placeholders('已导出 {0} 个，共 {1}'), ['{0}', '{1}']);
  assert.equal(translationProblem('Use {1} then {0}', '先 {0} 后 {1}'), null);
  assert.equal(translationProblem('Open {0}', '打开'), 'placeholder mismatch');
  assert.equal(translationProblem('Agent', '智能体'), 'contains 智能体');
  assert.equal(translationProblem('Agent panel', '代理面板'), 'Agent translated as 代理');
  assert.equal(translationProblem('&&File', '文件'), 'missing && mnemonic');
  assert.equal(translationProblem('&&File', '文件(&&F)'), null);
  assert.equal(translationProblem('Save', '保存'), null);
});

test('replacement is whole-literal only and keeps quote style', () => {
  const source = 'const a = {label:"Save"}; const b = "Accept All"; const c = {label:\'Save\'}; const d = {label:`Save`};';
  const result = applyStringMap(source, { Save: '保存' }, { allowlist: SHORT });
  assert.equal(result.code, 'const a = {label:"保存"}; const b = "Accept All"; const c = {label:\'保存\'}; const d = {label:`保存`};');
  assert.equal(result.stats.replaced, 3);
});

test('template with interpolation is not rewritten', () => {
  const source = 'const a = `Save ${name}`; const b = {label:`Save`};';
  const result = applyStringMap(source, { Save: '保存', 'Save ${name}': '保存 ${name}' }, { allowlist: SHORT });
  assert.equal(result.code.includes('`Save ${name}`'), true);
  assert.equal(result.code.includes('`保存`'), true);
});

test('object keys, comparisons, and getData tokens block the whole key', () => {
  const source = [
    'const label = "Terminals";',
    'getData("Terminals");',
    'const mode = value === "Agent" ? "Agent" : "Ask";',
    'const table = { "Mode": 1 };',
    'const ok = {label:"Save"};',
  ].join('\n');
  const result = applyStringMap(source, {
    Terminals: '终端',
    Agent: '代理人',
    Mode: '模式',
    Save: '保存',
  }, { allowlist: SHORT });
  assert.equal(result.code.includes('"终端"'), false);
  assert.equal(result.code.includes('const ok = {label:"保存"}'), true);
  assert.equal(result.code.includes('"Agent"'), true);
  assert.equal(result.code.includes('"Mode"'), true);
  assert.deepEqual(
    [...new Set(result.skipped.map((item) => item.key))].sort(),
    ['Agent', 'Mode', 'Terminals']
  );
});

test('localize2 argument stays English while a plain copy is translated', () => {
  const source = 'const title = De(0, "Open Cursor Settings"); const again = "Open Cursor Settings";';
  const nls = ['Open Cursor Settings'];
  const result = applyStringMap(source, { 'Open Cursor Settings': '打开 Cursor 设置' }, { nlsMessages: nls });
  assert.equal(result.code.includes('De(0, "Open Cursor Settings")'), true);
  assert.equal(result.code.includes('const again = "打开 Cursor 设置"'), true);
  assert.equal(result.stats.nlsOriginalKept, 1);
});

test('plain command titles keep an English original alias', () => {
  const source = 'register({id:"cursor.sample",title:"Register Close Tooltip",category:"Tooltip",f1:!0})';
  const result = applyStringMap(source, { 'Register Close Tooltip': '注册关闭提示' });
  assert.equal(result.stats.commandTitlesRewritten, 1);
  assert.match(result.code, /title:\{value:"注册关闭提示",original:"Register Close Tooltip"\}/);
  assert.equal(result.code.includes('f1:!0'), true);
});

test('localize2 value is translated and original stays English', () => {
  const source = 'const title = {value:"Save",original:"Save"};';
  const result = applyStringMap(source, { Save: '保存' }, { allowlist: SHORT });
  assert.equal(result.code, 'const title = {value:"保存",original:"Save"};');
  assert.equal(result.stats.originalFieldKept, 1);
  assert.equal(result.stats.replaced, 1);
});

test('regex literals are not treated as strings', () => {
  const source = 'const re = /"Save"/g; const row = {label:"Save"};';
  const result = applyStringMap(source, { Save: '保存' }, { allowlist: SHORT });
  assert.equal(result.code, 'const re = /"Save"/g; const row = {label:"保存"};');
});

test('chinese replacement is escaped for the host quote', () => {
  const source = 'const a = {label:"Say \\"hi\\""};';
  const result = applyStringMap(source, { 'Say "hi"': '说"嗨"' }, { allowlist: { 'Say "hi"': ['display'] } });
  assert.equal(result.code, 'const a = {label:"说\\"嗨\\""};');
  assert.equal(require('../tools/lib/strings').decodeJsString('"说\\"嗨\\""'), '说"嗨"');
});
