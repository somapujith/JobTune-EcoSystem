'use strict';

/**
 * replay-boot-ddl.js: replays the DDL Express creates outside initializeTables / runMigrations / ensureTables.
 * Offline half always runs; the real-PostgreSQL half is skipped unless JT_VALIDATE_DB_URL is set (local hosts only).
 */
const path = require('path');

const BACKEND_DIR = path.resolve(__dirname, '..', '..');
const r = require(path.join(BACKEND_DIR, 'scripts', 'migration', 'replay-boot-ddl.js'));
const { enabled, createScratchSchema, URL_ENV } = require('../worker/pg/pgHarness');

const cap = () => { const out = []; const err = []; return { out, err, io: (env) => ({ stdout: (s) => out.push(s), stderr: (s) => err.push(s), env }) }; };

describe('replay-boot-ddl: arguments and guards', () => {
  it('needs a phase and --db-url-env; a scratch schema is mandatory for database-sql', () => {
    expect(r.parseArgs([]).errors.length).toBeGreaterThanOrEqual(2);
    expect(r.parseArgs(['--phase', 'routes', '--db-url-env', 'X']).errors).toEqual([]);
    expect(r.parseArgs(['--phase', 'database-sql', '--db-url-env', 'X']).errors.join()).toContain('--schema');
    expect(r.parseArgs(['--phase', 'routes', '--db-url-env', 'X', '--schema', 'a;b']).errors.join()).toContain('--schema');
    expect(r.parseArgs(['--phase', 'routes', '--db-url-env', 'X', '--drop-schema']).errors.join()).toContain('--drop-schema');
  });

  it('refuses ANY non-local host, and there is no --allow-remote override (it executes DDL)', async () => {
    const env = { X: 'postgres://u:secret-pw-1@ep-x.neon.tech/db' };
    const c = cap();
    expect(await r.main(['--phase', 'routes', '--db-url-env', 'X'], c.io(env))).toBe(2);
    expect(c.err.join(' ')).toContain('non-local host');
    expect(c.err.join(' ')).not.toContain('secret-pw-1');
    const c2 = cap();
    expect(await r.main(['--phase', 'routes', '--db-url-env', 'X', '--allow-remote'], c2.io(env))).toBe(2);
    expect(c2.err.join(' ')).toContain('unknown option --allow-remote');
  });
});

describe('replay-boot-ddl: what it replays (static, from the real Express sources)', () => {
  const order = r.routeRequireOrder(BACKEND_DIR);
  const withDdl = order.map((f) => ({ f, st: r.routeDdlStatements(BACKEND_DIR, f) })).filter((x) => x.st.length);

  it('follows the app.js require order', () => {
    expect(order[0]).toBe('src/routes/auth.js');
    expect(order.indexOf('src/routes/resume.js')).toBeLessThan(order.indexOf('src/routes/practice.js'));
  });

  it('finds the module-load DDL of the eight route files and nothing else', () => {
    expect(withDdl.map((x) => path.basename(x.f)).sort()).toEqual(
      ['aiCoach.js', 'community.js', 'courses.js', 'interview.js', 'learning.js', 'practice.js', 'projectBuilder.js', 'resume.js']
    );
    const all = withDdl.flatMap((x) => x.st);
    expect(all.every((s) => /^(CREATE|ALTER)\b/i.test(s.text))).toBe(true); // no INSERT / runtime SQL
    expect(all.some((s) => /\$\d/.test(s.text))).toBe(false);
    expect(all.some((s) => s.skipped)).toBe(false); // the for..of ALTER list is fully expanded
    expect(all.filter((s) => /ALTER TABLE resumes/i.test(s.text))).toHaveLength(12);
  });
});

const describeDb = enabled() ? describe : describe.skip;

describeDb('replay-boot-ddl on a real PostgreSQL (empty scratch schema)', () => {
  jest.setTimeout(60000);
  let scratch;
  beforeAll(async () => { scratch = await createScratchSchema({ statements: [] }); });
  afterAll(async () => { if (scratch) await scratch.drop(); });

  it('reproduces the boot-order hazard: on a database with no users table the three users-FK route tables fail with 42P01, the rest are created', async () => {
    const c = cap();
    const code = await r.main(['--phase', 'routes', '--db-url-env', URL_ENV, '--schema', scratch.name, '--json'], c.io(process.env));
    expect(code).toBe(1);
    const res = JSON.parse(c.out.filter((l) => l.trim().startsWith('{')).join('\n'));
    const failed = res.log.filter((l) => !l.ok);
    expect(failed.map((l) => `${path.basename(l.file)}`).sort()).toEqual(['aiCoach.js', 'aiCoach.js', 'projectBuilder.js']);
    expect(failed.every((l) => l.error.code === '42P01' && /users/.test(l.error.message))).toBe(true);
    const t = await scratch.query("SELECT table_name FROM information_schema.tables WHERE table_schema = $1 ORDER BY 1", [scratch.name]);
    const names = t.rows.map((x) => x.table_name);
    expect(names).toEqual(expect.arrayContaining(['courses', 'course_enrollments', 'learning_paths', 'learning_streaks', 'community_threads', 'practice_submissions', 'mock_interviews', 'resumes']));
    expect(names).not.toContain('project_workspace');
    expect(names).not.toContain('code_reviews');
  });

  it('once users exists the same replay is clean and idempotent (a second boot creates the missing tables)', async () => {
    await scratch.query('CREATE TABLE users (id SERIAL PRIMARY KEY, email TEXT)');
    const c = cap();
    expect(await r.main(['--phase', 'routes', '--db-url-env', URL_ENV, '--schema', scratch.name], c.io(process.env))).toBe(0);
    expect(await r.main(['--phase', 'routes', '--db-url-env', URL_ENV, '--schema', scratch.name], c.io(process.env))).toBe(0);
    const t = await scratch.query("SELECT to_regclass($1) AS a, to_regclass($2) AS b", [`${scratch.name}.project_workspace`, `${scratch.name}.code_reviews`]);
    expect(t.rows[0].a).not.toBeNull();
    expect(t.rows[0].b).not.toBeNull();
  });

  it('database.sql (MySQL dialect) fails statement by statement on PostgreSQL with 42601, in a scratch schema that is dropped', async () => {
    const c = cap();
    const name = `${scratch.name}_dbsql`;
    expect(await r.main(['--phase', 'database-sql', '--db-url-env', URL_ENV, '--schema', name, '--reset-schema', '--drop-schema', '--json'], c.io(process.env))).toBe(1);
    const res = JSON.parse(c.out.filter((l) => l.trim().startsWith('{')).join('\n'));
    expect(res.log).toHaveLength(5);
    expect(res.log.every((l) => !l.ok && l.error.code === '42601' && /AUTO_INCREMENT/.test(l.error.message))).toBe(true);
    const gone = await scratch.query('SELECT COUNT(*)::int AS n FROM pg_namespace WHERE nspname = $1', [name]);
    expect(gone.rows[0].n).toBe(0);
  });
});
