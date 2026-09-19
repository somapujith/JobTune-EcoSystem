'use strict';

/**
 * services/recommendationEngine.js and the planService onboarding additions.
 * The engine is compared, input for input, against the ORIGINAL Express module (its only dependency,
 * planService, is stubbed: no database, no environment) so the scoring port cannot drift.
 */
const { createRecommendationEngine } = require('../../../src/worker/services/recommendationEngine');
const { createPlanService } = require('../../../src/worker/services/planService');
const { createServices } = require('../../../src/worker/services');
const { createConfig } = require('../../../src/worker/config');
const { makeEnv } = require('../helpers/harness');
const { createAuthDb } = require('./helpers/authDb');

const PLANS = [
  { id: 1, name: 'Learn & Build', tier_level: 1, price: 0 },
  { id: 2, name: 'Tune & Polish', tier_level: 2, price: 10 },
  { id: 3, name: 'Zero to Hero', tier_level: 3, price: 20 },
];
const fakePlans = { getAllPlans: async () => PLANS.map((p) => ({ ...p })) };

describe('recommendationEngine (worker port)', () => {
  const engine = createRecommendationEngine({ planService: fakePlans });

  it('exposes exactly recommendPlan', () => {
    expect(Object.keys(engine)).toEqual(['recommendPlan']);
  });

  it('requires a planService source', () => {
    expect(() => createRecommendationEngine()).toThrow(TypeError);
    expect(() => createRecommendationEngine({})).toThrow(TypeError);
  });

  it('reads services.planService lazily at call time (honours later overrides)', async () => {
    const services = { planService: fakePlans };
    const lazy = createRecommendationEngine({ services });
    services.planService = { getAllPlans: async () => [{ id: 9, name: 'Zero to Hero' }] };
    const r = await lazy.recommendPlan('faang-or-top-company', 'advanced', ['interviews'], 'devops');
    expect(r.recommendedPlan).toEqual({ id: 9, name: 'Zero to Hero' });
  });

  it('is registered-service shaped: built from a container it uses the container\'s planService', async () => {
    const db = createAuthDb();
    db.state.subscription_plans.push(...PLANS);
    const services = createServices({ db, config: createConfig(makeEnv()), overrides: {} });
    const e = createRecommendationEngine({ services });
    expect((await e.recommendPlan('service-role', 'beginner', ['skill-gaps'])).recommendedPlan.name).toBe('Learn & Build');
  });

  describe('identical to the Express module across an input grid', () => {
    let original;
    beforeAll(() => {
      // Load the ORIGINAL with its planService dependency replaced (module mocks are per test file).
      jest.doMock('../../../src/services/planService', () => ({ getAllPlans: async () => PLANS.map((p) => ({ ...p })) }));
      jest.isolateModules(() => {
        original = require('../../../src/services/recommendationEngine');
      });
    });
    afterAll(() => jest.dontMock('../../../src/services/planService'));

    const goals = ['service-role', 'skill-development', 'faang-or-top-company', 'anything-else', undefined, ''];
    const levels = ['beginner', 'intermediate', 'advanced', 'expert', undefined];
    const pains = [
      ['resume-portfolio'], ['interviews', 'job-search'], ['skill-gaps', 'networking', 'project-building'],
      ['resume-portfolio', 'interviews', 'job-search', 'skill-gaps', 'networking', 'project-building'],
      ['unknown-pain'], ['constructor', '__proto__', 'toString'], [], 'not-an-array', undefined, null,
    ];
    const fields = ['frontend', 'backend', 'fullstack', 'data-ml', 'devops', 'mobile', 'other', undefined, '', 'constructor'];

    it('every combination returns a deep-equal result (scores, ranking, plan objects)', async () => {
      let n = 0;
      for (const g of goals) for (const l of levels) for (const p of pains) for (const f of fields) {
        const [a, b] = await Promise.all([original.recommendPlan(g, l, p, f), engine.recommendPlan(g, l, p, f)]);
        expect(b).toEqual(a);
        expect(JSON.stringify(b)).toBe(JSON.stringify(a));
        n++;
      }
      expect(n).toBe(goals.length * levels.length * pains.length * fields.length);
    });

    it('missing plans in the table give the same fallbacks', async () => {
      const partial = { getAllPlans: async () => [{ id: 1, name: 'Learn & Build' }] };
      const w = createRecommendationEngine({ planService: partial });
      const r = await w.recommendPlan('faang-or-top-company', 'advanced', ['interviews']);
      expect(r.recommendedPlan).toBeUndefined();
      expect(r.allPlans).toEqual([{ name: 'Zero to Hero', id: null }, { name: 'Tune & Polish', id: null }, { id: 1, name: 'Learn & Build' }]);
    });
  });

  it('a failing planService propagates (the route turns it into a masked 500)', async () => {
    const e = createRecommendationEngine({ planService: { getAllPlans: async () => { throw new Error('db down'); } } });
    await expect(e.recommendPlan('service-role', 'beginner', ['skill-gaps'])).rejects.toThrow('db down');
  });
});

describe('planService onboarding additions (working-tree Express planService)', () => {
  it('now has the original 10 methods plus setOnboardingCompleted and getOnboardingCompleted', () => {
    const svc = createPlanService({ db: createAuthDb() });
    expect(Object.keys(svc).sort()).toEqual([
      'assignPlan', 'createOrder', 'getAllPlans', 'getOnboardingCompleted', 'getOrderByRef', 'getPlanById', 'getPlanByName',
      'getUserOnboardingResponse', 'getUserPlan', 'markOrderPaid', 'saveOnboardingResponse', 'setOnboardingCompleted',
    ]);
  });

  it('setOnboardingCompleted issues the exact Express UPDATE with $1', async () => {
    const db = { query: jest.fn(async () => ({ rows: [], rowCount: 1 })) };
    const svc = createPlanService({ db });
    expect(await svc.setOnboardingCompleted(7)).toBeUndefined();
    expect(db.query).toHaveBeenCalledWith('UPDATE users SET onboarding_completed = true WHERE id = $1', [7]);
  });

  it('getOnboardingCompleted issues the exact Express SELECT and coerces to a boolean', async () => {
    const rows = [[{ onboarding_completed: true }], [{ onboarding_completed: false }], [{ onboarding_completed: null }], [{}], []];
    const db = { query: jest.fn() };
    rows.forEach((r) => db.query.mockResolvedValueOnce({ rows: r }));
    const svc = createPlanService({ db });
    const got = [];
    for (let i = 0; i < rows.length; i++) got.push(await svc.getOnboardingCompleted(3));
    expect(got).toEqual([true, false, false, false, false]);
    expect(db.query).toHaveBeenCalledWith('SELECT onboarding_completed FROM users WHERE id = $1', [3]);
  });

  it('works end to end against the auth test db and keeps the flag per user', async () => {
    const db = createAuthDb();
    const a = db.seedUser({ email: 'a@example.com', password: 'a-password-1' });
    const b = db.seedUser({ email: 'b@example.com', password: 'b-password-1' });
    const svc = createPlanService({ db });
    expect(await svc.getOnboardingCompleted(a.id)).toBe(false);
    await svc.setOnboardingCompleted(a.id);
    expect(await svc.getOnboardingCompleted(a.id)).toBe(true);
    expect(await svc.getOnboardingCompleted(b.id)).toBe(false);
    await svc.setOnboardingCompleted(a.id); // idempotent
    expect(await svc.getOnboardingCompleted(a.id)).toBe(true);
  });
});
