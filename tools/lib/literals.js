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

// Short glossary words are replaced only in these positions. accept/reject are the
// review-bar button labels (accept:"Keep"). fallback, actionTitle and defaultLabel
// are the visible title/button fallbacks next to title/label.
const UI_PROPS = new Set([
  'label',
  'title',
  'children',
  'aria-label',
  'ariaLabel',
  'tooltip',
  'placeholder',
  'description',
  'hintText',
  'textContent',
  'accept',
  'reject',
  'fallback',
  'actionTitle',
  'defaultLabel',
]);

const MENU_HINTS = new Set(['icon', 'shortcutLabel', 'searchAliases']);

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
  'fire',
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
        prev: recent.slice(-32),
        next: null,
        tokenIndex: tokens.length - 1,
        tokens,
      };
    }

    if (significant) {
      recent.push(brief(token));
      if (recent.length > 36) recent.shift();
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
  const prev = literal.prev || [];
  const last = prev[prev.length - 1];
  const next = literal.next;
  if (last && (COMPARE_OPS.has(last.value) || (last.type === 'IdentifierName' && last.value === 'case'))) {
    return true;
  }
  if (next && COMPARE_OPS.has(next.value)) return true;
  // ===("Chat") wraps the operand in parens.
  if (last && last.value === '(' && next && next.value === ')') {
    const op = prev[prev.length - 2];
    if (op && COMPARE_OPS.has(op.value)) return true;
  }
  return false;
}

function assignedProperty(literal) {
  const prev = literal.prev || [];
  if (!prev.length || prev[prev.length - 1].value !== '=') return null;
  const left = prev[prev.length - 2];
  const dot = prev[prev.length - 3];
  // e[e.Usage="Usage"]="Usage"
  if (left && left.value === ']') return { token: true };
  if (left && left.type === 'IdentifierName' && dot && (dot.value === '.' || dot.value === '?.')) {
    return { name: left.value };
  }
  return null;
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

function callOf(literal) {
  const prev = literal.prev || [];
  let depth = 0;
  let commas = 0;
  for (let i = prev.length - 1; i >= 0; i--) {
    const tok = prev[i];
    if (tok.value === ')' || tok.value === ']' || tok.value === '}') depth++;
    else if (tok.value === '(' || tok.value === '[' || tok.value === '{') {
      if (depth === 0) {
        if (tok.value !== '(') return null;
        const name = prev[i - 1];
        if (!name || name.type !== 'IdentifierName') return null;
        const dot = prev[i - 2];
        const member = !!(dot && (dot.value === '.' || dot.value === '?.'));
        return { name: name.value, index: commas, member };
      }
      depth--;
    } else if (depth === 0 && tok.value === ',') commas++;
    else if (depth === 0 && (tok.value === '=>' || tok.value === ';')) return null;
  }
  return null;
}

function isBlockedCallee(call) {
  if (!call) return false;
  if (CALL_CALLEES.has(call.name)) return true;
  return /^publicLog/i.test(call.name);
}

function isLocalizationDefault(call) {
  if (!call || call.member) return false;
  if (call.name === 'N' && call.index === 1) return true;
  if (call.name === 'k' && call.index >= 1) return true;
  return false;
}

function propNameAt(prev, index) {
  const name = prev[index - 1];
  const before = prev[index - 2];
  if (!name || !before || name.type !== 'IdentifierName') return null;
  if (before.value === '{' || before.value === ',' || before.value === '(') return name.value;
  return null;
}

function uiAncestor(literal) {
  const prev = literal.prev || [];
  let depth = 0;
  for (let i = prev.length - 1; i >= 0; i--) {
    const tok = prev[i];
    if (tok.value === ')' || tok.value === ']' || tok.value === '}') {
      depth++;
      continue;
    }
    if (tok.value === '(' || tok.value === '[' || tok.value === '{') {
      if (depth === 0) {
        if (tok.value === '{') {
          const close = prev[i - 1];
          const open = prev[i - 2];
          const name = prev[i - 3];
          const get = prev[i - 4];
          if (close && close.value === ')' && open && open.value === '(' && name && name.type === 'IdentifierName' && get && get.value === 'get' && UI_PROPS.has(name.value)) {
            return name.value;
          }
          return null;
        }
        if (tok.value === '[') {
          const colon = prev[i - 1];
          if (colon && colon.value === ':') {
            const name = propNameAt(prev, i - 1);
            if (name && UI_PROPS.has(name)) return name;
          }
          return null;
        }
        continue;
      }
      depth--;
      continue;
    }
    if (depth !== 0) continue;
    if (tok.value === ',' || tok.value === ';') return null;
    if (tok.value === ':') {
      const name = propNameAt(prev, i);
      if (name && UI_PROPS.has(name)) return name;
      if (name) return null;
    }
  }
  return null;
}

function isArrayElement(literal) {
  const prev = literal.prev || [];
  const last = prev[prev.length - 1];
  const next = literal.next;
  if (!last || !next) return false;
  return (last.value === '[' || last.value === ',') && (next.value === ',' || next.value === ']');
}

function isTernaryOrReturn(literal) {
  if (propertyName(literal)) return false;
  const prev = literal.prev || [];
  const last = prev[prev.length - 1];
  const next = literal.next;
  if (last && last.value === 'return') return true;
  if (last && (last.value === '?' || last.value === ':')) return true;
  if (next && (next.value === '?' || next.value === ':')) return true;
  return false;
}

function siblingNames(literal) {
  const span = enclosingObject(literal, 500);
  const names = new Set();
  if (!span) return names;
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
    if (depth !== 1 || token.type !== 'IdentifierName') continue;
    let j = i + 1;
    while (j <= span.end && !span.tokens[j].significant) j++;
    const next = span.tokens[j];
    if (next && (next.value === ':' || next.value === '(')) names.add(token.value);
  }
  return names;
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

function enclosingObject(literal, limit = 800) {
  const tokens = literal.tokens;
  if (!tokens || literal.tokenIndex == null) return null;
  let depth = 0;
  let open = -1;
  let steps = 0;
  for (let i = literal.tokenIndex; i >= 0 && steps < limit; i--) {
    const token = tokens[i];
    if (!token.significant) continue;
    steps++;
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

function isJsonArrayElement(literal) {
  const prev = literal.prev || [];
  const last = prev[prev.length - 1];
  const next = literal.next;
  if (!last || !next) return false;
  return (last.value === '[' || last.value === ',') && (next.value === ',' || next.value === ']');
}

function classifyOccurrence(literal, decoded, nlsMessages, options = {}) {
  const catalog = !!(options && options.catalog);
  const short = isShortString(decoded);
  if (catalog && isJsonArrayElement(literal)) return { kind: 'display', reason: 'catalog' };
  if (isFunctionalShape(decoded)) return { kind: 'token', reason: 'functional-shape' };
  if (isObjectKey(literal)) return { kind: 'token', reason: 'object-key' };
  if (isComparison(literal)) return { kind: 'token', reason: 'comparison' };
  if (isSubscript(literal)) return { kind: 'token', reason: 'subscript' };
  if (isInOperator(literal)) return { kind: 'token', reason: 'in-operator' };

  const assigned = assignedProperty(literal);
  if (assigned && assigned.token) return { kind: 'token', reason: 'member-assignment' };
  if (assigned && assigned.name && UI_PROPS.has(assigned.name)) {
    return { kind: 'display', reason: 'ui-property' };
  }
  if (assigned && assigned.name && (short || assigned.name === decoded)) {
    return { kind: 'token', reason: 'member-assignment' };
  }

  const call = callOf(literal);
  if (isBlockedCallee(call)) return { kind: 'token', reason: 'call' };
  if (isLocalizationDefault(call)) return { kind: 'display', reason: 'localization-default' };
  if (isNlsOriginal(literal, decoded, nlsMessages)) return { kind: 'nls-original', reason: 'nls-original' };
  if (call && short) return { kind: 'token', reason: 'call' };

  const prop = propertyName(literal);
  if (prop === 'original' || prop === 'alias') return { kind: 'original', reason: prop === 'alias' ? 'alias-field' : 'original-field' };
  if (prop === 'value' && siblingNames(literal).has('original')) return { kind: 'display', reason: 'localize-value' };

  const ui = prop && UI_PROPS.has(prop) ? prop : uiAncestor(literal);
  if (ui) {
    if (ui === 'title' && isCommandTitle(literal)) return { kind: 'command-title', reason: 'command-title' };
    return { kind: 'display', reason: 'ui-property' };
  }
  if (prop === 'name' && short && [...MENU_HINTS].some((hint) => siblingNames(literal).has(hint))) {
    return { kind: 'menu-name', reason: 'menu-name' };
  }
  if (isIdLikeProperty(literal)) return { kind: 'token', reason: 'id-like-property' };

  if (short) {
    if (isArrayElement(literal)) return { kind: 'token', reason: 'array-element' };
    if (prop) return { kind: 'held', reason: 'non-ui-property' };
    if (isTernaryOrReturn(literal)) return { kind: 'soft', reason: 'ternary-or-return' };
    return { kind: 'held', reason: 'short-default-skip' };
  }
  return { kind: 'display', reason: 'display' };
}

function finalizeClass(classified, poisoned) {
  if (poisoned && (classified.kind === 'soft' || classified.kind === 'menu-name')) {
    return { kind: 'held', reason: 'file-poisoned' };
  }
  if (classified.kind === 'soft' || classified.kind === 'menu-name') {
    return { kind: 'display', reason: classified.reason };
  }
  return classified;
}

function occurrenceKind(source, literal, decoded, nlsMessages, allowlist) {
  return classifyOccurrence(literal, decoded, nlsMessages, allowlist).kind;
}

function decodeLiteral(source, literal) {
  return decodeJsString(source.slice(literal.start, literal.end));
}

function planOccurrences(source, map, options = {}) {
  const nlsMessages = options.nlsMessages || null;
  const literals = collectLiterals(source);
  const items = [];
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
    items.push({
      literal,
      decoded,
      classified: classifyOccurrence(literal, decoded, nlsMessages, options),
    });
  }
  const poisoned = new Set();
  if (!options.catalog) {
    for (const item of items) {
      if (isShortString(item.decoded) && item.classified.kind === 'token') poisoned.add(item.decoded);
    }
  }
  for (const item of items) {
    item.poisoned = poisoned.has(item.decoded);
    item.final = finalizeClass(item.classified, item.poisoned);
  }
  return items;
}

function applyStringMap(source, map, options = {}) {
  const items = planOccurrences(source, map, options);
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

  for (const item of items) {
    const literal = item.literal;
    const decoded = item.decoded;
    seen.add(decoded);
    const classified = item.final;
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
        text: `{value:${encoded},original:${source.slice(literal.start, literal.end)}}`,
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
  planOccurrences,
  decodeLiteral,
  applyStringMap,
  isObjectKey,
  isComparison,
  isCommandTitle,
};
