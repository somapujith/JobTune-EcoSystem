'use strict';

/**
 * The infra registry: what other slices code against (`getServices(c).<name>`), resolved through the real
 * createServices container, and the aiClient contract end to end (registry -> config -> stubbed fetch).
 */
const { createServices, REGISTRY } = require('../../../src/worker/services');
const infraRegistry = require('../../../src/worker/services/registry/infra');
const { createConfig } = require('../../../src/worker/config');
const { getIsolateAiCache, AICache } = require('../../../src/worker/services/aiCache');
const { makeEnv, makeCtx, makeHarness, createFakeDb } = require('../helpers/harness');
const { createApp } = require('../../../src/worker/app');
const { createRouter, mountRoutes } = require('../../../src/worker/lib/routes');
const { getServices } = require('../../../src/worker/lib/context');
const expressAiClient = require('../../../src/utils/aiClient');
const expressEmbeddings = require('../../../src/utils/embeddings');
const expressApiResponse = require('../../../src/utils/apiResponse');
const { lmOk, geminiOk, stubFetch } = require('./helpers');

const V2_KEYS = [
  'actionVerbAnalyzer', 'certificationAnalyzer', 'contactValidator', 'educationAnalyzer', 'experienceAnalyzer',
  'formattingAnalyzer', 'metricsAnalyzer', 'missingInfoEngine', 'projectAnalyzer', 'readabilityAnalyzer',
  'resumeAnalysisEngine', 'resumeCriticEngine', 'roleDetectionEngine', 'sectionAnalyzer', 'skillsAnalyzer',
];
const SERVICE_KEYS = ['aiCache', 'aiClient', 'embeddings', 'apiResponse', 'onetLoader', ...V2_KEYS];

const config = () => createConfig(makeEnv());
const container = (over = {}) => createServices({ db: { query: jest.fn() }, config: config(), ...over });

describe('infra registry', () => {
  it('registers exactly the infra services, and they reach the global REGISTRY', () => {
    expect(Object.keys(infraRegistry).sort()).toEqual([...SERVICE_KEYS].sort());
    for (const k of SERVICE_KEYS) expect(REGISTRY).toHaveProperty(k);
  });

  it('does not use a key that another slice or the foundation owns (no accidental override)', () => {
    const others = ['sessionService', 'planService'];
    for (const k of others) expect(Object.keys(infraRegistry)).not.toContain(k);
  });

  it('services are lazy and cached per request container', () => {
    const s = container();
    expect(s.aiClient).toBe(s.aiClient);
    expect(s.embeddings).toBe(s.embeddings);
    expect(container().aiClient).not.toBe(s.aiClient);
  });

  it('aiClient: same exported function names as utils/aiClient.js', () => {
    const client = container().aiClient;
    expect(Object.keys(client).sort()).toEqual(Object.keys(expressAiClient).sort());
    expect(Object.keys(client).sort()).toEqual(['callAI', 'extractJSON', 'getAICacheStats', 'isReasoningModel', 'modelForStructuredJson']);
  });

  it('embeddings: same exported names as utils/embeddings.js', () => {
    expect(Object.keys(container().embeddings).sort()).toEqual(Object.keys(expressEmbeddings).sort());
  });

  it('apiResponse: same helper names as utils/apiResponse.js', () => {
    expect(Object.keys(container().apiResponse).sort()).toEqual(Object.keys(expressApiResponse).sort());
  });

  it('onetLoader: same exported names as services/taxonomy/onetLoader', () => {
    expect(Object.keys(container().onetLoader).sort()).toEqual(['findOccupation', 'getDomain', 'loadONET']);
  });

  it.each(V2_KEYS)('%s is the analyzer class itself (static API preserved)', (key) => {
    const svc = container()[key];
    expect(typeof svc).toBe('function');
    expect(svc.name.toLowerCase()).toBe(key.toLowerCase());
    expect(svc).toBe(require(`../../../src/worker/services/v2/${key}`));
  });

  it('aiCache is the per-isolate cache: two request containers see the same entries', () => {
    getIsolateAiCache().clear();
    const a = container();
    const b = container();
    expect(a.aiCache).toBe(b.aiCache);
    a.aiCache.set('s', 'u', 1, 0, 'v');
    expect(b.aiCache.get('s', 'u', 1, 0)).toBe('v');
    getIsolateAiCache().clear();
  });

  it('aiClient uses the container aiCache (override honoured)', async () => {
    const own = new AICache();
    const s = container({ overrides: { aiCache: own } });
    const fetchMock = stubFetch([lmOk('answer')]);
    jest.spyOn(console, 'log').mockImplementation(() => {});
    try {
      await s.aiClient.callAI({ systemPrompt: 'a', userPrompt: 'b' });
      expect(own.getStats().size).toBe(1);
      expect(s.aiClient.getAICacheStats()).toEqual(own.getStats());
    } finally {
      fetchMock.restore();
      jest.restoreAllMocks();
    }
  });

  it('a slice can replace aiClient with a fake via overrides (how other slices test their routes)', async () => {
    const fake = { callAI: jest.fn().mockResolvedValue({ ok: true, error: null, data: 'stub' }), extractJSON: jest.fn() };
    const app = createApp({
      dbFactory: () => createFakeDb(),
      servicesFactory: ({ db, config: cfg }) => createServices({ db, config: cfg, overrides: { aiClient: fake } }),
    });
    const router = createRouter();
    router.get('/ai', async (c) => c.json(await getServices(c).aiClient.callAI({ systemPrompt: 's', userPrompt: 'u' })));
    mountRoutes(app, '/api/_infra', router);
    const res = await app.request('/api/_infra/ai', {}, makeEnv(), makeCtx());
    expect(await res.json()).toEqual({ ok: true, error: null, data: 'stub' });
    expect(fake.callAI).toHaveBeenCalledTimes(1);
  });

  describe('end to end through a mounted route (registry -> config.vars -> stubbed fetch)', () => {
    let fetchMock;
    beforeEach(() => {
      getIsolateAiCache().clear();
      jest.spyOn(console, 'error').mockImplementation(() => {});
      jest.spyOn(console, 'log').mockImplementation(() => {});
    });
    afterEach(() => {
      if (fetchMock) fetchMock.restore();
      fetchMock = undefined;
      getIsolateAiCache().clear();
      jest.restoreAllMocks();
    });

    const harnessFor = (env) =>
      makeHarness({
        env,
        configureApp: (app) => {
          const router = createRouter();
          router.post('/ask', async (c) => {
            const { aiClient } = getServices(c);
            const r = await aiClient.callAI({ systemPrompt: 'Be brief', userPrompt: 'Hello', maxTokens: 64 });
            return c.json(r);
          });
          mountRoutes(app, '/api/_infra', router);
        },
      });

    it('routes through Gemini when the Worker env selects it, and a second identical request is a per-isolate cache hit', async () => {
      fetchMock = stubFetch([geminiOk('from gemini')]);
      const H = harnessFor(makeEnv({ AI_PROVIDER: 'gemini', GEMINI_API_KEY: 'test-gemini-key', GEMINI_MODEL: 'gemini-test' }));
      const first = await (await H.request('/api/_infra/ask', { method: 'POST' })).json();
      const second = await (await H.request('/api/_infra/ask', { method: 'POST' })).json();
      expect(first).toEqual({ ok: true, error: null, data: 'from gemini' });
      expect(second).toEqual({ ok: true, error: null, data: 'from gemini', cached: true });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0][0]).toContain('models/gemini-test:generateContent?key=test-gemini-key');
      const health = await (await H.request('/api/health')).json();
      expect(health.aiCache).toMatchObject({ size: 1, hits: 1, misses: 1, hitRate: 50 });
    });

    it('MOCK_AI from the Worker env short-circuits without any fetch', async () => {
      jest.useFakeTimers();
      try {
        fetchMock = stubFetch([lmOk('no')]);
        const H = harnessFor(makeEnv({ MOCK_AI: 'true' }));
        const pending = H.request('/api/_infra/ask', { method: 'POST' });
        await jest.advanceTimersByTimeAsync(800);
        const body = await (await pending).json();
        expect(body).toMatchObject({ ok: true, error: null });
        expect(fetchMock).not.toHaveBeenCalled();
      } finally {
        jest.useRealTimers();
      }
    });
  });
});
