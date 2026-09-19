'use strict';

/**
 * render.js - human-readable output (terminal text and the Markdown document) for check-schema.js.
 * Pure string builders over the Resolved structure from requirements.resolveRequirements().
 */

const fs = require('fs');
const path = require('path');

const short = (f) => String(f).replace(/^src\/worker\//, '').replace(/^src\//, '');
const uniq = (a) => [...new Set(a)];
const cell = (s) => String(s).replace(/\|/g, '\\|').replace(/\n/g, '<br>');
const cols = (list, n) => (list.length > n ? `${list.slice(0, n).join(', ')}, +${list.length - n} more` : list.join(', '));

/** Worker route file (by base name) -> ['/api/x', ...], from the Worker's own mount files. Best effort. */
function routePrefixMap(backendDir) {
  const map = new Map();
  const dir = path.join(backendDir, 'src', 'worker', 'routes', 'mounts');
  if (!fs.existsSync(dir)) return map;
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.js') && n !== 'index.js').sort()) {
    const text = fs.readFileSync(path.join(dir, f), 'utf8');
    const vars = new Map();
    for (const m of text.matchAll(/(?:const|let|var)\s+(\w+)\s*=\s*require\(\s*['"]\.\.\/([\w./-]+)['"]\s*\)/g)) vars.set(m[1], m[2]);
    for (const m of text.matchAll(/mountRoutes\(\s*\w+\s*,\s*['"]([^'"]+)['"]\s*,\s*(\w+)\s*\)/g)) {
      const mod = vars.get(m[2]);
      if (!mod) continue;
      const base = mod.replace(/\.js$/, '');
      if (!map.has(base)) map.set(base, []);
      if (!map.get(base).includes(m[1])) map.get(base).push(m[1]);
    }
  }
  return map;
}

/** { prefixes:[..], shared:[..] } for a table's Worker files */
function usageOf(t, prefixMap) {
  const prefixes = [];
  const shared = [];
  for (const wf of t.workerFiles) {
    const rel = wf.file.replace(/^src\/worker\//, '');
    const m = /^routes\/([^/]+)\.js$/.exec(rel);
    if (m && prefixMap.has(m[1])) prefixes.push(...prefixMap.get(m[1]));
    else if (m) prefixes.push(`(routes/${m[1]}.js: unmounted)`);
    else shared.push(rel);
  }
  return { prefixes: uniq(prefixes).sort(), shared: uniq(shared).sort() };
}

function ddlKindLabel(t) {
  if (!t.ddl.defined) return 'NOT FOUND ANYWHERE';
  const parts = [];
  if (t.ddl.kinds.includes('database.sql')) parts.push(t.ddl.mysqlOnly ? 'database.sql (MySQL only)' : 'database.sql');
  else if (t.ddl.kinds.length && t.ddl.pgKinds.length === 0) parts.push('(MySQL only)');
  if (t.ddl.kinds.includes('migration')) parts.push('migration file');
  if (t.ddl.kinds.includes('boot')) parts.push('Express boot');
  return parts.join(' + ');
}

/** Distinct DDL locations of a table, one entry per file (boot files list every line). */
function ddlLocations(t) {
  const byFile = new Map();
  for (const s of t.ddl.sources) {
    const k = `${s.kind}|${s.file}`;
    if (!byFile.has(k)) byFile.set(k, { kind: s.kind, file: s.file, lines: [], dialect: s.dialect });
    byFile.get(k).lines.push(s.line);
  }
  return [...byFile.values()].map((e) => {
    if (e.kind === 'database.sql') return `database.sql${e.dialect === 'mysql' ? ' (MySQL dialect)' : ''}`;
    if (e.kind === 'migration') return `migration file ${e.file}`;
    return `Express boot at ${e.file}:${uniq(e.lines).join(',')}`;
  });
}

/* ------------------------------------------------------------------------------------------------ */
/* terminal text                                                                                     */
/* ------------------------------------------------------------------------------------------------ */

function renderSummaryText(r) {
  const s = r.summary;
  const L = [];
  L.push(`Worker SQL scanned: ${s.workerFiles} files, ${s.sqlSites} SQL statements (${s.literalSites} more found as free-standing SQL literals)`);
  L.push(`Referenced by the Worker: ${s.tablesReferenced} tables, ${s.columnsReferenced} columns, ${s.onConflictTargets} ON CONFLICT targets`);
  L.push('');
  L.push('Where the DDL for those tables comes from (repository only; the live DB is not consulted):');
  L.push(`  defined in database.sql .................. ${String(s.inDatabaseSql).padStart(3)}   (${s.inDatabaseSqlMysqlOnly} of them ONLY as MySQL-dialect DDL)`);
  L.push(`  migration file, not in database.sql ...... ${String(s.inMigrationFileNotDatabaseSql).padStart(3)}   (${s.inMigrationFileAndBoot} of them also created by Express boot)`);
  L.push(`  Express boot DDL only .................... ${String(s.bootOnly).padStart(3)}`);
  L.push(`  NOT FOUND ANYWHERE ....................... ${String(s.notFound).padStart(3)}`);
  L.push(`  => exist ONLY because Express boot created them (no standalone Postgres DDL file): ${s.existsOnlyBecauseBoot}`);
  L.push(`  columns referenced but declared nowhere: ${s.columnsNotFound}    ON CONFLICT targets with no matching unique in any DDL: ${s.onConflictNoUnique}    tables with conflicting CREATE statements: ${s.driftTables}`);
  const p = r.findings.expressParity;
  if (p) {
    L.push(`  parity with the Express runtime SQL: Worker-only ${p.workerOnlyTables.length} tables / ${p.workerOnlyColumns.length} columns, Express-only ${p.expressOnlyTables.length} tables / ${p.expressOnlyColumns.length} columns`);
  }
  return L.join('\n');
}

function renderFindingsText(r) {
  const f = r.findings;
  const L = [];
  const evid = (ev) => ev.slice(0, 3).map((e) => `${short(e.file)}:${e.line}`).join(', ');
  if (f.notFoundTables.length) {
    L.push('FINDING - referenced by the Worker, defined NOWHERE in the repository:');
    for (const n of f.notFoundTables) {
      const t = r.tables.find((x) => x.name === n);
      L.push(`  table ${n}  (${t.workerFiles.map((w) => `${short(w.file)}:${w.lines.join('/')}`).join(', ')})${t.guarded ? '  [all uses inside try/catch]' : ''}`);
    }
  }
  if (f.notFoundColumns.length) {
    L.push('FINDING - columns referenced by the Worker, declared NOWHERE (table itself is known):');
    for (const c of f.notFoundColumns) L.push(`  ${c.table}.${c.column} (${c.confidence})  ${evid(c.evidence)}`);
  }
  if (f.ambiguousNotFound.length) {
    L.push('FINDING - unqualified columns in multi-table queries that none of the joined tables declare:');
    for (const m of f.ambiguousNotFound) L.push(`  ${m.column} in [${m.candidates.join(', ')}]  ${short(m.file)}:${m.line}`);
  }
  if (f.conflictsNoUnique.length) {
    L.push('FINDING - ON CONFLICT targets with no matching UNIQUE/PRIMARY KEY in any known DDL:');
    for (const c of f.conflictsNoUnique) L.push(`  ${c.table} (${c.columns.join(', ') || c.constraint})  ${short(c.file)}:${c.line}`);
  }
  if (f.mysqlOnlyTables.length) L.push(`FINDING - DDL exists only in MySQL-dialect database.sql (cannot have been applied to Postgres as written): ${f.mysqlOnlyTables.join(', ')}`);
  if (f.workerDdl.length) {
    L.push('FINDING - the Worker issues DDL (it must not, ADR 6.5):');
    for (const d of f.workerDdl) L.push(`  ${d.kind} at ${short(d.file)}:${d.line}`);
  }
  if (f.drift.length) {
    L.push('DRIFT - tables whose CREATE statements disagree across the repository:');
    for (const d of f.drift) {
      const bits = [];
      if (d.columnDiffs.length) bits.push(`${d.columnDiffs.length} column(s) differ`);
      if (d.typeDiffs.length) bits.push(`type differs: ${d.typeDiffs.map((x) => x.column).join(', ')}`);
      if (d.uniqueDiffs.length) bits.push(`unique differs: ${d.uniqueDiffs.map((x) => `(${x.key})`).join(', ')}`);
      const inW = r.tables.some((t) => t.name === d.table) ? '  [used by Worker]' : '';
      L.push(`  ${d.table}: ${bits.join('; ')}${inW}`);
    }
  }
  if (f.dynamics.length || f.unresolved.length) {
    L.push(`NOT STATICALLY CHECKABLE - dynamic SQL fragments: ${f.dynamics.length}, unresolvable .query() arguments: ${f.unresolved.length}`);
    for (const d of f.dynamics) L.push(`  ${d.kind === 'fragment' ? 'SQL fragment' : `${d.kind} name`} built at runtime at ${short(d.file)}:${d.line}  ${d.expr}`);
    for (const u of f.unresolved) L.push(`  query(${u.expr}) at ${short(u.file)}:${u.line}`);
  }
  return L.join('\n');
}

function renderTableText(r, { verbose = false, prefixMap = new Map() } = {}) {
  const rows = r.tables.map((t) => ({
    name: t.name,
    rw: t.access,
    ncols: t.columns.length,
    ddl: ddlKindLabel(t),
    boot: t.ddl.defined ? (t.ddl.existsOnlyBecauseBoot ? 'yes' : 'no') : 'n/a',
    files: t.workerFiles.map((w) => short(w.file)).join(', '),
  }));
  const w = (k, min) => Math.max(min, ...rows.map((x) => String(x[k]).length));
  const wn = w('name', 5);
  const wd = w('ddl', 10);
  const L = [];
  L.push(`${'TABLE'.padEnd(wn)}  R/W  COLS  ${'DDL SOURCE'.padEnd(wd)}  BOOT-ONLY  WORKER FILES`);
  for (const x of rows) {
    L.push(`${x.name.padEnd(wn)}  ${x.rw.padEnd(3)}  ${String(x.ncols).padStart(4)}  ${x.ddl.padEnd(wd)}  ${x.boot.padEnd(9)}  ${cols(x.files.split(', '), 4)}`);
    if (verbose) {
      const t = r.tables.find((y) => y.name === x.name);
      for (const c of t.columns) {
        const st = c.status === 'found' ? (c.bootOnly ? 'boot-only' : c.kinds.join('+')) : 'NOT FOUND ANYWHERE';
        L.push(`${' '.repeat(wn)}      .${c.name} [${c.confidence}] ${st}  ${c.evidence.slice(0, 2).map((e) => `${short(e.file)}:${e.line}`).join(', ')}`);
      }
      for (const c of t.conflicts.filter((y) => y.needsUnique)) {
        L.push(`${' '.repeat(wn)}      ON CONFLICT (${c.columns.join(', ') || c.constraint}) ${c.status}  ${short(c.file)}:${c.line}`);
      }
      const u = usageOf(t, prefixMap);
      if (u.prefixes.length) L.push(`${' '.repeat(wn)}      prefixes: ${u.prefixes.join(', ')}`);
    }
  }
  return L.join('\n');
}

function renderCheckText(result, { identity, resolved, executed }) {
  const L = [];
  const c = result.counts;
  L.push(`Live catalog: database ${identity.db || '?'}, schema ${identity.schema || '?'}, PostgreSQL ${identity.version || '?'}`);
  L.push(`Queries executed: ${executed.length} read-only catalog SELECTs (information_schema.tables/columns, pg_constraint, pg_indexes)`);
  L.push('');
  L.push(`Tables:  ${c.tablesOk}/${c.tablesRequired} present, ${c.tablesMissing} MISSING`);
  L.push(`Columns: ${c.columnsOk} present, ${c.columnsMissing} MISSING (on tables that exist)`);
  L.push(`ON CONFLICT unique constraints: ${c.uniquesOk} satisfied, ${c.uniquesMissing} MISSING`);
  if (c.ambiguousMissing) L.push(`Unqualified multi-table columns absent from every joined table: ${c.ambiguousMissing}`);
  L.push('');
  const ev = (list) => list.slice(0, 3).map((e) => `${short(e.file)}:${e.line}`).join(', ');
  if (result.missingTables.length) {
    L.push('MISSING TABLES');
    for (const t of result.missingTables) {
      const where = t.ddl.defined ? `DDL: ${ddlLocations(t).join('; ')}` : 'DDL: NOT FOUND ANYWHERE in the repository';
      L.push(`  ${t.table}   used by ${t.workerFiles.map((w) => short(w.file)).join(', ')}${t.guarded ? '  [all uses in try/catch]' : ''}`);
      L.push(`      ${where}${t.ddl.existsOnlyBecauseBoot ? '  (exists only because Express boot creates it)' : ''}`);
    }
    L.push('');
  }
  if (result.missingColumns.length) {
    L.push('MISSING COLUMNS');
    for (const m of result.missingColumns) {
      L.push(`  ${m.table}.${m.column} (${m.confidence})   ${ev(m.evidence)}   DDL: ${m.ddlStatus === 'found' ? m.sources.map((s) => (s.kind === 'database.sql' ? 'database.sql' : `${s.file}:${s.line}`)).join(', ') : 'NOT FOUND ANYWHERE'}`);
    }
    L.push('');
  }
  if (result.missingUniques.length) {
    L.push('MISSING UNIQUE / PRIMARY KEY (needed by ON CONFLICT)');
    for (const u of result.missingUniques) {
      L.push(`  ${u.table} (${u.columns.join(', ') || u.constraint})   ${short(u.file)}:${u.line}${u.ddlStatus === 'not-found' ? '   no known DDL declares it either' : ''}`);
    }
    L.push('');
  }
  if (result.ambiguousMissing.length) {
    L.push('UNQUALIFIED COLUMNS NOT FOUND IN ANY JOINED TABLE');
    for (const m of result.ambiguousMissing) L.push(`  ${m.column} in [${m.candidates.join(', ')}]   ${short(m.file)}:${m.line}`);
    L.push('');
  }
  L.push(result.ok
    ? 'RESULT: OK. Every table, column and ON CONFLICT unique constraint the Worker SQL needs exists (existence only: types, defaults, indexes and DATA are not compared).'
    : 'RESULT: FAIL. Fix the items above on the Neon branch before flipping the matching /api prefixes. (--print-fix-sql prints candidate DDL; it is never executed by this tool.)');
  return L.join('\n');
}

/* ------------------------------------------------------------------------------------------------ */
/* Markdown                                                                                          */
/* ------------------------------------------------------------------------------------------------ */

function renderMarkdown(r, { prefixMap = new Map(), command = 'node backend/scripts/migration/check-schema.js --extract --md docs/migration/required-schema.md', expressRefs = null } = {}) {
  const s = r.summary;
  const f = r.findings;
  const M = [];
  const bootTables = r.tables.filter((t) => t.ddl.existsOnlyBecauseBoot);

  M.push('# Required schema for the Cloudflare Worker');
  M.push('');
  M.push('> Generated file. Regenerate with `' + command + '` (offline, read-only, no database or network). Do not edit the tables by hand.');
  M.push('> Scope: the SQL in `backend/src/worker/**` (' + s.workerFiles + ' files, ' + s.sqlSites + ' SQL statements) resolved against every DDL the repository contains.');
  M.push('> Companion tool: `backend/scripts/migration/check-schema.js --check` compares the same requirements with a live Neon catalog.');
  M.push('');
  M.push('## Cutover prerequisite (read this first)');
  M.push('');
  M.push('The Worker never creates schema (ADR-001 section 6.5): `initializeTables`, `runMigrations`, `sessionService.ensureTables` and the per-route module-load `CREATE TABLE IF NOT EXISTS` blocks are deliberately excluded. **Every table, column and unique constraint listed below must already exist in the Neon database the Worker points at** before the `/api` prefix that uses it receives traffic. Nothing in the Worker will create a missing table; the routes will 500 (or, where the Express code swallowed the error, silently return fallback data).');
  M.push('');
  M.push(`**${bootTables.length} of the ${s.tablesReferenced} tables exist only because Express created them at boot** (no standalone Postgres DDL file defines them; \`database.sql\` is MySQL dialect and cannot have been applied to Neon). They exist in Neon only if Render has booted the current Express code against that database, or if a migration/restore carried them over. A brand-new Neon branch/project that Render never booted will lack them, and so will any table added to Express after the last Render boot.`);
  M.push('');
  const wt = f.workingTreeOnly;
  if (wt.tables.length || wt.columns.length) {
    M.push('**Some of that DDL is not even committed.** These exist only in uncommitted edits of Express boot files (compared with git `HEAD`), so Neon has them only if Render has been redeployed with those edits and booted:');
    M.push('');
    const loc = (list) => list.map((y) => '`' + y.file + ':' + y.line + '`').join(', ');
    for (const x of wt.tables) M.push('- table `' + x.table + '` (' + loc(x.sources) + ')');
    for (const x of wt.columns) M.push('- column `' + x.table + '.' + x.column + '` (' + loc(x.sources.filter((y) => y.kind === 'boot')) + ')');
    M.push('');
  }
  M.push('How to check, before flipping any prefix (read-only; run it against a Neon **branch** of the target database first, never first against production):');
  M.push('');
  M.push('```bash');
  M.push("# bash / zsh                                   PowerShell equivalent: $env:DATABASE_URL = '<branch url>'");
  M.push("export DATABASE_URL='postgresql://<user>:<password>@<branch-host>/<db>?sslmode=require'   # this shell only; never commit it");
  M.push('node backend/scripts/migration/check-schema.js --check                      # exit 0 = everything present, 1 = something missing, 2 = could not run');
  M.push('node backend/scripts/migration/check-schema.js --check --print-fix-sql      # also PRINT the CREATE/ALTER statements that would fix the gaps');
  M.push('# use another variable name to avoid touching the one Express uses:  --url-env NEON_BRANCH_URL');
  M.push('```');
  M.push('');
  M.push('The script sends only fixed catalog `SELECT`s (`information_schema.tables`, `information_schema.columns`, `pg_constraint`, `pg_indexes`), behind a guard that refuses anything that is not a single plain `SELECT`. It never prints the connection string or credentials, never reads `backend/.env`, and `--print-fix-sql` only prints: run the printed DDL yourself, on the branch.');
  M.push('');
  M.push('What `--check` does **not** prove: column types/defaults/nullability, non-unique indexes, foreign keys, and **row data**. In particular `subscription_plans` must contain the three plan rows (Express boot seeds them; `requirePlan` and `/api/subscriptions/*` read them), and `onet_occupations` / `learning_topics` are filled by seed scripts, not by boot. Check those with a `SELECT` on the branch. Use the database **owner** role: `information_schema` lists only objects the connecting role may access, so a role without privileges would report existing tables as missing.');
  M.push('');

  /* ---- boot-only tables by prefix ---- */
  M.push('### Tables to verify per `/api` prefix (boot-created only)');
  M.push('');
  const byPrefix = new Map();
  const shared = [];
  for (const t of bootTables) {
    const u = usageOf(t, prefixMap);
    for (const p of u.prefixes) { if (!byPrefix.has(p)) byPrefix.set(p, []); byPrefix.get(p).push(t.name); }
    if (u.shared.length) shared.push({ name: t.name, files: u.shared });
  }
  if (shared.length) {
    M.push('Used by shared code (services / middleware), so they gate every prefix that calls that code:');
    M.push('');
    for (const x of shared) M.push(`- \`${x.name}\` via ${x.files.map((y) => '`' + y + '`').join(', ')}`);
    M.push('');
  }
  M.push('| /api prefix | Boot-created tables the route file itself queries |');
  M.push('|---|---|');
  for (const [p, list] of [...byPrefix].sort((a, b) => a[0].localeCompare(b[0]))) M.push(`| \`${p}\` | ${uniq(list).sort().map((x) => '`' + x + '`').join(', ')} |`);
  M.push('');

  /* ---- summary ---- */
  M.push('## Summary');
  M.push('');
  M.push('| Measure | Count |');
  M.push('|---|---|');
  M.push(`| Tables referenced by the Worker | ${s.tablesReferenced} |`);
  M.push(`| Columns referenced (INSERT lists, SET targets, qualified refs, single-table selects) | ${s.columnsReferenced} |`);
  M.push(`| Defined in \`database.sql\` | ${s.inDatabaseSql} (${s.inDatabaseSqlMysqlOnly} only as MySQL DDL) |`);
  M.push(`| Defined in a migration file (\`src/migrations/*.sql\`), not in \`database.sql\` | ${s.inMigrationFileNotDatabaseSql} (${s.inMigrationFileAndBoot} also created by Express boot) |`);
  M.push(`| Defined only by Express boot DDL (initializeTables / runMigrations / route module-load / sessionService) | ${s.bootOnly} |`);
  M.push(`| **NOT FOUND ANYWHERE** | **${s.notFound}** |`);
  M.push(`| Tables whose only Postgres-applicable DDL is Express boot ("exists only because Express boot created it") | ${s.existsOnlyBecauseBoot} |`);
  M.push(`| Columns declared nowhere (table known) | ${s.columnsNotFound} |`);
  M.push(`| ON CONFLICT targets needing a unique constraint / with no matching unique in any DDL | ${s.onConflictTargets} / ${s.onConflictNoUnique} |`);
  M.push(`| Tables with conflicting CREATE statements across files (repository-wide) | ${s.driftTables} |`);
  M.push('');
  M.push('The four DDL rows (`database.sql`, migration-only, boot-only, NOT FOUND) partition the referenced tables by first match in that order; the parenthesised counts show overlap with the other sources.');
  M.push('');

  /* ---- findings ---- */
  M.push('## Findings');
  M.push('');
  const evLine = (ev) => ev.slice(0, 4).map((e) => `\`${short(e.file)}:${e.line}\``).join(', ');
  const exprefFor = (tbl, col) => {
    if (!expressRefs) return '';
    const e = expressRefs.get(col ? `${tbl}.${col}` : tbl);
    return e ? ` Express also references it (${e.slice(0, 3).map((x) => '`' + short(x.file) + ':' + x.line + '`').join(', ')}), so this is pre-existing on Render, not introduced by the port.` : '';
  };
  M.push('### 1. Tables the Worker uses that no DDL in the repository defines');
  M.push('');
  if (!f.notFoundTables.length) M.push('None.');
  for (const n of f.notFoundTables) {
    const t = r.tables.find((x) => x.name === n);
    M.push(`- **\`${n}\`**: columns used: ${cols(t.columns.map((c) => c.name), 12) || '(none determinable)'}; Worker files: ${t.workerFiles.map((w) => '`' + short(w.file) + ':' + w.lines.join('/') + '`').join(', ')}.${t.guarded ? ' Every use is inside a try/catch.' : ''}${exprefFor(n)} If this table exists in Neon it came from outside this repository (an earlier database, manual DDL). \`--check\` tells you.`);
  }
  M.push('');
  M.push('### 2. Columns the Worker uses that no DDL declares (table is known)');
  M.push('');
  if (!f.notFoundColumns.length) M.push('None.');
  for (const c of f.notFoundColumns) {
    M.push(`- **\`${c.table}.${c.column}\`** (${c.confidence}): ${evLine(c.evidence)}.${exprefFor(c.table, c.column)} No CREATE TABLE or ALTER TABLE in the repository adds it; if it exists in Neon it predates the repository's DDL. \`--check\` reports it as missing when it is not there.`);
  }
  if (f.ambiguousNotFound.length) {
    M.push('');
    for (const m of f.ambiguousNotFound) M.push(`- Unqualified column \`${m.column}\` in a query over [${m.candidates.join(', ')}] at \`${short(m.file)}:${m.line}\` matches none of those tables' known columns.`);
  }
  M.push('');
  M.push('### 3. ON CONFLICT targets and the unique constraints they need');
  M.push('');
  M.push('`INSERT ... ON CONFLICT (cols)` raises an error at runtime unless a `UNIQUE`/`PRIMARY KEY` constraint (or unique index) on exactly those columns exists. `--check` verifies this against `pg_constraint` / `pg_indexes`.');
  M.push('');
  M.push('| Table | Conflict target | Action | Worker location | Declared by (known DDL) |');
  M.push('|---|---|---|---|---|');
  for (const t of r.tables) {
    for (const c of t.conflicts.filter((x) => x.needsUnique)) {
      const decl = c.satisfiedBy.length
        ? uniq(c.satisfiedBy.map((u) => (u.source.kind === 'boot' ? `Express boot ${u.source.file}:${u.source.line}` : u.source.kind === 'migration' ? `migration ${u.source.file}` : 'database.sql'))).join('<br>')
        : '**NONE in any DDL**';
      M.push(`| \`${t.name}\` | ${cell(c.constraint ? 'ON CONSTRAINT ' + c.constraint : '(' + c.columns.join(', ') + ')' + (c.where ? ' WHERE ...' : '') + (c.exprTarget ? ' [expression]' : ''))} | ${c.action || '-'} | \`${short(c.file)}:${c.line}\` | ${cell(decl)} |`);
    }
  }
  M.push('');
  M.push('### 4. Schema drift: one table, several incompatible CREATE statements');
  M.push('');
  if (!f.drift.length) M.push('None.');
  const inWorker = new Set(r.tables.map((t) => t.name));
  const driftSorted = f.drift.slice().sort((a, b) => (inWorker.has(b.table) - inWorker.has(a.table)) || a.table.localeCompare(b.table));
  for (const d of driftSorted) {
    const t = r.tables.find((x) => x.name === d.table);
    M.push(`#### \`${d.table}\`${inWorker.has(d.table) ? ' (used by the Worker)' : ' (not referenced by the Worker)'}`);
    M.push('');
    d.variants.forEach((v, i) => {
      const cov = d.workerCoverage && d.workerCoverage[i];
      const missing = v.dialect === 'mysql' ? ' (MySQL syntax: cannot have run on Postgres, so not counted.)'
        : cov && cov.missingForWorker.length ? ` Worker columns this shape lacks: ${cov.missingForWorker.map((x) => '`' + x + '`').join(', ')}.` : (cov ? ' Covers every column the Worker uses.' : '');
      const dep = d.dependents && d.dependents[i] && d.dependents[i].length
        ? ` Worker code that needs this shape: ${uniq(d.dependents[i].flatMap((x) => x.files)).map((x) => '`' + short(x) + '`').join(', ')} (${d.dependents[i].map((x) => '`' + x.column + '`').join(', ')}).` : '';
      M.push(`- variant ${i + 1}: ${v.source.kind === 'database.sql' ? '`database.sql`' : '`' + v.source.file + ':' + v.source.line + '`'}${v.dialect === 'mysql' ? ' (MySQL dialect)' : ''} declares ${cols(v.columns.map((x) => '`' + x + '`'), 14)}.${missing}${dep}`);
    });
    const bits = [];
    if (d.columnDiffs.length) bits.push(`column sets differ: ${d.columnDiffs.map((x) => '`' + x.column + '` only in variant(s) ' + x.presentIn.map((i) => i + 1).join('/')).join('; ')}`);
    if (d.typeDiffs.length) bits.push(`type family differs: ${d.typeDiffs.map((x) => '`' + x.column + '` (' + Object.entries(x.types).map(([k, v]) => k + ' in ' + v.map((i) => i + 1).join('/')).join(' vs ') + ')').join('; ')}`);
    if (d.uniqueDiffs.length) bits.push(`unique constraints differ: ${d.uniqueDiffs.map((x) => '(' + x.key + ') only in variant(s) ' + x.presentIn.map((i) => i + 1).join('/')).join('; ')}`);
    if (d.alterReconciled && d.alterReconciled.length) bits.push(`later reconciled by ALTER TABLE ADD COLUMN: ${d.alterReconciled.map((x) => '`' + x + '`').join(', ')}`);
    if (bits.length) M.push(`- differences: ${bits.join('. ')}.`);
    if (t && d.noSingleVariant) {
      const users = uniq(t.workerFiles.map((w) => short(w.file)));
      M.push(`- **No single variant satisfies every Worker query** (Worker files touching it: ${users.map((x) => '`' + x + '`').join(', ')}). Whichever \`CREATE TABLE IF NOT EXISTS\` ran first in the live database decides which queries work; this is a pre-existing Express inconsistency the port preserves. \`--check\` shows the columns actually present.`);
    }
    M.push('');
  }
  M.push('`database.sql` and `init_admin_db.js` use MySQL syntax (`AUTO_INCREMENT`, `JSON`, `ENUM`); neither can have run on Postgres/Neon as written.');
  if (f.mysqlOnlyTables.length) M.push(`Worker-referenced tables whose only DDL is MySQL dialect: ${f.mysqlOnlyTables.map((x) => '`' + x + '`').join(', ')}.`);
  M.push('');
  M.push('### 5. Columns that exist only through Express boot on tables that also have a standalone DDL file');
  M.push('');
  const mixed = [];
  for (const t of r.tables) {
    if (t.ddl.existsOnlyBecauseBoot || !t.ddl.defined) continue;
    for (const c of t.columns) if (c.bootOnly) mixed.push({ t: t.name, c: c.name, alter: c.alterOnly, src: c.sources.filter((x) => x.kind === 'boot').slice(0, 1) });
  }
  if (!mixed.length) M.push('None.');
  for (const x of mixed) M.push(`- \`${x.t}.${x.c}\`${x.alter ? ' (added by `ALTER TABLE ... ADD COLUMN`)' : ''}: ${x.src.map((y) => '`' + y.file + ':' + y.line + '`').join(', ')}`);
  M.push('');
  M.push('### 6. SQL the scanner could not fully resolve');
  M.push('');
  if (!f.dynamics.length && !f.unresolved.length) M.push('None.');
  for (const d of f.dynamics) M.push(`- ${d.kind === 'fragment' ? 'SQL fragment' : d.kind + ' name'} built at runtime at \`${short(d.file)}:${d.line}\`: \`${cell(d.expr)}\``);
  for (const u of f.unresolved) M.push(`- \`.query(${cell(u.expr)})\` at \`${short(u.file)}:${u.line}\`: argument is not a static string (its SQL, if listed elsewhere as a literal, is still counted)`);
  M.push('');
  M.push('### 7. DDL issued by the Worker');
  M.push('');
  if (!f.workerDdl.length) M.push('None (expected: ADR 6.5).');
  for (const d of f.workerDdl) M.push(`- \`${d.kind}\` at \`${short(d.file)}:${d.line}\``);
  M.push('');
  M.push('### 8. Seed data that Express boot also writes');
  M.push('');
  const seeded = r.tables.filter((t) => t.ddl.seeds.length);
  if (!seeded.length) M.push('None among the referenced tables.');
  for (const t of seeded) M.push(`- \`${t.name}\`: rows inserted by ${t.ddl.seeds.map((x) => '`' + x.file + ':' + x.line + '`').join(', ')} (\`runMigrations.js\` also re-syncs plan price/description/features on every boot). A table that exists but is empty passes \`--check\` and still breaks plan gating.`);
  M.push('');

  M.push('### 9. Parity with the Express SQL');
  M.push('');
  const par = f.expressParity;
  if (!par) {
    M.push('Not computed.');
  } else if (!par.workerOnlyTables.length && !par.workerOnlyColumns.length && !par.expressOnlyTables.length && !par.expressOnlyColumns.length) {
    M.push('The same extraction over the Express runtime SQL (`src/routes`, `src/services`, `src/middleware`, `src/utils`, `src/config`; the boot DDL files `initializeTables.js` / `runMigrations.js` excluded) requires **exactly the same tables and columns** as the Worker: no Worker-only and no Express-only reference. So the schema requirements above are also what Render needs today; the port adds none.');
  } else {
    M.push('Compared with the same extraction over the Express runtime SQL (boot DDL files excluded). A faithful port needs exactly what Express needs.');
    M.push('');
    if (par.workerOnlyTables.length) M.push(`- Worker-only tables (Express does not query them): ${par.workerOnlyTables.map((x) => '`' + x + '`').join(', ')}`);
    for (const c of par.workerOnlyColumns) M.push('- Worker-only column `' + c.table + '.' + c.column + '`: ' + c.evidence.map((e) => '`' + short(e.file) + ':' + e.line + '`').join(', '));
    if (par.expressOnlyTables.length) M.push(`- Express-only tables (nothing in the Worker queries them yet): ${par.expressOnlyTables.map((x) => '`' + x.table + '` (' + x.files.map(short).join(', ') + ')').join(', ')}`);
    for (const c of par.expressOnlyColumns) M.push('- Express-only column `' + c.table + '.' + c.column + '`: ' + c.evidence.map((e) => '`' + short(e.file) + ':' + e.line + '`').join(', '));
  }
  M.push('');

  /* ---- main table ---- */
  M.push('## Required schema, table by table');
  M.push('');
  M.push('Legend: **R/W** = the Worker only reads (R), only writes (W) or both. **Columns**: `col` found in known DDL; `col†` declared nowhere; `col*` declared only by Express boot although the table also has a standalone DDL file; `col‡` declared only in an uncommitted edit of an Express boot file. `(try)` after a file: every query on that table in that file sits inside a `try` block (the catch may still answer 500; read the handler). Columns are those determinable from INSERT lists, UPDATE/ON CONFLICT SET targets, `alias.col` and single-table selects (multi-table unqualified names are not attributed). **Boot-only?** = the only Postgres-applicable DDL is Express boot code (yes means the table must have been created by a Render boot or restored).');
  M.push('');
  M.push('| Table | R/W | Columns the Worker uses | DDL source(s) | Exists only because Express boot created it? | Worker files | /api prefixes |');
  M.push('|---|---|---|---|---|---|---|');
  for (const t of r.tables) {
    const colTxt = t.columns.map((c) => '`' + c.name + '`' + (c.status === 'not-found' ? '†' : (!t.ddl.existsOnlyBecauseBoot && c.bootOnly ? '*' : '')) + (c.workingTreeOnly && !t.ddl.workingTreeOnly ? '‡' : '')).join(', ') || '(none determinable; SELECT * / RETURNING *)';
    const ddl = t.ddl.defined ? ddlLocations(t).join('<br>') + (t.ddl.workingTreeOnly ? '<br>**(uncommitted edit only)**' : '') : '**NOT FOUND ANYWHERE**';
    const boot = !t.ddl.defined ? 'n/a (no DDL)' : t.ddl.existsOnlyBecauseBoot ? '**yes**' : 'no';
    const u = usageOf(t, prefixMap);
    const files = t.workerFiles.map((w) => '`' + short(w.file) + '`' + (w.guarded ? ' (try)' : '')).join('<br>');
    const pre = [...u.prefixes.map((p) => '`' + p + '`'), ...(u.shared.length ? ['shared code'] : [])].join('<br>');
    M.push(`| \`${t.name}\` | ${t.access} | ${cell(colTxt)} | ${cell(ddl)} | ${boot} | ${cell(files)} | ${cell(pre)} |`);
  }
  M.push('');
  M.push('## How this was computed, and its limits');
  M.push('');
  M.push('- The Worker SQL is found by parsing each `backend/src/worker/**/*.js` file with `@babel/parser` (comments are never SQL), collecting the first argument of every `.query(...)` call (template literals, concatenations, `const` SQL, `let` SQL built with `+=`, `array.join`) plus free-standing string literals that are complete DML statements (this catches the `statusChecks` array in `routes/dashboard.js`). `${...}` fragments that cannot be resolved are listed in finding 6.');
  M.push('- Tables come from `FROM`, `JOIN`, `INSERT INTO`, `UPDATE`, `DELETE FROM`, `USING` and `ON CONFLICT`; CTE names, sub-select aliases and function tables are not tables. Column attribution is deliberately conservative: nothing is asserted for unqualified names in multi-table queries.');
  M.push('- Known DDL = `backend/database.sql`, `backend/src/migrations/*.sql`, and every `CREATE TABLE` / `CREATE INDEX` / `ALTER TABLE` string in `backend/src/**` outside the Worker (including the `for (const [col, def] of ...)` column loops in `runMigrations.js` and `routes/resume.js`, expanded statically).');
  M.push('- Nothing here reads a database. "Defined in the repository" is not "exists in Neon": that is what `--check` is for. Live-only facts (extra columns added by hand, dropped tables, different types) are invisible to this document.');
  M.push('- The files under `src/migrations/*.sql` are not loaded by any boot code; they count as standalone DDL only in the sense that a human could have applied them.');
  M.push('');
  return M.join('\n');
}

module.exports = {
  routePrefixMap, usageOf, ddlKindLabel, ddlLocations,
  renderSummaryText, renderFindingsText, renderTableText, renderCheckText, renderMarkdown, short,
};
