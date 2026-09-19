'use strict';

/**
 * routes/studyTools.js: POST /notes/generate, /flashcards/generate, /quiz/generate, /quiz/submit
 * (all authenticateToken + requirePlan(1)). studyHistoryService is the leaf2 slice's service, injected as a fake
 * with the same saveSession(userId, {...}) API.
 */
const { build, quietConsole, USER_ID } = require('./helpers');

quietConsole();

const TOPIC_ERR = { error: 'Topic must be at least 3 characters' };

describe('POST /api/study-tools/notes/generate', () => {
  const gen = (H, body) => H.post('/api/study-tools/notes/generate', body);

  it('400 for a missing / too short topic (trimmed length < 3), without calling AI or history', async () => {
    const H = build({ plan: 1 });
    for (const body of [{}, { topic: '' }, { topic: 'ab' }, { topic: '  a ' }, { type: 'mindmap' }]) {
      const res = await gen(H, body);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual(TOPIC_ERR);
    }
    expect(H.ai.callAI).not.toHaveBeenCalled();
    expect(H.studyHistory.saveSession).not.toHaveBeenCalled();
  });

  it('AI success (detailed by default): returns {success, data} and records the session', async () => {
    const H = build({ plan: 1 });
    const notes = { title: 'Closures', type: 'detailed', keyConcepts: [] };
    H.ai.callAI.mockResolvedValueOnce({ ok: true, data: JSON.stringify(notes) });

    const res = await gen(H, { topic: 'Closures' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, data: notes });

    const args = H.ai.callAI.mock.calls[0][0];
    expect(args).toMatchObject({ maxTokens: 1200, temperature: 0.5, structuredJson: true });
    expect(Object.keys(args).sort()).toEqual(['maxTokens', 'structuredJson', 'systemPrompt', 'temperature', 'userPrompt']);
    expect(args.systemPrompt).toContain('comprehensive study expert');
    expect(args.userPrompt.startsWith('Generate detailed study notes for: Closures\n\nReturn ONLY this JSON:\n{\n  "title": "Closures",')).toBe(true);

    expect(H.studyHistory.saveSession).toHaveBeenCalledTimes(1);
    expect(H.studyHistory.saveSession).toHaveBeenCalledWith(USER_ID, {
      sessionType: 'notes',
      topic: 'Closures',
      difficulty: null,
      score: null,
      totalQuestions: null,
      timeSpentSeconds: null,
      data: { type: 'detailed', title: 'Closures' },
    });
  });

  it.each([
    ['mindmap', 800, 'visual mind maps', 'Create a mind map outline for: Photosynthesis\n\nReturn ONLY this JSON:'],
    ['revision', 600, 'revision notes optimized for spaced repetition', 'Create concise revision notes for: Photosynthesis\n\nReturn ONLY this JSON:'],
    ['detailed', 1200, 'comprehensive study expert', 'Generate detailed study notes for: Photosynthesis'],
    ['anything-else', 1200, 'comprehensive study expert', 'Generate detailed study notes for: Photosynthesis'],
  ])('type %s selects maxTokens %i and its prompt', async (type, maxTokens, systemBit, userStart) => {
    const H = build({ plan: 1 });
    await gen(H, { topic: 'Photosynthesis', type });
    const args = H.ai.callAI.mock.calls[0][0];
    expect(args.maxTokens).toBe(maxTokens);
    expect(args.systemPrompt).toContain(systemBit);
    expect(args.userPrompt.startsWith(userStart)).toBe(true);
  });

  it('the saved session title falls back to the topic when the AI notes have no title', async () => {
    const H = build({ plan: 1 });
    H.ai.callAI.mockResolvedValueOnce({ ok: true, data: '{"foo":1}' });
    await gen(H, { topic: 'Tries', type: 'revision' });
    expect(H.studyHistory.saveSession.mock.calls[0][1].data).toEqual({ type: 'revision', title: 'Tries' });
  });

  describe('fallback notes (AI unavailable, empty, or unparseable)', () => {
    it('mindmap', async () => {
      const H = build({ plan: 1 });
      const res = await gen(H, { topic: 'Graphs', type: 'mindmap' });
      const { success, data } = await res.json();
      expect(success).toBe(true);
      expect(data.title).toBe('Graphs');
      expect(data.type).toBe('mindmap');
      expect(data.content.startsWith('Graphs\n├── Core Concepts\n│   ├── Definition & Overview')).toBe(true);
      expect(data.content.endsWith('    └── Online Courses')).toBe(true);
    });

    it('revision', async () => {
      const H = build({ plan: 1 });
      const { data } = await (await gen(H, { topic: 'Graphs', type: 'revision' })).json();
      expect(data).toEqual({
        title: 'Graphs - Revision Notes',
        type: 'revision',
        keyConcepts: [
          'Graphs is a fundamental concept in its domain',
          'Understanding the core principles is essential',
          'Practice with real-world examples solidifies learning',
        ],
        summary: 'Graphs covers essential concepts that form the foundation of the subject. Focus on understanding the why behind each concept, not just the how.',
        keyTakeaways: [
          'Master the fundamentals before advanced topics',
          'Apply concepts through hands-on projects',
          'Review regularly using spaced repetition',
        ],
      });
    });

    it('detailed (also for an unknown type) and the history entry records the requested type', async () => {
      const H = build({ plan: 1 });
      const { data } = await (await gen(H, { topic: 'Graphs', type: 'weird' })).json();
      expect(data.type).toBe('detailed');
      expect(data.title).toBe('Graphs');
      expect(data.keyConcepts).toHaveLength(3);
      expect(data.keyConcepts[0]).toEqual({ term: 'Core Definition', description: 'The fundamental meaning and scope of Graphs' });
      expect(data.codeExamples).toEqual([]);
      expect(data.keyTakeaways).toHaveLength(4);
      // history stores the REQUESTED type ('weird'), not the fallback's 'detailed'
      expect(H.studyHistory.saveSession.mock.calls[0][1].data).toEqual({ type: 'weird', title: 'Graphs' });
    });

    it.each([
      ['ok but empty data', { ok: true, data: '' }],
      ['ok but not JSON', { ok: true, data: 'sorry, cannot comply' }],
      ['ok but JSON null', { ok: true, data: 'null' }],
      ['not ok', { ok: false, error: 'down', data: null }],
    ])('AI result %s -> fallback notes', async (_label, aiResult) => {
      const H = build({ plan: 1 });
      H.ai.callAI.mockResolvedValueOnce(aiResult);
      const res = await gen(H, { topic: 'Graphs' });
      expect(res.status).toBe(200);
      expect((await res.json()).data.type).toBe('detailed');
    });
  });

  it('a failing history save only warns; the response is still 200 (non-blocking, preserved)', async () => {
    const H = build({ plan: 1 });
    H.studyHistory.saveSession.mockRejectedValueOnce(new Error('history down'));
    const res = await gen(H, { topic: 'Graphs' });
    expect(res.status).toBe(200);
    expect(console.warn).toHaveBeenCalledWith('Failed to save notes session:', 'history down');
  });

  it('a non-string topic or a missing body is the route-level 500', async () => {
    const H = build({ plan: 1 });
    for (const body of [{ topic: 12345 }, undefined]) {
      const res = await gen(H, body);
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: 'Failed to generate notes' });
    }
  });

  it('an AI client that throws is the route-level 500', async () => {
    const H = build({ plan: 1 });
    H.ai.callAI.mockRejectedValueOnce(new Error('network'));
    const res = await gen(H, { topic: 'Graphs' });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Failed to generate notes' });
  });

  it('if the history service is not registered the request fails loudly (masked 500) instead of silently dropping sessions', async () => {
    const H = build({ plan: 1, overrides: { studyHistoryService: undefined } });
    const res = await gen(H, { topic: 'Graphs' });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal Server Error' });
    expect(H.ai.callAI).not.toHaveBeenCalled();
    // the operator log names the wiring problem; the client never sees it
    expect(console.error.mock.calls.flat().join(' ')).toContain('studyHistoryService is not registered in the service container');
  });
});

describe('POST /api/study-tools/flashcards/generate', () => {
  const gen = (H, body) => H.post('/api/study-tools/flashcards/generate', body);

  it('400 for a missing / short topic', async () => {
    const H = build({ plan: 1 });
    for (const body of [{}, { topic: 'x' }, { count: 5 }]) {
      const res = await gen(H, body);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual(TOPIC_ERR);
    }
  });

  it.each([
    [undefined, 10],
    [2, 5],
    [5, 5],
    [12, 12],
    [100, 15],
    ['7', 7], // Math.max('7', 5) coerces
  ])('count %j is clamped to %i in the prompt', async (count, expected) => {
    const H = build({ plan: 1 });
    await gen(H, { topic: 'Sorting', ...(count === undefined ? {} : { count }) });
    const args = H.ai.callAI.mock.calls[0][0];
    expect(args.userPrompt.startsWith(`Create ${expected} study flashcards about: Sorting\n\nReturn ONLY this JSON:`)).toBe(true);
    expect(args).toMatchObject({ maxTokens: 1200, temperature: 0.6, structuredJson: true });
    expect(args.systemPrompt).toContain('proven learning science');
  });

  it('AI success accepts {flashcards: [...]} or a bare array and records the card count', async () => {
    const cards = [{ front: 'F', back: 'B', difficulty: 'easy' }, { front: 'F2', back: 'B2', difficulty: 'hard' }];
    const H = build({ plan: 1 });
    H.ai.callAI.mockResolvedValueOnce({ ok: true, data: JSON.stringify({ flashcards: cards }) });
    expect(await (await gen(H, { topic: 'Sorting' })).json()).toEqual({ success: true, data: cards });
    expect(H.studyHistory.saveSession).toHaveBeenLastCalledWith(USER_ID, {
      sessionType: 'flashcards', topic: 'Sorting', difficulty: null, score: null, totalQuestions: 2, timeSpentSeconds: null, data: { cardCount: 2 },
    });

    H.ai.callAI.mockResolvedValueOnce({ ok: true, data: JSON.stringify(cards) });
    expect(await (await gen(H, { topic: 'Sorting' })).json()).toEqual({ success: true, data: cards });
  });

  it('a non-array "flashcards" value is passed through and recorded with totalQuestions null / cardCount 0 (preserved)', async () => {
    const H = build({ plan: 1 });
    H.ai.callAI.mockResolvedValueOnce({ ok: true, data: '{"flashcards":"lots of them"}' });
    const body = await (await gen(H, { topic: 'Sorting' })).json();
    expect(body).toEqual({ success: true, data: 'lots of them' });
    expect(H.studyHistory.saveSession.mock.calls[0][1]).toMatchObject({ totalQuestions: null, data: { cardCount: 0 } });
  });

  it('fallback flashcards: min(count, 15 templates), first template is "What is <topic>?"', async () => {
    const H = build({ plan: 1 });
    const ten = (await (await gen(H, { topic: 'Sorting' })).json()).data;
    expect(ten).toHaveLength(10);
    expect(ten[0]).toEqual({
      front: 'What is Sorting?',
      back: 'Sorting is a key concept in its domain that involves understanding fundamental principles and their applications.',
      difficulty: 'easy',
    });
    expect(ten[9].front).toBe('Design a solution using Sorting principles');
    expect((await (await gen(H, { topic: 'Sorting', count: 100 })).json()).data).toHaveLength(15);
    expect((await (await gen(H, { topic: 'Sorting', count: 1 })).json()).data).toHaveLength(5);
    expect(H.studyHistory.saveSession.mock.calls[0][1]).toMatchObject({ totalQuestions: 10, data: { cardCount: 10 } });
  });

  it('an unparseable AI reply also falls back; a failing history save only warns', async () => {
    const H = build({ plan: 1 });
    H.ai.callAI.mockResolvedValueOnce({ ok: true, data: '{"x":1}' }); // object with no flashcards and not an array
    H.studyHistory.saveSession.mockRejectedValueOnce(new Error('h'));
    const res = await gen(H, { topic: 'Sorting' });
    expect(res.status).toBe(200);
    expect((await res.json()).data).toHaveLength(10);
    expect(console.warn).toHaveBeenCalledWith('Failed to save flashcards session:', 'h');
  });

  it('no body / non-string topic is the route-level 500', async () => {
    const H = build({ plan: 1 });
    for (const body of [undefined, { topic: 42 }]) {
      const res = await gen(H, body);
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: 'Failed to generate flashcards' });
    }
  });
});

describe('POST /api/study-tools/quiz/generate', () => {
  const gen = (H, body) => H.post('/api/study-tools/quiz/generate', body);

  it('400 for a missing / short topic', async () => {
    const H = build({ plan: 1 });
    const res = await gen(H, { topic: 'ab' });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual(TOPIC_ERR);
  });

  it('AI success: returns a quiz with a generated id; defaults medium difficulty and 10 questions; writes no history', async () => {
    const H = build({ plan: 1 });
    const questions = [{ question: 'Q?', options: ['a', 'b', 'c', 'd'], correct: 2, explanation: 'x' }];
    H.ai.callAI.mockResolvedValueOnce({ ok: true, data: JSON.stringify({ questions }) });
    const res = await gen(H, { topic: 'Heaps' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Object.keys(body)).toEqual(['success', 'data']);
    expect(Object.keys(body.data)).toEqual(['quizId', 'topic', 'difficulty', 'questions']);
    expect(body.data.quizId).toMatch(/^quiz_\d+_[a-z0-9]{1,6}$/);
    expect(body.data).toMatchObject({ topic: 'Heaps', difficulty: 'medium', questions });

    const args = H.ai.callAI.mock.calls[0][0];
    expect(args.userPrompt.startsWith('Create 10 medium-difficulty multiple-choice questions about: Heaps\n\nReturn ONLY this JSON:')).toBe(true);
    expect(args).toMatchObject({ maxTokens: 1200, temperature: 0.5, structuredJson: true });
    expect(args.systemPrompt).toContain('expert quiz creator');
    expect(H.studyHistory.saveSession).not.toHaveBeenCalled();
  });

  it('a bare array of questions is accepted; quiz ids are unique per call', async () => {
    const H = build({ plan: 1 });
    const questions = [{ question: 'Q?', options: [], correct: 0 }];
    H.ai.callAI.mockResolvedValue({ ok: true, data: JSON.stringify(questions) });
    const a = await (await gen(H, { topic: 'Heaps' })).json();
    const b = await (await gen(H, { topic: 'Heaps' })).json();
    expect(a.data.questions).toEqual(questions);
    expect(a.data.quizId).not.toBe(b.data.quizId);
  });

  it('honours difficulty and clamps count in the prompt', async () => {
    const H = build({ plan: 1 });
    await gen(H, { topic: 'Heaps', difficulty: 'hard', count: 99 });
    expect(H.ai.callAI.mock.calls[0][0].userPrompt.startsWith('Create 15 hard-difficulty multiple-choice questions about: Heaps')).toBe(true);
    await gen(H, { topic: 'Heaps', count: 1 });
    expect(H.ai.callAI.mock.calls[1][0].userPrompt.startsWith('Create 5 medium-difficulty')).toBe(true);
  });

  describe('fallback quiz pools', () => {
    it.each([
      ['easy', 3, 'What is the primary purpose of Heaps?'],
      ['hard', 3, 'What advanced pattern is most relevant to Heaps?'],
      ['medium', 5, 'What is the primary purpose of Heaps?'], // medium = easy[0] + 3 medium + hard[0]
      ['extreme', 5, 'What is the primary purpose of Heaps?'], // anything else is the medium mix
    ])('%s -> %i questions, first: %s', async (difficulty, count, first) => {
      const H = build({ plan: 1 });
      const { data } = await (await gen(H, { topic: 'Heaps', difficulty })).json();
      expect(data.difficulty).toBe(difficulty);
      expect(data.questions).toHaveLength(count);
      expect(data.questions[0].question).toBe(first);
      for (const q of data.questions) {
        expect(Object.keys(q)).toEqual(['question', 'options', 'correct', 'explanation']);
        expect(q.options).toHaveLength(4);
        expect(q.correct).toBe(0);
      }
    });

    it('medium pool order and a full sample question', async () => {
      const H = build({ plan: 1 });
      const { data } = await (await gen(H, { topic: 'Heaps' })).json();
      expect(data.questions.map((q) => q.question)).toEqual([
        'What is the primary purpose of Heaps?',
        'When implementing Heaps, what should you consider first?',
        'What is a common pitfall when working with Heaps?',
        'How should you handle edge cases in Heaps?',
        'What advanced pattern is most relevant to Heaps?',
      ]);
      expect(data.questions[1]).toEqual({
        question: 'When implementing Heaps, what should you consider first?',
        options: ['Requirements and constraints', 'The latest framework', 'The shortest solution', 'Personal preference only'],
        correct: 0,
        explanation: 'Always start by understanding requirements and constraints before choosing an implementation approach.',
      });
    });

    it('unusable AI output falls back too', async () => {
      const H = build({ plan: 1 });
      H.ai.callAI.mockResolvedValueOnce({ ok: true, data: '{"nothing":true}' });
      const { data } = await (await gen(H, { topic: 'Heaps' })).json();
      expect(data.questions).toHaveLength(5);
    });
  });

  it('no body / non-string topic is the route-level 500', async () => {
    const H = build({ plan: 1 });
    for (const body of [undefined, { topic: 7 }]) {
      const res = await gen(H, body);
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: 'Failed to generate quiz' });
    }
  });

  it('does not need the history service (it never writes history)', async () => {
    const H = build({ plan: 1, overrides: { studyHistoryService: undefined } });
    const res = await gen(H, { topic: 'Heaps' });
    expect(res.status).toBe(200);
  });
});

describe('POST /api/study-tools/quiz/submit', () => {
  const submit = (H, body) => H.post('/api/study-tools/quiz/submit', body);
  const questions = (n) => Array.from({ length: n }, (_, i) => ({ question: `Q${i}?`, options: ['a', 'b', 'c', 'd'], correct: i % 4, explanation: `E${i}` }));
  const answersFor = (qs, right) => qs.map((q, i) => (i < right ? q.correct : (q.correct + 1) % 4));

  it('400 unless quizId, answers and questions are all present', async () => {
    const H = build({ plan: 1 });
    for (const body of [{}, { quizId: 'q', answers: [] }, { quizId: 'q', questions: [] }, { answers: [], questions: [] }]) {
      const res = await submit(H, body);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'quizId, answers, and questions are required' });
    }
    expect(H.studyHistory.saveSession).not.toHaveBeenCalled();
  });

  it('scores, builds the breakdown, and records the session (topic, difficulty, time)', async () => {
    const H = build({ plan: 1 });
    const qs = questions(4);
    const answers = [qs[0].correct, qs[1].correct, qs[2].correct, 3]; // q3.correct is 3 % 4 = 3 -> make it wrong
    answers[3] = 0;
    const res = await submit(H, { quizId: 'quiz_1', answers, questions: qs, topic: 'Heaps', difficulty: 'hard', timeTaken: 42 });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Object.keys(body)).toEqual(['success', 'data']);
    expect(Object.keys(body.data)).toEqual(['quizId', 'topic', 'difficulty', 'score', 'correct', 'total', 'timeTaken', 'feedback', 'suggestions', 'breakdown']);
    expect(body.data).toMatchObject({
      quizId: 'quiz_1', topic: 'Heaps', difficulty: 'hard', score: 75, correct: 3, total: 4, timeTaken: 42,
      feedback: 'Great job! You have a solid understanding. Review the missed questions to strengthen weak areas.',
      suggestions: ['Review your incorrect answers and their explanations', 'Try the quiz again after reviewing to track improvement'],
    });
    expect(body.data.breakdown).toEqual([
      { question: 'Q0?', userAnswer: 0, correctAnswer: 0, isCorrect: true, explanation: 'E0' },
      { question: 'Q1?', userAnswer: 1, correctAnswer: 1, isCorrect: true, explanation: 'E1' },
      { question: 'Q2?', userAnswer: 2, correctAnswer: 2, isCorrect: true, explanation: 'E2' },
      { question: 'Q3?', userAnswer: 0, correctAnswer: 3, isCorrect: false, explanation: 'E3' },
    ]);
    expect(H.studyHistory.saveSession).toHaveBeenCalledWith(USER_ID, {
      sessionType: 'quiz',
      topic: 'Heaps',
      difficulty: 'hard',
      score: 75,
      totalQuestions: 4,
      timeSpentSeconds: 42,
      data: { correctCount: 3, wrongAnswers: [{ question: 'Q3?', userAnswer: 0, correctAnswer: 3 }] },
    });
  });

  it.each([
    [4, 100, 'Outstanding! You have excellent command of this topic.', ['Try the quiz again after reviewing to track improvement']],
    [3, 75, 'Great job! You have a solid understanding. Review the missed questions to strengthen weak areas.', ['Review your incorrect answers and their explanations', 'Try the quiz again after reviewing to track improvement']],
    [2, 50, 'Good effort! Focus on reviewing the concepts you missed and try again.', ['Review your incorrect answers and their explanations', 'Generate study notes on this topic for deeper understanding', 'Try the quiz again after reviewing to track improvement']],
    [1, 25, 'Keep studying! Review the explanations for each question and revisit the topic notes before retrying.', ['Review your incorrect answers and their explanations', 'Generate study notes on this topic for deeper understanding', 'Create flashcards to memorize key concepts', 'Try the quiz again after reviewing to track improvement']],
    [0, 0, 'Keep studying! Review the explanations for each question and revisit the topic notes before retrying.', ['Review your incorrect answers and their explanations', 'Generate study notes on this topic for deeper understanding', 'Create flashcards to memorize key concepts', 'Try the quiz again after reviewing to track improvement']],
  ])('%i of 4 correct -> score %i with the matching feedback and suggestions', async (right, score, feedback, suggestions) => {
    const H = build({ plan: 1 });
    const qs = questions(4);
    const body = await (await submit(H, { quizId: 'q', answers: answersFor(qs, right), questions: qs })).json();
    expect(body.data).toMatchObject({ score, correct: right, total: 4, feedback, suggestions });
  });

  it('answers are compared with strict equality (a numeric string is wrong); optional fields absent from the JSON when not sent', async () => {
    const H = build({ plan: 1 });
    const qs = questions(1); // correct = 0
    const body = await (await submit(H, { quizId: 'q', answers: ['0'], questions: qs })).json();
    expect(body.data.correct).toBe(0);
    expect('topic' in body.data).toBe(false);
    expect('difficulty' in body.data).toBe(false);
    expect('timeTaken' in body.data).toBe(false);
    // history defaults: topic 'Unknown', timeSpentSeconds null
    expect(H.studyHistory.saveSession.mock.calls[0][1]).toMatchObject({ topic: 'Unknown', timeSpentSeconds: null, score: 0 });
  });

  it('a timeTaken of 0 is echoed but stored as null; only the first 5 wrong answers are stored', async () => {
    const H = build({ plan: 1 });
    const qs = questions(7);
    const body = await (await submit(H, { quizId: 'q', answers: answersFor(qs, 0), questions: qs, timeTaken: 0 })).json();
    expect(body.data.timeTaken).toBe(0);
    const saved = H.studyHistory.saveSession.mock.calls[0][1];
    expect(saved.timeSpentSeconds).toBeNull();
    expect(saved.data.correctCount).toBe(0);
    expect(saved.data.wrongAnswers).toHaveLength(5);
    expect(body.data.breakdown).toHaveLength(7); // the response keeps every row
  });

  it('an empty questions array yields a NaN score (serialised as null), the lowest feedback band and only the final suggestion (preserved)', async () => {
    const H = build({ plan: 1 });
    const res = await submit(H, { quizId: 'q', answers: [], questions: [] });
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data).toMatchObject({ score: null, correct: 0, total: 0, breakdown: [] });
    expect(data.feedback).toBe('Keep studying! Review the explanations for each question and revisit the topic notes before retrying.');
    expect(data.suggestions).toEqual(['Try the quiz again after reviewing to track improvement']);
  });

  it('a failing history save only warns', async () => {
    const H = build({ plan: 1 });
    H.studyHistory.saveSession.mockRejectedValueOnce(new Error('history down'));
    const qs = questions(1);
    const res = await submit(H, { quizId: 'q', answers: [0], questions: qs });
    expect(res.status).toBe(200);
    expect(console.warn).toHaveBeenCalledWith('Failed to save quiz session:', 'history down');
  });

  it('non-array questions or no body is the route-level 500', async () => {
    const H = build({ plan: 1 });
    for (const body of [{ quizId: 'q', answers: [], questions: 'abc' }, { quizId: 'q', answers: [], questions: {} }, undefined]) {
      const res = await submit(H, body);
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: 'Failed to submit quiz' });
    }
  });

  it('if the history service is not registered the request fails loudly (masked 500)', async () => {
    const H = build({ plan: 1, overrides: { studyHistoryService: undefined } });
    const res = await submit(H, { quizId: 'q', answers: [], questions: [] });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal Server Error' });
  });
});
