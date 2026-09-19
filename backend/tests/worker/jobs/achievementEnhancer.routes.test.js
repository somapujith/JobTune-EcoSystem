'use strict';

/** routes/achievementEnhancer.js (Worker): POST /api/jobs/achievement-enhancer/enhance, tier 2. */
const { makeJobsHarness } = require('./jobsHarness');

const PATH = '/api/jobs/achievement-enhancer/enhance';

describe('POST /api/jobs/achievement-enhancer/enhance (worker)', () => {
  beforeEach(() => jest.spyOn(console, 'error').mockImplementation(() => {}));
  afterEach(() => jest.restoreAllMocks());

  it('401 without a token', async () => {
    const H = makeJobsHarness();
    expect((await H.call('POST', PATH, { achievement: 'x' }, { auth: false })).status).toBe(401);
    expect(H.fakes.aiClient.calls).toHaveLength(0);
  });

  it('tier 1 -> 403 PLAN_UPGRADE_REQUIRED requiring "Tune & Polish"', async () => {
    const H = makeJobsHarness({ tier: 1 });
    const res = await H.call('POST', PATH, { achievement: 'Created Attendance System' });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({
      error: 'This feature requires a higher subscription plan.',
      code: 'PLAN_UPGRADE_REQUIRED',
      requiredPlan: 'Tune & Polish',
      currentPlan: 'Learn & Build',
    });
    expect(H.fakes.aiClient.calls).toHaveLength(0);
  });

  it.each([[2], [3]])('tier %i is allowed', async (tier) => {
    const H = makeJobsHarness({ tier });
    expect((await H.call('POST', PATH, { achievement: 'Created Attendance System' })).status).toBe(200);
  });

  describe('input handling', () => {
    it.each([
      ['no body at all', undefined],
      ['empty object', {}],
      ['empty list', { achievements: [] }],
      ['whitespace only', { achievement: '   \n  ' }],
      ['non-string items', { achievements: [1, null, {}] }],
      ['wrong types', { achievement: 5, achievements: 7 }],
    ])('%s -> 400 "At least one achievement is required."', async (_label, body) => {
      const H = makeJobsHarness();
      const res = await H.call('POST', PATH, body);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'At least one achievement is required.' });
      expect(H.fakes.aiClient.calls).toHaveLength(0);
    });

    it('accepts achievements[] first, then newline-separated achievements, then achievement[] then achievement', async () => {
      const cases = [
        [{ achievements: ['a one', 'b two'], achievement: 'ignored' }, ['a one', 'b two']],
        [{ achievements: 'c three\nd four' }, ['c three', 'd four']],
        [{ achievement: ['e five'] }, ['e five']],
        [{ achievement: 'f six\n\ng seven' }, ['f six', 'g seven']],
      ];
      for (const [body, expected] of cases) {
        const H = makeJobsHarness();
        const res = await H.call('POST', PATH, body);
        const { data } = await res.json();
        expect(data.results.map((r) => r.original)).toEqual(expected);
      }
    });

    it('caps at 15 achievements of 500 characters each', async () => {
      const H = makeJobsHarness();
      const res = await H.call('POST', PATH, { achievements: Array.from({ length: 20 }, () => 'x'.repeat(600)) });
      const { data } = await res.json();
      expect(data.count).toBe(15);
      expect(data.results.every((r) => r.original.length === 500)).toBe(true);
    });

    it('roleHint: `role` wins over `roleHint`, trimmed and capped at 200 chars, null when absent', async () => {
      const H = makeJobsHarness();
      let json = await (await H.call('POST', PATH, { achievement: 'a b', role: '  Backend Dev  ', roleHint: 'ignored' })).json();
      expect(json.data.roleHint).toBe('Backend Dev');
      json = await (await H.call('POST', PATH, { achievement: 'a b', roleHint: 'r'.repeat(300) })).json();
      expect(json.data.roleHint).toBe('r'.repeat(200));
      json = await (await H.call('POST', PATH, { achievement: 'a b' })).json();
      expect(json.data.roleHint).toBeNull();
    });
  });

  describe('output', () => {
    it('AI down -> rule-based bullets, source "rule-based", body keys in the Express order', async () => {
      const H = makeJobsHarness();
      const res = await H.call('POST', PATH, { achievements: ['Created Attendance System', 'Reduced latency by 40%'] });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(Object.keys(json.data)).toEqual(['source', 'roleHint', 'count', 'results', 'bullets', 'generatedAt']);
      expect(json.data.source).toBe('rule-based');
      expect(json.data.count).toBe(2);
      expect(json.data.results[0]).toEqual({
        original: 'Created Attendance System',
        // 'created' is on the strong-verb list, so it is kept and only the first word of the object is lower-cased (Express behaviour)
        enhanced: 'Created attendance System, streamlining workflows and improving system reliability.',
        domain: 'software',
        hasMetrics: false,
      });
      expect(json.data.results[1]).toMatchObject({ original: 'Reduced latency by 40%', hasMetrics: true });
      expect(json.data.bullets).toEqual(json.data.results.map((r) => r.enhanced));
      expect(json.data.generatedAt).toBe(new Date(json.data.generatedAt).toISOString());
    });

    it('AI success: numbering/bullets stripped, extra lines dropped, source "ai"', async () => {
      const H = makeJobsHarness();
      H.fakes.aiClient.reply = { ok: true, data: '1. Built a scalable attendance platform.\n- Cut reporting time by half.\nextra line' };
      const res = await H.call('POST', PATH, { achievements: ['made attendance app', 'faster reports'], role: 'SWE' });
      const { data } = await res.json();
      expect(data.source).toBe('ai');
      expect(data.bullets).toEqual(['Built a scalable attendance platform.', 'Cut reporting time by half.']);

      const [opts] = H.fakes.aiClient.calls;
      expect(opts.userPrompt).toBe('The candidate\'s target role/context is: "SWE". Tailor phrasing accordingly.\nRewrite these achievements into resume bullets:\n1. made attendance app\n2. faster reports');
      expect(opts).toMatchObject({ maxTokens: 600, temperature: 0.6 });
      expect(opts.systemPrompt.startsWith('You are an expert resume writer.')).toBe(true);
    });

    it('AI returns too few lines -> distrusted, rule-based bullets used', async () => {
      const H = makeJobsHarness();
      H.fakes.aiClient.reply = { ok: true, data: 'only one line' };
      const { data } = await (await H.call('POST', PATH, { achievements: ['a b', 'c d'] })).json();
      expect(data.source).toBe('rule-based');
      expect(data.count).toBe(2);
    });

    it('model chain is RESUME then JOB (note: the reverse of the cover-letter order)', async () => {
      const H = makeJobsHarness({ envOverrides: { LM_STUDIO_MODEL_JOB: 'job-model', LM_STUDIO_MODEL_RESUME: 'resume-model' } });
      await H.call('POST', PATH, { achievement: 'a b' });
      expect(H.fakes.aiClient.calls[0].model).toBe('resume-model');

      const H2 = makeJobsHarness({ envOverrides: { LM_STUDIO_MODEL_JOB: 'job-model' } });
      await H2.call('POST', PATH, { achievement: 'a b' });
      expect(H2.fakes.aiClient.calls[0].model).toBe('job-model');
    });

    it('throwing AI client -> 500 "Failed to enhance achievements"', async () => {
      const H = makeJobsHarness();
      H.fakes.aiClient.reply = new Error('boom');
      const res = await H.call('POST', PATH, { achievement: 'a b' });
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: 'Failed to enhance achievements' });
    });
  });
});
