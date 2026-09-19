'use strict';

const jsonwebtoken = require('jsonwebtoken');
const { Hono } = require('hono');
const jwt = require('../../src/worker/lib/jwt');
const password = require('../../src/worker/lib/password');
const { getClientIp, getQuery, safeWaitUntil, getOriginalUrl } = require('../../src/worker/lib/http');
const { rateLimit, apiRateLimit, authRateLimit } = require('../../src/worker/middleware/rateLimit');
const { getMiddlewareMeta } = require('../../src/worker/lib/tag');
const { makeEnv, makeHarness, TEST_JWT_SECRET } = require('./helpers/harness');

describe('lib/jwt (HS256 pinned)', () => {
  it('round-trips claims and applies expiresIn', async () => {
    const token = await jwt.sign({ id: 1, sessionId: 2 }, TEST_JWT_SECRET, { expiresIn: '15m' });
    const claims = await jwt.verify(token, TEST_JWT_SECRET);
    expect(claims).toMatchObject({ id: 1, sessionId: 2 });
    expect(claims.exp - claims.iat).toBe(900);
  });

  it('interoperates with a token signed by plain jsonwebtoken (Render) and vice versa', async () => {
    const fromRender = jsonwebtoken.sign({ id: 9 }, TEST_JWT_SECRET, { expiresIn: '15m', algorithm: 'HS256' });
    expect(await jwt.verify(fromRender, TEST_JWT_SECRET)).toMatchObject({ id: 9 });
    const fromWorker = await jwt.sign({ id: 9 }, TEST_JWT_SECRET, { expiresIn: '15m' });
    expect(jsonwebtoken.verify(fromWorker, TEST_JWT_SECRET, { algorithms: ['HS256'] })).toMatchObject({ id: 9 });
  });

  it('rejects wrong secret, expiry, other HMAC algs, and alg none', async () => {
    const good = await jwt.sign({ id: 1 }, TEST_JWT_SECRET, { expiresIn: '1h' });
    await expect(jwt.verify(good, 'y'.repeat(40))).rejects.toThrow();
    await expect(jwt.verify(jsonwebtoken.sign({ id: 1 }, TEST_JWT_SECRET, { expiresIn: -5 }), TEST_JWT_SECRET)).rejects.toThrow(/expired/);
    await expect(jwt.verify(jsonwebtoken.sign({ id: 1 }, TEST_JWT_SECRET, { algorithm: 'HS384' }), TEST_JWT_SECRET)).rejects.toThrow(/invalid algorithm/);
    const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
    await expect(jwt.verify(`${b64({ alg: 'none' })}.${b64({ id: 1 })}.`, TEST_JWT_SECRET)).rejects.toThrow();
  });

  it('exports the pinned algorithm', () => {
    expect(jwt.ALGORITHM).toBe('HS256');
  });
});

describe('lib/password (bcryptjs)', () => {
  it('hashes with $2b$ cost 10 and verifies', async () => {
    const hash = await password.hash('correct horse battery staple');
    expect(hash).toMatch(/^\$2b\$10\$.{53}$/);
    expect(await password.compare('correct horse battery staple', hash)).toBe(true);
    expect(await password.compare('wrong', hash)).toBe(false);
  });

  it('salts: same password hashes differently', async () => {
    expect(await password.hash('x')).not.toBe(await password.hash('x'));
  });

  // Node-side sanity check ONLY. It does not satisfy spike S7 / checklist item 9,
  // which need real prod hashes and the workerd runtime.
  it('cross-verifies with native bcrypt in both directions when that addon loads (Node only)', async () => {
    let native;
    try {
      native = require('bcrypt');
    } catch {
      return; // addon not built on this machine; nothing to assert
    }
    const nativeHash = await native.hash('interop-pw', await native.genSalt(10));
    expect(await password.compare('interop-pw', nativeHash)).toBe(true);
    const jsHash = await password.hash('interop-pw');
    expect(await native.compare('interop-pw', jsHash)).toBe(true);
  }, 20000);
});

describe('lib/http', () => {
  const ctxWith = (headers, url = 'https://x.test/api/a?b=1') => ({
    req: { url, header: (n) => headers[n.toLowerCase()] },
  });

  describe('getClientIp (CF-Connecting-IP only)', () => {
    it.each([
      [{ 'cf-connecting-ip': '203.0.113.5' }, '203.0.113.5'],
      [{ 'cf-connecting-ip': '  203.0.113.5 ' }, '203.0.113.5'],
      [{ 'cf-connecting-ip': '2001:db8::7334' }, '2001:db8::7334'],
      [{}, null],
      [{ 'cf-connecting-ip': '' }, null],
      [{ 'cf-connecting-ip': '   ' }, null],
      [{ 'cf-connecting-ip': 'x'.repeat(46) }, null], // would overflow VARCHAR(45)
      [{ 'x-forwarded-for': '6.6.6.6, 7.7.7.7' }, null], // never trusted
      [{ 'x-real-ip': '6.6.6.6' }, null],
    ])('%j -> %p', (headers, expected) => {
      expect(getClientIp(ctxWith(headers))).toBe(expected);
    });

    it('prefers CF-Connecting-IP over a spoofed X-Forwarded-For', () => {
      expect(getClientIp(ctxWith({ 'cf-connecting-ip': '1.2.3.4', 'x-forwarded-for': '6.6.6.6' }))).toBe('1.2.3.4');
    });
  });

  it('getQuery mimics querystring.parse: repeated keys -> arrays, null prototype', () => {
    const q = getQuery(ctxWith({}, 'https://x.test/p?a=1&a=2&b=%20x&__proto__=z'));
    expect(q.a).toEqual(['1', '2']);
    expect(q.b).toBe(' x');
    expect(Object.getPrototypeOf(q)).toBeNull();
    expect(Object.keys(getQuery(ctxWith({}, 'https://x.test/p')))).toEqual([]);
  });

  it('getOriginalUrl returns path + query', () => {
    expect(getOriginalUrl(ctxWith({}, 'https://x.test/api/a?b=1&c=2'))).toBe('/api/a?b=1&c=2');
  });

  describe('safeWaitUntil', () => {
    it('returns false (and does not throw) when the app has no ExecutionContext', async () => {
      const app = new Hono();
      let result;
      app.get('/x', (c) => { result = safeWaitUntil(c, Promise.resolve()); return c.text('ok'); });
      await app.request('/x', {}, makeEnv());
      expect(result).toBe(false);
    });
    it('hands the promise to ctx.waitUntil when one exists', async () => {
      const app = new Hono();
      const waits = [];
      let result;
      app.get('/x', (c) => { result = safeWaitUntil(c, Promise.resolve('p')); return c.text('ok'); });
      await app.request('/x', {}, makeEnv(), { waitUntil: (p) => waits.push(p), passThroughOnException() {} });
      expect(result).toBe(true);
      expect(waits).toHaveLength(1);
    });
  });
});

describe('rate limiting placeholder (ADR 4.4)', () => {
  beforeEach(() => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  it('is tagged and flags that enforcement depends on a binding', () => {
    expect(getMiddlewareMeta(apiRateLimit())).toMatchObject({ kind: 'ratelimit', binding: 'API_LIMITER' });
    expect(getMiddlewareMeta(authRateLimit())).toMatchObject({ kind: 'ratelimit', binding: 'AUTH_LIMITER' });
  });

  it('without a binding: passes through and warns once per env (it is NOT a limiter)', async () => {
    const env = makeEnv({ API_LIMITER: undefined });
    const H = makeHarness({ env });
    await H.request('/api/health');
    await H.request('/api/health');
    const warnings = console.warn.mock.calls.flat().filter((m) => /rate limiting is NOT active/.test(m));
    expect(warnings).toHaveLength(1);
  });

  it('with a binding: 429 with the Express-identical body once the binding says no', async () => {
    const limit = jest.fn().mockResolvedValueOnce({ success: true }).mockResolvedValueOnce({ success: false });
    const H = makeHarness({ env: makeEnv({ API_LIMITER: { limit } }) });
    const ok = await H.request('/api/health', { headers: { 'CF-Connecting-IP': '198.51.100.4' } });
    const blocked = await H.request('/api/health', { headers: { 'CF-Connecting-IP': '198.51.100.4' } });
    expect(ok.status).toBe(200);
    expect(blocked.status).toBe(429);
    expect(await blocked.json()).toEqual({ error: 'Too many requests, please try again later.' });
    expect(limit).toHaveBeenCalledWith({ key: '198.51.100.4' });
  });

  it('auth limiter uses the auth message', async () => {
    const app = new Hono();
    app.use('*', authRateLimit());
    app.get('/x', (c) => c.text('ok'));
    const res = await app.request('/x', {}, makeEnv({ AUTH_LIMITER: { limit: async () => ({ success: false }) } }));
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: 'Too many authentication attempts, please try again later.' });
  });

  it('a binding error allows the request (logged) rather than taking the API down', async () => {
    const app = new Hono();
    app.use('*', rateLimit({ binding: 'B', message: 'm', name: 'n' }));
    app.get('/x', (c) => c.text('ok'));
    const res = await app.request('/x', {}, makeEnv({ B: { limit: async () => { throw new Error('binding down'); } } }));
    expect(res.status).toBe(200);
    expect(console.error).toHaveBeenCalledWith('rate limit binding error (allowing request):', 'binding down');
  });
});
