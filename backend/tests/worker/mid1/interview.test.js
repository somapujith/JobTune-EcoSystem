'use strict';

const { build } = require('./helpers');

const seedInterview = (H, over = {}) => {
  const row = {
    id: 1,
    user_id: 1,
    role: 'Frontend Developer',
    messages: JSON.stringify([{ role: 'interviewer', content: 'Q1?', type: 'technical' }]),
    feedback: null,
    score: 0,
    created_at: new Date(1000),
    ...over,
  };
  H.store.state.mock_interviews.push(row);
  return row;
};

describe('worker routes/interview.js (mounted at /api/interview)', () => {
  beforeEach(() => jest.spyOn(console, 'error').mockImplementation(() => {}));
  afterEach(() => jest.restoreAllMocks());

  describe('auth and plan gating parity', () => {
    const ALL = [
      ['POST', '/api/interview/start', { role: 'X' }],
      ['POST', '/api/interview/1/respond', { answer: 'a' }],
      ['GET', '/api/interview/history', undefined],
    ];

    it.each(ALL)('%s %s: 401 without a token', async (method, path, body) => {
      const H = build({ plan: 3 });
      const res = await H.call(method, path, { auth: false, body });
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: 'Unauthorized' });
    });

    it('POST /start requires tier 3: no plan, tier 1 and tier 2 get 403 with the exact PlanGate shape', async () => {
      const expectations = [
        [undefined, null],
        [1, 'Learn & Build'],
        [2, 'Tune & Polish'],
      ];
      for (const [plan, currentPlan] of expectations) {
        const H = build({ plan });
        const res = await H.post('/api/interview/start', { role: 'X' });
        expect(res.status).toBe(403);
        expect(await res.json()).toEqual({
          error: 'This feature requires a higher subscription plan.',
          code: 'PLAN_UPGRADE_REQUIRED',
          requiredPlan: 'Zero to Hero',
          currentPlan,
        });
        expect(H.aiClient.callAI).not.toHaveBeenCalled();
        expect(H.store.state.mock_interviews).toHaveLength(0);
      }
    });

    it('POST /start passes at tier 3 (threshold)', async () => {
      const H = build({ plan: 3 });
      expect((await H.post('/api/interview/start', { role: 'X' })).status).toBe(200);
    });

    it('/:id/respond and /history have NO plan gate: a user with no subscription is served', async () => {
      const H = build();
      seedInterview(H);
      const respond = await H.post('/api/interview/1/respond', { answer: 'my answer' });
      expect(respond.status).toBe(200);
      expect((await H.get('/api/interview/history')).status).toBe(200);
    });

    it('fails closed: plan lookup error on /start -> 500 and no interview is created', async () => {
      const H = build({ plan: 3 });
      H.base.failWhen((sql) => /FROM subscription_plans/.test(sql), new Error('db down'));
      const res = await H.post('/api/interview/start', { role: 'X' });
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: 'Failed to verify subscription plan' });
      expect(H.aiClient.callAI).not.toHaveBeenCalled();
      expect(H.store.state.mock_interviews).toHaveLength(0);
    });
  });

  describe('POST /start', () => {
    it('AI-powered: returns the question, saves the opening message, passes model + options', async () => {
      const H = build({ plan: 3, env: { LM_STUDIO_MODEL_INTERVIEW: 'interview-model' } });
      const ai = { feedback: '', next_question: 'Tell me about yourself.', question_type: 'behavioral', is_complete: false, tips: ['Be concise'] };
      H.aiClient.callAI.mockResolvedValueOnce({ ok: true, data: JSON.stringify(ai) });

      const res = await H.post('/api/interview/start', { role: 'Frontend Developer' });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        success: true,
        data: {
          interviewId: 1,
          question: 'Tell me about yourself.',
          question_type: 'behavioral',
          tips: ['Be concise'],
          is_complete: false,
          ai_powered: true,
        },
      });
      const args = H.aiClient.callAI.mock.calls[0][0];
      expect(args).toMatchObject({ maxTokens: 1000, model: 'interview-model', cache: false });
      expect(args.userPrompt).toBe(
        'Start a mock interview for the role: Frontend Developer. This is the first question - ask an engaging opening question appropriate for a fresher/junior candidate.'
      );
      expect(args.systemPrompt).toContain('elite technical interviewer');
      const insert = H.store.calls.find((c) => c.sql.startsWith('INSERT INTO mock_interviews'));
      expect(insert.params).toEqual([1, 'Frontend Developer', JSON.stringify([{ role: 'interviewer', content: 'Tell me about yourself.', type: 'behavioral' }]), 0]);
    });

    it('default role is "Full Stack Developer"; no body role needed but a body IS needed', async () => {
      const H = build({ plan: 3 });
      await H.post('/api/interview/start', {});
      expect(H.aiClient.callAI.mock.calls[0][0].userPrompt).toContain('for the role: Full Stack Developer.');
      expect(H.store.state.mock_interviews[0].role).toBe('Full Stack Developer');
      // preserved: no body at all -> TypeError from destructuring -> masked 500
      const res = await H.post('/api/interview/start', undefined);
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: 'Internal Server Error' });
    });

    it('AI down -> question bank fallback (role-specific), ai_powered false, tips on the first question', async () => {
      const H = build({ plan: 3 });
      const res = await H.post('/api/interview/start', { role: 'Backend Developer' });
      expect(await res.json()).toEqual({
        success: true,
        data: {
          interviewId: 1,
          question: 'Explain the difference between SQL and NoSQL databases. When would you choose one over the other?',
          question_type: 'technical',
          tips: ['Take a moment to structure your thoughts before answering'],
          is_complete: false,
          ai_powered: false,
        },
      });
    });

    it('unknown role uses the default bank', async () => {
      const H = build({ plan: 3 });
      const body = await (await H.post('/api/interview/start', { role: 'Astronaut' })).json();
      expect(body.data.question).toBe("Tell me about yourself and why you're interested in software development.");
      expect(body.data.question_type).toBe('behavioral');
    });

    it('AI answered without next_question -> fallback', async () => {
      const H = build({ plan: 3 });
      H.aiClient.callAI.mockResolvedValueOnce({ ok: true, data: '{"feedback":"x"}' });
      const body = await (await H.post('/api/interview/start', { role: 'Full Stack Developer' })).json();
      expect(body.data.ai_powered).toBe(false);
      expect(body.data.question).toBe('How do you handle authentication and authorization in a full-stack application?');
    });

    it('AI response without tips -> tips []', async () => {
      const H = build({ plan: 3 });
      H.aiClient.callAI.mockResolvedValueOnce({ ok: true, data: '{"next_question":"Q?","question_type":"technical"}' });
      const body = await (await H.post('/api/interview/start', { role: 'X' })).json();
      expect(body.data.tips).toEqual([]);
    });

    it('DB failure -> masked 500', async () => {
      const H = build({ plan: 3 });
      H.store.failWhen((sql) => sql.startsWith('INSERT INTO mock_interviews'), new Error('relation does not exist'));
      const res = await H.post('/api/interview/start', { role: 'X' });
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: 'Internal Server Error' });
    });
  });

  describe('POST /:id/respond', () => {
    it.each([
      ['missing', {}],
      ['empty string', { answer: '' }],
      ['whitespace only', { answer: '   ' }],
    ])('400 "Answer is required": %s', async (_l, body) => {
      const H = build();
      seedInterview(H);
      const res = await H.post('/api/interview/1/respond', body);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'Answer is required' });
      expect(H.aiClient.callAI).not.toHaveBeenCalled();
    });

    it('404 when the interview does not exist or belongs to another user', async () => {
      const H = build();
      seedInterview(H, { id: 2, user_id: 2 });
      for (const id of [99, 2]) {
        const res = await H.post(`/api/interview/${id}/respond`, { answer: 'a' });
        expect(res.status).toBe(404);
        expect(await res.json()).toEqual({ error: 'Interview not found' });
      }
      expect(H.aiClient.callAI).not.toHaveBeenCalled();
    });

    it('AI-powered turn: conversation prompt, no model passed, feedback + next question appended, row updated', async () => {
      const H = build();
      seedInterview(H);
      const ai = { feedback: 'Good use of examples.', next_question: 'Q2?', question_type: 'technical', tips: ['t'], is_complete: false };
      H.aiClient.callAI.mockResolvedValueOnce({ ok: true, data: JSON.stringify(ai) });

      const res = await H.post('/api/interview/1/respond', { answer: 'My first answer' });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        success: true,
        data: {
          feedback: 'Good use of examples.',
          question: 'Q2?',
          question_type: 'technical',
          tips: ['t'],
          is_complete: false,
          ai_powered: true,
        },
      });

      const args = H.aiClient.callAI.mock.calls[0][0];
      expect(args).toEqual({ systemPrompt: expect.any(String), userPrompt: expect.any(String), maxTokens: 800, cache: false });
      expect('model' in args).toBe(false); // Express passed no model here
      expect(args.userPrompt).toBe(
        'Interview for: Frontend Developer\n\nConversation so far:\nInterviewer: Q1?\nCandidate: My first answer\n\nThe candidate has answered 1 questions so far. Continue the interview.'
      );

      const [update] = H.store.calls.filter((c) => c.sql.startsWith('UPDATE mock_interviews'));
      expect(update.params[1]).toBe(0); // score
      expect(update.params[2]).toBeNull(); // feedback
      expect(update.params[3]).toBe('1'); // WHERE id = $4 gets the raw path param, as on Express
      expect(JSON.parse(update.params[0])).toEqual([
        { role: 'interviewer', content: 'Q1?', type: 'technical' },
        { role: 'candidate', content: 'My first answer' },
        { role: 'interviewer', content: 'Good use of examples.', type: 'feedback' },
        { role: 'interviewer', content: 'Q2?', type: 'technical' },
      ]);
    });

    it('wraps up when the conversation reaches 10 messages', async () => {
      const H = build();
      const msgs = Array.from({ length: 9 }, (_, i) => ({ role: i % 2 ? 'candidate' : 'interviewer', content: `m${i}` }));
      seedInterview(H, { messages: msgs }); // jsonb column already parsed (object) -> passed through
      await H.post('/api/interview/1/respond', { answer: 'last' });
      expect(H.aiClient.callAI.mock.calls[0][0].userPrompt).toContain(
        'The candidate has answered 5 questions so far. This should be the final question - wrap up the interview.'
      );
    });

    it('AI completes the interview: score from final_score (or 70), feedback JSON stored, extra fields returned', async () => {
      const H = build();
      seedInterview(H);
      const ai = { is_complete: true, final_score: 88, final_feedback: 'Strong.', strengths: ['a'], improvements: ['b'], feedback: '' };
      H.aiClient.callAI.mockResolvedValueOnce({ ok: true, data: JSON.stringify(ai) });
      const body = await (await H.post('/api/interview/1/respond', { answer: 'x' })).json();
      expect(body.data).toEqual({
        feedback: '',
        question: '',
        question_type: '',
        tips: [],
        is_complete: true,
        final_score: 88,
        final_feedback: 'Strong.',
        strengths: ['a'],
        improvements: ['b'],
        ai_powered: true,
      });
      const row = H.store.state.mock_interviews[0];
      expect(row.score).toBe(88);
      expect(JSON.parse(row.feedback)).toEqual({ final_feedback: 'Strong.', strengths: ['a'], improvements: ['b'], score: 88 });

      // no final_score -> 70
      const H2 = build();
      seedInterview(H2);
      H2.aiClient.callAI.mockResolvedValueOnce({ ok: true, data: '{"is_complete":true}' });
      await H2.post('/api/interview/1/respond', { answer: 'x' });
      expect(H2.store.state.mock_interviews[0].score).toBe(70);
    });

    it('AI down -> fallback next question from the bank (index = floor(messages/2)), ai_powered false', async () => {
      const H = build();
      seedInterview(H);
      const body = await (await H.post('/api/interview/1/respond', { answer: 'x' })).json();
      // messages after pushing the answer: 2 -> questionIndex 1 -> second Frontend question
      expect(body).toEqual({
        success: true,
        data: {
          feedback: 'Solid answer. Try to include more specific examples next time.',
          question: 'Tell me about a time you had to debug a complex UI rendering issue. How did you approach it?',
          question_type: 'behavioral',
          tips: [],
          is_complete: false,
          ai_powered: false,
        },
      });
      const stored = JSON.parse(H.store.state.mock_interviews[0].messages);
      expect(stored.map((m) => m.type)).toEqual(['technical', undefined, 'feedback', 'behavioral']);
    });

    it('AI down with an exhausted bank -> canned completion (score 68) with stored feedback JSON', async () => {
      const H = build();
      const msgs = Array.from({ length: 9 }, (_, i) => ({ role: i % 2 ? 'candidate' : 'interviewer', content: `m${i}` }));
      seedInterview(H, { messages: JSON.stringify(msgs), role: 'Frontend Developer' });
      const body = await (await H.post('/api/interview/1/respond', { answer: 'x' })).json();
      // 10 messages -> questionIndex 5 >= bank length 5
      expect(body.data).toMatchObject({
        feedback: 'Good response. You showed thoughtful consideration of the topic.',
        question: '',
        question_type: 'summary',
        tips: [],
        is_complete: true,
        final_score: 68,
        strengths: ['Clear communication', 'Willingness to learn'],
        improvements: ['Add more specific technical details', 'Use the STAR method for behavioral questions'],
        ai_powered: false,
      });
      expect(body.data.final_feedback).toMatch(/^You completed the mock interview for the Frontend Developer role\./);
      const row = H.store.state.mock_interviews[0];
      expect(row.score).toBe(68);
      expect(JSON.parse(row.feedback).score).toBe(68);
    });

    it('AI answered with neither next_question nor is_complete -> fallback', async () => {
      const H = build();
      seedInterview(H);
      H.aiClient.callAI.mockResolvedValueOnce({ ok: true, data: '{"feedback":"only feedback"}' });
      expect((await (await H.post('/api/interview/1/respond', { answer: 'x' })).json()).data.ai_powered).toBe(false);
    });

    it('preserved bug: a non-string answer (number) passes !answer and crashes on .trim() -> masked 500', async () => {
      const H = build();
      seedInterview(H);
      const res = await H.post('/api/interview/1/respond', { answer: 42 });
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: 'Internal Server Error' });
    });

    it('preserved bug: a NULL messages column crashes on push -> masked 500', async () => {
      const H = build();
      seedInterview(H, { messages: null });
      const res = await H.post('/api/interview/1/respond', { answer: 'x' });
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: 'Internal Server Error' });
    });

    it('DB failure on the update -> masked 500', async () => {
      const H = build();
      seedInterview(H);
      H.store.failWhen((sql) => sql.startsWith('UPDATE mock_interviews'), new Error('down'));
      const res = await H.post('/api/interview/1/respond', { answer: 'x' });
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: 'Internal Server Error' });
    });
  });

  describe('GET /history', () => {
    it('lists the caller\'s interviews newest first (id, role, score, created_at only)', async () => {
      const H = build();
      seedInterview(H, { id: 1, role: 'A', score: 50, created_at: new Date(1000) });
      seedInterview(H, { id: 2, role: 'B', score: 70, created_at: new Date(2000) });
      seedInterview(H, { id: 3, role: 'C', user_id: 2, created_at: new Date(3000) });
      const res = await H.get('/api/interview/history');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.map((r) => r.id)).toEqual([2, 1]);
      expect(Object.keys(body.data[0]).sort()).toEqual(['created_at', 'id', 'role', 'score']);
    });

    it('is not swallowed by /:id/respond (different method and shape), and empty list is fine', async () => {
      const H = build();
      expect(await (await H.get('/api/interview/history')).json()).toEqual({ success: true, data: [] });
    });

    it('DB failure -> masked 500', async () => {
      const H = build();
      H.store.failWhen((sql) => sql.startsWith('SELECT id, role, score'), new Error('down'));
      const res = await H.get('/api/interview/history');
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: 'Internal Server Error' });
    });
  });
});
