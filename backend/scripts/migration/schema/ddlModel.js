'use strict';

/**
 * ddlModel.js - the "known DDL" model: every table / column / unique constraint the repository can create,
 * and WHERE that DDL lives.
 *
 * Sources scanned (all statically, nothing executed):
 *   backend/database.sql                        kind 'database.sql'  (MySQL dialect: AUTO_INCREMENT, JSON)
 *   backend/src/migrations/*.sql                kind 'migration'     (manual migration files; nothing loads them)
 *   backend/src/**\/*.js (not src/worker/**)    kind 'boot'          (Express: initializeTables.js, runMigrations.js,
 *                                                                    module-load CREATE TABLE in routes/*.js, sessionService)
 *
 * Model shape:
 *   model.tables: Map<name, { name, variants:[Variant], adds:[Add], indexes:[Index], seeds:[Source] }>
 *   Variant = { source, dialect, text, columns:[Column], uniques:[Unique] }              one per CREATE TABLE statement
 *   Add     = { source, column: Column }                                                 one per ALTER TABLE .. ADD COLUMN
 *   Index   = { source, name, unique, columns, expr, where, text }
 *   Column  = { name, type, defText, notNull, hasDefault, primaryKey, unique, references }
 *   Unique  = { columns:[..], kind:'primary'|'unique', source }
 *   Source  = { kind, file, line }              file is relative to backend/, forward slashes
 */

const fs = require('fs');
const path = require('path');
const {
  tokenize, buildTree, splitStatements, splitCommas, identName, isWord, isIdent,
} = require('./sqlTokens');
const { scanSource } = require('./jsSql');

const CONSTRAINT_STARTERS = new Set([
  'NOT', 'NULL', 'DEFAULT', 'PRIMARY', 'UNIQUE', 'REFERENCES', 'CHECK', 'CONSTRAINT', 'COLLATE', 'GENERATED', 'AUTO_INCREMENT', 'COMMENT', 'ON',
]);
const TABLE_CONSTRAINT_STARTERS = new Set(['CONSTRAINT', 'PRIMARY', 'FOREIGN', 'UNIQUE', 'CHECK', 'EXCLUDE', 'LIKE']);

const toPosix = (p) => p.split(path.sep).join('/');

/** "database.sql" | "migration file src/migrations/x.sql" | "Express boot at src/utils/y.js:12" */
function describeSource(src) {
  if (!src) return 'NOT FOUND ANYWHERE';
  if (src.kind === 'database.sql') return 'database.sql';
  if (src.kind === 'migration') return `migration file ${src.file}`;
  return `Express boot at ${src.file}:${src.line}`;
}

const raw = (text, items) => (items.length ? text.slice(items[0].s, items[items.length - 1].e) : '');

function parseColumnDef(items, text) {
  const nameTok = items[0];
  const col = {
    name: identName(nameTok), type: '', defText: raw(text, items), notNull: false, hasDefault: false,
    primaryKey: false, unique: false, references: null, unknownName: nameTok.dyn !== undefined,
  };
  let i = 1;
  const typeStart = i;
  while (i < items.length && !(items[i].k === 'word' && CONSTRAINT_STARTERS.has(items[i].u))) i++;
  col.type = raw(text, items.slice(typeStart, i)).trim();
  const tu = col.type.toUpperCase();
  if (/^(BIG|SMALL)?SERIAL\b/.test(tu)) { col.notNull = true; col.hasDefault = true; }
  for (; i < items.length; i++) {
    const it = items[i];
    if (!(it.k === 'word')) continue;
    if (it.u === 'NOT' && isWord(items[i + 1], 'NULL')) { col.notNull = true; i++; }
    else if (it.u === 'PRIMARY' && isWord(items[i + 1], 'KEY')) { col.primaryKey = true; col.notNull = true; i++; }
    else if (it.u === 'UNIQUE') col.unique = true;
    else if (it.u === 'DEFAULT') col.hasDefault = true;
    else if (it.u === 'AUTO_INCREMENT') { col.hasDefault = true; col.notNull = true; }
    else if (it.u === 'REFERENCES' && isIdent(items[i + 1])) col.references = identName(items[i + 1]);
  }
  return col;
}

function identList(group) {
  const out = [];
  for (const part of splitCommas(group.items)) {
    if (part.length >= 1 && isIdent(part[0]) && (part.length === 1 || part.slice(1).every((t) => t.k === 'word'))) out.push(identName(part[0]));
    else out.push(null); // expression
  }
  return out;
}

function tableNameOf(items, i) {
  // [schema.]name
  const parts = [];
  if (!isIdent(items[i])) return null;
  parts.push(identName(items[i]));
  let j = i + 1;
  while (items[j] && items[j].k === 'dot' && isIdent(items[j + 1])) { parts.push(identName(items[j + 1])); j += 2; }
  const name = parts.length >= 2 && parts[parts.length - 2] === 'public' ? parts[parts.length - 1] : parts.join('.');
  return { name, next: j };
}

/**
 * Parse DDL / seed statements out of one SQL text.
 * Returns events: create-table | add-column | add-constraint | index | seed
 */
function parseDdlText(text, lineAt) {
  const events = [];
  const tree = buildTree(tokenize(text));
  for (const st of splitStatements(tree)) {
    const first = st[0];
    if (!first || first.k !== 'word') continue;
    const line = lineAt(first.s);
    const stText = text.slice(first.s, st[st.length - 1].e);
    if (first.u === 'CREATE') {
      let i = 1;
      while (isWord(st[i], 'UNLOGGED', 'TEMP', 'TEMPORARY', 'GLOBAL', 'LOCAL')) i++;
      if (isWord(st[i], 'TABLE')) {
        i++;
        if (isWord(st[i], 'IF') && isWord(st[i + 1], 'NOT') && isWord(st[i + 2], 'EXISTS')) i += 3;
        const tn = tableNameOf(st, i);
        if (!tn) continue;
        const body = st[tn.next];
        if (!body || body.g !== '(') continue;
        const ev = { type: 'create-table', table: tn.name, line, text: stText, columns: [], uniques: [], refs: [] };
        for (const item of splitCommas(body.items)) {
          const f = item[0];
          if (!f) continue;
          if (f.k === 'word' && TABLE_CONSTRAINT_STARTERS.has(f.u)) {
            let k = 0;
            if (f.u === 'CONSTRAINT') k = 2;
            const w = item[k];
            if (isWord(w, 'PRIMARY') && isWord(item[k + 1], 'KEY') && item[k + 2] && item[k + 2].g === '(') {
              ev.uniques.push({ columns: identList(item[k + 2]), kind: 'primary' });
            } else if (isWord(w, 'UNIQUE') && item[k + 1] && item[k + 1].g === '(') {
              ev.uniques.push({ columns: identList(item[k + 1]), kind: 'unique' });
            } else if (isWord(w, 'FOREIGN')) {
              const r = item.findIndex((t) => isWord(t, 'REFERENCES'));
              if (r >= 0 && isIdent(item[r + 1])) ev.refs.push(identName(item[r + 1]));
            }
            continue;
          }
          if (!(f.k === 'qid' || f.k === 'word')) continue;
          const col = parseColumnDef(item, text);
          ev.columns.push(col);
          if (col.references) ev.refs.push(col.references);
          if (col.primaryKey) ev.uniques.push({ columns: [col.name], kind: 'primary' });
          else if (col.unique) ev.uniques.push({ columns: [col.name], kind: 'unique' });
        }
        events.push(ev);
      } else {
        let unique = false;
        if (isWord(st[i], 'UNIQUE')) { unique = true; i++; }
        if (!isWord(st[i], 'INDEX')) continue;
        i++;
        if (isWord(st[i], 'CONCURRENTLY')) i++;
        if (isWord(st[i], 'IF') && isWord(st[i + 1], 'NOT') && isWord(st[i + 2], 'EXISTS')) i += 3;
        let idxName = null;
        if (isIdent(st[i]) && !isWord(st[i], 'ON')) { idxName = identName(st[i]); i++; }
        if (!isWord(st[i], 'ON')) continue;
        i++;
        if (isWord(st[i], 'ONLY')) i++;
        const tn = tableNameOf(st, i);
        if (!tn) continue;
        i = tn.next;
        if (isWord(st[i], 'USING')) i += 2;
        const g = st[i];
        if (!g || g.g !== '(') continue;
        const cols = identList(g);
        events.push({
          type: 'index', table: tn.name, name: idxName, unique, columns: cols.filter(Boolean), expr: cols.includes(null),
          where: st.slice(i + 1).some((t) => isWord(t, 'WHERE')), line, text: stText,
        });
      }
    } else if (first.u === 'ALTER' && isWord(st[1], 'TABLE')) {
      let i = 2;
      if (isWord(st[i], 'IF') && isWord(st[i + 1], 'EXISTS')) i += 2;
      if (isWord(st[i], 'ONLY')) i++;
      const tn = tableNameOf(st, i);
      if (!tn) continue;
      for (const action of splitCommas(st.slice(tn.next))) {
        if (!isWord(action[0], 'ADD')) continue;
        let k = 1;
        if (isWord(action[k], 'COLUMN')) k++;
        if (isWord(action[k], 'IF') && isWord(action[k + 1], 'NOT') && isWord(action[k + 2], 'EXISTS')) k += 3;
        if (isWord(action[k], 'CONSTRAINT')) k += 2;
        if (isWord(action[k], 'UNIQUE') && action[k + 1] && action[k + 1].g === '(') {
          events.push({ type: 'add-constraint', table: tn.name, kind: 'unique', columns: identList(action[k + 1]), line });
        } else if (isWord(action[k], 'PRIMARY') && isWord(action[k + 1], 'KEY') && action[k + 2] && action[k + 2].g === '(') {
          events.push({ type: 'add-constraint', table: tn.name, kind: 'primary', columns: identList(action[k + 2]), line });
        } else if (isWord(action[k], 'FOREIGN', 'CHECK', 'EXCLUDE')) {
          continue;
        } else if (isIdent(action[k]) || (action[k] && action[k].k === 'word' && action[k].dyn !== undefined)) {
          const col = parseColumnDef(action.slice(k), text);
          events.push({ type: 'add-column', table: tn.name, column: col, line });
        }
      }
    } else if (first.u === 'INSERT' && isWord(st[1], 'INTO')) {
      const tn = tableNameOf(st, 2);
      if (tn) events.push({ type: 'seed', table: tn.name, line, text: stText });
    }
  }
  return events;
}

/* ------------------------------------------------------------------------------------------------ */
/* model                                                                                             */
/* ------------------------------------------------------------------------------------------------ */

class DdlModel {
  constructor() {
    this.tables = new Map();
    this.seeds = new Map();
    this.sourcesScanned = [];
    this.errors = [];
  }

  table(name) {
    let t = this.tables.get(name);
    if (!t) {
      t = { name, variants: [], adds: [], indexes: [], extraUniques: [] };
      this.tables.set(name, t);
    }
    return t;
  }

  has(name) { return this.tables.has(name); }

  /** Apply parsed events from one source. */
  ingest(events, sourceFor, { dialect = 'postgres', allowSeeds = false } = {}) {
    for (const ev of events) {
      const source = sourceFor(ev.line);
      if (ev.type === 'create-table') {
        const t = this.table(ev.table);
        t.variants.push({
          source, dialect, text: ev.text, columns: ev.columns, refs: [...new Set(ev.refs)],
          uniques: ev.uniques.map((u) => ({ ...u, source })),
        });
      } else if (ev.type === 'add-column') {
        this.table(ev.table).adds.push({ source, column: ev.column });
      } else if (ev.type === 'add-constraint') {
        this.table(ev.table).extraUniques.push({ columns: ev.columns, kind: ev.kind, source });
      } else if (ev.type === 'index') {
        this.table(ev.table).indexes.push({
          source, name: ev.name, unique: ev.unique, columns: ev.columns, expr: ev.expr, where: ev.where, text: ev.text,
        });
      } else if (ev.type === 'seed' && allowSeeds) {
        if (!this.seeds.has(ev.table)) this.seeds.set(ev.table, []);
        this.seeds.get(ev.table).push({ source, text: ev.text });
      }
    }
  }

  /** column name -> [{ column, source, via:'create'|'alter', dialect }] across every source */
  columnsOf(name) {
    const t = this.tables.get(name);
    const out = new Map();
    if (!t) return out;
    const push = (col, source, via, dialect) => {
      if (col.unknownName) return;
      if (!out.has(col.name)) out.set(col.name, []);
      out.get(col.name).push({ column: col, source, via, dialect });
    };
    for (const v of t.variants) for (const c of v.columns) push(c, v.source, 'create', v.dialect);
    for (const a of t.adds) push(a.column, a.source, 'alter', 'postgres');
    return out;
  }

  /** Every unique column set the DDL can create for a table: [{columns(sorted), kind, source}] */
  uniquesOf(name) {
    const t = this.tables.get(name);
    if (!t) return [];
    const out = [];
    for (const v of t.variants) for (const u of v.uniques) out.push({ columns: u.columns, kind: u.kind, source: u.source, dialect: v.dialect });
    for (const u of t.extraUniques) out.push({ ...u, dialect: 'postgres' });
    for (const ix of t.indexes) if (ix.unique && !ix.expr) out.push({ columns: ix.columns, kind: 'unique-index', where: ix.where, source: ix.source, dialect: 'postgres' });
    return out.filter((u) => !u.columns.includes(null));
  }

  /** Distinct source kinds that define the table (create statements only). */
  kindsOf(name) {
    const t = this.tables.get(name);
    return new Set(t ? t.variants.map((v) => v.source.kind) : []);
  }
}

function buildKnownDdl({ backendDir, extraJsRoots = [] } = {}) {
  const model = new DdlModel();
  const rel = (p) => toPosix(path.relative(backendDir, p));

  // 1. database.sql
  const dbSql = path.join(backendDir, 'database.sql');
  if (fs.existsSync(dbSql)) {
    const text = fs.readFileSync(dbSql, 'utf8');
    const lineAt = lineIndex(text);
    const dialect = /AUTO_INCREMENT|ENGINE\s*=/i.test(text) ? 'mysql' : 'postgres';
    model.ingest(parseDdlText(text, lineAt), (line) => ({ kind: 'database.sql', file: 'database.sql', line }), { dialect, allowSeeds: true });
    model.sourcesScanned.push('database.sql');
  }

  // 2. src/migrations/*.sql
  const migDir = path.join(backendDir, 'src', 'migrations');
  if (fs.existsSync(migDir)) {
    for (const f of fs.readdirSync(migDir).filter((n) => n.endsWith('.sql')).sort()) {
      const p = path.join(migDir, f);
      const text = fs.readFileSync(p, 'utf8');
      const file = rel(p);
      model.ingest(parseDdlText(text, lineIndex(text)), (line) => ({ kind: 'migration', file, line }), { allowSeeds: true });
      model.sourcesScanned.push(file);
    }
  }

  // 3. Express JS (everything under src/ except the Worker)
  const srcDir = path.join(backendDir, 'src');
  const workerDir = path.join(srcDir, 'worker');
  const jsFiles = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (p !== workerDir && e.name !== 'node_modules') walk(p); }
      else if (e.name.endsWith('.js')) jsFiles.push(p);
    }
  };
  if (fs.existsSync(srcDir)) walk(srcDir);
  for (const root of extraJsRoots) if (fs.existsSync(root)) jsFiles.push(root);
  jsFiles.sort();
  for (const p of jsFiles) {
    const source = fs.readFileSync(p, 'utf8');
    if (!/CREATE\s+(?:UNIQUE\s+)?(?:TABLE|INDEX)|ALTER\s+TABLE/i.test(source)) continue;
    const file = rel(p);
    let scanned;
    try {
      scanned = scanSource(source, { file, mode: 'ddl' });
    } catch (e) {
      model.errors.push(`${file}: ${e.message}`);
      continue;
    }
    model.errors.push(...scanned.errors);
    const isBootFile = /(^|\/)(initializeTables|runMigrations)\.js$/.test(file);
    for (const site of scanned.sites) {
      const events = parseDdlText(site.alt.text, site.alt.lineAt);
      // `line` from the scanner alt is already an absolute file line
      model.ingest(events, (line) => ({ kind: 'boot', file, line: line || site.line }), { allowSeeds: isBootFile });
    }
    model.sourcesScanned.push(file);
  }
  return model;
}

function lineIndex(text) {
  const starts = [0];
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) starts.push(i + 1);
  return (off) => {
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= off) lo = mid; else hi = mid - 1;
    }
    return lo + 1;
  };
}

/* ------------------------------------------------------------------------------------------------ */
/* drift                                                                                             */
/* ------------------------------------------------------------------------------------------------ */

function typeFamily(t) {
  const s = String(t || '').toLowerCase().replace(/\(.*?\)/g, '').replace(/\s+/g, ' ').trim();
  if (/^(serial|integer|int|int4|smallint|bigint|bigserial|int8|smallserial)\b/.test(s)) return 'int';
  if (/^(varchar|character varying|char|character|text|citext)\b/.test(s)) return 'text';
  if (/^jsonb\b/.test(s)) return 'jsonb';
  if (/^json\b/.test(s)) return 'json';
  if (/^(boolean|bool)\b/.test(s)) return 'bool';
  if (/^timestamptz\b|^timestamp with time zone/.test(s)) return 'timestamptz';
  if (/^timestamp\b/.test(s)) return 'timestamp';
  if (/^date\b/.test(s)) return 'date';
  if (/^(numeric|decimal|real|float|double)/.test(s)) return 'numeric';
  if (s.endsWith('[]')) return 'array';
  if (s.startsWith('text[]')) return 'array';
  return s.split(' ')[0] || 'unknown';
}

const setKey = (cols) => cols.slice().sort().join(',');

/**
 * Tables whose CREATE statements disagree: column sets, column type families, or unique constraints.
 * Returns [{ table, variants:[{source,dialect,columns}], columnDiffs:[{column, presentIn:[idx], absentIn:[idx]}],
 *            typeDiffs:[{column, types:{family:[idx]}}], uniqueDiffs:[{key, presentIn, absentIn}], severity }]
 */
function computeDrift(model) {
  const out = [];
  for (const [name, t] of [...model.tables].sort((a, b) => a[0].localeCompare(b[0]))) {
    // only compare variants that are PostgreSQL-dialect (database.sql is MySQL syntax and is noted separately)
    const vs = t.variants.map((v, idx) => ({ v, idx }));
    if (vs.length < 2) continue;
    const allCols = new Set();
    vs.forEach(({ v }) => v.columns.forEach((c) => allCols.add(c.name)));
    const columnDiffs = [];
    for (const c of [...allCols].sort()) {
      const presentIn = vs.filter(({ v }) => v.columns.some((x) => x.name === c)).map(({ idx }) => idx);
      if (presentIn.length !== vs.length) {
        // a column added by an ALTER in the model reconciles some absences: not drift, that is the point of ALTER
        const alterAdded = t.adds.some((a) => a.column.name === c);
        columnDiffs.push({ column: c, presentIn, absentIn: vs.filter(({ idx }) => !presentIn.includes(idx)).map(({ idx }) => idx), alterAdded });
      }
    }
    const typeDiffs = [];
    for (const c of [...allCols].sort()) {
      const fams = {};
      vs.forEach(({ v, idx }) => {
        const col = v.columns.find((x) => x.name === c);
        if (col) (fams[typeFamily(col.type)] = fams[typeFamily(col.type)] || []).push(idx);
      });
      if (Object.keys(fams).length > 1) typeDiffs.push({ column: c, types: fams });
    }
    const uniqKeys = new Set();
    const uniqPer = vs.map(({ v }) => new Set(v.uniques.filter((u) => !u.columns.includes(null)).map((u) => setKey(u.columns))));
    uniqPer.forEach((s) => s.forEach((k) => uniqKeys.add(k)));
    const uniqueDiffs = [];
    for (const k of [...uniqKeys].sort()) {
      const presentIn = uniqPer.map((s, i) => (s.has(k) ? i : -1)).filter((i) => i >= 0);
      if (presentIn.length !== vs.length) uniqueDiffs.push({ key: k, presentIn, absentIn: vs.map((_, i) => i).filter((i) => !presentIn.includes(i)) });
    }
    const real = columnDiffs.filter((d) => !d.alterAdded);
    if (!real.length && !typeDiffs.length && !uniqueDiffs.length) continue;
    out.push({
      table: name,
      variants: t.variants.map((v) => ({ source: v.source, dialect: v.dialect, columns: v.columns.map((c) => c.name) })),
      columnDiffs: real,
      typeDiffs,
      uniqueDiffs,
      alterReconciled: columnDiffs.filter((d) => d.alterAdded).map((d) => d.column),
    });
  }
  return out;
}


/* ------------------------------------------------------------------------------------------------ */
/* uncommitted DDL (read-only git: status + show HEAD:file)                                          */
/* ------------------------------------------------------------------------------------------------ */

/** Keys describing the DDL in one text: t:<table>, c:<table>.<column>, u:<table>|<cols> */
function ddlKeys(events) {
  const keys = new Set();
  for (const ev of events) {
    if (ev.type === 'create-table') {
      keys.add(`t:${ev.table}`);
      for (const c of ev.columns) keys.add(`c:${ev.table}.${c.name}`);
    } else if (ev.type === 'add-column') keys.add(`c:${ev.table}.${ev.column.name}`);
  }
  return keys;
}

function keysOfText(file, text) {
  if (file.endsWith('.sql')) return ddlKeys(parseDdlText(text, lineIndex(text)));
  const scanned = scanSource(text, { file, mode: 'ddl' });
  const keys = new Set();
  for (const site of scanned.sites) for (const k of ddlKeys(parseDdlText(site.alt.text, site.alt.lineAt))) keys.add(k);
  return keys;
}

/**
 * Which DDL source files differ from git HEAD, and which DDL keys HEAD's copy of each already contained.
 * Only read-only git commands are run (rev-parse, status, show); if git is unavailable the result is
 * { available:false } and nothing is flagged. `git` is injectable for tests: (args) => stdout string.
 * Returns { available, modified: Map<file,'modified'|'untracked'>, head: Map<file, Set<key>> }
 */
function gitDdlStatus({ backendDir, files, git }) {
  const run = git || ((args) => require('child_process').execFileSync('git', args, {
    cwd: backendDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 20000, maxBuffer: 32 * 1024 * 1024,
  }));
  const res = { available: false, modified: new Map(), head: new Map() };
  let top;
  try {
    top = run(['rev-parse', '--show-toplevel']).trim();
  } catch (e) {
    return res;
  }
  if (!top) return res;
  const prefix = toPosix(path.relative(top, backendDir));
  const inRepo = (f) => (prefix ? `${prefix}/${f}` : f);
  let status;
  try {
    status = run(['status', '--porcelain=v1', '-uall', '--', '.']);
  } catch (e) {
    return res;
  }
  res.available = true;
  const changed = new Map();
  for (const line of status.split('\n')) {
    if (line.length < 4) continue;
    const xy = line.slice(0, 2);
    let p = line.slice(3).trim();
    if (p.includes(' -> ')) p = p.split(' -> ').pop();
    p = p.replace(/^"|"$/g, '');
    if (prefix && p.startsWith(`${prefix}/`)) p = p.slice(prefix.length + 1);
    changed.set(p, xy === '??' ? 'untracked' : 'modified');
  }
  for (const f of files) {
    const st = changed.get(f);
    if (!st) continue;
    res.modified.set(f, st);
    if (st === 'untracked') { res.head.set(f, new Set()); continue; }
    try {
      res.head.set(f, keysOfText(f, run(['show', `HEAD:${inRepo(f)}`])));
    } catch (e) {
      res.head.set(f, new Set()); // not in HEAD
    }
  }
  return res;
}

module.exports = {
  buildKnownDdl, parseDdlText, DdlModel, computeDrift, describeSource, typeFamily, lineIndex, toPosix, gitDdlStatus, ddlKeys,
};
