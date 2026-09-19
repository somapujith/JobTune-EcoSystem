'use strict';

/**
 * routes/subscriptions.js (WORKING-TREE version: 6 endpoints, onboarding flag, no /select-plan) and the
 * ADR 6.4 payment rules: idempotent verify-payment, cross-user denial, compare-and-set 409.
 * Fake db only: this proves route logic, not SQL or Neon behaviour.
 */
const { buildApp, jsonInit, servicesFactoryWithEngine, signToken, createAuthDb } = require('./helpers/authHarness');
const { createServices } = require('../../../src/worker/services');
const { createPlanService } = require('../../../src/worker/services/planService');
const { createRecommendationEngine } = require('../../../src/worker/services/recommendationEngine');

let H;
let alice;
let bob;
let aliceToken;
let bobToken;

beforeEach(() => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  H = buildApp();
  alice = H.db.seedUser({ email: 'alice@example.com', password: 'alice-password' });
  bob = H.db.seedUser({ email: 'bob@example.com', password: 'bob-password' });
  aliceToken = signToken({ id: alice.id });
  bobToken = signToken({ id: bob.id });
});
afterEach(() => jest.restoreAllMocks());

const call = (method, path, opts = {}) => H.request(`/api/subscriptions${path}`, jsonInit({ method, ...opts }));
const createOrder = async (token, planId) => (await call('POST', '/create-order', { token, body: { planId } })).json();
const orders = () => H.db.state.plan_orders;
const statements = (re) => H.db.calls.filter((c) => re.test(c.sql));

describe('auth on the six endpoints (only /plans is public; none is plan-gated)', () => {
  it.each([
    ['GET', '/my-plan'],
    ['POST', '/recommend'],
    ['POST', '/create-order'],
    ['POST', '/verify-payment'],
    ['GET', '/onboarded'],
  ])('%s %s without a token: 401 {"error":"Unauthorized"}', async (method, path) => {
    const res = await call(method, path, method === 'POST' ? { body: {} } : {});
    expect([res.status, await res.json()]).toEqual([401, { error: 'Unauthorized' }]);
  });

  it('a user with NO plan can call every authenticated endpoint (no requirePlan anywhere)', async () => {
    expect((await call('GET', '/my-plan', { token: aliceToken })).status).toBe(200);
    expect((await call('GET', '/onboarded', { token: aliceToken })).status).toBe(200);
  });

  it('there is no /select-plan (the working-tree Express file dropped it): unmatched -> 404', async () => {
    const res = await call('POST', '/select-plan', { token: aliceToken, body: { planId: 1 } });
    expect(res.status).toBe(404);
  });
});

describe('GET /plans (public)', () => {
  it('{plans: [...]} ordered by tier_level', async () => {
    const res = await call('GET', '/plans');
    expect(res.status).toBe(200);
    const { plans } = await res.json();
    expect(plans.map((p) => p.tier_level)).toEqual([1, 2, 3]);
    expect(Object.keys(await (await call('GET', '/plans')).json())).toEqual(['plans']);
  });

  it('a database failure is a masked 500', async () => {
    H.db.failWhen((sql) => /FROM subscription_plans ORDER BY tier_level/.test(sql), new Error('pg: password authentication failed for user "x"'));
    const res = await call('GET', '/plans');
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal Server Error' });
  });
});

describe('GET /my-plan', () => {
  it('{plan: null} without a subscription', async () => {
    expect(await (await call('GET', '/my-plan', { token: aliceToken })).json()).toEqual({ plan: null });
  });

  it('{plan: <row>} once assigned', async () => {
    H.db.state.user_subscriptions.push({ user_id: alice.id, plan_id: 2 });
    expect(await (await call('GET', '/my-plan', { token: aliceToken })).json()).toEqual({ plan: { id: 2, name: 'Tune & Polish', tier_level: 2, price: 10 } });
  });
});

describe('POST /recommend', () => {
  const valid = { careerGoal: 'faang-or-top-company', experienceLevel: 'advanced', painPoints: ['interviews', 'job-search'], fieldOfInterest: 'devops' };

  it('400 "Missing required fields" for each missing/empty field', async () => {
    for (const body of [
      { ...valid, careerGoal: undefined },
      { ...valid, experienceLevel: '' },
      { ...valid, painPoints: undefined },
      { ...valid, painPoints: [] },
      {},
    ]) {
      const res = await call('POST', '/recommend', { token: aliceToken, body });
      expect([res.status, await res.json()]).toEqual([400, { error: 'Missing required fields' }]);
    }
  });

  it('a body-less request is a masked 500 (destructuring undefined) and logs "Recommendation error:"', async () => {
    const res = await call('POST', '/recommend', { token: aliceToken });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal Server Error' });
    expect(console.error.mock.calls.some((c) => c[0] === 'Recommendation error:')).toBe(true);
  });

  it('returns {recommendation:{recommendedPlan, allPlans, scores}} with the engine\'s scores', async () => {
    const res = await call('POST', '/recommend', { token: aliceToken, body: valid });
    expect(res.status).toBe(200);
    const { recommendation } = await res.json();
    expect(Object.keys(recommendation)).toEqual(['recommendedPlan', 'allPlans', 'scores']);
    // goal 40/25 + experience 30/15 + interviews 25/15/10 + job-search 20/15/10 + devops 10/5
    expect(recommendation.scores).toEqual({ 'Learn & Build': 20, 'Tune & Polish': 25 + 15 + 15 + 15 + 5, 'Zero to Hero': 40 + 30 + 25 + 20 + 10 });
    expect(recommendation.recommendedPlan).toEqual({ id: 3, name: 'Zero to Hero', tier_level: 3, price: 20 });
    expect(recommendation.allPlans.map((p) => p.name)).toEqual(['Zero to Hero', 'Tune & Polish', 'Learn & Build']);
  });

  it('saves the onboarding response for the caller (recommended_plan_id from the plan table)', async () => {
    await call('POST', '/recommend', { token: aliceToken, body: valid });
    expect(H.db.state.onboarding_responses).toEqual([{
      user_id: alice.id, career_goal: 'faang-or-top-company', experience_level: 'advanced',
      pain_points: ['interviews', 'job-search'], field_of_interest: 'devops', recommended_plan_id: 3,
    }]);
  });

  it('does NOT assign a plan or complete onboarding (recommendation is advice only)', async () => {
    await call('POST', '/recommend', { token: aliceToken, body: valid });
    expect(H.db.state.user_subscriptions).toEqual([]);
    expect(H.db.state.users.find((u) => u.id === alice.id).onboarding_completed).toBe(false);
  });

  it('saving the onboarding response is best-effort: a failure only warns and the recommendation still returns', async () => {
    H.db.failWhen((sql) => /^INSERT INTO onboarding_responses/.test(sql), new Error('table missing'));
    const res = await call('POST', '/recommend', { token: aliceToken, body: valid });
    expect(res.status).toBe(200);
    expect((await res.json()).recommendation.recommendedPlan.name).toBe('Zero to Hero');
    expect(console.warn).toHaveBeenCalledWith('Warning: Could not save onboarding response:', 'table missing');
  });

  it('an unknown careerGoal falls back to the default scoring (same engine as Express)', async () => {
    const res = await call('POST', '/recommend', { token: aliceToken, body: { careerGoal: 'other', experienceLevel: 'unknown', painPoints: ['x'] } });
    expect((await res.json()).recommendation.scores).toEqual({ 'Learn & Build': 0, 'Tune & Polish': 30, 'Zero to Hero': 0 });
  });

  it('painPoints as a non-empty NON-array passes the length check and is ignored by scoring (Express quirk)', async () => {
    const res = await call('POST', '/recommend', { token: aliceToken, body: { careerGoal: 'service-role', experienceLevel: 'beginner', painPoints: 'skill-gaps' } });
    expect(res.status).toBe(200);
    expect((await res.json()).recommendation.scores).toEqual({ 'Learn & Build': 65, 'Tune & Polish': 50, 'Zero to Hero': 0 });
  });

  it('when the plan table is empty: recommendedPlan is omitted, allPlans falls back to {name, id:null}, the response is still 200', async () => {
    const empty = buildApp({ plans: false });
    const u = empty.db.seedUser({ email: 'c@example.com', password: 'carol-password' });
    const res = await empty.request('/api/subscriptions/recommend', jsonInit({ token: signToken({ id: u.id }), body: valid }));
    expect(res.status).toBe(200);
    const { recommendation } = await res.json();
    expect('recommendedPlan' in recommendation).toBe(false);
    expect(recommendation.allPlans[0]).toEqual({ name: 'Zero to Hero', id: null });
    // find() over an empty plan list never runs its callback, so nothing throws: the response row is saved with no plan id
    expect(empty.db.state.onboarding_responses[0].recommended_plan_id).toBeUndefined();
  });
});

describe('POST /create-order', () => {
  it('400 "Plan ID required" when planId is missing or falsy', async () => {
    for (const body of [{}, { planId: 0 }, { planId: null }, { planId: '' }]) {
      const res = await call('POST', '/create-order', { token: aliceToken, body });
      expect([res.status, await res.json()]).toEqual([400, { error: 'Plan ID required' }]);
    }
  });

  it('404 {"error":"Plan not found"} for an unknown plan; nothing inserted', async () => {
    const res = await call('POST', '/create-order', { token: aliceToken, body: { planId: 99 } });
    expect([res.status, await res.json()]).toEqual([404, { error: 'Plan not found' }]);
    expect(orders()).toHaveLength(0);
  });

  it('creates a PENDING order for the caller and does NOT assign the plan', async () => {
    const res = await call('POST', '/create-order', { token: aliceToken, body: { planId: 2 } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Object.keys(body)).toEqual(['success', 'order', 'plan']);
    expect(body.success).toBe(true);
    expect(body.order).toMatchObject({ user_id: alice.id, plan_id: 2, amount: 10, status: 'pending', paid_at: null });
    expect(body.order.order_ref).toMatch(new RegExp(`^ord_${alice.id}_\\d+_[a-z0-9]{1,6}$`));
    expect(body.plan).toMatchObject({ id: 2, name: 'Tune & Polish' });
    expect(H.db.state.user_subscriptions).toEqual([]); // assignment only after verify-payment
  });

  it('a body-less request and a db failure are masked 500s', async () => {
    expect((await call('POST', '/create-order', { token: aliceToken })).status).toBe(500);
    H.db.failWhen((sql) => /^INSERT INTO plan_orders/.test(sql), new Error('boom'));
    const res = await call('POST', '/create-order', { token: aliceToken, body: { planId: 1 } });
    expect([res.status, await res.json()]).toEqual([500, { error: 'Internal Server Error' }]);
  });
});

describe('POST /verify-payment (ADR 6.4)', () => {
  const verify = (token, orderRef) => call('POST', '/verify-payment', { token, body: { orderRef } });
  const userRow = (u) => H.db.state.users.find((x) => x.id === u.id);

  it('400 "orderRef required" when missing/empty', async () => {
    for (const body of [{}, { orderRef: '' }, { orderRef: null }]) {
      const res = await call('POST', '/verify-payment', { token: aliceToken, body });
      expect([res.status, await res.json()]).toEqual([400, { error: 'orderRef required' }]);
    }
  });

  it('404 "Order not found" for an unknown orderRef', async () => {
    const res = await verify(aliceToken, 'ord_does_not_exist');
    expect([res.status, await res.json()]).toEqual([404, { error: 'Order not found' }]);
  });

  it('happy path: order paid (one paid_at), plan assigned, onboarding completed, {success, plan}', async () => {
    const { order } = await createOrder(aliceToken, 3);
    const res = await verify(aliceToken, order.order_ref);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ success: true, plan: { id: 3, name: 'Zero to Hero', tier_level: 3, price: 20 } });
    expect(orders()[0]).toMatchObject({ status: 'paid', paid_at: expect.any(Date) });
    expect(H.db.state.user_subscriptions).toEqual([{ user_id: alice.id, plan_id: 3 }]);
    expect(userRow(alice).onboarding_completed).toBe(true);
  });

  it('call order is markOrderPaid -> assignPlan -> setOnboardingCompleted -> getPlanById', async () => {
    const { order } = await createOrder(aliceToken, 2);
    H.db.calls.length = 0;
    await verify(aliceToken, order.order_ref);
    const seq = H.db.calls.map((c) => c.sql).filter((s) => !/audit_logs|user_sessions/.test(s));
    expect(seq).toEqual([
      'SELECT * FROM plan_orders WHERE order_ref = $1',
      "UPDATE plan_orders SET status = 'paid', paid_at = CURRENT_TIMESTAMP WHERE order_ref = $1 AND status = 'pending' RETURNING *",
      'INSERT INTO user_subscriptions (user_id, plan_id) VALUES ($1, $2) ON CONFLICT (user_id) DO UPDATE SET plan_id = $2 RETURNING *',
      'UPDATE users SET onboarding_completed = true WHERE id = $1',
      'SELECT * FROM subscription_plans WHERE id = $1',
    ]);
  });

  it('IDEMPOTENT: a second call returns {success, plan, alreadyPaid:true}, exactly one paid_at, plan assigned once', async () => {
    const { order } = await createOrder(aliceToken, 2);
    const first = await (await verify(aliceToken, order.order_ref)).json();
    expect(first).not.toHaveProperty('alreadyPaid');
    const paidAt = orders()[0].paid_at;

    await new Promise((r) => setTimeout(r, 5));
    H.db.setNow(H.db.now + 60_000);
    const secondRes = await verify(aliceToken, order.order_ref);
    expect(secondRes.status).toBe(200);
    const second = await secondRes.json();
    expect(second).toEqual({ success: true, plan: { id: 2, name: 'Tune & Polish', tier_level: 2, price: 10 }, alreadyPaid: true });
    expect(Object.keys(second)).toEqual(['success', 'plan', 'alreadyPaid']);

    expect(orders()[0].paid_at).toBe(paidAt); // never rewritten
    expect(orders().filter((o) => o.paid_at)).toHaveLength(1);
    expect(statements(/^UPDATE plan_orders/)).toHaveLength(1); // the second call never issued the UPDATE
    expect(statements(/^INSERT INTO user_subscriptions/)).toHaveLength(1); // assignPlan ran once
    // the already-paid branch still (re)marks onboarding complete, as the working-tree Express does
    expect(statements(/^UPDATE users SET onboarding_completed/)).toHaveLength(2);
  });

  it('a third call is still alreadyPaid; the plan the user holds does not change', async () => {
    const { order } = await createOrder(aliceToken, 2);
    await verify(aliceToken, order.order_ref);
    await verify(aliceToken, order.order_ref);
    const third = await (await verify(aliceToken, order.order_ref)).json();
    expect(third.alreadyPaid).toBe(true);
    expect(H.db.state.user_subscriptions).toEqual([{ user_id: alice.id, plan_id: 2 }]);
  });

  it('CROSS-USER: bob cannot verify alice\'s orderRef (404, indistinguishable from unknown); nothing changes', async () => {
    const { order } = await createOrder(aliceToken, 3);
    const res = await verify(bobToken, order.order_ref);
    expect([res.status, await res.json()]).toEqual([404, { error: 'Order not found' }]);
    expect(orders()[0]).toMatchObject({ status: 'pending', paid_at: null });
    expect(H.db.state.user_subscriptions).toEqual([]);
    expect(userRow(bob).onboarding_completed).toBe(false);
    expect(statements(/^UPDATE plan_orders/)).toHaveLength(0);
  });

  it('CROSS-USER on an already PAID order: bob still gets 404 and no onboarding flag; alice is unaffected', async () => {
    const { order } = await createOrder(aliceToken, 3);
    await verify(aliceToken, order.order_ref);
    const res = await verify(bobToken, order.order_ref);
    expect([res.status, await res.json()]).toEqual([404, { error: 'Order not found' }]);
    expect(userRow(bob).onboarding_completed).toBe(false);
    expect(H.db.state.user_subscriptions).toEqual([{ user_id: alice.id, plan_id: 3 }]);
  });

  it('compare-and-set lost race: order looked pending but markOrderPaid finds none -> 409, no plan, no onboarding', async () => {
    const { order } = await createOrder(aliceToken, 3);
    const real = createPlanService({ db: H.db });
    const racing = buildApp({
      db: H.db,
      plans: false,
      servicesFactory: ({ db, config }) => createServices({
        db, config,
        overrides: {
          planService: { ...real, markOrderPaid: async () => null }, // the UPDATE ... WHERE status='pending' matched nothing
          recommendationEngine: createRecommendationEngine({ planService: real }),
        },
      }),
    });
    const res = await racing.request('/api/subscriptions/verify-payment', jsonInit({ token: aliceToken, body: { orderRef: order.order_ref } }));
    expect([res.status, await res.json()]).toEqual([409, { error: 'Order could not be marked paid' }]);
    expect(H.db.state.user_subscriptions).toEqual([]);
    expect(userRow(alice).onboarding_completed).toBe(false);
  });

  it('two truly concurrent verify-payment calls: exactly one performs the payment; invariants hold (one paid_at, one assignment)', async () => {
    const { order } = await createOrder(aliceToken, 3);
    const results = await Promise.all([verify(aliceToken, order.order_ref), verify(aliceToken, order.order_ref)]);
    const bodies = await Promise.all(results.map(async (r) => ({ status: r.status, body: await r.json() })));
    const fresh = bodies.filter((b) => b.status === 200 && !b.body.alreadyPaid);
    const rest = bodies.filter((b) => !(b.status === 200 && !b.body.alreadyPaid));
    expect(fresh).toHaveLength(1);
    expect(rest).toHaveLength(1);
    expect(rest[0].status === 409 || rest[0].body.alreadyPaid === true).toBe(true);
    expect(orders().filter((o) => o.paid_at)).toHaveLength(1);
    expect(statements(/^INSERT INTO user_subscriptions/)).toHaveLength(1);
  });

  it('a body-less request is a masked 500; a database failure mid-way is a masked 500', async () => {
    expect((await call('POST', '/verify-payment', { token: aliceToken })).status).toBe(500);
    const { order } = await createOrder(aliceToken, 2);
    H.db.failWhen((sql) => /^INSERT INTO user_subscriptions/.test(sql), new Error('boom'));
    const res = await verify(aliceToken, order.order_ref);
    expect([res.status, await res.json()]).toEqual([500, { error: 'Internal Server Error' }]);
  });

  /**
   * ADR 4.3.3 / checklist item 16. NOT a desired behaviour: this test pins the CURRENT (Express-identical)
   * behaviour so that changing it is a conscious decision, not an accident of the port.
   */
  it('KNOWN UNGUARDED MOCK VERIFIER (ADR 4.3.3): create-order + verify-payment grants ANY tier with no payment proof', async () => {
    const { order } = await createOrder(aliceToken, 3); // the most expensive plan
    // the ONLY thing sent is the orderRef: no signature, gateway id or payment reference of any kind
    const res = await call('POST', '/verify-payment', { token: aliceToken, body: { orderRef: order.order_ref } });
    expect(res.status).toBe(200);
    expect(H.db.state.user_subscriptions).toEqual([{ user_id: alice.id, plan_id: 3 }]);
    expect((await (await call('GET', '/my-plan', { token: aliceToken })).json()).plan.tier_level).toBe(3);
  });
});

describe('GET /onboarded', () => {
  it('{onboarded:false} by default; true after a verified payment (users.onboarding_completed)', async () => {
    expect(await (await call('GET', '/onboarded', { token: aliceToken })).json()).toEqual({ onboarded: false });
    const { order } = await createOrder(aliceToken, 1);
    await call('POST', '/verify-payment', { token: aliceToken, body: { orderRef: order.order_ref } });
    expect(await (await call('GET', '/onboarded', { token: aliceToken })).json()).toEqual({ onboarded: true });
    expect(await (await call('GET', '/onboarded', { token: bobToken })).json()).toEqual({ onboarded: false }); // per user
  });

  it('reads the flag from users (a seeded true is true); a missing user row is false', async () => {
    const done = H.db.seedUser({ email: 'done@example.com', password: 'done-password', onboardingCompleted: true });
    expect(await (await call('GET', '/onboarded', { token: signToken({ id: done.id }) })).json()).toEqual({ onboarded: true });
    expect(await (await call('GET', '/onboarded', { token: signToken({ id: 4242 }) })).json()).toEqual({ onboarded: false });
  });

  it('uses the exact SQL of the working-tree Express planService', async () => {
    await call('GET', '/onboarded', { token: aliceToken });
    expect(statements(/onboarding_completed/)[0].sql).toBe('SELECT onboarding_completed FROM users WHERE id = $1');
  });
});

describe('services wiring used by these routes', () => {
  it('servicesFactoryWithEngine builds recommendationEngine lazily on top of the real registry', () => {
    const c = createAuthDb();
    const services = servicesFactoryWithEngine()({ db: c, config: { jwtSecret: 'x'.repeat(40), accessTokenTtl: '15m', refreshTokenDays: 7 } });
    expect(typeof services.recommendationEngine.recommendPlan).toBe('function');
    expect(typeof services.planService.setOnboardingCompleted).toBe('function');
  });
});
