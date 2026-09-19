'use strict';

/**
 * Wiring of the leaf1 slice into the real Worker: the registry file (services/registry/leaf1.js)
 * and the mount file (routes/mounts/leaf1.js) that the aggregators pick up. Unlike the route
 * tests (which inject service instances), these use the real registry through createServices(),
 * with only the infra-owned aiClient faked, and the real mount() function.
 *
 * Deliberately does not call createApp({ mountSlices: true }), so other slices' work in
 * progress cannot fail this suite.
 */
const fs = require('fs');
const path = require('path');
const { createApp } = require('../../../src/worker/app');
const { createServices, REGISTRY } = require('../../../src/worker/services');
const leaf1Registry = require('../../../src/worker/services/registry/leaf1');
const { mount } = require('../../../src/worker/routes/mounts/leaf1');
const { listRoutes, listMounts } = require('../../../src/worker/lib/routes');
const { makeEnv, makeCtx, signToken, seedPlans } = require('../helpers/harness');
const { makeLeaf1Db, makeFakeAi, mountLeaf1 } = require('./helpers');

const WORKER_SRC = path.resolve(__dirname, '../../../src/worker');
const KEYS = ['jobGuideGenerator', 'progressService', 'recruiterVisibilityService', 'resumeConsistencyService', 'scorerBenchmark'];

describe('registry/leaf1.js', () => {
  it('registers exactly the five leaf1 services under their camelCase module names', () => {
    expect(Object.keys(leaf1Registry).sort()).toEqual(KEYS);
    for (const k of KEYS) expect(typeof leaf1Registry[k]).toBe('function');
  });

  it('is aggregated by services/index.js (REGISTRY has the keys)', () => {
    for (const k of KEYS) expect(REGISTRY[k]).toBe(leaf1Registry[k]);
    expect(fs.readFileSync(path.join(WORKER_SRC, 'services/index.js'), 'utf8')).toContain("require('./registry/leaf1')");
  });

  it('every entry builds a service with the Express-module API (real registry, mock db)', () => {
    const db = { query: jest.fn() };
    const services = createServices({ db, config: {}, overrides: { aiClient: makeFakeAi() } });
    expect(Object.keys(services.scorerBenchmark).sort()).toEqual(['FIXTURE_DATASET', 'computeMetrics', 'runBenchmark']);
    expect(Object.keys(services.progressService).sort()).toEqual(['getAllProgress', 'getProgress', 'mergeProgress', 'saveProgress', 'validateContext']);
    expect(Object.keys(services.jobGuideGenerator).sort()).toEqual(['buildFallbackGuide', 'generateJobGuide', 'getJobGuide']);
    expect(typeof services.resumeConsistencyService.checkConsistency).toBe('function');
    expect(typeof services.recruiterVisibilityService.computeVisibility).toBe('function');
  });

  it('the container caches one instance per request', () => {
    const services = createServices({ db: { query: jest.fn() }, config: {} });
    expect(services.progressService).toBe(services.progressService);
    expect(services.jobGuideGenerator).toBe(services.jobGuideGenerator);
  });

  it('jobGuideGenerator gets aiClient from the container (lazily, at call time)', async () => {
    const db = makeLeaf1Db();
    const ai = makeFakeAi(async () => ({
      ok: true,
      data: JSON.stringify({ questions: ['q'], talkingPoints: ['t'], companyResearch: 'r' }),
      error: null,
    }));
    const services = createServices({ db, config: {}, overrides: { aiClient: ai } });
    const out = await services.jobGuideGenerator.generateJobGuide({ jobDescription: 'x', role: 'SRE', userId: 1 });
    expect(out).toEqual({ questions: ['q'], talkingPoints: ['t'], companyResearch: 'r', savedId: 1 });
    expect(ai.calls).toHaveLength(1);
  });

  it('has no load-time dependency on aiClient: with none registered the guide falls back to the template', async () => {
    const db = makeLeaf1Db();
    const bare = createServices({ db, config: {}, overrides: { aiClient: undefined } });
    expect(bare.aiClient).toBeUndefined();
    const out = await bare.jobGuideGenerator.generateJobGuide({ jobDescription: 'x', userId: 1 });
    expect(out.questions).toHaveLength(9);
  });
});

describe('routes/mounts/leaf1.js', () => {
  it('is aggregated by routes/mounts/index.js', () => {
    expect(fs.readFileSync(path.join(WORKER_SRC, 'routes/mounts/index.js'), 'utf8')).toContain("require('./leaf1')");
  });

  it('mounts the six routers at the Express prefixes, in Express order', () => {
    const app = createApp();
    mount(app);
    expect(listMounts(app).map((m) => m.prefix)).toEqual([
      '/api',
      '/api/projects',
      '/api/guides',
      '/api/benchmarks',
      '/api/progress',
      '/api/recruiter-visibility',
      '/api/resume-consistency',
    ]);
  });

  it('registers the same routes, in the same order and with the same guards, as the manifest-driven mini-app', () => {
    const viaMount = createApp();
    mount(viaMount);
    const viaHelper = mountLeaf1(createApp());
    const strip = (routes) => routes.map((r) => ({ method: r.method, path: r.path, auth: r.auth, minTier: r.minTier, mw: r.middleware.map((m) => m.name) }));
    const own = (routes) => routes.filter((r) => r.path !== '/api/health');
    expect(strip(own(listRoutes(viaMount)))).toEqual(strip(own(listRoutes(viaHelper))));
    expect(own(listRoutes(viaMount))).toHaveLength(10);
  });

  it('mount() is not applied by createApp() by default (only worker-entry opts in)', async () => {
    const app = createApp();
    expect(listRoutes(app).some((r) => r.path.startsWith('/api/progress'))).toBe(false);
  });
});

describe('end to end through the real registry and the real mount()', () => {
  function run({ plan, role, ai = makeFakeAi() } = {}) {
    const db = makeLeaf1Db();
    seedPlans(db);
    if (plan) db.state.user_subscriptions.push({ user_id: 1, plan_id: plan });
    if (role) db.state.users.push({ id: 1, role });
    const app = createApp({
      dbFactory: () => db,
      servicesFactory: ({ db: d, config }) => createServices({ db: d, config, overrides: { aiClient: ai } }),
    });
    mount(app);
    const env = makeEnv();
    const ctx = makeCtx();
    const headers = { Authorization: `Bearer ${signToken({ id: 1 })}` };
    const call = (p, init = {}) => app.request(p, { ...init, headers: { ...headers, ...(init.headers || {}) } }, env, ctx);
    return { db, call };
  }

  beforeEach(() => jest.spyOn(console, 'error').mockImplementation(() => {}));
  afterEach(() => jest.restoreAllMocks());

  it('projects, progress, guides, benchmarks, resume-consistency and recruiter-visibility all respond', async () => {
    const { call, db } = run({ plan: 2, role: 'admin' });
    const post = (p, body) => call(p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

    expect((await call('/api/projects/ideas')).status).toBe(200);
    expect((await call('/api/progress')).status).toBe(200);
    const put = await call('/api/progress/preferences', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: { a: 1 } }) });
    expect((await put.json()).data).toEqual({ a: 1 });
    expect((await call('/api/guides/1')).status).toBe(404);
    const gen = await post('/api/guides/generate', { jobDescription: 'x', role: 'SRE' }); // no LLM -> template
    expect(gen.status).toBe(200);
    expect((await gen.json()).savedId).toBe(1);
    expect((await call('/api/benchmarks/run?scorerName=ats&datasetName=d')).status).toBe(200);
    expect(db.state.scorer_benchmarks).toHaveLength(1);
    expect((await post('/api/resume-consistency/check', { resume: { skills: ['a'] }, linkedin: { skills: [] } })).status).toBe(200);
    expect((await post('/api/recruiter-visibility/analyze', { resumeText: 'react node aws' })).status).toBe(200);
  });

  // Cross-slice contract check: the REAL infra aiClient behind services.aiClient, with only the outbound
  // provider fetch stubbed (nothing leaves the process). Skipped until infra has registered aiClient.
  const itIfAiClient = REGISTRY.aiClient ? it : it.skip;
  itIfAiClient('guides/generate uses the real registered aiClient.callAI (provider fetch stubbed)', async () => {
    const guide = { questions: ['from provider'], talkingPoints: ['t'], companyResearch: 'r' };
    const fetchStub = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(guide) }] } }] }),
      text: async () => '',
    });
    const db = makeLeaf1Db();
    const app = createApp({ dbFactory: () => db });
    mount(app);
    const env = makeEnv({ AI_PROVIDER: 'gemini', GEMINI_API_KEY: 'synthetic-test-key', MOCK_AI: 'false' });
    const res = await app.request(
      '/api/guides/generate',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${signToken({ id: 1 })}` },
        body: JSON.stringify({ jobDescription: 'Build pipelines', role: 'Data Engineer' }),
      },
      env,
      makeCtx()
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ...guide, savedId: 1 });
    expect(fetchStub).toHaveBeenCalledTimes(1);
    expect(String(fetchStub.mock.calls[0][0])).toContain('generativelanguage.googleapis.com');
    const sent = JSON.parse(fetchStub.mock.calls[0][1].body);
    expect(sent.generationConfig).toEqual({ temperature: 0.5, maxOutputTokens: 1024, thinkingConfig: { thinkingBudget: 0 } });
    expect(sent.contents[0].parts[0].text).toContain('for the role: Data Engineer.');
  });

  it('the gates hold through the real wiring: tier 1 is refused on both tier-2 routes, non-admin on benchmarks', async () => {
    const { call } = run({ plan: 1, role: 'user' });
    const post = (p, body) => call(p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    expect((await call('/api/projects/ideas')).status).toBe(200); // tier 1 is enough here
    expect((await post('/api/resume-consistency/check', { resume: { skills: ['a'] } })).status).toBe(403);
    expect((await post('/api/recruiter-visibility/analyze', { resumeText: 'x' })).status).toBe(403);
    expect((await call('/api/benchmarks/run?scorerName=ats&datasetName=d')).status).toBe(403);
  });
});
