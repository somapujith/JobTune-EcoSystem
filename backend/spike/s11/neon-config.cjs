'use strict';
// SPIKE ONLY. Resolves @neondatabase/serverless through the SAME `require` condition that
// src/config/database.worker.js uses, so `neonConfig` here is the SAME module instance the production
// getPool() constructs its Pool from (the ESM build would be a second, separate copy).
//
// Points the driver at Neon's open-source wsproxy (github.com/neondatabase/wsproxy) fronting a local Postgres.
// Nothing here is used by production: database.worker.js stays untouched and relies on Neon's defaults
// (wss://<host>/v2, pipelined password auth, TLS handled by Neon's proxy).
const neon = require('@neondatabase/serverless');

function applyNeonConfig(env) {
  const c = neon.neonConfig;
  if (env.NEON_WS_PROXY) {
    c.wsProxy = (host, port) => `${env.NEON_WS_PROXY}?address=${host}:${port}`;
  }
  if (env.NEON_INSECURE_WS === '1') c.useSecureWebSocket = false;
  if (env.NEON_PIPELINE_CONNECT === 'false') c.pipelineConnect = false;
  // EXPERIMENT (hosted Neon only; the local wsproxy has no HTTP /sql endpoint): Pool.query() over fetch, no WebSocket.
  if (env.NEON_POOL_QUERY_VIA_FETCH === '1') c.poolQueryViaFetch = true;
  return c;
}

function makePool(env, opts = {}) {
  applyNeonConfig(env);
  return new neon.Pool({ connectionString: env.DATABASE_URL, ...opts });
}

module.exports = { applyNeonConfig, makePool, neon };
