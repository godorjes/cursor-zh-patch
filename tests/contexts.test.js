'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { applyStringMap } = require('../tools/lib/literals');

const MAP = {
  Settings: '设置',
  Chat: '聊天',
  Usage: '用量',
  Local: '本地',
  Indexing: '索引',
  General: '常规',
  Accept: '接受',
  Apply: '应用',
};
const ALLOW = {
  Settings: ['display', 'nls-original', 'command-title'],
  Chat: ['display', 'nls-original', 'command-title'],
  Usage: ['display'],
  Local: ['display'],
  Indexing: ['display'],
  General: ['display'],
  Accept: ['display'],
  Apply: ['display'],
};

function patch(source) {
  return applyStringMap(source, MAP, { allowlist: ALLOW }).code;
}

test('comparison on either side and switch case stay English', () => {
  assert.equal(patch('"Settings"===e'), '"Settings"===e');
  assert.equal(patch('e==="Settings"'), 'e==="Settings"');
  assert.equal(patch('e!="Settings"'), 'e!="Settings"');
  assert.equal(patch('e!=="Settings"'), 'e!=="Settings"');
  assert.equal(patch('switch(x){case "Chat":break}'), 'switch(x){case "Chat":break}');
});

test('member assignments and subscripts stay English', () => {
  assert.equal(patch('e.Chat="Chat"'), 'e.Chat="Chat"');
  assert.equal(patch('e[e.Usage="Usage"]="Usage"'), 'e[e.Usage="Usage"]="Usage"');
  assert.equal(patch('o["Indexing"]'), 'o["Indexing"]');
  assert.equal(patch('i.textContent="Accept"'), 'i.textContent="接受"');
});

test('in, includes/get, and publicLog stay English', () => {
  assert.equal(patch('"General" in o'), '"General" in o');
  assert.equal(patch('list.includes("Local")'), 'list.includes("Local")');
  assert.equal(patch('m.get("Usage")'), 'm.get("Usage")');
  assert.equal(patch('m.has("Usage")'), 'm.has("Usage")');
  assert.equal(patch('m.set("Usage",1)'), 'm.set("Usage",1)');
  assert.equal(patch('name.indexOf("Chat")'), 'name.indexOf("Chat")');
  assert.equal(patch('name.startsWith("Chat")'), 'name.startsWith("Chat")');
  assert.equal(patch('name.endsWith("Chat")'), 'name.endsWith("Chat")');
  assert.equal(patch('publicLog2("Accept")'), 'publicLog2("Accept")');
});

test('data-* and id-like property values stay English', () => {
  assert.equal(patch('"data-tab":"General"'), '"data-tab":"General"');
  assert.equal(patch('{type:"Chat",name:"Chat",kind:"Chat",id:"Chat"}'), '{type:"Chat",name:"Chat",kind:"Chat",id:"Chat"}');
});

test('a plain display literal of the same word is still translated', () => {
  assert.equal(patch('const label = "Settings"'), 'const label = "设置"');
});

test('Apply is not a hit inside a longer literal', () => {
  const source = 'const label = "Apply {0} changes"';
  assert.equal(patch(source), source);
});

test('Sign in and Sign In are different keys', () => {
  const source = 'const a = "Sign in"; const b = "Sign In";';
  const result = applyStringMap(source, { 'Sign in': '登录' }, {
    allowlist: { 'Sign in': ['display'] },
  });
  assert.equal(result.code, 'const a = "登录"; const b = "Sign In";');
});

test('command title rewrite stays inside the same object literal', () => {
  const bare = applyStringMap('const panel = {title:"Chat"};', { Chat: '聊天' }, { allowlist: ALLOW });
  assert.equal(bare.code.includes('original:'), false);
  assert.equal(bare.code, 'const panel = {title:"聊天"};');
  const command = applyStringMap(
    'register({id:"c",title:"Chat",category:"C",f1:!0})',
    { Chat: '聊天' },
    { allowlist: ALLOW }
  );
  assert.match(command.code, /title:\{value:"聊天",original:"Chat"\}/);
});

test('nested ternary colons are not object keys', () => {
  const source = 'e.blocked||!e.enabled?e.blocked?e.error??`Blocked by admin`:`Disabled`:e.status';
  const result = applyStringMap(source, { Disabled: '已禁用' }, {
    allowlist: { Disabled: ['display'] },
  });
  assert.equal(result.code.includes('`已禁用`'), true);
  assert.equal(result.code.includes('`Disabled`'), false);
  const key = applyStringMap('const row = { "Disabled": true };', { Disabled: '已禁用' }, {
    allowlist: { Disabled: ['display'] },
  });
  assert.equal(key.code, 'const row = { "Disabled": true };');
});

test('the same string is translated only at UI occurrences', () => {
  const source = 'const name = n.trim() || "New Agent"; if (title === "New Agent") {}';
  const result = applyStringMap(source, { 'New Agent': '新建 Agent' }, {
    allowlist: { 'New Agent': ['display'] },
  });
  assert.equal(result.code.includes('|| "新建 Agent"'), true);
  assert.equal(result.code.includes('=== "New Agent"'), true);
});

test('short strings outside the allowlist are not replaced', () => {
  const source = 'const label = "Apply";';
  const result = applyStringMap(source, { Apply: '应用' }, { allowlist: {} });
  assert.equal(result.code, source);
  assert.equal(result.stats.skippedOccurrences, 1);
  assert.equal(result.stats.replaced, 0);
});
