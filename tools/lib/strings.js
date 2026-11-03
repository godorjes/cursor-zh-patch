'use strict';

function decodeJsString(raw) {
  if (typeof raw !== 'string' || raw.length < 2) {
    throw new Error('not a string literal');
  }
  const quote = raw[0];
  if (quote !== '"' && quote !== "'" && quote !== '`') {
    throw new Error('unsupported quote');
  }
  if (raw[raw.length - 1] !== quote) {
    throw new Error('unclosed string');
  }
  const body = raw.slice(1, -1);
  let out = '';
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch !== '\\') {
      out += ch;
      continue;
    }
    const next = body[++i];
    if (next === undefined) throw new Error('truncated escape');
    switch (next) {
      case 'n': out += '\n'; break;
      case 'r': out += '\r'; break;
      case 't': out += '\t'; break;
      case 'b': out += '\b'; break;
      case 'f': out += '\f'; break;
      case 'v': out += '\v'; break;
      case '0': out += '\0'; break;
      case '\\':
      case "'":
      case '"':
      case '`':
      case '$':
        out += next;
        break;
      case '\n':
        break;
      case '\r':
        if (body[i + 1] === '\n') i++;
        break;
      case 'x': {
        const hex = body.slice(i + 1, i + 3);
        if (!/^[0-9a-fA-F]{2}$/.test(hex)) throw new Error('bad hex escape');
        out += String.fromCharCode(parseInt(hex, 16));
        i += 2;
        break;
      }
      case 'u': {
        if (body[i + 1] === '{') {
          const end = body.indexOf('}', i + 2);
          if (end < 0) throw new Error('bad unicode escape');
          const hex = body.slice(i + 2, end);
          if (!/^[0-9a-fA-F]+$/.test(hex)) throw new Error('bad unicode escape');
          out += String.fromCodePoint(parseInt(hex, 16));
          i = end;
        } else {
          const hex = body.slice(i + 1, i + 5);
          if (!/^[0-9a-fA-F]{4}$/.test(hex)) throw new Error('bad unicode escape');
          out += String.fromCharCode(parseInt(hex, 16));
          i += 4;
        }
        break;
      }
      default:
        out += next;
        break;
    }
  }
  return out;
}

function encodeJsString(value, quote) {
  if (quote !== '"' && quote !== "'" && quote !== '`') {
    throw new Error('unsupported quote');
  }
  let out = quote;
  for (let i = 0; i < value.length; i++) {
    const ch = value[i];
    const code = ch.charCodeAt(0);
    if (ch === '\\') out += '\\\\';
    else if (ch === quote) out += '\\' + quote;
    else if (ch === '\n') out += '\\n';
    else if (ch === '\r') out += '\\r';
    else if (ch === '\t') out += '\\t';
    else if (ch === '\b') out += '\\b';
    else if (ch === '\f') out += '\\f';
    else if (ch === '\u2028') out += '\\u2028';
    else if (ch === '\u2029') out += '\\u2029';
    else if (quote === '`' && ch === '$' && value[i + 1] === '{') out += '\\$';
    else if (code < 0x20) out += '\\u' + code.toString(16).padStart(4, '0');
    else out += ch;
  }
  out += quote;
  return out;
}

function placeholders(text) {
  const found = [];
  const re = /\{(\d+)\}|\$\{[^}]+\}|%(?:[sdif]|%)/g;
  let match;
  while ((match = re.exec(text))) found.push(match[0]);
  return found;
}

function sameList(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/**
 * Reject translations that would break the UI or violate the glossary.
 * Returns a reason string, or null when the pair is usable.
 */
function translationProblem(source, translated) {
  if (typeof translated !== 'string' || translated.length === 0) return 'empty translation';
  if (translated === source) return 'unchanged';
  if (translated.includes('智能体')) return 'contains 智能体';
  if (/agent/i.test(source) && translated.includes('代理')) return 'Agent translated as 代理';
  if (!sameList(placeholders(source), placeholders(translated))) return 'placeholder mismatch';
  if (source.includes('&&') && !translated.includes('&&')) return 'missing && mnemonic';
  return null;
}

function isFunctionalShape(text) {
  if (typeof text !== 'string' || text.length === 0) return false;
  if (/^@[\w./:-]+$/.test(text)) return true;
  // command ids and setting keys: dotted identifiers, no spaces
  if (/^[A-Za-z][\w-]*(\.[A-Za-z][\w-]*)+$/.test(text)) return true;
  return false;
}

module.exports = {
  decodeJsString,
  encodeJsString,
  placeholders,
  translationProblem,
  isFunctionalShape,
};
