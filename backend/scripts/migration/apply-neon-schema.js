#!/usr/bin/env node
'use strict';

/**
 * Applies ONLY the additive schema pieces that Render's boot code (src/utils/runMigrations.js) used to create and that
 * the Cloudflare Worker needs. With Render gone, nothing creates them any more, and production Neon (built by
 * scripts/migrate-to-neon.js from an OLDER runMigrations) lacks them:
 *   - users.onboarding_completed  (GET /api/subscriptions/onboarded and /verify-payment read and write it: 500 without it)
 *   - career_discovery_responses  (POST/GET /api/career/discovery)
 *   - users.name, users.full_name (admin users/audit-logs and community thread/reply answer 500 without them)
 *   - github_analyses             (from src/migrations/add-github-analyses.sql; profiles GitHub history)
 *
 * Everything is `IF NOT EXISTS` and additive, runs in ONE transaction and is NOT the whole runMigrations: that one also
 * rewrites plan prices/descriptions on every run, which would overwrite hand edits. The one-time backfill
 * (onboarding_completed = true for users that already have an onboarding_responses or user_subscriptions row) runs only
 * in the run that ADDS the column, exactly as runMigrations does.
 *
 *   DATABASE_URL='postgresql://...neon.tech/...' node scripts/migration/apply-neon-schema.js            # dry run
 *   DATABASE_URL='postgresql://...neon.tech/...' node scripts/migration/apply-neon-schema.js --apply    # commit
 *
 * The dry run executes every statement and then ROLLS BACK. Both modes compare row counts of the main tables before and
 * inside the transaction and abort if anything changed. Prints host and database only, never the URL or credentials.
 * Refuses non-Neon hosts unless --allow-any-host (used by the tests and local rehearsals).
 */
const fs = require('fs');
const path = require('path');

const COUNT_TABLES = ['users', 'user_subscriptions', 'subscription_plans', 'plan_orders', 'user_sessions', 'onboarding_responses', 'resumes', 'audit_logs', 'daily_activity'];

const CAREER_DISCOVERY_DDL = `CREATE TABLE IF NOT EXISTS career_discovery_responses (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  answers JSONB NOT NULL,
  sub_answers JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
)`;

const BACKFILL = `UPDATE users SET onboarding_completed = true
  WHERE onboarding_completed = false
    AND (id IN (SELECT user_id FROM onboarding_responses) OR id IN (SELECT user_id FROM user_subscriptions))`;

function githubStatements() {
  const file = path.join(__dirname, '..', '..', 'src', 'migrations', 'add-github-analyses.sql');
  return fs.readFileSync(file, 'utf8').split(';').map((s) => s.trim()).filter(Boolean);
}

async function applySchema(client, { apply, log = console.log }) {
  const counts = async () => {
    const out = {};
    for (const t of COUNT_TABLES) {
      try { out[t] = Number((await client.query(`SELECT count(*) AS n FROM ${t}`)).rows[0].n); } catch { out[t] = 'n/a'; }
    }
    return out;
  };
  const hasColumn = async (table, column) =>
    (await client.query(`SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2`, [table, column])).rows.length > 0;

  const before = await counts();
  const columnExisted = await hasColumn('users', 'onboarding_completed');
  log(`row counts before: ${JSON.stringify(before)}`);
  log(`users.onboarding_completed already exists: ${columnExisted}`);

  await client.query('BEGIN');
  try {
    await client.query("SET LOCAL lock_timeout = '5s'");
    await client.query(CAREER_DISCOVERY_DDL);
    await client.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN NOT NULL DEFAULT false');
    let backfilled = 0;
    if (!columnExisted) backfilled = (await client.query(BACKFILL)).rowCount;
    await client.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS name VARCHAR(255)');
    await client.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS full_name VARCHAR(255)');
    for (const stmt of githubStatements()) await client.query(stmt);
    log(`all statements succeeded (onboarding backfill: ${backfilled} user(s) marked onboarded)`);
    const inside = await counts();
    if (JSON.stringify(inside) !== JSON.stringify(before)) throw new Error(`row counts changed inside the transaction: ${JSON.stringify(inside)}`);
    await client.query(apply ? 'COMMIT' : 'ROLLBACK');
    log(apply ? 'COMMITTED' : 'DRY RUN: rolled back, nothing changed (re-run with --apply to commit)');
    return { ok: true, committed: !!apply, backfilled, before };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    log(`FAILED and rolled back: ${err.message}`);
    return { ok: false, committed: false, error: err.message, before };
  }
}

async function main(argv = process.argv.slice(2), env = process.env, log = console.log, makeClient) {
  const apply = argv.includes('--apply');
  const allowAny = argv.includes('--allow-any-host');
  const urlEnvIdx = argv.indexOf('--url-env');
  const urlEnv = urlEnvIdx >= 0 ? argv[urlEnvIdx + 1] : 'DATABASE_URL';
  const url = env[urlEnv];
  if (!url) { log(`set ${urlEnv} to the Neon connection string (never pass it on a command line)`); return 64; }
  let host;
  let db;
  try { const u = new URL(url); host = u.hostname; db = u.pathname.slice(1); } catch { log(`${urlEnv} is not a valid URL`); return 64; }
  if (!allowAny && !/\.neon\.tech$/i.test(host)) { log(`refusing: ${host} is not a neon.tech host (use --allow-any-host only for a local rehearsal)`); return 64; }
  log(`target: ${host}/${db}  mode: ${apply ? 'APPLY (commit)' : 'dry run (rollback)'}   (credentials are never printed)`);

  const client = makeClient ? makeClient(url) : new (require('pg').Client)({ connectionString: url });
  await client.connect();
  try {
    const r = await applySchema(client, { apply, log });
    return r.ok ? 0 : 1;
  } finally {
    await client.end();
  }
}

if (require.main === module) main().then((c) => process.exit(c), (e) => { console.error('error:', e.message); process.exit(2); });

module.exports = { main, applySchema, COUNT_TABLES };
