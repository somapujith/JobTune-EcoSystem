'use strict';

/**
 * DIFFERENTIAL TEST: the ORIGINAL Express routers (src/routes/{auth,subscriptions,admin,adminPanels}.js,
 * read-only, loaded as-is) against the Worker port, driven with identical request sequences over
 * twin in-memory databases. For every request the test asserts the same status and the same JSON body
 * (after masking values that legitimately differ per run: JWTs, random refresh tokens, timestamps, order
 * refs, Date.now() ids) and the same media type.
 *
 * Safety: config/database is replaced by jest.mock with the in-memory fake, so no connection is ever
 * opened and no dotenv/.env is read; JWT_SECRET is a synthetic test string; requests never leave the
 * process. Express client IP comes from X-Forwarded-For (trust proxy) and the Worker's from
 * CF-Connecting-IP, both set to the same value, so the single-active-device rule sees the same IP.
 *
 * What it proves: route/handler logic parity for these scenarios under Node. What it does NOT prove:
 * SQL correctness, Neon, workerd, or the Vercel-proxied IP (ADR checklist 7).
 */
process.env.JWT_SECRET = 'tQ7vR2mZk9LxP4wHc8NfB3sYd6JgA1eUo5TiKq0XzWrVbM2n'; // synthetic; must precede the Express requires

let mockExpressDb;
jest.mock('../../../src/config/database', () => ({ pool: { query: (...args) => mockExpressDb.query(...args) } }));

const express = require('express');
const request = require('supertest');
const bcryptjs = require('bcryptjs');
const { errorHandler } = require('../../../src/middleware/errorHandler');
const { buildApp, jsonInit, signToken, createAuthDb, seedPlans, TEST_JWT_SECRET } = require('./helpers/authHarness');

const expressApp = express();
expressApp.set('trust proxy', true);
expressApp.use(express.json({ limit: '1mb' }));
expressApp.use('/api/auth', require('../../../src/routes/auth'));
expressApp.use('/api/subscriptions', require('../../../src/routes/subscriptions'));
expressApp.use('/api/admin', require('../../../src/routes/admin'));
expressApp.use('/api/admin-panels', require('../../../src/routes/adminPanels'));
expressApp.use(errorHandler);

const PW = 'twin-password-1';
const IP_A = '203.0.113.10';
const IP_B = '198.51.100.20';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)';

// ---- masking -----------------------------------------------------------------------------------------
const JWT_RE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*$/;
function mask(value) {
  if (Array.isArray(value)) return value.map(mask);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, mask(v)]));
  if (typeof value === 'string') {
    if (JWT_RE.test(value) && value.split('.').length === 3 && value.length > 60) return '<jwt>';
    if (/^[0-9a-f]{96}$/.test(value)) return '<refresh>';
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(value)) return '<date>';
    if (/^ord_\d+_\d+_[a-z0-9]+$/.test(value)) return '<orderRef>';
  }
  if (typeof value === 'number' && value > 1e12) return '<ts>';
  return value;
}
const mediaType = (ct) => (ct || '').split(';')[0].trim().toLowerCase();

// ---- twin harness ------------------------------------------------------------------------------------
let T;

function makeTwins() {
  const eDb = createAuthDb();
  seedPlans(eDb);
  const W = buildApp();
  // Express test app has no audit logger; keep the Worker db free of audit rows so audit-derived
  // fields (stats counts, audit-log listing) are comparable.
  W.db.failWhen((sql) => /^INSERT INTO audit_logs/.test(sql), new Error('audit disabled in the differential twin'));
  mockExpressDb = eDb;
  return { eDb, W, wDb: W.db, ctx: { e: {}, w: {} } };
}

const seedBoth = (user) => {
  const hash = user.passwordHash !== undefined ? user.passwordHash : bcryptjs.hashSync(user.password, 4);
  const a = T.eDb.seedUser({ ...user, passwordHash: hash });
  const b = T.wDb.seedUser({ ...user, passwordHash: hash });
  expect(a.id).toBe(b.id);
  return a;
};

async function expressCall(method, path, { body, token, ip, ua, headers = {} }) {
  let r = request(expressApp)[method.toLowerCase()](path);
  if (token) r = r.set('Authorization', `Bearer ${token}`);
  if (ip) r = r.set('X-Forwarded-For', ip);
  if (ua) r = r.set('User-Agent', ua);
  for (const [k, v] of Object.entries(headers)) r = r.set(k, v);
  if (typeof body === 'string') r = r.set('Content-Type', 'application/json').send(body);
  else if (body !== undefined) r = r.send(body);
  const res = await r;
  const text = res.text || '';
  let parsed;
  try { parsed = JSON.parse(text); } catch { parsed = text; }
  return { status: res.status, type: mediaType(res.headers['content-type']), body: parsed };
}

async function workerCall(method, path, { body, token, ip, ua, headers = {} }) {
  const res = await T.W.request(path, jsonInit({ method: method.toUpperCase(), body, token, ip, ua, headers }));
  const text = await res.text();
  let parsed;
  try { parsed = JSON.parse(text); } catch { parsed = text; }
  return { status: res.status, type: mediaType(res.headers.get('content-type')), body: parsed };
}

/**
 * Send the same request to Express and to the Worker, assert identical masked status/body/media type,
 * and return both raw responses ({e, w}) so callers can capture per-side tokens.
 * `token` may be a string, a key into the per-side context, or { e, w }.
 */
async function twin(method, path, opts = {}) {
  const resolve = (side) => {
    const t = opts.token;
    if (t && typeof t === 'object') return t[side];
    if (typeof t === 'string' && T.ctx[side][t] !== undefined) return T.ctx[side][t];
    return t;
  };
  const per = (side) => ({ ...opts, token: resolve(side), body: typeof opts.body === 'function' ? opts.body(side) : opts.body });
  const e = await expressCall(method, path, per('e'));
  const w = await workerCall(method, path, per('w'));
  const label = `${method} ${path} ${opts.note || ''}`.trim();
  expect({ label, status: w.status, type: w.type, body: mask(w.body) }).toEqual({ label, status: e.status, type: e.type, body: mask(e.body) });
  return { e, w };
}

const capture = (r, ctx, fields) => {
  for (const side of ['e', 'w']) for (const [name, pick] of Object.entries(fields)) ctx[side][name] = pick(r[side].body);
};

beforeEach(() => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  T = makeTwins();
});
afterEach(() => jest.restoreAllMocks());

describe('/api/auth: Express vs Worker, same requests, same answers', () => {
  beforeEach(() => {
    seedBoth({ email: 'alice@example.com', password: PW, github_username: 'alice-gh' });
  });

  it('signup: success, duplicate, unknown-key stripping, and every joi failure', async () => {
    const ok = await twin('POST', '/api/auth/signup', { body: { email: 'new@example.com', password: 'a-long-password', github_username: 'octo', linkedin_url: 'https://www.linkedin.com/in/octo', role: 'admin' }, ip: IP_A, ua: UA });
    expect(ok.w.status).toBe(201);
    await twin('POST', '/api/auth/signup', { body: { email: 'new@example.com', password: 'a-long-password' }, note: 'duplicate' });
    const bad = [
      {}, { email: 'x' }, { email: 'a@example.com' }, { email: 'a@example.com', password: 'short' },
      { email: 'not-an-email', password: 'a-long-password' }, { email: 'a@example.com', password: 'p'.repeat(129) },
      { email: 'a@example.com', password: 'a-long-password', github_username: '-bad' },
      { email: 'a@example.com', password: 'a-long-password', github_username: 'g'.repeat(40) },
      { email: 'a@example.com', password: 'a-long-password', linkedin_url: 'nope' },
      { email: 'a@example.com', password: 'a-long-password', deviceName: 'd'.repeat(101) },
      { email: 'a@example.com', password: 12345678 }, [], { email: null, password: null },
    ];
    for (const body of bad) await twin('POST', '/api/auth/signup', { body, note: JSON.stringify(body).slice(0, 60) });
    await twin('POST', '/api/auth/signup', { note: 'no body' });
    await twin('POST', '/api/auth/signup', { body: '{not json', note: 'invalid json' });
  }, 30000);

  it('login: success, wrong password, unknown email, invalid payloads, missing body', async () => {
    const good = await twin('POST', '/api/auth/login', { body: { email: 'alice@example.com', password: PW }, ip: IP_A, ua: UA });
    expect(good.w.status).toBe(200);
    T.eDb.state.user_sessions.forEach((s) => { s.revoked_at = new Date(); });
    T.wDb.state.user_sessions.forEach((s) => { s.revoked_at = new Date(); });
    for (const body of [
      { email: 'alice@example.com', password: 'wrong' }, { email: 'nobody@example.com', password: PW }, { email: 'alice@example.com' },
      { password: PW }, { email: 'alice@example.com', password: PW, replaceDevice: 'maybe' }, [], 'str',
    ]) await twin('POST', '/api/auth/login', { body, note: JSON.stringify(body).slice(0, 60) });
    await twin('POST', '/api/auth/login', { note: 'no body' });
  });

  it('login with a MALFORMED stored hash: identical outcome to native bcrypt in Express (400 "Invalid credentials")', async () => {
    const hashes = [
      'x'.repeat(60), `$9$10$${'a'.repeat(53)}`, `$2b$10$${'!'.repeat(53)}`, `$2b$99$${'a'.repeat(53)}`, '$'.repeat(60), 'abc', '',
      `${bcryptjs.hashSync(PW, 4)}x`,
    ];
    for (const [i, passwordHash] of hashes.entries()) {
      seedBoth({ email: `broken${i}@example.com`, passwordHash });
      const r = await twin('POST', '/api/auth/login', { body: { email: `broken${i}@example.com`, password: PW }, note: `hash #${i}` });
      expect(r.e.status).toBe(400); // Express (native bcrypt) really answered 400 here
    }
    seedBoth({ email: 'nullhash@example.com', passwordHash: null });
    const n = await twin('POST', '/api/auth/login', { body: { email: 'nullhash@example.com', password: PW }, note: 'null hash' });
    expect(n.e.status).toBe(500);
  });

  it('single-active-device sequence (409 / replaceDevice / same ip / supersede / refresh / logout / logout-all / sessions / me)', async () => {
    const a = await twin('POST', '/api/auth/login', { body: { email: 'alice@example.com', password: PW }, ip: IP_A, ua: UA });
    capture(a, T.ctx, { tokenA: (b) => b.token, refreshA: (b) => b.refreshToken });

    const conflict = await twin('POST', '/api/auth/login', { body: { email: 'alice@example.com', password: PW }, ip: IP_B, ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)' });
    expect(conflict.w.status).toBe(409);
    await twin('POST', '/api/auth/login', { body: { email: 'alice@example.com', password: PW, replaceDevice: false }, ip: IP_B, note: 'replaceDevice false' });

    await twin('GET', '/api/auth/me', { token: 'tokenA', note: 'device A still fine' });
    await twin('GET', '/api/auth/sessions', { token: 'tokenA' });

    const b = await twin('POST', '/api/auth/login', { body: { email: 'alice@example.com', password: PW, replaceDevice: true, deviceName: 'Laptop B' }, ip: IP_B });
    capture(b, T.ctx, { tokenB: (x) => x.token, refreshB: (x) => x.refreshToken });
    expect(b.w.status).toBe(200);

    await twin('GET', '/api/auth/me', { token: 'tokenA', note: 'A superseded' });
    await twin('POST', '/api/auth/refresh', { body: (s) => ({ refreshToken: T.ctx[s].refreshA }), note: 'A refresh superseded' });
    await twin('POST', '/api/auth/refresh', { body: (s) => ({ refreshToken: T.ctx[s].refreshB }), note: 'B refresh ok' });
    await twin('POST', '/api/auth/refresh', { body: {}, note: 'refresh missing token' });
    await twin('POST', '/api/auth/refresh', { body: { refreshToken: 'f'.repeat(96) }, note: 'refresh unknown' });
    await twin('POST', '/api/auth/refresh', { note: 'refresh no body' });

    const same = await twin('POST', '/api/auth/login', { body: { email: 'alice@example.com', password: PW }, ip: IP_B, note: 'same ip re-login' });
    capture(same, T.ctx, { tokenC: (x) => x.token, refreshC: (x) => x.refreshToken });
    expect(same.w.status).toBe(200);
    await twin('GET', '/api/auth/me', { token: 'tokenB', note: 'B superseded by same-ip relogin' });
    await twin('GET', '/api/auth/me', { token: 'tokenC' });
    await twin('GET', '/api/auth/sessions', { token: 'tokenC' });

    // manufacture a second live session so logout-all has something to revoke (identical rows on both sides)
    for (const db of [T.eDb, T.wDb]) {
      db.state.user_sessions.push({ id: 500, user_id: 1, refresh_token_hash: 'h500', device_name: 'Phone', user_agent: 'UA2', ip_address: IP_A,
        expires_at: new Date(db.now + 3600e3), last_active_at: new Date(db.now - 1000), revoked_at: null, created_at: new Date(db.now) });
    }
    await twin('POST', '/api/auth/logout-all', { token: 'tokenC', body: {} });
    await twin('GET', '/api/auth/sessions', { token: 'tokenC', note: 'after logout-all' });
    await twin('DELETE', '/api/auth/sessions/abc', { token: 'tokenC' });
    await twin('DELETE', '/api/auth/sessions/0', { token: 'tokenC' });
    await twin('DELETE', '/api/auth/sessions/999', { token: 'tokenC' });

    await twin('GET', '/api/auth/me', { token: 'tokenC' });
    await twin('GET', '/api/auth/me', { note: 'no token' });
    await twin('GET', '/api/auth/me', { token: 'garbage' });
    await twin('POST', '/api/auth/logout', { token: 'tokenC', body: {}, note: 'logout with access token' });
    await twin('GET', '/api/auth/me', { token: 'tokenC', note: 'after logout' });
  });

  it('logout paths: expired token + refreshToken, garbage token, wrong-secret token, non-Bearer, no body', async () => {
    const l = await twin('POST', '/api/auth/login', { body: { email: 'alice@example.com', password: PW }, ip: IP_A });
    capture(l, T.ctx, { token: (b) => b.token, refresh: (b) => b.refreshToken });
    const sessionId = l.w.body.session.id;
    const expired = signToken({ id: 1, sessionId }, { expiresIn: -60 });
    const forged = signToken({ id: 1, sessionId }, { secret: 'an-attacker-secret-that-is-32-chars-long!!' });

    await twin('POST', '/api/auth/logout', { token: expired, body: {}, note: 'expired, no refresh' });
    await twin('GET', '/api/auth/me', { token: 'token', note: 'still logged in' });
    await twin('POST', '/api/auth/logout', { token: forged, body: {}, note: 'forged' });
    await twin('GET', '/api/auth/me', { token: 'token', note: 'forged token revoked nothing' });
    await twin('POST', '/api/auth/logout', { headers: { Authorization: 'Basic abc' }, body: {}, note: 'non-bearer' });
    await twin('POST', '/api/auth/logout', { body: { refreshToken: 'e'.repeat(96) }, note: 'unknown refresh' });
    await twin('POST', '/api/auth/logout', { note: 'no body' });
    await twin('POST', '/api/auth/logout', { token: expired, body: (s) => ({ refreshToken: T.ctx[s].refresh }), note: 'expired + refresh revokes' });
    await twin('GET', '/api/auth/me', { token: 'token', note: 'now revoked' });
    await twin('POST', '/api/auth/refresh', { body: (s) => ({ refreshToken: T.ctx[s].refresh }), note: 'refresh after revoke' });
  });

  // Live JWT cross-issue with the REAL Express code on one side. The session table is shared state in
  // production, so the session row is copied to the other side's db to model that.
  it('a token issued by the real Express login is accepted by the Worker (and answers identically)', async () => {
    const eLogin = await expressCall('POST', '/api/auth/login', { body: { email: 'alice@example.com', password: PW }, ip: IP_A });
    expect(eLogin.status).toBe(200);
    T.wDb.state.user_sessions.push({ ...T.eDb.state.user_sessions[0] });
    const e = await expressCall('GET', '/api/auth/me', { token: eLogin.body.token });
    const w = await workerCall('GET', '/api/auth/me', { token: eLogin.body.token });
    expect([w.status, mask(w.body)]).toEqual([e.status, mask(e.body)]);
    expect(w.status).toBe(200);
    // and the Express-issued REFRESH token refreshes on the Worker, yielding a token Express accepts
    const wr = await workerCall('POST', '/api/auth/refresh', { body: { refreshToken: eLogin.body.refreshToken } });
    expect(wr.status).toBe(200);
    expect((await expressCall('GET', '/api/auth/me', { token: wr.body.token })).status).toBe(200);
  });

  it('a token issued by the Worker login is accepted by the real Express middleware', async () => {
    const wLogin = await workerCall('POST', '/api/auth/login', { body: { email: 'alice@example.com', password: PW }, ip: IP_A });
    expect(wLogin.status).toBe(200);
    T.eDb.state.user_sessions.push({ ...T.wDb.state.user_sessions[0] });
    const e = await expressCall('GET', '/api/auth/me', { token: wLogin.body.token });
    const w = await workerCall('GET', '/api/auth/me', { token: wLogin.body.token });
    expect([e.status, mask(e.body)]).toEqual([w.status, mask(w.body)]);
    expect(e.status).toBe(200);
    // the Worker's refresh token refreshes on Express
    const er = await expressCall('POST', '/api/auth/refresh', { body: { refreshToken: wLogin.body.refreshToken } });
    expect(er.status).toBe(200);
    expect((await workerCall('GET', '/api/auth/me', { token: er.body.token })).status).toBe(200);
    expect(TEST_JWT_SECRET).toBe(process.env.JWT_SECRET);
  });

  it('tokens signed with a different secret are rejected by BOTH backends with the same answer', async () => {
    const bad = signToken({ id: 1, sessionId: 1 }, { secret: 'a-completely-different-secret-of-40-chars!!' });
    await twin('GET', '/api/auth/me', { token: bad, note: 'wrong secret' });
    await twin('GET', '/api/auth/me', { token: signToken({ id: 1 }, { expiresIn: -10 }), note: 'expired' });
  });
});

describe('/api/subscriptions: Express vs Worker', () => {
  beforeEach(() => {
    seedBoth({ email: 'alice@example.com', password: PW });
    seedBoth({ email: 'bob@example.com', password: PW });
    T.ctx.e.alice = signToken({ id: 1 });
    T.ctx.w.alice = signToken({ id: 1 });
    T.ctx.e.bob = signToken({ id: 2 });
    T.ctx.w.bob = signToken({ id: 2 });
  });

  it('plans / my-plan / onboarded / auth', async () => {
    await twin('GET', '/api/subscriptions/plans');
    await twin('GET', '/api/subscriptions/my-plan', { token: 'alice' });
    await twin('GET', '/api/subscriptions/my-plan', { note: 'no token' });
    await twin('GET', '/api/subscriptions/onboarded', { token: 'alice' });
    await twin('GET', '/api/subscriptions/onboarded', { token: signToken({ id: 4242 }), note: 'unknown user' });
    await twin('POST', '/api/subscriptions/select-plan', { token: 'alice', body: { planId: 1 }, note: 'route does not exist' });
  });

  it('recommend: validation, scoring, best-effort save, odd inputs', async () => {
    const valid = { careerGoal: 'faang-or-top-company', experienceLevel: 'advanced', painPoints: ['interviews', 'job-search'], fieldOfInterest: 'devops' };
    await twin('POST', '/api/subscriptions/recommend', { token: 'alice', body: valid });
    expect(T.wDb.state.onboarding_responses).toEqual(T.eDb.state.onboarding_responses);
    for (const body of [
      {}, { ...valid, painPoints: [] }, { ...valid, painPoints: undefined }, { ...valid, careerGoal: '' },
      { careerGoal: 'other', experienceLevel: 'unknown', painPoints: ['x'] },
      { careerGoal: 'service-role', experienceLevel: 'beginner', painPoints: 'skill-gaps' },
      { careerGoal: 'skill-development', experienceLevel: 'intermediate', painPoints: ['networking', 'project-building'], fieldOfInterest: 'data-ml' },
    ]) await twin('POST', '/api/subscriptions/recommend', { token: 'alice', body, note: JSON.stringify(body).slice(0, 50) });
    await twin('POST', '/api/subscriptions/recommend', { token: 'alice', note: 'no body' });
    await twin('POST', '/api/subscriptions/recommend', { body: valid, note: 'no token' });
  });

  it('create-order + verify-payment: happy path, idempotency, cross-user, missing/unknown, onboarding flag, plan assignment', async () => {
    await twin('POST', '/api/subscriptions/create-order', { token: 'alice', body: {}, note: 'no planId' });
    await twin('POST', '/api/subscriptions/create-order', { token: 'alice', body: { planId: 99 }, note: 'unknown plan' });
    await twin('POST', '/api/subscriptions/create-order', { token: 'alice', note: 'no body' });
    const o = await twin('POST', '/api/subscriptions/create-order', { token: 'alice', body: { planId: 3 } });
    capture(o, T.ctx, { orderRef: (b) => b.order.order_ref });
    const ref = (s) => ({ orderRef: T.ctx[s].orderRef });

    await twin('POST', '/api/subscriptions/verify-payment', { token: 'alice', body: {}, note: 'no orderRef' });
    await twin('POST', '/api/subscriptions/verify-payment', { token: 'alice', body: { orderRef: 'ord_nope' }, note: 'unknown ref' });
    await twin('POST', '/api/subscriptions/verify-payment', { token: 'bob', body: ref, note: 'cross-user denied' });
    await twin('GET', '/api/subscriptions/onboarded', { token: 'bob', note: 'bob not onboarded' });
    await twin('GET', '/api/subscriptions/my-plan', { token: 'alice', note: 'not assigned before verify' });

    const paid = await twin('POST', '/api/subscriptions/verify-payment', { token: 'alice', body: ref, note: 'first verify' });
    expect(paid.w.status).toBe(200);
    const again = await twin('POST', '/api/subscriptions/verify-payment', { token: 'alice', body: ref, note: 'second verify' });
    expect(again.w.body.alreadyPaid).toBe(true);
    await twin('POST', '/api/subscriptions/verify-payment', { token: 'bob', body: ref, note: 'cross-user after paid' });
    await twin('GET', '/api/subscriptions/my-plan', { token: 'alice', note: 'assigned' });
    await twin('GET', '/api/subscriptions/onboarded', { token: 'alice', note: 'onboarded' });
    await twin('GET', '/api/subscriptions/onboarded', { token: 'bob', note: 'bob still not' });
    await twin('POST', '/api/subscriptions/verify-payment', { note: 'no token', body: ref });

    // end state identical
    const strip = (o) => ({ ...o, paid_at: !!o.paid_at, order_ref: '<ref>' });
    expect(T.wDb.state.plan_orders.map(strip)).toEqual(T.eDb.state.plan_orders.map(strip));
    expect(T.wDb.state.user_subscriptions).toEqual(T.eDb.state.user_subscriptions);
    expect(T.wDb.state.users.map((u) => u.onboarding_completed)).toEqual(T.eDb.state.users.map((u) => u.onboarding_completed));
  });
});

describe('/api/admin and /api/admin-panels: Express vs Worker', () => {
  const ROLES = ['admin', 'user', 'university', 'faculty', 'recruiter', 'student'];
  beforeEach(() => {
    ROLES.forEach((role, i) => {
      seedBoth({ email: `${role}@example.com`, password: PW, role, name: `${role} person` });
      T.ctx.e[role] = signToken({ id: i + 1 });
      T.ctx.w[role] = signToken({ id: i + 1 });
    });
    for (const db of [T.eDb, T.wDb]) {
      db.state.audit_logs.push(
        { id: 1, user_id: 2, action: 'API_REQUEST', resource: 'system', details: '{"method":"GET"}', ip_address: '203.0.113.7', created_at: new Date(db.now - 3000) },
        { id: 2, user_id: 1, action: 'API_REQUEST', resource: 'system', details: 'not json', ip_address: null, created_at: new Date(db.now - 2000) }
      );
    }
  });

  it('admin endpoints and the file-level guard for every role, every path (including unknown ones)', async () => {
    const paths = [['GET', '/stats'], ['GET', '/users'], ['GET', '/audit-logs'], ['GET', '/audit-logs?user_id=2'], ['GET', '/nope'], ['DELETE', '/users'], ['GET', '']];
    for (const [m, p] of paths) {
      await twin(m, `/api/admin${p}`, { note: 'anonymous' });
      for (const role of ROLES) await twin(m, `/api/admin${p}`, { token: role, note: role });
    }
    await twin('GET', '/api/admin/stats', { token: 'admin', note: 'after' });
  });

  it('PUT /users/:id/role: every validation branch and both directions, then the effect on access', async () => {
    const put = (id, body, token = 'admin', note = '') => twin('PUT', `/api/admin/users/${id}/role`, { token, body, note: `${id} ${JSON.stringify(body)} ${note}` });
    for (const body of [{ role: 'superuser' }, { role: 'ADMIN' }, { role: '' }, {}, { role: ['admin'] }]) await put(2, body);
    for (const id of ['abc', '0', 'NaN']) await put(id, { role: 'user' });
    await put(1, { role: 'user' }, 'admin', 'self demote');
    await put(1, { role: 'admin' }, 'admin', 'self keep');
    await put(4242, { role: 'admin' });
    await put('2abc', { role: 'admin' }, 'admin', 'parseInt semantics');
    await twin('GET', '/api/admin/stats', { token: 'user', note: 'user is now admin' });
    await put(2, { role: 'user' }, 'admin', 'revoke');
    await twin('GET', '/api/admin/stats', { token: 'user', note: 'user is a user again' });
    await put(2, { role: 'admin' }, 'user', 'non-admin caller');
    await twin('PUT', '/api/admin/users/2/role', { token: 'admin', note: 'no body' });
  });

  it('every adminPanels endpoint x every role x anonymous', async () => {
    const eps = [
      ['GET', '/university/overview'], ['GET', '/university/overview?range=Last%207%20Days'],
      ['GET', '/university/students'], ['GET', '/university/students?department=Design&status=ready&page=1'],
      ['GET', '/university/students?search=meera'], ['GET', '/university/students?page=abc'], ['GET', '/university/students?page=-1'],
      ['GET', '/university/students?search=a&search=b'], ['GET', '/university/departments'],
      ['GET', '/faculty/courses'], ['GET', '/faculty/assignments'], ['GET', '/faculty/students'], ['GET', '/faculty/students?course=CS301'],
      ['GET', '/recruiter/search'], ['GET', '/recruiter/search?minScore=90&year=2025'], ['GET', '/recruiter/search?skills=python,react'],
      ['GET', '/recruiter/search?search=tensorflow&page=1'], ['GET', '/recruiter/jobs'], ['GET', '/recruiter/shortlist'],
    ];
    for (const [m, p] of eps) {
      await twin(m, `/api/admin-panels${p}`, { note: 'anonymous' });
      for (const role of ROLES) await twin(m, `/api/admin-panels${p}`, { token: role, note: role });
    }
  }, 30000);

  it('adminPanels mutations: assignments, jobs, shortlist (validation + state), and a missing user row', async () => {
    const posts = [
      ['/faculty/assignments', 'faculty', {}], ['/faculty/assignments', 'faculty', { title: 'T', dueDate: '2030-01-01' }],
      ['/faculty/assignments', 'faculty', { title: 'Trees', description: 'd', dueDate: '2030-02-02', courseId: '2', maxMarks: '40' }],
      ['/faculty/assignments', 'admin', { title: 'X', dueDate: '2030-03-03', courseId: 99 }], ['/faculty/assignments', 'recruiter', { title: 'X', dueDate: 'd', courseId: 1 }],
      ['/recruiter/jobs', 'recruiter', { title: 'only title' }], ['/recruiter/jobs', 'recruiter', { title: 'SRE', company: 'Acme', location: 'Remote' }],
      ['/recruiter/jobs', 'faculty', { title: 'SRE', company: 'Acme' }],
      ['/recruiter/shortlist', 'recruiter', {}], ['/recruiter/shortlist', 'recruiter', { studentId: 2, status: 'Offered' }],
      ['/recruiter/shortlist', 'recruiter', { studentId: 3, status: 'Hired' }], ['/recruiter/shortlist', 'university', { studentId: 3 }],
    ];
    for (const [p, role, body] of posts) await twin('POST', `/api/admin-panels${p}`, { token: role, body, note: role });
    for (const p of ['/faculty/assignments', '/recruiter/jobs', '/recruiter/shortlist']) {
      await twin('POST', `/api/admin-panels${p}`, { token: p.startsWith('/faculty') ? 'faculty' : 'recruiter', note: 'no body' });
    }
    await twin('GET', '/api/admin-panels/faculty/assignments', { token: 'faculty', note: 'list after' });
    await twin('GET', '/api/admin-panels/recruiter/jobs', { token: 'recruiter', note: 'list after' });
    await twin('GET', '/api/admin-panels/recruiter/shortlist', { token: 'recruiter', note: 'pipeline after' });
    await twin('GET', '/api/admin-panels/recruiter/shortlist', { token: 'admin', note: 'other user pipeline' });
    await twin('GET', '/api/admin-panels/faculty/courses', { token: signToken({ id: 987654 }), note: 'no user row' });
    await twin('GET', '/api/admin-panels/nope', { note: 'unknown path, anonymous' });
  }, 30000);
});
