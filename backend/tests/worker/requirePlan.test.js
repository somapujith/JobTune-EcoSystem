'use strict';

const { Hono } = require('hono');
const { requirePlan, TIER_NAMES } = require('../../src/worker/middleware/requirePlan');
const { createPlanService } = require('../../src/worker/services/planService');
const { getMiddlewareMeta } = require('../../src/worker/lib/tag');
const { makeHarness, makeEnv, signToken, bearer, seedPlans } = require('./helpers/harness');

const UPGRADE = (requiredPlan, currentPlan) => ({
  error: 'This feature requires a higher subscription plan.',
  code: 'PLAN_UPGRADE_REQUIRED',
  requiredPlan,
  currentPlan,
});
const VERIFY_FAILED = { error: 'Failed to verify subscription plan' };

/**
 * Bare app: sets user + services by hand, then requirePlan(minTier), then a handler
 * that records whether it was reached. `reached` is the "next() was called" oracle.
 */
function miniApp({ user = { id: 1 }, services, minTier = 2 }) {
  const state = { reached: false, plan: undefined };
  const app = new Hono();
  app.use('*', async (c, next) => {
    if (user !== null) c.set('user', user);
    if (services !== null) c.set('services', services);
    return next();
  });
  app.get('/x', requirePlan(minTier), (c) => {
    state.reached = true;
    state.plan = c.get('userPlan');
    return c.json({ ok: true });
  });
  return { app, state, call: () => app.request('/x', {}, makeEnv()) };
}

describe('requirePlan', () => {
  beforeEach(() => jest.spyOn(console, 'error').mockImplementation(() => {}));
  afterEach(() => jest.restoreAllMocks());

  describe('construction', () => {
    it('is tagged with its minTier for introspection', () => {
      const mw = requirePlan(2);
      expect(mw.name).toBe('requirePlan(2)');
      expect(getMiddlewareMeta(mw)).toMatchObject({ kind: 'plan', minTier: 2, name: 'requirePlan(2)' });
    });

    it.each([[undefined], [null], ['2'], [NaN], [1.5], [Infinity], [{}]])(
      'throws at registration for a non-integer minTier (%p), unlike Express where it gated nothing',
      (bad) => {
        expect(() => requirePlan(bad)).toThrow(TypeError);
      }
    );

    it('exports the same tier names as the Express module', () => {
      expect(TIER_NAMES).toEqual({ 1: 'Learn & Build', 2: 'Tune & Polish', 3: 'Zero to Hero' });
    });
  });

  describe('tier matrix through the real stack (auth -> requirePlan -> planService -> fake db)', () => {
    const cases = [
      // [label, planId|null, minTier, expected status, requiredPlan, currentPlan]
      ['no plan, minTier 1', null, 1, 403, TIER_NAMES[1], null],
      ['no plan, minTier 2', null, 2, 403, TIER_NAMES[2], null],
      ['no plan, minTier 3', null, 3, 403, TIER_NAMES[3], null],
      ['tier 1, minTier 1', 1, 1, 200, undefined, undefined],
      ['tier 1, minTier 2', 1, 2, 403, TIER_NAMES[2], 'Learn & Build'],
      ['tier 1, minTier 3', 1, 3, 403, TIER_NAMES[3], 'Learn & Build'],
      ['tier 2, minTier 1', 2, 1, 200, undefined, undefined],
      ['tier 2, minTier 2', 2, 2, 200, undefined, undefined],
      ['tier 2, minTier 3', 2, 3, 403, TIER_NAMES[3], 'Tune & Polish'],
      ['tier 3, minTier 1', 3, 1, 200, undefined, undefined],
      ['tier 3, minTier 2', 3, 2, 200, undefined, undefined],
      ['tier 3, minTier 3', 3, 3, 200, undefined, undefined],
    ];

    it.each(cases)('%s', async (_label, planId, minTier, status, requiredPlan, currentPlan) => {
      const H = makeHarness();
      seedPlans(H.db);
      const userId = 11;
      if (planId) H.db.state.user_subscriptions.push({ user_id: userId, plan_id: planId });
      H.app.get(`/api/_t/gate${minTier}`, require('../../src/worker/middleware/auth').authenticateToken,
        requirePlan(minTier), (c) => c.json({ plan: c.get('userPlan').name }));

      const res = await H.request(`/api/_t/gate${minTier}`, bearer(signToken({ id: userId })));
      expect(res.status).toBe(status);
      if (status === 403) {
        expect(await res.json()).toEqual(UPGRADE(requiredPlan, currentPlan)); // exact shape, key for key
      } else {
        expect(await res.json()).toEqual({ plan: H.db.state.subscription_plans.find((p) => p.id === planId).name });
      }
    });

    it('a user with a plan cannot borrow another user\'s plan', async () => {
      const H = makeHarness();
      seedPlans(H.db);
      H.db.state.user_subscriptions.push({ user_id: 1, plan_id: 3 });
      const res = await H.request('/api/_t/tier2', bearer(signToken({ id: 2 })));
      expect(res.status).toBe(403);
    });

    it('the shared tier2 test route passes tier 3 and sets userPlan on the context', async () => {
      const H = makeHarness();
      seedPlans(H.db);
      H.db.state.user_subscriptions.push({ user_id: 9, plan_id: 3 });
      const res = await H.request('/api/_t/tier2', bearer(signToken({ id: 9 })));
      expect(await res.json()).toEqual({ plan: 'Zero to Hero' });
    });

    it('requirePlan(4): requiredPlan is null (Express: TIER_NAMES[4] || null)', async () => {
      const { call } = miniApp({
        minTier: 4,
        services: { planService: { getUserPlan: async () => ({ name: 'Zero to Hero', tier_level: 3 }) } },
      });
      const res = await call();
      expect(res.status).toBe(403);
      expect((await res.json()).requiredPlan).toBeNull();
    });
  });

  describe('FAILS CLOSED: next() is never called on any failure mode', () => {
    const services = (getUserPlan) => ({ planService: { getUserPlan } });

    const failureModes = [
      ['planService rejects', { services: services(async () => { throw new Error('db down'); }) }, 500],
      ['planService throws synchronously', { services: services(() => { throw new Error('sync boom'); }) }, 500],
      ['planService returns null (no plan)', { services: services(async () => null) }, 403],
      ['planService returns undefined', { services: services(async () => undefined) }, 403],
      ['plan row has tier_level undefined', { services: services(async () => ({ name: 'X' })) }, 500],
      ['plan row has tier_level null', { services: services(async () => ({ name: 'X', tier_level: null })) }, 500],
      ['plan row has tier_level NaN', { services: services(async () => ({ name: 'X', tier_level: NaN })) }, 500],
      ['plan row has tier_level Infinity', { services: services(async () => ({ name: 'X', tier_level: Infinity })) }, 500],
      ['plan row has tier_level "abc"', { services: services(async () => ({ name: 'X', tier_level: 'abc' })) }, 500],
      ['plan row has tier_level ""', { services: services(async () => ({ name: 'X', tier_level: '' })) }, 500],
      ['plan row has tier_level {}', { services: services(async () => ({ name: 'X', tier_level: {} })) }, 500],
      ['plan row has tier_level true', { services: services(async () => ({ name: 'X', tier_level: true })) }, 500],
      ['plan row has tier_level []', { services: services(async () => ({ name: 'X', tier_level: [] })) }, 500],
      ['user missing', { user: null, services: services(async () => ({ tier_level: 3 })) }, 500],
      ['user has no id', { user: {}, services: services(async () => ({ tier_level: 3 })) }, 500],
      ['user id is null', { user: { id: null }, services: services(async () => ({ tier_level: 3 })) }, 500],
      ['services container missing', { services: null }, 500],
      ['planService missing from container', { services: {} }, 500],
      ['getUserPlan is not a function', { services: { planService: {} } }, 500],
    ];

    it.each(failureModes)('%s', async (_label, cfg, expectedStatus) => {
      const { call, state } = miniApp({ minTier: 1, ...cfg });
      const res = await call();
      expect(state.reached).toBe(false);
      expect(res.status).toBe(expectedStatus);
      if (expectedStatus === 500) expect(await res.json()).toEqual(VERIFY_FAILED);
      else expect((await res.json()).code).toBe('PLAN_UPGRADE_REQUIRED');
    });

    it('does not leak the underlying error message', async () => {
      const { call } = miniApp({ services: services(async () => { throw new Error('password=hunter2 host=10.0.0.5'); }) });
      const res = await call();
      expect(await res.text()).not.toMatch(/hunter2|10\.0\.0\.5/);
    });

    it('a real planService over a failing db is a 500, not a pass', async () => {
      const H = makeHarness();
      seedPlans(H.db);
      H.db.state.user_subscriptions.push({ user_id: 5, plan_id: 3 }); // would pass if the query worked
      H.db.failWhen((sql) => /FROM subscription_plans sp JOIN/.test(sql), new Error('connection terminated'));
      const res = await H.request('/api/_t/tier2', bearer(signToken({ id: 5 })));
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual(VERIFY_FAILED);
    });

    // Property-style: for a generated space of (tier_level, minTier), next() runs
    // if and only if tier_level is a finite number (or numeric string) >= minTier.
    it('property: next() is reached iff a verified numeric tier_level >= minTier', async () => {
      let seed = 0x2f6e2b1;
      const rand = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
      const candidates = [
        undefined, null, NaN, Infinity, -Infinity, '', ' ', 'x', '2x', {}, [], [3], true, false, () => 3, Symbol('t'),
        ...Array.from({ length: 60 }, () => Math.round((rand() * 14 - 4) * 4) / 4), // -4..10 in quarters
        ...Array.from({ length: 12 }, () => String(Math.floor(rand() * 6))),
      ];
      let passes = 0;
      for (const tier of candidates) {
        for (const minTier of [1, 2, 3, 4, 0, -1]) {
          const isVerified =
            (typeof tier === 'number' && Number.isFinite(tier)) ||
            (typeof tier === 'string' && /^\s*-?\d+(\.\d+)?\s*$/.test(tier));
          const expectPass = isVerified && Number(tier) >= minTier;
          const { call, state } = miniApp({
            minTier,
            services: services(async () => ({ name: 'P', tier_level: tier })),
          });
          const res = await call();
          expect([minTier, tier, state.reached]).toEqual([minTier, tier, expectPass]);
          if (state.reached) {
            passes += 1;
            expect(res.status).toBe(200);
          } else {
            expect([403, 500]).toContain(res.status);
          }
        }
      }
      expect(passes).toBeGreaterThan(20); // the generated space really exercised the pass branch too
    });

    it('accepts a numeric-string tier_level like the Express `<` coercion did', async () => {
      const { call, state } = miniApp({ minTier: 2, services: services(async () => ({ name: 'P', tier_level: '3' })) });
      expect((await call()).status).toBe(200);
      expect(state.reached).toBe(true);
    });
  });

  it('planService is queried with the authenticated user id', async () => {
    const getUserPlan = jest.fn(async () => ({ name: 'P', tier_level: 3 }));
    const { call } = miniApp({ user: { id: 77 }, services: { planService: { getUserPlan } } });
    await call();
    expect(getUserPlan).toHaveBeenCalledWith(77);
  });

  it('createPlanService is the concrete planService used by the container', () => {
    expect(typeof createPlanService({ db: { query: () => {} } }).getUserPlan).toBe('function');
  });
});
