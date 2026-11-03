'use strict';

const jsTokens = require('../vendor/js-tokens');
const { decodeJsString, encodeJsString, isFunctionalShape } = require('./strings');

const TOKEN_PROPS = new Set([
  'id',
  'mode',
  'command',
  'commandId',
  'key',
  'setting',
  'mime',
  'scheme',
  'languageId',
  'contextKey',
  'when',
  'keybinding',
  'scope',
]);

const TOKEN_CALLEES = new Set([
  'getData',
  'setData',
  'getItem',
  'setItem',
  'removeItem',
  'getAttribute',
  'setAttribute',
]);

function isSignificant(token) {
  return (
    token.type !== 'WhiteSpace' &&
    token.type !== 'LineTerminatorSequence' &&
    token.type !== 'SingleLineComment' &&
    token.type !== 'MultiLineComment' &&
    token.type !== 'HashbangComment'
  );
}

function brief(token) {
  const value = token.value.length > 180 ? token.value.slice(0, 180) : token.value;
  return { type: token.type, value };
}

/**
 * Collect closed ', ", and no-substitution template literals.
 * Template literals that contain ${} are not collected (they are not
 * whole-string replacements).
 */
function collectLiterals(source) {
  const literals = [];
  const recent = [];
  let offset = 0;
  let pending = null;

  for (const token of jsTokens(source)) {
    const start = offset;
    offset += token.value.length;
    const significant = isSignificant(token);

    if (pending && significant) {
      pending.next = brief(token);
      literals.push(pending);
      pending = null;
    }

    const isWholeString =
      (token.type === 'StringLiteral' || token.type === 'NoSubstitutionTemplate') &&
      token.closed !== false;

    if (isWholeString) {
      pending = {
        start,
        end: offset,
        quote: token.value[0],
        prev: recent.slice(-6),
        next: null,
      };
    }

    if (significant) {
      recent.push(brief(token));
      if (recent.length > 8) recent.shift();
    }
  }

  if (pending) literals.push(pending);
  if (offset !== source.length) {
    throw new Error(`lexer desynced at ${offset} of ${source.length}`);
  }
  return literals;
}

function propertyName(literal) {
  const prev = literal.prev;
  if (!prev || prev.length < 2) return null;
  const colon = prev[prev.length - 1];
  if (!colon || colon.value !== ':') return null;
  const nameTok = prev[prev.length - 2];
  if (!nameTok) return null;
  if (nameTok.type === 'IdentifierName') return nameTok.value;
  if (nameTok.type === 'StringLiteral') {
    try {
      return decodeJsString(nameTok.value);
    } catch {
      return null;
    }
  }
  return null;
}

function isObjectKey(literal) {
  if (!literal.next || literal.next.value !== ':') return false;
  const prev = literal.prev;
  const last = prev && prev[prev.length - 1];
  if (last && last.value === '?') return false;
  return true;
}

function isComparison(literal) {
  const last = literal.prev && literal.prev[literal.prev.length - 1];
  return !!last && (last.value === '===' || last.value === '!==' || last.value === '==' || last.value === '!=');
}

function isCaseLabel(literal) {
  const last = literal.prev && literal.prev[literal.prev.length - 1];
  return !!last && last.type === 'IdentifierName' && last.value === 'case';
}

function isTokenCallee(literal) {
  const prev = literal.prev;
  if (!prev || prev.length < 2) return false;
  const paren = prev[prev.length - 1];
  const callee = prev[prev.length - 2];
  return !!paren && paren.value === '(' && !!callee && TOKEN_CALLEES.has(callee.value);
}

function isNlsOriginal(literal, decoded, nlsMessages) {
  if (!nlsMessages) return false;
  const prev = literal.prev;
  if (!prev || prev.length < 4) return false;
  const comma = prev[prev.length - 1];
  const num = prev[prev.length - 2];
  const paren = prev[prev.length - 3];
  const ident = prev[prev.length - 4];
  if (!comma || comma.value !== ',' || !paren || paren.value !== '(') return false;
  if (!num || num.type !== 'NumericLiteral') return false;
  if (!ident || ident.type !== 'IdentifierName') return false;
  if (!/^\d+$/.test(num.value)) return false;
  const index = Number(num.value);
  return nlsMessages[index] === decoded;
}

function isCommandTitle(source, literal) {
  if (propertyName(literal) !== 'title') return false;
  const ahead = source.slice(literal.end, literal.end + 320);
  const behind = source.slice(Math.max(0, literal.start - 140), literal.start);
  if (ahead.includes('f1:')) return true;
  if (behind.includes('id:') && ahead.includes('category:')) return true;
  return false;
}

function occurrenceKind(source, literal, decoded, nlsMessages) {
  if (isFunctionalShape(decoded)) return 'token';
  if (isObjectKey(literal)) return 'token';
  if (isComparison(literal)) return 'token';
  if (isCaseLabel(literal)) return 'token';
  if (isTokenCallee(literal)) return 'token';
  const prop = propertyName(literal);
  if (prop && TOKEN_PROPS.has(prop)) return 'token';
  if (prop === 'original') return 'original';
  if (isNlsOriginal(literal, decoded, nlsMessages)) return 'nls-original';
  if (isCommandTitle(source, literal)) return 'command-title';
  return 'display';
}

function decodeLiteral(source, literal) {
  return decodeJsString(source.slice(literal.start, literal.end));
}

/**
 * Replace whole string literals whose decoded text is a map key.
 * Keys that also appear as functional tokens are not replaced anywhere.
 * localize/localize2 English arguments (nls-original) and explicit
 * `original:` fields are left in English so the command palette can
 * still match the English alias.
 */
function applyStringMap(source, map, options = {}) {
  const nlsMessages = options.nlsMessages || null;
  const literals = collectLiterals(source);
  const byValue = new Map();

  for (const literal of literals) {
    const raw = source.slice(literal.start, literal.end);
    if (raw.length > 4000) continue;
    let decoded;
    try {
      decoded = decodeJsString(raw);
    } catch {
      continue;
    }
    if (!Object.prototype.hasOwnProperty.call(map, decoded)) continue;
    let list = byValue.get(decoded);
    if (!list) {
      list = [];
      byValue.set(decoded, list);
    }
    list.push({ literal, decoded });
  }

  const skipped = [];
  const activeValues = new Set();
  for (const [value, occ] of byValue) {
    const tokenHit = occ.some((item) => occurrenceKind(source, item.literal, item.decoded, nlsMessages) === 'token');
    if (tokenHit) {
      skipped.push({ key: value, reason: 'used as a functional token' });
      continue;
    }
    activeValues.add(value);
  }

  const edits = [];
  const stats = {
    replaced: 0,
    commandTitlesRewritten: 0,
    nlsOriginalKept: 0,
    originalFieldKept: 0,
    keysApplied: [],
  };
  const applied = new Set();

  for (const [value, occ] of byValue) {
    if (!activeValues.has(value)) continue;
    const translated = map[value];
    for (const item of occ) {
      const kind = occurrenceKind(source, item.literal, item.decoded, nlsMessages);
      if (kind === 'nls-original') {
        stats.nlsOriginalKept++;
        applied.add(value);
        continue;
      }
      if (kind === 'original') {
        stats.originalFieldKept++;
        applied.add(value);
        continue;
      }
      const literal = item.literal;
      if (kind === 'command-title') {
        const originalRaw = source.slice(literal.start, literal.end);
        const encoded = encodeJsString(translated, '"');
        edits.push({
          start: literal.start,
          end: literal.end,
          text: `{value:${encoded},original:${originalRaw}}`,
        });
        stats.commandTitlesRewritten++;
        stats.replaced++;
        applied.add(value);
        continue;
      }
      const quote = literal.quote === "'" || literal.quote === '"' || literal.quote === '`' ? literal.quote : '"';
      edits.push({
        start: literal.start,
        end: literal.end,
        text: encodeJsString(translated, quote),
      });
      stats.replaced++;
      applied.add(value);
    }
  }

  edits.sort((a, b) => a.start - b.start);
  for (let i = 1; i < edits.length; i++) {
    if (edits[i].start < edits[i - 1].end) {
      throw new Error(`overlapping edits at ${edits[i].start}`);
    }
  }
  const parts = [];
  let cursor = 0;
  for (const edit of edits) {
    parts.push(source.slice(cursor, edit.start));
    parts.push(edit.text);
    cursor = edit.end;
  }
  parts.push(source.slice(cursor));
  stats.keysApplied = [...applied];
  return { code: parts.join(''), skipped, stats };
}

module.exports = {
  collectLiterals,
  propertyName,
  occurrenceKind,
  decodeLiteral,
  applyStringMap,
  isObjectKey,
  isComparison,
};
