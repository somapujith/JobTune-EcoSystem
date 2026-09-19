#!/usr/bin/env node
'use strict';

/**
 * replay-boot-ddl.js - replay the DDL that Express creates OUTSIDE initializeTables / runMigrations / ensureTables
 * on a THROWAWAY LOCAL PostgreSQL, so the Worker's SQL can be validated against a real schema (validate-sql.js).
 *
 * Phases (each needs `--db-url-env NAME`; the URL is read from that environment variable, never from a file):
 *   --phase routes        the per-route module-load `CREATE TABLE IF NOT EXISTS` / `ALTER TABLE` blocks that live inside
 *                         src/routes/*.js (route files are NOT required: they would open pools/servers). The statements
 *                         are taken from the same static scanner the schema checker uses (schema/jsSql.js, mode 'ddl')
 *                         and replayed in the order app.js requires the route files.
 *   --phase migrations    src/migrations/*.sql (loaded by no Express code), one file per statement batch.
 *   --phase database-sql  database.sql (MySQL dialect). Meant for a scratch schema: use --schema and --drop-schema.
 *                         Every statement is tried on its own and the Postgres error is reported (nothing is fixed).
 *   --phase all           routes + migrations
 *
 *   --schema NAME         create (if needed) and use this schema via search_path (default: the connection default)
 *   --drop-schema         DROP SCHEMA NAME CASCADE at the end (only with --schema; never with the default schema)
 *   --reset-schema        DROP SCHEMA NAME CASCADE; CREATE SCHEMA NAME before replaying (only with --schema, or with
 *                         --reset-public for the public schema). Everything is inside the one database the URL names.
 *   --json                machine-readable result
 *
 * Real Express boot order (server.js): require('./app') loads every route file FIRST (their module-load DDL starts
 * running immediately), THEN `initializeTables()`, `runMigrations()`, `sessionService.ensureTables()` run. So in a
 * database Express created from scratch the route shapes of mock_interviews / learning_roadmaps / learning_streaks /
 * resumes usually win the CREATE race. To reproduce that order: `--phase routes` first, then scripts/init_db.js.
 *
 * SAFETY: refuses any host other than localhost / 127.0.0.1 / ::1 / db (no override: this script executes DDL).
 * Prints host + database only, never the URL, user or password.
 */

const fs = require('fs');
const path = require('path');

const BACKEND_DIR = path.resolve(__dirname, '..', '..');
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]', 'db']);

function parseArgs(argv) {
  const o = { phase: null, urlEnv: null, schema: null, dropSchema: false, resetSchema: false, resetPublic: false, json: false, errors: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const val = () => { const v = argv[i + 1]; if (v == null || v.startsWith('--')) { o.errors.push(`${a} needs a value`); return null; } i++; return v; };
    if (a === '--phase') o.phase = val();
    else if (a === '--db-url-env') o.urlEnv = val();
    else if (a === '--schema') o.schema = val();
    else if (a === '--drop-schema') o.dropSchema = true;
    else if (a === '--reset-schema') o.resetSchema = true;
    else if (a === '--reset-public') o.resetPublic = true;
    else if (a === '--json') o.json = true;
    else if (a === '--help' || a === '-h') o.help = true;
    else o.errors.push(`unknown option ${a}`);
  }
  if (!o.help) {
    if (!['routes', 'migrations', 'database-sql', 'all'].includes(o.phase)) o.errors.push('--phase must be routes | migrations | database-sql | all');
    if (!o.urlEnv) o.errors.push('--db-url-env NAME is required');
    if (o.schema && !/^[a-z_][a-z0-9_]{0,62}$/.test(o.schema)) o.errors.push('--schema must match [a-z_][a-z0-9_]*');
    if (o.dropSchema && !o.schema) o.errors.push('--drop-schema needs --schema');
    if (o.resetSchema && !o.schema) o.errors.push('--reset-schema needs --schema (use --reset-public for the public schema)');
    if (o.phase === 'database-sql' && !o.schema) o.errors.push('--phase database-sql needs --schema (a scratch schema: it is MySQL dialect and mostly fails)');
  }
  return o;
}

/** The route files in the order app.js requires them. */
function routeRequireOrder(backendDir) {
  const app = fs.readFileSync(path.join(backendDir, 'src', 'app.js'), 'utf8');
  const out = [];
  const re = /require\('\.\/routes\/([A-Za-z0-9_]+)'\)/g;
  let m;
  while ((m = re.exec(app))) out.push(`src/routes/${m[1]}.js`);
  return out;
}

/** DDL statements (CREATE / ALTER only, no bound parameters) of one route file, in source order. */
function routeDdlStatements(backendDir, rel) {
  const { scanSource } = require('./schema/jsSql');
  const source = fs.readFileSync(path.join(backendDir, rel), 'utf8');
  if (!/CREATE\s+(?:UNIQUE\s+)?(?:TABLE|INDEX)|ALTER\s+TABLE/i.test(source)) return [];
  const scanned = scanSource(source, { file: rel, mode: 'ddl' });
  const out = [];
  for (const site of scanned.sites) {
    const text = site.alt.text.trim();
    if (!/^(?:CREATE|ALTER)\b/i.test(text)) continue; // INSERT INTO ... etc. are runtime SQL, not schema
    if (/\$\d/.test(text)) continue;
    if (/__\$DYN_\d+\$__/.test(text)) { out.push({ file: rel, line: site.line, text, skipped: 'unresolved dynamic fragment' }); continue; }
    out.push({ file: rel, line: site.line, text });
  }
  return out;
}

function describeTarget(url) {
  try {
    const u = new URL(url);
    return { host: u.hostname, db: decodeURIComponent(u.pathname.replace(/^\//, '')), text: `${u.hostname}${u.port ? `:${u.port}` : ''}/${decodeURIComponent(u.pathname.replace(/^\//, ''))}` };
  } catch (e) {
    return null;
  }
}

function scrub(msg, url) {
  let m = String(msg == null ? '' : msg);
  try {
    const u = new URL(url);
    for (const s of [u.password, u.username, url].filter((x) => x && x.length >= 3)) m = m.split(s).join('***');
  } catch (e) { /* ignore */ }
  return m;
}

async function main(argv, io = {}) {
  const out = io.stdout || ((s) => process.stdout.write(`${s}\n`));
  const err = io.stderr || ((s) => process.stderr.write(`${s}\n`));
  const env = io.env || process.env;
  const o = parseArgs(argv);
  if (o.help) { out(fs.readFileSync(__filename, 'utf8').split('*/')[0]); return 0; }
  if (o.errors.length) { err(`replay-boot-ddl: ${o.errors.join('; ')}`); return 2; }
  const url = env[o.urlEnv];
  if (!url) { err(`replay-boot-ddl: environment variable ${o.urlEnv} is not set`); return 2; }
  const target = describeTarget(url);
  if (!target) { err('replay-boot-ddl: the connection string is not a URL'); return 2; }
  if (!LOCAL_HOSTS.has(target.host.toLowerCase())) {
    err(`replay-boot-ddl: refusing to run DDL against non-local host ${target.host} (only localhost / 127.0.0.1 / ::1 / db; there is no override)`);
    return 2;
  }
  const { Client } = require('pg');
  const client = new Client({
    connectionString: url,
    ...(o.schema ? { options: `-c search_path=${o.schema}` } : {}),
    application_name: 'jobtune-replay-boot-ddl',
  });
  const log = [];
  const record = (phase, kind, file, line, ok, error) => log.push({ phase, kind, file, line, ok, error: error || null });
  out(`Target: ${target.text} (connection string never printed)${o.schema ? `, schema ${o.schema}` : ''}`);
  try {
    await client.connect();
  } catch (e) {
    err(`replay-boot-ddl: could not connect: ${scrub(e.code || e.message, url)}`);
    return 2;
  }
  try {
    if (o.schema && o.resetSchema) await client.query(`DROP SCHEMA IF EXISTS ${o.schema} CASCADE`);
    if (o.resetPublic) {
      await client.query('DROP SCHEMA IF EXISTS public CASCADE');
      await client.query('CREATE SCHEMA public');
    }
    if (o.schema) await client.query(`CREATE SCHEMA IF NOT EXISTS ${o.schema}`);

    const runOne = async (phase, kind, file, line, text) => {
      try {
        await client.query(text);
        record(phase, kind, file, line, true);
      } catch (e) {
        record(phase, kind, file, line, false, { message: e.message, code: e.code, position: e.position || null });
        // a failed statement inside an implicit transaction is rolled back by the server; the connection stays usable
      }
    };

    if (o.phase === 'routes' || o.phase === 'all') {
      for (const rel of routeRequireOrder(BACKEND_DIR)) {
        for (const st of routeDdlStatements(BACKEND_DIR, rel)) {
          if (st.skipped) { record('routes', 'route-ddl', st.file, st.line, false, { message: `skipped: ${st.skipped}` }); continue; }
          await runOne('routes', 'route-ddl', st.file, st.line, st.text);
        }
      }
    }
    if (o.phase === 'migrations' || o.phase === 'all') {
      const dir = path.join(BACKEND_DIR, 'src', 'migrations');
      for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.sql')).sort()) {
        await runOne('migrations', 'sql-file', `src/migrations/${f}`, 1, fs.readFileSync(path.join(dir, f), 'utf8'));
      }
    }
    if (o.phase === 'database-sql') {
      const { tokenize, buildTree, splitStatements } = require('./schema/sqlTokens');
      const text = fs.readFileSync(path.join(BACKEND_DIR, 'database.sql'), 'utf8');
      const lineOf = (off) => text.slice(0, off).split('\n').length;
      for (const st of splitStatements(buildTree(tokenize(text)))) {
        if (!st.length) continue;
        await runOne('database-sql', 'statement', 'database.sql', lineOf(st[0].s), text.slice(st[0].s, st[st.length - 1].e));
      }
    }
    if (o.schema && o.dropSchema) await client.query(`DROP SCHEMA IF EXISTS ${o.schema} CASCADE`);
  } finally {
    try { await client.end(); } catch (e) { /* ignore */ }
  }

  const failed = log.filter((l) => !l.ok);
  if (o.json) out(JSON.stringify({ target: target.text, schema: o.schema, log }, null, 2));
  else {
    for (const l of log) out(`${l.ok ? 'OK   ' : 'FAIL '} ${l.phase.padEnd(12)} ${l.file}:${l.line}${l.ok ? '' : `  ${l.error.code || ''} ${l.error.message}`}`);
    out(`${log.length - failed.length} statements applied, ${failed.length} failed`);
  }
  return failed.length ? 1 : 0;
}

module.exports = { parseArgs, routeRequireOrder, routeDdlStatements, main };

if (require.main === module) {
  main(process.argv.slice(2)).then((c) => { process.exitCode = c; }, (e) => { process.stderr.write(`replay-boot-ddl: ${e.message}\n`); process.exitCode = 2; });
}
