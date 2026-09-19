'use strict';

/**
 * routes/auth.js (8 endpoints): happy paths, every error branch, joi messages, and the
 * single-active-device rules (ADR 6.2). Runs against the in-memory fake db: it proves the ported
 * route logic, not SQL correctness or the Workers runtime.
 */
const crypto = require('crypto');
const jsonwebtoken = require('jsonwebtoken');
const { buildApp, jsonInit, SUPERSEDED, signToken, makeEnv, TEST_JWT_SECRET } = require('./helpers/authHarness');

const PASSWORD = 'correct-horse-battery';
const IP_A = '203.0.113.10';
const IP_B = '198.51.100.20';
const UA_WIN = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)';
const UA_MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)';

let H;
let alice;

beforeEach(() => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  H = buildApp();
  alice = H.db.seedUser({ email: 'alice@example.com', password: PASSWORD, github_username: 'alice-gh' });
});
afterEach(() => jest.restoreAllMocks());

const post = (path, opts) => H.request(`/api/auth${path}`, jsonInit({ method: 'POST', ...opts }));
const get = (path, opts) => H.request(`/api/auth${path}`, jsonInit({ method: 'GET', ...opts }));
const login = (opts = {}) => post('/login', { body: { email: 'alice@example.com', password: PASSWORD }, ...opts });
const liveSessions = () => H.db.state.user_sessions.filter((s) => s.revoked_at == null);
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

describe('POST /api/auth/signup', () => {
  const valid = { email: 'new.user@example.com', password: 'a-long-password', github_username: 'octo-cat', linkedin_url: 'https://www.linkedin.com/in/octo' };

  it('201 {user, token, refreshToken, session}; user has no password_hash', async () => {
    const res = await post('/signup', { body: valid, ip: IP_A, ua: UA_WIN });
    expect(res.status).toBe(201);
    expect(res.headers.get('content-type')).toMatch(/application\/json/);
    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual(['refreshToken', 'session', 'token', 'user']);
    expect(Object.keys(body.user).sort()).toEqual(['created_at', 'email', 'github_username', 'id', 'linkedin_url']);
    expect(body.user).toMatchObject({ email: valid.email, github_username: 'octo-cat', linkedin_url: valid.linkedin_url });
    expect(Object.keys(body.session).sort()).toEqual(['createdAt', 'deviceName', 'expiresAt', 'id']);
    expect(body.session.deviceName).toBe('Windows');
    expect(body.refreshToken).toMatch(/^[0-9a-f]{96}$/);
    const claims = jsonwebtoken.verify(body.token, TEST_JWT_SECRET, { algorithms: ['HS256'] });
    expect(claims).toMatchObject({ id: body.user.id, sessionId: body.session.id });
  });

  it('stores a $2 bcrypt hash at cost 10 that native bcrypt (Express) verifies: rollback-safe hashing', async () => {
    await post('/signup', { body: valid });
    const stored = H.db.state.users.find((u) => u.email === valid.email);
    expect(stored.password_hash).toMatch(/^\$2[ab]\$10\$.{53}$/);
    const nativeBcrypt = require('bcrypt');
    expect(await nativeBcrypt.compare(valid.password, stored.password_hash)).toBe(true);
    expect(await nativeBcrypt.compare('wrong-password', stored.password_hash)).toBe(false);
  });

  it('creates the session with the CF-Connecting-IP and user agent', async () => {
    await post('/signup', { body: valid, ip: IP_A, ua: UA_MAC });
    expect(H.db.state.user_sessions).toHaveLength(1);
    expect(H.db.state.user_sessions[0]).toMatchObject({ ip_address: IP_A, user_agent: UA_MAC, device_name: 'Mac' });
  });

  it('takes deviceName from the raw body', async () => {
    const res = await post('/signup', { body: { ...valid, deviceName: 'My Laptop' }, ua: UA_WIN });
    expect((await res.json()).session.deviceName).toBe('My Laptop');
  });

  it('strips unknown keys: privilege fields in the body never reach the INSERT', async () => {
    const res = await post('/signup', { body: { ...valid, role: 'admin', id: 999, onboarding_completed: true, password_hash: 'x' } });
    expect(res.status).toBe(201);
    const insert = H.db.calls.find((c) => /^INSERT INTO users/.test(c.sql));
    expect(insert.params).toHaveLength(4);
    expect(insert.params.slice(0, 1)).toEqual([valid.email]);
    expect(H.db.state.users.find((u) => u.email === valid.email)).toMatchObject({ role: 'user', onboarding_completed: false });
  });

  it('optional profile fields may be absent, empty or null', async () => {
    for (const [i, extra] of [{}, { github_username: '', linkedin_url: '' }, { github_username: null, linkedin_url: null }].entries()) {
      const res = await post('/signup', { body: { email: `opt${i}@example.com`, password: 'a-long-password', ...extra } });
      expect(res.status).toBe(201);
    }
  });

  it('400 "User already exists" for a registered email; no second row, no session', async () => {
    const res = await post('/signup', { body: { email: 'alice@example.com', password: 'a-long-password' } });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'User already exists' });
    expect(H.db.state.users).toHaveLength(1);
    expect(H.db.state.user_sessions).toHaveLength(0);
  });

  describe('joi validation (400 {error: <first joi message>}, exact text)', () => {
    const cases = [
      ['missing email', { password: 'a-long-password' }, '"email" is required'],
      ['invalid email', { email: 'not-an-email', password: 'a-long-password' }, '"email" must be a valid email'],
      // joi's email() runs before max(255) and rejects an over-long local part first: same message as Express
      ['email with a 250 char local part', { email: `${'a'.repeat(250)}@example.com`, password: 'a-long-password' }, '"email" must be a valid email'],
      ['missing password', { email: 'x@example.com' }, '"password" is required'],
      ['short password', { email: 'x@example.com', password: 'short' }, '"password" length must be at least 8 characters long'],
      ['password over 128', { email: 'x@example.com', password: 'p'.repeat(129) }, '"password" length must be less than or equal to 128 characters long'],
      ['password not a string', { email: 'x@example.com', password: 12345678 }, '"password" must be a string'],
      ['github_username too long', { email: 'x@example.com', password: 'a-long-password', github_username: 'g'.repeat(40) }, '"github_username" length must be less than or equal to 39 characters long'],
      ['github_username bad pattern', { email: 'x@example.com', password: 'a-long-password', github_username: '-bad-' }, '"github_username" with value "-bad-" fails to match the required pattern: /^[a-z\\d](?:[a-z\\d]|-(?=[a-z\\d])){0,38}$/i'],
      ['linkedin_url not a uri', { email: 'x@example.com', password: 'a-long-password', linkedin_url: 'not a uri' }, '"linkedin_url" must be a valid uri'],
      ['linkedin_url over 500', { email: 'x@example.com', password: 'a-long-password', linkedin_url: `https://example.test/${'a'.repeat(500)}` }, '"linkedin_url" length must be less than or equal to 500 characters long'],
      ['deviceName over 100', { email: 'x@example.com', password: 'a-long-password', deviceName: 'd'.repeat(101) }, '"deviceName" length must be less than or equal to 100 characters long'],
      ['body is an array', [], '"value" must be of type object'],
    ];
    it.each(cases)('%s', async (_name, body, message) => {
      const res = await post('/signup', { body });
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: message });
      expect(H.db.calls.filter((c) => /FROM users|INTO users/.test(c.sql))).toHaveLength(0); // validated before any db work
    });
  });

  it('a request with no JSON body is a masked 500 (Express 5 destructured undefined)', async () => {
    const res = await post('/signup', {});
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal Server Error' });
  });

  it('a database failure is a masked 500', async () => {
    H.db.failWhen((sql) => /^INSERT INTO users/.test(sql), new Error('connection to server at "10.0.0.5" refused'));
    const res = await post('/signup', { body: valid });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal Server Error' });
    expect(H.db.state.user_sessions).toHaveLength(0);
  });

  it('is reachable without a token (public)', async () => {
    expect((await post('/signup', { body: valid })).status).toBe(201);
  });
});

describe('POST /api/auth/login', () => {
  it('200 {user (no password_hash), token, refreshToken, session}', async () => {
    const res = await login({ ip: IP_A, ua: UA_WIN });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual(['refreshToken', 'session', 'token', 'user']);
    expect(body.user).toMatchObject({ id: alice.id, email: 'alice@example.com', github_username: 'alice-gh', role: 'user' });
    expect(body.user).not.toHaveProperty('password_hash');
    expect(Object.keys(body.session).sort()).toEqual(['createdAt', 'deviceName', 'expiresAt', 'id']);
    const claims = jsonwebtoken.verify(body.token, TEST_JWT_SECRET, { algorithms: ['HS256'] });
    expect(claims).toMatchObject({ id: alice.id, sessionId: body.session.id });
    expect(H.db.state.user_sessions[0]).toMatchObject({ ip_address: IP_A, device_name: 'Windows' });
  });

  it('the refresh token is stored only as its sha256 hash', async () => {
    const { refreshToken } = await (await login()).json();
    expect(H.db.state.user_sessions[0].refresh_token_hash).toBe(sha256(refreshToken));
    expect(JSON.stringify(H.db.state.user_sessions)).not.toContain(refreshToken);
  });

  it('unknown email, wrong password and invalid payloads all answer 400 {"error":"Invalid credentials"}', async () => {
    const bodies = [
      { email: 'nobody@example.com', password: PASSWORD },
      { email: 'alice@example.com', password: 'wrong-password' },
      { email: 'alice@example.com' }, // missing password
      { password: PASSWORD }, // missing email
      { email: 'not-an-email', password: PASSWORD },
      { email: 'alice@example.com', password: 'p'.repeat(129) },
      { email: 'alice@example.com', password: PASSWORD, replaceDevice: 'maybe' },
      { email: 'alice@example.com', password: PASSWORD, deviceName: 'd'.repeat(101) },
      [],
    ];
    for (const body of bodies) {
      const res = await login({ body });
      expect([res.status, await res.json()]).toEqual([400, { error: 'Invalid credentials' }]);
    }
    expect(H.db.state.user_sessions).toHaveLength(0);
  });

  it('a request with no JSON body is a masked 500', async () => {
    const res = await post('/login', {});
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal Server Error' });
  });

  it('logs in a user whose hash was made by NATIVE bcrypt (Express-created rows keep working)', async () => {
    const nativeBcrypt = require('bcrypt');
    H.db.seedUser({ email: 'legacy@example.com', passwordHash: await nativeBcrypt.hash('legacy-password', 10) });
    const res = await login({ body: { email: 'legacy@example.com', password: 'legacy-password' } });
    expect(res.status).toBe(200);
  });

  it('a signup made on the Worker can log in again', async () => {
    await post('/signup', { body: { email: 'roundtrip@example.com', password: 'round-trip-pass' } });
    await H.db.state.user_sessions.forEach((s) => { s.revoked_at = new Date(); });
    const res = await login({ body: { email: 'roundtrip@example.com', password: 'round-trip-pass' } });
    expect(res.status).toBe(200);
  });

  describe('malformed stored password hash: native bcrypt.compare returned false, so Express answered 400 "Invalid credentials"', () => {
    // bcryptjs THROWS for the string cases below (spike S7); the route must not turn that into a 500.
    const malformed = [
      ['garbage of the right length', 'x'.repeat(60)],
      ['bad version', `$9$10$${'a'.repeat(53)}`],
      ['valid prefix, short salt/body', `$2b$10$${'!'.repeat(53)}`],
      ['cost out of range', `$2b$99$${'a'.repeat(53)}`],
      ['all dollar signs', '$'.repeat(60)],
      ['too short', 'abc'],
      ['empty string', ''],
      ['a real hash with trailing junk', `${require('bcryptjs').hashSync(PASSWORD, 4)}x`],
    ];
    it.each(malformed)('%s', async (_n, hash) => {
      H.db.seedUser({ email: 'broken@example.com', passwordHash: hash });
      const res = await login({ body: { email: 'broken@example.com', password: PASSWORD } });
      expect([res.status, await res.json()]).toEqual([400, { error: 'Invalid credentials' }]);
      expect(H.db.state.user_sessions).toHaveLength(0);
    });

    it('native bcrypt agrees (returns false) for every malformed string above: the mapping is faithful', async () => {
      const nativeBcrypt = require('bcrypt');
      for (const [, hash] of malformed) expect(await nativeBcrypt.compare(PASSWORD, hash)).toBe(false);
    });

    it('a NULL stored hash keeps throwing (native rejected too): masked 500, not a login', async () => {
      H.db.seedUser({ email: 'nohash@example.com', passwordHash: null });
      const res = await login({ body: { email: 'nohash@example.com', password: PASSWORD } });
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: 'Internal Server Error' });
      expect(H.db.state.user_sessions).toHaveLength(0);
    });

    it('KNOWN DIVERGENCE (spike S7): a $2y$ hash verifies under bcryptjs but not under native bcrypt', async () => {
      // No production row is known to use $2y$ (native bcrypt only ever wrote $2b$). Recorded, not changed.
      const y = require('bcryptjs').hashSync(PASSWORD, 4).replace(/^\$2[ab]\$/, '$2y$');
      H.db.seedUser({ email: 'phpstyle@example.com', passwordHash: y });
      expect(await require('bcrypt').compare(PASSWORD, y)).toBe(false);
      const res = await login({ body: { email: 'phpstyle@example.com', password: PASSWORD } });
      expect(res.status).toBe(200);
    });
  });

  describe('single active device (ADR 6.2; sessionService.createSession + getClientIp)', () => {
    it('login from a DIFFERENT ip while a session is live: 409 ACCOUNT_IN_USE with activeSession, no new session', async () => {
      const first = await (await login({ ip: IP_A, ua: UA_WIN })).json();
      const res = await login({ ip: IP_B, ua: UA_MAC });
      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body).toEqual({
        error: 'This account is already active on another device.',
        code: 'ACCOUNT_IN_USE',
        activeSession: {
          deviceName: 'Windows',
          ipAddress: IP_A,
          lastActiveAt: expect.any(String),
          since: expect.any(String),
        },
      });
      expect(Object.keys(body)).toEqual(['error', 'code', 'activeSession']);
      expect(Object.keys(body.activeSession)).toEqual(['deviceName', 'ipAddress', 'lastActiveAt', 'since']);
      expect(liveSessions()).toHaveLength(1);
      expect(liveSessions()[0].id).toBe(first.session.id); // the first device is undisturbed
    });

    it('re-login from the SAME ip is NOT a conflict: 200, old session revoked, exactly one live session', async () => {
      const first = await (await login({ ip: IP_A })).json();
      const res = await login({ ip: IP_A });
      expect(res.status).toBe(200);
      const second = await res.json();
      expect(second.session.id).not.toBe(first.session.id);
      expect(liveSessions().map((s) => s.id)).toEqual([second.session.id]);
      // the previous device's access token is now superseded
      const me = await get('/me', { token: first.token });
      expect([me.status, await me.json()]).toEqual([401, SUPERSEDED]);
    });

    it('replaceDevice:true from a different ip takes over; the first device is SESSION_SUPERSEDED on token and refresh', async () => {
      const a = await (await login({ ip: IP_A })).json();
      const res = await login({ ip: IP_B, body: { email: 'alice@example.com', password: PASSWORD, replaceDevice: true } });
      expect(res.status).toBe(200);
      const b = await res.json();
      expect(liveSessions().map((s) => s.id)).toEqual([b.session.id]);

      const withOldToken = await get('/me', { token: a.token });
      expect([withOldToken.status, await withOldToken.json()]).toEqual([401, SUPERSEDED]);
      const oldRefresh = await post('/refresh', { body: { refreshToken: a.refreshToken } });
      expect([oldRefresh.status, await oldRefresh.json()]).toEqual([401, SUPERSEDED]);

      const withNewToken = await get('/me', { token: b.token });
      expect(withNewToken.status).toBe(200);
    });

    it('replaceDevice given as the string "true" is converted by joi (same as Express)', async () => {
      await login({ ip: IP_A });
      const res = await login({ ip: IP_B, body: { email: 'alice@example.com', password: PASSWORD, replaceDevice: 'true' } });
      expect(res.status).toBe(200);
    });

    it('replaceDevice:false from a different ip is still a conflict', async () => {
      await login({ ip: IP_A });
      const res = await login({ ip: IP_B, body: { email: 'alice@example.com', password: PASSWORD, replaceDevice: false } });
      expect(res.status).toBe(409);
    });

    it('with NO client ip on either login the "same device" test is falsy: 409 (ADR 4.2 direction, fail closed)', async () => {
      expect((await login()).status).toBe(200);
      const res = await login();
      expect(res.status).toBe(409);
      expect((await res.json()).activeSession.ipAddress).toBeNull();
    });

    it('X-Forwarded-For is ignored: a client cannot claim the victim\'s device ip', async () => {
      await login({ ip: IP_A });
      const res = await login({ ip: IP_B, headers: { 'X-Forwarded-For': IP_A } });
      expect(res.status).toBe(409);
    });

    it('a revoked or expired previous session does not block a login from anywhere', async () => {
      const a = await (await login({ ip: IP_A })).json();
      await post('/logout', { token: a.token, body: {} });
      expect((await login({ ip: IP_B })).status).toBe(200);
      H.db.setNow(H.db.now + 8 * 24 * 3600 * 1000); // past the 7 day refresh window
      expect((await login({ ip: IP_A })).status).toBe(200);
    });

    it('another user is unaffected by alice\'s session', async () => {
      H.db.seedUser({ email: 'bob@example.com', password: 'bobs-password' });
      await login({ ip: IP_A });
      const res = await login({ ip: IP_B, body: { email: 'bob@example.com', password: 'bobs-password' } });
      expect(res.status).toBe(200);
    });

    it('the ACCOUNT_IN_USE conflict does not leak through signup-style handling: other errors are masked 500s', async () => {
      H.db.failWhen((sql) => /^INSERT INTO user_sessions/.test(sql), new Error('relation "user_sessions" does not exist'));
      const res = await login();
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: 'Internal Server Error' });
    });
  });

  it('uses the ACCESS_TOKEN_TTL from env (default 15m = 900s)', async () => {
    const a = jsonwebtoken.decode((await (await login()).json()).token);
    expect(a.exp - a.iat).toBe(900);
    const H2 = buildApp({ env: makeEnv({ ACCESS_TOKEN_TTL: '1h' }) });
    H2.db.seedUser({ email: 'alice@example.com', password: PASSWORD });
    const b = jsonwebtoken.decode((await (await H2.request('/api/auth/login', jsonInit({ body: { email: 'alice@example.com', password: PASSWORD } }))).json()).token);
    expect(b.exp - b.iat).toBe(3600);
  });
});

describe('POST /api/auth/refresh', () => {
  it('400 "Refresh token required" when missing or empty', async () => {
    for (const body of [{}, { refreshToken: '' }, { refreshToken: null }, { refreshToken: 0 }]) {
      const res = await post('/refresh', { body });
      expect([res.status, await res.json()]).toEqual([400, { error: 'Refresh token required' }]);
    }
  });

  it('a body-less request is a masked 500', async () => {
    const res = await post('/refresh', {});
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal Server Error' });
  });

  it('valid refresh token: {token, session:{id, deviceName, expiresAt}}; the new token works', async () => {
    const l = await (await login({ ip: IP_A })).json();
    const res = await post('/refresh', { body: { refreshToken: l.refreshToken } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual(['session', 'token']);
    expect(Object.keys(body.session).sort()).toEqual(['deviceName', 'expiresAt', 'id']);
    expect(body.session.id).toBe(l.session.id);
    expect((await get('/me', { token: body.token })).status).toBe(200);
  });

  it('unknown, revoked and expired refresh tokens: 401 SESSION_SUPERSEDED (exact body)', async () => {
    const l = await (await login()).json();
    const unknown = await post('/refresh', { body: { refreshToken: 'f'.repeat(96) } });
    expect([unknown.status, await unknown.json()]).toEqual([401, SUPERSEDED]);

    H.db.setNow(H.db.now + 8 * 24 * 3600 * 1000);
    const expired = await post('/refresh', { body: { refreshToken: l.refreshToken } });
    expect([expired.status, await expired.json()]).toEqual([401, SUPERSEDED]);
  });

  it('a non-string refreshToken makes hashing throw (Express: TypeError -> errorHandler -> masked 500)', async () => {
    // Jest runs test code in a separate vm realm, so an error thrown by node:crypto is not
    // `instanceof Error` for Hono and escapes app.request() as a rejection instead of reaching onError.
    // In workerd there is one realm and onError answers the masked 500 (onError itself is covered in
    // tests/worker/app.test.js). What is proven here: the TypeError is raised and is not swallowed.
    await expect(post('/refresh', { body: { refreshToken: 12345 } })).rejects.toMatchObject({ code: 'ERR_INVALID_ARG_TYPE' });
  });
});

describe('POST /api/auth/logout (public; access token first, refreshToken fallback)', () => {
  it('valid access token: revokes exactly that session and answers {success:true}', async () => {
    const l = await (await login({ ip: IP_A })).json();
    const res = await post('/logout', { token: l.token, body: {} });
    expect([res.status, await res.json()]).toEqual([200, { success: true }]);
    expect(liveSessions()).toHaveLength(0);
    const me = await get('/me', { token: l.token });
    expect([me.status, await me.json()]).toEqual([401, SUPERSEDED]);
  });

  it('EXPIRED access token + refreshToken: revokes via the sha256 refresh-token hash (ADR checklist 11)', async () => {
    const l = await (await login({ ip: IP_A })).json();
    const expired = signToken({ id: alice.id, sessionId: l.session.id }, { expiresIn: -60 });
    const res = await post('/logout', { token: expired, body: { refreshToken: l.refreshToken } });
    expect([res.status, await res.json()]).toEqual([200, { success: true }]);
    expect(liveSessions()).toHaveLength(0);
    const upd = H.db.calls.find((c) => /WHERE refresh_token_hash = \$1 AND revoked_at IS NULL$/.test(c.sql));
    expect(upd.params).toEqual([sha256(l.refreshToken)]);
    const again = await post('/refresh', { body: { refreshToken: l.refreshToken } });
    expect([again.status, await again.json()]).toEqual([401, SUPERSEDED]);
  });

  it('expired access token WITHOUT a refreshToken: still {success:true} and nothing is revoked', async () => {
    const l = await (await login()).json();
    const expired = signToken({ id: alice.id, sessionId: l.session.id }, { expiresIn: -60 });
    const res = await post('/logout', { token: expired, body: {} });
    expect([res.status, await res.json()]).toEqual([200, { success: true }]);
    expect(liveSessions()).toHaveLength(1);
  });

  it('no Authorization header, refreshToken only: revokes via the refresh token', async () => {
    const l = await (await login()).json();
    const res = await post('/logout', { body: { refreshToken: l.refreshToken } });
    expect([res.status, await res.json()]).toEqual([200, { success: true }]);
    expect(liveSessions()).toHaveLength(0);
  });

  it('non-Bearer scheme is ignored (falls through to the refresh token path)', async () => {
    const l = await (await login()).json();
    const res = await post('/logout', { headers: { Authorization: `Basic ${l.token}` }, body: { refreshToken: l.refreshToken } });
    expect(res.status).toBe(200);
    expect(liveSessions()).toHaveLength(0);
  });

  it('garbage bearer token + valid refreshToken: revoked via the refresh token', async () => {
    const l = await (await login()).json();
    const res = await post('/logout', { token: 'not.a.jwt', body: { refreshToken: l.refreshToken } });
    expect(res.status).toBe(200);
    expect(liveSessions()).toHaveLength(0);
  });

  it('a token signed with the WRONG secret cannot revoke anyone\'s session', async () => {
    const l = await (await login()).json();
    const forged = signToken({ id: alice.id, sessionId: l.session.id }, { secret: 'an-attacker-secret-that-is-32-chars-long!!' });
    const res = await post('/logout', { token: forged, body: {} });
    expect([res.status, await res.json()]).toEqual([200, { success: true }]);
    expect(liveSessions()).toHaveLength(1);
  });

  it('an HS384 token signed with the right secret is not accepted (algorithm pinned)', async () => {
    const l = await (await login()).json();
    const t = jsonwebtoken.sign({ id: alice.id, sessionId: l.session.id }, TEST_JWT_SECRET, { algorithm: 'HS384' });
    await post('/logout', { token: t, body: {} });
    expect(liveSessions()).toHaveLength(1);
  });

  it('a valid token WITHOUT a sessionId claim falls through to the refreshToken path', async () => {
    const l = await (await login()).json();
    const legacy = signToken({ id: alice.id });
    const res = await post('/logout', { token: legacy, body: { refreshToken: l.refreshToken } });
    expect(res.status).toBe(200);
    expect(liveSessions()).toHaveLength(0);
  });

  it('preserved quirk: a failing revokeSession in the access-token path is swallowed and the refreshToken path runs', async () => {
    const l = await (await login()).json();
    H.db.failWhen((sql) => /^UPDATE user_sessions SET revoked_at = CURRENT_TIMESTAMP WHERE id = \$1 AND user_id = \$2$/.test(sql), new Error('boom'));
    const res = await post('/logout', { token: l.token, body: { refreshToken: l.refreshToken } });
    expect([res.status, await res.json()]).toEqual([200, { success: true }]);
    expect(liveSessions()).toHaveLength(0); // revoked by the fallback
  });

  it('an unknown refreshToken changes nothing and still answers {success:true}', async () => {
    await login();
    const res = await post('/logout', { body: { refreshToken: 'e'.repeat(96) } });
    expect([res.status, await res.json()]).toEqual([200, { success: true }]);
    expect(liveSessions()).toHaveLength(1);
  });

  it('a non-string refreshToken throws from hashing (see the note in the /refresh test); a body-less request is a masked 500', async () => {
    await expect(post('/logout', { body: { refreshToken: 12345 } })).rejects.toMatchObject({ code: 'ERR_INVALID_ARG_TYPE' });
    const res = await post('/logout', {});
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal Server Error' });
  });

  it('a database failure on the refresh path is a masked 500', async () => {
    H.db.failWhen((sql) => /WHERE refresh_token_hash = \$1 AND revoked_at IS NULL$/.test(sql), new Error('boom'));
    const res = await post('/logout', { body: { refreshToken: 'a'.repeat(96) } });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal Server Error' });
  });
});

describe('authenticated session endpoints', () => {
  async function twoLiveSessions() {
    const a = await (await login({ ip: IP_A, ua: UA_WIN })).json();
    // a second, independent live session for the same user (as if created before the one-device rule)
    const insert = (id, ip) => H.db.state.user_sessions.push({
      id, user_id: alice.id, refresh_token_hash: `h${id}`, device_name: 'Phone', user_agent: 'UA2', ip_address: ip,
      expires_at: new Date(H.db.now + 3600e3), last_active_at: new Date(H.db.now - 1000), revoked_at: null, created_at: new Date(H.db.now),
    });
    insert(500, IP_B);
    return a;
  }

  describe('POST /logout-all', () => {
    it('revokes every OTHER session and keeps the current one', async () => {
      const a = await twoLiveSessions();
      const res = await post('/logout-all', { token: a.token, body: {} });
      expect([res.status, await res.json()]).toEqual([200, { success: true }]);
      expect(liveSessions().map((s) => s.id)).toEqual([a.session.id]);
      expect((await get('/me', { token: a.token })).status).toBe(200);
    });

    it('needs a token (401 {"error":"Unauthorized"})', async () => {
      const res = await post('/logout-all', { body: {} });
      expect([res.status, await res.json()]).toEqual([401, { error: 'Unauthorized' }]);
    });
  });

  describe('GET /sessions', () => {
    it('lists live sessions with the camelCase shape and isCurrent', async () => {
      const a = await twoLiveSessions();
      const res = await get('/sessions', { token: a.token });
      expect(res.status).toBe(200);
      const { sessions } = await res.json();
      expect(sessions).toHaveLength(2);
      const cur = sessions.find((s) => s.id === a.session.id);
      expect(Object.keys(cur)).toEqual(['id', 'deviceName', 'userAgent', 'ipAddress', 'lastActiveAt', 'expiresAt', 'createdAt', 'isCurrent']);
      expect(cur).toMatchObject({ deviceName: 'Windows', userAgent: UA_WIN, ipAddress: IP_A, isCurrent: true });
      expect(sessions.find((s) => s.id === 500)).toMatchObject({ deviceName: 'Phone', isCurrent: false });
    });

    it('never lists another user\'s sessions', async () => {
      const a = await twoLiveSessions();
      const bob = H.db.seedUser({ email: 'bob@example.com', password: 'bobs-password' });
      const bl = await (await post('/login', { body: { email: 'bob@example.com', password: 'bobs-password' }, ip: IP_B })).json();
      const { sessions } = await (await get('/sessions', { token: bl.token })).json();
      expect(sessions.map((s) => s.id)).toEqual([bl.session.id]);
      expect(bob.id).not.toBe(alice.id);
      expect(a.session.id).not.toBe(bl.session.id);
    });

    it('needs a token', async () => {
      expect((await get('/sessions')).status).toBe(401);
    });
  });

  describe('DELETE /sessions/:sessionId', () => {
    const del = (id, token) => H.request(`/api/auth/sessions/${id}`, jsonInit({ method: 'DELETE', token }));

    it('400 "Invalid session id" for non-numeric or zero ids', async () => {
      const a = await (await login()).json();
      for (const id of ['abc', '0', 'NaN']) {
        const res = await del(id, a.token);
        expect([res.status, await res.json()]).toEqual([400, { error: 'Invalid session id' }]);
      }
    });

    it('revokes the caller\'s own session', async () => {
      const a = await twoLiveSessions();
      const res = await del(500, a.token);
      expect([res.status, await res.json()]).toEqual([200, { success: true }]);
      expect(liveSessions().map((s) => s.id)).toEqual([a.session.id]);
    });

    it('another user\'s session id: {success:true} but nothing is revoked (the UPDATE is scoped to the caller)', async () => {
      const a = await login();
      const aliceLogin = await a.json();
      const bob = H.db.seedUser({ email: 'bob@example.com', password: 'bobs-password' });
      const bl = await (await post('/login', { body: { email: 'bob@example.com', password: 'bobs-password' }, ip: IP_B })).json();
      const res = await del(bl.session.id, aliceLogin.token);
      expect([res.status, await res.json()]).toEqual([200, { success: true }]);
      expect(liveSessions().map((s) => s.id).sort()).toEqual([aliceLogin.session.id, bl.session.id].sort());
      expect(bob).toBeDefined();
    });

    it('needs a token', async () => {
      expect((await del(1)).status).toBe(401);
    });
  });

  describe('GET /me', () => {
    it('{user, sessionId}', async () => {
      const a = await (await login()).json();
      const res = await get('/me', { token: a.token });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(Object.keys(body)).toEqual(['user', 'sessionId']);
      expect(Object.keys(body.user).sort()).toEqual(['created_at', 'email', 'github_username', 'id', 'linkedin_url']);
      expect(body).toMatchObject({ user: { id: alice.id, email: 'alice@example.com' }, sessionId: a.session.id });
    });

    it('a session-less (legacy) token yields sessionId null', async () => {
      const res = await get('/me', { token: signToken({ id: alice.id }) });
      expect((await res.json()).sessionId).toBeNull();
    });

    it('404 "User not found" when the user row is gone', async () => {
      const res = await get('/me', { token: signToken({ id: 4242 }) });
      expect([res.status, await res.json()]).toEqual([404, { error: 'User not found' }]);
    });

    it('401 without a token; 401 SESSION_SUPERSEDED for a revoked session', async () => {
      expect((await get('/me')).status).toBe(401);
      const a = await (await login()).json();
      await post('/logout', { token: a.token, body: {} });
      const res = await get('/me', { token: a.token });
      expect([res.status, await res.json()]).toEqual([401, SUPERSEDED]);
    });
  });
});

describe('audit and rate limit seams on /api/auth', () => {
  it('the global audit logger records the CF-Connecting-IP (non-NULL ip_address, ADR checklist 12) and REDACTS the body', async () => {
    await login({ ip: IP_A });
    await H.ctx.drain();
    await H.db.pending();
    const row = H.db.state.audit_logs.find((l) => /auth\/login/.test(l.details));
    expect(row).toBeDefined();
    expect(row.ip_address).toBe(IP_A);
    expect(row.details).toContain('[REDACTED]');
    expect(row.details).not.toContain(PASSWORD);
  });

  it('authRateLimit(): when the AUTH_LIMITER binding says no, login and signup answer 429 with the Express body, before any handler; other auth endpoints are not counted by it', async () => {
    const limited = buildApp({ env: makeEnv({ AUTH_LIMITER: { limit: async () => ({ success: false }) } }) });
    for (const [method, path] of [['POST', '/api/auth/login'], ['POST', '/api/auth/signup']]) {
      const res = await limited.request(path, jsonInit({ method, body: { email: 'a@b.test', password: 'x' } }));
      expect(res.status).toBe(429);
      expect(await res.json()).toEqual({ error: 'Too many authentication attempts, please try again later.' });
    }
    expect(limited.db.calls.filter((c) => /FROM users/.test(c.sql))).toHaveLength(0);
    // refresh / me are keyed by no account (a shared proxy IP would otherwise throttle every user together)
    for (const [method, path] of [['POST', '/api/auth/refresh'], ['GET', '/api/auth/me']]) {
      const res = await limited.request(path, jsonInit({ method, body: method === 'POST' ? { refreshToken: 'x' } : undefined }));
      expect(res.status).not.toBe(429);
    }
    // ...and it is scoped to /api/auth: other prefixes are not throttled by it
    expect((await limited.request('/api/subscriptions/plans')).status).toBe(200);
  });

  it('with no limiter binding (today\'s reality) requests pass and a warning is logged once: the limiter is inert by design', async () => {
    const bare = buildApp({ env: makeEnv({ AUTH_LIMITER: undefined, API_LIMITER: undefined }) });
    bare.db.seedUser({ email: 'alice@example.com', password: PASSWORD });
    const res = await bare.request('/api/auth/login', jsonInit({ body: { email: 'alice@example.com', password: PASSWORD } }));
    expect(res.status).toBe(200);
    // one warning per isolate/env (the API limiter, which runs first, already raised it)
    expect(console.warn.mock.calls.flat().join(' ')).toMatch(/rate limiting is NOT active: no (API|AUTH)_LIMITER binding/);
    expect(console.warn.mock.calls.filter((c) => /rate limiting is NOT active/.test(c[0]))).toHaveLength(1);
  });
});
