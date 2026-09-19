'use strict';

/**
 * Registry wiring for the jobs slice: services/registry/jobs.js is aggregated by services/index.js, and the real
 * createServices container builds the three jobs services lazily. The infra-owned dependencies (aiClient,
 * onetLoader, the two v2 analyzers) are supplied through `overrides`, exactly the contract this slice codes against.
 * The shipped mount file is used for the full-stack pass at the end.
 */
const { createServices, REGISTRY } = require('../../../src/worker/services');
const jobsRegistry = require('../../../src/worker/services/registry/jobs');
const { createApp } = require('../../../src/worker/app');
const { mount } = require('../../../src/worker/routes/mounts/jobs');
const { makeEnv, makeCtx, signToken, seedPlans, createFakeDb } = require('../helpers/harness');
const { makeFakeAiClient } = require('./jobsHarness');
const ActionVerbAnalyzer = require('../../../src/services/v2/actionVerbAnalyzer');
const MetricsAnalyzer = require('../../../src/services/v2/metricsAnalyzer');
const { extractJSON } = require('../../../src/utils/aiClient');

const config = { vars: { LM_STUDIO_MODEL_FIT: 'fit-x' } };
const infraOverrides = () => ({
  aiClient: makeFakeAiClient(extractJSON),
  onetLoader: { findOccupation: () => null, getDomain: () => 'Unknown' },
  actionVerbAnalyzer: ActionVerbAnalyzer,
  metricsAnalyzer: MetricsAnalyzer,
});

describe('services/registry/jobs.js', () => {
  it('registers exactly the three services this slice owns (one line each)', () => {
    expect(Object.keys(jobsRegistry).sort()).toEqual(['achievementEnhancerService', 'discovery', 'jobFit']);
    expect(Object.values(jobsRegistry).every((f) => typeof f === 'function')).toBe(true);
  });

  it('is aggregated into the shared REGISTRY', () => {
    for (const name of Object.keys(jobsRegistry)) expect(REGISTRY[name]).toBe(jobsRegistry[name]);
  });

  it('does not shadow or collide with foundation entries', () => {
    expect(Object.keys(jobsRegistry)).not.toEqual(expect.arrayContaining(['planService', 'sessionService', 'aiClient', 'aiCache']));
  });

  it('createServices builds them lazily and caches one instance per container', () => {
    const services = createServices({ db: {}, config, overrides: infraOverrides() });
    expect(services.discovery).toBe(services.discovery);
    expect(services.discovery.VALID_SOURCES).toEqual(['mock', 'remotive', 'adzuna']);
    expect(typeof services.jobFit.score).toBe('function');
    expect(typeof services.achievementEnhancerService.generateFallbackBullet).toBe('function');
  });

  it('services built by the registry work end to end against the injected infra services', async () => {
    const services = createServices({ db: {}, config, overrides: infraOverrides() });
    expect(services.achievementEnhancerService.generateFallbackBullets(['made a website'])).toEqual([
      'Built a website, streamlining workflows and improving system reliability.',
    ]);
    expect(await services.discovery.getSource('mock').search('', '')).toHaveLength(5);
    const result = await services.jobFit.score({ resumeText: 'senior python', jobDescription: 'senior python' });
    expect(result.method).toBe('rule');
    expect(services.aiClient.calls[0].model).toBe('fit-x'); // config.vars flows through the registry factory
  });

  it('services are wired to the injected config: discovery hands ADZUNA_* config vars to the Adzuna source', async () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, json: async () => ({ results: [] }) });
    try {
      const services = createServices({ db: {}, config: { vars: { ADZUNA_APP_ID: 'a', ADZUNA_APP_KEY: 'b' } }, overrides: infraOverrides() });
      await services.discovery.getSource('adzuna').search('x', 'London');
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(fetchSpy.mock.calls[0][0]).toContain('app_id=a&app_key=b');
    } finally {
      fetchSpy.mockRestore();
    }
  });
});

describe('full stack: createApp + shipped mount file + real createServices', () => {
  function build(tier, { realInfra = false, envOverrides = {} } = {}) {
    const db = createFakeDb();
    seedPlans(db);
    if (tier) db.state.user_subscriptions.push({ user_id: 5, plan_id: tier });
    const realQuery = db.query.bind(db);
    const inserts = [];
    db.query = (sql, params) => {
      if (/INSERT INTO discovered_jobs/.test(sql)) {
        inserts.push(params);
        return Promise.resolve({ rows: [], rowCount: 1 });
      }
      if (/FROM job_applications/.test(sql)) return Promise.resolve({ rows: [] });
      return realQuery(sql, params);
    };
    const env = makeEnv(envOverrides);
    const overrides = realInfra ? {} : infraOverrides(); // realInfra: infra's own aiClient / onetLoader / analyzers
    const app = createApp({
      dbFactory: () => db,
      servicesFactory: ({ db: d, config: c }) => createServices({ db: d, config: c, overrides }),
    });
    mount(app);
    const ctx = makeCtx();
    const headers = { Authorization: `Bearer ${signToken({ id: 5 })}`, 'Content-Type': 'application/json' };
    const call = (method, path, body) => app.request(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }, env, ctx);
    return { call, inserts, overrides };
  }

  it('serves one endpoint from each of the six routers with the registry-built services', async () => {
    const { call, inserts } = build(3);
    expect((await call('GET', '/api/jobs')).status).toBe(200);
    expect((await call('POST', '/api/jobs/analyze-description', { jobDescription: 'React developer with 5 years of experience needed. '.repeat(3) })).status).toBe(200);
    expect((await call('POST', '/api/jobs/generate-cover-letter', { jobDescription: 'x', companyName: 'A', position: 'B', yourName: 'C' })).status).toBe(200);
    const discover = await call('GET', '/api/jobs/discover');
    expect(discover.status).toBe(200);
    expect((await discover.json()).data.count).toBe(5);
    expect(inserts).toHaveLength(5);
    const fit = await call('POST', '/api/jobs/fit', { resumeText: 'senior python developer', jobDescription: 'senior python developer' });
    expect(fit.status).toBe(200);
    expect((await fit.json()).breakdown.seniority).toBe(100);
    const enhance = await call('POST', '/api/jobs/achievement-enhancer/enhance', { achievement: 'made a website' });
    expect(enhance.status).toBe(200);
    expect((await enhance.json()).data.bullets).toEqual(['Built a website, streamlining workflows and improving system reliability.']);
  });

  it('plan gates still hold on the fully wired app (tier 1: 403 on every gated endpoint, 200 on the ungated ones)', async () => {
    const { call, overrides } = build(1);
    const gated = [
      ['POST', '/api/jobs', { company: 'A', role: 'B' }],
      ['POST', '/api/jobs/analyze-description', { jobDescription: 'x'.repeat(60) }],
      ['POST', '/api/jobs/generate-cover-letter', { jobDescription: 'x', companyName: 'A', position: 'B', yourName: 'C' }],
      ['GET', '/api/jobs/discover', undefined],
      ['POST', '/api/jobs/fit', { resumeText: 'a', jobDescription: 'b' }],
      ['POST', '/api/jobs/achievement-enhancer/enhance', { achievement: 'x' }],
    ];
    for (const [method, path, body] of gated) {
      const res = await call(method, path, body);
      expect([method, path, res.status]).toEqual([method, path, 403]);
      expect((await res.json()).code).toBe('PLAN_UPGRADE_REQUIRED');
    }
    expect((await call('GET', '/api/jobs')).status).toBe(200);
    expect(overrides.aiClient.calls).toHaveLength(0); // no AI spend for a blocked plan
  });

  it('with the REAL infra aiClient (only the provider fetch is stubbed): model names flow from env vars through config.vars', async () => {
    const { call } = build(3, { realInfra: true, envOverrides: { LM_STUDIO_URL: 'http://lm.test/v1', LM_STUDIO_MODEL_JOB: 'job-model', LM_STUDIO_MODEL_RESUME: 'resume-model', LM_STUDIO_MODEL_FIT: 'fit-model' } });
    const reply = (content) => ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content } }] }) });
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
      const { model } = JSON.parse(init.body);
      if (model === 'job-model') return reply('{"requiredSkills":["Go"],"seniority":"Senior"}');
      if (model === 'fit-model') return reply('{"domainScore": 61, "seniorityScore": 72}');
      return reply('Cut deploy time by 40%.');
    });
    try {
      const analysis = await (await call('POST', '/api/jobs/analyze-description', { jobDescription: 'A backend Go role for a senior engineer. '.repeat(3) })).json();
      expect(analysis.data).toMatchObject({ requiredSkills: ['Go'], seniority: 'Senior' });

      const fit = await (await call('POST', '/api/jobs/fit', { resumeText: 'go developer', jobDescription: 'go role' })).json();
      expect(fit).toMatchObject({ method: 'llm', breakdown: { domain: 61, seniority: 72 } });

      const enhance = await (await call('POST', '/api/jobs/achievement-enhancer/enhance', { achievement: 'sped up deploys' })).json();
      expect(enhance.data).toMatchObject({ source: 'ai', bullets: ['Cut deploy time by 40%.'] });

      const seen = fetchSpy.mock.calls.map(([url, init]) => [url, JSON.parse(init.body).model]);
      expect(seen).toEqual([
        ['http://lm.test/v1/chat/completions', 'job-model'],
        ['http://lm.test/v1/chat/completions', 'fit-model'],
        ['http://lm.test/v1/chat/completions', 'resume-model'],
      ]);
      expect(fetchSpy.mock.contexts.every((c) => c === undefined)).toBe(true); // bare fetch calls (workerd needs that)
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
