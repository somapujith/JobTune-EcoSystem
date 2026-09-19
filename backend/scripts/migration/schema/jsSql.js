'use strict';

/**
 * jsSql.js - find the SQL text inside a JavaScript source file using a real parser (@babel/parser).
 *
 * Nothing is executed. String literals and template literals are resolved statically:
 *   - `${CONST}` / identifiers bound to a const (or a let built up with `+=`) are substituted,
 *   - `for (const [col, def] of ARRAY)` loops over a literal array are expanded (needed for the boot DDL
 *     `ALTER TABLE resumes ADD COLUMN IF NOT EXISTS ${col} ${def}`),
 *   - conditional expressions yield one alternative per branch (capped),
 *   - anything else becomes a placeholder token (sqlTokens.dynMarker) and is reported as a dynamic fragment.
 * Comments are never SQL: a real parser does not see them, unlike a regex scan.
 *
 * scanSource(source, { file, mode }) -> { sites, unresolved, errors }
 *   mode 'sql'  : arguments of `.query(...)` calls (resolved through identifiers) plus free-standing string
 *                 literals that look like a complete DML statement (heuristic, flagged kind:'literal').
 *   mode 'ddl'  : every string / template literal whose text contains CREATE TABLE / CREATE INDEX /
 *                 ALTER TABLE / INSERT INTO (used for the Express boot DDL sources).
 *   site: { kind:'query'|'literal', line, alt: { text, lineAt(offset), dyns:[{id,expr,line}] } }   (one per alternative)
 */

const { dynMarker } = require('./sqlTokens');

let parser;
function loadParser() {
  if (parser) return parser;
  try {
    // Not a direct dependency of backend/package.json: it comes with jest (babel-jest / @babel/core).
    parser = require('@babel/parser');
  } catch (e) {
    const err = new Error('cannot load @babel/parser (installed transitively by jest). ' +
      'Run this from a checkout where backend/node_modules exists; do not npm-install it ad hoc.');
    err.code = 'NO_BABEL_PARSER';
    throw err;
  }
  return parser;
}

const MAX_ALTS = 16;
const MAX_DEPTH = 8;

const SKIP_KEYS = new Set([
  'loc', 'start', 'end', 'extra', 'leadingComments', 'trailingComments', 'innerComments', 'range', 'comments', 'tokens',
]);

function isNode(x) { return x && typeof x === 'object' && typeof x.type === 'string'; }

function childNodes(node) {
  const out = [];
  for (const key of Object.keys(node)) {
    if (SKIP_KEYS.has(key)) continue;
    const v = node[key];
    if (Array.isArray(v)) { for (const c of v) if (isNode(c)) out.push(c); }
    else if (isNode(v)) out.push(v);
  }
  return out;
}

const FUNCTION_TYPES = new Set([
  'FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression', 'ObjectMethod', 'ClassMethod', 'ClassPrivateMethod',
]);

function patternNames(p, out = []) {
  if (!p) return out;
  switch (p.type) {
    case 'Identifier': out.push(p.name); break;
    case 'AssignmentPattern': patternNames(p.left, out); break;
    case 'RestElement': patternNames(p.argument, out); break;
    case 'ArrayPattern': p.elements.forEach((e) => patternNames(e, out)); break;
    case 'ObjectPattern': p.properties.forEach((pr) => patternNames(pr.type === 'RestElement' ? pr.argument : pr.value, out)); break;
    case 'TSParameterProperty': patternNames(p.parameter, out); break;
    default: break;
  }
  return out;
}

/** Text as it would appear at runtime; falls back to raw when the cooked value is invalid. */
const quasiText = (q) => (q.value.cooked != null ? q.value.cooked : q.value.raw);

function buildAlt(segs, dyns) {
  const starts = [];
  let text = '';
  for (const s of segs) { starts.push(text.length); text += s.text; }
  const lineAt = (off) => {
    // last segment whose start <= off
    let lo = 0;
    let hi = segs.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= off) lo = mid; else hi = mid - 1;
    }
    const seg = segs[lo];
    if (!seg) return 0;
    const rel = Math.max(0, off - starts[lo]);
    let nl = 0;
    for (let i = 0; i < rel && i < seg.text.length; i++) if (seg.text.charCodeAt(i) === 10) nl++;
    return seg.line + nl;
  };
  return { text, lineAt, dyns };
}

function scanSource(source, { file = '<memory>', mode = 'sql' } = {}) {
  const babel = loadParser();
  const errors = [];
  let ast;
  try {
    ast = babel.parse(source, {
      sourceType: 'unambiguous',
      allowReturnOutsideFunction: true,
      allowAwaitOutsideFunction: true,
      allowImportExportEverywhere: true,
      errorRecovery: true,
      plugins: ['jsx'],
    });
  } catch (e) {
    return { sites: [], unresolved: [], errors: [`${file}: parse error: ${e.message}`] };
  }
  if (ast.errors && ast.errors.length) {
    for (const e of ast.errors.slice(0, 3)) errors.push(`${file}: recoverable parse error: ${e.message}`);
  }

  const consumed = new Set();
  const visitedLiterals = [];
  const sites = [];
  const unresolved = [];
  let dynCounter = 0;
  const srcOf = (node) => source.slice(node.start, node.end).replace(/\s+/g, ' ').slice(0, 160);

  /* ---- alternatives algebra ------------------------------------------------------------------ */
  const lit = (text, line) => [{ segs: [{ text, line }], dyns: [] }];
  const dyn = (node, line) => {
    const id = dynCounter++;
    return [{ segs: [{ text: dynMarker(id), line }], dyns: [{ id, expr: srcOf(node), line }] }];
  };
  const concat = (a, b) => {
    const out = [];
    for (const x of a) {
      for (const y of b) {
        out.push({ segs: x.segs.concat(y.segs), dyns: x.dyns.concat(y.dyns) });
        if (out.length >= MAX_ALTS) return out;
      }
    }
    return out;
  };

  /* ---- scope handling ------------------------------------------------------------------------ */
  // scopes: array (innermost last) of Map(name -> { opaque } | { kind, init, appends })
  function collectDecls(stmts, scopeMap) {
    const letNames = new Set();
    const arrayNames = new Set();
    for (const st of stmts) {
      if (st && st.type === 'VariableDeclaration') {
        for (const d of st.declarations) {
          if (d.id && d.id.type === 'Identifier') {
            scopeMap.set(d.id.name, { kind: st.kind, init: d.init || null, appends: [], pushes: [] });
            if (st.kind !== 'const') letNames.add(d.id.name);
            if (d.init && d.init.type === 'ArrayExpression') arrayNames.add(d.id.name);
          } else {
            for (const nm of patternNames(d.id)) scopeMap.set(nm, { opaque: true });
          }
        }
      } else if (st && (st.type === 'FunctionDeclaration' || st.type === 'ClassDeclaration') && st.id) {
        scopeMap.set(st.id.name, { opaque: true });
      }
    }
    if (letNames.size || arrayNames.size) {
      // gather `name += expr` / `name = expr` assignments and `arr.push(expr, ...)` calls anywhere below this block
      const visit = (n) => {
        if (n.type === 'AssignmentExpression' && n.left.type === 'Identifier' && letNames.has(n.left.name)
          && (n.operator === '+=' || n.operator === '=')) {
          scopeMap.get(n.left.name).appends.push({ op: n.operator, right: n.right });
        } else if (n.type === 'CallExpression' && n.callee.type === 'MemberExpression' && !n.callee.computed
          && n.callee.property.name === 'push' && n.callee.object.type === 'Identifier' && arrayNames.has(n.callee.object.name)) {
          scopeMap.get(n.callee.object.name).pushes.push(...n.arguments);
        }
        for (const c of childNodes(n)) visit(c);
      };
      for (const st of stmts) if (st) visit(st);
    }
  }

  function lookup(name, ctx) {
    if (ctx.env && ctx.env.has(name)) return { env: ctx.env.get(name) };
    for (let i = ctx.scopes.length - 1; i >= 0; i--) {
      const e = ctx.scopes[i].get(name);
      if (e) return e;
    }
    return null;
  }

  /* ---- static resolution --------------------------------------------------------------------- */
  function resolveExpr(node, ctx, depth = 0) {
    if (!node || depth > MAX_DEPTH) return null;
    switch (node.type) {
      case 'StringLiteral':
        consumed.add(node);
        return lit(node.value, node.loc.start.line);
      case 'TemplateLiteral': {
        consumed.add(node);
        let alts = lit(quasiText(node.quasis[0]), node.quasis[0].loc.start.line);
        for (let i = 0; i < node.expressions.length; i++) {
          const ex = node.expressions[i];
          const r = resolveExpr(ex, ctx, depth + 1) || dyn(ex, ex.loc.start.line);
          alts = concat(alts, r);
          const q = node.quasis[i + 1];
          alts = concat(alts, lit(quasiText(q), q.loc.start.line));
        }
        return alts;
      }
      case 'BinaryExpression': {
        if (node.operator !== '+') return null;
        const l = resolveExpr(node.left, ctx, depth + 1);
        const r = resolveExpr(node.right, ctx, depth + 1);
        if (!l && !r) return null;
        return concat(l || dyn(node.left, node.left.loc.start.line), r || dyn(node.right, node.right.loc.start.line));
      }
      case 'ConditionalExpression': {
        const a = resolveExpr(node.consequent, ctx, depth + 1) || dyn(node.consequent, node.consequent.loc.start.line);
        const b = resolveExpr(node.alternate, ctx, depth + 1) || dyn(node.alternate, node.alternate.loc.start.line);
        return a.concat(b).slice(0, MAX_ALTS);
      }
      case 'LogicalExpression': {
        const a = resolveExpr(node.left, ctx, depth + 1);
        const b = resolveExpr(node.right, ctx, depth + 1);
        if (!a && !b) return null;
        return (a || dyn(node.left, node.left.loc.start.line)).concat(b || dyn(node.right, node.right.loc.start.line)).slice(0, MAX_ALTS);
      }
      case 'ParenthesizedExpression':
      case 'TSAsExpression':
      case 'TSNonNullExpression':
        return resolveExpr(node.expression, ctx, depth + 1);
      case 'Identifier': {
        const e = lookup(node.name, ctx);
        if (!e || e.opaque) return null;
        if (e.env !== undefined) return lit(e.env.text, e.env.line);
        if (!e.init && !e.appends.length) return null;
        let alts = e.init ? resolveExpr(e.init, ctx, depth + 1) : null;
        for (const ap of e.appends) {
          const r = resolveExpr(ap.right, ctx, depth + 1) || dyn(ap.right, ap.right.loc.start.line);
          if (ap.op === '+=') {
            alts = concat(alts || [{ segs: [], dyns: [] }], r);
          } else {
            alts = (alts || []).concat(r).slice(0, MAX_ALTS);
          }
        }
        return alts;
      }
      case 'MemberExpression': {
        // CONST.key / CONST['key'] where CONST is a const object literal
        if (node.object.type !== 'Identifier') return null;
        const e = lookup(node.object.name, ctx);
        if (!e || e.opaque || e.env !== undefined || !e.init || e.init.type !== 'ObjectExpression') return null;
        const key = node.computed ? (node.property.type === 'StringLiteral' ? node.property.value : null) : node.property.name;
        if (key == null) {
          if (!node.computed) return null;
          // obj[dynamicKey]: any of the object's static values may be selected
          let all = [];
          for (const p of e.init.properties) {
            if (p.type !== 'ObjectProperty') continue;
            const r = resolveExpr(p.value, ctx, depth + 1);
            if (r) all = all.concat(r);
          }
          return all.length ? all.slice(0, MAX_ALTS) : null;
        }
        const prop = e.init.properties.find((p) => p.type === 'ObjectProperty' && !p.computed
          && ((p.key.type === 'Identifier' && p.key.name === key) || (p.key.type === 'StringLiteral' && p.key.value === key)));
        return prop ? resolveExpr(prop.value, ctx, depth + 1) : null;
      }
      case 'CallExpression': {
        const cal = node.callee;
        if (cal.type !== 'MemberExpression' || cal.computed || cal.property.type !== 'Identifier') return null;
        const name = cal.property.name;
        if (name === 'trim' || name === 'trimEnd' || name === 'trimStart') return resolveExpr(cal.object, ctx, depth + 1);
        if (name === 'join') {
          let elements = null;
          if (cal.object.type === 'ArrayExpression') elements = cal.object.elements;
          else if (cal.object.type === 'Identifier') {
            const e = lookup(cal.object.name, ctx);
            if (e && !e.opaque && e.env === undefined && e.init && e.init.type === 'ArrayExpression') {
              elements = e.init.elements.concat(e.pushes || []);
            }
          }
          if (!elements) return null;
          const sepAlts = node.arguments[0] ? resolveExpr(node.arguments[0], ctx, depth + 1) : lit(',', node.loc.start.line);
          if (!sepAlts) return null;
          let alts = lit('', node.loc.start.line);
          elements.forEach((el, idx) => {
            if (!el) return;
            const r = resolveExpr(el, ctx, depth + 1) || dyn(el, el.loc.start.line);
            if (idx > 0) alts = concat(alts, sepAlts);
            alts = concat(alts, r);
          });
          return alts;
        }
        return null;
      }
      default:
        return null;
    }
  }

  /* ---- for..of expansion over a literal array ------------------------------------------------ */
  function staticText(node, ctx) {
    const alts = resolveExpr(node, ctx, 0);
    if (!alts || alts.length !== 1) return null;
    if (alts[0].dyns.length) return null;
    return { text: alts[0].segs.map((s) => s.text).join(''), line: node.loc.start.line };
  }

  function expandForOf(node, ctx) {
    let arr = node.right;
    if (arr.type === 'Identifier') {
      const e = lookup(arr.name, ctx);
      arr = e && !e.opaque && e.init ? e.init : null;
    }
    if (!arr || arr.type !== 'ArrayExpression') return null;
    const left = node.left.type === 'VariableDeclaration' ? node.left.declarations[0] && node.left.declarations[0].id : node.left;
    if (!left) return null;
    const rows = [];
    for (const el of arr.elements) {
      if (!el) return null;
      const b = new Map();
      if (left.type === 'Identifier') {
        const t = staticText(el, ctx);
        if (!t) return null;
        b.set(left.name, t);
      } else if (left.type === 'ArrayPattern' && el.type === 'ArrayExpression') {
        for (let i = 0; i < left.elements.length; i++) {
          const pe = left.elements[i];
          if (!pe) continue;
          if (pe.type !== 'Identifier') return null;
          const t = el.elements[i] ? staticText(el.elements[i], ctx) : null;
          if (!t) return null;
          b.set(pe.name, t);
        }
      } else return null;
      rows.push(b);
    }
    return rows;
  }

  /* ---- the walk ------------------------------------------------------------------------------ */
  function isQueryCall(node) {
    const c = node.callee;
    return c && (c.type === 'MemberExpression' || c.type === 'OptionalMemberExpression')
      && !c.computed && c.property.type === 'Identifier' && c.property.name === 'query';
  }

  function walk(node, ctx) {
    if (!node) return;
    let scopes = ctx.scopes;

    // new scopes
    if (node.type === 'Program' || node.type === 'BlockStatement' || node.type === 'StaticBlock') {
      const m = new Map();
      collectDecls(node.body, m);
      scopes = scopes.concat([m]);
    } else if (node.type === 'SwitchStatement') {
      const m = new Map();
      for (const cs of node.cases) collectDecls(cs.consequent, m);
      scopes = scopes.concat([m]);
    } else if (FUNCTION_TYPES.has(node.type)) {
      const m = new Map();
      for (const p of node.params) for (const nm of patternNames(p)) m.set(nm, { opaque: true });
      if (node.id && node.type === 'FunctionExpression') m.set(node.id.name, { opaque: true });
      scopes = scopes.concat([m]);
    } else if (node.type === 'CatchClause') {
      const m = new Map();
      for (const nm of patternNames(node.param)) m.set(nm, { opaque: true });
      scopes = scopes.concat([m]);
    }
    // a try/catch does not protect code inside a nested function body
    const c2 = scopes === ctx.scopes ? ctx : { scopes, env: ctx.env, inTry: FUNCTION_TYPES.has(node.type) ? false : ctx.inTry };

    if (node.type === 'ForOfStatement' || node.type === 'ForInStatement') {
      const rows = node.type === 'ForOfStatement' ? expandForOf(node, c2) : null;
      walk(node.right, c2);
      if (rows) {
        for (const b of rows) {
          const env = new Map(c2.env || []);
          for (const [k, v] of b) env.set(k, v);
          walk(node.body, { scopes: c2.scopes, env, inTry: c2.inTry });
        }
        return;
      }
      // not expandable: loop variables are opaque
      const m = new Map();
      if (node.left.type === 'VariableDeclaration') for (const d of node.left.declarations) for (const nm of patternNames(d.id)) m.set(nm, { opaque: true });
      walk(node.body, { scopes: c2.scopes.concat([m]), env: c2.env, inTry: c2.inTry });
      return;
    }

    if ((node.type === 'CallExpression' || node.type === 'OptionalCallExpression') && isQueryCall(node) && node.arguments.length) {
      const arg = node.arguments[0];
      if (arg.type !== 'SpreadElement') {
        const alts = resolveExpr(arg, c2);
        if (alts) sites.push({ kind: 'query', line: node.loc.start.line, alts, inTry: !!c2.inTry });
        else unresolved.push({ line: node.loc.start.line, expr: srcOf(arg) });
      }
    }

    if (node.type === 'StringLiteral' || node.type === 'TemplateLiteral') {
      if (!consumed.has(node)) visitedLiterals.push({ node, ctx: c2 });
    }

    if (node.type === 'TryStatement') {
      // statements inside the try block are error-tolerant when the catch handler swallows the error
      walk(node.block, { scopes: c2.scopes, env: c2.env, inTry: !!node.handler });
      if (node.handler) walk(node.handler, c2);
      if (node.finalizer) walk(node.finalizer, c2);
      return;
    }

    for (const ch of childNodes(node)) walk(ch, c2);
  }

  walk(ast.program, { scopes: [], env: null, inTry: false });

  // free-standing literals (second pass so `consumed` is complete)
  const looksLikeDml = (t) => /^\s*(?:SELECT\b[\s\S]*?\bFROM\b|INSERT\s+INTO\s+\S|UPDATE\s+\S+\s+SET\b|DELETE\s+FROM\s+\S|WITH\s+(?:RECURSIVE\s+)?\S+\s+AS\s*\()/.test(t);
  const looksLikeDdl = (t) => /\b(?:CREATE\s+(?:UNIQUE\s+)?(?:TABLE|INDEX)|ALTER\s+TABLE|INSERT\s+INTO)\b/i.test(t);
  const seen = new Set();
  const consumedBefore = new Set(consumed);
  for (const { node, ctx } of visitedLiterals) {
    if (consumedBefore.has(node)) continue; // resolved as part of another expression
    const alts = resolveExpr(node, ctx);
    if (!alts) continue;
    for (const a of alts) {
      const text = a.segs.map((s) => s.text).join('');
      if (mode === 'ddl' ? !looksLikeDdl(text) : !looksLikeDml(text)) continue;
      const key = `${node.start}:${text}`;
      if (seen.has(key)) continue;
      seen.add(key);
      sites.push({ kind: 'literal', line: node.loc.start.line, alts: [a], inTry: !!ctx.inTry });
    }
  }

  // flatten alternatives into one site each
  const flat = [];
  for (const s of sites) {
    for (const a of s.alts) {
      const built = buildAlt(a.segs, a.dyns);
      flat.push({ kind: s.kind, line: s.line, alt: built, inTry: s.inTry });
    }
  }
  if (mode === 'ddl') {
    // in ddl mode only keep statements that actually contain DDL / seeds
    const keep = flat.filter((f) => looksLikeDdl(f.alt.text));
    keep.sort((a, b) => a.line - b.line);
    return { sites: dedupe(keep), unresolved, errors };
  }
  flat.sort((a, b) => a.line - b.line || (a.kind < b.kind ? -1 : 1));
  return { sites: dedupe(flat), unresolved, errors };
}

function dedupe(list) {
  const seen = new Set();
  const out = [];
  for (const s of list) {
    const k = `${s.kind}|${s.line}|${s.alt.text}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(s);
  }
  return out;
}

module.exports = { scanSource, loadParser };
