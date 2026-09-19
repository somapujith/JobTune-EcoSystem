/**
 * ADR-001 T4.3: auth cross-verification matrix. Two stateful fake servers share one "database" (like Render and Workers
 * share Neon); quirks deliberately break one behaviour to prove the matrix notices it.
 */
const jsonwebtoken = require('jsonwebtoken');
const { main, forgeJwt, decodeClaims } = require('../../scripts/migration/auth-matrix');
const { startFakeAuthServer, createStore } = require('./helpers/fakeAuthServer');
const { makeIo } = require('./helpers/mockServer');

const SECRET = 'fake-shared-secret-for-tests-only-not-a-real-secret-0123456789';
const EMAIL = 'test@example.test';
const PASSWORD = 'correct horse battery staple';

let store;
let servers = [];
const start = async (o) => { const s = await startFakeAuthServer({ store, secret: SECRET, ...o }); servers.push(s); return s; };
beforeEach(() => { store = createStore(); servers = []; });
afterEach(async () => { await Promise.all(servers.map((s) => s.close())); });

const env = (extra = {}) => ({ JT_TEST_EMAIL: EMAIL, JT_TEST_PASSWORD: PASSWORD, ...extra });
const argv = (r, w, extra = []) => ['--render', r.url, '--workers', w.url, '--test-account-only', '--delay-ms', '0', ...extra];
const line = (io, id) => io.text().split('\n').find((l) => new RegExp(`\\s${id}\\s`).test(l)) || '';
const status = (io, id) => (line(io, id).trim().split(/\s+/)[0] || '').toLowerCase();

describe('forgeJwt', () => {
  it('produces tokens a real JWT library accepts / rejects as intended', () => {
    const now = Math.floor(Date.now() / 1000);
    const ok = forgeJwt({ alg: 'HS256', secret: SECRET, claims: { id: 1, sessionId: 2, iat: now, exp: now + 60 } });
    expect(jsonwebtoken.verify(ok, SECRET, { algorithms: ['HS256'] })).toMatchObject({ id: 1, sessionId: 2 });
    expect(() => jsonwebtoken.verify(ok, 'other-secret-other-secret-other-secret', { algorithms: ['HS256'] })).toThrow(/invalid signature/);
    const expired = forgeJwt({ alg: 'HS256', secret: SECRET, claims: { id: 1, exp: now - 10 } });
    expect(() => jsonwebtoken.verify(expired, SECRET, { algorithms: ['HS256'] })).toThrow(/expired/);
    const none = forgeJwt({ alg: 'none', claims: { id: 1 } });
    expect(() => jsonwebtoken.verify(none, SECRET, { algorithms: ['HS256'] })).toThrow();
    const hs512 = forgeJwt({ alg: 'HS512', secret: SECRET, claims: { id: 1 } });
    expect(() => jsonwebtoken.verify(hs512, SECRET, { algorithms: ['HS256'] })).toThrow(/invalid algorithm/);
    expect(decodeClaims(ok)).toMatchObject({ id: 1, sessionId: 2 });
  });
});

describe('auth-matrix against a correct pair', () => {
  it('everything passes without the JWT secret; forge-with-secret cells are skipped, C9 is inconclusive (server ignores IP headers)', async () => {
    const r = await start(); const w = await start();
    const io = makeIo(env());
    const code = await main(argv(r, w), io);
    expect(code).toBe(0);
    for (const id of ['C1', 'C2', 'C3', 'C4', 'C5a', 'C7-Render', 'C7-Workers', 'C8-Render', 'C8-Workers', 'C10-Render', 'C10-Workers']) expect([id, status(io, id)]).toEqual([id, 'pass']);
    expect(status(io, 'C5b')).toBe('skip');
    expect(status(io, 'C6')).toBe('skip');
    expect(status(io, 'C9-Render')).toBe('inconclusive');
    expect(status(io, 'C9-Workers')).toBe('inconclusive');
    expect(io.text()).toMatch(/RESULT: PASS/);
    expect(io.text()).toMatch(/skipped \/ inconclusive cells are NOT verified/);
    expect(io.text() + io.errText()).not.toContain(PASSWORD);
    expect(io.text()).not.toContain(SECRET);
  });

  it('with JT_JWT_SECRET and servers that honour IP headers every cell passes, --strict too', async () => {
    const r = await start({ trustIpHeaders: true }); const w = await start({ trustIpHeaders: true });
    const io = makeIo(env({ JT_JWT_SECRET: SECRET }));
    const code = await main(argv(r, w, ['--strict']), io);
    expect(io.text()).toMatch(/pass 15 \| fail 0 \| critical 0 \| inconclusive 0 \| skipped 0 \(of 15\)/);
    expect(code).toBe(0);
    expect(status(io, 'C5b')).toBe('pass');
    expect(status(io, 'C6')).toBe('pass');
    expect(status(io, 'C9-Workers')).toBe('pass');
    expect(io.text()).not.toContain(SECRET);
  });

  it('--strict turns skipped/inconclusive cells into a failure', async () => {
    const r = await start(); const w = await start();
    expect(await main(argv(r, w, ['--strict']), makeIo(env()))).toBe(1);
  });

  it('the supersede cell checks the exact code and message and that the token is also dead on the other server', async () => {
    const r = await start(); const w = await start();
    const io = makeIo(env());
    await main(argv(r, w), io);
    expect(line(io, 'C7-Render')).toMatch(/exact code and message/);
    expect(io.text()).toMatch(/A on Render: HTTP 401 SESSION_SUPERSEDED[\s\S]*A on Workers: HTTP 401 SESSION_SUPERSEDED/);
  });
});

describe('auth-matrix notices each ADR 6.2 failure mode', () => {
  it('Workers uses a different JWT secret: both cross cells fail (exit 1)', async () => {
    const r = await start(); const w = await start({ secret: 'a-different-secret-a-different-secret-a-different-secret' });
    const io = makeIo(env());
    expect(await main(argv(r, w), io)).toBe(1);
    expect(status(io, 'C1')).toBe('fail');
    expect(status(io, 'C2')).toBe('fail');
  });

  it('Workers accepts alg:none: CRITICAL (exit 2)', async () => {
    const r = await start(); const w = await start({ quirks: { acceptAlgNone: true } });
    const io = makeIo(env());
    expect(await main(argv(r, w), io)).toBe(2);
    expect(status(io, 'C4')).toBe('critical');
    expect(io.text()).toMatch(/ACCEPTED by Workers/);
    expect(io.text()).toMatch(/RESULT: CRITICAL/);
  });

  it('Workers accepts HS512 signed with the real secret (algorithm not pinned): CRITICAL', async () => {
    const r = await start(); const w = await start({ quirks: { acceptAnyHmacAlg: true } });
    const io = makeIo(env({ JT_JWT_SECRET: SECRET }));
    expect(await main(argv(r, w), io)).toBe(2);
    expect(status(io, 'C5b')).toBe('critical');
  });

  it('Workers does not check session revocation: supersede cell fails', async () => {
    const r = await start(); const w = await start({ quirks: { noSessionCheck: true } });
    const io = makeIo(env());
    expect(await main(argv(r, w), io)).toBe(1);
    expect(status(io, 'C7-Workers')).toBe('fail');
    // Render's own cell also probes A on the OTHER server, which wrongly still accepts it
    expect(status(io, 'C7-Render')).toBe('fail');
    expect(io.text()).toMatch(/A on Workers: HTTP 200/);
  });

  it('Workers loses the client IP (ADR 4.2): same-IP re-login is a 409 -> C8 fails', async () => {
    const r = await start(); const w = await start({ quirks: { ignoreIp: true } });
    const io = makeIo(env());
    expect(await main(argv(r, w), io)).toBe(1);
    expect(status(io, 'C8-Workers')).toBe('fail');
    expect(line(io, 'C8-Workers') + io.text()).toMatch(/ADR 4.2 regression/);
  });

  it('Render answering 409 for a same-IP re-login is inconclusive (baseline noise), not a Workers failure', async () => {
    const r = await start({ quirks: { ignoreIp: true } }); const w = await start();
    const io = makeIo(env());
    await main(argv(r, w), io);
    expect(status(io, 'C8-Render')).toBe('inconclusive');
    expect(status(io, 'C8-Workers')).toBe('pass');
  });

  it('Workers has no refreshToken fallback on logout: C10 fails', async () => {
    const r = await start(); const w = await start({ quirks: { noRefreshFallback: true } });
    const io = makeIo(env());
    expect(await main(argv(r, w), io)).toBe(1);
    expect(status(io, 'C10-Workers')).toBe('fail');
    expect(status(io, 'C10-Render')).toBe('pass');
  });

  it('expired-token logout path uses a truly expired token when the secret is available', async () => {
    const r = await start(); const w = await start();
    const io = makeIo(env({ JT_JWT_SECRET: SECRET }));
    await main(argv(r, w), io);
    expect(line(io, 'C10-Render')).toMatch(/an expired access token/);
  });
});

describe('auth-matrix safety', () => {
  it('refuses to log in without --test-account-only (exit 64, no request sent)', async () => {
    const r = await start(); const w = await start();
    const io = makeIo(env());
    expect(await main(['--render', r.url, '--workers', w.url], io)).toBe(64);
    expect(io.errText()).toMatch(/--test-account-only/);
    expect(r.requests).toHaveLength(0);
    expect(w.requests).toHaveLength(0);
  });

  it('needs the test account in the environment', async () => {
    const r = await start(); const w = await start();
    const io = makeIo({});
    expect(await main(argv(r, w), io)).toBe(64);
    expect(io.errText()).toMatch(/JT_TEST_EMAIL/);
  });

  it('refuses identical URLs', async () => {
    const r = await start();
    const io = makeIo(env());
    expect(await main(['--render', r.url, '--workers', r.url, '--test-account-only'], io)).toBe(64);
    expect(io.errText()).toMatch(/same server/);
    expect(r.requests).toHaveLength(0);
  });

  it('--dry-run lists the steps and sends nothing', async () => {
    const r = await start(); const w = await start();
    const io = makeIo(env());
    expect(await main(['--render', r.url, '--workers', w.url, '--dry-run'], io)).toBe(0);
    expect(io.text()).toMatch(/would C1 /);
    expect(io.text()).toMatch(/would C10/);
    expect(r.requests).toHaveLength(0);
    expect(w.requests).toHaveLength(0);
  });

  it('wrong credentials stop the run (exit 64) before any check', async () => {
    const r = await start(); const w = await start();
    const io = makeIo({ JT_TEST_EMAIL: EMAIL, JT_TEST_PASSWORD: 'wrong' });
    expect(await main(argv(r, w), io)).toBe(64);
    expect(io.errText()).toMatch(/login on Render failed/);
    expect(w.requests).toHaveLength(0);
  });

  it('uses only the probe path and /api/auth login+logout endpoints (no other endpoints touched)', async () => {
    const r = await start(); const w = await start();
    await main(argv(r, w), makeIo(env()));
    const paths = new Set([...r.requests, ...w.requests].map((x) => `${x.method} ${x.path}`));
    expect([...paths].sort()).toEqual(['GET /api/subscriptions/my-plan', 'POST /api/auth/login', 'POST /api/auth/logout']);
  });

  it('paces Render /api/auth calls (about a dozen per run, well under the 20 per 15 min limiter)', async () => {
    const r = await start(); const w = await start();
    await main(argv(r, w), makeIo(env()));
    const renderAuth = r.requests.filter((x) => x.path.startsWith('/api/auth')).length;
    expect(renderAuth).toBeLessThanOrEqual(14);
  });
});
