'use strict';

/** routes/jobAnalyzer.js (Worker): POST /api/jobs/analyze-description, tier 3. */
const { makeJobsHarness } = require('./jobsHarness');

const DESC = 'We are hiring a Senior React and Node.js engineer with 5 years of experience. - Build APIs - Mentor juniors';
const PATH = '/api/jobs/analyze-description';

describe('POST /api/jobs/analyze-description (worker)', () => {
  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  it('401 without a token', async () => {
    const H = makeJobsHarness();
    const res = await H.call('POST', PATH, { jobDescription: DESC }, { auth: false });
    expect(res.status).toBe(401);
    expect(H.fakes.aiClient.calls).toHaveLength(0);
  });

  it.each([[1, 'Learn & Build'], [2, 'Tune & Polish']])('tier %i -> 403 PLAN_UPGRADE_REQUIRED (requires tier 3), AI not called', async (tier, name) => {
    const H = makeJobsHarness({ tier });
    const res = await H.call('POST', PATH, { jobDescription: DESC });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({
      error: 'This feature requires a higher subscription plan.',
      code: 'PLAN_UPGRADE_REQUIRED',
      requiredPlan: 'Zero to Hero',
      currentPlan: name,
    });
    expect(H.fakes.aiClient.calls).toHaveLength(0);
  });

  it('tier 3 is allowed', async () => {
    const H = makeJobsHarness({ tier: 3 });
    expect((await H.call('POST', PATH, { jobDescription: DESC })).status).toBe(200);
  });

  it.each([[{}], [{ jobDescription: '' }], [{ jobDescription: 'too short' }], [{ jobDescription: ' '.repeat(80) }], [{ jobDescription: 'x'.repeat(49) }]])(
    'validation %j -> 400 "at least 50 characters"',
    async (body) => {
      const H = makeJobsHarness();
      const res = await H.call('POST', PATH, body);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'Job description must be at least 50 characters' });
      expect(H.fakes.aiClient.calls).toHaveLength(0);
    }
  );

  it('exactly 50 characters is accepted', async () => {
    const H = makeJobsHarness();
    expect((await H.call('POST', PATH, { jobDescription: 'x'.repeat(50) })).status).toBe(200);
  });

  it('AI success: parsed JSON is normalised to the seven fields', async () => {
    const H = makeJobsHarness();
    H.fakes.aiClient.reply = {
      ok: true,
      data: JSON.stringify({ requiredSkills: ['React'], experienceLevel: '5+ years', extra: 'dropped' }),
    };
    const res = await H.call('POST', PATH, { jobDescription: DESC });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      success: true,
      data: {
        requiredSkills: ['React'],
        niceToHaveSkills: [],
        experienceLevel: '5+ years',
        seniority: 'Mid',
        keywords: [],
        responsibilities: [],
        salaryRange: 'Not specified',
      },
    });
  });

  it('calls the AI client with the ported prompt, limits and model chain (JOB, then SKILLS)', async () => {
    const H = makeJobsHarness({ envOverrides: { LM_STUDIO_MODEL_JOB: 'job-model', LM_STUDIO_MODEL_SKILLS: 'skills-model' } });
    await H.call('POST', PATH, { jobDescription: DESC });
    const [opts] = H.fakes.aiClient.calls;
    expect(opts).toMatchObject({ maxTokens: 500, temperature: 0.3, model: 'job-model' });
    expect(opts.systemPrompt).toBe('You are a job analysis expert. Extract structured information from job postings.\nReturn ONLY valid JSON, no markdown, no extra text.');
    expect(opts.userPrompt).toContain(`Analyze this job posting and extract key information:\n\n${DESC}\n\nReturn ONLY this JSON structure`);

    const H2 = makeJobsHarness({ envOverrides: { LM_STUDIO_MODEL_SKILLS: 'skills-model' } });
    await H2.call('POST', PATH, { jobDescription: DESC });
    expect(H2.fakes.aiClient.calls[0].model).toBe('skills-model');

    const H3 = makeJobsHarness();
    await H3.call('POST', PATH, { jobDescription: DESC });
    expect(H3.fakes.aiClient.calls[0].model).toBeUndefined();
  });

  it('AI down (ok:false) -> rule-based fallback analysis', async () => {
    const H = makeJobsHarness();
    const res = await H.call('POST', PATH, { jobDescription: DESC });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      success: true,
      data: {
        requiredSkills: ['React', 'Node.js'],
        niceToHaveSkills: [],
        experienceLevel: '5 years',
        seniority: 'Senior',
        keywords: ['React', 'Node.js', 'Senior', 'Problem Solving'],
        // the bullet regex is greedy up to the next bullet glyph/newline, so "- Mentor juniors" stays attached
        responsibilities: ['Build APIs - Mentor juniors'],
        salaryRange: 'Not specified',
      },
    });
  });

  it('AI text that is not JSON -> warns and uses the fallback', async () => {
    const H = makeJobsHarness();
    H.fakes.aiClient.reply = { ok: true, data: 'not json at all' };
    const res = await H.call('POST', PATH, { jobDescription: 'plain text description with no tech at all, just words, long enough to pass' });
    expect(res.status).toBe(200);
    expect(console.warn).toHaveBeenCalledWith('Failed to parse LLM response, using fallback');
    const { data } = await res.json();
    expect(data.responsibilities).toEqual(['Lead technical projects', 'Collaborate with team', 'Mentor junior developers']);
    expect(data.experienceLevel).toBe('3-5 years');
  });

  it('AI JSON "null" -> 500 "Failed to analyze job description" (property access on null, preserved)', async () => {
    const H = makeJobsHarness();
    H.fakes.aiClient.reply = { ok: true, data: 'null' };
    const res = await H.call('POST', PATH, { jobDescription: DESC });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Failed to analyze job description' });
  });

  it('no JSON body -> 500 "Failed to analyze job description" (body read is inside the try block)', async () => {
    const H = makeJobsHarness();
    const res = await H.call('POST', PATH, undefined);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Failed to analyze job description' });
  });

  it('non-string jobDescription (number) -> the same 500', async () => {
    const H = makeJobsHarness();
    const res = await H.call('POST', PATH, { jobDescription: 12345 });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Failed to analyze job description' });
  });

  it('a throwing AI client -> the same 500', async () => {
    const H = makeJobsHarness();
    H.fakes.aiClient.reply = new Error('socket hang up');
    const res = await H.call('POST', PATH, { jobDescription: DESC });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Failed to analyze job description' });
  });
});
