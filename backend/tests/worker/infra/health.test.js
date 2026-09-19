'use strict';

/**
 * GET /api/health mirrors the working-tree Express handler:
 *   async, `SELECT 1`, { status: 'ok' | 'degraded', db: 'connected' | 'unreachable', aiCache } with HTTP 200 always.
 * The db is the in-memory fake (it has no `SELECT 1`, so each test supplies its own answer): this proves the handler
 * logic, NOT that a real Neon connection answers `SELECT 1` inside a Worker.
 */
const { createApp } = require('../../../src/worker/app');
const { createServices } = require('../../../src/worker/services');
const { getAICacheStats } = require('../../../src/worker/lib/aiCacheStats');
const { getIsolateAiCache, AICache } = require('../../../src/worker/services/aiCache');
const { makeEnv, makeCtx, createFakeDb } = require('../helpers/harness');

/** db whose `SELECT 1` behaves as `probe` says; everything else goes to the fake (audit inserts). */
function dbWith(probe) {
  const db = createFakeDb();
  const real = db.query.bind(db);
  db.query = (sql, params) => {
    if (/^SELECT 1$/.test(sql)) {
      db.calls.push({ sql, params });
      return probe();
    }
    return real(sql, params);
  };
  return db;
}

const up = () => Promise.resolve({ rows: [{ '?column?': 1 }], rowCount: 1 });

function build({ db, servicesFactory, env } = {}) {
  const theDb = db || dbWith(up);
  const app = createApp({ dbFactory: () => theDb, servicesFactory });
  const ctx = makeCtx();
  const theEnv = env || makeEnv();
  return { app, db: theDb, ctx, request: (path, init = {}) => app.request(path, init, theEnv, ctx) };
}

describe('GET /api/health', () => {
  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    getIsolateAiCache().clear();
  });
  afterEach(() => {
    getIsolateAiCache().clear();
    jest.restoreAllMocks();
  });

  it('db reachable: 200 { status: "ok", db: "connected", aiCache } with the Express key order', async () => {
    const H = build();
    const res = await H.request('/api/health');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/^application\/json/);
    const text = await res.text();
    expect(Object.keys(JSON.parse(text))).toEqual(['status', 'db', 'aiCache']);
    expect(JSON.parse(text)).toEqual({ status: 'ok', db: 'connected', aiCache: { size: 0, hits: 0, misses: 0, hitRate: 0 } });
    expect(H.db.calls.map((c) => c.sql).filter((s) => s === 'SELECT 1')).toHaveLength(1);
  });

  it('db unreachable (rejects): still HTTP 200, status "degraded", db "unreachable"', async () => {
    const H = build({ db: dbWith(() => Promise.reject(new Error('connection refused'))) });
    const res = await H.request('/api/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'degraded', db: 'unreachable', aiCache: { size: 0, hits: 0, misses: 0, hitRate: 0 } });
  });

  it('db unreachable (query throws synchronously, e.g. no pool could be created): same degraded answer', async () => {
    const H = build({ db: dbWith(() => { throw new Error('DATABASE_URL is not set'); }) });
    const res = await H.request('/api/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: 'degraded', db: 'unreachable' });
  });

  it('a probe that never answers is bounded at 2s and reported as unreachable (HTTP 200)', async () => {
    jest.useFakeTimers();
    try {
      const H = build({ db: dbWith(() => new Promise(() => {})) });
      const pending = H.request('/api/health');
      await jest.advanceTimersByTimeAsync(2100);
      const res = await pending;
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({ status: 'degraded', db: 'unreachable' });
    } finally {
      jest.useRealTimers();
    }
  });

  it('awaits the probe: a slow database delays the response instead of racing it', async () => {
    let release;
    const gate = new Promise((r) => { release = r; });
    const H = build({ db: dbWith(() => gate.then(up)) });
    let settled = false;
    const pending = H.request('/api/health').then((r) => { settled = true; return r; });
    await new Promise((r) => setTimeout(r, 20));
    expect(settled).toBe(false);
    release();
    expect(await (await pending).json()).toMatchObject({ status: 'ok', db: 'connected' });
  });

  it('never leaks the database error text', async () => {
    const H = build({ db: dbWith(() => Promise.reject(new Error('password authentication failed for user "neondb_owner"'))) });
    const text = await (await H.request('/api/health')).text();
    expect(text).not.toMatch(/password|neondb_owner|authentication/);
  });

  it('needs no auth and still writes its audit_logs row in the background (same order as Express)', async () => {
    const H = build();
    const res = await H.request('/api/health', { headers: { 'CF-Connecting-IP': '203.0.113.9' } });
    expect(res.status).toBe(200);
    await H.ctx.drain();
    expect(H.db.state.audit_logs).toHaveLength(1);
    expect(H.db.state.audit_logs[0]).toMatchObject({ action: 'API_REQUEST', resource: 'system', ip_address: '203.0.113.9' });
  });

  it('matches a trailing slash', async () => {
    expect((await build().request('/api/health/')).status).toBe(200);
  });

  describe('aiCache stats are the real per-isolate numbers, not the placeholder', () => {
    it('reflects the isolate cache the aiClient uses (default services container)', async () => {
      const cache = getIsolateAiCache();
      cache.set('s', 'u', 1, 0.4, 'answer');
      cache.get('s', 'u', 1, 0.4); // hit
      cache.get('s', 'other', 1, 0.4); // miss
      cache.get('s', 'other2', 1, 0.4); // miss
      const H = build();
      expect((await (await H.request('/api/health')).json()).aiCache).toEqual({ size: 1, hits: 1, misses: 2, hitRate: 33 });
    });

    it('uses the aiCache of the request container when one is injected', async () => {
      const own = new AICache();
      own.set('a', 'b', 1, 0, 'v');
      own.get('a', 'b', 1, 0);
      const H = build({ servicesFactory: ({ db, config }) => createServices({ db, config, overrides: { aiCache: own } }) });
      expect((await (await H.request('/api/health')).json()).aiCache).toEqual({ size: 1, hits: 1, misses: 0, hitRate: 100 });
    });

    it('falls back to the isolate cache when a custom container has no aiCache (health must not fail on it)', async () => {
      getIsolateAiCache().set('a', 'b', 1, 0, 'v');
      const H = build({ servicesFactory: () => ({}) });
      const res = await H.request('/api/health');
      expect(res.status).toBe(200);
      expect((await res.json()).aiCache.size).toBe(1);
    });

    it('lib/aiCacheStats.getAICacheStats tolerates a missing context', () => {
      expect(getAICacheStats(undefined)).toEqual({ size: 0, hits: 0, misses: 0, hitRate: 0 });
      expect(getAICacheStats({ get: () => undefined })).toEqual({ size: 0, hits: 0, misses: 0, hitRate: 0 });
    });
  });
});
