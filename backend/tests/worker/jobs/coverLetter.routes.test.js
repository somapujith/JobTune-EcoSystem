'use strict';

/** routes/coverLetter.js (Worker): POST /api/jobs/generate-cover-letter, tier 2. */
const { makeJobsHarness } = require('./jobsHarness');

const PATH = '/api/jobs/generate-cover-letter';
const BODY = {
  jobDescription: 'Build things. '.repeat(60),
  companyName: 'Acme',
  position: 'Engineer',
  yourName: 'Sam Example',
  experience: '5 years of backend work',
};

describe('POST /api/jobs/generate-cover-letter (worker)', () => {
  beforeEach(() => jest.spyOn(console, 'error').mockImplementation(() => {}));
  afterEach(() => jest.restoreAllMocks());

  it('401 without a token', async () => {
    const H = makeJobsHarness();
    expect((await H.call('POST', PATH, BODY, { auth: false })).status).toBe(401);
    expect(H.fakes.aiClient.calls).toHaveLength(0);
  });

  it('tier 1 -> 403 PLAN_UPGRADE_REQUIRED naming tier 2 as required; AI not called', async () => {
    const H = makeJobsHarness({ tier: 1 });
    const res = await H.call('POST', PATH, BODY);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({
      error: 'This feature requires a higher subscription plan.',
      code: 'PLAN_UPGRADE_REQUIRED',
      requiredPlan: 'Tune & Polish',
      currentPlan: 'Learn & Build',
    });
    expect(H.fakes.aiClient.calls).toHaveLength(0);
  });

  it.each([[2], [3]])('tier %i (>= threshold 2) is allowed', async (tier) => {
    const H = makeJobsHarness({ tier });
    expect((await H.call('POST', PATH, BODY)).status).toBe(200);
  });

  it.each(['jobDescription', 'companyName', 'position', 'yourName'])('missing %s -> 400', async (field) => {
    const H = makeJobsHarness();
    const body = { ...BODY };
    delete body[field];
    const res = await H.call('POST', PATH, body);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Company name, position, job description, and your name are required' });
    expect(H.fakes.aiClient.calls).toHaveLength(0);
  });

  it('AI success: trimmed text and an ISO generatedAt', async () => {
    const H = makeJobsHarness();
    H.fakes.aiClient.reply = { ok: true, data: '  Dear team,\n\nHello.  \n' };
    const res = await H.call('POST', PATH, BODY);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.letterText).toBe('Dear team,\n\nHello.');
    expect(json.data.generatedAt).toBe(new Date(json.data.generatedAt).toISOString());
    expect(Object.keys(json.data)).toEqual(['letterText', 'generatedAt']);
  });

  it('prompt/limits: tone default "professional", job description cut to 500 chars, model chain JOB then RESUME', async () => {
    const H = makeJobsHarness({ envOverrides: { LM_STUDIO_MODEL_RESUME: 'resume-model' } });
    await H.call('POST', PATH, BODY);
    const [opts] = H.fakes.aiClient.calls;
    expect(opts).toMatchObject({ maxTokens: 800, temperature: 0.7, model: 'resume-model' });
    expect(opts.userPrompt.startsWith('Write a professional cover letter for:\n- Candidate name: Sam Example\n- Company: Acme\n- Position: Engineer\n- My background: 5 years of backend work\n- Job requirements: ')).toBe(true);
    expect(opts.userPrompt).toContain(BODY.jobDescription.substring(0, 500) + '\n\nWrite the cover letter directly');
    expect(opts.userPrompt).not.toContain(BODY.jobDescription.substring(0, 501));
    expect(opts.systemPrompt.startsWith('You are an elite cover letter strategist')).toBe(true);

    const H2 = makeJobsHarness({ envOverrides: { LM_STUDIO_MODEL_JOB: 'job-model', LM_STUDIO_MODEL_RESUME: 'resume-model' } });
    await H2.call('POST', PATH, { ...BODY, tone: 'friendly' });
    expect(H2.fakes.aiClient.calls[0].model).toBe('job-model');
    expect(H2.fakes.aiClient.calls[0].userPrompt.startsWith('Write a friendly cover letter for:')).toBe(true);
  });

  it('AI down -> the fixed fallback letter (and an omitted experience is the text "undefined")', async () => {
    const H = makeJobsHarness();
    const { experience, ...noExperience } = BODY;
    const res = await H.call('POST', PATH, noExperience);
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.letterText.startsWith('Dear Hiring Manager,\n\nI am writing to express my strong interest in the Engineer position at Acme. With my undefined, I am confident')).toBe(true);
    expect(data.letterText.endsWith('Sincerely,\n[Your Name]')).toBe(true);
    expect(H.fakes.aiClient.calls[0].userPrompt).toContain('- My background: undefined');
  });

  it('AI returns an empty string -> fallback letter as well (falsy data)', async () => {
    const H = makeJobsHarness();
    H.fakes.aiClient.reply = { ok: true, data: '' };
    const { data } = await (await H.call('POST', PATH, BODY)).json();
    expect(data.letterText.startsWith('Dear Hiring Manager,')).toBe(true);
  });

  it('no JSON body -> 500 "Failed to generate cover letter" (body read is inside the try block)', async () => {
    const H = makeJobsHarness();
    const res = await H.call('POST', PATH, undefined);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Failed to generate cover letter' });
  });

  it('throwing AI client -> the same 500', async () => {
    const H = makeJobsHarness();
    H.fakes.aiClient.reply = new Error('boom');
    const res = await H.call('POST', PATH, BODY);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Failed to generate cover letter' });
  });
});
