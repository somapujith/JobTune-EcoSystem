'use strict';

const jsonwebtoken = require('jsonwebtoken');
const { Hono } = require('hono');
const { authenticateToken } = require('../../src/worker/middleware/auth');
const { getMiddlewareMeta } = require('../../src/worker/lib/tag');
const { createSessionService } = require('../../src/worker/services/sessionService');
const { createConfig } = require('../../src/worker/config');
const {
  makeHarness, makeEnv, signToken, bearer, TEST_JWT_SECRET, createFakeDb,
} = require('./helpers/harness');

const UNAUTHORIZED = { error: 'Unauthorized' };
const SUPERSEDED = {
  error: 'This account was signed in on another device. Sign in again to use JobTune on this device.',
  code: 'SESSION_SUPERSEDED',
};

describe('authenticateToken', () => {
  beforeEach(() => jest.spyOn(console, 'error').mockImplementation(() => {}));
  afterEach(() => jest.restoreAllMocks());

  const protectedPath = '/api/_t/protected';

  // Helper: seed a live session directly (as sessionService.createSession would)
  async function login(H, userId = 7, meta = { ipAddress: '203.0.113.9', userAgent: 'Mozilla/5.0 (Windows NT 10.0)' }) {
    const svc = createSessionService({ db: H.db, config: createConfig(H.env) });
    return svc.createSession(userId, meta);
  }

  it('is tagged for introspection', () => {
    expect(authenticateToken.name).toBe('authenticateToken');
    expect(getMiddlewareMeta(authenticateToken)).toMatchObject({ kind: 'auth', name: 'authenticateToken' });
  });

  describe('rejections (each returns 401 and never reaches the handler)', () => {
    let H;
    let reached;
    beforeEach(() => {
      H = makeHarness();
      reached = false;
      H.app.get('/api/_t/spy', authenticateToken, (c) => { reached = true; return c.json({ ok: true }); });
    });

    const expectRejected = async (init, body = UNAUTHORIZED) => {
      const res = await H.request('/api/_t/spy', init);
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual(body);
      expect(reached).toBe(false);
    };

    it('no Authorization header', () => expectRejected({}));
    it('empty Authorization header', () => expectRejected({ headers: { Authorization: '' } }));
    it('header with no second part ("Bearer")', () => expectRejected({ headers: { Authorization: 'Bearer' } }));
    it('garbage token', () => expectRejected(bearer('not.a.jwt')));
    it('scheme other than Bearer carrying a bad token ("Basic abc123")', () =>
      expectRejected({ headers: { Authorization: 'Basic abc123' } }));
    it('token signed with the wrong secret', () =>
      expectRejected(bearer(signToken({ id: 1 }, { secret: 'a-different-secret-that-is-long-enough-xx' }))));
    it('expired token', () => expectRejected(bearer(signToken({ id: 1 }, { expiresIn: -60 }))));

    it('alg "none" token', () => {
      const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
      const token = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ id: 1 })}.`;
      return expectRejected(bearer(token));
    });

    it('token signed HS384 with the CORRECT secret (algorithm is pinned to HS256)', () =>
      expectRejected(bearer(jsonwebtoken.sign({ id: 1 }, TEST_JWT_SECRET, { algorithm: 'HS384' }))));

    it('token signed HS512 with the CORRECT secret', () =>
      expectRejected(bearer(jsonwebtoken.sign({ id: 1 }, TEST_JWT_SECRET, { algorithm: 'HS512' }))));

    it('logs "JWT Verify Error:" with the reason, like Express', async () => {
      await H.request('/api/_t/spy', bearer('not.a.jwt'));
      expect(console.error).toHaveBeenCalledWith('JWT Verify Error:', expect.any(String));
    });
  });

  describe('session checks', () => {
    it('accepts a valid token that carries no sessionId, without touching the database', async () => {
      const H = makeHarness();
      const token = signToken({ id: 42 });
      const res = await H.request(protectedPath, bearer(token));
      expect(res.status).toBe(200);
      const { user } = await res.json();
      expect(user).toMatchObject({ id: 42 });
      expect(H.db.calls.filter((c) => /user_sessions/.test(c.sql))).toEqual([]);
    });

    it('accepts a token whose session is active and sets user {id, sessionId, iat, exp}', async () => {
      const H = makeHarness();
      const { accessToken, session } = await login(H, 7);
      const res = await H.request(protectedPath, bearer(accessToken));
      expect(res.status).toBe(200);
      const { user } = await res.json();
      expect(user).toEqual({ id: 7, sessionId: session.id, iat: expect.any(Number), exp: expect.any(Number) });
    });

    it('touches last_active_at in the background via waitUntil', async () => {
      const H = makeHarness();
      const { accessToken, session } = await login(H, 7);
      const row = H.db.state.user_sessions.find((s) => s.id === session.id);
      const before = row.last_active_at.getTime();
      H.db.setNow(H.db.now + 60_000);
      await H.request(protectedPath, bearer(accessToken));
      await H.ctx.drain();
      expect(row.last_active_at.getTime()).toBeGreaterThan(before);
    });

    it('a slow/failed background touch never affects the response', async () => {
      const H = makeHarness();
      const { accessToken } = await login(H, 7);
      H.db.failWhen((sql) => /SET last_active_at/.test(sql), new Error('touch failed'));
      const res = await H.request(protectedPath, bearer(accessToken));
      expect(res.status).toBe(200);
      await expect(H.ctx.drain()).resolves.toBeUndefined();
    });

    it('SESSION_SUPERSEDED when the session was revoked (exact body and code)', async () => {
      const H = makeHarness();
      const { accessToken, session } = await login(H, 7);
      H.db.state.user_sessions.find((s) => s.id === session.id).revoked_at = new Date();
      const res = await H.request(protectedPath, bearer(accessToken));
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual(SUPERSEDED);
    });

    it('SESSION_SUPERSEDED when the session has expired', async () => {
      const H = makeHarness();
      await login(H, 7);
      H.db.setNow(H.db.now + 8 * 24 * 60 * 60 * 1000); // past 7-day refresh expiry
      const res = await H.request(protectedPath, bearer(signToken({ id: 7, sessionId: 1 })));
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual(SUPERSEDED);
    });

    it('SESSION_SUPERSEDED for a sessionId that does not exist', async () => {
      const H = makeHarness();
      const res = await H.request(protectedPath, bearer(signToken({ id: 7, sessionId: 999 })));
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual(SUPERSEDED);
    });

    it('SESSION_SUPERSEDED for a non-integer sessionId (never reaches SQL)', async () => {
      const H = makeHarness();
      const res = await H.request(protectedPath, bearer(signToken({ id: 7, sessionId: "1; DROP TABLE users" })));
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual(SUPERSEDED);
      expect(H.db.calls.filter((c) => /user_sessions/.test(c.sql))).toEqual([]);
    });

    it('fails closed with 401 Unauthorized (existing behaviour) when the session lookup errors', async () => {
      const H = makeHarness();
      const { accessToken } = await login(H, 7);
      H.db.failWhen((sql) => /SELECT id FROM user_sessions/.test(sql), new Error('connection reset'));
      const res = await H.request(protectedPath, bearer(accessToken));
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual(UNAUTHORIZED);
    });

    it('preserves the Express quirk: any scheme word works as long as the second part is a valid token', async () => {
      const H = makeHarness();
      const res = await H.request(protectedPath, { headers: { Authorization: `Token ${signToken({ id: 3 })}` } });
      expect(res.status).toBe(200);
    });

    it('records the client IP from CF-Connecting-IP on the context', async () => {
      const H = makeHarness();
      const res = await H.request(protectedPath, {
        headers: { Authorization: `Bearer ${signToken({ id: 3 })}`, 'CF-Connecting-IP': '198.51.100.23' },
      });
      expect((await res.json()).ip).toBe('198.51.100.23');
    });
  });

  describe('configuration failure inside the middleware itself', () => {
    it('returns a masked 500 and never calls next() when config cannot be built', async () => {
      const app = new Hono();
      let reached = false;
      app.get('/x', authenticateToken, (c) => { reached = true; return c.text('no'); });
      const badEnv = makeEnv({ JWT_SECRET: 'short' });
      const res = await app.request('/x', bearer(signToken({ id: 1 })), badEnv);
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: 'Internal Server Error' });
      expect(reached).toBe(false);
    });

    it('does not exit the process', async () => {
      const exit = jest.spyOn(process, 'exit').mockImplementation(() => { throw new Error('exit called'); });
      const app = new Hono();
      app.get('/x', authenticateToken, (c) => c.text('no'));
      await app.request('/x', bearer('x'), makeEnv({ JWT_SECRET: undefined }));
      expect(exit).not.toHaveBeenCalled();
    });

    it('builds config from c.env when mounted on a bare app with a valid env', async () => {
      const app = new Hono();
      app.get('/x', authenticateToken, (c) => c.json({ user: c.get('user') }));
      const res = await app.request('/x', bearer(signToken({ id: 5 })), makeEnv());
      expect(res.status).toBe(200); // no sessionId in the token, so no services are needed
      expect((await res.json()).user).toMatchObject({ id: 5 });
    });
  });
});
