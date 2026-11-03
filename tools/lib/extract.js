'use strict';

const fs = require('fs');
const { collectLiterals, occurrenceKind, propertyName } = require('./literals');
const { decodeJsString, isFunctionalShape } = require('./strings');

const UI_PROPS = new Set([
  'label',
  'title',
  'placeholder',
  'description',
  'tooltip',
  'message',
  'text',
  'content',
  'header',
  'subtitle',
  'detail',
  'aria-label',
  'ariaLabel',
  'children',
  'primaryButton',
  'secondaryButton',
  'buttonLabel',
  'name',
]);

function looksNoisy(text) {
  if (text.length < 2 || text.length > 400) return true;
  if (!/[A-Za-z]/.test(text)) return true;
  if (isFunctionalShape(text)) return true;
  if (/^(https?:|vscode:|file:|data:|mailto:)/i.test(text)) return true;
  if (/^[a-z]+:\/\//i.test(text)) return true;
  if (/^[.#][\w-]+$/.test(text)) return true;
  if (/^#[0-9a-fA-F]{3,8}$/.test(text)) return true;
  if (/^[a-z0-9_.-]+\/[a-z0-9_./-]+$/i.test(text) && !text.includes(' ')) return true;
  if (/^[a-z][a-zA-Z0-9]*$/.test(text)) return true; // camelCase identifier
  if (/^[a-z0-9]+(?:[_-][a-z0-9]+)+$/.test(text)) return true;
  if (/^[A-Z0-9]+(?:_[A-Z0-9]+)+$/.test(text)) return true;
  if (/\\[dDsSwWbBfnrtv]/.test(text)) return true;
  if (/[{};]|=>|\bfunction\b|\breturn\b|\bconst\b|\bvar\b/.test(text) && !text.includes(' ')) return true;
  if (/<\/?[a-z][^>]*>/i.test(text)) return true;
  if (/^[0-9a-f-]{8,}$/i.test(text)) return true;
  if (/\b\d+px\b|rgba?\(|#[0-9a-fA-F]{3,8}\b/.test(text) && text.length < 80) return true;
  const letters = (text.match(/[A-Za-z]/g) || []).length;
  if (letters / text.length < 0.45) return true;
  return false;
}

function looksLikeProse(text) {
  if (looksNoisy(text)) return false;
  if (text.includes(' ') || text.includes('&&') || /\{\d+\}/.test(text)) {
    return /[A-Za-z]{2,}/.test(text);
  }
  return /^[A-Z][A-Za-z0-9+'’/&. -]{1,40}$/.test(text);
}

function loadKeySet(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return new Set();
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (Array.isArray(data)) return new Set(data.filter((item) => typeof item === 'string'));
  return new Set(Object.keys(data).filter((key) => !key.startsWith('_')));
}

function scanJs(source, nlsMessages) {
  const hits = new Map();
  const dualUse = new Map();
  let literals;
  try {
    literals = collectLiterals(source);
  } catch (error) {
    throw error;
  }
  const grouped = new Map();
  for (const literal of literals) {
    const raw = source.slice(literal.start, literal.end);
    if (raw.length > 2000) continue;
    let decoded;
    try {
      decoded = decodeJsString(raw);
    } catch {
      continue;
    }
    if (!looksLikeProse(decoded) && !isFunctionalShape(decoded)) continue;
    let list = grouped.get(decoded);
    if (!list) {
      list = [];
      grouped.set(decoded, list);
    }
    list.push(literal);
  }

  for (const [decoded, list] of grouped) {
    let token = isFunctionalShape(decoded);
    let ui = false;
    for (const literal of list) {
      const kind = occurrenceKind(source, literal, decoded, nlsMessages);
      if (kind === 'token') token = true;
      const prop = propertyName(literal);
      if (kind === 'display' || kind === 'held' || kind === 'command-title' || kind === 'nls-original' || (prop && UI_PROPS.has(prop))) {
        ui = true;
      }
      if (!prop && (kind === 'display' || kind === 'nls-original') && looksLikeProse(decoded)) ui = true;
    }
    if (token && ui) dualUse.set(decoded, 'display string is also used as a token');
    else if (token) continue;
    else if (ui || looksLikeProse(decoded)) hits.set(decoded, (hits.get(decoded) || 0) + list.length);
  }
  return { hits, dualUse };
}

function scanNls(messages) {
  const hits = new Map();
  for (const message of messages) {
    if (typeof message !== 'string') continue;
    if (!looksLikeProse(message) || isFunctionalShape(message)) continue;
    hits.set(message, (hits.get(message) || 0) + 1);
  }
  return hits;
}

function extractStrings(options) {
  const nlsMessages = options.nlsText ? JSON.parse(options.nlsText) : options.nlsMessages || [];
  const merged = new Map();
  const dualUse = new Map();
  for (const source of options.sources || []) {
    const scanned = scanJs(source, nlsMessages);
    for (const [key, count] of scanned.hits) merged.set(key, (merged.get(key) || 0) + count);
    for (const [key, reason] of scanned.dualUse) dualUse.set(key, reason);
  }
  if (Array.isArray(nlsMessages)) {
    for (const [key, count] of scanNls(nlsMessages)) {
      if (!dualUse.has(key)) merged.set(key, (merged.get(key) || 0) + count);
    }
  }
  for (const key of dualUse.keys()) merged.delete(key);

  const known = new Set([
    ...loadKeySet(options.mapPath),
    ...loadKeySet(options.previousPath),
  ]);
  const pending = {};
  const all = {};
  for (const key of [...merged.keys()].sort((a, b) => a.localeCompare(b))) {
    all[key] = '';
    if (!known.has(key)) pending[key] = '';
  }
  return {
    pending,
    all,
    dualUse: Object.fromEntries([...dualUse.entries()].sort((a, b) => a[0].localeCompare(b[0]))),
    counts: { candidates: merged.size, pending: Object.keys(pending).length, dualUse: dualUse.size },
  };
}

module.exports = {
  looksNoisy,
  looksLikeProse,
  extractStrings,
  scanJs,
};
