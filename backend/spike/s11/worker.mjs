// S11 spike worker (throwaway, never deployed). Runs the S11 route list from ../auth/s11.mjs through the REAL
// production path: src/worker/db.js -> src/config/database.worker.js -> @neondatabase/serverless.
// The only spike-specific part is neon-config.cjs, which points the driver at a local Neon wsproxy when
// NEON_WS_PROXY is set (leave it unset to talk to real Neon with the driver's defaults).
//
// Also mounts the REAL dbMiddleware (Hono) at /s11/mw/* so the production release path
// (ctx.waitUntil(db.release()) after the response) is exercised with a real ExecutionContext.
import { Hono } from 'hono';
import { handleS11 } from '../auth/s11.mjs';
import dbjs from '../../src/worker/db.js';
import { applyNeonConfig, makePool, neon } from './neon-config.cjs';

const { createNeonDb, createRequestDb, dbMiddleware, getDb } = dbjs;
const deps = { createNeonDb, createRequestDb, makePool, applyNeon: applyNeonConfig, neon };

const app = new Hono();

// If the spike Worker is ever deployed publicly (throwaway Worker + throwaway branch only), set S11_KEY: every route but /health
// then requires the matching x-s11-key header, so the endpoint cannot be used to open connections by strangers.
app.use('*', async (c, next) => {
  if (c.env.S11_KEY && c.req.path !== '/health' && c.req.header('x-s11-key') !== c.env.S11_KEY) return c.json({ error: 'unauthorized' }, 401);
  return next();
});

// production release path: dbMiddleware + ctx.waitUntil, as in src/worker/app.js
app.use('/s11/mw/*', async (c, next) => {
  // spike only: ?proxy=host:port/v1 points this request's driver at a dead endpoint (simulates an unreachable database)
  applyNeonConfig(c.req.query('proxy') ? { ...c.env, NEON_WS_PROXY: c.req.query('proxy') } : c.env);
  c.set('config', { databaseUrl: c.env.DATABASE_URL });
  return next();
});
app.use('/s11/mw/*', dbMiddleware());
app.get('/s11/mw/req', async (c) => {
  const hold = Math.min(Number(c.req.query('hold') || 400), 5000);
  const par = Math.min(Math.max(Number(c.req.query('par') || 1), 1), 12);
  const t0 = Date.now();
  try {
    const db = getDb(c);
    const rs = await Promise.all(Array.from({ length: par }, () =>
      db.query('SELECT pg_sleep($1::float8), pg_backend_pid() AS pid', [hold / 1000])));
    const pids = [...new Set(rs.map((r) => r.rows[0].pid))];
    return c.json({ mode: 'mw', par, holdMs: hold, connections: pids.length, ms: Date.now() - t0 });
  } catch (e) {
    return c.json({ mode: 'mw', error: { name: e && e.name, message: e && e.message, code: e && e.code }, ms: Date.now() - t0 }, 500);
  }
});

// A handler with NO try/catch: a database failure must reach app.onError (masked JSON), never the runtime error page.
// The real app relies on this for every route that does not wrap its own queries (mid1 smoke observation).
app.onError((err, c) => {
  console.error('onError:', err && err.message);
  return c.json({ error: 'Internal Server Error' }, 500);
});
app.get('/s11/mw/bare', async (c) => {
  const r = await getDb(c).query('SELECT 1 AS ok');
  return c.json({ ok: r.rows[0].ok });
});

// throws a bare ErrorEvent-like value exactly as the driver's rejection would (what db.js now normalises)
app.get('/s11/mw/rawthrow', () => { throw { type: 'error', message: 'Uncaught Error: Network connection lost.' }; });

app.get('/health', (c) => c.json({ ok: true }));
app.all('/s11/*', (c) => handleS11(c.req.raw, c.env, c.executionCtx, deps));
app.all('/s11', (c) => handleS11(c.req.raw, c.env, c.executionCtx, deps));

// ?guard=1 wraps app.fetch exactly like src/worker-entry.js does (last-resort try/catch -> masked 500).
export default {
  async fetch(request, env, ctx) {
    if (new URL(request.url).searchParams.get('guard') !== '1') return app.fetch(request, env, ctx);
    try {
      return await app.fetch(request, env, ctx);
    } catch (err) {
      console.error('unhandled worker error:', err && err.message);
      return new Response(JSON.stringify({ error: 'Internal Server Error' }), { status: 500, headers: { 'Content-Type': 'application/json; charset=UTF-8' } });
    }
  },
};
