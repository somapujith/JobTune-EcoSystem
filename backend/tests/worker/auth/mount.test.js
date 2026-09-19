'use strict';

/**
 * The two shared-file entry points of the auth slice: routes/mounts/auth.js and services/registry/auth.js,
 * exercised through the REAL registry (no test-only service overrides), so the production wiring
 * (createApp + mount + REGISTRY) is what runs.
 */
const { createApp } = require('../../../src/worker/app');
const { createServices, REGISTRY } = require('../../../src/worker/services');
const { createConfig } = require('../../../src/worker/config');
const { listMounts } = require('../../../src/worker/lib/routes');
const registry = require('../../../src/worker/services/registry/auth');
const { mount } = require('../../../src/worker/routes/mounts/auth');
const { mountAll } = require('../../../src/worker/routes/mounts');
const { makeEnv, makeCtx, seedPlans, signToken, TEST_JWT_SECRET } = require('../helpers/harness');
const { createAuthDb } = require('./helpers/authDb');
const { jsonInit } = require('./helpers/authHarness');

describe('services/registry/auth.js', () => {
  it('registers exactly recommendationEngine, and it reaches the aggregated REGISTRY', () => {
    expect(Object.keys(registry)).toEqual(['recommendationEngine']);
    expect(REGISTRY.recommendationEngine).toBe(registry.recommendationEngine);
  });

  it('builds lazily from a container and uses that container\'s planService', async () => {
    const db = createAuthDb();
    seedPlans(db);
    const services = createServices({ db, config: createConfig(makeEnv()) });
    const engine = services.recommendationEngine;
    expect(services.recommendationEngine).toBe(engine);
    expect((await engine.recommendPlan('service-role', 'beginner', ['skill-gaps'])).recommendedPlan.name).toBe('Learn & Build');
  });

  it('a planService override is honoured by the engine (lazy dependency)', async () => {
    const services = createServices({
      db: createAuthDb(),
      config: createConfig(makeEnv()),
      overrides: { planService: { getAllPlans: async () => [{ id: 77, name: 'Zero to Hero' }] } },
    });
    expect((await services.recommendationEngine.recommendPlan('faang-or-top-company', 'advanced', ['interviews'])).recommendedPlan).toEqual({ id: 77, name: 'Zero to Hero' });
  });
});

describe('routes/mounts/auth.js', () => {
  it('mounts the four API routers in Express order plus the static /admin page', () => {
    const app = createApp();
    mount(app);
    // (createApp itself mounts the health router at /api)
    expect(listMounts(app).map((m) => m.prefix).filter((p) => p !== '/api'))
      .toEqual(['/api/auth', '/api/subscriptions', '/api/admin', '/api/admin-panels', '/admin']);
  });

  it('is part of the aggregate mountAll (what worker-entry.js uses)', () => {
    const app = createApp();
    mountAll(app);
    const prefixes = listMounts(app).map((m) => m.prefix);
    for (const p of ['/api/auth', '/api/subscriptions', '/api/admin', '/api/admin-panels', '/admin']) expect(prefixes).toContain(p);
    // order among this slice's prefixes is the Express order
    expect(prefixes.filter((p) => ['/api/auth', '/api/subscriptions', '/api/admin', '/api/admin-panels'].includes(p)))
      .toEqual(['/api/auth', '/api/subscriptions', '/api/admin', '/api/admin-panels']);
  });

  describe('end to end through the production wiring (real REGISTRY, real mount, fake db)', () => {
    let db;
    let request;
    beforeEach(() => {
      jest.spyOn(console, 'warn').mockImplementation(() => {});
      jest.spyOn(console, 'error').mockImplementation(() => {});
      db = createAuthDb();
      seedPlans(db);
      const app = createApp({ dbFactory: () => db });
      mount(app);
      const env = makeEnv();
      const ctx = makeCtx();
      request = (path, init) => app.request(path, init, env, ctx);
    });
    afterEach(() => jest.restoreAllMocks());

    it('signup -> onboarding recommendation -> order -> verify-payment -> onboarded, all on the real registry', async () => {
      const signup = await request('/api/auth/signup', jsonInit({ body: { email: 'e2e@example.com', password: 'e2e-password-1' }, ip: '203.0.113.50' }));
      expect(signup.status).toBe(201);
      const { token } = await signup.json();

      const rec = await request('/api/subscriptions/recommend', jsonInit({ token, body: { careerGoal: 'service-role', experienceLevel: 'beginner', painPoints: ['skill-gaps'] } }));
      expect(rec.status).toBe(200);
      expect((await rec.json()).recommendation.recommendedPlan.name).toBe('Learn & Build');

      const order = await (await request('/api/subscriptions/create-order', jsonInit({ token, body: { planId: 1 } }))).json();
      const paid = await request('/api/subscriptions/verify-payment', jsonInit({ token, body: { orderRef: order.order.order_ref } }));
      expect(paid.status).toBe(200);
      expect(await (await request('/api/subscriptions/onboarded', jsonInit({ method: 'GET', token }))).json()).toEqual({ onboarded: true });
      expect((await (await request('/api/subscriptions/my-plan', jsonInit({ method: 'GET', token }))).json()).plan.name).toBe('Learn & Build');
    });

    it('/admin serves the page and the admin API rejects anonymous callers', async () => {
      expect((await request('/admin/')).status).toBe(200);
      expect((await request('/api/admin/users', jsonInit({ method: 'GET' }))).status).toBe(401);
      expect((await request('/api/admin/users', jsonInit({ method: 'GET', token: signToken({ id: 1 }, { secret: 'x'.repeat(40) }) }))).status).toBe(401);
      expect(TEST_JWT_SECRET.length).toBeGreaterThanOrEqual(32);
    });
  });
});
