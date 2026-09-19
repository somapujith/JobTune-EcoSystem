#!/usr/bin/env node
'use strict';

/**
 * check-schema.js  (ADR-001 section 6.5: the Worker excludes all boot-time schema creation)
 *
 * The Worker never runs initializeTables / runMigrations / ensureTables or the per-route module-load
 * `CREATE TABLE IF NOT EXISTS` blocks, so every table / column / unique constraint its SQL touches must
 * already exist in the target Neon database. This tool makes that checkable BEFORE a traffic cutover.
 *
 *   node backend/scripts/migration/check-schema.js                      offline scan (same as --extract)
 *   node backend/scripts/migration/check-schema.js --extract --out required-schema.json --md docs/migration/required-schema.md
 *   DATABASE_URL=<neon BRANCH url> node backend/scripts/migration/check-schema.js --check [--print-fix-sql]
 *
 * See --help for every option. Helper modules live in ./schema/.
 */

const fs = require('fs');
const path = require('path');

const BACKEND_DIR = path.resolve(__dirname, '..', '..');
const SCRIPT_REL = 'backend/scripts/migration/check-schema.js';

const HELP = `check-schema.js - which database schema does the Cloudflare Worker's SQL need, and does the target DB have it?

USAGE
  node ${SCRIPT_REL} [--extract] [options]           offline (default): scan, resolve against the known DDL, report
  node ${SCRIPT_REL} --check [options]               also compare with a live database (read-only)

MODES
  --extract            OFFLINE. Statically scan backend/src/worker/**/*.js SQL (real parser, @babel/parser), list the
                       tables and columns referenced (with file:line evidence) and label each with where its DDL comes
                       from: database.sql | Express boot at <file:line> | migration file | NOT FOUND ANYWHERE.
                       Opens no connection, reads no .env, needs no environment variable.
  --check              Needs a connection string in the environment AT RUNTIME (default variable: DATABASE_URL; set
                       it in your shell, this tool never reads backend/.env). Connects with pg and runs ONLY fixed,
                       read-only catalog SELECTs: information_schema.tables, information_schema.columns, pg_constraint,
                       pg_indexes (plus identity: current_database(), current_schema(), server_version). Reports
                       missing tables, missing columns and missing UNIQUE/PRIMARY KEY constraints for every
                       ON CONFLICT target. Exit code 1 if anything is missing.
                       Run it against a Neon BRANCH of the target database first, never first against production.
                       Use the owner role: information_schema only lists objects the connecting role may access.
                       Existence only: column types, defaults, non-unique indexes, foreign keys and row data are not compared.

OUTPUT OPTIONS
  --print-fix-sql      Print the CREATE TABLE / ALTER TABLE ... ADD COLUMN / CREATE UNIQUE INDEX statements (taken from
                       the repository's known DDL) that would create what is missing (with --check) or, without --check,
                       everything the Worker needs. The statements are PRINTED ONLY: this tool NEVER executes them.
                       Every statement it sends to a database must pass a guard that refuses anything that is not a
                       single plain SELECT. You review the DDL and run it yourself, on a branch.
  --out <file>         Write the full result as JSON (no credentials, no timestamps).
  --md <file>          Write the human-readable Markdown report (this is how docs/migration/required-schema.md is made).
  --json               Print the JSON on stdout instead of the text report.
  --verbose            Per-column detail (confidence, DDL source, evidence) in the text report.
  --strict             In --extract mode exit 1 when the Worker references a table/column/ON CONFLICT target that no DDL
                       in the repository defines.

INPUT OPTIONS
  --worker-dir <dir>   Directory to scan (default backend/src/worker).
  --include-example    Also scan routes/_example.js (the foundation's sample route, excluded by default).
  --no-git             Do not run the read-only git commands (status, show HEAD:<file>) that flag DDL existing only in
                       uncommitted edits (e.g. a table that only the working-tree runMigrations.js creates).
  --url-env <NAME>     Environment variable that holds the connection string for --check (default DATABASE_URL).
  --help               This text.

EXIT CODES
  0  ok            1  something missing (--check) / --strict finding (--extract)            2  usage error or could not run

SAFETY
  * never prints the connection string, user or password (only host / database name, so you can see which target you hit)
  * never executes DDL: --print-fix-sql prints, nothing more; the only SQL ever sent is the guarded catalog SELECTs
  * no npm install, no deploy, no writes anywhere except the files named by --out / --md
`;

function parseArgs(argv) {
  const o = {
    mode: 'extract', printFixSql: false, out: null, md: null, json: false, verbose: false, strict: false, workerDir: null,
    includeExample: false, urlEnv: 'DATABASE_URL', help: false, noGit: false, errors: [],
  };
  const need = (i, name) => {
    if (i + 1 >= argv.length || argv[i + 1].startsWith('--')) { o.errors.push(`${name} needs a value`); return null; }
    return argv[i + 1];
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case '--extract': o.mode = o.mode === 'check' ? 'check' : 'extract'; break;
      case '--check': o.mode = 'check'; break;
      case '--print-fix-sql': o.printFixSql = true; break;
      case '--json': o.json = true; break;
      case '--verbose': o.verbose = true; break;
      case '--strict': o.strict = true; break;
      case '--include-example': o.includeExample = true; break;
      case '--no-git': o.noGit = true; break;
      case '--help': case '-h': o.help = true; break;
      case '--out': o.out = need(i, a); i++; break;
      case '--md': o.md = need(i, a); i++; break;
      case '--worker-dir': o.workerDir = need(i, a); i++; break;
      case '--url-env': o.urlEnv = need(i, a) || o.urlEnv; i++; break;
      default: o.errors.push(`unknown option ${a}`);
    }
  }
  return o;
}

/** Remove anything credential-like from a message before it is printed. */
function scrub(message, url) {
  let m = String(message == null ? '' : message);
  const secrets = [];
  if (url) {
    secrets.push(url);
    try {
      const u = new URL(url);
      if (u.password) secrets.push(u.password, decodeURIComponent(u.password));
      if (u.username) secrets.push(u.username, decodeURIComponent(u.username));
    } catch (e) { /* not a URL: only the raw value is scrubbed */ }
  }
  for (const s of secrets.filter((x) => x && x.length >= 3)) m = m.split(s).join('***');
  return m.replace(/\b[a-z][a-z0-9+.-]*:\/\/[^\s/@]+@/gi, (x) => `${x.split('://')[0]}://***@`);
}

/** host + database of a connection string, for "which target am I hitting" (never user / password / query). */
function describeTarget(url) {
  try {
    const u = new URL(url);
    return `${u.hostname}${u.port ? ':' + u.port : ''}/${decodeURIComponent(u.pathname.replace(/^\//, ''))}`;
  } catch (e) {
    return '(unparseable connection string)';
  }
}

function defaultPgFactory(url) {
  const { Client } = require('pg');
  const cfg = {
    connectionString: url,
    connectionTimeoutMillis: 20000,
    query_timeout: 30000,
    application_name: 'jobtune-check-schema',
  };
  try {
    if (/neon\.tech$/i.test(new URL(url).hostname)) cfg.ssl = { rejectUnauthorized: true };
  } catch (e) { /* leave to pg */ }
  return new Client(cfg);
}

function buildResult({ backendDir, workerDir, includeExample, useGit = true, git = null }) {
  const { buildKnownDdl, gitDdlStatus } = require('./schema/ddlModel');
  const { extractRequirements, resolveRequirements, compareWithExpress } = require('./schema/requirements');
  const model = buildKnownDdl({ backendDir });
  const req = extractRequirements({ backendDir, workerDir, includeExample });
  // read-only git (status, show HEAD:file) so DDL that exists only in uncommitted edits can be flagged
  let gitInfo = null;
  if (useGit) {
    try { gitInfo = gitDdlStatus({ backendDir, files: model.sourcesScanned, git }); } catch (e) { gitInfo = null; }
  }
  const resolved = resolveRequirements(req, model, { git: gitInfo });

  // The same extraction over the Express runtime SQL (not the boot DDL files): (1) parity, a faithful port needs
  // exactly what Express needs; (2) does Express reference the same "declared nowhere" table / column?
  const expressRefs = new Map();
  try {
    const dirs = ['routes', 'services', 'middleware', 'utils', 'config'].map((d) => path.join(backendDir, 'src', d)).filter((d) => fs.existsSync(d));
    const ex = extractRequirements({
      backendDir, dirs, excludeFiles: ['src/utils/initializeTables.js', 'src/utils/runMigrations.js'],
    });
    resolved.findings.expressParity = compareWithExpress(req, ex);
    const wantTables = new Set(resolved.findings.notFoundTables);
    const wantCols = new Set(resolved.findings.notFoundColumns.map((c) => `${c.table}.${c.column}`));
    for (const [name, t] of ex.tables) {
      if (wantTables.has(name)) expressRefs.set(name, [...t.files].flatMap(([file, f]) => [...f.lines].map((line) => ({ file, line }))));
      for (const [cname, c] of t.columns) if (wantCols.has(`${name}.${cname}`)) expressRefs.set(`${name}.${cname}`, c.evidence);
    }
  } catch (e) {
    resolved.findings.expressParity = null; // a nicety, never fatal
  }
  return { model, req, resolved, expressRefs };
}

function toJson(resolved, check, fixSql) {
  const out = {
    tool: 'check-schema',
    schemaVersion: 1,
    summary: resolved.summary,
    findings: resolved.findings,
    tables: resolved.tables,
    ambiguousColumns: resolved.ambiguous,
    meta: resolved.meta,
  };
  if (check) out.check = check;
  if (fixSql) out.fixSql = fixSql; // printed only, never executed
  return JSON.stringify(out, null, 2);
}

function missingForFix(resolved, check) {
  if (check) {
    return {
      tables: check.missingTables.map((t) => ({ table: t.table, columns: t.columns, conflicts: resolved.tables.find((x) => x.name === t.table).conflicts })),
      columns: check.missingColumns.map((c) => ({ table: c.table, column: c.column })),
      uniques: check.missingUniques,
    };
  }
  // offline: everything the Worker needs
  return {
    tables: resolved.tables.map((t) => ({ table: t.name, columns: t.columns.map((c) => c.name), conflicts: t.conflicts })),
    columns: [],
    uniques: resolved.tables.flatMap((t) => t.conflicts
      .filter((c) => c.needsUnique && c.status === 'not-found' && t.ddl.defined)
      .map((c) => ({ table: t.name, columns: c.columns, constraint: c.constraint, file: c.file, line: c.line }))),
  };
}

async function run(argv, io = {}) {
  const out = io.stdout || ((s) => process.stdout.write(`${s}\n`));
  const err = io.stderr || ((s) => process.stderr.write(`${s}\n`));
  const env = io.env || process.env;
  const backendDir = io.backendDir || BACKEND_DIR;
  const pgFactory = io.pgFactory || defaultPgFactory;

  const o = parseArgs(argv);
  if (o.help) { out(HELP); return 0; }
  if (o.errors.length) {
    err(`check-schema: ${o.errors.join('; ')}\nRun with --help for usage.`);
    return 2;
  }

  let built;
  try {
    built = buildResult({
      backendDir,
      workerDir: o.workerDir ? path.resolve(o.workerDir) : null,
      includeExample: o.includeExample,
      useGit: !o.noGit && !io.noGit,
      git: io.git || null,
    });
  } catch (e) {
    err(`check-schema: ${e.message}`);
    return 2;
  }
  const { model, resolved, expressRefs } = built;
  const render = require('./schema/render');
  const prefixMap = render.routePrefixMap(backendDir);

  let check = null;
  let identity = null;
  let executed = [];
  let exit = 0;

  if (o.mode === 'check') {
    const url = env[o.urlEnv];
    if (!url) {
      err(`check-schema: --check needs a connection string in the environment variable ${o.urlEnv} (this tool does not read backend/.env).\n`
        + `  bash:        export ${o.urlEnv}='postgresql://...'   (a Neon BRANCH first)\n`
        + `  PowerShell:  $env:${o.urlEnv} = 'postgresql://...'\n`
        + 'Nothing was run.');
      return 2;
    }
    const { makeReadOnlyClient, fetchCatalog, checkCatalog } = require('./schema/liveCheck');
    const client = pgFactory(url);
    try {
      await client.connect();
    } catch (e) {
      err(`check-schema: could not connect to ${describeTarget(url)}: ${scrub(e && (e.code || e.message), url)}`);
      try { await client.end(); } catch (x) { /* ignore */ }
      return 2;
    }
    try {
      const ro = makeReadOnlyClient(client);
      const catalog = await fetchCatalog(ro);
      executed = ro.executed;
      identity = catalog.identity;
      check = checkCatalog(resolved, catalog);
      check.identity = { db: identity.db, schema: identity.schema, version: identity.version };
    } catch (e) {
      err(`check-schema: catalog query failed: ${scrub(e && e.message, url)}`);
      try { await client.end(); } catch (x) { /* ignore */ }
      return 2;
    }
    try { await client.end(); } catch (e) { /* ignore */ }
    // which target was hit, so a wrong branch / production is visible; stderr keeps --json output parseable
    (o.json ? err : out)(`Target: ${describeTarget(url)} (connection string, user and password are never printed)`);
    exit = check.ok ? 0 : 1;
  }

  let fix = null;
  if (o.printFixSql) {
    const { buildFixSql } = require('./schema/liveCheck');
    fix = buildFixSql(model, missingForFix(resolved, check));
  }

  if (o.out) {
    fs.mkdirSync(path.dirname(path.resolve(o.out)), { recursive: true });
    fs.writeFileSync(o.out, `${toJson(resolved, check)}\n`);
  }
  if (o.md) {
    fs.mkdirSync(path.dirname(path.resolve(o.md)), { recursive: true });
    const cmd = `node ${SCRIPT_REL} --extract --md ${o.md.replace(/\\/g, '/').replace(/^.*?(docs\/)/, '$1')}`;
    fs.writeFileSync(o.md, `${render.renderMarkdown(resolved, { prefixMap, command: cmd, expressRefs })}\n`);
  }

  if (o.mode !== 'check' && o.strict) {
    const f = resolved.findings;
    if (f.notFoundTables.length || f.notFoundColumns.length || f.conflictsNoUnique.length || f.ambiguousNotFound.length) exit = 1;
  }

  if (o.json) {
    out(toJson(resolved, check, fix && fix.text));
  } else if (o.mode === 'check') {
    out(render.renderCheckText(check, { identity, resolved, executed }));
    if (o.verbose) out(`\nStatements executed:\n${executed.map((s) => `  ${s}`).join('\n')}`);
  } else {
    out(render.renderSummaryText(resolved));
    out('');
    out(render.renderFindingsText(resolved));
    out('');
    out(render.renderTableText(resolved, { verbose: o.verbose, prefixMap }));
    if (o.out) out(`\nJSON written to ${o.out}`);
    if (o.md) out(`Markdown written to ${o.md}`);
  }

  if (fix && !o.json) {
    out('');
    out(fix.text);
  }
  return exit;
}

module.exports = { run, parseArgs, scrub, describeTarget, buildResult, HELP };

if (require.main === module) {
  run(process.argv.slice(2)).then((code) => { process.exitCode = code; }, (e) => {
    process.stderr.write(`check-schema: ${scrub(e && e.message)}\n`);
    process.exitCode = 2;
  });
}
