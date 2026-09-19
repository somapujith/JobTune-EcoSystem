'use strict';

/**
 * Manifest parity for the auth slice (ADR 6.3, checklist items 5 and 6).
 *
 * docs/migration/manifest.render.json is generated from the Express SOURCE (static AST analysis). This test
 * loads it, builds the Worker app with this slice's routers, reads the LIVE Hono route table through
 * listRoutes(app) and asserts, for every endpoint under /api/auth, /api/subscriptions, /api/admin and
 * /api/admin-panels: same method+path, same auth, same admin flag, same role list, same minTier and the
 * same ordered guard chain. It then exercises each endpoint over HTTP so the introspected flags are
 * shown to agree with runtime behaviour, not just with tags.
 *
 * It is run twice: against a mini-app that mounts the routers itself, and against the real
 * routes/mounts/auth.js `mount()` that the production app uses.
 */
const manifest = require('../../../../docs/migration/manifest.render.json');
const { createApp } = require('../../../src/worker/app');
const { listRoutes, listMounts } = require('../../../src/worker/lib/routes');
const { mount: realMount } = require('../../../src/worker/routes/mounts/auth');
const { buildApp, mountAuthSlice, jsonInit, signToken } = require('./helpers/authHarness');

const PREFIXES = ['/api/auth', '/api/subscriptions', '/api/admin', '/api/admin-panels'];
const inMySlice = (p) => PREFIXES.some((x) => p === x || p.startsWith(`${x}/`));

const canon = (p) => p.toLowerCase().replace(/\/+$/, '').replace(/:[A-Za-z0-9_]+(\{[^}]*\})?/g, ':');
const key = (method, path) => `${method.toUpperCase()} ${canon(path)}`;
const concrete = (p) => p.replace(/:[A-Za-z0-9_]+/g, '1');

/** Canonical guard names in execution order, the same spelling the manifest generator uses. */
function guardNames(middleware) {
  return middleware
    .filter((m) => ['auth', 'plan', 'admin', 'role'].includes(m.kind))
    .map((m) => {
      if (m.kind === 'auth') return 'authenticateToken';
      if (m.kind === 'admin') return 'requireAdmin';
      if (m.kind === 'plan') return `requirePlan(${m.minTier})`;
      return `requireRole(${m.roles.map((r) => JSON.stringify(r)).join(',')})`;
    });
}

function workerView(app) {
  return new Map(
    listRoutes(app)
      .filter((r) => inMySlice(r.path))
      .map((r) => [
        key(r.method, r.path),
        {
          ...r,
          admin: r.middleware.some((m) => m.kind === 'admin'),
          roles: (() => {
            const all = r.middleware.filter((m) => m.kind === 'role').flatMap((m) => m.roles);
            return all.length ? [...new Set(all)].sort() : null;
          })(),
          guards: guardNames(r.middleware),
        },
      ])
  );
}

const expected = manifest.endpoints.filter((e) => inMySlice(e.path));

describe('reference manifest sanity', () => {
  it('has the 30 endpoints of this slice: auth 8, subscriptions 6, admin 4, admin-panels 12', () => {
    const count = (p) => expected.filter((e) => e.path.startsWith(`${p}/`)).length;
    expect([count('/api/auth'), count('/api/subscriptions'), count('/api/admin'), count('/api/admin-panels')]).toEqual([8, 6, 4, 12]);
    expect(expected).toHaveLength(30);
  });

  it('none of them is plan-gated; 5 are public (4 auth + /plans); 4 admin; 12 role-guarded', () => {
    expect(expected.every((e) => e.minTier === null)).toBe(true);
    expect(expected.filter((e) => !e.auth).map((e) => e.id).sort()).toEqual([
      'GET /api/subscriptions/plans', 'POST /api/auth/login', 'POST /api/auth/logout', 'POST /api/auth/refresh', 'POST /api/auth/signup',
    ]);
    expect(expected.filter((e) => e.admin)).toHaveLength(4);
    expect(expected.filter((e) => e.roles && e.roles.length)).toHaveLength(12);
  });
});

describe.each([
  ['mini-app (routers mounted directly)', () => { const a = createApp(); mountAuthSlice(a); return a; }],
  ['routes/mounts/auth.js mount()', () => { const a = createApp(); realMount(a); return a; }],
])('Worker route table vs manifest.render.json: %s', (_label, make) => {
  const app = make();
  const worker = workerView(app);

  it('has exactly the manifest\'s endpoints for these prefixes (no missing, no extra)', () => {
    const want = expected.map((e) => key(e.method, e.path)).sort();
    const have = [...worker.keys()].sort();
    expect(have).toEqual(want);
  });

  it('every middleware in the chain is tagged (nothing untagged)', () => {
    for (const r of worker.values()) expect({ path: r.path, untagged: r.untagged }).toEqual({ path: r.path, untagged: 0 });
  });

  it.each(expected.map((e) => [e.id, e]))('%s: auth / admin / roles / minTier / guard order', (_id, e) => {
    const w = worker.get(key(e.method, e.path));
    expect(w).toBeDefined();
    expect({
      auth: w.auth,
      admin: w.admin,
      roles: w.roles,
      minTier: w.minTier,
      guards: w.guards,
    }).toEqual({
      auth: e.auth,
      admin: e.admin === true,
      roles: e.roles && e.roles.length ? [...e.roles].sort() : null,
      minTier: e.minTier === undefined ? null : e.minTier,
      guards: e.guards,
    });
  });

  it('mount order matches app.js for these prefixes (auth, subscriptions, admin, admin-panels)', () => {
    const order = listMounts(app).map((m) => m.prefix).filter(inMySlice);
    expect(order).toEqual(['/api/auth', '/api/subscriptions', '/api/admin', '/api/admin-panels']);
    const fromManifest = manifest.mounts
      .filter((m) => inMySlice(m.prefix))
      .sort((a, b) => a.order - b.order)
      .map((m) => m.prefix);
    expect(order).toEqual(fromManifest);
  });

  it('the auth rate-limit seam sits on every /api/auth endpoint (and only there), ahead of the auth guards', () => {
    for (const r of worker.values()) {
      const rl = r.middleware.filter((m) => m.kind === 'ratelimit' && m.binding === 'AUTH_LIMITER');
      if (r.path.startsWith('/api/auth/')) {
        expect(rl).toHaveLength(1);
        const names = r.middleware.map((m) => m.kind);
        expect(names.indexOf('ratelimit')).toBeLessThan(names.indexOf('auth') === -1 ? Infinity : names.indexOf('auth'));
      } else {
        expect(rl).toHaveLength(0);
      }
    }
  });

  it('the admin file-level guard is positioned before the routes: auth then admin, in that order, on all 4', () => {
    for (const r of worker.values()) {
      if (!r.path.startsWith('/api/admin/')) continue;
      const kinds = r.middleware.map((m) => m.kind).filter((k) => k === 'auth' || k === 'admin');
      expect(kinds).toEqual(['auth', 'admin']);
    }
  });
});

describe('runtime agrees with the introspected flags (each manifest endpoint exercised over HTTP)', () => {
  let H;
  const tokens = {};
  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    H = buildApp({ mount: realMount }); // the real production mount
    for (const role of ['admin', 'user', 'university', 'faculty', 'recruiter', 'student']) {
      const u = H.db.seedUser({ email: `${role}@example.com`, password: `${role}-password`, role });
      tokens[role] = signToken({ id: u.id });
    }
  });
  afterEach(() => jest.restoreAllMocks());

  const send = (e, token) => H.request(concrete(e.path), jsonInit({ method: e.method, token, body: e.method === 'GET' || e.method === 'DELETE' ? undefined : {} }));

  it.each(expected.filter((e) => e.auth).map((e) => [e.id, e]))('%s without a token is 401 (never 404, never through)', async (_id, e) => {
    const res = await send(e);
    expect(res.status).toBe(401);
  });

  it.each(expected.filter((e) => !e.auth).map((e) => [e.id, e]))('%s is public: no token is NOT a 401', async (_id, e) => {
    const res = await send(e);
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(404);
  });

  it.each(expected.filter((e) => e.admin).map((e) => [e.id, e]))('%s (admin): a non-admin token is 403, an admin token gets past the guard', async (_id, e) => {
    expect((await send(e, tokens.user)).status).toBe(403);
    const ok = await send(e, tokens.admin);
    expect([401, 403]).not.toContain(ok.status);
  });

  it.each(expected.filter((e) => e.roles && e.roles.length).map((e) => [e.id, e]))('%s (roles): a role outside the list is 403, each listed role passes', async (_id, e) => {
    const outside = ['admin', 'university', 'faculty', 'recruiter', 'user', 'student'].filter((r) => !e.roles.includes(r));
    for (const r of outside) expect((await send(e, tokens[r])).status).toBe(403);
    for (const r of e.roles) expect([401, 403]).not.toContain((await send(e, tokens[r])).status);
  });
});
