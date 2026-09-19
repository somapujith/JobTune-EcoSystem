#!/usr/bin/env node
'use strict';

/**
 * validate-sql.js - ask a REAL PostgreSQL whether every SQL statement of the Cloudflare Worker port is valid.
 *
 * Until this tool existed the Worker's SQL was only ever compared as TEXT with the Express originals, against
 * in-memory fakes. Nothing had been parsed by Postgres. This tool takes every statement the schema checker's extractor
 * (schema/jsSql.js, the same one check-schema.js uses) finds under backend/src/worker/** and runs
 *
 *     PREPARE jt_validate AS <statement>
 *
 * on a live database. PREPARE parses AND analyzes the statement: it validates the syntax, the existence of every
 * table / column / function referenced, operator and function resolution and `$n` parameter type inference, all
 * WITHOUT EXECUTING the statement. The extended protocol node-pg uses for a parameterized query performs the same
 * Parse/analyze step, so a statement that fails here fails in production too, and one that passes here has valid syntax,
 * tables, columns and types on that schema.
 *
 * PREPARE does NOT plan, and `ON CONFLICT (cols)` arbiter inference happens in the planner ("there is no unique or
 * exclusion constraint matching the ON CONFLICT specification" is raised at plan time, verified on PostgreSQL 17). So on
 * PostgreSQL 16+ every statement that PREPAREs cleanly also gets `EXPLAIN (GENERIC_PLAN, COSTS OFF) <statement>`: it
 * plans with `$n` placeholders and does not execute anything. The result row says which stage failed (prepare | plan).
 *
 *   node backend/scripts/migration/validate-sql.js --db-url-env NAME [--schema S] [--json] [--errors-only] [--verbose]
 *                                                  [--worker-dir DIR] [--include-example] [--allow-remote]
 *
 * SAFETY (all enforced in code, all tested)
 *   * `--db-url-env NAME` is REQUIRED: the connection string is read from that environment variable only (never from a
 *     file; no dotenv). Only host + database are printed, never the URL, user or password.
 *   * Hosts other than localhost / 127.0.0.1 / ::1 / db are refused unless `--allow-remote` is passed.
 *   * Only SELECT / INSERT / UPDATE / DELETE / WITH statements are ever sent, and only inside PREPARE. Anything else is
 *     never sent: DDL is reported as a violation (the Worker must contain none), utility statements (BEGIN, SET, ...) as
 *     SKIPPED.
 *   * Every statement runs inside `BEGIN READ ONLY` ... `ROLLBACK`, then `DEALLOCATE ALL`. PREPARE and plain EXPLAIN (no
 *     ANALYZE) cannot write, the read-only transaction is a second net, and the rollback discards even a mistake.
 *
 * Template placeholders the extractor could not resolve (`${...}`):
 *   `$${idx++}` / `$${params.length}`   a parameter index: replaced by the next unused `$n`
 *   `VALUES ${values}`                  a bulk row list: `($1, ... $k)` with k = the INSERT column count
 *   `ORDER BY ${x}` / `LIMIT ${x}`      a representative literal (`1` / `10`)
 *   anything else                       SKIPPED (dynamic SQL fragment), never guessed
 *
 * Exit codes: 0 no ERROR and no DDL violation, 1 at least one ERROR or DDL-in-Worker, 2 usage error / could not connect.
 */

const fs = require('fs');
const path = require('path');
const { scanSource } = require('./schema/jsSql');
const { tokenize, buildTree, splitStatements } = require('./schema/sqlTokens');
const { maskSql } = require('./schema/liveCheck');

const BACKEND_DIR = path.resolve(__dirname, '..', '..');
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]', 'db']);
const ALLOWED_FIRST = new Set(['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'WITH']);
const DDL_FIRST = new Set(['CREATE', 'ALTER', 'DROP', 'TRUNCATE', 'GRANT', 'REVOKE', 'COMMENT', 'REINDEX', 'CLUSTER', 'VACUUM', 'REFRESH']);
const UTILITY_FIRST = new Set([
  'BEGIN', 'START', 'COMMIT', 'END', 'ROLLBACK', 'SAVEPOINT', 'RELEASE', 'SET', 'RESET', 'SHOW', 'LOCK', 'LISTEN', 'UNLISTEN', 'NOTIFY',
  'CALL', 'DO', 'COPY', 'EXPLAIN', 'ANALYZE', 'DISCARD', 'PREPARE', 'EXECUTE', 'DEALLOCATE', 'DECLARE', 'FETCH', 'CLOSE', 'VALUES', 'TABLE',
]);
const MARKER_RE = /__\$DYN_(\d+)\$__/g;
const PREPARE_PREFIX = 'PREPARE jt_validate AS ';
const EXPLAIN_PREFIX = 'EXPLAIN (GENERIC_PLAN, COSTS OFF) ';

const HELP = `validate-sql.js - PREPARE every SQL statement of backend/src/worker/** on a real PostgreSQL (nothing is executed)

USAGE
  node backend/scripts/migration/validate-sql.js --db-url-env NAME [options]

  --db-url-env NAME   REQUIRED. Environment variable that holds the connection string (never read from a file).
  --schema S          search_path for the run (SET LOCAL inside the read-only transaction). Default: the connection default.
  --allow-remote      Permit a host other than localhost / 127.0.0.1 / ::1 / db. Without it such a host is refused.
  --worker-dir DIR    Directory to scan (default backend/src/worker).
  --include-example   Also scan routes/_example.js.
  --json              Machine-readable result on stdout.
  --errors-only       Do not list OK rows in the text table.
  --verbose           Show the SQL of ERROR rows around the error position.
  --help

Each statement runs as PREPARE (+ EXPLAIN (GENERIC_PLAN) on PostgreSQL 16+, needed to check ON CONFLICT targets) inside
BEGIN READ ONLY ... ROLLBACK. Only SELECT/INSERT/UPDATE/DELETE/WITH are ever sent, and never executed.
Exit: 0 clean, 1 ERROR or DDL-in-Worker found, 2 usage / connection problem.
`;

/* ------------------------------------------------------------------------------------------------ */
/* extraction                                                                                        */
/* ------------------------------------------------------------------------------------------------ */

function listJsFiles(dir) {
  const out = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.js')) out.push(p);
    }
  };
  if (fs.existsSync(dir)) walk(dir);
  return out.sort();
}

const toPosix = (p) => p.split(path.sep).join('/');

/** Number of columns in `INSERT INTO t (a, b, c) VALUES` located at the end of `before`, or 0 when it cannot be seen. */
function insertColumnCount(before) {
  const m = /INSERT\s+INTO\s+[\w."]+\s*\(([^)]*)\)\s*VALUES\s*$/i.exec(before);
  return m ? m[1].split(',').filter((x) => x.trim()).length : 0;
}

/**
 * Replace the extractor's `${...}` markers by something Postgres can analyze.
 * Returns { sql, notes:[string], unresolved:[{expr}] }.
 */
function substituteDynamics(text, dyns) {
  const exprOf = new Map((dyns || []).map((d) => [d.id, d.expr]));
  const stripped = text.replace(MARKER_RE, ' ');
  let next = 0;
  for (const m of stripped.matchAll(/\$(\d+)/g)) next = Math.max(next, Number(m[1]));
  const notes = [];
  const unresolved = [];
  let out = '';
  let last = 0;
  MARKER_RE.lastIndex = 0;
  let m;
  while ((m = MARKER_RE.exec(text))) {
    const before = text.slice(last, m.index);
    const expr = exprOf.get(Number(m[1])) || '?';
    out += before;
    const so_far = out;
    if (so_far.endsWith('$')) {
      // `$${idx++}`: the dollar sign is already in the output; complete it with the next parameter number
      next += 1;
      out += String(next);
      notes.push(`\`${expr}\` -> parameter $${next}`);
    } else {
      const tail = so_far.replace(/\s+/g, ' ').trimEnd();
      const cols = /VALUES$/i.test(tail) ? insertColumnCount(tail) : 0;
      if (cols) {
        const row = Array.from({ length: cols }, () => `$${++next}`).join(', ');
        out += `(${row})`;
        notes.push(`\`${expr}\` -> one VALUES row of ${cols} parameters`);
      } else if (/ORDER\s+BY$/i.test(tail)) {
        out += '1';
        notes.push(`\`${expr}\` -> ORDER BY 1`);
      } else if (/\b(?:LIMIT|OFFSET)$/i.test(tail)) {
        out += '10';
        notes.push(`\`${expr}\` -> 10`);
      } else {
        out += m[0];
        unresolved.push({ expr });
      }
    }
    last = m.index + m[0].length;
  }
  out += text.slice(last);
  return { sql: out, notes, unresolved };
}

function splitSql(sql) {
  const parts = [];
  for (const st of splitStatements(buildTree(tokenize(sql)))) {
    if (!st.length) continue;
    parts.push({ text: sql.slice(st[0].s, st[st.length - 1].e).trim(), offset: st[0].s });
  }
  return parts;
}

/**
 * 'validate' | 'ddl' | 'utility' | 'other' | 'empty'
 * `masked` is the statement with comments and string bodies blanked (so a keyword inside a string never counts).
 */
function classifyStatement(sql) {
  let masked;
  try {
    masked = maskSql(sql);
  } catch (e) {
    return { kind: 'other', word: 'dollar-quoted string' };
  }
  const w = /^\s*\(*\s*([A-Za-z_]+)/.exec(masked);
  if (!w) return { kind: 'empty', word: '' };
  const word = w[1].toUpperCase();
  if (masked.trim().startsWith('(')) return { kind: 'validate', word: 'SELECT' }; // parenthesized query: Postgres decides
  if (ALLOWED_FIRST.has(word)) return { kind: 'validate', word };
  if (DDL_FIRST.has(word)) return { kind: 'ddl', word };
  if (UTILITY_FIRST.has(word)) return { kind: 'utility', word };
  return { kind: 'other', word };
}

/**
 * Every statement of every Worker file, as rows:
 *   { id, file, line, kind:'query'|'literal', alt, part, total, sql, verb, class, notes:[], unresolved:[], siteText, offset, hasDyn, lineAt }
 * `class` is classifyStatement().kind; the caller decides what to do with each class.
 */
function collectStatements({ backendDir = BACKEND_DIR, workerDir = null, includeExample = false, sourceOverride = null } = {}) {
  const dir = workerDir || path.join(backendDir, 'src', 'worker');
  const files = sourceOverride
    ? Object.keys(sourceOverride).sort()
    : listJsFiles(dir).map((p) => toPosix(path.relative(backendDir, p)));
  const rows = [];
  const errors = [];
  for (const file of files) {
    if (!includeExample && /(^|\/)routes\/_example\.js$/.test(file)) continue;
    const source = sourceOverride ? sourceOverride[file] : fs.readFileSync(path.join(backendDir, file), 'utf8');
    let scanned;
    try {
      scanned = scanSource(source, { file, mode: 'sql' });
    } catch (e) {
      errors.push(`${file}: ${e.message}`);
      continue;
    }
    errors.push(...scanned.errors);
    const altCount = new Map();
    for (const site of scanned.sites) {
      const key = `${site.line}`;
      const altIdx = (altCount.get(key) || 0) + 1;
      altCount.set(key, altIdx);
      const sub = substituteDynamics(site.alt.text, site.alt.dyns);
      let parts;
      try {
        parts = splitSql(sub.sql);
      } catch (e) {
        parts = [{ text: sub.sql.trim(), offset: 0 }];
      }
      if (!parts.length) parts = [{ text: '', offset: 0 }];
      parts.forEach((p, i) => {
        const cls = classifyStatement(p.text);
        rows.push({
          file,
          line: site.line,
          kind: site.kind,
          alt: altIdx,
          part: i + 1,
          total: parts.length,
          sql: p.text,
          verb: cls.word,
          class: cls.kind,
          notes: sub.notes,
          unresolved: sub.unresolved,
          hasDyn: site.alt.dyns.length > 0,
          offset: p.offset,
          lineAt: site.alt.lineAt,
        });
      });
    }
  }
  return { rows, errors, files };
}

/* ------------------------------------------------------------------------------------------------ */
/* validation                                                                                        */
/* ------------------------------------------------------------------------------------------------ */

const IDENT_RE = /^[A-Za-z_][A-Za-z0-9_]{0,62}$/;

/**
 * PREPARE (and, when `plan`, EXPLAIN (GENERIC_PLAN)) each row on `client` (a connected pg Client or anything with query(text) -> Promise).
 * Returns rows with `status` 'OK' | 'ERROR' | 'SKIPPED' | 'DDL' and `detail`.
 * Nothing but PREPARE-wrapped SELECT/INSERT/UPDATE/DELETE/WITH ever reaches the client from a Worker statement.
 */
async function validateRows(client, rows, { schema = null, plan = true } = {}) {
  if (schema != null && !IDENT_RE.test(schema)) throw new Error('--schema must be a plain identifier');
  const results = [];
  for (const r of rows) {
    const base = {
      file: r.file, line: r.line, kind: r.kind, alt: r.alt, part: r.part, total: r.total, verb: r.verb, sql: r.sql, notes: r.notes,
    };
    if (r.class === 'ddl') {
      results.push({ ...base, status: 'DDL', detail: { reason: `DDL statement (${r.verb}) in the Worker: ADR-001 6.5 forbids schema changes from the Worker` } });
      continue;
    }
    if (r.class === 'utility') {
      results.push({ ...base, status: 'SKIPPED', detail: { reason: `utility statement (${r.verb}): PREPARE cannot take it, and this tool never executes` } });
      continue;
    }
    if (r.class === 'empty') {
      results.push({ ...base, status: 'SKIPPED', detail: { reason: 'empty statement' } });
      continue;
    }
    if (r.class !== 'validate') {
      results.push({ ...base, status: 'SKIPPED', detail: { reason: `not SELECT/INSERT/UPDATE/DELETE/WITH (${r.verb})` } });
      continue;
    }
    if (r.unresolved.length) {
      results.push({ ...base, status: 'SKIPPED', detail: { reason: `dynamic SQL fragment not substitutable: ${r.unresolved.map((u) => u.expr).join('; ')}` } });
      continue;
    }
    // last line of defence: the statement must be exactly one statement (the split already guarantees it)
    if (/;\s*\S/.test(maskSql(r.sql).replace(/;\s*$/, ''))) {
      results.push({ ...base, status: 'SKIPPED', detail: { reason: 'more than one statement after splitting' } });
      continue;
    }
    const sql = r.sql.replace(/;\s*$/, '');
    let outcome;
    await client.query('BEGIN READ ONLY');
    try {
      if (schema) await client.query(`SET LOCAL search_path TO "${schema}"`);
      let stage = 'prepare';
      try {
        await client.query(`${PREPARE_PREFIX}${sql}`);
        if (plan) {
          stage = 'plan';
          await client.query(`${EXPLAIN_PREFIX}${sql}`);
        }
        outcome = { status: 'OK', detail: {} };
      } catch (e) {
        const prefix = stage === 'prepare' ? PREPARE_PREFIX : EXPLAIN_PREFIX;
        const pos = e.position ? Number(e.position) - prefix.length : null;
        let srcLine = null;
        if (pos != null && pos >= 1 && !r.hasDyn && r.lineAt) {
          try { srcLine = r.lineAt(r.offset + pos - 1); } catch (x) { srcLine = null; }
        }
        outcome = {
          status: 'ERROR',
          detail: {
            stage, message: e.message, code: e.code || null, position: pos, sourceLine: srcLine,
            hint: e.hint || null, near: pos != null && pos >= 1 ? sql.slice(Math.max(0, pos - 41), pos + 40).replace(/\s+/g, ' ') : null,
          },
        };
      }
    } finally {
      try { await client.query('ROLLBACK'); } catch (e) { /* a broken connection surfaces on the next call */ }
      try { await client.query('DEALLOCATE ALL'); } catch (e) { /* ignore */ }
    }
    results.push({ ...base, ...outcome });
  }
  return results;
}

function summarize(results) {
  const s = { total: results.length, OK: 0, ERROR: 0, SKIPPED: 0, DDL: 0 };
  for (const r of results) s[r.status]++;
  return s;
}

/* ------------------------------------------------------------------------------------------------ */
/* CLI                                                                                               */
/* ------------------------------------------------------------------------------------------------ */

function parseArgs(argv) {
  const o = {
    urlEnv: null, schema: null, json: false, errorsOnly: false, verbose: false, allowRemote: false, workerDir: null, includeExample: false, help: false, errors: [],
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const val = () => { const v = argv[i + 1]; if (v == null || v.startsWith('--')) { o.errors.push(`${a} needs a value`); return null; } i++; return v; };
    switch (a) {
      case '--db-url-env': o.urlEnv = val(); break;
      case '--schema': o.schema = val(); break;
      case '--worker-dir': o.workerDir = val(); break;
      case '--json': o.json = true; break;
      case '--errors-only': o.errorsOnly = true; break;
      case '--verbose': o.verbose = true; break;
      case '--allow-remote': o.allowRemote = true; break;
      case '--include-example': o.includeExample = true; break;
      case '--help': case '-h': o.help = true; break;
      default: o.errors.push(`unknown option ${a}`);
    }
  }
  if (!o.help) {
    if (!o.urlEnv) o.errors.push('--db-url-env NAME is required (the connection string is read from that environment variable only)');
    if (o.schema && !IDENT_RE.test(o.schema)) o.errors.push('--schema must be a plain identifier ([A-Za-z_][A-Za-z0-9_]*)');
  }
  return o;
}

function describeTarget(url) {
  try {
    const u = new URL(url);
    return { host: u.hostname, text: `${u.hostname}${u.port ? `:${u.port}` : ''}/${decodeURIComponent(u.pathname.replace(/^\//, ''))}` };
  } catch (e) {
    return null;
  }
}

function scrub(message, url) {
  let m = String(message == null ? '' : message);
  const secrets = [];
  try {
    const u = new URL(url);
    secrets.push(url, u.password, u.username);
    if (u.password) secrets.push(decodeURIComponent(u.password));
  } catch (e) { /* ignore */ }
  for (const s of secrets.filter((x) => x && x.length >= 3)) m = m.split(s).join('***');
  return m.replace(/\b[a-z][a-z0-9+.-]*:\/\/[^\s/@]+@/gi, (x) => `${x.split('://')[0]}://***@`);
}

function defaultPgFactory(url) {
  const { Client } = require('pg');
  const cfg = { connectionString: url, connectionTimeoutMillis: 20000, query_timeout: 30000, statement_timeout: 30000, application_name: 'jobtune-validate-sql' };
  try {
    if (/neon\.tech$/i.test(new URL(url).hostname)) cfg.ssl = { rejectUnauthorized: true };
  } catch (e) { /* leave to pg */ }
  return new Client(cfg);
}

const oneLine = (s, n) => String(s).replace(/\s+/g, ' ').trim().slice(0, n);

function renderText(results, { errorsOnly, verbose }) {
  const lines = [];
  const w = Math.max(10, ...results.map((r) => `${r.file.replace(/^src\/worker\//, '')}:${r.line}`.length));
  for (const r of results) {
    if (errorsOnly && (r.status === 'OK' || r.status === 'SKIPPED')) continue;
    const loc = `${r.file.replace(/^src\/worker\//, '')}:${r.line}${r.total > 1 ? `#${r.part}` : ''}${r.alt > 1 ? `~${r.alt}` : ''}`;
    let detail = oneLine(r.sql, 70);
    if (r.status === 'ERROR') detail = `[${r.detail.stage}] ${r.detail.code || '?'} ${r.detail.message}${r.detail.position ? ` (pos ${r.detail.position}${r.detail.sourceLine ? `, line ${r.detail.sourceLine}` : ''})` : ''}`;
    else if (r.status === 'SKIPPED' || r.status === 'DDL') detail = r.detail.reason;
    lines.push(`${r.status.padEnd(7)} ${loc.padEnd(w + 4)} ${detail}`);
    if (verbose && r.status === 'ERROR') {
      if (r.detail.near) lines.push(`        near: ...${r.detail.near}...`);
      if (r.detail.hint) lines.push(`        hint: ${r.detail.hint}`);
      lines.push(`        sql:  ${oneLine(r.sql, 240)}`);
    }
  }
  return lines.join('\n');
}

async function run(argv, io = {}) {
  const out = io.stdout || ((s) => process.stdout.write(`${s}\n`));
  const err = io.stderr || ((s) => process.stderr.write(`${s}\n`));
  const env = io.env || process.env;
  const backendDir = io.backendDir || BACKEND_DIR;
  const pgFactory = io.pgFactory || defaultPgFactory;
  const o = parseArgs(argv);
  if (o.help) { out(HELP); return 0; }
  if (o.errors.length) { err(`validate-sql: ${o.errors.join('; ')}\nRun with --help for usage.`); return 2; }
  const url = env[o.urlEnv];
  if (!url) { err(`validate-sql: environment variable ${o.urlEnv} is not set. Nothing was run.`); return 2; }
  const target = describeTarget(url);
  if (!target) { err('validate-sql: the connection string is not a URL. Nothing was run.'); return 2; }
  if (!LOCAL_HOSTS.has(target.host.toLowerCase()) && !o.allowRemote) {
    err(`validate-sql: refusing host ${target.host}: only localhost / 127.0.0.1 / ::1 / db are accepted (pass --allow-remote if you really mean it). Nothing was run.`);
    return 2;
  }

  const collected = collectStatements({ backendDir, workerDir: o.workerDir ? path.resolve(o.workerDir) : null, includeExample: o.includeExample });
  const client = pgFactory(url);
  try {
    await client.connect();
  } catch (e) {
    err(`validate-sql: could not connect to ${target.text}: ${scrub(e && (e.code || e.message), url)}`);
    try { await client.end(); } catch (x) { /* ignore */ }
    return 2;
  }
  let results;
  let version = '';
  try {
    try { version = (await client.query('SHOW server_version')).rows[0].server_version; } catch (e) { /* cosmetic */ }
    let plan = false;
    try { plan = Number((await client.query('SHOW server_version_num')).rows[0].server_version_num) >= 160000; } catch (e) { /* no plan stage */ }
    if (!plan) err('validate-sql: PostgreSQL < 16 has no EXPLAIN (GENERIC_PLAN): ON CONFLICT targets are NOT verified by this run (use check-schema.js --check for the unique constraints).');
    results = await validateRows(client, collected.rows, { schema: o.schema, plan });
  } catch (e) {
    err(`validate-sql: run failed: ${scrub(e && e.message, url)}`);
    try { await client.end(); } catch (x) { /* ignore */ }
    return 2;
  }
  try { await client.end(); } catch (e) { /* ignore */ }

  const summary = summarize(results);
  const header = `Target: ${target.text}${o.schema ? `, schema ${o.schema}` : ''}${version ? `, PostgreSQL ${version}` : ''} (connection string, user and password are never printed)`;
  if (o.json) {
    err(header);
    out(JSON.stringify({ target: target.text, schema: o.schema, version, summary, extractionErrors: collected.errors, results: results.map((r) => ({ ...r, lineAt: undefined })) }, null, 2));
  } else {
    out(header);
    out(`Statements: ${summary.total} from ${collected.files.length} Worker files (each PREPAREd + planned inside BEGIN READ ONLY / ROLLBACK, never executed)\n`);
    const body = renderText(results, o);
    if (body) out(body);
    out(`\nSUMMARY: ${summary.OK} OK, ${summary.ERROR} ERROR, ${summary.SKIPPED} SKIPPED, ${summary.DDL} DDL-in-Worker (total ${summary.total})`);
    if (collected.errors.length) out(`Extractor warnings: ${collected.errors.length} (first: ${collected.errors[0]})`);
  }
  return summary.ERROR || summary.DDL ? 1 : 0;
}

module.exports = {
  run, parseArgs, collectStatements, substituteDynamics, splitSql, classifyStatement, validateRows, summarize, describeTarget, scrub, LOCAL_HOSTS, PREPARE_PREFIX, EXPLAIN_PREFIX,
};

if (require.main === module) {
  run(process.argv.slice(2)).then((code) => { process.exitCode = code; }, (e) => {
    process.stderr.write(`validate-sql: ${scrub(e && e.message)}\n`);
    process.exitCode = 2;
  });
}
