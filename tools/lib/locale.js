'use strict';

const fs = require('fs');

const LOCALE_RE = /("locale"\s*:\s*)"(?:\\.|[^"\\])*"/;

function setLocale(text, locale) {
  const source = text && text.trim() ? text : '{\n}\n';
  if (LOCALE_RE.test(source)) {
    return source.replace(LOCALE_RE, `$1"${locale}"`);
  }
  const inserted = source.replace(/\{/, `{\n\t"locale": "${locale}",`);
  if (inserted === source) {
    return `{\n\t"locale": "${locale}"\n}\n`;
  }
  return inserted;
}

function readLocaleFile(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath, 'utf8');
}

function writeLocale(filePath, locale) {
  const current = readLocaleFile(filePath);
  const next = setLocale(current, locale);
  fs.mkdirSync(require('path').dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, next);
  return { created: current === null, previous: current };
}

module.exports = {
  setLocale,
  writeLocale,
  readLocaleFile,
};
