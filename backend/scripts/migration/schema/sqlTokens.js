'use strict';

/**
 * sqlTokens.js - a small PostgreSQL-flavoured SQL tokenizer plus a paren/bracket group tree.
 *
 * Pure functions, no I/O. Used by the DML analyzer (sqlAnalyze.js) and the DDL parser (ddlModel.js).
 *
 * Token: { k, v, u, s, e, dyn? }
 *   k   word | qid | str | num | param | op | comma | semi | dot | lp | rp | lb | rb
 *   v   text (for qid: the unquoted identifier; for str: the string body; otherwise the raw text)
 *   u   UPPERCASE of v for words (undefined otherwise)
 *   s,e start / end offsets in the source text
 *   dyn (word only) index of a `${...}` placeholder the JS scanner substituted (see DYN_RE)
 */

/** The JS scanner replaces `${expr}` it cannot resolve with this marker; the tokenizer recognises it. */
const DYN_RE = /^__\$DYN_(\d+)\$__$/;
const dynMarker = (n) => `__$DYN_${n}$__`;

const OP_CHARS = '+-*/<>=~!@#%^&|?:';

function isWordStart(ch) { return /[A-Za-z_]/.test(ch); }
function isWordChar(ch) { return /[A-Za-z0-9_$]/.test(ch); }
function isDigit(ch) { return ch >= '0' && ch <= '9'; }

function tokenize(text) {
  const toks = [];
  const n = text.length;
  let i = 0;
  while (i < n) {
    const ch = text[i];
    // whitespace
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r' || ch === '\f') { i++; continue; }
    // comments
    if (ch === '-' && text[i + 1] === '-') {
      while (i < n && text[i] !== '\n') i++;
      continue;
    }
    if (ch === '/' && text[i + 1] === '*') {
      let depth = 1;
      i += 2;
      while (i < n && depth > 0) {
        if (text[i] === '/' && text[i + 1] === '*') { depth++; i += 2; }
        else if (text[i] === '*' && text[i + 1] === '/') { depth--; i += 2; }
        else i++;
      }
      continue;
    }
    const s = i;
    // strings: '...' (with '' escape), E'...' (backslash escapes)
    if (ch === "'" || ((ch === 'E' || ch === 'e') && text[i + 1] === "'")) {
      const escape = ch !== "'";
      i += escape ? 2 : 1;
      let body = '';
      while (i < n) {
        if (escape && text[i] === '\\' && i + 1 < n) { body += text[i + 1]; i += 2; continue; }
        if (text[i] === "'") {
          if (text[i + 1] === "'") { body += "'"; i += 2; continue; }
          i++;
          break;
        }
        body += text[i++];
      }
      toks.push({ k: 'str', v: body, s, e: i });
      continue;
    }
    // quoted identifier
    if (ch === '"') {
      i++;
      let body = '';
      while (i < n) {
        if (text[i] === '"') {
          if (text[i + 1] === '"') { body += '"'; i += 2; continue; }
          i++;
          break;
        }
        body += text[i++];
      }
      toks.push({ k: 'qid', v: body, s, e: i });
      continue;
    }
    // positional parameter $1 / dollar-quoted string $$...$$ or $tag$...$tag$
    if (ch === '$') {
      // "$" glued to a scanner placeholder (JS source: dollar sign followed by an interpolation): a positional
      // parameter whose index is computed at runtime
      const pm = /^__\$DYN_\d+\$__/.exec(text.slice(i + 1, i + 24));
      if (pm) {
        i += 1 + pm[0].length;
        toks.push({ k: 'param', v: text.slice(s, i), s, e: i, dynParam: true });
        continue;
      }
      if (isDigit(text[i + 1] || '')) {
        i++;
        while (i < n && isDigit(text[i])) i++;
        toks.push({ k: 'param', v: text.slice(s, i), s, e: i });
        continue;
      }
      const m = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(text.slice(i, i + 64));
      if (m) {
        const tag = m[0];
        const close = text.indexOf(tag, i + tag.length);
        const end = close === -1 ? n : close + tag.length;
        toks.push({ k: 'str', v: text.slice(i + tag.length, close === -1 ? n : close), s, e: end, dollar: true });
        i = end;
        continue;
      }
    }
    // numbers
    if (isDigit(ch)) {
      i++;
      while (i < n && (isDigit(text[i]) || (text[i] === '.' && isDigit(text[i + 1] || '')))) i++;
      if ((text[i] === 'e' || text[i] === 'E') && /[0-9+-]/.test(text[i + 1] || '')) {
        i += 2;
        while (i < n && isDigit(text[i])) i++;
      }
      toks.push({ k: 'num', v: text.slice(s, i), s, e: i });
      continue;
    }
    // words
    if (isWordStart(ch)) {
      i++;
      while (i < n && isWordChar(text[i])) i++;
      const v = text.slice(s, i);
      const tok = { k: 'word', v, u: v.toUpperCase(), s, e: i };
      const dm = DYN_RE.exec(v);
      if (dm) tok.dyn = Number(dm[1]);
      toks.push(tok);
      continue;
    }
    // punctuation
    if (ch === '(') { toks.push({ k: 'lp', v: ch, s, e: ++i }); continue; }
    if (ch === ')') { toks.push({ k: 'rp', v: ch, s, e: ++i }); continue; }
    if (ch === '[') { toks.push({ k: 'lb', v: ch, s, e: ++i }); continue; }
    if (ch === ']') { toks.push({ k: 'rb', v: ch, s, e: ++i }); continue; }
    if (ch === ',') { toks.push({ k: 'comma', v: ch, s, e: ++i }); continue; }
    if (ch === ';') { toks.push({ k: 'semi', v: ch, s, e: ++i }); continue; }
    if (ch === '.') { toks.push({ k: 'dot', v: ch, s, e: ++i }); continue; }
    // operators (longest run of operator chars; '::' is its own token)
    if (ch === ':' && text[i + 1] === ':') { i += 2; toks.push({ k: 'op', v: '::', s, e: i }); continue; }
    if (OP_CHARS.includes(ch)) {
      i++;
      while (i < n && OP_CHARS.includes(text[i]) && !(text[i] === ':' && text[i + 1] === ':')) {
        // a trailing '-' or '+' after another operator char starts a new operand sign; keep simple: stop before them
        if ((text[i] === '-' || text[i] === '+') && i > s + 0 && !'-+'.includes(text[i - 1])) break;
        i++;
      }
      toks.push({ k: 'op', v: text.slice(s, i), s, e: i });
      continue;
    }
    // unknown character: skip it (never throws on odd input)
    i++;
  }
  return toks;
}

/**
 * Nest tokens into a tree. Parenthesised / bracketed runs become
 *   { g: '(' | '[', open, close, items, s, e }
 * Unbalanced input is tolerated (an unclosed group ends at end of input, a stray closer is dropped).
 */
function buildTree(tokens) {
  const root = [];
  const stack = [{ items: root }];
  for (const t of tokens) {
    const top = stack[stack.length - 1];
    if (t.k === 'lp' || t.k === 'lb') {
      const g = { g: t.k === 'lp' ? '(' : '[', open: t, close: null, items: [], s: t.s, e: t.e };
      top.items.push(g);
      stack.push(g);
    } else if (t.k === 'rp' || t.k === 'rb') {
      if (stack.length > 1) {
        const g = stack.pop();
        g.close = t;
        g.e = t.e;
      }
    } else {
      top.items.push(t);
    }
  }
  // unclosed groups: end at last token
  for (let i = stack.length - 1; i > 0; i--) {
    const g = stack[i];
    const last = g.items[g.items.length - 1];
    g.e = last ? (last.e || last.s) : g.e;
  }
  return root;
}

/** Split a flat item list on top-level statement terminators (`;`). Empty statements are dropped. */
function splitStatements(items) {
  const out = [];
  let cur = [];
  for (const it of items) {
    if (it.k === 'semi') {
      if (cur.length) out.push(cur);
      cur = [];
    } else cur.push(it);
  }
  if (cur.length) out.push(cur);
  return out;
}

/** Split items on top-level commas. */
function splitCommas(items) {
  const out = [];
  let cur = [];
  for (const it of items) {
    if (it.k === 'comma') { out.push(cur); cur = []; }
    else cur.push(it);
  }
  out.push(cur);
  return out.filter((p) => p.length > 0);
}

/** Start / end offsets of an item (token or group) or a list of items. */
const itemStart = (it) => (it.g ? it.s : it.s);
const itemEnd = (it) => (it.g ? it.e : it.e);
function rangeOf(items) {
  if (!items.length) return null;
  return [itemStart(items[0]), itemEnd(items[items.length - 1])];
}

/** Normalise an identifier token: unquoted -> lower case; quoted -> exact. */
function identName(tok) {
  return tok.k === 'qid' ? tok.v : tok.v.toLowerCase();
}

const isWord = (it, ...upper) => !!it && it.k === 'word' && !it.dyn && (upper.length === 0 || upper.includes(it.u));
const isIdent = (it) => !!it && (it.k === 'qid' || (it.k === 'word' && !it.dyn));

module.exports = {
  DYN_RE, dynMarker,
  tokenize, buildTree, splitStatements, splitCommas, rangeOf, identName, isWord, isIdent,
};
