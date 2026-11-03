'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { applyStringMap } = require('../tools/lib/literals');

function run(source, map) {
  return applyStringMap(source, map, {});
}

test('real 3.27.22 logic sites stay English', () => {
  const map = {
    On: '开',
    Off: '关',
    Local: '本地',
    Undo: '撤销',
    Chat: '聊天',
    Settings: '设置',
  };
  assert.equal(run('document.designMode="On"', map).code, 'document.designMode="On"');
  assert.equal(run('document.designMode="Off"', map).code, 'document.designMode="Off"');
  assert.equal(
    run('const yaml=["on","On","ON","off","Off","OFF"]', map).code,
    'const yaml=["on","On","ON","off","Off","OFF"]'
  );
  assert.equal(run('readRegistry("Keyboard Preference","On")', map).code, 'readRegistry("Keyboard Preference","On")');
  assert.equal(run('const keys=[1,126,"Undo","Again"]', map).code, 'const keys=[1,126,"Undo","Again"]');
  const shell = run('shellLaunchConfig.type="Local"; switch(mode){case"Local":break} const row={title:"Local"};', map);
  assert.equal(shell.code.includes('type="Local"'), true);
  assert.equal(shell.code.includes('case"Local"'), true);
  assert.equal(shell.code.includes('title:"本地"'), true);
  const categories = run('const PVt=["AI","Azure","Chat"]; PVt.indexOf(name); const row={title:"Chat"};', map);
  assert.equal(categories.code.includes('["AI","Azure","Chat"]'), true);
  assert.equal(categories.code.includes('indexOf(name)'), true);
  assert.equal(categories.code.includes('title:"聊天"'), true);
  assert.equal(run('const v=defaultFieldValue||"Off"', map).code, 'const v=defaultFieldValue||"Off"');
  assert.equal(run('const row={glassCategory:"Settings",title:"Settings"}', map).code, 'const row={glassCategory:"Settings",title:"设置"}');
});

test('probe patterns stay English unless they are explicit UI', () => {
  const map = { Chat: '聊天', Local: '本地', Cloud: '云端' };
  const later = run('function pick(flag){ const mode = flag?"Chat":"Local"; return mode; } if (pick(true)==="Chat" || pick(false)==="Local") {}', map);
  assert.equal(later.code.includes('"聊天"'), false);
  assert.equal(later.code.includes('"本地"'), false);
  assert.equal(later.code.includes('==="Chat"'), true);
  assert.equal(run('const v = x||"Chat"', map).code, 'const v = x||"Chat"');
  assert.equal(run('let mode="Chat"', map).code, 'let mode="Chat"');
  assert.equal(run('const s = new Set(["Chat"])', map).code, 'const s = new Set(["Chat"])');
  assert.equal(run('const frozen = Object.freeze({LOCAL:"Local"})', map).code, 'const frozen = Object.freeze({LOCAL:"Local"})');
  assert.equal(run('if (mode===("Chat")) {}', map).code, 'if (mode===("Chat")) {}');
  assert.equal(run('bus.fire("Chat")', map).code, 'bus.fire("Chat")');
  assert.equal(run('const ok=["Local","Cloud"].includes(t)', map).code, 'const ok=["Local","Cloud"].includes(t)');
});

test('explicit UI properties and localization defaults are translated', () => {
  const map = {
    Keep: '保留',
    Undo: '撤销',
    Apply: '应用',
    Usage: '用量',
    Hooks: '钩子',
    Subagents: '子 Agent',
    Settings: '设置',
    Chat: '聊天',
    'New Chat': '新聊天',
  };
  const ui = [
    'label',
    'title',
    'children',
    'aria-label',
    'tooltip',
    'placeholder',
    'description',
    'hintText',
    'textContent',
  ];
  for (const prop of ui) {
    const key = prop === 'aria-label' ? '"aria-label"' : prop;
    const source = `const row = {${key}:"Settings"};`;
    assert.equal(run(source, map).code, `const row = {${key}:"设置"};`, prop);
  }
  assert.equal(run('i.textContent="Settings"', map).code, 'i.textContent="设置"');
  assert.equal(
    run('const bar={accept:"Keep",reject:"Undo"};', map).code,
    'const bar={accept:"保留",reject:"撤销"};'
  );
  assert.equal(run('const button={title:"Apply",children:"Apply",label:"Apply"};', map).code, 'const button={title:"应用",children:"应用",label:"应用"};');
  const usage = run('const T=u?.billingCycleEnd?`Usage · Resets ${end}`:"Usage";', map);
  assert.equal(usage.code.includes(':"用量"'), true);
  const hooks = run('oP(this,"Hooks",ctor); switch(icon){case"Hooks":break} const nav={label:"Hooks",title:"Hooks"};', map);
  assert.equal(hooks.code.includes('oP(this,"Hooks"'), true);
  assert.equal(hooks.code.includes('case"Hooks"'), true);
  assert.equal(hooks.code.includes('label:"钩子"'), true);
  assert.equal(hooks.code.includes('title:"钩子"'), true);
  const sub = run('const order=["Skills","Subagents"]; const nav={label:"Subagents"};', map);
  assert.equal(sub.code.includes('["Skills","Subagents"]'), true);
  assert.equal(sub.code.includes('label:"子 Agent"'), true);
  assert.equal(run('const text=k(n,null,"Settings")', map).code, 'const text=k(n,null,"设置")');
  assert.equal(run('const text=N("glass.chat","Chat")', map).code, 'const text=N("glass.chat","聊天")');
  assert.equal(run('const text=k(n,"Settings")', map).code, 'const text=k(n,"设置")');
});

test('name and value follow the per-site rule', () => {
  const menu = run(
    'const view=Fe(y,()=>e.fallback||"New Agent"); return open({name:"New Agent",get icon(){return "agent"},get shortcutLabel(){return "X"}})',
    { 'New Agent': '新建 Agent' }
  );
  assert.equal(menu.code.includes('||"New Agent"'), true);
  assert.equal(menu.code.includes('name:"新建 Agent"'), true);

  const cloud = run(
    'const keywords={searchKeywords:["Cloud","Environment"]}; const tool={id:"cloud",name:"Cloud",icon:"cloudTwo",actionId:"run"}; const row={label:"Cloud"};',
    { Cloud: '云端' }
  );
  assert.equal(cloud.code.includes('name:"Cloud"'), true);
  assert.equal(cloud.code.includes('["Cloud","Environment"]'), true);
  assert.equal(cloud.code.includes('label:"云端"'), true);

  const wrapped = run(
    'register({id:"c",title:{value:"New Chat",original:"New Chat"},f1:!0})',
    { 'New Chat': '新聊天' }
  );
  assert.equal(wrapped.code.includes('value:"新聊天"'), true);
  assert.equal(wrapped.code.includes('original:"New Chat"'), true);

  const chats = run(
    'const menu={name:"Chats",searchAliases:["Past"],icon:"chat"};',
    { Chats: '聊天' }
  );
  assert.equal(chats.code.includes('name:"聊天"'), true);
  const poisonedChats = run(
    'function label(){return r3_("Chats", theme)} const menu={name:"Chats",icon:"chat",searchAliases:["Past"]}; const section={title:"Chats"};',
    { Chats: '聊天' }
  );
  assert.equal(poisonedChats.code.includes('r3_("Chats"'), true);
  assert.equal(poisonedChats.code.includes('name:"Chats"'), true);
  assert.equal(poisonedChats.code.includes('title:"聊天"'), true);
});

test('nls catalog entries are messages, including short ones', () => {
  const source = '[\n  "Save",\n  "Open Cursor Settings"\n]\n';
  const result = applyStringMap(source, { Save: '保存', 'Open Cursor Settings': '打开 Cursor 设置' }, { catalog: true });
  assert.equal(result.code.includes('"保存"'), true);
  assert.equal(result.code.includes('"打开 Cursor 设置"'), true);
  assert.equal(result.stats.skippedOccurrences, 0);
});
