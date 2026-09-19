'use strict';

/** routes/jobFit.js (Worker): POST /api/jobs/fit, tier 3 (scorer logic is compared with Express in jobFit.scorer.test.js). */
const { makeJobsHarness } = require('./jobsHarness');

const PATH = '/api/jobs/fit';
const BODY = {
  resumeText: 'Senior Python and React developer, 6 years of experience with AWS and Docker.',
  jobDescription: 'We need a senior Python engineer with React, AWS and Kubernetes experience.',
};

describe('POST /api/jobs/fit (worker)', () => {
  beforeEach(() => jest.spyOn(console, 'error').mockImplementation(() => {}));
  afterEach(() => jest.restoreAllMocks());

  it('401 without a token', async () => {
    const H = makeJobsHarness();
    expect((await H.call('POST', PATH, BODY, { auth: false })).status).toBe(401);
  });

  it.each([[1, 'Learn & Build'], [2, 'Tune & Polish']])('tier %i -> 403 PLAN_UPGRADE_REQUIRED (requires tier 3); scorer not invoked', async (tier, name) => {
    const H = makeJobsHarness({ tier });
    const res = await H.call('POST', PATH, BODY);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({
      error: 'This feature requires a higher subscription plan.',
      code: 'PLAN_UPGRADE_REQUIRED',
      requiredPlan: 'Zero to Hero',
      currentPlan: name,
    });
    expect(H.fakes.aiClient.calls).toHaveLength(0);
  });

  it.each([{}, { resumeText: 'x' }, { jobDescription: 'y' }, { resumeText: '', jobDescription: 'y' }])(
    'validation %j -> 400 {success:false,error}',
    async (body) => {
      const H = makeJobsHarness();
      const res = await H.call('POST', PATH, body);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ success: false, error: 'Both resumeText and jobDescription are required' });
      expect(H.fakes.aiClient.calls).toHaveLength(0);
    }
  );

  it('AI down -> rule-based scoring; body is exactly {success,score,breakdown,method}', async () => {
    const H = makeJobsHarness(); // nullOnetLoader: no occupation recognised -> domain score 50
    const res = await H.call('POST', PATH, BODY);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(Object.keys(json)).toEqual(['success', 'score', 'breakdown', 'method']);
    expect(json.success).toBe(true);
    expect(json.method).toBe('rule');
    expect(json.breakdown.domain).toBe(50);
    expect(json.breakdown.seniority).toBe(100); // both texts say "senior"
    expect(json.score).toBe(Math.round(0.35 * 50 + 0.35 * 100 + 0.3 * json.breakdown.skills));
  });

  it('AI answers with JSON -> method "llm", scores clamped to 0..100, prompt limited to 300 chars each', async () => {
    const H = makeJobsHarness({ envOverrides: { LM_STUDIO_MODEL_FIT: 'fit-model' } });
    H.fakes.aiClient.reply = { ok: true, data: '```json\n{"domainScore": 80, "seniorityScore": 250}\n```' };
    const res = await H.call('POST', PATH, { resumeText: 'r'.repeat(400), jobDescription: 'j'.repeat(400) });
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.method).toBe('llm');
    expect(json.breakdown).toMatchObject({ domain: 80, seniority: 100 });
    expect(json.score).toBe(Math.round(0.35 * 80 + 0.35 * 100 + 0.3 * json.breakdown.skills));

    const [opts] = H.fakes.aiClient.calls;
    expect(opts).toMatchObject({ maxTokens: 500, temperature: 0.2, model: 'fit-model' });
    expect(opts.userPrompt).toBe(`RESUME SNIPPET (first 300 chars):\n${'r'.repeat(300)}\n\nJOB DESCRIPTION SNIPPET (first 300 chars):\n${'j'.repeat(300)}`);
    expect(opts.systemPrompt.startsWith('You are a job fit analyzer.')).toBe(true);
  });

  it('model falls back to "qwen2.5-7b" when LM_STUDIO_MODEL_FIT is unset', async () => {
    const H = makeJobsHarness();
    await H.call('POST', PATH, BODY);
    expect(H.fakes.aiClient.calls[0].model).toBe('qwen2.5-7b');
  });

  it.each([
    ['unparseable text', { ok: true, data: 'sorry, no json' }],
    ['ok:false', { ok: false, data: null }],
    ['empty data', { ok: true, data: '' }],
    ['a thrown provider error', new Error('network')],
  ])('LLM unusable (%s) -> falls back to rule scoring, still 200', async (_label, reply) => {
    const H = makeJobsHarness();
    H.fakes.aiClient.reply = reply;
    const res = await H.call('POST', PATH, BODY);
    expect(res.status).toBe(200);
    expect((await res.json()).method).toBe('rule');
  });

  it('no JSON body -> masked 500 (Express handed the TypeError to next(err))', async () => {
    const H = makeJobsHarness();
    const res = await H.call('POST', PATH, undefined);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal Server Error' });
  });

  it('non-string resumeText (number) reaches the scorer and fails there -> masked 500', async () => {
    const H = makeJobsHarness();
    const res = await H.call('POST', PATH, { resumeText: 5, jobDescription: 'x' });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal Server Error' });
  });

  it('a missing aiClient service fails loudly (500) instead of silently degrading to rule scoring', async () => {
    const H = makeJobsHarness({ fakes: { aiClient: undefined } });
    // fakes.aiClient is overridden with undefined by the spread, so services.aiClient is undefined
    const res = await H.call('POST', PATH, BODY);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal Server Error' });
  });
});
