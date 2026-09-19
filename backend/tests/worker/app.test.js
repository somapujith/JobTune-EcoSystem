'use strict';

const { makeHarness, makeEnv } = require('./helpers/harness');
const { getIsolateAiCache } = require('../../src/worker/services/aiCache');

describe('app skeleton', () => {
  beforeEach(() => jest.spyOn(console, 'error').mockImplementation(() => {}));
  afterEach(() => jest.restoreAllMocks());

  describe('GET /api/health', () => {
    // The fake db has no "SELECT 1"; answer it here (health probes the db since the working-tree Express version).
    const healthyHarness = () => {
      const H = makeHarness();
      const realQuery = H.db.query.bind(H.db);
      H.db.query = (sql, params) => {
        if (!/^SELECT 1$/.test(sql)) return realQuery(sql, params);
        H.db.calls.push({ sql, params });
        return Promise.resolve({ rows: [{ '?column?': 1 }], rowCount: 1 });
      };
      return H;
    };
    beforeEach(() => getIsolateAiCache().clear());

    it('returns what the working-tree Express endpoint returns: { status, db, aiCache: {...} }', async () => {
      const H = healthyHarness();
      const res = await H.request('/api/health');
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toMatch(/^application\/json/);
      expect(await res.json()).toEqual({
        status: 'ok',
        db: 'connected',
        aiCache: { size: 0, hits: 0, misses: 0, hitRate: 0 },
      });
    });

    it('matches with a trailing slash, like Express non-strict routing', async () => {
      const H = healthyHarness();
      expect((await H.request('/api/health/')).status).toBe(200);
    });

    it('needs no auth; the only database work is the SELECT 1 probe (plus the background audit insert)', async () => {
      const H = healthyHarness();
      const res = await H.request('/api/health');
      expect(res.status).toBe(200);
      expect(H.db.calls.filter((c) => !/audit_logs/.test(c.sql)).map((c) => c.sql)).toEqual(['SELECT 1']);
    });
  });

  describe('error handler (middleware/errorHandler.js semantics)', () => {
    it('masks 500 errors: generic body, no message, no stack, no paths', async () => {
      const H = makeHarness();
      const res = await H.request('/api/_t/boom');
      const text = await res.text();
      expect(res.status).toBe(500);
      expect(JSON.parse(text)).toEqual({ error: 'Internal Server Error' });
      expect(text).not.toMatch(/secret internal detail|postgres:|at .*\(|\.js:\d+|node_modules/);
    });

    it('logs the real message for 5xx (operators need it) but the stack only in development', async () => {
      const prod = makeHarness();
      await prod.request('/api/_t/boom');
      const prodLog = console.error.mock.calls.flat().join('\n');
      expect(prodLog).toMatch(/GET \/api\/_t\/boom - secret internal detail/);
      expect(prodLog).not.toMatch(/\bat .*\.js:\d+/);

      console.error.mockClear();
      const dev = makeHarness({ env: makeEnv({ NODE_ENV: 'development' }) });
      const res = await dev.request('/api/_t/boom');
      expect(console.error.mock.calls.flat().join('\n')).toMatch(/\bat .*\.js:\d+/); // stack logged...
      expect(await res.text()).not.toMatch(/\bat .*\.js:\d+/); // ...but never returned
    });

    it('returns the message for client errors (status < 500), keeping the status', async () => {
      const H = makeHarness();
      const res = await H.request('/api/_t/teapot');
      expect(res.status).toBe(418);
      expect(await res.json()).toEqual({ error: 'I am a teapot' });
    });

    it('honours err.statusCode as well as err.status', async () => {
      const H = makeHarness();
      H.app.get('/api/_t/sc', () => {
        const err = new Error('bad input');
        err.statusCode = 422;
        throw err;
      });
      const res = await H.request('/api/_t/sc');
      expect(res.status).toBe(422);
      expect(await res.json()).toEqual({ error: 'bad input' });
    });

    it('treats an out-of-range status as 500 instead of crashing the handler', async () => {
      const H = makeHarness();
      H.app.get('/api/_t/weird', () => {
        const err = new Error('weird');
        err.status = 999;
        throw err;
      });
      const res = await H.request('/api/_t/weird');
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: 'Internal Server Error' });
    });

    it('async handler rejections are handled the same way', async () => {
      const H = makeHarness();
      H.app.get('/api/_t/reject', async () => {
        await Promise.resolve();
        throw new Error('db exploded: password=hunter2');
      });
      const res = await H.request('/api/_t/reject');
      expect(res.status).toBe(500);
      expect(await res.text()).not.toContain('hunter2');
    });
  });

  describe('not found (Express default 404)', () => {
    it('returns the finalhandler HTML for an unknown /api route', async () => {
      const H = makeHarness();
      const res = await H.request('/api/nope');
      expect(res.status).toBe(404);
      expect(res.headers.get('content-type')).toBe('text/html; charset=utf-8');
      expect(await res.text()).toBe(
        '<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<title>Error</title>\n</head>\n' +
          '<body>\n<pre>Cannot GET /api/nope</pre>\n</body>\n</html>\n'
      );
    });

    it('names the method and escapes the path', async () => {
      const H = makeHarness();
      const res = await H.request('/api/%3Cscript%3E', { method: 'POST' });
      expect(res.status).toBe(404);
      const body = await res.text();
      expect(body).toContain('Cannot POST /api/%3Cscript%3E');
      expect(body).not.toContain('<script>');
    });

    it('answers HEAD with no body', async () => {
      const H = makeHarness();
      const res = await H.request('/api/nope', { method: 'HEAD' });
      expect(res.status).toBe(404);
      expect(await res.text()).toBe('');
    });

    it('404s unknown non-/api paths the same way (SSR/static serving is out of scope, ADR 0.1)', async () => {
      const H = makeHarness();
      const res = await H.request('/anything/else');
      expect(res.status).toBe(404);
      expect(await res.text()).toContain('Cannot GET /anything/else');
    });

    it('routes other than /api/health are not registered yet', async () => {
      const H = makeHarness();
      for (const p of ['/api/auth/login', '/api/subscriptions/plans', '/api/resume']) {
        expect((await H.request(p)).status).toBe(404);
      }
    });

    it('still runs the audit logger for unknown /api paths, as Express did', async () => {
      const H = makeHarness();
      await H.request('/api/nope');
      await H.ctx.drain();
      expect(H.db.state.audit_logs).toHaveLength(1);
      expect(JSON.parse(H.db.state.audit_logs[0].details).statusCode).toBe(404);
    });
  });

  describe('body parsing (express.json / express.urlencoded, 1mb)', () => {
    const json = (H, body, extra = {}) =>
      H.request('/api/_t/echo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...extra },
        body,
      });

    it('parses a JSON object', async () => {
      const H = makeHarness();
      const res = await json(H, JSON.stringify({ a: 1, b: [2] }));
      expect(await res.json()).toEqual({ body: { a: 1, b: [2] } });
    });

    it('gives {} for an empty JSON body and undefined when there is no body at all', async () => {
      const H = makeHarness();
      expect(await (await json(H, '', { 'Content-Length': '0' })).json()).toEqual({ body: {} });
      const none = await H.request('/api/_t/echo', { method: 'POST' });
      expect(await none.json()).toEqual({ body: null }); // undefined -> null in the echo route
    });

    it('rejects malformed JSON with 400 and the parser message (Express leaked the same)', async () => {
      const H = makeHarness();
      const res = await json(H, '{"a": ');
      expect(res.status).toBe(400);
      const { error } = await res.json();
      expect(error).toEqual(expect.any(String));
      expect(error.length).toBeGreaterThan(0);
    });

    it('applies body-parser strict mode: a bare string/number is a 400', async () => {
      const H = makeHarness();
      const res = await json(H, '"just a string"');
      expect(res.status).toBe(400);
      expect((await res.json()).error).toMatch(/Unexpected token '"'|not valid JSON/);
    });

    it('rejects > 1 MiB JSON with 413 {"error":"request entity too large"} via Content-Length', async () => {
      const H = makeHarness();
      const big = JSON.stringify({ pad: 'x'.repeat(1024 * 1024 + 10) });
      const res = await json(H, big, { 'Content-Length': String(Buffer.byteLength(big)) });
      expect(res.status).toBe(413);
      expect(await res.json()).toEqual({ error: 'request entity too large' });
    });

    it('rejects > 1 MiB JSON with 413 when there is no Content-Length (chunked)', async () => {
      const H = makeHarness();
      const big = JSON.stringify({ pad: 'x'.repeat(1024 * 1024 + 10) });
      const res = await json(H, big, { 'Transfer-Encoding': 'chunked' });
      expect(res.status).toBe(413);
    });

    it('accepts a body just under the limit', async () => {
      const H = makeHarness();
      const ok = JSON.stringify({ pad: 'x'.repeat(1024 * 1024 - 100) });
      const res = await json(H, ok, { 'Content-Length': String(Buffer.byteLength(ok)) });
      expect(res.status).toBe(200);
    });

    it('parses urlencoded bodies (extended: false), repeated keys become arrays', async () => {
      const H = makeHarness();
      const res = await H.request('/api/_t/echo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': '17' },
        body: 'a=1&b=x%20y&a=2',
      });
      expect(await res.json()).toEqual({ body: { a: ['1', '2'], b: 'x y' } });
    });

    it('does NOT apply the 1 MB limit to multipart uploads (routes enforce 5 MB / 10 MB)', async () => {
      const H = makeHarness();
      const payload = 'x'.repeat(2 * 1024 * 1024);
      const res = await H.request('/api/_t/echo', {
        method: 'POST',
        headers: { 'Content-Type': 'multipart/form-data; boundary=zz', 'Content-Length': String(payload.length) },
        body: payload,
      });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ body: null });
    });

    it('does not parse JSON sent with a non-JSON content type', async () => {
      const H = makeHarness();
      const res = await H.request('/api/_t/echo', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain', 'Content-Length': '7' },
        body: '{"a":1}',
      });
      expect(await res.json()).toEqual({ body: null });
    });
  });
});
