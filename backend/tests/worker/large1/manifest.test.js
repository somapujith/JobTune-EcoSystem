'use strict';

/**
 * MANDATORY manifest comparison for the large1 slice (ADR-001 6.3, brief hard rule 5):
 * docs/migration/manifest.render.json (generated from the Express source) is the referee.
 *
 *  1. introspect a mini-app that mounts ONLY community / projectBuilder / courses at the
 *     prefixes app.js used (taken from manifest.mounts) with lib/routes listRoutes(app)
 *  2. every manifest endpoint exists on the Worker and vice versa (method + canonical path)
 *  3. auth, admin, roles and minTier match exactly; guard names and order match
 *  4. below-threshold requests get 403 PLAN_UPGRADE_REQUIRED for EVERY gated endpoint (26 of 26,
 *     not just one per tier), at-threshold and above requests get through the gate, and an
 *     unauthenticated request is 401 on every endpoint
 */
const { createApp } = require('../../../src/worker/app');
const { listRoutes, listMounts } = require('../../../src/worker/lib/routes');
const { TIER_NAMES } = require('../../../src/worker/middleware/requirePlan');
const { seedPlans } = require('../helpers/harness');
const {
  large1Mounts,
  large1Endpoints,
  mountLarge1,
  makeLarge1,
} = require('./helpers');

// Manifest keying rule (manifest.render.md): METHOD + canonical(path): lower-cased, trailing slash
// stripped, every :param (any name / regex constraint) replaced with ":".
const canon = (p) => {
  let out = p.toLowerCase().replace(/:[a-z0-9_]+(\{[^}]*\}|\([^)]*\))?/gi, ':');
  if (out.length > 1 && out.endsWith('/')) out = out.slice(0, -1);
  return out;
};
const key = (method, p) => `${method.toUpperCase()} ${canon(p)}`;

const GUARD_KINDS = new Set(['auth', 'plan', 'admin', 'role']);

function workerEndpoints() {
  const app = createApp(); // fresh app: Hono freezes its router after the first match
  mountLarge1(app);
  const prefixes = large1Mounts().map((m) => m.prefix);
  const routes = listRoutes(app).filter((r) => prefixes.some((p) => r.path === p || r.path.startsWith(`${p}/`)));
  return { app, routes };
}

const expected = large1Endpoints();

describe('large1 manifest parity (Render manifest vs Worker introspection)', () => {
  const { app, routes } = workerEndpoints();

  it('the manifest holds the expected 26 endpoints (12 community + 7 projectBuilder + 7 courses)', () => {
    expect(expected).toHaveLength(26);
    const byPrefix = (p) => expected.filter((e) => e.path.startsWith(p)).length;
    expect(byPrefix('/api/community')).toBe(12);
    expect(byPrefix('/api/project-builder')).toBe(7);
    expect(byPrefix('/api/courses')).toBe(7);
    // 12 + 7 + 7 = the manifest's 26 requirePlan call sites for this slice, every endpoint gated
    expect(expected.every((e) => Number.isInteger(e.minTier))).toBe(true);
  });

  it('mount prefixes and order match app.js (manifest.mounts)', () => {
    expect(large1Mounts().map((m) => [m.order, m.prefix])).toEqual([
      [31, '/api/project-builder'],
      [33, '/api/courses'],
      [35, '/api/community'],
    ]);
    // createApp itself mounts /api (health) first; the slice mounts follow in Express order
    expect(listMounts(app).map((m) => m.prefix).filter((p) => p !== '/api')).toEqual([
      '/api/project-builder',
      '/api/courses',
      '/api/community',
    ]);
  });

  it('every manifest endpoint exists on the Worker and there are no extras (method + canonical path)', () => {
    const workerKeys = routes.map((r) => key(r.method, r.path));
    const manifestKeys = expected.map((e) => key(e.method, e.path));
    expect([...new Set(workerKeys)].sort()).toEqual([...new Set(manifestKeys)].sort());
    expect(workerKeys).toHaveLength(manifestKeys.length); // no route registered twice
  });

  it('the exact Worker paths equal the manifest paths', () => {
    expect(routes.map((r) => `${r.method} ${r.path}`).sort()).toEqual(
      expected.map((e) => `${e.method} ${e.path}`).sort()
    );
  });

  it('route registration order within each router equals the Express order', () => {
    for (const m of large1Mounts()) {
      const want = expected.filter((e) => e.path.startsWith(m.prefix)).sort((a, b) => a.order - b.order);
      const got = routes.filter((r) => r.path.startsWith(m.prefix));
      expect(got.map((r) => `${r.method} ${r.path}`)).toEqual(want.map((e) => `${e.method} ${e.path}`));
    }
  });

  it('every endpoint is fully tagged (no untagged middleware anywhere in its chain)', () => {
    for (const r of routes) expect({ path: r.path, untagged: r.untagged }).toEqual({ path: r.path, untagged: 0 });
  });

  describe.each(expected.map((e) => [`${e.method} ${e.path}`, e]))('%s', (_label, e) => {
    const r = routes.find((x) => key(x.method, x.path) === key(e.method, e.path));

    it('auth, admin, roles and minTier equal the manifest', () => {
      expect(r).toBeDefined();
      expect(r.auth).toBe(e.auth);
      expect(r.minTier).toBe(e.minTier === undefined ? null : e.minTier);
      expect(r.middleware.some((m) => m.kind === 'admin')).toBe(!!e.admin);
      expect(r.middleware.some((m) => m.kind === 'role')).toBe(Array.isArray(e.roles) && e.roles.length > 0);
    });

    it('guard names and order equal the manifest (authenticateToken before requirePlan(n))', () => {
      const guards = r.middleware.filter((m) => GUARD_KINDS.has(m.kind)).map((m) => m.name);
      expect(guards).toEqual(e.guards);
      expect(guards[0]).toBe('authenticateToken');
    });
  });
});

describe('large1 entitlement matrix (every gated endpoint, real auth + requirePlan + planService)', () => {
  beforeEach(() => jest.spyOn(console, 'error').mockImplementation(() => {}));
  afterEach(() => jest.restoreAllMocks());

  // a concrete URL for a manifest path
  const url = (p) => p.replace(/:category/g, 'general').replace(/:id/g, '5');
  const call = (H, e) =>
    H.authed(url(e.path), {
      method: e.method,
      headers: { 'Content-Type': 'application/json' },
      body: e.method === 'GET' ? undefined : JSON.stringify({}),
    });

  const tiers = [...new Set(expected.map((e) => e.minTier))].sort();
  it('the slice uses exactly tiers 1 and 2 (so both distinct tiers get below-threshold coverage)', () => {
    expect(tiers).toEqual([1, 2]);
  });

  describe.each(expected.map((e) => [`${e.method} ${e.path} (tier ${e.minTier})`, e]))('%s', (_label, e) => {
    it('401 without a token', async () => {
      const H = makeLarge1({ plan: 3 });
      const res = await H.request(url(e.path), { method: e.method });
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: 'Unauthorized' });
      expect(H.db.calls).toEqual([]); // nothing reached the handler
    });

    it('403 PLAN_UPGRADE_REQUIRED below the threshold, handler never runs', async () => {
      // tier 1 endpoints: user with NO plan; tier 2 endpoints: user on plan 1 (and, for good measure, no plan)
      const cases = e.minTier === 1 ? [null] : [1, null];
      for (const plan of cases) {
        const H = makeLarge1({ plan });
        const res = await call(H, e);
        expect(res.status).toBe(403);
        expect(await res.json()).toEqual({
          error: 'This feature requires a higher subscription plan.',
          code: 'PLAN_UPGRADE_REQUIRED',
          requiredPlan: TIER_NAMES[e.minTier],
          currentPlan: plan ? TIER_NAMES[plan] : null,
        });
        expect(H.aiClient.callAI).not.toHaveBeenCalled();
        // only the plan lookup ran; no route SQL
        expect(H.db.calls).toEqual([]);
      }
    });

    it('passes the gate at the threshold and above', async () => {
      for (const plan of [e.minTier, 3]) {
        // every route SQL answers with no rows (plan lookups are answered by the shared plan fake)
        const H = makeLarge1({ plan, script: () => ({ rows: [] }) });
        const res = await call(H, e);
        // The handler ran (whatever it answered: 200, 400 validation, masked 500 for an empty body),
        // and it is not the gate's own 401/403 or its "Failed to verify subscription plan" 500.
        expect([401, 403]).not.toContain(res.status);
        const body = await res.json();
        expect(body.code).not.toBe('PLAN_UPGRADE_REQUIRED');
        expect(body.error).not.toBe('Failed to verify subscription plan');
      }
    });
  });

  it('FAILS CLOSED: a planService error is a 500 and the handler never runs (representative per file)', async () => {
    const boom = { getUserPlan: async () => { throw new Error('neon unreachable'); } };
    for (const e of [
      expected.find((x) => x.path === '/api/community/forums'),
      expected.find((x) => x.path === '/api/community/communication/email'),
      expected.find((x) => x.path === '/api/project-builder/generate'),
      expected.find((x) => x.path === '/api/courses/:id/enroll'),
    ]) {
      const H = makeLarge1({ plan: 3, planService: boom });
      const res = await call(H, e);
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: 'Failed to verify subscription plan' });
      expect(H.aiClient.callAI).not.toHaveBeenCalled();
      expect(H.db.calls).toEqual([]);
    }
  });

  it('FAILS CLOSED: a plan row with an unverifiable tier_level never reaches the handler', async () => {
    const H = makeLarge1({ plan: 3 });
    H.db.fake.state.subscription_plans.find((p) => p.id === 3).tier_level = null;
    const res = await call(H, expected.find((x) => x.path === '/api/community/groups' && x.method === 'GET'));
    expect(res.status).toBe(500);
    expect(H.db.calls.filter((c) => /community/.test(c.sql))).toEqual([]);
  });

  it('a token for a different user does not inherit another user\'s plan', async () => {
    const H = makeLarge1({ plan: 3, userId: 1 });
    const other = require('../helpers/harness').signToken({ id: 2 });
    const res = await H.request('/api/community/forums', { headers: { Authorization: `Bearer ${other}` } });
    expect(res.status).toBe(403);
    expect((await res.json()).currentPlan).toBeNull();
  });

  it('sanity: the seeded plans back the tier names used above', () => {
    const db = require('../helpers/harness').createFakeDb();
    seedPlans(db);
    expect(db.state.subscription_plans.map((p) => p.name)).toEqual(Object.values(TIER_NAMES));
  });
});
