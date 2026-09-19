'use strict';

/**
 * routes/learningModules.js (6 endpoints; the two module-assessment ones are requirePlan(3)).
 * Static data (src/data/modules.json, questions.json) is read by the tests themselves to derive expectations.
 */
const modulesData = require('../../../src/data/modules.json');
const questionsData = require('../../../src/data/questions.json');
const { build, quietConsole } = require('./helpers');

quietConsole();

const TRACK_IDS = Object.keys(modulesData);
const FIRST = TRACK_IDS[0];
const AI_QUESTIONS = { questions: [{ id: 'q1', type: 'mcq', text: 'T?', options: ['a', 'b', 'c', 'd'], correct: 1, topic: 'x', explanation: 'e' }] };

describe('GET /api/learning-modules/tracks', () => {
  it('lists every track with derived totals, and is not shadowed by /:trackId', async () => {
    const H = build();
    const res = await H.get('/api/learning-modules/tracks');
    expect(res.status).toBe(200);
    const { tracks } = await res.json();
    expect(tracks.map((t) => t.id)).toEqual(TRACK_IDS);
    const t0 = tracks[0];
    const src = modulesData[FIRST];
    expect(Object.keys(t0)).toEqual(['id', 'name', 'icon', 'skills', 'moduleCount', 'totalSubtopics', 'estimatedHours']);
    expect(t0).toEqual({
      id: src.id,
      name: src.name,
      icon: src.icon,
      skills: src.skills,
      moduleCount: src.moduleCount,
      totalSubtopics: src.modules.reduce((n, m) => n + m.subtopics.length, 0),
      estimatedHours: src.modules.reduce((n, m) => n + m.estimatedHours, 0),
    });
  });
});

describe('GET /api/learning-modules/:trackId', () => {
  it('returns the track summary with light module rows (no subtopics/resources)', async () => {
    const H = build();
    const res = await H.get(`/api/learning-modules/${FIRST}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    const src = modulesData[FIRST];
    expect(Object.keys(body)).toEqual(['id', 'name', 'icon', 'skills', 'modules']);
    expect(body.modules).toHaveLength(src.modules.length);
    expect(Object.keys(body.modules[0])).toEqual(['id', 'topic', 'order', 'description', 'subtopicCount', 'estimatedHours', 'prerequisites']);
    expect(body.modules[0]).toEqual({
      id: src.modules[0].id,
      topic: src.modules[0].topic,
      order: src.modules[0].order,
      description: src.modules[0].description,
      subtopicCount: src.modules[0].subtopics.length,
      estimatedHours: src.modules[0].estimatedHours,
      prerequisites: src.modules[0].prerequisites,
    });
  });

  it('unknown track -> 404 {error:"Track not found"}', async () => {
    const H = build();
    const res = await H.get('/api/learning-modules/nope');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Track not found' });
  });

  it('a prototype key ("constructor") passes the plain-object lookup and dies on track.modules: masked 500 (preserved)', async () => {
    const H = build();
    const res = await H.get('/api/learning-modules/constructor');
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal Server Error' });
  });

  it('GET /knowledge-check is NOT the POST route: it is read as a track id (404)', async () => {
    const H = build();
    const res = await H.get('/api/learning-modules/knowledge-check');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Track not found' });
  });
});

describe('GET /api/learning-modules/:trackId/:moduleId', () => {
  it('returns the full module object', async () => {
    const H = build();
    const mod = modulesData[FIRST].modules[0];
    const res = await H.get(`/api/learning-modules/${FIRST}/${mod.id}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(mod);
  });

  it('unknown track -> "Track not found"; unknown module -> "Module not found" (both 404)', async () => {
    const H = build();
    const r1 = await H.get('/api/learning-modules/nope/anything');
    expect(r1.status).toBe(404);
    expect(await r1.json()).toEqual({ error: 'Track not found' });
    const r2 = await H.get(`/api/learning-modules/${FIRST}/nope`);
    expect(r2.status).toBe(404);
    expect(await r2.json()).toEqual({ error: 'Module not found' });
  });
});

describe('POST /api/learning-modules/knowledge-check', () => {
  const post = (H, body) => H.post('/api/learning-modules/knowledge-check', body);

  it('400 unless "skills" is a non-empty array', async () => {
    const H = build();
    for (const body of [{}, { skills: 'react' }, { skills: [] }, { skills: null }]) {
      const res = await post(H, body);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'skills array is required' });
    }
  });

  it('builds 3 MCQs per skill from the mapped group, with a consistent correct index', async () => {
    const H = build();
    const res = await post(H, { skills: ['React', ' JavaScript '] });
    expect(res.status).toBe(200);
    const { checks } = await res.json();
    expect(checks.map((c) => c.skill)).toEqual(['React', ' JavaScript ']); // original spelling echoed
    const reactAnswers = questionsData.filter((q) => q.group === 'react');
    for (const [i, { questions }] of checks.entries()) {
      expect(questions).toHaveLength(3);
      const group = i === 0 ? 'react' : 'javascript';
      const pool = questionsData.filter((q) => q.group === group);
      questions.forEach((q, n) => {
        expect(q.id).toBe(`${i === 0 ? 'react' : 'javascript'}-kc-${n}`);
        expect(q.skill).toBe(i === 0 ? 'React' : ' JavaScript ');
        expect(Object.keys(q)).toEqual(['id', 'skill', 'question', 'options', 'correct', 'difficulty']);
        expect(q.options).toHaveLength(4);
        const source = pool.find((p) => p.question === q.question);
        expect(source).toBeDefined();
        const correctSnippet = source.answer.split('\n').filter((l) => l.trim())[0]?.substring(0, 200) || source.answer.substring(0, 200);
        expect(q.options[q.correct]).toBe(correctSnippet);
        expect(q.difficulty).toBe(source.difficulty);
      });
    }
    expect(reactAnswers.length).toBeGreaterThanOrEqual(3);
  });

  it('an unmapped skill falls back to the full-stack group, and mapped groups (python, docker) all have questions', async () => {
    const H = build();
    const { checks } = await (await post(H, { skills: ['cobol'] })).json();
    expect(checks).toHaveLength(1);
    const fullStack = questionsData.filter((q) => q.group === 'full-stack').map((q) => q.question);
    for (const q of checks[0].questions) expect(fullStack).toContain(q.question);

    const res = await (await post(H, { skills: ['python', 'docker'] })).json();
    expect(res.checks.map((c) => c.skill)).toEqual(['python', 'docker']);
  });

  it('no body -> masked 500; a non-string skill -> masked 500 (uncaught TypeError, as in Express)', async () => {
    const H = build();
    for (const body of [undefined, { skills: [42] }]) {
      const res = await post(H, body);
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: 'Internal Server Error' });
    }
  });
});

describe('POST /api/learning-modules/module-assessment (requirePlan(3))', () => {
  const post = (H, body) => H.post('/api/learning-modules/module-assessment', body);

  it('400 unless moduleId and a non-empty topics array are given', async () => {
    const H = build({ plan: 3 });
    for (const body of [{}, { moduleId: 'm1' }, { moduleId: 'm1', topics: [] }, { moduleId: 'm1', topics: 'x' }, { topics: ['a'] }]) {
      const res = await post(H, body);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'moduleId and topics array are required' });
    }
    expect(H.ai.callAI).not.toHaveBeenCalled();
  });

  it('AI success: returns the AI questions with aiPowered true and an id built from moduleId + timestamp', async () => {
    const H = build({ plan: 3 });
    H.ai.callAI.mockResolvedValueOnce({ ok: true, data: JSON.stringify(AI_QUESTIONS) });
    const before = Date.now();
    const res = await post(H, { moduleId: 'react__hooks', topics: ['useState', 'useEffect'], difficulty: 'intermediate' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Object.keys(body)).toEqual(['assessmentId', 'moduleId', 'questions', 'aiPowered']);
    expect(body.assessmentId).toMatch(/^react__hooks-\d+$/);
    expect(Number(body.assessmentId.split('-').pop())).toBeGreaterThanOrEqual(before);
    expect(body).toMatchObject({ moduleId: 'react__hooks', questions: AI_QUESTIONS.questions, aiPowered: true });

    const args = H.ai.callAI.mock.calls[0][0];
    expect(args).toMatchObject({ maxTokens: 2000, temperature: 0.5, cache: false });
    expect(Object.keys(args).sort()).toEqual(['cache', 'maxTokens', 'systemPrompt', 'temperature', 'userPrompt']);
    expect(args.systemPrompt).toContain('- Difficulty: intermediate');
    expect(args.userPrompt).toContain('Create an 8-question assessment for a student who just completed a module on: useState, useEffect');
    expect(args.userPrompt).toContain('Difficulty level: intermediate');
  });

  it('difficulty defaults to "beginner"', async () => {
    const H = build({ plan: 3 });
    await post(H, { moduleId: 'm', topics: ['a'] });
    expect(H.ai.callAI.mock.calls[0][0].userPrompt).toContain('Difficulty level: beginner');
  });

  it('AI unavailable: 8-question fallback for two topics, aiPowered false', async () => {
    const H = build({ plan: 3 });
    const body = await (await post(H, { moduleId: 'm', topics: ['Closures', 'Scope'] })).json();
    expect(body.aiPowered).toBe(false);
    // min(4, topics + 2) = 4 mcq, then 2 short-answer, 1 system-design, 1 coding
    expect(body.questions.map((q) => q.type)).toEqual(['mcq', 'mcq', 'mcq', 'mcq', 'short-answer', 'short-answer', 'system-design', 'coding']);
    expect(body.questions.map((q) => q.id)).toEqual(['q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7', 'q8']);
    expect(body.questions.map((q) => q.topic)).toEqual(['Closures', 'Scope', 'Closures', 'Scope', 'Closures', 'Closures', 'Closures', 'Closures']);
    expect(body.questions[0]).toEqual({
      id: 'q1',
      type: 'mcq',
      text: 'Which of the following best describes Closures?',
      options: [
        'Closures is a fundamental concept used in modern software development for building efficient applications.',
        'Closures is a deprecated technology that is no longer used in production environments.',
        'Closures is exclusively a database technology used for data warehousing.',
        'Closures is a hardware specification standard for IoT devices.',
      ],
      correct: 0,
      topic: 'Closures',
      explanation: 'Closures is indeed a fundamental concept in software development.',
    });
    expect(body.questions[5].text).toBe('What are the key differences between Closures and Scope?');
    expect(body.questions[5].correctKeywords).toEqual(['closures', 'difference']);
    expect(body.questions[6].text).toBe('If you were building a web application that uses Closures and Scope, how would you structure the project? Describe your approach.');
    expect(body.questions[7].starterCode).toBe('// Demonstrate your understanding of Closures\n// Write your code below\n\n');
  });

  it('fallback with a single topic has 3 MCQs (min(4, 1 + 2)) and compares the topic with itself', async () => {
    const H = build({ plan: 3 });
    const body = await (await post(H, { moduleId: 'm', topics: ['Hooks'] })).json();
    expect(body.questions).toHaveLength(7);
    expect(body.questions.filter((q) => q.type === 'mcq')).toHaveLength(3);
    expect(body.questions[3].text).toBe('Explain in your own words what Hooks is and why it is important in software development.');
    expect(body.questions[3].id).toBe('q4'); // ids continue after the last mcq
    expect(body.questions[4].text).toBe('What are the key differences between Hooks and Hooks?');
  });

  it('AI returns unusable JSON, or an empty question list: fallback used but aiPowered stays true (preserved)', async () => {
    const H = build({ plan: 3 });
    H.ai.callAI.mockResolvedValueOnce({ ok: true, data: 'not json' });
    const a = await (await post(H, { moduleId: 'm', topics: ['a'] })).json();
    expect(a.aiPowered).toBe(true);
    expect(a.questions).toHaveLength(7);

    H.ai.callAI.mockResolvedValueOnce({ ok: true, data: '{"questions":[]}' });
    const b = await (await post(H, { moduleId: 'm', topics: ['a'] })).json();
    expect(b.aiPowered).toBe(true);
    expect(b.questions).toHaveLength(7);
  });

  it('no body is the route-level 500 (the destructure is inside its try/catch)', async () => {
    const H = build({ plan: 3 });
    const res = await post(H, undefined);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Failed to generate assessment' });
  });

  it('an AI client that throws is also the route-level 500', async () => {
    const H = build({ plan: 3 });
    H.ai.callAI.mockRejectedValueOnce(new Error('network'));
    const res = await post(H, { moduleId: 'm', topics: ['a'] });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Failed to generate assessment' });
  });
});

describe('POST /api/learning-modules/module-assessment/submit (requirePlan(3))', () => {
  const post = (H, body) => H.post('/api/learning-modules/module-assessment/submit', body);
  const QUESTIONS = [
    { id: 'q1', type: 'mcq', topic: 'a', correct: 1, explanation: 'why 1' },
    { id: 'q2', type: 'mcq', topic: 'b', correct: 0 },
    { id: 'q3', type: 'short-answer', topic: 'c', correctKeywords: ['closure', 'scope'], explanation: 'exp3' },
    { id: 'q4', type: 'system-design', topic: 'd', correctKeywords: ['api', 'cache', 'queue', 'db'] },
    { id: 'q5', type: 'coding', topic: 'e' },
  ];

  it('400s: missing fields, non-object answers, non-array questions', async () => {
    const H = build({ plan: 3 });
    const cases = [
      [{}, 'assessmentId, moduleId, and answers are required'],
      [{ assessmentId: 'a', moduleId: 'm' }, 'assessmentId, moduleId, and answers are required'],
      [{ assessmentId: 'a', moduleId: 'm', answers: 'str' }, 'assessmentId, moduleId, and answers are required'],
      [{ assessmentId: 'a', moduleId: 'm', answers: null }, 'assessmentId, moduleId, and answers are required'],
      [{ assessmentId: 'a', moduleId: 'm', answers: {} }, 'questions array is required for grading'],
      [{ assessmentId: 'a', moduleId: 'm', answers: {}, questions: 'x' }, 'questions array is required for grading'],
    ];
    for (const [body, error] of cases) {
      const res = await post(H, body);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error });
    }
  });

  it('grades each question type and reports score / pass / message', async () => {
    const H = build({ plan: 3 });
    const answers = {
      q1: '1', // mcq, string index parsed with parseInt -> correct
      q2: 1, // mcq wrong (parseInt(1) = 1 !== 0)
      q3: 'a closure captures its lexical scope for later', // >= 20 chars, 2 of 2 keywords
      q4: 'use an api and a cache', // 2 of 4 keywords = ceil(4 * 0.5) -> correct
      q5: 'function x() { return 1; } // short', // 35 chars >= 30 -> correct
    };
    const res = await post(H, { assessmentId: 'A-1', moduleId: 'm', answers, questions: QUESTIONS });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Object.keys(body)).toEqual(['assessmentId', 'moduleId', 'score', 'correct', 'total', 'passed', 'results', 'message']);
    expect(body).toMatchObject({ assessmentId: 'A-1', moduleId: 'm', score: 80, correct: 4, total: 5, passed: true });
    expect(body.message).toBe('Congratulations! You passed the assessment. The next module is now unlocked.');
    expect(body.results).toEqual([
      { questionId: 'q1', type: 'mcq', topic: 'a', userAnswer: '1', isCorrect: true, explanation: 'why 1' },
      { questionId: 'q2', type: 'mcq', topic: 'b', userAnswer: 1, isCorrect: false, explanation: '' },
      { questionId: 'q3', type: 'short-answer', topic: 'c', userAnswer: answers.q3, isCorrect: true, explanation: 'exp3' },
      { questionId: 'q4', type: 'system-design', topic: 'd', userAnswer: answers.q4, isCorrect: true, explanation: '' },
      { questionId: 'q5', type: 'coding', topic: 'e', userAnswer: answers.q5, isCorrect: true, explanation: '' },
    ]);
  });

  it('too-short or keyword-poor answers are wrong; below 60 does not pass and gets the retry message', async () => {
    const H = build({ plan: 3 });
    const answers = { q1: '0', q3: 'closure', q4: 'api', q5: 'x'.repeat(29) };
    const body = await (await post(H, { assessmentId: 'A', moduleId: 'm', answers, questions: QUESTIONS })).json();
    expect(body).toMatchObject({ score: 0, correct: 0, total: 5, passed: false });
    expect(body.message).toBe('You did not pass this time. Review the explanations below and try again.');
    expect(body.results.map((r) => r.isCorrect)).toEqual([false, false, false, false, false]);
  });

  it('exactly 60 passes; user answers are truncated to 500 chars in the echo; non-string free-text answers are wrong', async () => {
    const H = build({ plan: 3 });
    const long = 'closure scope ' + 'y'.repeat(600);
    const qs = [
      { id: 'a', type: 'short-answer', correctKeywords: ['closure'], topic: 't' },
      { id: 'b', type: 'short-answer', correctKeywords: ['closure'], topic: 't' },
      { id: 'c', type: 'coding', topic: 't' },
      { id: 'd', type: 'short-answer', correctKeywords: ['x'], topic: 't' },
      { id: 'e', type: 'unknown-type', topic: 't' },
    ];
    const body = await (
      await post(H, { assessmentId: 'A', moduleId: 'm', answers: { a: long, b: 12345, c: long, d: ['x'] }, questions: qs })
    ).json();
    expect(body.results[0].userAnswer).toHaveLength(500);
    expect(body.results[1].userAnswer).toBe(12345); // non-strings are echoed untouched
    expect(body.results.map((r) => r.isCorrect)).toEqual([true, false, true, false, false]);
    expect(body).toMatchObject({ correct: 2, total: 5, score: 40, passed: false });

    const sixty = await (
      await post(H, {
        assessmentId: 'A', moduleId: 'm',
        answers: { a: long, b: long, c: long },
        questions: [qs[0], qs[1], qs[2], { id: 'x', type: 'mcq', correct: 0 }, { id: 'y', type: 'mcq', correct: 0 }].slice(0, 5),
      })
    ).json();
    expect(sixty).toMatchObject({ correct: 3, total: 5, score: 60, passed: true });
  });

  it('an empty questions array scores 0 and does not pass', async () => {
    const H = build({ plan: 3 });
    const body = await (await post(H, { assessmentId: 'A', moduleId: 'm', answers: {}, questions: [] })).json();
    expect(body).toMatchObject({ score: 0, correct: 0, total: 0, passed: false, results: [] });
  });

  it('a malformed question entry (null) is the route-level 500', async () => {
    const H = build({ plan: 3 });
    const res = await post(H, { assessmentId: 'A', moduleId: 'm', answers: {}, questions: [null] });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Failed to evaluate assessment' });
  });

  it('no body is the route-level 500', async () => {
    const H = build({ plan: 3 });
    const res = await post(H, undefined);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Failed to evaluate assessment' });
  });
});
