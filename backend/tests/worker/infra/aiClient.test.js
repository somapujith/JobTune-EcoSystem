'use strict';

/**
 * services/aiClient.js against a STUBBED global fetch (no network, fake keys, no real provider).
 * Two layers:
 *   1. behaviour of the port on its own (provider selection, request shapes, retry/timeout logic, cache keying,
 *      MOCK_AI, config-only reads);
 *   2. a differential matrix that runs the ORIGINAL utils/aiClient.js (env from process.env) and the port
 *      (env from the injected config) through identical stubbed-fetch scenarios and requires identical results,
 *      identical outbound requests and identical retry delays.
 * Green here proves the ported logic against stubs. It does not prove real provider responses or workerd behaviour.
 */
const { createAiClient, extractJSON, isReasoningModel } = require('../../../src/worker/services/aiClient');
const { AICache } = require('../../../src/worker/services/aiCache');
const { createConfig } = require('../../../src/worker/config');
const { makeEnv } = require('../helpers/harness');
const ExpressAiCache = require('../../../src/utils/aiCache');
const expressAiClient = require('../../../src/utils/aiClient');
const { fakeResponse, geminiOk, anthropicOk, lmOk, stubFetch, describeCall, withProcessEnv, instantTimers } = require('./helpers');

const LM_DEFAULT = 'http://172.19.80.1:1234/v1';
const configFor = (vars = {}) => createConfig(makeEnv(vars));
const sleepStub = () => jest.fn(async () => {});

function build(vars = {}, extra = {}) {
  const sleep = sleepStub();
  const aiCache = new AICache();
  const client = createAiClient({ config: configFor(vars), aiCache, sleep, ...extra });
  return { client, sleep, aiCache };
}

const call = (client, overrides = {}) =>
  client.callAI({ systemPrompt: 'SYS', userPrompt: 'USER', ...overrides });

describe('services/aiClient (port of utils/aiClient.js)', () => {
  let fetchMock;
  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => {
    if (fetchMock) fetchMock.restore();
    fetchMock = undefined;
    jest.restoreAllMocks();
  });

  describe('exported API', () => {
    it('exposes exactly the same names as utils/aiClient.js', () => {
      const { client } = build();
      expect(Object.keys(client).sort()).toEqual(Object.keys(expressAiClient).sort());
      for (const k of Object.keys(expressAiClient)) expect(typeof client[k]).toBe('function');
    });

    it('methods are closures: safe to destructure', async () => {
      const { client } = build({ AI_PROVIDER: 'gemini', GEMINI_API_KEY: 'test-gemini-key' });
      fetchMock = stubFetch([geminiOk('hi')]);
      const { callAI, getAICacheStats } = client;
      expect((await callAI({ systemPrompt: 's', userPrompt: 'u' })).data).toBe('hi');
      expect(getAICacheStats().size).toBe(1);
    });
  });

  describe('provider selection (config.vars only)', () => {
    it('defaults to LM Studio at the Express default URL', async () => {
      fetchMock = stubFetch([lmOk('x')]);
      const { client } = build();
      await call(client);
      expect(fetchMock.mock.calls[0][0]).toBe(`${LM_DEFAULT}/chat/completions`);
    });

    it('uses LM_STUDIO_URL from config', async () => {
      fetchMock = stubFetch([lmOk('x')]);
      const { client } = build({ LM_STUDIO_URL: 'https://lm.example.test/v1' });
      await call(client);
      expect(fetchMock.mock.calls[0][0]).toBe('https://lm.example.test/v1/chat/completions');
    });

    it('gemini needs AI_PROVIDER=gemini AND a key (case-insensitive provider); otherwise LM Studio', async () => {
      fetchMock = stubFetch([lmOk('x'), geminiOk('g')]);
      await call(build({ AI_PROVIDER: 'gemini' }).client); // no key
      expect(fetchMock.mock.calls[0][0]).toContain('/chat/completions');
      await call(build({ AI_PROVIDER: 'GEMINI', GEMINI_API_KEY: 'test-gemini-key' }).client);
      expect(fetchMock.mock.calls[1][0]).toBe(
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=test-gemini-key'
      );
    });

    it('GEMINI_MODEL overrides the default model in the URL', async () => {
      fetchMock = stubFetch([geminiOk('g')]);
      await call(build({ AI_PROVIDER: 'gemini', GEMINI_API_KEY: 'k', GEMINI_MODEL: 'gemini-x' }).client);
      expect(fetchMock.mock.calls[0][0]).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-x:generateContent?key=k');
    });

    it('anthropic needs AI_PROVIDER=anthropic AND ANTHROPIC_API_KEY; another provider key does not count', async () => {
      fetchMock = stubFetch([lmOk('x'), anthropicOk('a')]);
      await call(build({ AI_PROVIDER: 'anthropic', GEMINI_API_KEY: 'k' }).client);
      expect(fetchMock.mock.calls[0][0]).toContain('/chat/completions');
      await call(build({ AI_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: 'test-anthropic-key' }).client);
      expect(fetchMock.mock.calls[1][0]).toBe('https://api.anthropic.com/v1/messages');
    });

    it('an unknown AI_PROVIDER falls back to LM Studio', async () => {
      fetchMock = stubFetch([lmOk('x')]);
      await call(build({ AI_PROVIDER: 'openai', ANTHROPIC_API_KEY: 'k', GEMINI_API_KEY: 'k' }).client);
      expect(fetchMock.mock.calls[0][0]).toContain('/chat/completions');
    });

    it('never reads the ambient process environment (only the injected config)', async () => {
      await withProcessEnv(
        { AI_PROVIDER: 'gemini', GEMINI_API_KEY: 'ambient-key', LM_STUDIO_URL: 'http://ambient.invalid/v1', MOCK_AI: 'true' },
        async () => {
          fetchMock = stubFetch([lmOk('x')]);
          const { client } = build(); // config has none of them
          const res = await call(client);
          expect(res.data).toBe('x');
          expect(fetchMock.mock.calls[0][0]).toBe(`${LM_DEFAULT}/chat/completions`);
        }
      );
    });
  });

  describe('request shapes', () => {
    it('Gemini: body, headers, 60 s timeout, default temperature/maxTokens', async () => {
      const timeout = jest.spyOn(AbortSignal, 'timeout');
      fetchMock = stubFetch([geminiOk('g')]);
      await call(build({ AI_PROVIDER: 'gemini', GEMINI_API_KEY: 'k' }).client);
      const [, init] = fetchMock.mock.calls[0];
      expect(init.method).toBe('POST');
      expect(init.headers).toEqual({ 'Content-Type': 'application/json' });
      expect(JSON.parse(init.body)).toEqual({
        contents: [{ role: 'user', parts: [{ text: 'USER' }] }],
        systemInstruction: { parts: [{ text: 'SYS' }] },
        generationConfig: { temperature: 0.4, maxOutputTokens: 1024 },
      });
      expect(timeout).toHaveBeenCalledWith(60000);
      expect(init.signal).toBeInstanceOf(AbortSignal);
    });

    it('Anthropic: body, headers, default model, 90 s timeout', async () => {
      const timeout = jest.spyOn(AbortSignal, 'timeout');
      fetchMock = stubFetch([anthropicOk('a')]);
      await call(build({ AI_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: 'test-anthropic-key' }).client, { maxTokens: 300, temperature: 0.9 });
      const [, init] = fetchMock.mock.calls[0];
      expect(init.headers).toEqual({
        'Content-Type': 'application/json',
        'x-api-key': 'test-anthropic-key',
        'anthropic-version': '2023-06-01',
      });
      expect(JSON.parse(init.body)).toEqual({
        model: 'claude-sonnet-4-6',
        max_tokens: 300,
        temperature: 0.9,
        system: 'SYS',
        messages: [{ role: 'user', content: 'USER' }],
      });
      expect(timeout).toHaveBeenCalledWith(90000);
    });

    it('Anthropic: ANTHROPIC_MODEL overrides the default', async () => {
      fetchMock = stubFetch([anthropicOk('a')]);
      await call(build({ AI_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: 'k', ANTHROPIC_MODEL: 'claude-x' }).client);
      expect(JSON.parse(fetchMock.mock.calls[0][1].body).model).toBe('claude-x');
    });

    it('LM Studio: body, 120 s timeout, default model', async () => {
      const timeout = jest.spyOn(AbortSignal, 'timeout');
      fetchMock = stubFetch([lmOk('l')]);
      await call(build().client);
      const [, init] = fetchMock.mock.calls[0];
      expect(JSON.parse(init.body)).toEqual({
        model: 'mistral-7b-instruct-v0.3',
        messages: [{ role: 'system', content: 'SYS' }, { role: 'user', content: 'USER' }],
        max_tokens: 1024,
        temperature: 0.4,
        stream: false,
      });
      expect(timeout).toHaveBeenCalledWith(120000);
    });

    it('LM Studio model precedence: explicit model > LM_STUDIO_MODEL > default', async () => {
      fetchMock = stubFetch([lmOk('l')]);
      await call(build({ LM_STUDIO_MODEL: 'env-model' }).client, { model: 'route-model' });
      await call(build({ LM_STUDIO_MODEL: 'env-model' }).client);
      expect(JSON.parse(fetchMock.mock.calls[0][1].body).model).toBe('route-model');
      expect(JSON.parse(fetchMock.mock.calls[1][1].body).model).toBe('env-model');
    });

    it('per-purpose model names are resolved by the caller from config.vars and passed through as `model`', async () => {
      const config = configFor({ LM_STUDIO_MODEL_TUTOR: 'tutor-model', LM_STUDIO_MODEL_RESUME: 'resume-model' });
      fetchMock = stubFetch([lmOk('l')]);
      const client = createAiClient({ config, aiCache: new AICache(), sleep: sleepStub() });
      await client.callAI({ systemPrompt: 's', userPrompt: 'u', model: config.vars.LM_STUDIO_MODEL_TUTOR });
      expect(JSON.parse(fetchMock.mock.calls[0][1].body).model).toBe('tutor-model');
    });

    it('structuredJson caps max_tokens at 1200, but only ever lowers it', async () => {
      fetchMock = stubFetch([lmOk('l')]);
      await call(build().client, { structuredJson: true, maxTokens: 4000 });
      await call(build().client, { structuredJson: true, maxTokens: 500 });
      await call(build().client, { structuredJson: false, maxTokens: 4000 });
      expect(fetchMock.mock.calls.map(([, i]) => JSON.parse(i.body).max_tokens)).toEqual([1200, 500, 4000]);
    });

    it('structuredJson swaps a reasoning model for LM_STUDIO_MODEL_RESUME > _JOB > LM_STUDIO_MODEL > mistral', async () => {
      const cases = [
        [{ LM_STUDIO_MODEL_RESUME: 'r', LM_STUDIO_MODEL_JOB: 'j', LM_STUDIO_MODEL: 'm' }, 'r'],
        [{ LM_STUDIO_MODEL_JOB: 'j', LM_STUDIO_MODEL: 'm' }, 'j'],
        [{ LM_STUDIO_MODEL: 'm' }, 'm'],
        [{}, 'mistralai/mistral-7b-instruct-v0.3'],
      ];
      for (const [vars, expected] of cases) {
        fetchMock = stubFetch([lmOk('l')]);
        await call(build(vars).client, { structuredJson: true, model: 'deepseek-r1-distill-qwen' });
        expect(JSON.parse(fetchMock.mock.calls[0][1].body).model).toBe(expected);
        fetchMock.restore();
      }
      expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('Reasoning model "deepseek-r1-distill-qwen"'));
    });

    it('a reasoning model is kept when the call is not structuredJson', async () => {
      fetchMock = stubFetch([lmOk('l')]);
      await call(build().client, { model: 'qwq-32b' });
      expect(JSON.parse(fetchMock.mock.calls[0][1].body).model).toBe('qwq-32b');
    });

    it('modelForStructuredJson: keeps a non-reasoning preferred model, else the fallback chain', () => {
      const { client } = build({ LM_STUDIO_MODEL_JOB: 'job-model' });
      expect(client.modelForStructuredJson('good-model')).toBe('good-model');
      expect(client.modelForStructuredJson('qwq-32b')).toBe('job-model');
      expect(client.modelForStructuredJson(null)).toBe('job-model');
      expect(build().client.modelForStructuredJson(undefined)).toBe('mistralai/mistral-7b-instruct-v0.3');
    });
  });

  describe('response handling and error strings', () => {
    it('Gemini: non-ok -> error with status and body text; empty content; connection error', async () => {
      const vars = { AI_PROVIDER: 'gemini', GEMINI_API_KEY: 'k' };
      fetchMock = stubFetch([fakeResponse({ status: 401, text: 'bad key' })]);
      expect(await call(build(vars).client)).toEqual({ ok: false, error: 'Gemini API error 401: bad key', data: null });
      fetchMock.restore();
      fetchMock = stubFetch([fakeResponse({ json: { candidates: [] } })]);
      const empty = await call(build(vars).client);
      expect(empty).toEqual({ ok: false, error: 'Empty Gemini response', data: null });
      expect(fetchMock).toHaveBeenCalledTimes(3); // 'Empty ...' has no 4xx code: retried up to 3 attempts
      fetchMock.restore();
      fetchMock = stubFetch([new Error('socket hang up')]);
      expect(await call(build(vars).client)).toEqual({ ok: false, error: 'Gemini error: socket hang up', data: null });
    });

    it('Anthropic: non-ok, empty content, connection error', async () => {
      const vars = { AI_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: 'k' };
      fetchMock = stubFetch([fakeResponse({ status: 403, text: 'forbidden' })]);
      expect(await call(build(vars).client)).toEqual({ ok: false, error: 'Anthropic API error 403: forbidden', data: null });
      fetchMock.restore();
      fetchMock = stubFetch([fakeResponse({ json: { content: [] } })]);
      expect((await call(build(vars).client)).error).toBe('Empty Anthropic response');
      fetchMock.restore();
      fetchMock = stubFetch([new Error('boom')]);
      expect((await call(build(vars).client)).error).toBe('Anthropic error: boom');
    });

    it('Anthropic: a non-Error rejection is stringified', async () => {
      fetchMock = stubFetch([() => Promise.reject('plain string failure')]);
      const res = await call(build({ AI_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: 'k' }).client);
      expect(res.error).toBe('Anthropic error: plain string failure');
    });

    it('LM Studio: non-ok generic, context-limit text, empty content, connection error', async () => {
      fetchMock = stubFetch([fakeResponse({ status: 503, text: 'overloaded' })]);
      expect((await call(build().client)).error).toBe(`LM Studio API error 503. Check server is running at ${LM_DEFAULT}`);
      fetchMock.restore();
      fetchMock = stubFetch([fakeResponse({ status: 500, text: 'Context size has been exceeded' })]);
      expect((await call(build().client)).error).toBe('LM Studio context limit exceeded. Try a smaller prompt or use a non-reasoning model.');
      fetchMock.restore();
      fetchMock = stubFetch([fakeResponse({ json: { choices: [] } })]);
      expect((await call(build().client)).error).toBe('Empty LM Studio response');
      fetchMock.restore();
      fetchMock = stubFetch([new Error('connect ECONNREFUSED')]);
      expect((await call(build({ LM_STUDIO_URL: 'http://lm.test/v1' }).client)).error).toBe(
        'Cannot connect to LM Studio at http://lm.test/v1. Ensure LM Studio is running and accessible.'
      );
      fetchMock.restore();
      fetchMock = stubFetch([new Error('Channel Error')]);
      expect((await call(build().client)).error).toBe('LM Studio context limit exceeded. Try a smaller prompt or use a non-reasoning model.');
    });

    it('LM Studio 400 that mentions the system role retries once with a merged user prompt', async () => {
      fetchMock = stubFetch([fakeResponse({ status: 400, text: 'System role not supported by this template' }), lmOk('merged ok')]);
      const res = await call(build().client);
      expect(res).toEqual({ ok: true, error: null, data: 'merged ok' });
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(JSON.parse(fetchMock.mock.calls[1][1].body).messages).toEqual([
        { role: 'user', content: '[System Instructions]\nSYS\n\n[User Input]\nUSER' },
      ]);
    });

    it('a failing merged retry reports the retry status', async () => {
      fetchMock = stubFetch([fakeResponse({ status: 400, text: 'invalid role' }), fakeResponse({ status: 422, text: 'nope' })]);
      const { client, sleep } = build();
      const res = await call(client);
      expect(res.error).toBe('LM Studio API retry error 422.');
      expect(res.ok).toBe(false);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(sleep).not.toHaveBeenCalled(); // the retry error text carries a 4xx code -> the outer loop stops
    });

    it('a 400 that does not mention role/system/template is a plain error, and the loop stops', async () => {
      fetchMock = stubFetch([fakeResponse({ status: 400, text: 'malformed' })]);
      const { client, sleep } = build();
      const res = await call(client);
      expect(res.error).toBe(`LM Studio API error 400. Check server is running at ${LM_DEFAULT}`);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(sleep).not.toHaveBeenCalled();
    });
  });

  describe('retry logic', () => {
    it('makes 3 attempts with 1000 ms then 2000 ms back-off, and returns the last error', async () => {
      fetchMock = stubFetch([
        fakeResponse({ status: 500, text: 'e1' }),
        fakeResponse({ status: 502, text: 'e2' }),
        fakeResponse({ status: 503, text: 'e3' }),
      ]);
      const { client, sleep } = build();
      const res = await call(client);
      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(sleep.mock.calls.map((a) => a[0])).toEqual([1000, 2000]);
      expect(res).toEqual({ ok: false, error: `LM Studio API error 503. Check server is running at ${LM_DEFAULT}`, data: null });
    });

    it('stops at once on an error text containing 400/401/403/422 (matched anywhere in the text)', async () => {
      for (const code of ['401', '403', '422']) {
        fetchMock = stubFetch([fakeResponse({ status: Number(code), text: 'no' })]);
        const { client, sleep } = build({ AI_PROVIDER: 'gemini', GEMINI_API_KEY: 'k' });
        await call(client);
        expect([code, fetchMock.mock.calls.length, sleep.mock.calls.length]).toEqual([code, 1, 0]);
        fetchMock.restore();
      }
      // preserved quirk: a 500 whose body text happens to contain "400" is not retried
      fetchMock = stubFetch([fakeResponse({ status: 500, text: 'quota 400 exceeded' })]);
      const { client } = build({ AI_PROVIDER: 'gemini', GEMINI_API_KEY: 'k' });
      await call(client);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('returns as soon as a retry succeeds and caches that result', async () => {
      fetchMock = stubFetch([fakeResponse({ status: 500, text: 'flaky' }), lmOk('second time lucky')]);
      const { client, sleep, aiCache } = build();
      const res = await call(client);
      expect(res).toEqual({ ok: true, error: null, data: 'second time lucky' });
      expect(sleep.mock.calls.map((a) => a[0])).toEqual([1000]);
      expect(aiCache.getStats().size).toBe(1);
    });

    it('uses a real timer by default (awaited inside the request) when no sleep is injected', async () => {
      const timers = instantTimers();
      try {
        fetchMock = stubFetch([fakeResponse({ status: 500, text: 'x' }), lmOk('ok')]);
        const client = createAiClient({ config: configFor(), aiCache: new AICache() });
        expect((await call(client)).ok).toBe(true);
        expect(timers.delays).toEqual([1000]);
      } finally {
        timers.restore();
      }
    });
  });

  describe('cache keying and behaviour', () => {
    it('serves a repeat from the cache with cached:true and no second fetch', async () => {
      fetchMock = stubFetch([lmOk('first')]);
      const { client } = build();
      expect(await call(client)).toEqual({ ok: true, error: null, data: 'first' });
      expect(await call(client)).toEqual({ ok: true, error: null, data: 'first', cached: true });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('cache:false skips both the lookup and the store', async () => {
      fetchMock = stubFetch([lmOk('one'), lmOk('two')]);
      const { client, aiCache } = build();
      await call(client, { cache: false });
      const second = await call(client, { cache: false });
      expect(second.data).toBe('two');
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(aiCache.getStats()).toEqual({ size: 0, hits: 0, misses: 0, hitRate: 0 });
    });

    it('the key is (system, user, maxTokens, temperature): model and structuredJson do not partition it', async () => {
      fetchMock = stubFetch([lmOk('a'), lmOk('b')]);
      const { client } = build();
      await call(client, { model: 'model-a' });
      const hit = await call(client, { model: 'model-b', structuredJson: true });
      expect(hit.cached).toBe(true);
      const missTokens = await call(client, { maxTokens: 999 });
      const missTemp = await call(client, { temperature: 0.9 });
      expect(missTokens.cached).toBeUndefined();
      expect(missTemp.cached).toBeUndefined();
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it('failures are not cached', async () => {
      fetchMock = stubFetch([fakeResponse({ status: 401, text: 'no' }), lmOk('now fine')]);
      const { client } = build();
      expect((await call(client)).ok).toBe(false);
      expect((await call(client)).data).toBe('now fine');
    });

    it('getAICacheStats reports the injected cache', async () => {
      fetchMock = stubFetch([lmOk('v')]);
      const { client } = build();
      await call(client);
      await call(client);
      expect(client.getAICacheStats()).toEqual({ size: 1, hits: 1, misses: 1, hitRate: 50 });
    });

    it('two clients built for different requests share the isolate cache by default', async () => {
      const { getIsolateAiCache } = require('../../../src/worker/services/aiCache');
      getIsolateAiCache().clear();
      fetchMock = stubFetch([lmOk('shared')]);
      const a = createAiClient({ config: configFor(), sleep: sleepStub() });
      const b = createAiClient({ config: configFor(), sleep: sleepStub() });
      await call(a);
      expect((await call(b)).cached).toBe(true);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      getIsolateAiCache().clear();
    });
  });

  describe('MOCK_AI', () => {
    it("only the exact string 'true' enables mock mode", async () => {
      fetchMock = stubFetch([lmOk('real')]);
      for (const value of ['TRUE', '1', 'yes', undefined]) {
        const { client } = build({ MOCK_AI: value });
        expect((await call(client, { cache: false })).data).toBe('real');
      }
    });

    it('mock mode waits 800 ms, never calls fetch or the cache, and picks canned text from the user prompt', async () => {
      fetchMock = stubFetch([lmOk('must not be used')]);
      const { client, sleep, aiCache } = build({ MOCK_AI: 'true' });
      const summary = await call(client, { userPrompt: 'Write my SUMMARY please' });
      const linkedin = await call(client, { userPrompt: 'improve linkedin' });
      const about = await call(client, { userPrompt: 'tell me about it' });
      const other = await call(client, { userPrompt: 'hello' });
      expect(summary.data).toMatch(/^### Optimized Professional Summary \(Mock\)/);
      expect(linkedin.data).toMatch(/^### LinkedIn About Section \(Mock\)/);
      expect(about.data).toBe(linkedin.data);
      expect(other.data).toBe("I'm currently in mock mode. Switch MOCK_AI=false in .env to use real AI models.");
      for (const r of [summary, linkedin, about, other]) expect(r).toMatchObject({ ok: true, error: null });
      expect(sleep.mock.calls.map((a) => a[0])).toEqual([800, 800, 800, 800]);
      expect(fetchMock).not.toHaveBeenCalled();
      expect(aiCache.getStats().misses).toBe(0);
    });

    it('summary wins over linkedin/about when several keywords appear', async () => {
      const { client } = build({ MOCK_AI: 'true' });
      expect((await call(client, { userPrompt: 'linkedin summary about me' })).data).toMatch(/Professional Summary/);
    });
  });

  describe('extractJSON and isReasoningModel (pure helpers)', () => {
    const samples = [
      '{"a":1}',
      '```json\n{"a":[1,2]}\n```',
      '```\n[1,2,3]\n```',
      'Sure! Here you go: {"x": {"y": 2}} hope that helps',
      'list: [1, 2] trailing',
      'no json here',
      '{broken',
      '```json\n{bad json}\n```',
      '   \n {"padded": true} \n',
      '',
    ];

    it('matches the original on every sample', () => {
      for (const s of samples) expect([s, extractJSON(s)]).toEqual([s, expressAiClient.extractJSON(s)]);
      const { client } = build();
      for (const s of samples) expect(client.extractJSON(s)).toEqual(expressAiClient.extractJSON(s));
    });

    it('isReasoningModel matches the original', () => {
      for (const m of ['qwq-32b', 'DeepSeek-R1', 'r1-distill-x', 'my-reasoning-model', 'mistral-7b', '', null, undefined]) {
        expect([m, isReasoningModel(m)]).toEqual([m, expressAiClient.isReasoningModel(m)]);
      }
    });
  });
});

// ---------------------------------------------------------------------------------------------------------
// Differential: original (process.env) vs port (injected config), identical stubbed fetch scenarios.
// ---------------------------------------------------------------------------------------------------------
describe('differential: services/aiClient vs utils/aiClient.js', () => {
  const ENV_KEYS = [
    'AI_PROVIDER', 'ANTHROPIC_API_KEY', 'ANTHROPIC_MODEL', 'GEMINI_API_KEY', 'GEMINI_MODEL', 'LM_STUDIO_URL',
    'LM_STUDIO_MODEL', 'LM_STUDIO_MODEL_RESUME', 'LM_STUDIO_MODEL_JOB', 'MOCK_AI',
  ];
  const err500 = (t = 'server error') => fakeResponse({ status: 500, text: t });
  const gem = { AI_PROVIDER: 'gemini', GEMINI_API_KEY: 'test-gemini-key' };
  const ant = { AI_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: 'test-anthropic-key' };
  const one = { systemPrompt: 'You are a coach.', userPrompt: 'Improve my resume summary' };

  const scenarios = [
    ['lm ok', {}, [one], () => [lmOk('lm answer')]],
    ['lm 500 x3', {}, [one], () => [err500('a'), err500('b'), err500('c')]],
    ['lm 400 role then ok', {}, [one], () => [fakeResponse({ status: 400, text: 'system role rejected' }), lmOk('merged')]],
    ['lm 400 role then 500', {}, [one], () => [fakeResponse({ status: 400, text: 'template error' }), err500('again')]],
    ['lm context text', {}, [one], () => [fakeResponse({ status: 500, text: 'context length exceeded' })]],
    ['lm network error', { LM_STUDIO_URL: 'http://lm.test/v1' }, [one], () => [new Error('fetch failed')]],
    ['lm empty content', {}, [one], () => [fakeResponse({ json: { choices: [{ message: {} }] } })]],
    [
      'lm structuredJson reasoning swap',
      { LM_STUDIO_MODEL_JOB: 'job-model', LM_STUDIO_MODEL: 'base' },
      [{ ...one, structuredJson: true, model: 'deepseek-r1-x', maxTokens: 4000 }],
      () => [lmOk('json')],
    ],
    ['lm model env + explicit model', { LM_STUDIO_MODEL: 'base' }, [{ ...one, model: 'explicit' }, { ...one, userPrompt: 'other' }], () => [lmOk('a'), lmOk('b')]],
    ['gemini ok', gem, [one], () => [geminiOk('gem answer')]],
    ['gemini 429 x3', gem, [one], () => [fakeResponse({ status: 429, text: 'rate' })]],
    ['gemini 401 stops', gem, [one], () => [fakeResponse({ status: 401, text: 'no' })]],
    ['gemini empty', gem, [one], () => [fakeResponse({ json: {} })]],
    ['gemini network error', gem, [one], () => [new Error('reset')]],
    ['gemini model override', { ...gem, GEMINI_MODEL: 'gemini-x' }, [{ ...one, maxTokens: 50, temperature: 0 }], () => [geminiOk('x')]],
    ['anthropic ok', ant, [one], () => [anthropicOk('claude answer')]],
    ['anthropic 500 then ok', ant, [one], () => [err500(), anthropicOk('later')]],
    ['anthropic 403 stops', ant, [one], () => [fakeResponse({ status: 403, text: 'forbidden' })]],
    ['anthropic empty', { ...ant, ANTHROPIC_MODEL: 'claude-x' }, [one], () => [fakeResponse({ json: {} })]],
    ['provider without key falls to lm', { AI_PROVIDER: 'gemini' }, [one], () => [lmOk('lm')]],
    ['cache: repeat hits, cache:false bypasses', {}, [one, one, { ...one, cache: false }], () => [lmOk('c1'), lmOk('c2')]],
    ['mock summary', { MOCK_AI: 'true' }, [{ ...one, userPrompt: 'a SUMMARY' }], () => [lmOk('unused')]],
    ['mock linkedin/about/other', { MOCK_AI: 'true' }, [{ ...one, userPrompt: 'LinkedIn' }, { ...one, userPrompt: 'about' }, { ...one, userPrompt: 'zzz' }], () => [lmOk('unused')]],
  ];

  let restoreEnvFetch;
  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => {
    if (restoreEnvFetch) restoreEnvFetch();
    jest.restoreAllMocks();
  });

  async function runOriginal(vars, calls, responses) {
    ExpressAiCache.clear();
    const fetchMock = stubFetch(responses());
    const timers = instantTimers();
    restoreEnvFetch = () => { timers.restore(); fetchMock.restore(); };
    const env = Object.fromEntries(ENV_KEYS.map((k) => [k, vars[k]]));
    const results = await withProcessEnv(env, async () => {
      const out = [];
      for (const args of calls) out.push(await expressAiClient.callAI(args));
      return out;
    });
    const observed = { results, calls: fetchMock.mock.calls.map(describeCall), delays: [...timers.delays], stats: expressAiClient.getAICacheStats() };
    restoreEnvFetch();
    restoreEnvFetch = undefined;
    return observed;
  }

  async function runPort(vars, calls, responses) {
    const fetchMock = stubFetch(responses());
    const timers = instantTimers();
    restoreEnvFetch = () => { timers.restore(); fetchMock.restore(); };
    const client = createAiClient({ config: configFor(vars), aiCache: new AICache() });
    const results = [];
    for (const args of calls) results.push(await client.callAI(args));
    const observed = { results, calls: fetchMock.mock.calls.map(describeCall), delays: [...timers.delays], stats: client.getAICacheStats() };
    restoreEnvFetch();
    restoreEnvFetch = undefined;
    return observed;
  }

  it.each(scenarios)('%s', async (_name, vars, calls, responses) => {
    const original = await runOriginal(vars, calls, responses);
    const port = await runPort(vars, calls, responses);
    expect(port).toEqual(original);
    expect(original.calls.length + original.results.length).toBeGreaterThan(0); // the scenario actually did something
  });
});
