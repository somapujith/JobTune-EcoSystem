'use strict';

/**
 * /api/guides: POST /generate and GET /:id, both authenticateToken only (no requirePlan).
 * Mirrors backend/tests/guides.routes.test.js and adds the auth and error-mapping cases.
 */
const { build, makeFakeAi } = require('./helpers');

const APP = { id: 1, user_id: 1, company: 'Acme', role: 'Engineer', job_description: 'Build APIs' };
const LLM = {
  questions: ['Tell me about yourself.'],
  talkingPoints: ['Highlight teamwork.'],
  companyResearch: 'Acme is a global company.',
};
const okAi = (payload = LLM) => makeFakeAi(async () => ({ ok: true, data: JSON.stringify(payload), error: null }));

describe('POST /api/guides/generate', () => {
  beforeEach(() => jest.spyOn(console, 'error').mockImplementation(() => {}));
  afterEach(() => jest.restoreAllMocks());

  describe('auth (and NO plan gate)', () => {
    it('401 without a token', async () => {
      const H = build({ ai: okAi() });
      const res = await H.json('POST', '/api/guides/generate', { jobDescription: 'x' }, { auth: false });
      expect(res.status).toBe(401);
      expect(H.ai.calls).toHaveLength(0);
    });

    it('a user with no subscription is served (Express has no requirePlan here)', async () => {
      const H = build({ ai: okAi() }); // no plan
      const res = await H.json('POST', '/api/guides/generate', { jobDescription: 'Build pipelines', role: 'Data Engineer' });
      expect(res.status).toBe(200);
    });
  });

  describe('validation', () => {
    it('400 when neither applicationId nor jobDescription is provided', async () => {
      const H = build({ ai: okAi() });
      const res = await H.json('POST', '/api/guides/generate', {});
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'applicationId or jobDescription is required' });
    });

    it('400 when both are falsy (0, empty string)', async () => {
      const H = build({ ai: okAi() });
      expect((await H.json('POST', '/api/guides/generate', { applicationId: 0, jobDescription: '' })).status).toBe(400);
    });

    it('PRESERVED: no JSON body at all is a TypeError (the body is destructured without a fallback) -> masked 500', async () => {
      const H = build({ ai: okAi() });
      const res = await H.authed('/api/guides/generate', { method: 'POST' });
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: 'Internal Server Error' });
    });
  });

  describe('generation', () => {
    it('200 with the LLM guide + savedId for a valid applicationId; persists it for the user/application', async () => {
      const H = build({ ai: okAi() });
      H.db.state.job_applications.push({ ...APP });
      const res = await H.json('POST', '/api/guides/generate', { applicationId: 1 });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ...LLM, savedId: 1 });
      expect(H.db.state.job_guides).toEqual([{ id: 1, user_id: 1, application_id: 1, guide: LLM }]);
    });

    it('sends the application company/role/description to the LLM with the fixed options', async () => {
      const H = build({ ai: okAi() });
      H.db.state.job_applications.push({ ...APP });
      await H.json('POST', '/api/guides/generate', { applicationId: 1, role: 'ignored because the application role wins' });
      expect(H.ai.calls).toHaveLength(1);
      const call = H.ai.calls[0];
      expect(call.maxTokens).toBe(1024);
      expect(call.temperature).toBe(0.5);
      expect(call.systemPrompt).toMatch(/^You are an expert career coach\. Respond ONLY with valid JSON/);
      expect(call.userPrompt).toContain('applying to Acme for the role: Engineer.');
      expect(call.userPrompt).toContain('Job Description:\nBuild APIs');
    });

    it('coerces a string applicationId with Number()', async () => {
      const H = build({ ai: okAi() });
      H.db.state.job_applications.push({ ...APP });
      const res = await H.json('POST', '/api/guides/generate', { applicationId: '1' });
      expect(res.status).toBe(200);
      const lookup = H.db.calls.find((c) => /FROM job_applications/.test(c.sql));
      expect(lookup.params).toEqual([1, 1]);
    });

    it('200 for jobDescription + role only: no application lookup, application_id stored as null', async () => {
      const H = build({ ai: okAi() });
      const res = await H.json('POST', '/api/guides/generate', { jobDescription: 'Build pipelines', role: 'Data Engineer' });
      expect(res.status).toBe(200);
      expect(H.db.calls.some((c) => /job_applications/.test(c.sql))).toBe(false);
      expect(H.db.state.job_guides[0].application_id).toBeNull();
      expect(H.ai.calls[0].userPrompt).toContain('for the role: Data Engineer.');
    });

    it('strips markdown fences around the LLM JSON', async () => {
      const ai = makeFakeAi(async () => ({ ok: true, data: '```json\n' + JSON.stringify(LLM) + '\n```', error: null }));
      const H = build({ ai });
      const res = await H.json('POST', '/api/guides/generate', { jobDescription: 'x' });
      expect(await res.json()).toEqual({ ...LLM, savedId: 1 });
    });

    it.each([
      ['provider reports failure', async () => ({ ok: false, data: null, error: 'LLM down' })],
      ['provider returns no data', async () => ({ ok: true, data: '', error: null })],
      ['malformed JSON', async () => ({ ok: true, data: 'not valid json {{}}', error: null })],
      ['wrong shape (talkingPoints missing)', async () => ({ ok: true, data: JSON.stringify({ questions: [], companyResearch: 'x' }), error: null })],
      ['wrong shape (companyResearch not a string)', async () => ({ ok: true, data: JSON.stringify({ questions: [], talkingPoints: [], companyResearch: 3 }), error: null })],
      ['provider throws', async () => { throw new Error('Network error'); }],
      ['provider returns undefined', async () => undefined],
    ])('falls back to the template guide and still returns 200 when the %s', async (_label, impl) => {
      const H = build({ ai: makeFakeAi(impl) });
      H.db.state.job_applications.push({ ...APP });
      const res = await H.json('POST', '/api/guides/generate', { applicationId: 1 });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.savedId).toBe(1);
      expect(body.questions).toHaveLength(9); // 7 generic + 2 role-specific
      expect(body.questions[7]).toBe('What specific skills have prepared you for the Engineer position?');
      expect(body.talkingPoints).toHaveLength(5);
      expect(body.talkingPoints[4]).toBe("Research Acme's recent news, products, and culture before the interview.");
      expect(body.companyResearch).toMatch(/^Research Acme thoroughly before your interview: /);
    });

    it('template guide uses "this role" / "the company" when neither is known', async () => {
      const H = build({ ai: makeFakeAi() });
      const res = await H.json('POST', '/api/guides/generate', { jobDescription: 'something' });
      const body = await res.json();
      expect(body.questions[7]).toBe('What specific skills have prepared you for the this role position?');
      expect(body.talkingPoints[4]).toBe("Research the company's recent news, products, and culture before the interview.");
    });

    it('falls back (rather than failing) when no aiClient service is wired at all', async () => {
      const H = build();
      // an unregistered aiClient is looked up lazily inside the try block, like any callAI failure
      const { createJobGuideGenerator } = require('../../../src/worker/services/guides/jobGuideGenerator');
      const gen = createJobGuideGenerator({ db: H.db, services: {} });
      const out = await gen.generateJobGuide({ jobDescription: 'x', role: 'SRE', userId: 1 });
      expect(out.savedId).toBe(1);
      expect(out.questions).toHaveLength(9);
    });
  });

  describe('error mapping', () => {
    it('404 {"error":"Application 9999 not found"} for an unknown applicationId', async () => {
      const H = build({ ai: okAi() });
      const res = await H.json('POST', '/api/guides/generate', { applicationId: 9999 });
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: 'Application 9999 not found' });
      expect(H.ai.calls).toHaveLength(0);
    });

    it("404 for another user's application (lookup is scoped by user_id)", async () => {
      const H = build({ ai: okAi() });
      H.db.state.job_applications.push({ ...APP, user_id: 2 });
      const res = await H.json('POST', '/api/guides/generate', { applicationId: 1 });
      expect(res.status).toBe(404);
      expect(H.db.state.job_guides).toHaveLength(0);
    });

    it('500 {"error":"Failed to generate guide","detail":<message>} when persisting fails', async () => {
      const H = build({ ai: okAi() });
      H.db.failWhen((sql) => /INSERT INTO job_guides/.test(sql), new Error('connection reset'));
      const res = await H.json('POST', '/api/guides/generate', { jobDescription: 'x' });
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: 'Failed to generate guide', detail: 'connection reset' });
    });

    it('PRESERVED QUIRK: any error whose message contains "not found" (even a db error) maps to 404', async () => {
      const H = build({ ai: okAi() });
      H.db.failWhen((sql) => /INSERT INTO job_guides/.test(sql), new Error('relation job_guides NOT FOUND'));
      const res = await H.json('POST', '/api/guides/generate', { jobDescription: 'x' });
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: 'relation job_guides NOT FOUND' });
    });
  });
});

describe('GET /api/guides/:id', () => {
  beforeEach(() => jest.spyOn(console, 'error').mockImplementation(() => {}));
  afterEach(() => jest.restoreAllMocks());

  it('401 without a token', async () => {
    const H = build();
    expect((await H.request('/api/guides/5')).status).toBe(401);
  });

  it('200 returns the stored row (no plan needed)', async () => {
    const H = build();
    H.db.state.job_guides.push({ id: 5, user_id: 1, application_id: null, guide: LLM });
    const res = await H.authed('/api/guides/5');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: 5, user_id: 1, application_id: null, guide: LLM });
  });

  it('404 {"error":"Guide 9999 not found"}', async () => {
    const H = build();
    const res = await H.authed('/api/guides/9999');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Guide 9999 not found' });
  });

  it("404 for another user's guide (scoped by user_id)", async () => {
    const H = build();
    H.db.state.job_guides.push({ id: 5, user_id: 2, application_id: null, guide: LLM });
    expect((await H.authed('/api/guides/5')).status).toBe(404);
  });

  it.each(['abc', '0', '-1', '1.5', 'NaN'])('400 {"error":"id must be a positive integer"} for id "%s"', async (id) => {
    const H = build();
    const res = await H.authed(`/api/guides/${id}`);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'id must be a positive integer' });
    expect(H.db.calls.some((c) => /job_guides/.test(c.sql))).toBe(false);
  });

  it('Number() coercion accepted as-is: "1e0" is id 1', async () => {
    const H = build();
    H.db.state.job_guides.push({ id: 1, user_id: 1, application_id: null, guide: LLM });
    expect((await H.authed('/api/guides/1e0')).status).toBe(200);
  });

  it('500 {"error":"Failed to fetch guide","detail":<message>} on a db error', async () => {
    const H = build();
    H.db.failWhen((sql) => /FROM job_guides/.test(sql), new Error('DB down'));
    const res = await H.authed('/api/guides/5');
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Failed to fetch guide', detail: 'DB down' });
  });

  it('route order: GET /api/guides/generate is handled by /:id (400), as in Express', async () => {
    const H = build();
    const res = await H.authed('/api/guides/generate');
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'id must be a positive integer' });
  });
});
