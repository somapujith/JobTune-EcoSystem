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

/**
 * @param {{ DATABASE_URL: string }} env - Workers env bindings (from fetch(request, env, ctx))
 * @returns {import('@neondatabase/serverless').Pool}
 */
function getPool(env) {
  if (!env || !env.DATABASE_URL) {
    throw new Error('DATABASE_URL not set — configure it via `wrangler secret put DATABASE_URL` or the Cloudflare dashboard (Settings > Variables and Secrets), not .env (Workers does not read .env files).');
  }

  return new Pool({ connectionString: env.DATABASE_URL });
}

module.exports = { getPool };
