'use strict';

/** POST /api/resume-consistency/check: authenticateToken -> requirePlan(2). */
const { build } = require('./helpers');

const PATH = '/api/resume-consistency/check';
const BOTH = {
  resume: { skills: ['React', 'Node', 'Python'], experience: [] },
  linkedin: { skills: ['React', 'Node'] },
};

describe('POST /api/resume-consistency/check', () => {
  let errorSpy;
  beforeEach(() => {
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  describe('auth + plan gate (requirePlan(2))', () => {
    it('401 without a token', async () => {
      const H = build({ plan: 3 });
      const res = await H.json('POST', PATH, BOTH, { auth: false });
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: 'Unauthorized' });
    });

    it('403 PLAN_UPGRADE_REQUIRED with no subscription', async () => {
      const H = build();
      const res = await H.json('POST', PATH, BOTH);
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({
        error: 'This feature requires a higher subscription plan.',
        code: 'PLAN_UPGRADE_REQUIRED',
        requiredPlan: 'Tune & Polish',
        currentPlan: null,
      });
    });

    it('403 at tier 1 (below the threshold), naming both plans', async () => {
      const H = build({ plan: 1 });
      const res = await H.json('POST', PATH, BOTH);
      expect(res.status).toBe(403);
      expect(await res.json()).toMatchObject({ code: 'PLAN_UPGRADE_REQUIRED', requiredPlan: 'Tune & Polish', currentPlan: 'Learn & Build' });
    });

    it.each([2, 3])('200 at tier %i (threshold is tier 2)', async (plan) => {
      const H = build({ plan });
      expect((await H.json('POST', PATH, BOTH)).status).toBe(200);
    });

    it('the gate runs before body validation: below threshold with an empty body is 403, not 400', async () => {
      const H = build({ plan: 1 });
      expect((await H.json('POST', PATH, {})).status).toBe(403);
    });
  });

  describe('validation', () => {
    const MSG = 'Provide at least one of: resume, linkedin, github. Two or more are needed for a meaningful comparison.';

    it.each([
      ['empty object', {}],
      ['all falsy', { resume: '', linkedin: null, github: 0 }],
      ['unrelated keys only', { foo: 'bar' }],
    ])('400 for %s', async (_label, body) => {
      const H = build({ plan: 2 });
      const res = await H.json('POST', PATH, body);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: MSG });
    });

    it('400 when there is no JSON body at all (req.body is undefined -> `|| {}`)', async () => {
      const H = build({ plan: 2 });
      const res = await H.authed(PATH, { method: 'POST' });
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: MSG });
    });

    it('400 for a JSON array body (destructures to nothing)', async () => {
      const H = build({ plan: 2 });
      expect((await H.json('POST', PATH, [BOTH])).status).toBe(400);
    });
  });

  describe('happy path (response shape)', () => {
    it('200 { success, data } with the report for two sources', async () => {
      const H = build({ plan: 2 });
      const res = await H.json('POST', PATH, BOTH);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(Object.keys(body)).toEqual(['success', 'data']);
      expect(body.success).toBe(true);
      expect(Object.keys(body.data)).toEqual(['consistencyScore', 'summary', 'mismatches', 'generatedAt']);
      expect(body.data.consistencyScore).toBe(96);
      expect(body.data.summary).toEqual({ totalMismatches: 1, sourcesProvided: ['resume', 'linkedin'], comparable: true });
      expect(body.data.mismatches).toEqual([
        {
          category: 'Skills Missing in LinkedIn',
          severity: 'medium',
          source: 'resume',
          target: 'linkedin',
          items: ['Python'],
          details: 'Skills listed on the resume but absent from the LinkedIn profile.',
        },
      ]);
      expect(new Date(body.data.generatedAt).toISOString()).toBe(body.data.generatedAt);
    });

    it('a single source is accepted but not scorable: consistencyScore null, comparable false', async () => {
      const H = build({ plan: 2 });
      const res = await H.json('POST', PATH, { resume: { skills: ['a'] } });
      expect(res.status).toBe(200);
      const { data } = await res.json();
      expect(data.consistencyScore).toBeNull();
      expect(data.summary).toEqual({ totalMismatches: 0, sourcesProvided: ['resume'], comparable: false });
      expect(data.mismatches).toEqual([]);
    });

    it('cross-source mismatches: titles, dates, headline, name and github projects', async () => {
      const H = build({ plan: 3 });
      const res = await H.json('POST', PATH, {
        resume: {
          name: 'Ada L',
          headline: 'Backend Engineer',
          skills: ['Go'],
          projects: [{ name: 'Alpha' }],
          experience: [{ title: 'Engineer', company: 'Acme', startDate: '2019', endDate: '2021' }],
        },
        linkedin: {
          name: 'Ada Lovelace',
          headline: 'Software Engineer',
          skills: ['Go'],
          experience: [{ title: 'Senior Engineer', company: 'Acme', startDate: '2018', endDate: '2021' }],
        },
        github: { repos: [{ name: 'Beta', language: 'Rust' }] },
      });
      expect(res.status).toBe(200);
      const { data } = await res.json();
      const cats = data.mismatches.map((m) => m.category);
      expect(cats).toEqual([
        'Projects Missing in Resume',
        'Projects Missing in GitHub',
        'Skills Missing in Resume',
        'Title Mismatches',
        'Date Mismatches',
        'Headline Mismatches',
        'Name Mismatches',
      ]);
      expect(data.summary.sourcesProvided).toEqual(['resume', 'linkedin', 'github']);
      // penalty: 4 + 1.5 + 1.5 + 8 + 8 + 1.5 + 4 = 28.5 -> round(71.5) = 72
      expect(data.consistencyScore).toBe(72);
    });
  });

  describe('error path', () => {
    it('500 {"error":"Failed to run consistency check"} when the service throws, and the error is logged', async () => {
      const H = build({ plan: 2 });
      // a null experience entry makes experienceList dereference null (existing behaviour)
      const res = await H.json('POST', PATH, { resume: { experience: [null] }, linkedin: { skills: [] } });
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: 'Failed to run consistency check' });
      expect(errorSpy).toHaveBeenCalledWith('Resume consistency check error:', expect.any(TypeError));
    });
  });
});
