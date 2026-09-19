'use strict';

/** apply-neon-schema.js: dry run rolls back, --apply commits, count drift aborts, host and credential guards. Mock client only. */
const { main, applySchema } = require('../../scripts/migration/apply-neon-schema');

function mockClient({ columnExists = false, driftCounts = false } = {}) {
  const log = [];
  let n = 0;
  const client = {
    log,
    connect: async () => {},
    end: async () => {},
    query: async (sql) => {
      const s = String(sql).trim();
      log.push(s.split('\n')[0].slice(0, 90));
      if (/^SELECT count\(\*\)/i.test(s)) { n++; return { rows: [{ n: driftCounts && n > 9 ? '11' : '10' }] }; }
      if (/information_schema\.columns/.test(s)) return { rows: columnExists ? [{ '?column?': 1 }] : [] };
      if (/^UPDATE users SET onboarding_completed/.test(s)) return { rows: [], rowCount: 4 };
      return { rows: [], rowCount: 0 };
    },
  };
  return client;
}
const quiet = () => {};
const URL_OK = 'postgresql://someuser:s3cr3t-pw@ep-x-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require';

describe('applySchema', () => {
  it('dry run executes everything and ROLLS BACK', async () => {
    const c = mockClient();
    const r = await applySchema(c, { apply: false, log: quiet });
    expect(r).toMatchObject({ ok: true, committed: false, backfilled: 4 });
    expect(c.log).toContain('ROLLBACK');
    expect(c.log).not.toContain('COMMIT');
    expect(c.log.filter((l) => /^CREATE TABLE IF NOT EXISTS (career_discovery_responses|github_analyses)/.test(l))).toHaveLength(2);
  });

  it('--apply COMMITS', async () => {
    const c = mockClient();
    const r = await applySchema(c, { apply: true, log: quiet });
    expect(r).toMatchObject({ ok: true, committed: true });
    expect(c.log).toContain('COMMIT');
  });

  it('the onboarding backfill runs only when the column is being ADDED (never on a re-run)', async () => {
    const c = mockClient({ columnExists: true });
    const r = await applySchema(c, { apply: true, log: quiet });
    expect(r.backfilled).toBe(0);
    expect(c.log.some((l) => /^UPDATE users SET onboarding_completed/.test(l))).toBe(false);
  });

  it('aborts and rolls back if any row count changes inside the transaction', async () => {
    const c = mockClient({ driftCounts: true });
    const r = await applySchema(c, { apply: true, log: quiet });
    expect(r.ok).toBe(false);
    expect(c.log).toContain('ROLLBACK');
    expect(c.log).not.toContain('COMMIT');
  });

  it('every statement is additive: no DROP, TRUNCATE, DELETE or column type change', async () => {
    const c = mockClient();
    await applySchema(c, { apply: false, log: quiet });
    expect(c.log.join('\n')).not.toMatch(/DROP|TRUNCATE|DELETE|ALTER COLUMN|TYPE /i);
  });
});

describe('main() guards', () => {
  it('needs the URL in the environment', async () => {
    expect(await main([], {}, quiet)).toBe(64);
  });

  it('refuses a non-Neon host without --allow-any-host', async () => {
    const out = [];
    expect(await main([], { DATABASE_URL: 'postgres://u:p@db.example.com/x' }, (m) => out.push(m), () => mockClient())).toBe(64);
    expect(out.join(' ')).toMatch(/not a neon\.tech host/);
  });

  it('prints host and database only, never the credentials, and defaults to a dry run', async () => {
    const out = [];
    const c = mockClient();
    expect(await main([], { DATABASE_URL: URL_OK }, (m) => out.push(m), () => c)).toBe(0);
    const text = out.join('\n');
    expect(text).toContain('ep-x-pooler.ap-southeast-1.aws.neon.tech/neondb');
    expect(text).toContain('dry run');
    expect(text).not.toContain('s3cr3t-pw');
    expect(text).not.toContain('someuser');
    expect(c.log).toContain('ROLLBACK');
  });

  it('--apply commits; a failure exits non-zero', async () => {
    const c = mockClient();
    expect(await main(['--apply'], { DATABASE_URL: URL_OK }, quiet, () => c)).toBe(0);
    expect(c.log).toContain('COMMIT');
    expect(await main(['--apply'], { DATABASE_URL: URL_OK }, quiet, () => mockClient({ driftCounts: true }))).toBe(1);
  });
});
