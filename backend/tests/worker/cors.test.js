'use strict';

const { makeHarness, makeEnv, TEST_ORIGIN } = require('./helpers/harness');

describe('CORS (dynamic allowlist ported from app.js)', () => {
  beforeEach(() => jest.spyOn(console, 'error').mockImplementation(() => {}));
  afterEach(() => jest.restoreAllMocks());

  const get = (H, origin, path = '/api/_t/open') =>
    H.request(path, { headers: origin === undefined ? {} : { Origin: origin } });

  it('reflects an allowed origin with credentials and Vary: Origin', async () => {
    const H = makeHarness();
    const res = await get(H, TEST_ORIGIN);
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBe(TEST_ORIGIN);
    expect(res.headers.get('access-control-allow-credentials')).toBe('true');
    expect(res.headers.get('vary')).toMatch(/Origin/);
  });

  it('allows a request with no Origin header and sends no Allow-Origin', async () => {
    const H = makeHarness();
    const res = await get(H, undefined);
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('DENIES a disallowed origin the way Express did: masked 500, not 403', async () => {
    const H = makeHarness();
    const res = await get(H, 'https://evil.example');
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal Server Error' });
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
    // the route handler never ran
    expect(console.error.mock.calls.flat().join(' ')).toMatch(/Not allowed by CORS/);
  });

  it('does not run the route (nor audit it) for a denied origin beyond the error', async () => {
    let ran = false;
    const H = makeHarness({});
    H.app.get('/api/_t/side-effect', (c) => { ran = true; return c.text('x'); });
    await get(H, 'https://evil.example', '/api/_t/side-effect');
    expect(ran).toBe(false);
  });

  it('answers a preflight from an allowed origin with 204 and the configured methods/headers', async () => {
    const H = makeHarness();
    const res = await H.request('/api/_t/open', {
      method: 'OPTIONS',
      headers: {
        Origin: TEST_ORIGIN,
        'Access-Control-Request-Method': 'PATCH',
        'Access-Control-Request-Headers': 'authorization,content-type',
      },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe(TEST_ORIGIN);
    expect(res.headers.get('access-control-allow-methods')).toBe('GET,POST,PUT,PATCH,DELETE,OPTIONS');
    expect(res.headers.get('access-control-allow-headers')).toBe('Content-Type,Authorization');
    expect(res.headers.get('access-control-allow-credentials')).toBe('true');
  });

  it('rejects a preflight from a disallowed origin (500 masked, as Express)', async () => {
    const H = makeHarness();
    const res = await H.request('/api/_t/open', {
      method: 'OPTIONS',
      headers: { Origin: 'https://evil.example', 'Access-Control-Request-Method': 'GET' },
    });
    expect(res.status).toBe(500);
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('does not run auth or the audit logger for a preflight', async () => {
    const H = makeHarness();
    await H.request('/api/_t/protected', {
      method: 'OPTIONS',
      headers: { Origin: TEST_ORIGIN, 'Access-Control-Request-Method': 'GET' },
    });
    await H.ctx.drain();
    expect(H.db.state.audit_logs).toHaveLength(0);
  });

  describe('allowlist comes from config, not module scope', () => {
    it('production: only FRONTEND_URL; localhost dev origins denied', async () => {
      const H = makeHarness({ env: makeEnv({ NODE_ENV: 'production' }) });
      expect((await get(H, 'http://localhost:5173')).status).toBe(500);
      expect((await get(H, TEST_ORIGIN)).status).toBe(200);
    });

    it('development: localhost dev ports and the server port are allowed', async () => {
      const H = makeHarness({ env: makeEnv({ NODE_ENV: 'development', PORT: '8123' }) });
      for (const origin of [
        'http://localhost:5173', 'http://localhost:5174', 'http://localhost:5175', 'http://127.0.0.1:5173',
        'http://localhost:3000', 'http://localhost:8123', TEST_ORIGIN,
      ]) {
        expect((await get(H, origin)).status).toBe(200);
      }
      expect((await get(H, 'http://localhost:9999')).status).toBe(500);
    });

    it('two apps with different envs keep independent allowlists', async () => {
      const A = makeHarness({ env: makeEnv({ FRONTEND_URL: 'https://a.example' }) });
      const B = makeHarness({ env: makeEnv({ FRONTEND_URL: 'https://b.example' }) });
      expect((await get(A, 'https://a.example')).status).toBe(200);
      expect((await get(A, 'https://b.example')).status).toBe(500);
      expect((await get(B, 'https://b.example')).status).toBe(200);
    });

    it('normalises a scheme-less FRONTEND_URL instead of computing "https://undefined"', async () => {
      const H = makeHarness({ env: makeEnv({ FRONTEND_URL: 'app.example.test' }) });
      expect((await get(H, 'https://app.example.test')).status).toBe(200);
      expect((await get(H, 'https://undefined')).status).toBe(500);
    });
  });
});
