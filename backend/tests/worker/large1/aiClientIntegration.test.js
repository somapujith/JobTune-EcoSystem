'use strict';

/**
 * The routes talk to the infra-owned aiClient through getServices(c).aiClient. This suite runs them against the
 * REAL service from the registry (services/aiClient.js, per-request `createAiClient({config, aiCache})`) with only
 * the network stubbed (global fetch), to prove the wiring the other tests fake: config.vars model selection,
 * the callAI result shape, and the preserved community bug (callAI's whole result object goes to extractJSON).
 * Synthetic LM Studio URL and models; nothing leaves the process.
 */
const { makeLarge1 } = require('./helpers');

const LM = { LM_STUDIO_URL: 'http://lm.example.test/v1', LM_STUDIO_MODEL_PROJECT: 'proj-model', LM_STUDIO_MODEL: 'default-model' };

let fetchSpy;
let errSpy;
const chat = (content) => ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content } }] }), text: async () => '' });

beforeEach(() => {
  errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async () => chat('{}'));
});
afterEach(() => jest.restoreAllMocks());

const sent = (i = 0) => ({ url: fetchSpy.mock.calls[i][0], body: JSON.parse(fetchSpy.mock.calls[i][1].body) });

describe('real aiClient service', () => {
  it('project builder /generate: model comes from config.vars.LM_STUDIO_MODEL_PROJECT, AI JSON is used', async () => {
    const plan = { name: 'Integration Plan', techStack: { frontend: ['React'] } };
    fetchSpy.mockImplementation(async () => chat(JSON.stringify(plan)));
    const H = makeLarge1({ plan: 1, aiClient: null, envOverrides: LM });
    const res = await H.json('POST', '/api/project-builder/generate', { description: 'integration one' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ plan, aiPowered: true });
    const { url, body } = sent();
    expect(url).toBe('http://lm.example.test/v1/chat/completions');
    expect(body).toMatchObject({ model: 'proj-model', temperature: 0.5, max_tokens: 1200, stream: false });
    expect(body.messages[0].role).toBe('system');
  });

  it('project builder /readme: falls back to the default model var when the project model is unset', async () => {
    fetchSpy.mockImplementation(async () => chat('# From the real client'));
    const H = makeLarge1({ plan: 1, aiClient: null, envOverrides: { LM_STUDIO_URL: LM.LM_STUDIO_URL, LM_STUDIO_MODEL: 'default-model' } });
    const res = await H.json('POST', '/api/project-builder/readme', { projectPlan: { name: 'Integration README' } });
    expect(await res.json()).toEqual({ readme: '# From the real client', aiPowered: true });
    expect(sent().body.model).toBe('default-model');
  });

  it('project builder: a (non-retried 401) provider failure yields the built-in fallback plan and aiPowered false', async () => {
    fetchSpy.mockImplementation(async () => ({ ok: false, status: 401, text: async () => 'boom', json: async () => ({}) }));
    const H = makeLarge1({ plan: 1, aiClient: null, envOverrides: LM });
    const res = await H.json('POST', '/api/project-builder/generate', { description: 'integration two' });
    const body = await res.json();
    expect(body.aiPowered).toBe(false);
    expect(body.plan.name).toBe('Custom Project');
  });

  it('community /communication/email: valid AI JSON is STILL ignored (preserved bug) and the fallback comes back', async () => {
    fetchSpy.mockImplementation(async () => chat('{"overallScore": 97, "tone": {"score": 97, "feedback": "x"}}'));
    const H = makeLarge1({ plan: 2, aiClient: null, envOverrides: LM });
    const res = await H.json('POST', '/api/community/communication/email', { email: 'integration email body', subject: 'S' });
    expect(res.status).toBe(200);
    const { analysis } = await res.json();
    expect(analysis.overallScore).not.toBe(97);
    expect(analysis.improvedVersion).toMatch(/^Dear \[Recipient's Name\]/);
    // the provider WAS called (the answer is thrown away afterwards)
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(sent().body.max_tokens).toBe(1200);
    expect(errSpy.mock.calls.flat().join(' ')).toContain('Email analysis AI error: text.match is not a function');
  });
});
