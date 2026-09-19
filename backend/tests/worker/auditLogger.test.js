'use strict';

const { Hono } = require('hono');
const { auditLogger } = require('../../src/worker/middleware/auditLogger');
const { getMiddlewareMeta } = require('../../src/worker/lib/tag');
const { makeHarness, makeEnv, signToken, bearer, createFakeDb } = require('./helpers/harness');

const lastLog = (H) => {
  const row = H.db.state.audit_logs[H.db.state.audit_logs.length - 1];
  return row && { ...row, details: JSON.parse(row.details) };
};

describe('auditLogger', () => {
  beforeEach(() => jest.spyOn(console, 'error').mockImplementation(() => {}));
  afterEach(() => jest.restoreAllMocks());

  it('is tagged for introspection', () => {
    const mw = auditLogger('API_REQUEST', 'system');
    expect(mw.name).toBe('auditLogger(API_REQUEST)');
    expect(getMiddlewareMeta(mw)).toMatchObject({ kind: 'audit', action: 'API_REQUEST', resource: 'system' });
  });

  it('writes one row per /api request with the Express row shape', async () => {
    const H = makeHarness();
    await H.request('/api/_t/open?x=1&x=2&y=z', { headers: { 'CF-Connecting-IP': '198.51.100.7' } });
    await H.ctx.drain();
    expect(H.db.state.audit_logs).toHaveLength(1);
    const row = lastLog(H);
    expect(row).toMatchObject({ user_id: null, action: 'API_REQUEST', resource: 'system', ip_address: '198.51.100.7' });
    expect(row.details).toEqual({
      method: 'GET',
      url: '/api/_t/open?x=1&x=2&y=z',
      statusCode: 200,
      query: { x: ['1', '2'], y: 'z' },
      body: {},
    });
  });

  it('populates ip_address from CF-Connecting-IP (ADR 4.2: not NULL on Workers)', async () => {
    const H = makeHarness();
    await H.request('/api/health', { headers: { 'CF-Connecting-IP': '2001:db8::1' } });
    await H.ctx.drain();
    expect(lastLog(H).ip_address).toBe('2001:db8::1');
  });

  it('ignores X-Forwarded-For (client-controlled) and stores null when CF-Connecting-IP is absent', async () => {
    const H = makeHarness();
    await H.request('/api/health', { headers: { 'X-Forwarded-For': '6.6.6.6' } });
    await H.ctx.drain();
    expect(lastLog(H).ip_address).toBeNull();
  });

  it('records the authenticated user id (set later in the chain, read post-next)', async () => {
    const H = makeHarness();
    await H.request('/api/_t/protected', bearer(signToken({ id: 314 })));
    await H.ctx.drain();
    expect(lastLog(H).user_id).toBe(314);
  });

  it('redacts a non-empty body and records the real final status code', async () => {
    const H = makeHarness();
    await H.request('/api/_t/echo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'hunter2', email: 'a@b.c' }),
    });
    await H.ctx.drain();
    const row = lastLog(H);
    expect(row.details.body).toBe('[REDACTED]');
    expect(H.db.state.audit_logs[0].details).not.toContain('hunter2');
  });

  it('logs the masked final status for handler errors and 404s', async () => {
    const H = makeHarness();
    await H.request('/api/_t/boom');
    await H.request('/api/nope');
    await H.ctx.drain();
    expect(H.db.state.audit_logs.map((r) => JSON.parse(r.details).statusCode)).toEqual([500, 404]);
  });

  it('does not log requests outside /api', async () => {
    const H = makeHarness();
    await H.request('/not-api');
    await H.ctx.drain();
    expect(H.db.state.audit_logs).toHaveLength(0);
  });

  it('hands the insert to ctx.waitUntil and does not block the response on it', async () => {
    const H = makeHarness();
    let releaseInsert;
    const gate = new Promise((r) => { releaseInsert = r; });
    const realQuery = H.db.query.bind(H.db);
    H.db.query = (sql, params) => (/audit_logs/.test(sql) ? gate.then(() => realQuery(sql, params)) : realQuery(sql, params));

    const res = await H.request('/api/health'); // resolves although the insert is still gated
    expect(res.status).toBe(200);
    expect(H.db.state.audit_logs).toHaveLength(0);
    expect(H.ctx.waits.length).toBeGreaterThan(0); // the insert is registered with the runtime

    releaseInsert();
    await H.ctx.drain();
    expect(H.db.state.audit_logs).toHaveLength(1);
  });

  it('never fails or alters the response when the insert fails', async () => {
    const H = makeHarness();
    H.db.failWhen((sql) => /INSERT INTO audit_logs/.test(sql), new Error('audit table missing'));
    // /api/health now probes the db with SELECT 1 (working-tree Express behaviour); the fake db has no such statement
    const realQuery = H.db.query.bind(H.db);
    H.db.query = (sql, params) => (/^SELECT 1$/.test(sql) ? Promise.resolve({ rows: [{ '?column?': 1 }], rowCount: 1 }) : realQuery(sql, params));
    const res = await H.request('/api/health');
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe('ok');
    await expect(H.ctx.drain()).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalledWith('Audit Log Error:', 'audit table missing');
  });

  it('never fails the response when the db is unavailable entirely', async () => {
    const H = makeHarness({ env: makeEnv() });
    H.db.query = () => { throw new Error('pool exploded synchronously'); };
    const res = await H.request('/api/health');
    expect(res.status).toBe(200);
    await H.ctx.drain();
    expect(console.error).toHaveBeenCalledWith('Audit Log Error:', 'pool exploded synchronously');
  });

  it('works when there is no ExecutionContext (Hono throws on c.executionCtx access)', async () => {
    const db = createFakeDb();
    const app = new Hono();
    app.use('*', async (c, next) => { c.set('db', db); return next(); });
    app.use('/api/*', auditLogger('API_REQUEST', 'system'));
    app.get('/api/x', (c) => c.json({ ok: true }));

    // sanity: this really is the throwing-getter situation the guard exists for
    let threw = false;
    app.get('/api/probe', (c) => { try { c.executionCtx; } catch { threw = true; } return c.text('p'); });
    await app.request('/api/probe', {}, makeEnv());
    expect(threw).toBe(true);

    const res = await app.request('/api/x', { headers: { 'CF-Connecting-IP': '203.0.113.5' } }, makeEnv());
    expect(res.status).toBe(200);
    await db.pending();
    expect(db.state.audit_logs.find((r) => JSON.parse(r.details).url === '/api/x').ip_address).toBe('203.0.113.5');
  });

  it('does not throw when no db is configured at all (logs and moves on)', async () => {
    const app = new Hono();
    app.use('/api/*', auditLogger('API_REQUEST', 'system'));
    app.get('/api/x', (c) => c.json({ ok: true }));
    const res = await app.request('/api/x', {}, makeEnv());
    expect(res.status).toBe(200);
    await new Promise((r) => setTimeout(r, 0));
    expect(console.error).toHaveBeenCalledWith('Audit Log Error:', expect.any(String));
  });
});
