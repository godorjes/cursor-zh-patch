'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function extensionId(manifest) {
  const publisher = String(manifest.publisher || '').toLowerCase();
  const name = String(manifest.name || '').toLowerCase();
  return `${publisher}.${name}`;
}

/**
 * Same hash Cursor/VS Code writes into languagepacks.json:
 * md5 of (uuid || id) + version for each contributing extension, in array order.
 */
function languagePackHash(extensions) {
  const hash = crypto.createHash('md5');
  for (const ext of extensions) {
    const ident = ext.extensionIdentifier || {};
    hash.update(ident.uuid || ident.id || '');
    hash.update(ext.version || '');
  }
  return hash.digest('hex');
}

function translationsFromManifest(extensionDir, manifest) {
  const localizations = (((manifest.contributes || {}).localizations) || []);
  const zh = localizations.find((item) => item.languageId === 'zh-cn') || localizations[0];
  if (!zh) throw new Error('language pack manifest has no localizations');
  const translations = {};
  for (const item of zh.translations || []) {
    translations[item.id] = path.join(extensionDir, item.path);
  }
  return {
    label: zh.localizedLanguageName || zh.languageName || '中文(简体)',
    translations,
  };
}

function upsertLanguagePack(existingText, extensionDir, manifest) {
  const data = existingText && existingText.trim() ? JSON.parse(existingText) : {};
  const id = extensionId(manifest);
  const version = manifest.version;
  const { label, translations } = translationsFromManifest(extensionDir, manifest);
  const current = data['zh-cn'] || { hash: '', extensions: [], translations: {}, label };
  const extensions = Array.isArray(current.extensions) ? current.extensions.slice() : [];
  const found = extensions.find((item) => {
    const ident = item.extensionIdentifier || {};
    return (ident.id || '').toLowerCase() === id;
  });
  if (found) found.version = version;
  else extensions.push({ extensionIdentifier: { id }, version });
  const mergedTranslations = Object.assign({}, current.translations || {}, translations);
  const pack = {
    hash: '',
    extensions,
    translations: mergedTranslations,
    label: current.label || label,
  };
  pack.hash = languagePackHash(pack.extensions);
  data['zh-cn'] = pack;
  return { text: JSON.stringify(data, null, 2) + '\n', pack };
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

module.exports = {
  extensionId,
  languagePackHash,
  translationsFromManifest,
  upsertLanguagePack,
  readJson,
};
