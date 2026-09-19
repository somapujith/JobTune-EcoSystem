'use strict';

/**
 * Auth + entitlement parity for routes/practice.js, driven by docs/migration/manifest.render.json:
 *   - 401 without / with a bad token on EVERY endpoint, handler never reached
 *   - below-threshold 403 PLAN_UPGRADE_REQUIRED (exact frontend PlanGate shape) for a representative
 *     endpoint at EACH DISTINCT TIER the manifest contains (today that is tier 1 only), plus every endpoint
 *     denied for a user with no plan and for a user on a lower-than-required plan
 *   - ok exactly at the threshold and above
 *   - fail-closed: a plan lookup error is a 500 and the handler is never reached
 * "Handler reached" is observed through side effects that only a handler can cause: practice SQL calls
 * and aiClient.callAI calls.
 */
const fs = require('fs');
const path = require('path');
const { TIER_NAMES } = require('../../../src/worker/middleware/requirePlan');
const { buildPractice, USER_ID } = require('./helpers/practiceHarness');

const manifest = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../../../../docs/migration/manifest.render.json'), 'utf8')
);
const endpoints = manifest.endpoints.filter((e) => e.path.startsWith('/api/practice/'));

// Concrete, valid request for every endpoint (ids exist in the fallback data; bodies pass validation)
const CONCRETE = {
  'GET /api/practice/problems': { path: '/api/practice/problems' },
  'GET /api/practice/problems/:id': { path: '/api/practice/problems/two-sum' },
  'POST /api/practice/problems/:id/run': { path: '/api/practice/problems/two-sum/run', body: { code: 'x', language: 'javascript' } },
  'POST /api/practice/problems/:id/submit': { path: '/api/practice/problems/two-sum/submit', body: { code: 'x', language: 'javascript' } },
  'POST /api/practice/problems/:id/hint': { path: '/api/practice/problems/two-sum/hint', body: { hintLevel: 1 } },
  'GET /api/practice/assessments': { path: '/api/practice/assessments' },
  'GET /api/practice/assessments/:id': { path: '/api/practice/assessments/ds-arrays-basics' },
  'POST /api/practice/assessments/:id/submit': { path: '/api/practice/assessments/ds-arrays-basics/submit', body: { answers: { q1: 'O(1)' } } },
  'GET /api/practice/stats': { path: '/api/practice/stats' },
  'POST /api/practice/problems/:id/bookmark': { path: '/api/practice/problems/two-sum/bookmark', body: {} },
};

const UPGRADE = (requiredPlan, currentPlan) => ({
  error: 'This feature requires a higher subscription plan.',
  code: 'PLAN_UPGRADE_REQUIRED',
  requiredPlan,
  currentPlan,
});

function fire(H, id, { token = H.token } = {}) {
  const { path: p, body } = CONCRETE[id];
  const method = id.split(' ')[0];
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  return H.request(p, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}

/** true if any handler-only side effect happened */
const handlerReached = (H) => H.db.practiceCalls.length > 0 || H.ai.callAI.mock.calls.length > 0;

describe('routes/practice.js: auth and plan gating (manifest-driven)', () => {
  beforeEach(() => jest.spyOn(console, 'error').mockImplementation(() => {}));
  afterEach(() => jest.restoreAllMocks());

  it('covers every manifest endpoint with a concrete request', () => {
    expect(endpoints).toHaveLength(10);
    expect(endpoints.map((e) => e.id).sort()).toEqual(Object.keys(CONCRETE).sort());
  });

  describe.each(endpoints.map((e) => [e.id, e]))('%s', (id, e) => {
    it('401 {"error":"Unauthorized"} without a token, and the handler is never reached', async () => {
      const H = buildPractice({ plan: 3 });
      const res = await fire(H, id, { token: null });
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: 'Unauthorized' });
      expect(handlerReached(H)).toBe(false);
    });

    it('401 with a token signed by the wrong secret', async () => {
      const H = buildPractice({ plan: 3 });
      const { signToken } = require('../helpers/harness');
      const forged = signToken({ id: USER_ID }, { secret: 'x'.repeat(48) });
      const res = await fire(H, id, { token: forged });
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: 'Unauthorized' });
      expect(handlerReached(H)).toBe(false);
    });

    it(`403 PLAN_UPGRADE_REQUIRED for a user with NO plan (requiredPlan "${TIER_NAMES[e.minTier]}"), handler never reached`, async () => {
      const H = buildPractice({ plan: null });
      const res = await fire(H, id);
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual(UPGRADE(TIER_NAMES[e.minTier], null));
      expect(handlerReached(H)).toBe(false);
    });

    it(`is allowed for a user at tier ${e.minTier} (the threshold): not 401/403`, async () => {
      const H = buildPractice({ plan: e.minTier });
      const res = await fire(H, id);
      expect([401, 403]).not.toContain(res.status);
      expect(res.status).toBe(200);
    });
  });

  // ---- one representative endpoint per DISTINCT tier in the manifest -------------------------------
  const distinctTiers = [...new Set(endpoints.map((e) => e.minTier))].sort();

  it('the manifest has the tier set this file was written for (fails loudly if a new tier appears)', () => {
    expect(distinctTiers).toEqual([1]);
  });

  describe.each(distinctTiers.map((t) => [t, endpoints.find((e) => e.minTier === t)]))(
    'tier %i: representative endpoint from the manifest',
    (tier, rep) => {
      const id = rep.id;

      it('below threshold with a real lower plan (or no plan when there is no lower tier) is a 403 with the exact PlanGate shape', async () => {
        const lower = tier - 1;
        const H = buildPractice({ plan: lower >= 1 ? lower : null });
        const res = await fire(H, id);
        expect(res.status).toBe(403);
        const body = await res.json();
        expect(body).toEqual(UPGRADE(TIER_NAMES[tier], lower >= 1 ? TIER_NAMES[lower] : null));
        expect(Object.keys(body)).toEqual(['error', 'code', 'requiredPlan', 'currentPlan']);
        expect(handlerReached(H)).toBe(false);
      });

      it('a plan row with a tier BELOW the threshold (tier_level 0) is a 403 naming that plan', async () => {
        const H = buildPractice({ plan: null });
        H.db.state.subscription_plans.push({ id: 90, name: 'Free', tier_level: 0, price: 0 });
        H.db.state.user_subscriptions.push({ user_id: USER_ID, plan_id: 90 });
        const res = await fire(H, id);
        expect(res.status).toBe(403);
        expect(await res.json()).toEqual(UPGRADE(TIER_NAMES[tier], 'Free'));
        expect(handlerReached(H)).toBe(false);
      });

      it('at the threshold it passes, and so does every higher tier', async () => {
        for (const plan of [1, 2, 3].filter((p) => p >= tier)) {
          const H = buildPractice({ plan });
          const res = await fire(H, id);
          expect(res.status).toBe(200);
        }
      });
    }
  );

  // ---- side-effecting / expensive endpoints must not run below threshold --------------------------
  it.each([
    ['POST /api/practice/problems/:id/bookmark'],
    ['POST /api/practice/problems/:id/submit'],
    ['POST /api/practice/assessments/:id/submit'],
    ['POST /api/practice/problems/:id/run'],
    ['POST /api/practice/problems/:id/hint'],
  ])('%s below threshold: no DB write and no AI call', async (id) => {
    const H = buildPractice({ plan: null });
    const res = await fire(H, id);
    expect(res.status).toBe(403);
    expect(H.db.practice.bookmarks).toEqual([]);
    expect(H.db.practice.submissions).toEqual([]);
    expect(H.db.practice.assessments).toEqual([]);
    expect(H.ai.callAI).not.toHaveBeenCalled();
  });

  // ---- fail closed -----------------------------------------------------------------------------------
  describe('fails closed when the plan cannot be verified (never widens access)', () => {
    it.each(endpoints.map((e) => [e.id]))('%s: plan lookup error -> 500, handler never reached', async (id) => {
      const H = buildPractice({ plan: 3 });
      H.db.failWhen((sql) => /FROM subscription_plans sp JOIN user_subscriptions/.test(sql), new Error('neon unreachable'));
      const res = await fire(H, id);
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: 'Failed to verify subscription plan' });
      expect(handlerReached(H)).toBe(false);
    });

    it('a plan row with an unusable tier_level is a 500, not a pass', async () => {
      const H = buildPractice({ plan: null });
      H.db.state.subscription_plans.push({ id: 91, name: 'Broken', tier_level: null });
      H.db.state.user_subscriptions.push({ user_id: USER_ID, plan_id: 91 });
      const res = await fire(H, 'GET /api/practice/problems');
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: 'Failed to verify subscription plan' });
      expect(handlerReached(H)).toBe(false);
    });
  });

  it('auth runs before the plan lookup: an unauthenticated request never queries subscriptions', async () => {
    const H = buildPractice({ plan: 3 });
    const res = await fire(H, 'GET /api/practice/problems', { token: null });
    expect(res.status).toBe(401);
    expect(H.db.calls.some((c) => /subscription_plans/.test(c.sql))).toBe(false);
  });
});
