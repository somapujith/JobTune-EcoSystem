'use strict';

const { createPlanService } = require('../../src/worker/services/planService');
const { createServices, REGISTRY } = require('../../src/worker/services');
const { createConfig } = require('../../src/worker/config');
const { createFakeDb, seedPlans, makeEnv } = require('./helpers/harness');

function setup() {
  const db = createFakeDb();
  seedPlans(db);
  return { db, svc: createPlanService({ db }) };
}

describe('planService (ported from services/planService.js)', () => {
  // The 10 methods of planService.js at git HEAD, plus the two onboarding methods the working-tree Express
  // planService.js gained (setOnboardingCompleted / getOnboardingCompleted). With getOnboardingCompleted present,
  // requireOnboarding is no longer broken, only still UNMOUNTED (ADR 4.3.1); the Worker does not mount it either.
  it('has exactly the working-tree Express methods (10 original + 2 onboarding)', () => {
    const { svc } = setup();
    expect(Object.keys(svc).sort()).toEqual(
      ['assignPlan', 'createOrder', 'getAllPlans', 'getOrderByRef', 'getPlanById', 'getPlanByName', 'getUserPlan',
        'getUserOnboardingResponse', 'markOrderPaid', 'saveOnboardingResponse',
        'setOnboardingCompleted', 'getOnboardingCompleted'].sort()
    );
  });

  it('requires a db', () => {
    expect(() => createPlanService({})).toThrow(TypeError);
  });

  it('getAllPlans orders by tier_level; getPlanById / getPlanByName return null when absent', async () => {
    const { svc } = setup();
    expect((await svc.getAllPlans()).map((p) => p.tier_level)).toEqual([1, 2, 3]);
    expect((await svc.getPlanById(2)).name).toBe('Tune & Polish');
    expect(await svc.getPlanById(99)).toBeNull();
    expect((await svc.getPlanByName('Zero to Hero')).id).toBe(3);
    expect(await svc.getPlanByName('nope')).toBeNull();
  });

  it('getUserPlan is null without a subscription, and follows assignPlan (upsert)', async () => {
    const { svc } = setup();
    expect(await svc.getUserPlan(1)).toBeNull();
    await svc.assignPlan(1, 1);
    expect((await svc.getUserPlan(1)).tier_level).toBe(1);
    await svc.assignPlan(1, 3);
    expect((await svc.getUserPlan(1)).tier_level).toBe(3);
  });

  describe('orders (payment chain, ADR 6.4)', () => {
    it('createOrder builds an ord_<user>_<ts>_<rand> ref, copies the plan price, and starts pending', async () => {
      const { svc } = setup();
      const { order, plan } = await svc.createOrder(7, 2);
      expect(order.order_ref).toMatch(/^ord_7_\d+_[a-z0-9]{1,6}$/);
      expect(order).toMatchObject({ user_id: 7, plan_id: 2, amount: 10, status: 'pending' });
      expect(plan.name).toBe('Tune & Polish');
    });

    it('createOrder for an unknown plan throws "Plan not found"', async () => {
      const { svc } = setup();
      await expect(svc.createOrder(7, 99)).rejects.toThrow('Plan not found');
    });

    it('markOrderPaid is a single-statement compare-and-set: the second call returns null', async () => {
      const { svc, db } = setup();
      const { order } = await svc.createOrder(7, 2);
      const first = await svc.markOrderPaid(order.order_ref);
      expect(first).toMatchObject({ status: 'paid', paid_at: expect.any(Date) });
      const before = db.state.plan_orders[0].paid_at;
      expect(await svc.markOrderPaid(order.order_ref)).toBeNull();
      expect(db.state.plan_orders[0].paid_at).toBe(before); // paid_at not rewritten
      // and it is genuinely ONE statement guarded by status = 'pending'
      const updates = db.calls.filter((c) => /UPDATE plan_orders/.test(c.sql));
      expect(updates).toHaveLength(2);
      expect(updates[0].sql).toMatch(/WHERE order_ref = \$1 AND status = 'pending' RETURNING \*$/);
    });

    it('getOrderByRef returns the row or null', async () => {
      const { svc } = setup();
      const { order } = await svc.createOrder(7, 2);
      expect((await svc.getOrderByRef(order.order_ref)).user_id).toBe(7);
      expect(await svc.getOrderByRef('missing')).toBeNull();
    });
  });

  describe('onboarding (SQL and parameter order preserved)', () => {
    it('saveOnboardingResponse maps optional field_of_interest to null', async () => {
      const db = { query: jest.fn(async () => ({ rows: [{ id: 1 }] })) };
      const svc = createPlanService({ db });
      const row = await svc.saveOnboardingResponse(4, {
        career_goal: 'g', experience_level: 'e', pain_points: ['p'], recommended_plan_id: 2,
      });
      expect(row).toEqual({ id: 1 });
      const [sql, params] = db.query.mock.calls[0];
      expect(sql).toMatch(/^INSERT INTO onboarding_responses .* ON CONFLICT \(user_id\) DO UPDATE SET .* RETURNING \*$/);
      expect(params).toEqual([4, 'g', 'e', ['p'], null, 2]);
    });

    it('getUserOnboardingResponse returns the first row or null', async () => {
      const db = { query: jest.fn().mockResolvedValueOnce({ rows: [{ id: 9 }] }).mockResolvedValueOnce({ rows: [] }) };
      const svc = createPlanService({ db });
      expect(await svc.getUserOnboardingResponse(1)).toEqual({ id: 9 });
      expect(await svc.getUserOnboardingResponse(1)).toBeNull();
    });
  });

  it('uses $n parameters, never string interpolation of caller input', async () => {
    const { svc, db } = setup();
    await svc.getPlanByName("x'; DROP TABLE subscription_plans; --").catch(() => {});
    expect(db.calls[0].sql).not.toContain('DROP TABLE');
    expect(db.calls[0].params).toEqual(["x'; DROP TABLE subscription_plans; --"]);
  });
});

describe('services container', () => {
  it('builds services lazily, once per container', () => {
    const db = createFakeDb();
    const config = createConfig(makeEnv());
    const factory = jest.spyOn(REGISTRY, 'planService');
    const services = createServices({ db, config });
    expect(factory).not.toHaveBeenCalled();
    const a = services.planService;
    const b = services.planService;
    expect(a).toBe(b);
    expect(factory).toHaveBeenCalledTimes(1);
    // Porting slices register more services (services/registry/*); the core two must always be present.
    expect(Object.keys(services)).toEqual(expect.arrayContaining(['planService', 'sessionService']));
    factory.mockRestore();
  });

  it('supports overrides for tests and is frozen', () => {
    const fake = { getUserPlan: async () => null };
    const services = createServices({ db: createFakeDb(), config: createConfig(makeEnv()), overrides: { planService: fake } });
    expect(services.planService).toBe(fake);
    expect(Object.isFrozen(services)).toBe(true);
  });

  it('separate containers do not share instances (request scope)', () => {
    const config = createConfig(makeEnv());
    const one = createServices({ db: createFakeDb(), config });
    const two = createServices({ db: createFakeDb(), config });
    expect(one.sessionService).not.toBe(two.sessionService);
  });
});
