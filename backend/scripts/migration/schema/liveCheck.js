'use strict';

/**
 * liveCheck.js - compare the Worker's required schema with a live PostgreSQL / Neon catalog, READ-ONLY.
 *
 * Nothing here can write: every statement goes through makeReadOnlyClient(), whose guard (assertReadOnlySql)
 * refuses anything that is not a single plain SELECT. The catalog queries below are the only SQL this module
 * ever sends, and they are fixed strings (no user input is interpolated into them).
 *
 * The functions that compute (fetchCatalog / checkCatalog / buildFixSql) take an injected client or a plain
 * data structure, so they are testable with a mock and never open a connection themselves.
 */

/* ------------------------------------------------------------------------------------------------ */
/* read-only guard                                                                                   */
/* ------------------------------------------------------------------------------------------------ */

class ReadOnlyViolation extends Error {
  constructor(message) {
    super(message);
    this.name = 'ReadOnlyViolation';
  }
}

const FORBIDDEN_WORDS = [
  'INSERT', 'UPDATE', 'DELETE', 'DROP', 'ALTER', 'CREATE', 'TRUNCATE', 'GRANT', 'REVOKE', 'COPY', 'INTO', 'CALL', 'EXECUTE',
  'DO', 'VACUUM', 'REINDEX', 'CLUSTER', 'MERGE', 'LOCK', 'SET', 'RESET', 'COMMENT', 'SECURITY', 'REFRESH', 'LISTEN', 'NOTIFY',
  'PREPARE', 'DEALLOCATE', 'DISCARD', 'BEGIN', 'COMMIT', 'ROLLBACK', 'SAVEPOINT', 'ANALYZE', 'IMPORT', 'REASSIGN', 'OWNED',
];
const FORBIDDEN_RE = new RegExp(`\\b(?:${FORBIDDEN_WORDS.join('|')})\\b`, 'i');
// functions with side effects that are callable from a SELECT
const FORBIDDEN_FN_RE = /\b(?:set_config|nextval|setval|currval|lastval|pg_advisory\w*|pg_terminate_backend|pg_cancel_backend|pg_reload_conf|pg_sleep\w*|lo_\w+|dblink\w*|pg_read_file|pg_read_binary_file|pg_ls_dir|pg_stat_file|pg_switch_wal|pg_create_\w+|pg_drop_\w+|pg_promote|pg_rotate_logfile|txid_\w+|pg_notify|pg_logical_\w+|pg_replication_\w+)\b/i;

/** Replace comments and string / quoted-identifier bodies with spaces, keeping everything else. */
function maskSql(sql) {
  let out = '';
  let i = 0;
  const n = sql.length;
  while (i < n) {
    const ch = sql[i];
    if (ch === '-' && sql[i + 1] === '-') { while (i < n && sql[i] !== '\n') { out += ' '; i++; } continue; }
    if (ch === '/' && sql[i + 1] === '*') {
      let depth = 1;
      out += '  ';
      i += 2;
      while (i < n && depth > 0) {
        if (sql[i] === '/' && sql[i + 1] === '*') { depth++; out += '  '; i += 2; }
        else if (sql[i] === '*' && sql[i + 1] === '/') { depth--; out += '  '; i += 2; }
        else { out += ' '; i++; }
      }
      continue;
    }
    if (ch === "'" || ch === '"') {
      const q = ch;
      out += q;
      i++;
      while (i < n) {
        if (sql[i] === q) {
          if (sql[i + 1] === q) { out += '  '; i += 2; continue; }
          break;
        }
        out += ' ';
        i++;
      }
      out += q;
      i++;
      continue;
    }
    if (ch === '$' && /^\$[A-Za-z_]*\$/.test(sql.slice(i, i + 40))) {
      // dollar-quoted string: refuse outright, the catalog queries never need one
      throw new ReadOnlyViolation('dollar-quoted strings are not allowed in read-only catalog queries');
    }
    out += ch;
    i++;
  }
  return out;
}

/**
 * Throws ReadOnlyViolation unless `sql` is exactly one plain SELECT statement with no data- or
 * schema-changing keyword and no side-effecting function. Returns the normalised statement.
 */
function assertReadOnlySql(sql) {
  if (typeof sql !== 'string' || !sql.trim()) throw new ReadOnlyViolation('empty statement');
  const masked = maskSql(sql);
  const body = masked.trim().replace(/;\s*$/, '');
  if (body.includes(';')) throw new ReadOnlyViolation('multiple statements are not allowed');
  if (!/^SELECT\b/i.test(body)) {
    throw new ReadOnlyViolation(`only SELECT statements are allowed (got: ${body.slice(0, 24).replace(/\s+/g, ' ')}...)`);
  }
  const bad = FORBIDDEN_RE.exec(body);
  if (bad) throw new ReadOnlyViolation(`keyword ${bad[0].toUpperCase()} is not allowed in a read-only query`);
  const badFn = FORBIDDEN_FN_RE.exec(body);
  if (badFn) throw new ReadOnlyViolation(`function ${badFn[0]} is not allowed in a read-only query`);
  return sql.trim();
}

/**
 * Wrap a pg-style client ({ query(text, params) }) so that only guarded SELECTs reach it.
 * The wrapped client is not reachable from the returned object.
 */
function makeReadOnlyClient(rawClient) {
  const executed = [];
  return {
    async query(sql, params) {
      const checked = assertReadOnlySql(sql);
      executed.push(checked);
      return rawClient.query(checked, params);
    },
    get executed() { return executed.slice(); },
  };
}

/* ------------------------------------------------------------------------------------------------ */
/* catalog                                                                                           */
/* ------------------------------------------------------------------------------------------------ */

const CATALOG_SQL = {
  identity: 'SELECT current_database()::text AS db, current_schema()::text AS schema, current_setting(\'server_version\')::text AS version',
  tables: 'SELECT table_schema::text AS table_schema, table_name::text AS table_name, table_type::text AS table_type '
    + 'FROM information_schema.tables WHERE table_schema::text = ANY (current_schemas(false)::text[])',
  columns: 'SELECT table_schema::text AS table_schema, table_name::text AS table_name, column_name::text AS column_name, '
    + 'data_type::text AS data_type, is_nullable::text AS is_nullable '
    + 'FROM information_schema.columns WHERE table_schema::text = ANY (current_schemas(false)::text[])',
  constraints: 'SELECT n.nspname::text AS table_schema, cl.relname::text AS table_name, c.conname::text AS constraint_name, '
    + 'c.contype::text AS constraint_type, '
    + 'ARRAY(SELECT a.attname::text FROM unnest(c.conkey) WITH ORDINALITY AS k(attnum, ord) '
    + 'JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum ORDER BY k.ord) AS columns '
    + 'FROM pg_constraint c JOIN pg_class cl ON cl.oid = c.conrelid JOIN pg_namespace n ON n.oid = cl.relnamespace '
    + 'WHERE c.contype IN (\'p\', \'u\') AND n.nspname::text = ANY (current_schemas(false)::text[])',
  indexes: 'SELECT schemaname::text AS table_schema, tablename::text AS table_name, indexname::text AS index_name, indexdef::text AS indexdef '
    + 'FROM pg_indexes WHERE schemaname::text = ANY (current_schemas(false)::text[])',
};

/** Parse `CREATE UNIQUE INDEX name ON public.t USING btree (a, b) [WHERE ...]` (text returned by pg_indexes). */
function parseUniqueIndexDef(def) {
  const text = String(def).trim();
  const head = /^CREATE UNIQUE INDEX\s+(\S+)\s+ON\s+(?:ONLY\s+)?(\S+)\s+USING\s+\w+\s*\(/i.exec(text);
  if (!head) return null;
  // the column list ends at the parenthesis that balances the first one (a WHERE predicate may contain more)
  let depthScan = 1;
  let end = head[0].length;
  while (end < text.length && depthScan > 0) {
    if (text[end] === '(') depthScan++;
    else if (text[end] === ')') depthScan--;
    end++;
  }
  const inner = text.slice(head[0].length, end - 1);
  const m = [null, head[1], head[2], inner, /\bWHERE\b/i.test(text.slice(end)) ? 'where' : ''];
  // split top-level commas
  const parts = [];
  let depth = 0;
  let cur = '';
  for (const ch of inner) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { parts.push(cur); cur = ''; } else cur += ch;
  }
  parts.push(cur);
  const cols = [];
  let expr = false;
  for (const p of parts) {
    const t = p.trim().replace(/\s+(ASC|DESC)(\s+NULLS\s+(FIRST|LAST))?$/i, '');
    if (/^"?[A-Za-z_][A-Za-z0-9_]*"?$/.test(t)) cols.push(t.replace(/"/g, ''));
    else expr = true;
  }
  return { name: m[1].replace(/"/g, ''), columns: cols, expr, partial: !!m[4] };
}

async function fetchCatalog(ro) {
  const q = async (key) => (await ro.query(CATALOG_SQL[key])).rows;
  // One after the other, never Promise.all: the connection is a single pg Client, and issuing a second query while
  // one is in flight is deprecated in pg 8 (DeprecationWarning, found on the first real PostgreSQL 17 run) and is
  // removed in pg 9. Five tiny catalog queries: the sequential cost is a few round trips.
  const identity = await q('identity');
  const tables = await q('tables');
  const columns = await q('columns');
  const constraints = await q('constraints');
  const indexes = await q('indexes');
  const cat = {
    identity: identity[0] || {},
    tables: new Map(), columns: new Map(), uniques: new Map(), constraintNames: new Set(),
  };
  for (const r of tables) cat.tables.set(r.table_name, { schema: r.table_schema, type: r.table_type });
  for (const r of columns) {
    if (!cat.columns.has(r.table_name)) cat.columns.set(r.table_name, new Map());
    cat.columns.get(r.table_name).set(r.column_name, { type: r.data_type, nullable: r.is_nullable });
  }
  const addUnique = (table, u) => {
    if (!cat.uniques.has(table)) cat.uniques.set(table, []);
    cat.uniques.get(table).push(u);
  };
  for (const r of constraints) {
    cat.constraintNames.add(r.constraint_name);
    addUnique(r.table_name, { name: r.constraint_name, kind: r.constraint_type === 'p' ? 'primary' : 'unique', columns: r.columns || [], partial: false, expr: false });
  }
  for (const r of indexes) {
    if (!/^CREATE UNIQUE INDEX/i.test(r.indexdef)) continue;
    const u = parseUniqueIndexDef(r.indexdef);
    if (!u) continue;
    cat.constraintNames.add(u.name);
    addUnique(r.table_name, { name: u.name, kind: 'unique-index', columns: u.columns, partial: u.partial, expr: u.expr });
  }
  return cat;
}

/* ------------------------------------------------------------------------------------------------ */
/* diff                                                                                              */
/* ------------------------------------------------------------------------------------------------ */

const setKey = (cols) => cols.slice().sort().join(',');

/**
 * Compare Resolved (requirements.resolveRequirements) with a catalog.
 * Returns { missingTables, missingColumns, missingUniques, ambiguousMissing, ok: bool, counts }
 */
function checkCatalog(resolved, catalog) {
  const missingTables = [];
  const missingColumns = [];
  const missingUniques = [];
  const ambiguousMissing = [];
  let tablesOk = 0;
  let columnsOk = 0;
  let uniquesOk = 0;
  const missingTableNames = new Set();
  for (const t of resolved.tables) {
    if (!catalog.tables.has(t.name)) {
      missingTables.push({
        table: t.name, workerFiles: t.workerFiles, ddl: t.ddl, guarded: t.guarded,
        columns: t.columns.map((c) => c.name),
      });
      missingTableNames.add(t.name);
      continue;
    }
    tablesOk++;
    const have = catalog.columns.get(t.name) || new Map();
    for (const c of t.columns) {
      if (have.has(c.name)) columnsOk++;
      else missingColumns.push({ table: t.name, column: c.name, confidence: c.confidence, evidence: c.evidence, ddlStatus: c.status, sources: c.sources });
    }
    for (const c of t.conflicts) {
      if (!c.needsUnique) continue;
      const uniq = catalog.uniques.get(t.name) || [];
      let satisfied;
      if (c.constraint) satisfied = catalog.constraintNames.has(c.constraint);
      else if (c.exprTarget) satisfied = uniq.some((u) => u.expr); // cannot prove which expression: accept any expression unique index
      else {
        const want = setKey(c.columns);
        // a partial unique index only satisfies ON CONFLICT ... WHERE with a matching predicate; accept it only then
        satisfied = uniq.some((u) => !u.expr && setKey(u.columns) === want && (!u.partial || c.where));
      }
      if (satisfied) uniquesOk++;
      else {
        missingUniques.push({
          table: t.name, columns: c.columns, constraint: c.constraint, exprTarget: c.exprTarget, where: c.where, file: c.file, line: c.line,
          ddlStatus: c.status, satisfiedBy: c.satisfiedBy,
        });
      }
    }
  }
  // unqualified columns in multi-table scopes: missing only if no candidate table that exists has it
  for (const m of resolved.ambiguous || []) {
    if (m.hasOther) continue;
    const present = m.candidates.filter((c) => catalog.tables.has(c));
    if (present.length !== m.candidates.length) continue; // already reported as a missing table
    if (!present.some((c) => (catalog.columns.get(c) || new Map()).has(m.column))) ambiguousMissing.push(m);
  }
  const ok = !missingTables.length && !missingColumns.length && !missingUniques.length && !ambiguousMissing.length;
  return {
    ok,
    missingTables,
    missingColumns,
    missingUniques,
    ambiguousMissing,
    counts: {
      tablesRequired: resolved.tables.length,
      tablesOk,
      tablesMissing: missingTables.length,
      columnsMissing: missingColumns.length,
      columnsOk,
      uniquesMissing: missingUniques.length,
      uniquesOk,
      ambiguousMissing: ambiguousMissing.length,
    },
  };
}

/* ------------------------------------------------------------------------------------------------ */
/* fix SQL (printed only)                                                                            */
/* ------------------------------------------------------------------------------------------------ */

const KIND_PRIORITY = { boot: 0, migration: 1, 'database.sql': 2 };
const FILE_PRIORITY = (f) => (/initializeTables\.js$/.test(f) ? 0 : /runMigrations\.js$/.test(f) ? 1 : 2);

function mysqlToPg(text) {
  return text
    .replace(/\bINT\s+AUTO_INCREMENT\s+PRIMARY\s+KEY\b/gi, 'SERIAL PRIMARY KEY')
    .replace(/\bAUTO_INCREMENT\b/gi, '')
    .replace(/\bJSON\b/gi, 'JSONB');
}

/** Choose the CREATE TABLE variant that best covers the columns the Worker needs. */
function pickVariant(model, tableName, neededColumns) {
  const t = model.tables.get(tableName);
  if (!t || !t.variants.length) return null;
  const addNames = new Set(t.adds.map((a) => a.column.name));
  const scored = t.variants.map((v, idx) => {
    const have = new Set(v.columns.map((c) => c.name));
    const covered = neededColumns.filter((c) => have.has(c) || addNames.has(c)).length;
    return { v, idx, covered, pg: v.dialect === 'mysql' ? 1 : 0 };
  });
  scored.sort((a, b) => a.pg - b.pg
    || b.covered - a.covered
    || (KIND_PRIORITY[a.v.source.kind] - KIND_PRIORITY[b.v.source.kind])
    || (FILE_PRIORITY(a.v.source.file) - FILE_PRIORITY(b.v.source.file))
    || a.idx - b.idx);
  const best = scored[0];
  return { variant: best.v, covered: best.covered, needed: neededColumns.length };
}

const oneLine = (s) => String(s).replace(/\s+/g, ' ').trim();

/** Remove the common indentation of the continuation lines (the first line starts at CREATE / INSERT). */
function dedent(text) {
  const lines = String(text).trim().split('\n');
  if (lines.length < 2) return lines[0] || '';
  const indentOf = (l) => l.match(/^\s*/)[0].length;
  const rest = lines.slice(1).filter((l) => l.trim());
  const min = rest.length ? Math.min(...rest.map(indentOf)) : 0;
  // a closing parenthesis on its own line is the least-indented line: align it with the statement start
  const closing = lines[lines.length - 1].trim().startsWith(')');
  const cut = closing ? min : Math.max(0, min - 2);
  return [lines[0], ...lines.slice(1).map((l) => l.slice(Math.min(cut, indentOf(l))))].join('\n');
}

function columnAddStatement(model, tableName, colName) {
  const defs = model.columnsOf(tableName).get(colName) || [];
  if (!defs.length) return null;
  // prefer an explicit ALTER .. ADD COLUMN, then a Postgres CREATE definition, then MySQL
  const rank = (d) => (d.via === 'alter' ? 0 : 1) + (d.dialect === 'mysql' ? 10 : 0) + KIND_PRIORITY[d.source.kind] * 0.1;
  const d = defs.slice().sort((a, b) => rank(a) - rank(b))[0];
  let def = d.dialect === 'mysql' ? mysqlToPg(d.column.defText) : d.column.defText;
  def = oneLine(def).replace(/\s+PRIMARY\s+KEY\b/i, '').replace(/\s+UNIQUE\b(?!\s*\()/i, '');
  const warn = d.column.notNull && !d.column.hasDefault
    ? '\n-- WARNING: NOT NULL without DEFAULT fails when the table already has rows; add a DEFAULT or backfill first.' : '';
  const tt = model.tables.get(tableName);
  const drift = d.via === 'create' && tt && tt.variants.length > 1;
  return {
    sql: `ALTER TABLE ${tableName} ADD COLUMN IF NOT EXISTS ${def};`, source: d.source, warn, mysql: d.dialect === 'mysql', drift,
  };
}

const srcLabel = (s) => (s ? (s.kind === 'database.sql' ? 'database.sql' : `${s.file}:${s.line}`) : '?');

/**
 * Build the DDL that would create everything missing. Returns { text, statements, unresolvable }.
 * `missing` = { tables:[{table,columns}], columns:[{table,column}], uniques:[{table,columns,constraint,...}] }
 * This function only builds strings; check-schema.js prints them and never executes them.
 */
function buildFixSql(model, missing) {
  const lines = [];
  const statements = [];
  const unresolvable = [];
  const hdr = [
    '-- ============================================================================================',
    '-- PRINTED ONLY. check-schema.js never executes any of this. Review, then run it yourself against a',
    '-- Neon BRANCH first (never straight against production). Statements come from the repository\'s',
    '-- known DDL (database.sql / migration files / Express boot code); sources are noted per statement.',
    '-- ============================================================================================',
  ];
  lines.push(...hdr, '');

  const emit = (comment, sql, extra = '') => {
    if (comment) lines.push(`-- ${comment}`);
    if (extra) lines.push(extra);
    lines.push(sql, '');
    statements.push(sql);
  };

  const wantedCols = new Map(); // table -> [columns] (for variant choice)
  for (const t of missing.tables) wantedCols.set(t.table, t.columns || []);
  for (const c of missing.columns) {
    if (!wantedCols.has(c.table)) wantedCols.set(c.table, []);
    wantedCols.get(c.table).push(c.column);
  }
  const createdTables = new Set();
  const derivedUniques = [];

  // create referenced tables first (foreign keys): topological order over the tables being created, name order otherwise
  const ordered = [];
  {
    const byName = new Map(missing.tables.map((t) => [t.table, t]));
    const seen = new Set();
    const visit = (name) => {
      if (seen.has(name) || !byName.has(name)) return;
      seen.add(name);
      const p = pickVariant(model, name, byName.get(name).columns || []);
      for (const ref of (p && p.variant.refs) || []) visit(ref);
      ordered.push(byName.get(name));
    };
    for (const n of [...byName.keys()].sort()) visit(n);
  }
  for (const t of ordered) {
    const pick = pickVariant(model, t.table, t.columns || []);
    if (!pick) {
      unresolvable.push({ kind: 'table', table: t.table });
      lines.push(`-- NO DDL KNOWN ANYWHERE in the repository for table ${t.table}; it must be created by hand (or restored) before its routes work.`, '');
      continue;
    }
    const v = pick.variant;
    let text = dedent(v.text);
    let note = `table ${t.table}: from ${srcLabel(v.source)}${pick.covered < pick.needed ? ` (covers ${pick.covered}/${pick.needed} columns the Worker uses; see the ALTER statements)` : ''}`;
    if (v.dialect === 'mysql') { text = dedent(mysqlToPg(v.text)); note += ' [translated from MySQL dialect database.sql: REVIEW]'; }
    if (!/IF\s+NOT\s+EXISTS/i.test(text)) text = text.replace(/^CREATE\s+TABLE\s+/i, 'CREATE TABLE IF NOT EXISTS ');
    emit(note, `${text};`);
    createdTables.add(t.table);
    // an ON CONFLICT target the chosen CREATE variant does not declare would still fail after creation
    for (const c of t.conflicts || []) {
      if (!c.needsUnique || c.constraint || c.exprTarget || !c.columns.length) continue;
      const want = setKey(c.columns);
      const tt0 = model.tables.get(t.table);
      const has = v.uniques.some((u) => setKey(u.columns.filter(Boolean)) === want)
        || tt0.extraUniques.some((u) => setKey(u.columns.filter(Boolean)) === want)
        || tt0.indexes.some((x) => x.unique && !x.expr && setKey(x.columns) === want && x.source.file === v.source.file);
      if (!has) derivedUniques.push({ table: t.table, columns: c.columns, file: c.file, line: c.line });
    }
    // companion indexes declared in the same source file
    const tt = model.tables.get(t.table);
    for (const ix of tt.indexes.filter((x) => x.source.file === v.source.file)) {
      let sql = dedent(ix.text);
      if (!/IF\s+NOT\s+EXISTS/i.test(sql)) sql = sql.replace(/^(CREATE\s+(?:UNIQUE\s+)?INDEX\s+)/i, '$1IF NOT EXISTS ');
      lines.push(`${sql};`);
      statements.push(`${sql};`);
    }
    if (tt.indexes.some((x) => x.source.file === v.source.file)) lines.push('');
    const seeds = model.seeds.get(t.table) || [];
    if (seeds.length) {
      lines.push(`-- ${t.table} is also SEEDED by Express boot; a freshly created table is empty. Seed statement(s) (from ${seeds.map((s) => srcLabel(s.source)).join(', ')}):`);
      for (const s of seeds) { lines.push(`${dedent(s.text)};`); statements.push(`${dedent(s.text)};`); }
      lines.push('');
    }
  }

  // columns the chosen CREATE variant does not provide, plus columns missing from existing tables
  const seenCols = new Set();
  const colTargets = [];
  for (const c of missing.columns) colTargets.push({ table: c.table, column: c.column });
  for (const t of missing.tables) {
    const pick = pickVariant(model, t.table, t.columns || []);
    if (!pick) continue;
    const have = new Set(pick.variant.columns.map((c) => c.name));
    for (const col of t.columns || []) if (!have.has(col)) colTargets.push({ table: t.table, column: col });
  }
  for (const { table, column } of colTargets) {
    const key = `${table}.${column}`;
    if (seenCols.has(key)) continue;
    seenCols.add(key);
    const st = columnAddStatement(model, table, column);
    if (!st) {
      unresolvable.push({ kind: 'column', table, column });
      lines.push(`-- NO DDL KNOWN ANYWHERE in the repository for column ${table}.${column}; confirm its intended type and add it by hand.`, '');
      continue;
    }
    const driftNote = st.drift ? ` [schema drift: only another CREATE TABLE ${table} shape declares it, so this merges two shapes]` : '';
    emit(`column ${table}.${column}: from ${srcLabel(st.source)}${st.mysql ? ' [translated from MySQL dialect: REVIEW]' : ''}${driftNote}`, st.sql, st.warn);
  }

  const seenUnique = new Set();
  for (const u of missing.uniques.concat(derivedUniques)) {
    const ukey = `${u.table}|${(u.columns || []).slice().sort().join(',')}|${u.constraint || ''}`;
    if (seenUnique.has(ukey)) continue;
    seenUnique.add(ukey);
    if (u.constraint) {
      lines.push(`-- ON CONFLICT ON CONSTRAINT ${u.constraint} on ${u.table}: the constraint name must exist; no DDL in the repository defines it. Create it by hand.`, '');
      unresolvable.push({ kind: 'constraint', table: u.table, constraint: u.constraint });
      continue;
    }
    if (!u.columns.length) continue;
    const idx = `uq_${u.table}_${u.columns.join('_')}`.slice(0, 60);
    const declared = model.uniquesOf(u.table).find((x) => setKey(x.columns) === setKey(u.columns) && x.dialect !== 'mysql');
    const note = declared
      ? `unique (${u.columns.join(', ')}) on ${u.table}: declared in ${srcLabel(declared.source)}; needed by ON CONFLICT at ${u.file}:${u.line}`
      : `unique (${u.columns.join(', ')}) on ${u.table}: NO DDL in the repository declares it, but ON CONFLICT at ${u.file}:${u.line} needs it`;
    emit(`${note}\n-- (fails if the table already holds duplicate rows for these columns: check before running)`,
      `CREATE UNIQUE INDEX IF NOT EXISTS ${idx} ON ${u.table} (${u.columns.join(', ')});`);
  }
  if (statements.length === 0 && unresolvable.length === 0) lines.push('-- nothing to create: every required table, column and unique constraint exists.');
  return { text: lines.join('\n'), statements, unresolvable };
}

module.exports = {
  ReadOnlyViolation, assertReadOnlySql, makeReadOnlyClient, maskSql,
  CATALOG_SQL, fetchCatalog, parseUniqueIndexDef, checkCatalog, buildFixSql, pickVariant, mysqlToPg,
};
