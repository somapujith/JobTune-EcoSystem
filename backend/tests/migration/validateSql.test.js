'use strict';

/**
 * validate-sql.js: PREPARE every Worker SQL statement on a real PostgreSQL.
 *
 * Two halves:
 *   - OFFLINE (always runs): extraction, placeholder substitution, statement classification, the read-only guard,
 *     the host guard and the "only PREPARE / EXPLAIN reaches the database" property, with a mock client. It also
 *     asserts, on the real Worker sources, that there is no DDL and no unresolved dynamic fragment (ADR-001 6.5).
 *   - REAL DATABASE (skipped cleanly unless JT_VALIDATE_DB_URL is set; refused unless the host is local): the same
 *     code against a scratch schema in a real PostgreSQL.
 */
const fs = require('fs');
const path = require('path');

const BACKEND_DIR = path.resolve(__dirname, '..', '..');
const SCRIPT = path.join(BACKEND_DIR, 'scripts', 'migration', 'validate-sql.js');
const v = require(SCRIPT);
const { enabled, createScratchSchema, URL_ENV } = require('../worker/pg/pgHarness');

/* ------------------------------------------------------------------------------------------------- */
/* helpers                                                                                            */
/* ------------------------------------------------------------------------------------------------- */

function capture() {
  const out = [];
  const err = [];
  return { out, err, io: (env, extra = {}) => ({ stdout: (s) => out.push(s), stderr: (s) => err.push(s), env, backendDir: BACKEND_DIR, ...extra }) };
}

/** A pg-style client that records every statement and can be told to fail specific ones. */
function mockClient({ failWhen = null, connectError = null } = {}) {
  const seen = [];
  return {
    seen,
    async connect() { if (connectError) throw new Error(connectError); },
    async end() {},
    async query(sql) {
      seen.push(sql);
      if (/^SHOW server_version_num/.test(sql)) return { rows: [{ server_version_num: '170011' }] };
      if (/^SHOW server_version/.test(sql)) return { rows: [{ server_version: '17.11' }] };
      const f = failWhen && failWhen(sql);
      if (f) { const e = new Error(f.message); e.code = f.code; e.position = f.position; throw e; }
      return { rows: [], rowCount: 0 };
    },
  };
}

const row = (sql, extra = {}) => {
  const [c] = v.splitSql(sql).map((p) => ({ p, cls: v.classifyStatement(p.text) }));
  return {
    file: 'src/worker/x.js', line: 1, kind: 'query', alt: 1, part: 1, total: 1, sql: c.p.text, verb: c.cls.word, class: c.cls.kind, notes: [], unresolved: [], hasDyn: false, offset: c.p.offset, lineAt: null, ...extra,
  };
};

/* ------------------------------------------------------------------------------------------------- */
/* offline                                                                                            */
/* ------------------------------------------------------------------------------------------------- */

describe('validate-sql: placeholder substitution', () => {
  const dyn = (id, expr) => ({ id, expr, line: 1 });
  const M = (n) => `__$DYN_${n}$__`;

  it('`$${idx++}` becomes the next unused parameter number', () => {
    const r = v.substituteDynamics(`UPDATE t SET a = $${M(0)}, b = $${M(1)} WHERE id = $${M(2)}`, [dyn(0, 'idx++'), dyn(1, 'idx++'), dyn(2, 'idx')]);
    expect(r.sql).toBe('UPDATE t SET a = $1, b = $2 WHERE id = $3');
    expect(r.unresolved).toEqual([]);
  });

  it('continues after the static `$n` already in the text', () => {
    const r = v.substituteDynamics(`SELECT 1 FROM t WHERE u = $1 AND d = $${M(0)} LIMIT $${M(1)}`, [dyn(0, 'params.length'), dyn(1, 'params.length + 1')]);
    expect(r.sql).toBe('SELECT 1 FROM t WHERE u = $1 AND d = $2 LIMIT $3');
  });

  it('`VALUES ${rows}` becomes one row with one parameter per INSERT column', () => {
    const r = v.substituteDynamics(`INSERT INTO t (a, b, c)\n VALUES ${M(0)}\n ON CONFLICT (a) DO NOTHING`, [dyn(0, 'values')]);
    expect(r.sql.replace(/\s+/g, ' ')).toBe('INSERT INTO t (a, b, c) VALUES ($1, $2, $3) ON CONFLICT (a) DO NOTHING');
  });

  it('ORDER BY / LIMIT / OFFSET fragments get a representative literal', () => {
    expect(v.substituteDynamics(`SELECT 1 FROM t ORDER BY ${M(0)}`, [dyn(0, 'x')]).sql).toBe('SELECT 1 FROM t ORDER BY 1');
    expect(v.substituteDynamics(`SELECT 1 FROM t LIMIT ${M(0)} OFFSET ${M(1)}`, [dyn(0, 'a'), dyn(1, 'b')]).sql).toBe('SELECT 1 FROM t LIMIT 10 OFFSET 10');
  });

  it('anything else stays unresolved (never guessed)', () => {
    const r = v.substituteDynamics(`SELECT ${M(0)} FROM t WHERE ${M(1)}`, [dyn(0, 'cols'), dyn(1, 'where')]);
    expect(r.unresolved.map((u) => u.expr)).toEqual(['cols', 'where']);
  });
});

describe('validate-sql: classification and splitting', () => {
  it.each([
    ['SELECT 1', 'validate', 'SELECT'],
    ['  insert into t values (1)', 'validate', 'INSERT'],
    ['UPDATE t SET a = 1', 'validate', 'UPDATE'],
    ['DELETE FROM t', 'validate', 'DELETE'],
    ['WITH x AS (SELECT 1) SELECT * FROM x', 'validate', 'WITH'],
    ['-- lead comment\nSELECT 1', 'validate', 'SELECT'],
    ['CREATE TABLE t (id int)', 'ddl', 'CREATE'],
    ['ALTER TABLE t ADD COLUMN a int', 'ddl', 'ALTER'],
    ['DROP TABLE t', 'ddl', 'DROP'],
    ['TRUNCATE t', 'ddl', 'TRUNCATE'],
    ['BEGIN', 'utility', 'BEGIN'],
    ['COMMIT', 'utility', 'COMMIT'],
    ['SET search_path TO x', 'utility', 'SET'],
    ['EXPLAIN SELECT 1', 'utility', 'EXPLAIN'],
    ['COPY t FROM STDIN', 'utility', 'COPY'],
    ['', 'empty', ''],
  ])('%j -> %s', (sql, kind, word) => {
    expect(v.classifyStatement(sql)).toEqual({ kind, word });
  });

  it('a keyword inside a string or comment does not change the class', () => {
    expect(v.classifyStatement("SELECT 'DROP TABLE t; CREATE x'").kind).toBe('validate');
    expect(v.classifyStatement('/* CREATE */ SELECT 1').kind).toBe('validate');
  });

  it('splits a multi-statement string and keeps each statement whole', () => {
    const parts = v.splitSql("SELECT 'a;b'; UPDATE t SET a = 1; DELETE FROM t WHERE x = $1;");
    expect(parts.map((p) => p.text)).toEqual(["SELECT 'a;b'", 'UPDATE t SET a = 1', 'DELETE FROM t WHERE x = $1']);
  });
});

describe('validate-sql: extraction over the real Worker sources', () => {
  const { rows, errors, files } = v.collectStatements({ backendDir: BACKEND_DIR });

  it('finds the Worker statements with the shared extractor and reports no extractor errors', () => {
    expect(files.length).toBeGreaterThan(100);
    expect(rows.length).toBeGreaterThan(200);
    expect(errors).toEqual([]);
    expect(fs.readFileSync(SCRIPT, 'utf8')).toMatch(/require\('\.\/schema\/jsSql'\)/); // reuses, does not re-implement
  });

  it('the Worker issues NO DDL and no utility statement (ADR-001 6.5): every statement is SELECT / INSERT / UPDATE / DELETE / WITH', () => {
    expect(rows.filter((r) => r.class === 'ddl')).toEqual([]);
    expect(rows.filter((r) => r.class !== 'validate').map((r) => `${r.file}:${r.line} ${r.verb}`)).toEqual([]);
  });

  it('every dynamic fragment the extractor could not resolve is one this tool substitutes (nothing is skipped)', () => {
    expect(rows.filter((r) => r.unresolved.length).map((r) => `${r.file}:${r.line}`)).toEqual([]);
    const substituted = rows.filter((r) => r.notes.length).map((r) => path.basename(r.file));
    expect(substituted.sort()).toEqual(['projectBuilder.js', 'srsService.js', 'srsService.js', 'studyHistoryService.js']);
    expect(rows.every((r) => !/__\$DYN_/.test(r.sql))).toBe(true);
  });

  it('rows carry file:line, kind and the SQL, and no row is a multi-statement string', () => {
    expect(rows.every((r) => /^src\/worker\/.+\.js$/.test(r.file) && r.line > 0 && r.sql.length > 0)).toBe(true);
    expect(rows.every((r) => r.total === 1)).toBe(true);
  });
});

describe('validate-sql: parameter arity of the Worker call sites (PREPARE cannot see it)', () => {
  // node-pg sends the SQL and the params array separately: a params array whose length differs from the highest $n in the
  // SQL is a runtime error (08P01 "bind message supplies N parameters, but prepared statement requires M") that neither
  // PREPARE nor the in-memory fake db can show. Checked statically where both the SQL and the params are literals.
  const { loadParser } = require('../../scripts/migration/schema/jsSql');
  const workerDir = path.join(BACKEND_DIR, 'src', 'worker');
  const files = [];
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const q = path.join(d, e.name);
      if (e.isDirectory()) walk(q); else if (e.name.endsWith('.js')) files.push(q);
    }
  }(workerDir));

  it('every .query(<literal sql>, [<literal params>]) passes exactly as many parameters as the highest $n', () => {
    const parser = loadParser();
    const mismatches = [];
    let checked = 0;
    const visit = (n, file) => {
      if (!n || typeof n !== 'object') return;
      if (Array.isArray(n)) { n.forEach((x) => visit(x, file)); return; }
      if (n.type === 'CallExpression' && n.callee.type === 'MemberExpression' && !n.callee.computed && n.callee.property.name === 'query' && n.arguments.length >= 1) {
        const a = n.arguments[0];
        let text = null;
        if (a.type === 'StringLiteral') text = a.value;
        else if (a.type === 'TemplateLiteral' && a.expressions.length === 0) text = a.quasis[0].value.cooked;
        const params = n.arguments[1];
        if (text !== null) {
          const max = Math.max(0, ...[...text.matchAll(/\$(\d+)/g)].map((m) => Number(m[1])));
          if (!params) { checked++; if (max > 0) mismatches.push(`${path.relative(workerDir, file)}:${n.loc.start.line} no params, needs ${max}`); }
          else if (params.type === 'ArrayExpression' && !params.elements.some((e) => e && e.type === 'SpreadElement')) {
            checked++;
            if (params.elements.length !== max) mismatches.push(`${path.relative(workerDir, file)}:${n.loc.start.line} passes ${params.elements.length}, needs ${max}`);
          }
        }
      }
      for (const k of Object.keys(n)) if (!['loc', 'start', 'end', 'extra'].includes(k)) visit(n[k], file);
    };
    for (const f of files) {
      visit(parser.parse(fs.readFileSync(f, 'utf8'), { sourceType: 'unambiguous', errorRecovery: true, plugins: ['jsx'] }).program, f);
    }
    expect(checked).toBeGreaterThan(150);
    expect(mismatches).toEqual([]);
  });
});

describe('validate-sql: validateRows only ever sends guarded statements', () => {
  it('sends BEGIN READ ONLY, SET LOCAL, PREPARE, EXPLAIN (GENERIC_PLAN), ROLLBACK, DEALLOCATE ALL - and never the raw statement', async () => {
    const c = mockClient();
    const res = await v.validateRows(c, [row('SELECT id FROM users WHERE id = $1')], { schema: 'sc' });
    expect(res[0].status).toBe('OK');
    expect(c.seen).toEqual([
      'BEGIN READ ONLY',
      'SET LOCAL search_path TO "sc"',
      'PREPARE jt_validate AS SELECT id FROM users WHERE id = $1',
      'EXPLAIN (GENERIC_PLAN, COSTS OFF) SELECT id FROM users WHERE id = $1',
      'ROLLBACK',
      'DEALLOCATE ALL',
    ]);
  });

  it('can skip the plan stage (PostgreSQL < 16)', async () => {
    const c = mockClient();
    await v.validateRows(c, [row('SELECT 1')], { plan: false });
    expect(c.seen.some((s) => /^EXPLAIN/.test(s))).toBe(false);
  });

  it('DDL and utility statements NEVER reach the client; DDL is a violation, utility is skipped', async () => {
    const c = mockClient();
    const res = await v.validateRows(c, [
      row('CREATE TABLE t (id int)'), row('ALTER TABLE t ADD COLUMN a int'), row('DROP TABLE t'), row('BEGIN'), row('SET x = 1'), row('COMMIT'),
    ]);
    expect(res.map((r) => r.status)).toEqual(['DDL', 'DDL', 'DDL', 'SKIPPED', 'SKIPPED', 'SKIPPED']);
    expect(c.seen).toEqual([]);
    expect(v.summarize(res)).toMatchObject({ DDL: 3, SKIPPED: 3, OK: 0, ERROR: 0 });
  });

  it('a statement with an unresolved dynamic fragment is SKIPPED, not sent', async () => {
    const c = mockClient();
    const res = await v.validateRows(c, [row('SELECT 1', { unresolved: [{ expr: 'cols' }] })]);
    expect(res[0]).toMatchObject({ status: 'SKIPPED' });
    expect(res[0].detail.reason).toContain('cols');
    expect(c.seen).toEqual([]);
  });

  it('a Postgres error becomes an ERROR row with stage, code, position and the SQL near it; the transaction is still rolled back', async () => {
    const c = mockClient({
      failWhen: (s) => (/^PREPARE/.test(s) ? { message: 'column "nope" does not exist', code: '42703', position: String(v.PREPARE_PREFIX.length + 8) } : null),
    });
    const res = await v.validateRows(c, [row('SELECT nope FROM users')]);
    expect(res[0].status).toBe('ERROR');
    expect(res[0].detail).toMatchObject({ stage: 'prepare', code: '42703', message: 'column "nope" does not exist', position: 8 });
    expect(res[0].detail.near).toContain('nope FROM users');
    expect(c.seen.slice(-2)).toEqual(['ROLLBACK', 'DEALLOCATE ALL']);
    expect(c.seen.some((s) => /^EXPLAIN/.test(s))).toBe(false); // plan stage only after a clean PREPARE
  });

  it('a plan-stage error (ON CONFLICT arbiter) is reported with stage "plan"', async () => {
    const c = mockClient({ failWhen: (s) => (/^EXPLAIN/.test(s) ? { message: 'there is no unique or exclusion constraint matching the ON CONFLICT specification', code: '42P10' } : null) });
    const res = await v.validateRows(c, [row('INSERT INTO t (a) VALUES ($1) ON CONFLICT (a) DO NOTHING')]);
    expect(res[0].detail).toMatchObject({ stage: 'plan', code: '42P10' });
  });

  it('refuses a schema that is not a plain identifier', async () => {
    await expect(v.validateRows(mockClient(), [row('SELECT 1')], { schema: 'x"; DROP SCHEMA public; --' })).rejects.toThrow('plain identifier');
  });
});

describe('validate-sql: CLI guards', () => {
  it('requires --db-url-env and reads the URL from that variable only', async () => {
    const cap = capture();
    expect(await v.run([], cap.io({}))).toBe(2);
    expect(cap.err.join('\n')).toContain('--db-url-env');
    const cap2 = capture();
    expect(await v.run(['--db-url-env', 'NOPE'], cap2.io({ DATABASE_URL: 'postgres://u:p@127.0.0.1:1/x' }))).toBe(2); // DATABASE_URL is NOT used implicitly
    expect(cap2.err.join('\n')).toContain('NOPE is not set');
  });

  it('refuses a remote host unless --allow-remote, and never opens a connection for it', async () => {
    const cap = capture();
    let made = 0;
    const env = { X: 'postgres://user:hunter2-secret@ep-cool-name-123.eu-central-1.aws.neon.tech/prod?sslmode=require' };
    const code = await v.run(['--db-url-env', 'X'], cap.io(env, { pgFactory: () => { made++; return mockClient(); } }));
    expect(code).toBe(2);
    expect(made).toBe(0);
    const text = cap.err.join('\n') + cap.out.join('\n');
    expect(text).toContain('refusing host ep-cool-name-123.eu-central-1.aws.neon.tech');
    expect(text).not.toContain('hunter2');
  });

  it.each(['localhost', '127.0.0.1', 'db'])('accepts the local host %s', async (host) => {
    const cap = capture();
    const c = mockClient();
    const code = await v.run(['--db-url-env', 'X', '--errors-only'], cap.io({ X: `postgres://u:pw-secret-9@${host}:5432/somedb` }, { pgFactory: () => c }));
    expect(code).toBe(0);
    expect(cap.out.join('\n')).toContain(`Target: ${host}:5432/somedb`);
    expect(c.seen.filter((s) => /^PREPARE/.test(s)).length).toBeGreaterThan(200);
  });

  it('--allow-remote lets a remote host through, and still prints only host + database', async () => {
    const cap = capture();
    const c = mockClient();
    const code = await v.run(['--db-url-env', 'X', '--allow-remote'], cap.io({ X: 'postgres://user:hunter2-secret@branch.example.test/db1?sslmode=require' }, { pgFactory: () => c }));
    expect(code).toBe(0);
    const text = cap.err.join('\n') + cap.out.join('\n');
    expect(text).toContain('branch.example.test/db1');
    expect(text).not.toContain('hunter2');
    expect(text).not.toContain('user:');
  });

  it('a connection failure is scrubbed of credentials and exits 2', async () => {
    const cap = capture();
    const env = { X: 'postgres://user:hunter2-secret@127.0.0.1:1/db' };
    const code = await v.run(['--db-url-env', 'X'], cap.io(env, { pgFactory: () => mockClient({ connectError: 'connect ECONNREFUSED user:hunter2-secret@127.0.0.1:1' }) }));
    expect(code).toBe(2);
    expect(cap.err.join('\n')).not.toContain('hunter2');
  });

  it('exit code 1 when any statement errors, and --json is parseable with the target line on stderr', async () => {
    const cap = capture();
    const c = mockClient({ failWhen: (s) => (/^PREPARE .*FROM users/.test(s) ? { message: 'boom', code: 'XX000' } : null) });
    const code = await v.run(['--db-url-env', 'X', '--json'], cap.io({ X: 'postgres://u:p@127.0.0.1:5432/d' }, { pgFactory: () => c }));
    expect(code).toBe(1);
    const parsed = JSON.parse(cap.out.join('\n'));
    expect(parsed.summary.ERROR).toBeGreaterThan(0);
    expect(parsed.results.find((r) => r.status === 'ERROR').detail.code).toBe('XX000');
    expect(cap.err.join('\n')).toContain('Target: 127.0.0.1:5432/d');
  });

  it('never reads a .env file (source check)', () => {
    const src = fs.readFileSync(SCRIPT, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(src).not.toMatch(/dotenv/);
    expect(src).not.toMatch(/readFileSync\([^)]*\.env/);
  });
});

/* ------------------------------------------------------------------------------------------------- */
/* real PostgreSQL (skipped unless JT_VALIDATE_DB_URL is set)                                          */
/* ------------------------------------------------------------------------------------------------- */

const describeDb = enabled() ? describe : describe.skip;

describeDb('validate-sql against a real PostgreSQL (scratch schema)', () => {
  jest.setTimeout(60000);
  const { Client } = require('pg');
  let tiny;
  let client;

  beforeAll(async () => {
    tiny = await createScratchSchema({
      statements: [
        'CREATE TABLE people (id SERIAL PRIMARY KEY, email TEXT UNIQUE NOT NULL, age INTEGER, tags JSONB)',
        'CREATE TABLE loose (id SERIAL PRIMARY KEY, k INTEGER, v TEXT)', // no unique on k
      ],
    });
    client = new Client({ connectionString: tiny.url });
    await client.connect();
  });
  afterAll(async () => {
    if (client) await client.end();
    if (tiny) await tiny.drop();
  });

  const check = async (sql, extra = {}) => (await v.validateRows(client, [row(sql, extra)], { schema: tiny.name }))[0];

  it('OK: valid SELECT / INSERT / UPDATE / DELETE / WITH with parameters typed by inference', async () => {
    for (const sql of [
      'SELECT id, email FROM people WHERE id = $1 AND age > $2',
      'INSERT INTO people (email, age, tags) VALUES ($1, $2, $3) RETURNING id',
      'UPDATE people SET age = $1 WHERE email = $2',
      'DELETE FROM people WHERE id = $1',
      'WITH p AS (SELECT id FROM people WHERE age > $1) SELECT COUNT(*) FROM p',
      'INSERT INTO people (email) VALUES ($1) ON CONFLICT (email) DO UPDATE SET age = 1',
    ]) {
      const r = await check(sql);
      expect({ sql, status: r.status, detail: r.detail }).toEqual({ sql, status: 'OK', detail: {} });
    }
  });

  it('ERROR with the Postgres code and position: missing table, missing column, syntax, undeterminable parameter type', async () => {
    const missingTable = await check('SELECT id FROM nope WHERE id = $1');
    expect(missingTable).toMatchObject({ status: 'ERROR', detail: { stage: 'prepare', code: '42P01' } });
    expect(missingTable.detail.position).toBeGreaterThan(0);
    expect(missingTable.detail.near).toContain('FROM nope');

    expect((await check('SELECT nope FROM people')).detail).toMatchObject({ code: '42703' });
    expect((await check('INSERT INTO people (email, ghost) VALUES ($1, $2)')).detail).toMatchObject({ code: '42703' });
    expect((await check('SELECT FROM WHERE')).detail).toMatchObject({ code: '42601' });
    expect((await check('SELECT id FROM people WHERE $1 IS NULL')).detail).toMatchObject({ code: '42P18' }); // could not determine data type of parameter $1
    expect((await check('SELECT * FROM people WHERE age = $1 AND id = $3')).detail).toMatchObject({ code: '42P18' }); // $2 never used
  });

  it('PREPARE cannot see ON CONFLICT arbiters; the plan stage does: no unique constraint on the target is an ERROR (42P10, stage plan)', async () => {
    const r = await check('INSERT INTO loose (k, v) VALUES ($1, $2) ON CONFLICT (k) DO UPDATE SET v = $2');
    expect(r).toMatchObject({ status: 'ERROR', detail: { stage: 'plan', code: '42P10' } });
    // the same statement with plan:false would pass PREPARE: prove the gap exists
    const noPlan = (await v.validateRows(client, [row('INSERT INTO loose (k, v) VALUES ($1, $2) ON CONFLICT (k) DO UPDATE SET v = $2')], { schema: tiny.name, plan: false }))[0];
    expect(noPlan.status).toBe('OK');
  });

  it('nothing is executed: an INSERT / UPDATE / DELETE that validates leaves the table untouched, and the session is clean afterwards', async () => {
    await tiny.query("INSERT INTO people (email, age) VALUES ('keep@x.invalid', 1)");
    for (const sql of [
      "INSERT INTO people (email, age) VALUES ('new@x.invalid', 2)",
      'UPDATE people SET age = 99',
      'DELETE FROM people',
    ]) expect((await check(sql)).status).toBe('OK');
    const n = await tiny.query('SELECT COUNT(*)::int AS n, MIN(age) AS a FROM people');
    expect(n.rows[0]).toEqual({ n: 1, a: 1 });
    const prepared = await client.query('SELECT COUNT(*)::int AS n FROM pg_prepared_statements');
    expect(prepared.rows[0].n).toBe(0); // DEALLOCATE ALL after every statement
    const tx = await client.query("SELECT current_setting('transaction_read_only') AS ro"); // back in autocommit read-write
    expect(tx.rows[0].ro).toBe('off');
  });

  it('a DDL statement is reported and never sent: the table it names is not created', async () => {
    const r = await check('CREATE TABLE should_not_exist (id int)');
    expect(r.status).toBe('DDL');
    const exists = await tiny.query('SELECT to_regclass($1) AS t', [`${tiny.name}.should_not_exist`]);
    expect(exists.rows[0].t).toBeNull();
  });

  it('the CLI end to end: --db-url-env + --schema, JSON output, exit 1 for the scratch schema (it lacks the Worker tables)', async () => {
    const cap = capture();
    const code = await v.run(['--db-url-env', URL_ENV, '--schema', tiny.name, '--json'], cap.io(process.env));
    expect(code).toBe(1);
    const parsed = JSON.parse(cap.out.join('\n'));
    expect(parsed.summary.total).toBeGreaterThan(200);
    expect(parsed.summary.DDL).toBe(0);
    expect(parsed.version).toMatch(/^\d+/);
    expect(parsed.results.filter((r) => r.status === 'ERROR').every((r) => r.detail.code === '42P01' || r.detail.code === '42703')).toBe(true);
  });
});

describeDb('validate-sql: the whole Worker against the schema the repository DDL produces (real PostgreSQL)', () => {
  jest.setTimeout(120000);
  let schema;
  let client;
  let results;

  beforeAll(async () => {
    const { Client } = require('pg');
    schema = await createScratchSchema(); // = check-schema.js --print-fix-sql for everything the Worker needs
    client = new Client({ connectionString: schema.url });
    await client.connect();
    const { rows } = v.collectStatements({ backendDir: BACKEND_DIR });
    results = await v.validateRows(client, rows, { schema: schema.name });
  });
  afterAll(async () => {
    if (client) await client.end();
    if (schema) await schema.drop();
  });

  it('parses, analyzes and plans every Worker statement: no DDL, nothing skipped, and every OK/ERROR row is accounted for', () => {
    const s = v.summarize(results);
    expect(s.DDL).toBe(0);
    expect(s.SKIPPED).toBe(0);
    expect(s.OK + s.ERROR).toBe(s.total);
    expect(s.total).toBeGreaterThan(200);
  });

  it('the only failures are the tables NO DDL in the repository declares (pre-existing: the Express originals fail identically)', () => {
    // users.name / users.full_name used to fail here too; runMigrations now adds them (additive, guarded), so the
    // remaining gaps are the owner decisions in docs/migration/proposed-schema-fixes.sql: profiles, interview_sessions.
    const messages = results.filter((r) => r.status === 'ERROR').map((r) => r.detail.message).sort();
    expect(messages).toEqual([
      'relation "interview_sessions" does not exist',
      'relation "profiles" does not exist',
    ]);
  });
});
