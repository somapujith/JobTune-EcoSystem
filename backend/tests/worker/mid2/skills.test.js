'use strict';

/**
 * routes/skills.js  (GET /questions, POST /assessment, GET /history; all authenticateToken + requirePlan(1)).
 * Expectations were derived from reading backend/src/routes/skills.js and backend/tests/skills.routes.test.js.
 * Fakes only: AI is an injected stub, the db is the in-memory fake in ./helpers.
 */
const { build, quietConsole, USER_ID, OTHER_USER_ID } = require('./helpers');

quietConsole();

const AI_OK = {
  strengths: ['React.js'],
  gaps: ['System Design'],
  role_matches: ['Junior Developer'],
  analysis: 'Good foundation.',
  scores: { technical_depth: 65, problem_solving: 70, communication: 75, industry_readiness: 60 },
  recommendations: [{ skill: 'SQL', action: 'practice', resource: 'docs', timeframe: '2 weeks' }],
};
const ANSWERS = [
  { questionId: 't1', questionText: 'What is React?', answer: 'A library for building UIs with hooks and a virtual DOM', category: 'React', difficulty: 'easy' },
];

describe('GET /api/skills/questions', () => {
  it('returns 8 questions (4 technical + 2 behavioral + 2 coding) at medium difficulty by default', async () => {
    const H = build({ plan: 1 });
    const res = await H.get('/api/skills/questions');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Object.keys(body)).toEqual(['questions', 'total', 'difficulty']);
    expect(body.difficulty).toBe('medium');
    expect(body.total).toBe(8);
    expect(body.questions).toHaveLength(8);
    const kinds = body.questions.map((q) => q.id[0]);
    expect(kinds.filter((k) => k === 't')).toHaveLength(4);
    expect(kinds.filter((k) => k === 'b')).toHaveLength(2);
    expect(kinds.filter((k) => k === 'c')).toHaveLength(2);
    for (const q of body.questions) expect(Object.keys(q).sort()).toEqual(['category', 'difficulty', 'id', 'text']);
  });

  it('echoes the difficulty query verbatim; unknown values still yield questions (targetNum falls back to 2)', async () => {
    const H = build({ plan: 1 });
    for (const difficulty of ['easy', 'hard', 'bogus']) {
      const res = await H.get(`/api/skills/questions?difficulty=${difficulty}`);
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.difficulty).toBe(difficulty);
      expect(body.questions.length).toBeGreaterThan(0);
    }
  });

  it('ignores ?count (preserved: it is computed but never used), so count=50 is still 8 questions', async () => {
    const H = build({ plan: 1 });
    const body = await (await H.get('/api/skills/questions?count=50')).json();
    expect(body.total).toBe(8);
  });

  it('a repeated difficulty key arrives as an array and is echoed as such (Express querystring semantics)', async () => {
    const H = build({ plan: 1 });
    const body = await (await H.get('/api/skills/questions?difficulty=easy&difficulty=hard')).json();
    expect(body.difficulty).toEqual(['easy', 'hard']);
  });
});

describe('POST /api/skills/assessment', () => {
  it('AI success: saves the assessment and returns the DB row overlaid with the AI result', async () => {
    const H = build({ plan: 1, env: { LM_STUDIO_MODEL_SKILLS: 'skills-model-x' } });
    H.ai.callAI.mockResolvedValueOnce({ ok: true, error: null, data: JSON.stringify(AI_OK) });

    const res = await H.post('/api/skills/assessment', { answers: ANSWERS });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      id: 1,
      user_id: USER_ID,
      strengths: ['React.js'],
      gaps: ['System Design'],
      role_matches: ['Junior Developer'],
      analysis: 'Good foundation.',
      scores: AI_OK.scores,
      recommendations: AI_OK.recommendations,
      ai_powered: true,
    });
    // the row's own jsonb `skills` column holds the answers + scores
    expect(body.skills).toEqual({ answers: ANSWERS, scores: AI_OK.scores });

    // model comes from config.vars, prompt built from the new (array) answer format
    expect(H.ai.callAI).toHaveBeenCalledTimes(1);
    const args = H.ai.callAI.mock.calls[0][0];
    expect(args.model).toBe('skills-model-x');
    expect(args.maxTokens).toBe(1200);
    expect(args.systemPrompt).toContain('senior technical assessment specialist');
    expect(args.userPrompt).toBe(
      "Evaluate this candidate's technical assessment:\n\nQuestion 1 [React, easy]: What is React?\nAnswer: A library for building UIs with hooks and a virtual DOM"
    );
    expect(Object.keys(args).sort()).toEqual(['maxTokens', 'model', 'systemPrompt', 'userPrompt']);
  });

  it('inserts with the exact parameters: user id + JSON-encoded skills/strengths/gaps/role_matches', async () => {
    const H = build({ plan: 1 });
    H.ai.callAI.mockResolvedValueOnce({ ok: true, data: JSON.stringify(AI_OK) });
    await H.post('/api/skills/assessment', { answers: ANSWERS });
    const insert = H.db.mid2Calls.find((c) => c.sql.startsWith('INSERT INTO skill_assessments'));
    expect(insert.params).toEqual([
      USER_ID,
      JSON.stringify({ answers: ANSWERS, scores: AI_OK.scores }),
      JSON.stringify(['React.js']),
      JSON.stringify(['System Design']),
      JSON.stringify(['Junior Developer']),
    ]);
    const select = H.db.mid2Calls.find((c) => c.sql === 'SELECT * FROM skill_assessments WHERE id = $1');
    expect(select.params).toEqual([1]);
  });

  it('model is undefined when LM_STUDIO_MODEL_SKILLS is not configured', async () => {
    const H = build({ plan: 1 });
    await H.post('/api/skills/assessment', { answers: ANSWERS });
    expect(H.ai.callAI.mock.calls[0][0].model).toBeUndefined();
  });

  it('AI unavailable: keyword-based fallback (few strengths), ai_powered false', async () => {
    const H = build({ plan: 1 });
    const res = await H.post('/api/skills/assessment', { answers: [{ ...ANSWERS[0], answer: 'React with hooks and SQL' }] });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.ai_powered).toBe(false);
    // hand-computed from generateFallbackAnalysis: 2 detected strengths, 5 words
    expect(body.strengths).toEqual(['React.js', 'SQL / Databases']);
    expect(body.gaps).toEqual(['System Design', 'Cloud Fundamentals (AWS/GCP)', 'CI/CD Pipelines', 'Testing & TDD']);
    expect(body.role_matches).toEqual(['Junior Developer', 'Frontend Trainee', 'Intern - Software Engineering']);
    expect(body.scores).toEqual({ technical_depth: 55, problem_solving: 56, communication: 40, industry_readiness: 44 });
    expect(body.recommendations).toEqual([]);
    expect(body.analysis).toBe(
      'Based on your responses, you demonstrate foundational technical knowledge with notable strength in React.js. ' +
        'Focus on bridging gaps in System Design and Cloud Fundamentals (AWS/GCP) to become more competitive. ' +
        'Your communication style is concise but could use more depth.'
    );
  });

  it('AI unavailable: 3+ detected strengths switch the role matches and lift the scores', async () => {
    const H = build({ plan: 1 });
    const body = await (
      await H.post('/api/skills/assessment', {
        answers: [{ ...ANSWERS[0], answer: 'React with hooks, a Node.js API, async promises and SQL' }],
      })
    ).json();
    // techMap order: react, node, sql, api, async (promise is a duplicate of async)
    expect(body.strengths).toEqual(['React.js', 'Node.js', 'SQL / Databases', 'API Design', 'Async Programming']);
    expect(body.role_matches).toEqual(['Junior Full Stack Developer', 'SDE-1 (Frontend)', 'React Developer']);
    expect(body.scores).toEqual({ technical_depth: 85, problem_solving: 80, communication: 41, industry_readiness: 65 });
    expect(body.analysis).toMatch(/^Based on your responses, you demonstrate solid technical knowledge/);
  });

  it('AI returns unparseable text: fallback analysis is used but ai_powered stays TRUE (preserved quirk)', async () => {
    const H = build({ plan: 1 });
    H.ai.callAI.mockResolvedValueOnce({ ok: true, data: 'sorry, no JSON here' });
    const body = await (await H.post('/api/skills/assessment', { answers: ANSWERS })).json();
    expect(body.ai_powered).toBe(true);
    expect(body.role_matches).toEqual(['Junior Developer', 'Frontend Trainee', 'Intern - Software Engineering']);
  });

  it('AI returns JSON without strengths/gaps: fallback again', async () => {
    const H = build({ plan: 1 });
    H.ai.callAI.mockResolvedValueOnce({ ok: true, data: '{"analysis":"x"}' });
    const body = await (await H.post('/api/skills/assessment', { answers: ANSWERS })).json();
    expect(body.strengths).toBeDefined();
    expect(body.analysis).toMatch(/^Based on your responses/);
  });

  it('legacy answer format ({question_id: answer}) builds the four legacy questions', async () => {
    const H = build({ plan: 1 });
    const res = await H.post('/api/skills/assessment', { answers: { 1: 'I use redux', 2: 'The event loop', '3': 'add an index' } });
    expect(res.status).toBe(200);
    const prompt = H.ai.callAI.mock.calls[0][0].userPrompt;
    expect(prompt).toContain('**Q (React):** How do you handle state in a large React application?\n**A:** I use redux');
    expect(prompt).toContain('**Q (Database):** How would you optimize a slow SQL query?\n**A:** add an index');
    expect(prompt).toContain('**Q (Soft Skills):** Describe a time you resolved a conflict with a teammate.\n**A:** (no answer provided)');
    // the raw answers object is what gets stored
    const insert = H.db.mid2Calls.find((c) => c.sql.startsWith('INSERT INTO skill_assessments'));
    expect(JSON.parse(insert.params[1]).answers).toEqual({ 1: 'I use redux', 2: 'The event loop', 3: 'add an index' });
  });

  it('a request with no JSON body is a masked 500 (Express: destructuring undefined -> errorHandler)', async () => {
    const H = build({ plan: 1 });
    const res = await H.post('/api/skills/assessment', undefined);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal Server Error' });
    expect(H.ai.callAI).not.toHaveBeenCalled();
  });

  it('a body without "answers" reaches the legacy branch and fails on answers[q.id] (masked 500, no AI call)', async () => {
    const H = build({ plan: 1 });
    const res = await H.post('/api/skills/assessment', {});
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal Server Error' });
    expect(H.ai.callAI).not.toHaveBeenCalled();
  });

  it('a database failure is a masked 500 (next(err) semantics), never leaking the driver message', async () => {
    const H = build({ plan: 1 });
    H.db.failWhen((sql) => sql.startsWith('INSERT INTO skill_assessments'), new Error('connection to server at "10.0.0.5" refused'));
    const res = await H.post('/api/skills/assessment', { answers: ANSWERS });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal Server Error' });
  });
});

describe('GET /api/skills/history', () => {
  it('returns {history: []} when the user has none', async () => {
    const H = build({ plan: 1 });
    const res = await H.get('/api/skills/history');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ history: [] });
    expect(H.db.mid2Calls[0].params).toEqual([USER_ID]);
  });

  it('maps rows (jsonb objects or JSON strings), newest first, own rows only, max 10', async () => {
    const H = build({ plan: 1 });
    const t = (n) => new Date(Date.UTC(2026, 0, n));
    H.db.add('skill_assessments', {
      id: 1, user_id: USER_ID, created_at: t(1),
      skills: JSON.stringify({ scores: { technical_depth: 50 } }), strengths: JSON.stringify(['a']), gaps: JSON.stringify(['b']), role_matches: JSON.stringify(['c']),
    });
    H.db.add('skill_assessments', {
      id: 2, user_id: USER_ID, created_at: t(2),
      skills: { scores: { technical_depth: 80 } }, strengths: ['x'], gaps: ['y'], role_matches: ['z'],
    });
    H.db.add('skill_assessments', { id: 3, user_id: OTHER_USER_ID, created_at: t(3), skills: {}, strengths: [], gaps: [], role_matches: [] });

    const body = await (await H.get('/api/skills/history')).json();
    expect(body.history.map((h) => h.id)).toEqual([2, 1]);
    expect(body.history[0]).toEqual({
      id: 2, scores: { technical_depth: 80 }, strengths: ['x'], gaps: ['y'], roleMatches: ['z'], createdAt: t(2).toISOString(),
    });
    expect(body.history[1].scores).toEqual({ technical_depth: 50 });
    expect(body.history[1].strengths).toEqual(['a']);
    expect(body.history[1].roleMatches).toEqual(['c']);
  });

  it('a row whose skills JSON is corrupt still yields scores {} (inner try/catch), but corrupt strengths is a 500 (preserved)', async () => {
    const H = build({ plan: 1 });
    H.db.add('skill_assessments', {
      id: 1, user_id: USER_ID, created_at: new Date(), skills: '{not json', strengths: ['a'], gaps: ['b'], role_matches: ['c'],
    });
    const ok = await (await H.get('/api/skills/history')).json();
    expect(ok.history[0].scores).toEqual({});

    H.db.tables.skill_assessments[0].strengths = '{broken';
    const res = await H.get('/api/skills/history');
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Failed to fetch assessment history' });
  });

  it('a database failure is the route-level 500 with its own message (not the masked one)', async () => {
    const H = build({ plan: 1 });
    H.db.failWhen((sql) => sql.startsWith('SELECT id, skills, strengths'), new Error('boom'));
    const res = await H.get('/api/skills/history');
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Failed to fetch assessment history' });
  });
});
