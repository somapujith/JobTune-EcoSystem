// Cloudflare Workers-compatible DB config — NOT used by the live Express
// app (see config/database.js for that). Workers has no raw TCP sockets,
// so the standard `pg` Pool cannot connect from inside a Worker; this uses
// @neondatabase/serverless's Pool instead, which speaks HTTP/WebSocket and
// is API-compatible with `pg` (same `.query()` signature), so ported route
// files can import from here unchanged in their query calls.
//
// Usage difference from config/database.js: Workers has no process.env —
// secrets/vars come from the `env` object passed into the fetch handler.
// Call getPool(env) per-request rather than sharing one module-level pool,
// since a Worker's module scope can be reused across unrelated requests/isolates.

const { Pool } = require('@neondatabase/serverless');

// Per-request pool limits. Both were measured by the S11 spike (docs/migration/s11-results.md): local Postgres
// reached through Neon's wsproxy, inside workerd.
//  - max: pg's default is 10, and a Pool opens one server connection per query in flight. dashboard.js fans out
//    8 parallel EXISTS queries in one request, so at the default one request held 8 connections and 12 concurrent
//    dashboard requests exhausted a 100-connection Postgres. 2 keeps that to 2 per request (and is not slower:
//    every extra connection costs a WebSocket + SCRAM handshake, more than the queries it saves), while leaving
//    one connection free when a handler checks a client out with db.connect() (resumeChat.js): max 1 would
//    deadlock any query the request issues while that client is held.
//  - connectionTimeoutMillis: the default 0 waits forever. A black-holed endpoint made the request hang until the
//    caller gave up (25 s+ in the spike); this bounds connect + queue wait and rejects with a normal Error.
const POOL_MAX = 2;
const CONNECTION_TIMEOUT_MS = 10000;

/**
 * @param {{ DATABASE_URL: string }} env - Workers env bindings (from fetch(request, env, ctx))
 * @returns {import('@neondatabase/serverless').Pool}
 */
function getPool(env) {
  if (!env || !env.DATABASE_URL) {
    throw new Error('DATABASE_URL not set — configure it via `wrangler secret put DATABASE_URL` or the Cloudflare dashboard (Settings > Variables and Secrets), not .env (Workers does not read .env files).');
  }

  return new Pool({
    connectionString: env.DATABASE_URL,
    max: POOL_MAX,
    connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
  });
}

module.exports = { getPool, POOL_MAX, CONNECTION_TIMEOUT_MS };
