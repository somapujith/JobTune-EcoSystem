'use strict';

/**
 * JWT cross-issue matrix (ADR 6.2, checklist item 8): a token issued by one backend must be accepted by
 * the other when both share JWT_SECRET, and a wrong-secret / wrong-algorithm token is rejected by both.
 *
 * The "Express" side is reproduced with jsonwebtoken called DIRECTLY, exactly as the Express source does
 * (services/sessionService.js signs with { expiresIn, algorithm: 'HS256' }; middleware/auth.js verifies
 * with { algorithms: ['HS256'] }), using a synthetic secret. The Worker side is the real ported routes.
 *
 * Proves logic under Node with a fake db. It does NOT prove anything about tokens issued by the real
 * Render deployment (open item: verify a real Render-issued token against a Worker; spike S9 only used
 * a synthetic secret).
 */
const crypto = require('crypto');
const jsonwebtoken = require('jsonwebtoken');
const { buildApp, jsonInit, SUPERSEDED, makeEnv, TEST_JWT_SECRET } = require('./helpers/authHarness');

const WRONG_SECRET = 'a-completely-different-secret-of-40-chars!!';
const PASSWORD = 'matrix-password-1';

// ---- the Express side, verbatim semantics ---------------------------------------------------------
const expressIssue = (userId, sessionId, secret = TEST_JWT_SECRET, expiresIn = '15m') =>
  jsonwebtoken.sign({ id: userId, sessionId }, secret, { expiresIn, algorithm: 'HS256' });
const expressVerify = (token, secret = TEST_JWT_SECRET) => jsonwebtoken.verify(token, secret, { algorithms: ['HS256'] });
const expressHashToken = (t) => crypto.createHash('sha256').update(t).digest('hex');
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');

let H;
let alice;
beforeEach(() => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
  H = buildApp();
  alice = H.db.seedUser({ email: 'alice@example.com', password: PASSWORD });
});
afterEach(() => jest.restoreAllMocks());

const me = (token) => H.request('/api/auth/me', jsonInit({ method: 'GET', token }));
const login = (opts = {}) => H.request('/api/auth/login', jsonInit({ body: { email: 'alice@example.com', password: PASSWORD }, ...opts }));

/** A live session row, as Express's createSession would have inserted it. */
function insertSession({ id = 900, userId = alice.id, refreshToken = 'seed-refresh-token', ip = '203.0.113.5' } = {}) {
  H.db.state.user_sessions.push({
    id, user_id: userId, refresh_token_hash: expressHashToken(refreshToken), device_name: 'Windows', user_agent: 'UA', ip_address: ip,
    expires_at: new Date(H.db.now + 7 * 864e5), last_active_at: new Date(H.db.now), revoked_at: null, created_at: new Date(H.db.now),
  });
  return { id, refreshToken };
}

describe('cell 1: issued by Express -> accepted by the Worker', () => {
  it('a token signed like Express sessionService.createSession passes authenticateToken and yields the user', async () => {
    const s = insertSession();
    const res = await me(expressIssue(alice.id, s.id));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ user: { id: alice.id, email: 'alice@example.com' }, sessionId: s.id });
  });

  it('an Express-issued token for a session that is not live is SESSION_SUPERSEDED (session table is shared state)', async () => {
    const res = await me(expressIssue(alice.id, 4242));
    expect([res.status, await res.json()]).toEqual([401, SUPERSEDED]);
  });

  it('an Express-issued REFRESH token (48 random bytes hex, sha256 stored) refreshes on the Worker, and the new token verifies in Express', async () => {
    const refreshToken = crypto.randomBytes(48).toString('hex');
    const s = insertSession({ refreshToken });
    const res = await H.request('/api/auth/refresh', jsonInit({ body: { refreshToken } }));
    expect(res.status).toBe(200);
    const { token } = await res.json();
    expect(expressVerify(token)).toMatchObject({ id: alice.id, sessionId: s.id });
  });

  it('Express-issued token with a TTL of hours is honoured until it expires', async () => {
    const s = insertSession();
    expect((await me(expressIssue(alice.id, s.id, TEST_JWT_SECRET, '7d'))).status).toBe(200);
    expect((await me(expressIssue(alice.id, s.id, TEST_JWT_SECRET, -30))).status).toBe(401);
  });
});

describe('cell 2: issued by the Worker -> accepted by Express', () => {
  it('login token verifies with Express\'s exact jwt.verify call; claims are {id, sessionId, iat, exp} only', async () => {
    const body = await (await login({ ip: '203.0.113.9' })).json();
    const claims = expressVerify(body.token);
    expect(Object.keys(claims).sort()).toEqual(['exp', 'iat', 'id', 'sessionId']);
    expect(claims).toMatchObject({ id: alice.id, sessionId: body.session.id });
    expect(typeof claims.id).toBe('number');
    expect(typeof claims.sessionId).toBe('number');
    expect(claims.exp - claims.iat).toBe(15 * 60);
  });

  it('header is exactly {alg:"HS256", typ:"JWT"}', async () => {
    const { token } = await (await login()).json();
    const header = JSON.parse(Buffer.from(token.split('.')[0], 'base64url').toString());
    expect(header).toEqual({ alg: 'HS256', typ: 'JWT' });
  });

  it('signup, login and refresh tokens are all Express-verifiable', async () => {
    const signup = await (await H.request('/api/auth/signup', jsonInit({ body: { email: 'fresh@example.com', password: 'fresh-password' } }))).json();
    expect(expressVerify(signup.token)).toMatchObject({ id: signup.user.id, sessionId: signup.session.id });

    const l = await (await login()).json();
    expect(expressVerify(l.token).sessionId).toBe(l.session.id);
    const r = await (await H.request('/api/auth/refresh', jsonInit({ body: { refreshToken: l.refreshToken } }))).json();
    expect(expressVerify(r.token)).toMatchObject({ id: alice.id, sessionId: l.session.id });
  });

  it('the Worker\'s refresh token is stored the way Express looks it up: sha256(hex) of the token, 96 hex chars', async () => {
    const l = await (await login()).json();
    expect(l.refreshToken).toMatch(/^[0-9a-f]{96}$/);
    expect(H.db.state.user_sessions.find((s) => s.id === l.session.id).refresh_token_hash).toBe(expressHashToken(l.refreshToken));
  });

  it('a Worker-issued token is a working Bearer token for the Worker itself', async () => {
    const { token } = await (await login()).json();
    expect((await me(token)).status).toBe(200);
  });

  it('ACCESS_TOKEN_TTL from env drives exp on both sides (Express: process.env.ACCESS_TOKEN_TTL || "15m")', async () => {
    const H2 = buildApp({ env: makeEnv({ ACCESS_TOKEN_TTL: '2h' }) });
    H2.db.seedUser({ email: 'alice@example.com', password: PASSWORD });
    const body = await (await H2.request('/api/auth/login', jsonInit({ body: { email: 'alice@example.com', password: PASSWORD } }))).json();
    const claims = expressVerify(body.token);
    expect(claims.exp - claims.iat).toBe(2 * 3600);
  });
});

describe('cell 3: a wrong secret is rejected by BOTH', () => {
  it('Worker rejects an Express-shaped token signed with another secret (401 Unauthorized)', async () => {
    const s = insertSession();
    const res = await me(expressIssue(alice.id, s.id, WRONG_SECRET));
    expect([res.status, await res.json()]).toEqual([401, { error: 'Unauthorized' }]);
  });

  it('Express verification rejects a Worker-issued token when it holds a different secret', async () => {
    const { token } = await (await login()).json();
    expect(() => expressVerify(token, WRONG_SECRET)).toThrow(/invalid signature/);
  });

  it('a Worker configured with a different JWT_SECRET rejects tokens issued under the first one (no shared-secret => no portability)', async () => {
    const { token } = await (await login()).json();
    const other = buildApp({ env: makeEnv({ JWT_SECRET: WRONG_SECRET }), db: H.db, plans: false });
    const res = await other.request('/api/auth/me', jsonInit({ method: 'GET', token }));
    expect(res.status).toBe(401);
  });

  it('tampering with the payload (switching to another user id) invalidates the signature on the Worker', async () => {
    const victim = H.db.seedUser({ email: 'victim@example.com', password: 'victim-password' });
    const s = insertSession();
    const good = expressIssue(alice.id, s.id);
    const [h, , sig] = good.split('.');
    const forged = `${h}.${b64({ id: victim.id, sessionId: s.id, iat: 1, exp: 32503680000 })}.${sig}`;
    const res = await me(forged);
    expect([res.status, await res.json()]).toEqual([401, { error: 'Unauthorized' }]);
  });
});

describe('algorithm pinning: rejected by BOTH sides', () => {
  const s = () => insertSession();

  it.each([['HS384'], ['HS512']])('%s signed with the CORRECT secret', async (algorithm) => {
    const t = jsonwebtoken.sign({ id: alice.id, sessionId: s().id }, TEST_JWT_SECRET, { algorithm, expiresIn: '15m' });
    expect(() => expressVerify(t)).toThrow();
    expect((await me(t)).status).toBe(401);
  });

  it('alg "none" (unsigned) token', async () => {
    const t = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ id: alice.id, sessionId: s().id })}.`;
    expect(() => expressVerify(t)).toThrow();
    expect((await me(t)).status).toBe(401);
  });

  it('alg "none" with an empty signature and a trailing dot variant, and a tampered alg header on a real token', async () => {
    const sess = s();
    const real = expressIssue(alice.id, sess.id);
    const [, payload, sig] = real.split('.');
    const swapped = `${b64({ alg: 'none', typ: 'JWT' })}.${payload}.${sig}`;
    expect(() => expressVerify(swapped)).toThrow();
    expect((await me(swapped)).status).toBe(401);
  });

  it('an expired token is rejected by both', async () => {
    const t = expressIssue(alice.id, s().id, TEST_JWT_SECRET, -60);
    expect(() => expressVerify(t)).toThrow(/jwt expired/);
    expect((await me(t)).status).toBe(401);
  });
});

describe('token shape edge cases (same acceptance as Express middleware)', () => {
  it('"Bearer" with no token, empty header, and a scheme other than Bearer carrying a good token', async () => {
    const s = insertSession();
    const good = expressIssue(alice.id, s.id);
    // Express takes header.split(" ")[1] regardless of the scheme name, so "Basic <good token>" WORKS there
    const res = await H.request('/api/auth/me', { headers: { Authorization: `Basic ${good}` } });
    expect(res.status).toBe(200);
    expect((await H.request('/api/auth/me', { headers: { Authorization: 'Bearer' } })).status).toBe(401);
    expect((await H.request('/api/auth/me', { headers: { Authorization: '' } })).status).toBe(401);
    expect((await H.request('/api/auth/me')).status).toBe(401);
  });

  it('a token with NO sessionId claim (pre-session tokens) skips the session check, like Express', async () => {
    const t = jsonwebtoken.sign({ id: alice.id }, TEST_JWT_SECRET, { algorithm: 'HS256', expiresIn: '15m' });
    const res = await me(t);
    expect(res.status).toBe(200);
    expect((await res.json()).sessionId).toBeNull();
  });
});
