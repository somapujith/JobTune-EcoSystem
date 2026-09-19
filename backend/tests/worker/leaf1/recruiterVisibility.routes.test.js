'use strict';

/** POST /api/recruiter-visibility/analyze: authenticateToken -> requirePlan(2). */
const { build } = require('./helpers');

const PATH = '/api/recruiter-visibility/analyze';
const RESUME = [
  'Senior engineer. Led a team of 6 and built React and Node.js services on AWS with Docker and PostgreSQL.',
  'Improved latency by 40% and reduced costs by 25%. Shipped 3 products. github.com/ada linkedin.com/in/ada ada@example.com',
].join(' ');

describe('POST /api/recruiter-visibility/analyze', () => {
  let errorSpy;
  beforeEach(() => {
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  describe('auth + plan gate (requirePlan(2))', () => {
    it('401 without a token', async () => {
      const H = build({ plan: 3 });
      const res = await H.json('POST', PATH, { resumeText: RESUME }, { auth: false });
      expect(res.status).toBe(401);
    });

    it('403 PLAN_UPGRADE_REQUIRED with no subscription', async () => {
      const H = build();
      const res = await H.json('POST', PATH, { resumeText: RESUME });
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({
        error: 'This feature requires a higher subscription plan.',
        code: 'PLAN_UPGRADE_REQUIRED',
        requiredPlan: 'Tune & Polish',
        currentPlan: null,
      });
    });

    it('403 at tier 1', async () => {
      const H = build({ plan: 1 });
      const res = await H.json('POST', PATH, { resumeText: RESUME });
      expect(res.status).toBe(403);
      expect(await res.json()).toMatchObject({ requiredPlan: 'Tune & Polish', currentPlan: 'Learn & Build' });
    });

    it.each([2, 3])('200 at tier %i', async (plan) => {
      const H = build({ plan });
      expect((await H.json('POST', PATH, { resumeText: RESUME })).status).toBe(200);
    });
  });

  describe('validation', () => {
    const MSG = 'Provide at least one of: resume text, LinkedIn data, or GitHub data.';

    it.each([
      ['empty object', {}],
      ['blank resume text', { resumeText: '   ' }],
      ['empty linkedin/github objects', { linkedin: {}, github: {} }],
    ])('400 with the service message for %s', async (_label, body) => {
      const H = build({ plan: 2 });
      const res = await H.json('POST', PATH, body);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: MSG });
      expect(errorSpy).not.toHaveBeenCalled(); // 400 is not logged as a server error
    });

    it('400 when there is no JSON body (`|| {}` fallback)', async () => {
      const H = build({ plan: 2 });
      const res = await H.authed(PATH, { method: 'POST' });
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: MSG });
    });
  });

  describe('happy path (response shape)', () => {
    it('200 { success, data } for resume text only', async () => {
      const H = build({ plan: 2 });
      const res = await H.json('POST', PATH, { resumeText: RESUME });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(Object.keys(body)).toEqual(['success', 'data']);
      expect(body.success).toBe(true);
      expect(Object.keys(body.data)).toEqual([
        'visibilityScore', 'scoreLabel', 'scoreDescription', 'subScores', 'missingSources', 'suggestions', 'generatedAt',
      ]);
      expect(body.data.missingSources).toEqual(['linkedin', 'github']);
      expect(body.data.subScores.resume.available).toBe(true);
      expect(body.data.subScores.linkedin).toEqual({ score: 0, available: false, signals: {} });
      expect(body.data.subScores.github).toEqual({ score: 0, available: false, signals: {} });
      expect(Object.keys(body.data.subScores.keywords)).toEqual(['score', 'available', 'matched', 'missing']);
      expect(body.data.visibilityScore).toBeGreaterThan(0);
      expect(body.data.scoreDescription).toMatch(/^Your recruiter visibility is \d+\/100 .+ improvements? identified\.$/);
    });

    it('uses already-analyzed linkedin/github shapes and targetKeywords (string or array)', async () => {
      const H = build({ plan: 3 });
      const res = await H.json('POST', PATH, {
        resumeText: RESUME,
        linkedin: { score: 82, metrics: [{ label: 'react' }], suggestions: ['a', 'b', 'c', 'd'] },
        github: { score: 64, languages: ['JavaScript'], repoCount: 12, stars: 5, followers: 3, issues: ['x'] },
        targetKeywords: 'react, docker',
      });
      expect(res.status).toBe(200);
      const { data } = await res.json();
      expect(data.missingSources).toEqual([]);
      expect(data.subScores.linkedin.score).toBe(82);
      expect(data.subScores.github.score).toBe(64);
      expect(data.subScores.keywords.matched).toEqual(['react', 'docker']);
      expect(data.subScores.keywords.score).toBe(100);

      const arr = await H.json('POST', PATH, { resumeText: RESUME, targetKeywords: ['react', 'kubernetes'] });
      expect((await arr.json()).data.subScores.keywords.missing).toEqual(['kubernetes']);
    });

    it('caps suggestions at 8 and ranks missing sources first', async () => {
      const H = build({ plan: 2 });
      const res = await H.json('POST', PATH, { resumeText: 'short resume text with react' });
      const { data } = await res.json();
      expect(data.suggestions.length).toBeLessThanOrEqual(8);
      expect(data.suggestions[0]).toMatch(/LinkedIn/);
      expect(data.suggestions[1]).toMatch(/GitHub/);
    });
  });

  describe('error path', () => {
    it('500 {"error":"Failed to analyze recruiter visibility"} for a non-400 service error, and it is logged', async () => {
      const H = build({ plan: 2 });
      // a non-string keyword makes scoreKeywords call toLowerCase on a number (existing behaviour)
      const res = await H.json('POST', PATH, { resumeText: RESUME, targetKeywords: [123] });
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: 'Failed to analyze recruiter visibility' });
      expect(errorSpy).toHaveBeenCalledWith('Recruiter visibility analysis error:', expect.any(TypeError));
    });
  });
});
