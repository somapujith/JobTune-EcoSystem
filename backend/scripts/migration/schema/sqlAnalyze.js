'use strict';

/**
 * sqlAnalyze.js - static extraction of table and column references from PostgreSQL DML text.
 *
 * Not a full SQL parser: a tolerant, scope-aware walker over the token tree from sqlTokens.js. It is
 * deliberately conservative about what it calls a column:
 *   certain   INSERT column lists, UPDATE/ON CONFLICT DO UPDATE SET targets, ON CONFLICT target columns,
 *             and `alias.column` where alias resolves to a real table in scope
 *   inferred  an unqualified identifier in a scope whose FROM has exactly one real table
 *   ambiguous an unqualified identifier in a scope with several tables (candidates listed), never asserted
 * Identifiers that are keywords, function names, cast types, select-list output aliases, CTE / sub-select /
 * function-table aliases or whole-row alias references are not reported.
 *
 * analyzeSql(text, lineAt) ->
 *   { tables:[{name,use,line,system}], columns:[{table,column,confidence,use,line}],
 *     ambiguous:[{candidates,hasOther,column,use,line}], conflicts:[{table,columns,constraint,exprTarget,where,action,line}],
 *     dynamics:[{kind,id,line}], ddl:[{kind,line}], statements:[kind] }
 */

const {
  tokenize, buildTree, splitStatements, splitCommas, identName, isWord, isIdent,
} = require('./sqlTokens');

/** Words that can never be a column reference inside an expression. Deliberately excludes non-reserved
 *  words that are plausible column names (status, name, type, data, role, key, value, current, count ...). */
const RESERVED = new Set([
  'AND', 'OR', 'NOT', 'NULL', 'IS', 'IN', 'LIKE', 'ILIKE', 'SIMILAR', 'BETWEEN', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END', 'AS',
  'ON', 'USING', 'ASC', 'DESC', 'NULLS', 'TRUE', 'FALSE', 'DISTINCT', 'ALL', 'ANY', 'SOME', 'EXISTS', 'ARRAY', 'ROW', 'INTERVAL',
  'CURRENT_DATE', 'CURRENT_TIME', 'CURRENT_TIMESTAMP', 'LOCALTIME', 'LOCALTIMESTAMP', 'CURRENT_USER', 'SESSION_USER',
  'FILTER', 'OVER', 'PARTITION', 'BY', 'ROWS', 'RANGE', 'UNBOUNDED', 'PRECEDING', 'FOLLOWING', 'WITHIN', 'GROUP', 'ORDER',
  'FROM', 'FOR', 'ESCAPE', 'TO', 'COLLATE', 'CAST', 'DEFAULT', 'VALUES', 'SELECT', 'WHERE', 'HAVING', 'LIMIT', 'OFFSET',
  'FETCH', 'ONLY', 'UNION', 'INTERSECT', 'EXCEPT', 'JOIN', 'INNER', 'LEFT', 'RIGHT', 'FULL', 'OUTER', 'CROSS', 'NATURAL',
  'LATERAL', 'ISNULL', 'NOTNULL', 'OVERLAPS', 'SET', 'RETURNING', 'DO', 'NOTHING', 'CONFLICT', 'CONSTRAINT', 'WITH',
  'RECURSIVE', 'MATERIALIZED', 'LEADING', 'TRAILING', 'BOTH', 'SYMMETRIC', 'ASYMMETRIC', 'PRECISION', 'VARYING', 'UPDATE',
  'INSERT', 'DELETE', 'INTO', 'UNKNOWN', 'AT', 'ZONE',
]);

/** Words after which a following string literal makes them a typed literal (INTERVAL '1 day', DATE '2020-01-01'). */
const TYPED_LITERAL = new Set(['INTERVAL', 'DATE', 'TIME', 'TIMESTAMP', 'TIMESTAMPTZ', 'TIMETZ']);

const SELECT_CLAUSES = new Set(['SELECT', 'FROM', 'WHERE', 'GROUP', 'HAVING', 'WINDOW', 'ORDER', 'LIMIT', 'OFFSET', 'FETCH', 'FOR', 'RETURNING']);
const UPDATE_CLAUSES = new Set(['SET', 'FROM', 'WHERE', 'RETURNING']);
const DELETE_CLAUSES = new Set(['USING', 'WHERE', 'RETURNING']);

const FROM_STOP = new Set([
  'JOIN', 'INNER', 'LEFT', 'RIGHT', 'FULL', 'OUTER', 'CROSS', 'NATURAL', 'LATERAL', 'ON', 'USING', 'WHERE', 'GROUP', 'ORDER',
  'HAVING', 'LIMIT', 'OFFSET', 'WINDOW', 'FETCH', 'FOR', 'RETURNING', 'SET', 'UNION', 'INTERSECT', 'EXCEPT', 'TABLESAMPLE',
  'WITH', 'ORDINALITY',
]);
const JOIN_WORDS = new Set(['JOIN', 'INNER', 'LEFT', 'RIGHT', 'FULL', 'OUTER', 'CROSS', 'NATURAL', 'LATERAL']);

/* ------------------------------------------------------------------------------------------------ */
/* scope + accumulator                                                                               */
/* ------------------------------------------------------------------------------------------------ */

class Scope {
  constructor(parent) {
    this.parent = parent || null;
    this.aliases = new Map(); // lower-case name -> { table } (real table) | { other: 'cte'|'subquery'|'function' }
    this.realTables = [];
    this.hasOther = false;
    this.outAliases = new Set();
    this.ctes = new Set(parent ? parent.ctes : []);
  }

  child() { return new Scope(this); }

  addTable(alias, table, { hidden = false } = {}) {
    this.aliases.set(String(alias).toLowerCase(), { table });
    if (!hidden && !this.realTables.includes(table)) this.realTables.push(table);
  }

  addOther(alias, what) {
    this.hasOther = true;
    if (alias) this.aliases.set(String(alias).toLowerCase(), { other: what });
  }

  lookup(name) {
    const k = String(name).toLowerCase();
    for (let s = this; s; s = s.parent) {
      const e = s.aliases.get(k);
      if (e) return e;
    }
    return null;
  }
}

class Acc {
  constructor(lineAt) {
    this.lineAt = lineAt || (() => 0);
    this.tables = [];
    this.columns = [];
    this.ambiguous = [];
    this.conflicts = [];
    this.dynamics = [];
    this.ddl = [];
    this.statements = [];
  }

  line(tok) { return this.lineAt(tok.s); }

  table(name, use, tok) {
    const system = /^(information_schema|pg_catalog)\./.test(name) || /^pg_/.test(name);
    this.tables.push({ name, use, line: this.line(tok), system });
  }

  column(table, column, confidence, use, tok) {
    this.columns.push({ table, column, confidence, use, line: this.line(tok) });
  }
}

/** [schema.]name -> canonical table name ('public.' dropped, unquoted lower-cased). */
function canonicalTable(parts) {
  const names = parts.map(identName);
  if (names.length >= 2 && names[names.length - 2] === 'public') return names[names.length - 1];
  return names.join('.');
}

/** Read `a[.b[.c]]` starting at index i. Returns { parts, next, tok } */
function readQualified(items, i) {
  const parts = [];
  if (!isIdent(items[i])) return null;
  parts.push(items[i]);
  let j = i + 1;
  while (items[j] && items[j].k === 'dot' && isIdent(items[j + 1])) {
    parts.push(items[j + 1]);
    j += 2;
  }
  return { parts, next: j, tok: parts[parts.length - 1] };
}

const isGroup = (it, kind) => !!it && !!it.g && (!kind || it.g === kind);

function isSubqueryGroup(g) {
  if (!isGroup(g, '(')) return false;
  const f = g.items[0];
  if (!f) return false;
  if (isWord(f, 'SELECT', 'WITH', 'VALUES', 'TABLE')) return true;
  if (isGroup(f, '(') && g.items.length === 1) return isSubqueryGroup(f);
  return false;
}

/** Split into clauses on top-level keywords (see comments for the special cases). */
function splitClauses(items, kwSet) {
  const out = [];
  let cur = { kw: null, items: [], tok: null };
  out.push(cur);
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (it.k === 'word' && !it.dyn && kwSet.has(it.u)) {
      let kw = it.u;
      let skip = 0;
      const nxt = items[i + 1];
      if (kw === 'GROUP' || kw === 'ORDER') {
        if (isWord(nxt, 'BY')) { kw += ' BY'; skip = 1; } else { cur.items.push(it); continue; }
      } else if (kw === 'FROM') {
        if (isWord(items[i - 1], 'DISTINCT')) { cur.items.push(it); continue; } // IS [NOT] DISTINCT FROM
      } else if (kw === 'FOR') {
        if (!isWord(nxt, 'UPDATE', 'SHARE', 'NO', 'KEY')) { cur.items.push(it); continue; }
      }
      cur = { kw, items: [], tok: it };
      out.push(cur);
      i += skip;
      continue;
    }
    cur.items.push(it);
  }
  return out;
}

/* ------------------------------------------------------------------------------------------------ */
/* statements                                                                                        */
/* ------------------------------------------------------------------------------------------------ */

function analyzeStatement(items, scope, A) {
  if (!items.length) return;
  const first = items[0];
  if (items.length === 1 && isGroup(first, '(')) return analyzeStatement(first.items, scope, A);
  if (first.k !== 'word' || first.dyn) {
    if (isGroup(first, '(')) return analyzeSelectChain(items, scope, A);
    return undefined;
  }
  A.statements.push(first.u);
  switch (first.u) {
    case 'WITH': return analyzeWith(items, scope, A);
    case 'SELECT': case 'VALUES': case 'TABLE': return analyzeSelectChain(items, scope, A);
    case 'INSERT': return analyzeInsert(items, scope, A);
    case 'UPDATE': return analyzeUpdate(items, scope, A);
    case 'DELETE': return analyzeDelete(items, scope, A);
    case 'EXPLAIN': {
      const k = items.findIndex((it, i) => i > 0 && isWord(it, 'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'WITH'));
      return k > 0 ? analyzeStatement(items.slice(k), scope, A) : undefined;
    }
    case 'CREATE': case 'ALTER': case 'DROP': case 'TRUNCATE': case 'GRANT': case 'REVOKE': case 'COMMENT':
      A.ddl.push({ kind: first.u, line: A.line(first) });
      return undefined;
    default:
      return undefined; // BEGIN / COMMIT / SET / SHOW / ...
  }
}

function analyzeWith(items, scope, A) {
  let i = 1;
  if (isWord(items[i], 'RECURSIVE')) i++;
  while (i < items.length) {
    const nameTok = items[i];
    if (!isIdent(nameTok)) break;
    const name = identName(nameTok);
    i++;
    if (isGroup(items[i], '(') && !isSubqueryGroup(items[i])) i++; // column list
    if (!isWord(items[i], 'AS')) break;
    i++;
    if (isWord(items[i], 'NOT')) i++;
    if (isWord(items[i], 'MATERIALIZED')) i++;
    const body = items[i];
    scope.ctes.add(name);
    if (isGroup(body, '(')) {
      analyzeStatement(body.items, scope.child(), A);
      i++;
    }
    if (items[i] && items[i].k === 'comma') { i++; continue; }
    break;
  }
  analyzeStatement(items.slice(i), scope, A);
}

function analyzeSelectChain(items, scope, A) {
  const parts = [];
  let cur = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (isWord(it, 'UNION', 'INTERSECT', 'EXCEPT')) {
      parts.push(cur);
      cur = [];
      if (isWord(items[i + 1], 'ALL', 'DISTINCT')) i++;
    } else cur.push(it);
  }
  parts.push(cur);
  for (const part of parts) {
    if (!part.length) continue;
    if (part.length === 1 && isGroup(part[0], '(')) analyzeStatement(part[0].items, scope.child(), A);
    else analyzeSelectBlock(part, scope.child(), A);
  }
}

/** Trailing alias of a select-list item: returns { exprItems, alias } */
function stripAlias(item) {
  const n = item.length;
  if (n >= 3 && isWord(item[n - 2], 'AS') && isIdent(item[n - 1])) {
    return { exprItems: item.slice(0, n - 2), alias: identName(item[n - 1]) };
  }
  if (n >= 2 && isIdent(item[n - 1]) && !(item[n - 1].k === 'word' && RESERVED.has(item[n - 1].u))) {
    const p = item[n - 2];
    const okPrev = isGroup(p, '(') || isGroup(p, '[')
      || (p.k === 'word' && (!RESERVED.has(p.u) || ['END', 'NULL', 'TRUE', 'FALSE'].includes(p.u)))
      || p.k === 'qid' || p.k === 'str' || p.k === 'num' || p.k === 'param';
    if (okPrev) return { exprItems: item.slice(0, n - 1), alias: identName(item[n - 1]) };
  }
  return { exprItems: item, alias: null };
}

function analyzeSelectBlock(items, scope, A) {
  const clauses = splitClauses(items, SELECT_CLAUSES);
  // pass 1: FROM (builds the scope) and select-list aliases
  const ons = [];
  for (const c of clauses) {
    if (c.kw === 'FROM') ons.push(...parseFrom(c.items, scope, A, 'FROM'));
  }
  const selectExprs = [];
  for (const c of clauses) {
    if (c.kw !== 'SELECT' && c.kw !== 'RETURNING') continue;
    let its = c.items;
    if (isWord(its[0], 'DISTINCT')) {
      its = its.slice(1);
      if (isWord(its[0], 'ON') && isGroup(its[1], '(')) {
        selectExprs.push({ items: its[1].items, use: 'SELECT' });
        its = its.slice(2);
      }
    } else if (isWord(its[0], 'ALL')) its = its.slice(1);
    for (const item of splitCommas(its)) {
      const { exprItems, alias } = stripAlias(item);
      if (alias) scope.outAliases.add(alias);
      selectExprs.push({ items: exprItems, use: 'SELECT' });
    }
  }
  // pass 2: expressions
  for (const e of selectExprs) analyzeExpr(e.items, scope, A, e.use);
  for (const on of ons) analyzeExpr(on, scope, A, 'JOIN ON');
  for (const c of clauses) {
    switch (c.kw) {
      case 'WHERE': analyzeExpr(c.items, scope, A, 'WHERE'); break;
      case 'GROUP BY': analyzeExpr(c.items, scope, A, 'GROUP BY'); break;
      case 'HAVING': analyzeExpr(c.items, scope, A, 'HAVING'); break;
      case 'ORDER BY': analyzeExpr(c.items, scope, A, 'ORDER BY'); break;
      case 'LIMIT': case 'OFFSET': analyzeExpr(c.items, scope, A, 'LIMIT'); break;
      case null:
        // VALUES (...), (...)   /   TABLE t
        if (isWord(c.items[0], 'VALUES')) analyzeExpr(c.items.slice(1), scope, A, 'VALUES');
        break;
      default: break;
    }
  }
}

/**
 * Parse a FROM / USING list, registering tables and aliases into `scope`.
 * Returns the ON-condition item lists (analyzed later, once the whole scope is known).
 */
function parseFrom(items, scope, A, firstUse) {
  const ons = [];
  let use = firstUse;
  let i = 0;
  const readAlias = () => {
    let alias = null;
    if (isWord(items[i], 'AS') && isIdent(items[i + 1])) { alias = items[i + 1]; i += 2; }
    else if (isIdent(items[i]) && !(items[i].k === 'word' && (FROM_STOP.has(items[i].u) || items[i].dyn))) { alias = items[i]; i++; }
    if (isGroup(items[i], '(') && !isSubqueryGroup(items[i])) i++; // column alias list
    if (isWord(items[i], 'WITH') && isWord(items[i + 1], 'ORDINALITY')) i += 2;
    return alias ? identName(alias) : null;
  };
  while (i < items.length) {
    const it = items[i];
    if (it.k === 'comma') { i++; use = firstUse; continue; }
    if (isWord(it, 'JOIN')) { use = 'JOIN'; i++; continue; }
    if (isWord(it, ...JOIN_WORDS) || isWord(it, 'ONLY')) { i++; continue; }
    if (isWord(it, 'ON')) {
      let j = i + 1;
      while (j < items.length && !(items[j].k === 'comma' || isWord(items[j], ...JOIN_WORDS))) j++;
      ons.push(items.slice(i + 1, j));
      i = j;
      continue;
    }
    if (isWord(it, 'USING') && isGroup(items[i + 1], '(')) { i += 2; continue; }
    if (isGroup(it, '(')) {
      i++;
      if (isSubqueryGroup(it)) {
        analyzeStatement(it.items, scope.child(), A);
        scope.addOther(readAlias(), 'subquery');
      } else {
        ons.push(...parseFrom(it.items, scope, A, use));
        readAlias();
      }
      continue;
    }
    if (it.k === 'word' && it.dyn !== undefined) {
      A.dynamics.push({ kind: 'table', id: it.dyn, line: A.line(it) });
      i++;
      scope.addOther(readAlias(), 'dynamic');
      continue;
    }
    if (isIdent(it)) {
      const q = readQualified(items, i);
      i = q.next;
      if (isGroup(items[i], '(')) { // function in FROM: generate_series(...), unnest(...), jsonb_array_elements(...)
        analyzeExpr(items[i].items, scope, A, 'FROM');
        i++;
        scope.addOther(readAlias(), 'function');
        continue;
      }
      if (isWord(items[i], 'ONLY')) i++;
      const tname = canonicalTable(q.parts);
      if (q.parts.length === 1 && scope.ctes.has(tname)) {
        scope.addOther(readAlias() || tname, 'cte');
        continue;
      }
      A.table(tname, use, q.tok);
      if (items[i] && items[i].k === 'op' && items[i].v === '*') i++;
      const alias = readAlias();
      scope.addTable(alias || tname, tname);
      if (alias) scope.aliases.set(tname.toLowerCase(), scope.aliases.get(tname.toLowerCase()) || { table: tname });
      continue;
    }
    i++;
  }
  return ons;
}

function analyzeInsert(items, scope, A) {
  let i = 1;
  if (isWord(items[i], 'INTO')) i++;
  const q = readQualified(items, i);
  if (!q) {
    if (items[i] && items[i].k === 'word' && items[i].dyn !== undefined) A.dynamics.push({ kind: 'table', id: items[i].dyn, line: A.line(items[i]) });
    return;
  }
  i = q.next;
  const table = canonicalTable(q.parts);
  A.table(table, 'INTO', q.tok);
  let alias = null;
  if (isWord(items[i], 'AS') && isIdent(items[i + 1])) { alias = identName(items[i + 1]); i += 2; }
  const s = scope.child();
  s.addTable(alias || table, table);
  s.aliases.set('excluded', { table });
  if (isGroup(items[i], '(') && !isSubqueryGroup(items[i])) {
    for (const col of splitCommas(items[i].items)) {
      const t = col[0];
      if (t && t.k === 'word' && t.dyn !== undefined) A.dynamics.push({ kind: 'column', id: t.dyn, line: A.line(t) });
      else if (col.length === 1 && isIdent(t)) A.column(table, identName(t), 'certain', 'INSERT', t);
    }
    i++;
  }
  const rest = items.slice(i);
  let onIdx = -1;
  let retIdx = -1;
  for (let k = 0; k < rest.length; k++) {
    if (onIdx === -1 && isWord(rest[k], 'ON') && isWord(rest[k + 1], 'CONFLICT')) onIdx = k;
    if (retIdx === -1 && isWord(rest[k], 'RETURNING')) retIdx = k;
  }
  const bodyEnd = [onIdx, retIdx].filter((x) => x >= 0).reduce((a, b) => Math.min(a, b), rest.length);
  const body = rest.slice(0, bodyEnd);
  if (isWord(body[0], 'VALUES')) {
    analyzeExpr(body.slice(1), s, A, 'VALUES');
  } else if (body.length && !isWord(body[0], 'DEFAULT', 'OVERRIDING')) {
    analyzeStatement(body, s.child(), A);
  }
  if (onIdx >= 0) {
    const conflictEnd = retIdx > onIdx ? retIdx : rest.length;
    analyzeOnConflict(rest.slice(onIdx + 2, conflictEnd), table, s, A, rest[onIdx]);
  }
  if (retIdx >= 0) analyzeReturning(rest.slice(retIdx + 1), s, A);
}

function analyzeReturning(items, scope, A) {
  for (const item of splitCommas(items)) {
    const { exprItems, alias } = stripAlias(item);
    if (alias) scope.outAliases.add(alias);
    analyzeExpr(exprItems, scope, A, 'RETURNING');
  }
}

function analyzeOnConflict(items, table, scope, A, onTok) {
  const conflict = {
    table, columns: [], constraint: null, exprTarget: false, where: false, action: null, line: A.line(onTok),
  };
  let i = 0;
  if (isWord(items[i], 'ON') && isWord(items[i + 1], 'CONSTRAINT') && isIdent(items[i + 2])) {
    conflict.constraint = identName(items[i + 2]);
    i += 3;
  } else if (isGroup(items[i], '(')) {
    for (const col of splitCommas(items[i].items)) {
      // `col [COLLATE x] [opclass]` -> column; anything more complex is an index expression
      const t = col[0];
      if (isIdent(t) && (col.length === 1 || isWord(col[1], 'COLLATE') || (col[1] && col[1].k === 'word' && col.length === 2))) {
        const nm = identName(t);
        conflict.columns.push(nm);
        A.column(table, nm, 'certain', 'ON CONFLICT', t);
      } else conflict.exprTarget = true;
    }
    i++;
    if (isWord(items[i], 'WHERE')) {
      conflict.where = true;
      while (i < items.length && !isWord(items[i], 'DO')) i++;
    }
  }
  if (isWord(items[i], 'DO')) {
    const act = items[i + 1];
    if (isWord(act, 'NOTHING')) conflict.action = 'nothing';
    else if (isWord(act, 'UPDATE')) {
      conflict.action = 'update';
      const parts = splitClauses(items.slice(i + 2), new Set(['SET', 'WHERE']));
      for (const p of parts) {
        if (p.kw === 'SET') analyzeAssignments(p.items, table, scope, A);
        else if (p.kw === 'WHERE') analyzeExpr(p.items, scope, A, 'WHERE');
      }
    }
  }
  A.conflicts.push(conflict);
}

/** `a = expr, (b, c) = (...)`: targets are certain columns of `table`; right-hand sides are expressions. */
function analyzeAssignments(items, table, scope, A) {
  for (const asg of splitCommas(items)) {
    const eq = asg.findIndex((it) => it.k === 'op' && it.v === '=');
    if (eq <= 0) { analyzeExpr(asg, scope, A, 'SET'); continue; }
    const lhs = asg.slice(0, eq);
    const targets = [];
    if (isGroup(lhs[0], '(')) for (const c of splitCommas(lhs[0].items)) targets.push(c[0]);
    else targets.push(lhs[0]);
    for (const t of targets) {
      if (t && t.k === 'word' && t.dyn !== undefined) A.dynamics.push({ kind: 'column', id: t.dyn, line: A.line(t) });
      else if (isIdent(t)) A.column(table, identName(t), 'certain', 'SET', t);
    }
    analyzeExpr(asg.slice(eq + 1), scope, A, 'SET');
  }
}

function analyzeUpdate(items, scope, A) {
  let i = 1;
  if (isWord(items[i], 'ONLY')) i++;
  const q = readQualified(items, i);
  if (!q) {
    if (items[i] && items[i].k === 'word' && items[i].dyn !== undefined) A.dynamics.push({ kind: 'table', id: items[i].dyn, line: A.line(items[i]) });
    return;
  }
  i = q.next;
  const table = canonicalTable(q.parts);
  A.table(table, 'UPDATE', q.tok);
  let alias = null;
  if (isWord(items[i], 'AS') && isIdent(items[i + 1])) { alias = identName(items[i + 1]); i += 2; }
  else if (isIdent(items[i]) && !isWord(items[i], 'SET')) { alias = identName(items[i]); i++; }
  const s = scope.child();
  s.addTable(alias || table, table);
  const clauses = splitClauses(items.slice(i), UPDATE_CLAUSES);
  const ons = [];
  for (const c of clauses) if (c.kw === 'FROM') ons.push(...parseFrom(c.items, s, A, 'FROM'));
  for (const c of clauses) {
    if (c.kw === 'SET') analyzeAssignments(c.items, table, s, A);
    else if (c.kw === 'WHERE') analyzeExpr(c.items, s, A, 'WHERE');
    else if (c.kw === 'RETURNING') analyzeReturning(c.items, s, A);
  }
  for (const on of ons) analyzeExpr(on, s, A, 'JOIN ON');
}

function analyzeDelete(items, scope, A) {
  let i = 1;
  if (isWord(items[i], 'FROM')) i++;
  if (isWord(items[i], 'ONLY')) i++;
  const q = readQualified(items, i);
  if (!q) {
    if (items[i] && items[i].k === 'word' && items[i].dyn !== undefined) A.dynamics.push({ kind: 'table', id: items[i].dyn, line: A.line(items[i]) });
    return;
  }
  i = q.next;
  const table = canonicalTable(q.parts);
  A.table(table, 'DELETE FROM', q.tok);
  let alias = null;
  if (isWord(items[i], 'AS') && isIdent(items[i + 1])) { alias = identName(items[i + 1]); i += 2; }
  else if (isIdent(items[i]) && !isWord(items[i], 'USING', 'WHERE', 'RETURNING')) { alias = identName(items[i]); i++; }
  const s = scope.child();
  s.addTable(alias || table, table);
  const clauses = splitClauses(items.slice(i), DELETE_CLAUSES);
  const ons = [];
  for (const c of clauses) if (c.kw === 'USING') ons.push(...parseFrom(c.items, s, A, 'USING'));
  for (const c of clauses) {
    if (c.kw === 'WHERE') analyzeExpr(c.items, s, A, 'WHERE');
    else if (c.kw === 'RETURNING') analyzeReturning(c.items, s, A);
  }
  for (const on of ons) analyzeExpr(on, s, A, 'JOIN ON');
}

/* ------------------------------------------------------------------------------------------------ */
/* expressions                                                                                       */
/* ------------------------------------------------------------------------------------------------ */

function unqualified(tok, scope, A, use) {
  const name = identName(tok);
  if (scope.lookup(name)) return; // whole-row reference (row_to_json(u)) or an alias used as a value
  if (scope.outAliases.has(name) && (use === 'ORDER BY' || use === 'GROUP BY' || use === 'HAVING')) return;
  const cands = scope.realTables;
  if (cands.length === 0) return;
  if (cands.length === 1 && !scope.hasOther) {
    A.column(cands[0], name, 'inferred', use, tok);
    return;
  }
  A.ambiguous.push({ candidates: cands.slice(), hasOther: scope.hasOther, column: name, use, line: A.line(tok) });
}

function qualified(qualTok, colTok, scope, A, use) {
  const e = scope.lookup(identName(qualTok));
  if (e && e.table) A.column(e.table, identName(colTok), 'certain', use, colTok);
}

function analyzeExpr(items, scope, A, use) {
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (it.g) {
      if (isSubqueryGroup(it)) { analyzeStatement(it.items, scope.child(), A); continue; }
      const prev = items[i - 1];
      let inner = it.items;
      if (it.g === '(' && prev && prev.k === 'word') {
        if (prev.u === 'EXTRACT' || prev.u === 'DATE_PART') inner = inner.slice(1); // EXTRACT(field FROM x)
        if (prev.u === 'CAST') {
          const asAt = inner.findIndex((x) => isWord(x, 'AS'));
          if (asAt >= 0) inner = inner.slice(0, asAt);
        }
      }
      analyzeExpr(inner, scope, A, use);
      continue;
    }
    if (it.k === 'param' || it.k === 'str' || it.k === 'num') continue;
    if (it.k === 'op' && it.v === '::') {
      // cast target type: skip the type word(s) and any modifier group
      let j = i + 1;
      if (items[j] && items[j].k === 'word') {
        const w = items[j].u;
        j++;
        if ((w === 'DOUBLE' && isWord(items[j], 'PRECISION')) || (w === 'CHARACTER' && isWord(items[j], 'VARYING'))
          || (w === 'BIT' && isWord(items[j], 'VARYING'))) j++;
        if ((w === 'TIMESTAMP' || w === 'TIME') && isWord(items[j], 'WITH', 'WITHOUT') && isWord(items[j + 1], 'TIME')) j += 3;
      } else if (items[j] && items[j].k === 'qid') j++;
      i = j - 1;
      continue;
    }
    if (it.k !== 'word' && it.k !== 'qid') continue;

    if (it.k === 'word') {
      if (it.dyn !== undefined) { A.dynamics.push({ kind: 'fragment', id: it.dyn, line: A.line(it) }); continue; }
      const u = it.u;
      if (u === 'AS') { // alias / CAST type: skip the following word
        if (items[i + 1] && (items[i + 1].k === 'word' || items[i + 1].k === 'qid')) i++;
        continue;
      }
      if (u === 'AT' && isWord(items[i + 1], 'TIME') && isWord(items[i + 2], 'ZONE')) { i += 2; continue; }
      if (u === 'CURRENT' && isWord(items[i + 1], 'ROW')) { i++; continue; }
      if ((u === 'FIRST' || u === 'LAST') && isWord(items[i - 1], 'NULLS')) continue;
      if (TYPED_LITERAL.has(u) && items[i + 1] && items[i + 1].k === 'str') continue;
      if (RESERVED.has(u)) continue;
    }
    // function call?
    const nxt = items[i + 1];
    if (it.k === 'word' && isGroup(nxt, '(')) continue;
    // qualified reference: a.b / a.b.c / a.*
    if (nxt && nxt.k === 'dot') {
      let j = i;
      const parts = [it];
      while (items[j + 1] && items[j + 1].k === 'dot' && items[j + 2] && (isIdent(items[j + 2]) || (items[j + 2].k === 'op' && items[j + 2].v === '*'))) {
        parts.push(items[j + 2]);
        j += 2;
      }
      const last = parts[parts.length - 1];
      if (parts.length >= 2 && isIdent(last)) {
        // a.b -> alias a, column b;  a.b.c -> schema a, table b, column c
        const qual = parts.length >= 3 ? parts[parts.length - 2] : parts[0];
        qualified(qual, last, scope, A, use);
      }
      i = j;
      continue;
    }
    unqualified(it, scope, A, use);
  }
}

/* ------------------------------------------------------------------------------------------------ */
/* entry point                                                                                       */
/* ------------------------------------------------------------------------------------------------ */

function analyzeSql(text, lineAt) {
  const A = new Acc(lineAt);
  const tree = buildTree(tokenize(text));
  for (const stmt of splitStatements(tree)) analyzeStatement(stmt, new Scope(null), A);
  return {
    tables: A.tables,
    columns: A.columns,
    ambiguous: A.ambiguous,
    conflicts: A.conflicts,
    dynamics: A.dynamics,
    ddl: A.ddl,
    statements: A.statements,
  };
}

module.exports = { analyzeSql, canonicalTable, RESERVED };
