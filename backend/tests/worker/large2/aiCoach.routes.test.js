'use strict';

/**
 * /api/ai-coach: happy paths, validation, AI failure fallbacks, best-effort DB writes, masked errors.
 * Bodies are compared with what the Express handlers return (read from src/routes/aiCoach.js).
 * The auth / plan matrix for every endpoint lives in manifest.test.js.
 */
const { makeHarness, makeAi, aiOk } = require('./helpers');

const ROLES = [
  'Frontend Developer', 'Backend Developer', 'Full Stack Developer', 'Data Scientist', 'Machine Learning Engineer',
  'DevOps Engineer', 'Mobile Developer', 'Cloud Architect', 'Cybersecurity Analyst', 'Product Manager',
];

let warn;
let error;
beforeEach(() => {
  warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  error = jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

const CALL_DEFAULTS = { structuredJson: true, cache: false };

describe('GET /api/ai-coach/career-score (tier 3)', () => {
  it('computes the weighted score from the user rows', async () => {
    const H = makeHarness({ plan: 3 });
    H.db.state.profiles.push({ user_id: 1, linkedin_url: 'x', github_url: 'y', headline: 'h', bio: 'b' });
    H.db.state.resumes.push({ user_id: 1 }, { user_id: 1 });
    H.db.state.projects.push({ user_id: 1 }, { user_id: 1 }, { user_id: 1 }, { user_id: 2 });
    H.db.state.interview_sessions.push({ user_id: 1 });

    const res = await H.authed('/api/ai-coach/career-score');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      overall: 63, // round(90*.2 + 65*.2 + 65*.2 + 25*.15 + 35*.15 + 10)
      breakdown: {
        technicalSkills: { score: 90, weight: 30 },
        projectsPortfolio: { score: 65, weight: 20 },
        resumeProfile: { score: 65, weight: 20 },
        interviewReadiness: { score: 25, weight: 15 },
        communication: { score: 35, weight: 15 },
      },
    });
    // only this user's rows were counted: every query is scoped by the JWT user id
    expect(H.db.callsMatching(/FROM (profiles|resumes|projects|interview_sessions) WHERE user_id = \$1/).every((c) => c.params[0] === 1)).toBe(true);
    expect(H.ai.callAI).not.toHaveBeenCalled();
  });

  it('uses the defaults when the user has no rows', async () => {
    const H = makeHarness({ plan: 3 });
    const res = await H.authed('/api/ai-coach/career-score');
    expect(await res.json()).toEqual({
      overall: 35,
      breakdown: {
        technicalSkills: { score: 40, weight: 30 },
        projectsPortfolio: { score: 20, weight: 20 },
        resumeProfile: { score: 25, weight: 20 },
        interviewReadiness: { score: 15, weight: 15 },
        communication: { score: 35, weight: 15 },
      },
    });
  });

  it('caps each component (many rows) and clamps the overall', async () => {
    const H = makeHarness({ plan: 3 });
    for (let i = 0; i < 9; i += 1) H.db.state.resumes.push({ user_id: 1 });
    for (let i = 0; i < 9; i += 1) H.db.state.projects.push({ user_id: 1 });
    for (let i = 0; i < 12; i += 1) H.db.state.interview_sessions.push({ user_id: 1 });
    const body = await (await H.authed('/api/ai-coach/career-score')).json();
    expect(body.breakdown.resumeProfile.score).toBe(85);
    expect(body.breakdown.projectsPortfolio.score).toBe(90);
    expect(body.breakdown.interviewReadiness.score).toBe(85);
  });

  // A failing component query keeps that component's INITIAL value (profile 40, project 35, resume 30, interview 25),
  // which differs from the value computed for an empty table (profile 40, project 20, resume 25, interview 15).
  it.each([
    ['profiles', 35, 'technicalSkills', 40],
    ['resumes', 36, 'resumeProfile', 30],
    ['projects', 38, 'projectsPortfolio', 35],
    ['interview_sessions', 36, 'interviewReadiness', 25],
  ])('a missing %s table only affects that component (inner catch), the response is still 200', async (table, overall, key, score) => {
    const H = makeHarness({ plan: 3 });
    H.db.breakTable(table);
    const res = await H.authed('/api/ai-coach/career-score');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Object.keys(body)).toEqual(['overall', 'breakdown']);
    expect(body.overall).toBe(overall);
    expect(body.breakdown[key].score).toBe(score);
  });
});

describe('POST /api/ai-coach/recommendations (tier 3)', () => {
  const aiRecs = [
    { id: 9, title: 'T1', description: 'D1', priority: 'Low', estimatedTime: '5h', skillArea: 'Communication' },
    { title: 'T2', priority: 'Urgent' },
    {},
  ];

  it('returns AI output normalised, marks aiPowered and stores the session', async () => {
    const H = makeHarness({ plan: 3, ai: makeAi([aiOk(aiRecs)]) });
    const res = await H.authed('/api/ai-coach/recommendations', { method: 'POST', body: { targetRole: 'Data Scientist' } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      targetRole: 'Data Scientist',
      aiPowered: true,
      recommendations: [
        { id: 9, title: 'T1', description: 'D1', priority: 'Low', estimatedTime: '5h', skillArea: 'Communication', done: false },
        { id: 2, title: 'T2', description: '', priority: 'Medium', estimatedTime: '1-2 hours', skillArea: 'Technical Skills', done: false },
        { id: 3, title: 'Task 3', description: '', priority: 'Medium', estimatedTime: '1-2 hours', skillArea: 'Technical Skills', done: false },
      ],
    });
    expect(H.ai.callAI).toHaveBeenCalledWith(expect.objectContaining({ ...CALL_DEFAULTS, maxTokens: 800, temperature: 0.6 }));
    expect(H.ai.calls[0].userPrompt).toContain('targeting "Data Scientist"');
    expect(H.db.state.career_coach_sessions).toEqual([
      expect.objectContaining({ user_id: 1, session_type: 'recommendations', target_role: 'Data Scientist', data: JSON.stringify(body.recommendations) }),
    ]);
  });

  it.each([[undefined], ['Astronaut'], [42], [null]])('an unknown targetRole (%p) becomes Full Stack Developer', async (targetRole) => {
    const H = makeHarness({ plan: 3 });
    const res = await H.authed('/api/ai-coach/recommendations', { method: 'POST', body: { targetRole } });
    expect((await res.json()).targetRole).toBe('Full Stack Developer');
  });

  it.each(ROLES)('accepts the listed role %s', async (role) => {
    const H = makeHarness({ plan: 3 });
    const body = await (await H.authed('/api/ai-coach/recommendations', { method: 'POST', body: { targetRole: role } })).json();
    expect(body.targetRole).toBe(role);
  });

  it('falls back to the template list when the AI is offline', async () => {
    const H = makeHarness({ plan: 3 });
    const body = await (await H.authed('/api/ai-coach/recommendations', { method: 'POST', body: { targetRole: 'DevOps Engineer' } })).json();
    expect(body.aiPowered).toBe(false);
    expect(body.recommendations).toHaveLength(5);
    expect(body.recommendations[0]).toEqual({
      id: 1,
      title: 'Complete a DevOps Engineer portfolio project',
      description: 'Build a project that demonstrates core skills for your target role.',
      priority: 'High',
      estimatedTime: '4-6 hours',
      skillArea: 'Projects & Portfolio',
      done: false,
    });
    expect(H.db.state.career_coach_sessions).toHaveLength(1); // the fallback is stored too
  });

  it.each([['not json at all'], ['[]'], ['{"x":1}']])('unusable AI output %p also falls back', async (data) => {
    const H = makeHarness({ plan: 3, ai: makeAi([aiOk(data)]) });
    const body = await (await H.authed('/api/ai-coach/recommendations', { method: 'POST', body: {} })).json();
    expect(body.aiPowered).toBe(false);
    expect(body.recommendations).toHaveLength(5);
  });

  it('a rejecting AI call is caught: 200 with the fallback, logged as "Recommendations error:"', async () => {
    const H = makeHarness({ plan: 3, ai: makeAi([new Error('boom')]) });
    const res = await H.authed('/api/ai-coach/recommendations', { method: 'POST', body: { targetRole: 'Product Manager' } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ aiPowered: false, targetRole: 'Product Manager' });
    expect(error).toHaveBeenCalledWith('Recommendations error:', 'boom');
    expect(H.db.state.career_coach_sessions).toHaveLength(0); // the catch path does not store
  });

  it('a failing session insert is non-critical', async () => {
    const H = makeHarness({ plan: 3, ai: makeAi([aiOk(aiRecs)]) });
    H.db.breakTable('career_coach_sessions');
    const res = await H.authed('/api/ai-coach/recommendations', { method: 'POST', body: {} });
    expect(res.status).toBe(200);
    expect((await res.json()).aiPowered).toBe(true);
  });

  it('a request with no JSON body is a masked 500 (body destructured outside the try, as on Express 5)', async () => {
    const H = makeHarness({ plan: 3 });
    const res = await H.authed('/api/ai-coach/recommendations', { method: 'POST' });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal Server Error' });
    expect(H.ai.callAI).not.toHaveBeenCalled();
  });
});

describe('POST /api/ai-coach/skill-gap (tier 3)', () => {
  it('returns clamped AI output and stores the session with the (capped) skills', async () => {
    const skills = Array.from({ length: 30 }, (_, i) => `skill${i}`);
    const ai = makeAi([aiOk([{ skill: 'React', currentLevel: 250, requiredLevel: -5, recommendation: 'r' }, {}])]);
    const H = makeHarness({ plan: 3, ai });
    const res = await H.authed('/api/ai-coach/skill-gap', { method: 'POST', body: { targetRole: 'Frontend Developer', currentSkills: skills } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      targetRole: 'Frontend Developer',
      aiPowered: true,
      gaps: [
        { skill: 'React', currentLevel: 100, requiredLevel: 0, recommendation: 'r' },
        { skill: 'Unknown', currentLevel: 20, requiredLevel: 80, recommendation: '' },
      ],
    });
    expect(ai.calls[0].userPrompt).toContain(`[${skills.slice(0, 20).join(', ')}]`);
    expect(ai.calls[0].userPrompt).not.toContain('skill20');
    expect(ai.callAI).toHaveBeenCalledWith(expect.objectContaining({ ...CALL_DEFAULTS, maxTokens: 600, temperature: 0.5 }));
    const saved = H.db.state.career_coach_sessions[0];
    expect(saved).toMatchObject({ session_type: 'skill-gap', target_role: 'Frontend Developer' });
    expect(JSON.parse(saved.data).currentSkills).toHaveLength(20);
  });

  it('non-array currentSkills are treated as none; unknown role -> Full Stack Developer', async () => {
    const ai = makeAi([]);
    const H = makeHarness({ plan: 3, ai });
    const body = await (await H.authed('/api/ai-coach/skill-gap', { method: 'POST', body: { targetRole: 'x', currentSkills: 'react' } })).json();
    expect(body.targetRole).toBe('Full Stack Developer');
    expect(ai.calls[0].userPrompt).toContain('skills [] targeting');
  });

  it('fallback: role skill list, levels in range, skills the user has get the higher band', async () => {
    const H = makeHarness({ plan: 3 });
    const body = await (await H.authed('/api/ai-coach/skill-gap', { method: 'POST', body: { targetRole: 'Backend Developer', currentSkills: ['node.js', 'SQL'] } })).json();
    expect(body.aiPowered).toBe(false);
    expect(body.gaps.map((g) => g.skill)).toEqual(['Node.js', 'PostgreSQL', 'REST APIs', 'Authentication', 'Caching', 'System Design']);
    const has = body.gaps.find((g) => g.skill === 'Node.js');
    const hasNot = body.gaps.find((g) => g.skill === 'Caching');
    expect(has.currentLevel).toBeGreaterThanOrEqual(50);
    expect(has.currentLevel).toBeLessThan(80);
    expect(hasNot.currentLevel).toBeGreaterThanOrEqual(10);
    expect(hasNot.currentLevel).toBeLessThan(40);
    for (const g of body.gaps) {
      expect(g.requiredLevel).toBeGreaterThanOrEqual(75);
      expect(g.requiredLevel).toBeLessThan(95);
      expect(g.recommendation).toBe(`Improve your ${g.skill} skills through hands-on projects and structured learning.`);
    }
  });

  it('a rejecting AI call: 200 fallback, aiPowered false, logged', async () => {
    const H = makeHarness({ plan: 3, ai: makeAi([new Error('down')]) });
    const res = await H.authed('/api/ai-coach/skill-gap', { method: 'POST', body: {} });
    expect(res.status).toBe(200);
    expect((await res.json()).aiPowered).toBe(false);
    expect(error).toHaveBeenCalledWith('Skill gap error:', 'down');
  });

  it('no body: masked 500', async () => {
    const H = makeHarness({ plan: 3 });
    expect((await H.authed('/api/ai-coach/skill-gap', { method: 'POST' })).status).toBe(500);
  });
});

describe('POST /api/ai-coach/career-plan (tier 3)', () => {
  const plan = { targetRole: 'Backend Developer', currentLevel: 'advanced', timeline: [{ month: 1, title: 'a', description: 'b', tasks: ['c'], milestone: 'd' }], shortTerm: [], mediumTerm: [], longTerm: [] };

  it('passes an AI plan through unchanged and stores it', async () => {
    const H = makeHarness({ plan: 3, ai: makeAi([aiOk(plan)]) });
    const res = await H.authed('/api/ai-coach/career-plan', { method: 'POST', body: { targetRole: 'Backend Developer', currentLevel: 'advanced' } });
    expect(await res.json()).toEqual({ plan, aiPowered: true });
    expect(H.ai.callAI).toHaveBeenCalledWith(expect.objectContaining({ ...CALL_DEFAULTS, maxTokens: 1000, temperature: 0.5 }));
    expect(H.ai.calls[0].userPrompt).toContain('for a advanced-level student targeting "Backend Developer"');
    expect(H.db.state.career_coach_sessions[0]).toMatchObject({ session_type: 'career-plan', target_role: 'Backend Developer', data: JSON.stringify(plan) });
  });

  it('an AI object without a timeline falls back; invalid level defaults to beginner', async () => {
    const H = makeHarness({ plan: 3, ai: makeAi([aiOk({ timeline: [] })]) });
    const body = await (await H.authed('/api/ai-coach/career-plan', { method: 'POST', body: { targetRole: 'Cloud Architect', currentLevel: 'wizard' } })).json();
    expect(body.aiPowered).toBe(false);
    expect(body.plan).toMatchObject({ targetRole: 'Cloud Architect', currentLevel: 'beginner' });
    expect(body.plan.timeline).toHaveLength(6);
    expect(body.plan.timeline[0]).toEqual({
      month: 1,
      title: 'Foundation Building',
      description: 'Master the core concepts required for Cloud Architect',
      tasks: ['Complete foundational courses', 'Set up development environment', 'Join relevant communities'],
      milestone: 'Core concepts understood',
    });
    expect(body.plan.longTerm).toEqual(['Land target role', 'Earn a relevant certification', 'Establish industry network']);
  });

  it('rejecting AI: fallback plan, logged', async () => {
    const H = makeHarness({ plan: 3, ai: makeAi([new Error('x')]) });
    const res = await H.authed('/api/ai-coach/career-plan', { method: 'POST', body: {} });
    expect(res.status).toBe(200);
    expect((await res.json()).plan.targetRole).toBe('Full Stack Developer');
    expect(error).toHaveBeenCalledWith('Career plan error:', 'x');
  });

  it('no body: masked 500', async () => {
    const H = makeHarness({ plan: 3 });
    expect((await H.authed('/api/ai-coach/career-plan', { method: 'POST' })).status).toBe(500);
  });
});

describe('POST /api/ai-coach/compare-roles (tier 3)', () => {
  it.each([[{}], [{ role1: 'A' }], [{ role2: 'B' }], [{ role1: '', role2: 'B' }]])('missing role(s) %j -> 400', async (body) => {
    const H = makeHarness({ plan: 3 });
    const res = await H.authed('/api/ai-coach/compare-roles', { method: 'POST', body });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Both role1 and role2 are required.' });
    expect(H.ai.callAI).not.toHaveBeenCalled();
  });

  it('returns the AI comparison when both roles are present', async () => {
    const comparison = { role1: { name: 'A' }, role2: { name: 'B' }, recommendation: 'r' };
    const H = makeHarness({ plan: 3, ai: makeAi([aiOk(comparison)]) });
    const res = await H.authed('/api/ai-coach/compare-roles', { method: 'POST', body: { role1: 'A', role2: 'B' } });
    expect(await res.json()).toEqual({ comparison, aiPowered: true });
    expect(H.ai.callAI).toHaveBeenCalledWith(expect.objectContaining({ ...CALL_DEFAULTS, maxTokens: 600, temperature: 0.5 }));
    expect(H.ai.calls[0].userPrompt).toContain('Role 1: "A"\nRole 2: "B"');
    expect(H.db.state.career_coach_sessions).toHaveLength(0); // this endpoint stores nothing
  });

  it('fallback comparison uses the role table, defaults for unknown roles', async () => {
    const H = makeHarness({ plan: 3 });
    const body = await (await H.authed('/api/ai-coach/compare-roles', { method: 'POST', body: { role1: 'Data Scientist', role2: 'Nobody' } })).json();
    expect(body).toEqual({
      aiPowered: false,
      comparison: {
        role1: { name: 'Data Scientist', avgSalary: '$120K', demandLevel: 'High', growthRate: '22%', keySkills: ['Python', 'ML', 'Statistics'], entryBarrier: 'High', remoteOpportunities: 'High' },
        role2: { name: 'Nobody', avgSalary: '$95K', demandLevel: 'Medium', growthRate: '10%', keySkills: ['Varies'], entryBarrier: 'Medium', remoteOpportunities: 'Medium' },
        recommendation: 'Both Data Scientist and Nobody offer strong career prospects. Consider your strengths and interests when choosing between them.',
      },
    });
  });

  it('AI output missing role1/role2 falls back; a rejecting AI is caught', async () => {
    const H = makeHarness({ plan: 3, ai: makeAi([aiOk({ role1: { name: 'x' } }), new Error('bad')]) });
    const a = await (await H.authed('/api/ai-coach/compare-roles', { method: 'POST', body: { role1: 'A', role2: 'B' } })).json();
    expect(a.aiPowered).toBe(false);
    const b = await H.authed('/api/ai-coach/compare-roles', { method: 'POST', body: { role1: 'A', role2: 'B' } });
    expect(b.status).toBe(200);
    expect(error).toHaveBeenCalledWith('Compare roles error:', 'bad');
  });

  it('no body: masked 500', async () => {
    const H = makeHarness({ plan: 3 });
    expect((await H.authed('/api/ai-coach/compare-roles', { method: 'POST' })).status).toBe(500);
  });
});

describe('POST /api/ai-coach/code-review (tier 2)', () => {
  const aiReview = {
    score: 140,
    issues: [
      { severity: 'critical', category: 'Security', line: 3, description: 'd', suggestedFix: 'f' },
      { severity: 'fatal' },
    ],
    improvedCode: 'better',
    metrics: { linesOfCode: 7, complexityScore: 99, maintainabilityIndex: 500 },
    explanation: 'why',
  };

  it.each([[{}], [{ code: '' }], [{ code: 'abcd' }], [{ code: '     ab   ' }], [{ code: 12345678 }], [{ code: ['abcdefgh'] }]])(
    'invalid code %j -> 400',
    async (body) => {
      const H = makeHarness({ plan: 2 });
      const res = await H.authed('/api/ai-coach/code-review', { method: 'POST', body });
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'Code is required (minimum 5 characters).' });
      expect(H.ai.callAI).not.toHaveBeenCalled();
    }
  );

  it('sanitises the AI review, echoes language/type, and stores a 500-char snippet', async () => {
    const code = 'x'.repeat(6000);
    const H = makeHarness({ plan: 2, ai: makeAi([aiOk(aiReview)]) });
    const res = await H.authed('/api/ai-coach/code-review', { method: 'POST', body: { code, language: 'python', reviewType: 'security' } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      language: 'python',
      reviewType: 'security',
      aiPowered: true,
      review: {
        score: 100,
        issues: [
          { severity: 'critical', category: 'Security', line: 3, description: 'd', suggestedFix: 'f' },
          { severity: 'info', category: 'Best Practices', line: 1, description: '', suggestedFix: '' },
        ],
        improvedCode: 'better',
        metrics: { linesOfCode: 7, complexityScore: 50, maintainabilityIndex: 100 },
        explanation: 'why',
      },
    });
    expect(H.ai.callAI).toHaveBeenCalledWith(expect.objectContaining({ ...CALL_DEFAULTS, maxTokens: 1200, temperature: 0.3 }));
    expect(H.ai.calls[0].userPrompt).toContain('Review this python code focusing on security vulnerabilities, injection risks, and unsafe patterns.');
    expect(H.ai.calls[0].userPrompt.match(/x+/)[0].length).toBe(5000); // truncated before it reaches the model
    expect(H.db.state.code_reviews).toEqual([
      expect.objectContaining({ user_id: 1, language: 'python', review_type: 'security', score: 100, issues_count: 2, code_snippet: 'x'.repeat(500) }),
    ]);
  });

  it('unknown language/type default to javascript/full; fallback review is well formed', async () => {
    const H = makeHarness({ plan: 2 });
    const code = 'function a() {}\nlet b = 2;\nreturn b;';
    const res = await H.authed('/api/ai-coach/code-review', { method: 'POST', body: { code, language: 'cobol', reviewType: 'everything' } });
    const body = await res.json();
    expect(body).toMatchObject({ language: 'javascript', reviewType: 'full', aiPowered: false });
    expect(body.review.issues.map((i) => i.severity)).toEqual(['critical', 'warning', 'info', 'suggestion']); // security issue is prepended for "full"
    expect(body.review.issues[0]).toEqual({
      severity: 'critical',
      category: 'Security',
      line: 1,
      description: 'Ensure user inputs are properly sanitized before processing.',
      suggestedFix: '// Sanitize input\nconst sanitized = DOMPurify.sanitize(userInput);',
    });
    expect(body.review.improvedCode).toBe(`// Improved version with suggested fixes applied\n${code}`);
    expect(body.review.metrics).toEqual({ linesOfCode: 3, complexityScore: 2, maintainabilityIndex: 99 });
    expect(body.review.score).toBeGreaterThanOrEqual(55);
    expect(body.review.score).toBeLessThan(85);
    expect(body.review.explanation).toBe(`This javascript code was reviewed for all aspects. 4 issues were found. The overall quality score is ${body.review.score}/100.`);
    expect(H.db.state.code_reviews).toHaveLength(1);
  });

  it('a non-security type gets no critical issue in the fallback', async () => {
    const H = makeHarness({ plan: 2 });
    const body = await (await H.authed('/api/ai-coach/code-review', { method: 'POST', body: { code: 'const x = 1;', reviewType: 'readability' } })).json();
    expect(body.review.issues).toHaveLength(3);
    expect(body.review.explanation).toContain('reviewed for readability. 3 issues');
  });

  it('AI result without score/issues array falls back', async () => {
    const H = makeHarness({ plan: 2, ai: makeAi([aiOk({ score: 50 })]) });
    expect((await (await H.authed('/api/ai-coach/code-review', { method: 'POST', body: { code: 'const x = 1;' } })).json()).aiPowered).toBe(false);
  });

  it('rejecting AI call is caught: 200 fallback, logged, nothing stored', async () => {
    const H = makeHarness({ plan: 2, ai: makeAi([new Error('nope')]) });
    const res = await H.authed('/api/ai-coach/code-review', { method: 'POST', body: { code: 'const x = 1;' } });
    expect(res.status).toBe(200);
    expect((await res.json()).aiPowered).toBe(false);
    expect(error).toHaveBeenCalledWith('Code review error:', 'nope');
    expect(H.db.state.code_reviews).toHaveLength(0);
  });

  it('a failing code_reviews insert is non-critical', async () => {
    const H = makeHarness({ plan: 2 });
    H.db.breakTable('code_reviews');
    expect((await H.authed('/api/ai-coach/code-review', { method: 'POST', body: { code: 'const x = 1;' } })).status).toBe(200);
  });

  it('no body: masked 500', async () => {
    const H = makeHarness({ plan: 2 });
    const res = await H.authed('/api/ai-coach/code-review', { method: 'POST' });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal Server Error' });
  });
});

describe('GET /api/ai-coach/review-history (tier 2)', () => {
  it("returns only the caller's reviews, newest first, at most 20", async () => {
    const H = makeHarness({ plan: 2 });
    for (let i = 1; i <= 25; i += 1) {
      H.db.state.code_reviews.push({ id: i, user_id: 1, language: 'js', review_type: 'full', score: i, issues_count: 1, code_snippet: 's', created_at: new Date(i * 1000) });
    }
    H.db.state.code_reviews.push({ id: 99, user_id: 2, language: 'js', review_type: 'full', score: 1, issues_count: 1, code_snippet: 'other', created_at: new Date(1e9) });
    const res = await H.authed('/api/ai-coach/review-history');
    expect(res.status).toBe(200);
    const { reviews } = await res.json();
    expect(reviews).toHaveLength(20);
    expect(reviews[0].id).toBe(25);
    expect(reviews.every((r) => r.id !== 99)).toBe(true);
    expect(Object.keys(reviews[0])).toEqual(['id', 'language', 'review_type', 'score', 'issues_count', 'code_snippet', 'created_at']);
  });

  it('a database error is swallowed into { reviews: [] } (HTTP 200), as on Express', async () => {
    const H = makeHarness({ plan: 2 });
    H.db.breakTable('code_reviews');
    const res = await H.authed('/api/ai-coach/review-history');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ reviews: [] });
    expect(error).toHaveBeenCalledWith('Review history error:', expect.stringContaining('code_reviews'));
  });
});

describe('aiClient wiring (Worker-specific safety)', () => {
  it('a missing aiClient service is a loud masked 500, not a silent fallback', async () => {
    const H = makeHarness({ plan: 3, ai: {} }); // registered but without callAI
    const res = await H.authed('/api/ai-coach/recommendations', { method: 'POST', body: {} });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal Server Error' });
    expect(error.mock.calls.flat().join(' ')).toContain('aiClient service is not registered');
  });

  it('career-score never touches the AI service', async () => {
    const H = makeHarness({ plan: 3, ai: {} });
    expect((await H.authed('/api/ai-coach/career-score')).status).toBe(200);
  });

  it('never writes to the schema: no DDL is issued by any endpoint (no bootstrap on Workers)', async () => {
    const H = makeHarness({ plan: 3 });
    await H.authed('/api/ai-coach/career-score');
    await H.authed('/api/ai-coach/recommendations', { method: 'POST', body: {} });
    await H.authed('/api/ai-coach/review-history');
    expect(H.db.callsMatching(/CREATE TABLE|ALTER TABLE|DROP /i)).toEqual([]);
    expect(warn).not.toHaveBeenCalledWith(expect.stringContaining('table check'), expect.anything());
  });
});
