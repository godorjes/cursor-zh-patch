'use strict';

const jsTokens = require('../vendor/js-tokens');
const { decodeJsString, encodeJsString, isFunctionalShape, isShortString } = require('./strings');

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
  'type',
  'name',
  'kind',
  'value',
]);

const CALL_CALLEES = new Set([
  'getData',
  'setData',
  'getItem',
  'setItem',
  'removeItem',
  'getAttribute',
  'setAttribute',
  'includes',
  'indexOf',
  'startsWith',
  'endsWith',
  'get',
  'has',
  'set',
  'delete',
]);

const COMPARE_OPS = new Set(['==', '===', '!=', '!==']);

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

function collectLiterals(source) {
  const literals = [];
  const tokens = [];
  const recent = [];
  let offset = 0;
  let pending = null;

  for (const token of jsTokens(source)) {
    const start = offset;
    offset += token.value.length;
    const significant = isSignificant(token);
    const record = { type: token.type, value: token.value, start, end: offset, significant };
    tokens.push(record);

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
        prev: recent.slice(-12),
        next: null,
        tokenIndex: tokens.length - 1,
        tokens,
      };
    }

    if (significant) {
      recent.push(brief(token));
      if (recent.length > 16) recent.shift();
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
  const last = literal.prev && literal.prev[literal.prev.length - 1];
  // Nested ternaries look like `: "Disabled" :`. A real key is `{ "Disabled":` or `, "Disabled":`.
  return !!last && (last.value === '{' || last.value === ',');
}

function isComparison(literal) {
  const prev = literal.prev && literal.prev[literal.prev.length - 1];
  const next = literal.next;
  if (prev && (COMPARE_OPS.has(prev.value) || (prev.type === 'IdentifierName' && prev.value === 'case'))) {
    return true;
  }
  if (next && COMPARE_OPS.has(next.value)) return true;
  return false;
}

function isMemberAssignment(literal, decoded) {
  const prev = literal.prev || [];
  if (!prev.length || prev[prev.length - 1].value !== '=') return false;
  const left = prev[prev.length - 2];
  const dot = prev[prev.length - 3];
  // e[e.Usage="Usage"]="Usage"
  if (left && left.value === ']') return true;
  // e.Chat="Chat" writes an enum member. i.textContent="Accept" is UI text.
  if (left && left.type === 'IdentifierName' && dot && (dot.value === '.' || dot.value === '?.')) {
    return left.value === decoded;
  }
  return false;
}

function isSubscript(literal) {
  const prev = literal.prev && literal.prev[literal.prev.length - 1];
  return !!(prev && prev.value === '[' && literal.next && literal.next.value === ']');
}

function isInOperator(literal) {
  const prev = literal.prev && literal.prev[literal.prev.length - 1];
  const next = literal.next;
  if (prev && prev.type === 'IdentifierName' && prev.value === 'in') return true;
  if (next && next.type === 'IdentifierName' && next.value === 'in') return true;
  return false;
}

function calleeName(literal) {
  const prev = literal.prev || [];
  if (!prev.length || prev[prev.length - 1].value !== '(') return null;
  const name = prev[prev.length - 2];
  if (!name || name.type !== 'IdentifierName') return null;
  return name.value;
}

function isBlockedCall(literal) {
  const name = calleeName(literal);
  if (!name) return false;
  if (CALL_CALLEES.has(name)) return true;
  return /^publicLog/i.test(name);
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

function enclosingObject(literal) {
  const tokens = literal.tokens;
  if (!tokens || literal.tokenIndex == null) return null;
  let depth = 0;
  let open = -1;
  for (let i = literal.tokenIndex; i >= 0; i--) {
    const token = tokens[i];
    if (!token.significant) continue;
    if (token.value === '}') depth++;
    else if (token.value === '{') {
      if (depth === 0) {
        open = i;
        break;
      }
      depth--;
    }
  }
  if (open < 0) return null;
  depth = 0;
  for (let i = open; i < tokens.length; i++) {
    const token = tokens[i];
    if (!token.significant) continue;
    if (token.value === '{') depth++;
    else if (token.value === '}') {
      depth--;
      if (depth === 0) return { start: open, end: i, tokens };
    }
  }
  return null;
}

function isCommandTitle(literal) {
  if (propertyName(literal) !== 'title') return false;
  const span = enclosingObject(literal);
  if (!span) return false;
  let depth = 0;
  for (let i = span.start; i <= span.end; i++) {
    const token = span.tokens[i];
    if (!token.significant) continue;
    if (token.value === '{') {
      depth++;
      continue;
    }
    if (token.value === '}') {
      depth--;
      continue;
    }
    if (depth !== 1) continue;
    if (token.type === 'IdentifierName' && (token.value === 'f1' || token.value === 'category')) {
      for (let j = i + 1; j <= span.end; j++) {
        if (!span.tokens[j].significant) continue;
        if (span.tokens[j].value === ':') return true;
        break;
      }
    }
  }
  return false;
}

function isIdLikeProperty(literal) {
  const name = propertyName(literal);
  if (!name) return false;
  if (TOKEN_PROPS.has(name)) return true;
  return name.startsWith('data-');
}

function contextAllowed(decoded, kind, allowlist) {
  if (!isShortString(decoded)) return true;
  const contexts = allowlist && allowlist[decoded];
  return Array.isArray(contexts) && contexts.includes(kind);
}

function classifyOccurrence(literal, decoded, nlsMessages, allowlist) {
  if (isFunctionalShape(decoded)) return { kind: 'token', reason: 'functional-shape' };
  if (isObjectKey(literal)) return { kind: 'token', reason: 'object-key' };
  if (isComparison(literal)) return { kind: 'token', reason: 'comparison' };
  if (isMemberAssignment(literal, decoded)) return { kind: 'token', reason: 'member-assignment' };
  if (isSubscript(literal)) return { kind: 'token', reason: 'subscript' };
  if (isInOperator(literal)) return { kind: 'token', reason: 'in-operator' };
  if (isBlockedCall(literal)) return { kind: 'token', reason: 'call' };
  if (isIdLikeProperty(literal)) return { kind: 'token', reason: 'id-like-property' };
  if (propertyName(literal) === 'original') {
    if (!contextAllowed(decoded, 'nls-original', allowlist)) return { kind: 'held', reason: 'short-not-allowlisted' };
    return { kind: 'original', reason: 'original-field' };
  }
  if (isNlsOriginal(literal, decoded, nlsMessages)) {
    if (!contextAllowed(decoded, 'nls-original', allowlist)) return { kind: 'held', reason: 'short-not-allowlisted' };
    return { kind: 'nls-original', reason: 'nls-original' };
  }
  if (isCommandTitle(literal)) {
    if (!contextAllowed(decoded, 'command-title', allowlist)) return { kind: 'held', reason: 'short-not-allowlisted' };
    return { kind: 'command-title', reason: 'command-title' };
  }
  if (!contextAllowed(decoded, 'display', allowlist)) return { kind: 'held', reason: 'short-not-allowlisted' };
  return { kind: 'display', reason: 'display' };
}

function occurrenceKind(source, literal, decoded, nlsMessages, allowlist) {
  return classifyOccurrence(literal, decoded, nlsMessages, allowlist).kind;
}

function decodeLiteral(source, literal) {
  return decodeJsString(source.slice(literal.start, literal.end));
}

function applyStringMap(source, map, options = {}) {
  const nlsMessages = options.nlsMessages || null;
  const allowlist = options.allowlist || null;
  const literals = collectLiterals(source);
  const edits = [];
  const skipped = [];
  const stats = {
    replaced: 0,
    commandTitlesRewritten: 0,
    nlsOriginalKept: 0,
    originalFieldKept: 0,
    skippedOccurrences: 0,
    keysApplied: [],
    keysSeen: [],
  };
  const applied = new Set();
  const seen = new Set();

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
    seen.add(decoded);
    const classified = classifyOccurrence(literal, decoded, nlsMessages, allowlist);
    if (classified.kind === 'token' || classified.kind === 'held') {
      stats.skippedOccurrences++;
      skipped.push({ key: decoded, reason: classified.reason });
      continue;
    }
    if (classified.kind === 'nls-original') {
      stats.nlsOriginalKept++;
      applied.add(decoded);
      continue;
    }
    if (classified.kind === 'original') {
      stats.originalFieldKept++;
      applied.add(decoded);
      continue;
    }
    const translated = map[decoded];
    if (classified.kind === 'command-title') {
      const encoded = encodeJsString(translated, '"');
      edits.push({
        start: literal.start,
        end: literal.end,
        text: `{value:${encoded},original:${raw}}`,
      });
      stats.commandTitlesRewritten++;
      stats.replaced++;
      applied.add(decoded);
      continue;
    }
    const quote = literal.quote === "'" || literal.quote === '"' || literal.quote === '`' ? literal.quote : '"';
    edits.push({
      start: literal.start,
      end: literal.end,
      text: encodeJsString(translated, quote),
    });
    stats.replaced++;
    applied.add(decoded);
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
  stats.keysSeen = [...seen];
  return { code: parts.join(''), skipped, stats };
}

module.exports = {
  collectLiterals,
  propertyName,
  occurrenceKind,
  classifyOccurrence,
  decodeLiteral,
  applyStringMap,
  isObjectKey,
  isComparison,
  isCommandTitle,
};
