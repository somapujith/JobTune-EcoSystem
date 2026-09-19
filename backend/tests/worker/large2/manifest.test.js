'use strict';

/**
 * REFEREE TEST (ADR-001 6.3, brief rule 5): the Worker routers for /api/ai-coach and /api/profiles are checked
 * against docs/migration/manifest.render.json (generated from the Express source). Nothing here is hand-typed
 * except the two prefixes: every endpoint, its auth flag, its minTier, its guard chain and its registration
 * order are read from the manifest and compared with what listRoutes(app) reports for the live Hono app.
 *
 * The mini-app mounts ONLY this slice's routers (createApp() mounts no slice by default), with the same prefixes
 * and in the same relative order as backend/src/app.js.
 *
 * Below-threshold behaviour (403 PLAN_UPGRADE_REQUIRED with the exact PlanGate shape) is then proven for EVERY
 * plan-gated endpoint of the manifest, at every tier under its threshold, not just a representative one, and the
 * at-threshold and above-threshold cases must reach the handler.
 */
const path = require('path');
const manifest = require(path.resolve(__dirname, '../../../../docs/migration/manifest.render.json'));
const { createApp } = require('../../../src/worker/app');
const { mountRoutes, listRoutes, listMounts } = require('../../../src/worker/lib/routes');
const { makeHarness, makeAi, profilesRouter, aiCoachRouter, TIER_NAME } = require('./helpers');

// The only two literals: the mount prefixes, in backend/src/app.js order (profiles is mount #8, ai-coach #34).
const PREFIXES = ['/api/profiles', '/api/ai-coach'];
const inSlice = (p) => PREFIXES.some((prefix) => p === prefix || p.startsWith(prefix + '/'));
const canon = (method, p) => `${method.toUpperCase()} ${p.replace(/\/+$/, '').toLowerCase().replace(/:[^/]+/g, ':')}`;

function buildMiniApp() {
  const app = createApp(); // fresh: Hono freezes its router after the first match
  mountRoutes(app, '/api/profiles', profilesRouter);
  mountRoutes(app, '/api/ai-coach', aiCoachRouter);
  return app;
}

const expected = manifest.endpoints.filter((e) => inSlice(e.path));
const actual = listRoutes(buildMiniApp()).filter((r) => inSlice(r.path));
const actualByKey = new Map(actual.map((r) => [canon(r.method, r.path), r]));

describe('large2 vs manifest.render.json: structure', () => {
  it('the manifest still describes this slice the way the brief says (guards against a stale/wrong manifest file)', () => {
    expect(expected.length).toBe(19); // 12 profiles + 7 aiCoach, from manifest.render.md section 4
    expect(manifest.mounts.filter((m) => inSlice(m.prefix)).map((m) => [m.prefix, m.endpoints])).toEqual([
      ['/api/profiles', 12],
      ['/api/ai-coach', 7],
    ]);
    const gated = expected.filter((e) => e.minTier !== null);
    expect(gated.filter((e) => e.path.startsWith('/api/profiles')).length).toBe(8);
    expect(gated.filter((e) => e.path.startsWith('/api/ai-coach')).length).toBe(7);
  });

  it('exposes exactly the manifest endpoint set: nothing missing, nothing extra (method + canonical path)', () => {
    const want = expected.map((e) => canon(e.method, e.path)).sort();
    const got = actual.map((r) => canon(r.method, r.path)).sort();
    expect(got).toEqual(want);
    expect(new Set(got).size).toBe(got.length); // no duplicate registrations
  });

  it('registers routes in the same order as Express (order is behaviour), per router', () => {
    for (const prefix of PREFIXES) {
      const want = expected.filter((e) => e.path.startsWith(prefix + '/')).sort((a, b) => a.order - b.order)
        .map((e) => canon(e.method, e.path));
      const got = actual.filter((r) => r.path.startsWith(prefix + '/')).map((r) => canon(r.method, r.path));
      expect(got).toEqual(want);
    }
  });

  it('mounts the routers in the manifest mount order', () => {
    const want = manifest.mounts.filter((m) => inSlice(m.prefix)).sort((a, b) => a.order - b.order).map((m) => m.prefix);
    expect(listMounts(buildMiniApp()).map((m) => m.prefix).filter(inSlice)).toEqual(want);
    expect(want).toEqual(PREFIXES);
  });

  it('every middleware in the chain is tagged (no untagged middleware anywhere on these routes)', () => {
    expect(actual.every((r) => r.untagged === 0)).toBe(true);
  });
});

describe.each(expected.map((e) => [e.id, e]))('large2 vs manifest: %s', (_id, e) => {
  const r = actualByKey.get(canon(e.method, e.path));

  it('is registered', () => {
    expect(r).toBeDefined();
  });

  it(`auth = ${e.auth}`, () => {
    expect(r.auth).toBe(e.auth);
  });

  it(`minTier = ${e.minTier}`, () => {
    expect(r.minTier).toBe(e.minTier === undefined ? null : e.minTier);
  });

  it(`guard chain = ${JSON.stringify(e.guards)} (same guards, same order)`, () => {
    const guards = r.middleware
      .filter((m) => m.kind === 'auth' || m.kind === 'plan' || m.kind === 'admin' || m.kind === 'role')
      .map((m) => m.name);
    expect(guards).toEqual(e.guards);
  });

  it('no admin / role guards on either side', () => {
    expect(e.admin).toBe(false);
    expect(e.roles).toBeNull();
    expect(r.middleware.some((m) => m.kind === 'admin' || m.kind === 'role')).toBe(false);
  });

  it('authenticateToken runs before requirePlan', () => {
    const kinds = r.middleware.map((m) => m.kind).filter((k) => k === 'auth' || k === 'plan');
    expect(kinds).toEqual(e.minTier === null ? ['auth'] : ['auth', 'plan']);
  });
});

describe('large2 unauthenticated access (every manifest endpoint has auth=true)', () => {
  it.each(expected.map((e) => [e.id, e]))('%s -> 401 Unauthorized without a token', async (_id, e) => {
    const H = makeHarness({ plan: 3 });
    const res = await H.request(e.path.replace(/:[^/]+/g, '1'), { method: e.method });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
    expect(H.ai.callAI).not.toHaveBeenCalled();
  });

  it.each(expected.map((e) => [e.id, e]))('%s -> 401 with a bad token', async (_id, e) => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const H = makeHarness({ plan: 3 });
    const res = await H.request(e.path.replace(/:[^/]+/g, '1'), { method: e.method, headers: { Authorization: 'Bearer not.a.jwt' } });
    expect(res.status).toBe(401);
    jest.restoreAllMocks();
  });
});

describe('large2 plan gate matrix (every manifest plan-gated endpoint x every tier)', () => {
  const gated = expected.filter((e) => e.minTier !== null);
  const distinctTiers = [...new Set(gated.map((e) => e.minTier))].sort();

  it('the slice contains tiers 2 and 3 (so the representative-per-tier requirement is covered)', () => {
    expect(distinctTiers).toEqual([2, 3]);
  });

  // Below threshold: no subscription (tier 0), and every tier under the threshold.
  const belowCases = gated.flatMap((e) =>
    [0, 1, 2, 3].filter((tier) => tier < e.minTier).map((tier) => [e.id, tier, e]));

  it.each(belowCases)('%s below threshold (user tier %i) -> 403 PLAN_UPGRADE_REQUIRED, handler never runs', async (_id, tier, e) => {
    const H = makeHarness({ plan: tier || undefined });
    const res = await H.authed(e.path.replace(/:[^/]+/g, '1'), { method: e.method, body: e.method === 'GET' ? undefined : {} });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({
      error: 'This feature requires a higher subscription plan.',
      code: 'PLAN_UPGRADE_REQUIRED',
      requiredPlan: TIER_NAME[e.minTier],
      currentPlan: tier ? TIER_NAME[tier] : null,
    });
    expect(H.ai.callAI).not.toHaveBeenCalled();
    expect(H.db.callsMatching(/^(INSERT|SELECT) .*(github_analyses|linkedin_analyses|code_reviews|career_coach_sessions)/)).toEqual([]);
  });

  // At and above threshold the request must pass the gate: not 401, not the plan 403, not the plan 500.
  const passCases = gated.flatMap((e) =>
    [1, 2, 3].filter((tier) => tier >= e.minTier).map((tier) => [e.id, tier, e]));

  it.each(passCases)('%s at/above threshold (user tier %i) reaches the handler', async (_id, tier, e) => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    const H = makeHarness({ plan: tier });
    const res = await H.authed(e.path.replace(/:[^/]+/g, '1'), { method: e.method, body: e.method === 'GET' ? undefined : {} });
    const text = await res.text();
    expect(res.status).not.toBe(401);
    expect(text).not.toContain('PLAN_UPGRADE_REQUIRED');
    expect(text).not.toContain('Failed to verify subscription plan');
    jest.restoreAllMocks();
  });
});

describe('large2 requirePlan fails closed', () => {
  beforeEach(() => jest.spyOn(console, 'error').mockImplementation(() => {}));
  afterEach(() => jest.restoreAllMocks());

  it('a database error while resolving the plan is a 500 and never reaches the handler (both tiers)', async () => {
    for (const p of ['/api/profiles/github/analyze', '/api/ai-coach/career-score', '/api/ai-coach/code-review']) {
      const H = makeHarness({ plan: 3 });
      H.db.failWhen((sql) => /FROM subscription_plans sp JOIN user_subscriptions/.test(sql), new Error('neon unreachable'));
      const res = await H.authed(p, { method: p.endsWith('career-score') ? 'GET' : 'POST', body: p.endsWith('career-score') ? undefined : { username: 'octocat', code: 'const a = 1;' } });
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: 'Failed to verify subscription plan' });
      expect(H.ai.callAI).not.toHaveBeenCalled();
    }
  });

  it('a plan row with an unverifiable tier_level is rejected, never let through', async () => {
    const H = makeHarness({ plan: 3 });
    H.db.state.subscription_plans.find((row) => row.id === 3).tier_level = undefined;
    const res = await H.authed('/api/ai-coach/career-score');
    expect(res.status).toBe(500);
  });

  it('an ungated endpoint (profiles/github/history) needs only authentication: no plan is fine', async () => {
    const H = makeHarness({}); // no subscription at all
    for (const p of ['/api/profiles/github/history', '/api/profiles/linkedin/history']) {
      const res = await H.authed(p);
      expect(res.status).toBe(200);
    }
    const jm = await H.authed('/api/profiles/jobmatch', { method: 'POST', body: { jobDescription: 'we use react', userSkills: 'react' } });
    expect(jm.status).toBe(200);
  });
});

describe('sanity: makeAi is a plain double', () => {
  it('answers offline once its script is exhausted', async () => {
    const ai = makeAi([]);
    await expect(ai.callAI({})).resolves.toEqual({ ok: false, error: 'offline', data: null });
  });
});
