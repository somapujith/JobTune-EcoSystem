'use strict';

/**
 * AUTH_LIMITER is keyed by the ACCOUNT being attacked (lower-cased email), not by IP. Reason (production data): the live
 * database shows every user arriving from a couple of shared proxy IPs, so a per-IP auth limit would throttle everyone.
 */
const { Hono } = require('hono');
const { authRateLimit, apiRateLimit, accountKey } = require('../../src/worker/middleware/rateLimit');
const { bodyParser } = require('../../src/worker/middleware/bodyParser');
const { makeEnv } = require('./helpers/harness');

function build(limit) {
  const app = new Hono();
  app.use('*', bodyParser());
  app.use('*', authRateLimit());
  app.post('/api/auth/login', (c) => c.text('ok'));
  app.post('/api/auth/signup', (c) => c.text('ok'));
  app.post('/api/auth/refresh', (c) => c.text('ok'));
  app.get('/api/auth/me', (c) => c.text('ok'));
  const env = makeEnv({ AUTH_LIMITER: { limit } });
  const post = (path, body, headers = {}) =>
    app.request(path, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) }, env);
  return { app, env, post };
}

describe('AUTH_LIMITER key', () => {
  it('login and signup are keyed by the lower-cased, trimmed email', async () => {
    const limit = jest.fn(async () => ({ success: true }));
    const { post } = build(limit);
    await post('/api/auth/login', { email: '  Alice@Example.COM ', password: 'x' });
    await post('/api/auth/signup', { email: 'bob@example.com', password: 'x' });
    expect(limit.mock.calls.map(([a]) => a.key)).toEqual(['acct:alice@example.com', 'acct:bob@example.com']);
  });

  it('two different users behind the SAME IP are throttled independently (the shared-proxy case)', async () => {
    const seen = new Map();
    const limit = async ({ key }) => {
      const n = (seen.get(key) || 0) + 1;
      seen.set(key, n);
      return { success: n <= 5 };
    };
    const { post } = build(limit);
    const same = { 'CF-Connecting-IP': '203.0.113.9' };
    const statuses = [];
    for (let i = 0; i < 7; i++) statuses.push((await post('/api/auth/login', { email: 'victim@example.com', password: 'bad' }, same)).status);
    expect(statuses).toEqual([200, 200, 200, 200, 200, 429, 429]); // the attacked account is limited after 5
    expect((await post('/api/auth/login', { email: 'other@example.com', password: 'ok' }, same)).status).toBe(200); // same IP, other account
  });

  it('the attacker cannot dodge the limit by rotating IPs or by changing the email case', async () => {
    const seen = new Map();
    const limit = async ({ key }) => {
      const n = (seen.get(key) || 0) + 1;
      seen.set(key, n);
      return { success: n <= 2 };
    };
    const { post } = build(limit);
    const codes = [];
    for (const [ip, email] of [['1.1.1.1', 'v@x.test'], ['2.2.2.2', 'V@X.TEST'], ['3.3.3.3', ' v@x.test']]) {
      codes.push((await post('/api/auth/login', { email, password: 'bad' }, { 'CF-Connecting-IP': ip })).status);
    }
    expect(codes).toEqual([200, 200, 429]);
  });

  it('a body with no email shares one bucket; a non-string email is treated as no email; overlong emails are truncated', async () => {
    const limit = jest.fn(async () => ({ success: true }));
    const { post } = build(limit);
    await post('/api/auth/login', { password: 'x' });
    await post('/api/auth/login', { email: { $ne: null }, password: 'x' });
    await post('/api/auth/login', { email: 'a'.repeat(1000) + '@x.test', password: 'x' });
    const keys = limit.mock.calls.map(([a]) => a.key);
    expect(keys[0]).toBe('acct:(no-email)');
    expect(keys[1]).toBe('acct:(no-email)');
    expect(keys[2]).toBe('acct:' + 'a'.repeat(254));
  });

  it('refresh, me and other endpoints are not counted by the auth limiter', async () => {
    const limit = jest.fn(async () => ({ success: false })); // would 429 everything it counted
    const { app, env, post } = build(limit);
    expect((await post('/api/auth/refresh', { refreshToken: 'x' })).status).toBe(200);
    expect((await app.request('/api/auth/me', {}, env)).status).toBe(200);
    expect(limit).not.toHaveBeenCalled();
  });

  it('accountKey ignores non-POST requests, treats a trailing slash the same, and skips other paths', () => {
    const fakeCtx = (method, path, body) => ({ req: { method, url: 'http://x.test' + path }, get: (k) => (k === 'body' ? body : undefined) });
    expect(accountKey(fakeCtx('GET', '/api/auth/login', { email: 'a@b.c' }))).toBeNull();
    expect(accountKey(fakeCtx('POST', '/api/auth/login/', { email: 'a@b.c' }))).toBe('acct:a@b.c');
    expect(accountKey(fakeCtx('POST', '/api/auth/refresh', { email: 'a@b.c' }))).toBeNull();
  });
});

describe('API_LIMITER remains a per-IP flood backstop', () => {
  it('keys by CF-Connecting-IP', async () => {
    const limit = jest.fn(async () => ({ success: true }));
    const app = new Hono();
    app.use('*', apiRateLimit());
    app.get('/x', (c) => c.text('ok'));
    await app.request('/x', { headers: { 'CF-Connecting-IP': '198.51.100.7' } }, makeEnv({ API_LIMITER: { limit } }));
    expect(limit).toHaveBeenCalledWith({ key: '198.51.100.7' });
  });
});
