'use strict';

const crypto = require('node:crypto');
const jsonwebtoken = require('jsonwebtoken');
const { createSessionService, hashToken, parseDeviceName } = require('../../src/worker/services/sessionService');
const { createConfig } = require('../../src/worker/config');
const {
  makeHarness, makeEnv, bearer, createFakeDb, TEST_JWT_SECRET,
} = require('./helpers/harness');

const DAY = 24 * 60 * 60 * 1000;

function setup(envOverrides = {}) {
  const db = createFakeDb();
  const config = createConfig(makeEnv(envOverrides));
  return { db, config, svc: createSessionService({ db, config }) };
}

describe('sessionService (ported from services/sessionService.js)', () => {
  describe('surface', () => {
    it('keeps every original method and does NOT include schema bootstrap (ADR 6.5)', () => {
      const { svc } = setup();
      expect(Object.keys(svc).sort()).toEqual(
        ['createSession', 'getActiveSession', 'isSessionActive', 'listSessions', 'refreshSession',
          'revokeAllSessions', 'revokeSession', 'touchSession'].sort()
      );
    });

    it('methods work when destructured (closures, not `this`)', async () => {
      const { svc } = setup();
      const { createSession, getActiveSession } = svc;
      await createSession(1, { ipAddress: '1.1.1.1' });
      expect(await getActiveSession(1)).not.toBeNull();
    });

    it('requires db and config', () => {
      expect(() => createSessionService({})).toThrow(TypeError);
      expect(() => createSessionService({ db: { query() {} }, config: {} })).toThrow(TypeError);
    });
  });

  describe('createSession', () => {
    it('returns { accessToken, refreshToken, session } with the original shape', async () => {
      const { svc } = setup();
      const out = await svc.createSession(5, { userAgent: 'Mozilla/5.0 (Windows NT 10.0)', ipAddress: '203.0.113.9' });
      expect(Object.keys(out).sort()).toEqual(['accessToken', 'refreshToken', 'session']);
      expect(out.session).toEqual({
        id: 1,
        deviceName: 'Windows',
        expiresAt: expect.any(Date),
        createdAt: expect.any(Date),
      });
      expect(out.refreshToken).toMatch(/^[0-9a-f]{96}$/); // randomBytes(48) hex
    });

    it('issues an HS256 access token {id, sessionId} with the configured TTL', async () => {
      const { svc } = setup(); // default 15m
      const { accessToken, session } = await svc.createSession(5, { ipAddress: '1.1.1.1' });
      const header = JSON.parse(Buffer.from(accessToken.split('.')[0], 'base64url').toString());
      expect(header.alg).toBe('HS256');
      const claims = jsonwebtoken.verify(accessToken, TEST_JWT_SECRET, { algorithms: ['HS256'] });
      expect(claims).toEqual({ id: 5, sessionId: session.id, iat: expect.any(Number), exp: expect.any(Number) });
      expect(claims.exp - claims.iat).toBe(15 * 60);
    });

    it('honours ACCESS_TOKEN_TTL and REFRESH_TOKEN_DAYS from config (incl. the 30 day clamp)', async () => {
      const { svc } = setup({ ACCESS_TOKEN_TTL: '1h', REFRESH_TOKEN_DAYS: '90' });
      const before = Date.now();
      const { accessToken, session } = await svc.createSession(5, {});
      const claims = jsonwebtoken.decode(accessToken);
      expect(claims.exp - claims.iat).toBe(3600);
      expect(session.expiresAt.getTime() - before).toBeGreaterThan(29.9 * DAY);
      expect(session.expiresAt.getTime() - before).toBeLessThan(30.1 * DAY);
    });

    it('defaults refresh expiry to 7 days', async () => {
      const { svc } = setup();
      const before = Date.now();
      const { session } = await svc.createSession(5, {});
      expect(session.expiresAt.getTime() - before).toBeGreaterThan(6.9 * DAY);
      expect(session.expiresAt.getTime() - before).toBeLessThan(7.1 * DAY);
    });

    it('stores only the sha256 of the refresh token, never the token', async () => {
      const { svc, db } = setup();
      const { refreshToken } = await svc.createSession(5, {});
      const stored = db.state.user_sessions[0].refresh_token_hash;
      expect(stored).toBe(crypto.createHash('sha256').update(refreshToken).digest('hex'));
      expect(stored).toBe(hashToken(refreshToken));
      expect(JSON.stringify(db.state)).not.toContain(refreshToken);
    });

    it('stores user agent, ip and derived device name (null when absent)', async () => {
      const { svc, db } = setup();
      await svc.createSession(1, { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X)', ipAddress: '9.9.9.9' });
      await svc.createSession(2, {});
      expect(db.state.user_sessions[0]).toMatchObject({ device_name: 'Mac', ip_address: '9.9.9.9', user_agent: expect.any(String) });
      expect(db.state.user_sessions[1]).toMatchObject({ device_name: 'Unknown device', ip_address: null, user_agent: null });
    });

    it('prefers an explicit deviceName', async () => {
      const { svc, db } = setup();
      await svc.createSession(1, { deviceName: 'My laptop', userAgent: 'Windows' });
      expect(db.state.user_sessions[0].device_name).toBe('My laptop');
    });

    it('parseDeviceName order matches the original', () => {
      expect(parseDeviceName('iPhone Mobile Safari')).toBe('Mobile device');
      expect(parseDeviceName('iPad Tablet')).toBe('Tablet');
      expect(parseDeviceName('Windows NT')).toBe('Windows');
      expect(parseDeviceName('Mac OS X')).toBe('Mac');
      expect(parseDeviceName('X11; Linux x86_64')).toBe('Linux');
      expect(parseDeviceName()).toBe('Unknown device');
    });
  });

  describe('single-active-device enforcement, the sameDevice IP logic (original line 70)', () => {
    const A = { userAgent: 'Mozilla/5.0 (Windows NT 10.0)', ipAddress: '203.0.113.10' };
    const B = { userAgent: 'Mozilla/5.0 (Macintosh)', ipAddress: '198.51.100.20' };

    it('re-login from the SAME IP does NOT throw ACCOUNT_IN_USE; the old session is revoked', async () => {
      const { svc, db } = setup();
      const first = await svc.createSession(1, A);
      const second = await svc.createSession(1, A);
      expect(second.session.id).not.toBe(first.session.id);
      expect(db.state.user_sessions.find((s) => s.id === first.session.id).revoked_at).not.toBeNull();
      expect(await svc.isSessionActive(first.session.id)).toBe(false);
      expect(await svc.isSessionActive(second.session.id)).toBe(true);
      expect(db.state.user_sessions.filter((s) => s.revoked_at == null)).toHaveLength(1);
    });

    it('login from a DIFFERENT IP throws ACCOUNT_IN_USE with the original error shape', async () => {
      const { svc, db } = setup();
      const first = await svc.createSession(1, A);
      let err;
      try { await svc.createSession(1, B); } catch (e) { err = e; }
      expect(err).toBeInstanceOf(Error);
      expect(err.code).toBe('ACCOUNT_IN_USE');
      expect(err.message).toBe('This account is already active on another device.');
      expect(err.activeSession).toEqual({
        deviceName: 'Windows',
        ipAddress: A.ipAddress,
        lastActiveAt: expect.any(Date),
        since: expect.any(Date),
      });
      // nothing changed: no new session, the first is still active
      expect(db.state.user_sessions).toHaveLength(1);
      expect(await svc.isSessionActive(first.session.id)).toBe(true);
    });

    it('replaceExisting: true from a different IP revokes the old session and creates a new one', async () => {
      const { svc, db } = setup();
      const first = await svc.createSession(1, A);
      const second = await svc.createSession(1, B, { replaceExisting: true });
      expect(await svc.isSessionActive(first.session.id)).toBe(false);
      expect(await svc.isSessionActive(second.session.id)).toBe(true);
      expect(db.state.user_sessions.filter((s) => s.revoked_at == null)).toHaveLength(1);
    });

    it('a MISSING ip on the new login (the ADR 4.2 regression) throws ACCOUNT_IN_USE, hence getClientIp matters', async () => {
      const { svc } = setup();
      await svc.createSession(1, A);
      for (const missing of [undefined, null, '']) {
        await expect(svc.createSession(1, { ...A, ipAddress: missing })).rejects.toMatchObject({ code: 'ACCOUNT_IN_USE' });
      }
    });

    it('a stored session with no ip never matches, even a new login with an ip', async () => {
      const { svc } = setup();
      await svc.createSession(1, { userAgent: 'Windows' }); // stored ip_address = null
      await expect(svc.createSession(1, A)).rejects.toMatchObject({ code: 'ACCOUNT_IN_USE' });
    });

    it('does not interfere across users', async () => {
      const { svc } = setup();
      await svc.createSession(1, A);
      await expect(svc.createSession(2, B)).resolves.toBeTruthy();
    });

    it('an expired or revoked session no longer blocks a login from another IP', async () => {
      const { svc, db } = setup();
      await svc.createSession(1, A);
      db.setNow(db.now + 8 * DAY);
      await expect(svc.createSession(1, B)).resolves.toBeTruthy();
    });
  });

  describe('SESSION_SUPERSEDED end to end (login A, login B, A is rejected)', () => {
    it('token A is rejected with 401 SESSION_SUPERSEDED after B replaces it; token B works', async () => {
      jest.spyOn(console, 'error').mockImplementation(() => {});
      const H = makeHarness();
      const svc = createSessionService({ db: H.db, config: createConfig(H.env) });
      const a = await svc.createSession(1, { ipAddress: '203.0.113.10', userAgent: 'Windows' });
      const b = await svc.createSession(1, { ipAddress: '198.51.100.20', userAgent: 'Macintosh' }, { replaceExisting: true });

      const resA = await H.request('/api/_t/protected', bearer(a.accessToken));
      expect(resA.status).toBe(401);
      expect(await resA.json()).toEqual({
        error: 'This account was signed in on another device. Sign in again to use JobTune on this device.',
        code: 'SESSION_SUPERSEDED',
      });
      const resB = await H.request('/api/_t/protected', bearer(b.accessToken));
      expect(resB.status).toBe(200);
      jest.restoreAllMocks();
    });

    it('same-IP re-login does not 409 and the previous token is superseded', async () => {
      jest.spyOn(console, 'error').mockImplementation(() => {});
      const H = makeHarness();
      const svc = createSessionService({ db: H.db, config: createConfig(H.env) });
      const meta = { ipAddress: '203.0.113.10', userAgent: 'Windows' };
      const a = await svc.createSession(1, meta);
      const b = await svc.createSession(1, meta); // must not throw
      expect((await H.request('/api/_t/protected', bearer(a.accessToken))).status).toBe(401);
      expect((await H.request('/api/_t/protected', bearer(b.accessToken))).status).toBe(200);
      jest.restoreAllMocks();
    });
  });

  describe('isSessionActive', () => {
    it.each([[undefined], [null], [0], [''], ['abc'], [1.5], ['1; DROP TABLE x']])('is false for %p without querying', async (id) => {
      const { svc, db } = setup();
      expect(await svc.isSessionActive(id)).toBe(false);
      expect(db.calls).toEqual([]);
    });

    it('is true for a live session (numeric string ids accepted, as in the original)', async () => {
      const { svc } = setup();
      const { session } = await svc.createSession(1, {});
      expect(await svc.isSessionActive(session.id)).toBe(true);
      expect(await svc.isSessionActive(String(session.id))).toBe(true);
    });

    it('is false once revoked or expired', async () => {
      const { svc, db } = setup();
      const { session } = await svc.createSession(1, {});
      await svc.revokeSession(session.id, 1);
      expect(await svc.isSessionActive(session.id)).toBe(false);
      const other = await svc.createSession(1, {});
      db.setNow(db.now + 8 * DAY);
      expect(await svc.isSessionActive(other.session.id)).toBe(false);
    });
  });

  describe('refreshSession', () => {
    it('exchanges a valid refresh token for a new access token and touches the session', async () => {
      const { svc, db } = setup();
      const { refreshToken, session } = await svc.createSession(3, { userAgent: 'Linux' });
      db.setNow(db.now + 60_000);
      const out = await svc.refreshSession(refreshToken);
      expect(Object.keys(out).sort()).toEqual(['accessToken', 'session']);
      expect(out.session).toEqual({ id: session.id, deviceName: 'Linux', expiresAt: expect.any(Date) });
      expect(jsonwebtoken.verify(out.accessToken, TEST_JWT_SECRET, { algorithms: ['HS256'] })).toMatchObject({ id: 3, sessionId: session.id });
      expect(db.state.user_sessions[0].last_active_at.getTime()).toBe(db.now);
    });

    it('returns null for an unknown, revoked or expired refresh token', async () => {
      const { svc, db } = setup();
      expect(await svc.refreshSession('deadbeef')).toBeNull();
      const { refreshToken, session } = await svc.createSession(3, {});
      await svc.revokeSession(session.id, 3);
      expect(await svc.refreshSession(refreshToken)).toBeNull();
      const other = await svc.createSession(3, {});
      db.setNow(db.now + 8 * DAY);
      expect(await svc.refreshSession(other.refreshToken)).toBeNull();
    });
  });

  describe('revocation and listing', () => {
    it('revokeSession only affects the matching (id, userId) pair', async () => {
      const { svc } = setup();
      const { session } = await svc.createSession(1, {});
      await svc.revokeSession(session.id, 2); // wrong user
      expect(await svc.isSessionActive(session.id)).toBe(true);
      await svc.revokeSession(session.id, 1);
      expect(await svc.isSessionActive(session.id)).toBe(false);
    });

    // Directly seed live rows so we can hold several live sessions for one user
    const seedSession = (db, id, { user = 1, last = db.now, revoked = null, expires = db.now + DAY } = {}) =>
      db.state.user_sessions.push({
        id, user_id: user, refresh_token_hash: `hash${id}`, device_name: 'd', user_agent: 'u', ip_address: 'i',
        last_active_at: new Date(last), expires_at: new Date(expires), revoked_at: revoked, created_at: new Date(db.now),
      });

    it('revokeAllSessions(userId, exceptId) keeps the excepted session; without it revokes all', async () => {
      const { svc, db } = setup();
      seedSession(db, 1);
      seedSession(db, 2);
      seedSession(db, 3, { user: 2 });
      await svc.revokeAllSessions(1, 2);
      expect(await svc.isSessionActive(1)).toBe(false);
      expect(await svc.isSessionActive(2)).toBe(true);
      expect(await svc.isSessionActive(3)).toBe(true); // other user untouched
      await svc.revokeAllSessions(1);
      expect(await svc.isSessionActive(2)).toBe(false);
      expect(await svc.isSessionActive(3)).toBe(true);
    });

    it("listSessions returns only the user's live sessions, most recently active first", async () => {
      const { svc, db } = setup();
      seedSession(db, 1, { last: db.now - 1000 });
      seedSession(db, 2, { last: db.now - 10 });
      seedSession(db, 3, { revoked: new Date(db.now) });
      seedSession(db, 4, { expires: db.now - 1 });
      seedSession(db, 5, { user: 2 });
      const list = await svc.listSessions(1);
      expect(list.map((x) => x.id)).toEqual([2, 1]);
      expect(Object.keys(list[0]).sort()).toEqual(
        ['created_at', 'device_name', 'expires_at', 'id', 'ip_address', 'last_active_at', 'revoked_at', 'user_agent']
      );
    });

    it('touchSession(falsy) is a no-op that issues no query', async () => {
      const { svc, db } = setup();
      await svc.touchSession(undefined);
      await svc.touchSession(0);
      expect(db.calls).toEqual([]);
    });
  });

  it('propagates database errors instead of swallowing them', async () => {
    const { svc, db } = setup();
    db.failWhen(() => true, new Error('db down'));
    await expect(svc.createSession(1, {})).rejects.toThrow('db down');
    await expect(svc.isSessionActive(1)).rejects.toThrow('db down');
  });
});
