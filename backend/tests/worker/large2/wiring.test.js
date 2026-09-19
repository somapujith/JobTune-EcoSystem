'use strict';

/**
 * The two files the aggregators load for this slice: services/registry/large2.js and routes/mounts/large2.js.
 * Route/service tests elsewhere in this folder build their own containers so they never depend on these files;
 * this test proves the real wiring (registry -> container -> routes) works end to end with only aiClient supplied.
 */
const fs = require('fs');
const path = require('path');
const { createApp } = require('../../../src/worker/app');
const { listRoutes, listMounts } = require('../../../src/worker/lib/routes');
const { createServices, REGISTRY } = require('../../../src/worker/services');
const registry = require('../../../src/worker/services/registry/large2');
const { mount } = require('../../../src/worker/routes/mounts/large2');
const { makeEnv, makeCtx, signToken, seedPlans, createFakeDb } = require('../helpers/harness');
const { installSql, makeAi, aiOk } = require('./helpers');

const SRC = path.resolve(__dirname, '../../../src/worker');

describe('services/registry/large2.js', () => {
  it('registers exactly the two services this slice owns, and the aggregate registry includes them', () => {
    expect(Object.keys(registry).sort()).toEqual(['linkedinAnalysisStore', 'linkedinOptimizerService']);
    expect(REGISTRY.linkedinAnalysisStore).toBe(registry.linkedinAnalysisStore);
    expect(REGISTRY.linkedinOptimizerService).toBe(registry.linkedinOptimizerService);
    expect(fs.readFileSync(path.join(SRC, 'services/index.js'), 'utf8')).toContain("require('./registry/large2')");
    expect(fs.readFileSync(path.join(SRC, 'routes/mounts/index.js'), 'utf8')).toContain("require('./large2')");
  });

  it('builds both services lazily, per request, from { db, config, services } (nothing constructed until used)', async () => {
    const db = installSql(createFakeDb());
    const config = { vars: { LM_STUDIO_MODEL_GITHUB: 'gh' } };
    const ai = makeAi([aiOk({ options: ['o'], tips: 't' })]);
    const services = createServices({ db, config, overrides: { aiClient: ai } });

    await expect(services.linkedinAnalysisStore.getLinkedInAnalysisHistory(1)).resolves.toEqual([]);
    expect(services.linkedinAnalysisStore).toBe(services.linkedinAnalysisStore); // cached for the request
    await expect(services.linkedinOptimizerService.generateHeadline('Dev')).resolves.toEqual({ options: ['o'], tips: 't' });
    expect(ai.calls[0].model).toBe('gh');
  });

  it('requiring the registry has no side effects and does not need the aiClient service', () => {
    const services = createServices({ db: { query: jest.fn() }, config: { vars: {} } }); // no aiClient override
    expect(() => services.linkedinOptimizerService).not.toThrow(); // construction is lazy about aiClient
  });
});

describe('routes/mounts/large2.js', () => {
  function build({ ai = makeAi() } = {}) {
    const db = installSql(createFakeDb());
    seedPlans(db);
    db.state.user_subscriptions.push({ user_id: 1, plan_id: 3 });
    const app = createApp({
      dbFactory: () => db,
      servicesFactory: ({ db: d, config }) => createServices({ db: d, config, overrides: { aiClient: ai } }), // real registry
    });
    mount(app);
    const env = makeEnv();
    const ctx = makeCtx();
    const headers = { Authorization: `Bearer ${signToken({ id: 1 })}`, 'Content-Type': 'application/json' };
    return { app, db, ai, request: (p, init = {}) => app.request(p, { ...init, headers: { ...headers, ...(init.headers || {}) } }, env, ctx) };
  }

  it('mounts both prefixes, profiles first, and exactly 12 + 7 endpoints', () => {
    const { app } = build();
    expect(listMounts(app).map((m) => m.prefix).filter((p) => p !== '/api')).toEqual(['/api/profiles', '/api/ai-coach']); // /api = health
    const routes = listRoutes(app).filter((r) => r.path !== '/api/health');
    expect(routes.filter((r) => r.path.startsWith('/api/profiles/'))).toHaveLength(12);
    expect(routes.filter((r) => r.path.startsWith('/api/ai-coach/'))).toHaveLength(7);
    expect(routes).toHaveLength(19);
  });

  it('serves a request through the real registry-built services (LinkedIn analysis is saved and read back)', async () => {
    const { request, db } = build({ ai: makeAi([aiOk({ headlineOptions: ['h'], aboutRewrite: 'a' })]) });
    const analyze = await request('/api/profiles/linkedin/analyze', { method: 'POST', body: JSON.stringify({ headline: 'Data Engineer | SQL', skills: 'SQL' }) });
    expect(analyze.status).toBe(200);
    const report = await analyze.json();
    expect(report).toMatchObject({ success: true, aiPowered: true, analysisId: 1 });

    const history = await (await request('/api/profiles/linkedin/history')).json();
    expect(history.history).toHaveLength(1);
    const detail = await (await request(`/api/profiles/linkedin/history/${report.analysisId}`)).json();
    expect(detail.id).toBe(1);
    expect(detail.report.score).toBe(report.score);
    expect(db.state.linkedin_analyses).toHaveLength(1);
  });

  it('ai-coach works through the same wiring', async () => {
    const { request } = build({ ai: makeAi([aiOk([{ title: 'T' }])]) });
    const res = await request('/api/ai-coach/recommendations', { method: 'POST', body: JSON.stringify({ targetRole: 'Product Manager' }) });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ aiPowered: true, targetRole: 'Product Manager' });
    expect((await request('/api/ai-coach/review-history')).status).toBe(200);
  });

  it('other paths stay 404 (the slice adds no catch-all)', async () => {
    const { request } = build();
    expect((await request('/api/profiles')).status).toBe(404);
    expect((await request('/api/profiles/nope')).status).toBe(404);
    expect((await request('/api/ai-coach/nope')).status).toBe(404);
  });
});
