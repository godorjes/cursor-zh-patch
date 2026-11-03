'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { extractStrings } = require('../tools/lib/extract');
const { setLocale } = require('../tools/lib/locale');
const { languagePackHash, upsertLanguagePack } = require('../tools/lib/languagepack');

test('extractor keeps UI prose, drops noise, and is incremental', () => {
  const source = [
    'const a = "New Chat";',
    'const b = "https://cursor.com/docs";',
    'const c = "workbench.action.files.save";',
    'const d = "backgroundColor";',
    'const e = getData("Terminals");',
    'const f = "Terminals";',
    'const g = "Files & Folders";',
    'const h = /"New Chat"/g;',
  ].join('\n');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zh-ex-'));
  const previous = path.join(dir, 'extracted.json');
  const map = path.join(dir, 'map.json');
  fs.writeFileSync(previous, JSON.stringify({ 'Files & Folders': '' }));
  fs.writeFileSync(map, JSON.stringify({ 'New Chat': '新聊天' }));
  const result = extractStrings({
    sources: [source],
    nlsMessages: ['Open Cursor Settings', 'rgba(0,0,0,1)', 'cursor.general.settings'],
    previousPath: previous,
    mapPath: map,
  });
  assert.equal(result.pending['New Chat'], undefined);
  assert.equal(result.pending['Files & Folders'], undefined);
  assert.equal(result.pending['Open Cursor Settings'], '');
  assert.equal(Object.hasOwn(result.pending, 'https://cursor.com/docs'), false);
  assert.equal(Object.hasOwn(result.pending, 'backgroundColor'), false);
  assert.equal(Object.hasOwn(result.pending, 'workbench.action.files.save'), false);
  assert.equal(result.dualUse.Terminals !== undefined, true);
  assert.equal(result.all['Open Cursor Settings'], '');
});

test('locale edit preserves the rest of argv.json', () => {
  const original = `// locale file\n{\n\t// "disable-hardware-acceleration": true\n}\n`;
  const once = setLocale(original, 'zh-cn');
  assert.match(once, /"locale": "zh-cn"/);
  assert.match(once, /disable-hardware-acceleration/);
  const twice = setLocale(once, 'zh-cn');
  assert.equal(twice, once);
  const changed = setLocale(once, 'en');
  assert.match(changed, /"locale": "en"/);
  assert.equal(changed.includes('zh-cn'), false);
});

test('language pack hash follows the VS Code md5 update order', () => {
  const extensions = [{ extensionIdentifier: { id: 'ms-ceintl.vscode-language-pack-zh-hans' }, version: '1.128.2026071013' }];
  const hash = languagePackHash(extensions);
  assert.equal(hash, require('crypto').createHash('md5').update('ms-ceintl.vscode-language-pack-zh-hans').update('1.128.2026071013').digest('hex'));
  const manifest = {
    publisher: 'MS-CEINTL',
    name: 'vscode-language-pack-zh-hans',
    version: '1.128.2026071013',
    contributes: {
      localizations: [{
        languageId: 'zh-cn',
        languageName: 'Chinese Simplified',
        localizedLanguageName: '中文(简体)',
        translations: [{ id: 'vscode', path: './translations/main.i18n.json' }],
      }],
    },
  };
  const updated = upsertLanguagePack('', '/ext/pack', manifest);
  const parsed = JSON.parse(updated.text);
  assert.equal(parsed['zh-cn'].hash, hash);
  assert.equal(parsed['zh-cn'].translations.vscode, path.join('/ext/pack', 'translations/main.i18n.json'));
  const again = upsertLanguagePack(updated.text, '/ext/pack', manifest);
  assert.equal(JSON.parse(again.text)['zh-cn'].extensions.length, 1);
});
