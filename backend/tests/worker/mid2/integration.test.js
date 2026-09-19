'use strict';

/**
 * CROSS-SLICE CONTRACT CHECK (kept deliberately small). The mid2 routes normally run against injected fakes
 * (see the other files in this directory). Here they run against the REAL services owned by other slices,
 * resolved through the real registry, to prove the seams line up:
 *   - infra's aiClient:          getServices(c).aiClient.callAI / extractJSON, model names from config.vars,
 *   - leaf2's studyHistoryService: getServices(c).studyHistoryService.saveSession(userId, {...}),
 *   - this slice's tutorHistoryService via its registry entry.
 * Only the outside world is faked: global fetch (the LM Studio HTTP call) and the in-memory db.
 * If another slice changes its public API this file goes red, which is the point.
 */
const { createApp } = require('../../../src/worker/app');
const { makeEnv, makeCtx, signToken } = require('../helpers/harness');
const { createMid2Db, mountMid2, USER_ID, quietConsole } = require('./helpers');

quietConsole();

const norm = (sql) => sql.replace(/\s+/g, ' ').trim();

function lmStudioReply(content) {
  return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

function build({ plan = 1, failStudyInsert = false } = {}) {
  const db = createMid2Db();
  db.state.user_subscriptions.push({ user_id: USER_ID, plan_id: plan });
  const studyInserts = [];
  const inner = db.query;
  db.query = (sql, params = []) => {
    const s = norm(sql);
    if (/^INSERT INTO study_sessions/.test(s)) {
      studyInserts.push({ sql: s, params });
      return failStudyInsert
        ? Promise.reject(new Error('study_sessions unavailable'))
        : Promise.resolve({ rows: [{ id: 1, created_at: new Date() }] });
    }
    return inner(sql, params);
  };

  const app = createApp({ dbFactory: () => db }); // default servicesFactory: the real registry
  mountMid2(app);
  const env = makeEnv({ LM_STUDIO_URL: 'http://lm.test/v1', LM_STUDIO_MODEL_TUTOR: 'tutor-x', LM_STUDIO_MODEL_SKILLS: 'skills-x' });
  const ctx = makeCtx();
  const token = signToken({ id: USER_ID });
  const post = (path, body) =>
    app.request(path, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, env, ctx);
  return { app, db, post, studyInserts, ctx };
}

describe('mid2 routes against the real infra / leaf2 / mid2 services', () => {
  let fetchSpy;
  beforeEach(() => {
    fetchSpy = jest.spyOn(global, 'fetch');
  });

  it('POST /api/ai-tutor/chat: real aiClient calls LM Studio with the tutor model from config.vars', async () => {
    fetchSpy.mockImplementation(async () => lmStudioReply(JSON.stringify({ reply: 'From LM', suggestedTopics: ['A'] })));
    const { post } = build();
    const res = await post('/api/ai-tutor/chat', { topic: 'dsa', message: 'Explain heaps' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ reply: 'From LM', suggestedTopics: ['A'], ai_powered: true });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('http://lm.test/v1/chat/completions');
    const sent = JSON.parse(init.body);
    expect(sent).toMatchObject({ model: 'tutor-x', max_tokens: 1024, temperature: 0.6, stream: false });
    expect(sent.messages[1].content).toBe("The student is studying: dsa.\nStudent's current question: Explain heaps");
  });

  it('POST /api/skills/assessment: skills model from config.vars, result persisted through the db', async () => {
    const ai = { strengths: ['SQL'], gaps: ['CI'], role_matches: ['Analyst'], analysis: 'ok', scores: { technical_depth: 50 }, recommendations: [] };
    fetchSpy.mockImplementation(async () => lmStudioReply(JSON.stringify(ai)));
    const { post, db } = build();
    const res = await post('/api/skills/assessment', { answers: [{ questionText: 'Q?', answer: 'A', category: 'DB', difficulty: 'easy' }] });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ id: 1, user_id: USER_ID, strengths: ['SQL'], ai_powered: true });
    expect(JSON.parse(fetchSpy.mock.calls[0][1].body).model).toBe('skills-x');
    expect(db.tables.skill_assessments).toHaveLength(1);
  });

  it('AI provider failure: the real aiClient reports it and the route serves its fallback', async () => {
    // a 400 makes the client stop retrying immediately (no backoff sleeps in the test)
    fetchSpy.mockImplementation(async () => new Response('bad request', { status: 400 }));
    const { post } = build();
    const res = await post('/api/ai-tutor/doubt', { doubt: 'what is a closure' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ai_powered).toBe(false);
    expect(body.concept).toBe('Closures & Lexical Scope');
  });

  it('POST /api/study-tools/notes/generate: real leaf2 studyHistoryService receives the session with the SQL parameter mapping', async () => {
    fetchSpy.mockImplementation(async () => lmStudioReply(JSON.stringify({ title: 'Closures', type: 'detailed' })));
    const { post, studyInserts } = build();
    const res = await post('/api/study-tools/notes/generate', { topic: 'Closures' });
    expect(res.status).toBe(200);
    expect(studyInserts).toHaveLength(1);
    // (user_id, session_type, topic, difficulty, score, total_questions, time_spent_seconds, data)
    expect(studyInserts[0].params).toEqual([USER_ID, 'notes', 'Closures', null, null, null, null, JSON.stringify({ type: 'detailed', title: 'Closures' })]);
  });

  it('POST /api/study-tools/quiz/submit: score, counts, time and wrong answers reach study_sessions', async () => {
    const { post, studyInserts } = build();
    const questions = [0, 1, 2, 3].map((i) => ({ question: `Q${i}`, options: ['a', 'b', 'c', 'd'], correct: i, explanation: 'e' }));
    const res = await post('/api/study-tools/quiz/submit', {
      quizId: 'quiz_1', answers: [0, 1, 2, 0], questions, topic: 'Heaps', difficulty: 'hard', timeTaken: 42,
    });
    expect(res.status).toBe(200);
    expect(studyInserts[0].params).toEqual([
      USER_ID, 'quiz', 'Heaps', 'hard', 75, 4, 42,
      JSON.stringify({ correctCount: 3, wrongAnswers: [{ question: 'Q3', userAnswer: 0, correctAnswer: 3 }] }),
    ]);
  });

  it('a study_sessions outage does not fail the request (the route swallows it, as in Express)', async () => {
    const { post } = build({ failStudyInsert: true });
    const res = await post('/api/study-tools/quiz/submit', { quizId: 'q', answers: [0], questions: [{ question: 'Q', correct: 0 }] });
    expect(res.status).toBe(200);
    expect(console.warn).toHaveBeenCalledWith('Failed to save quiz session:', 'study_sessions unavailable');
  });

  it('conversations round-trip through the real registry entry for tutorHistoryService', async () => {
    const { app, db, ctx } = build();
    const env = makeEnv();
    const headers = { Authorization: `Bearer ${signToken({ id: USER_ID })}`, 'Content-Type': 'application/json' };
    const created = await app.request('/api/ai-tutor/conversations', { method: 'POST', headers, body: JSON.stringify({ topic: 'x', messages: [1, 2] }) }, env, ctx);
    expect(created.status).toBe(200);
    const list = await app.request('/api/ai-tutor/conversations', { headers }, env, ctx);
    expect((await list.json()).conversations.map((c) => [c.id, c.message_count])).toEqual([[1, 2]]);
    expect(db.tables.tutor_conversations).toHaveLength(1);
  });
});
