'use strict';

const { build, waitFor } = require('./helpers');

const aiRoadmap = { title: 'Path to Frontend Dev', summary: 's', estimatedHours: 100, phases: [{ phase: 1, title: 'Foundation' }] };

describe('worker routes/careerRoadmap.js (mounted at /api/career)', () => {
  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  describe('auth and plan gating parity', () => {
    const GATED = [
      ['POST', '/api/career/roadmap', { targetRole: 'Dev' }],
      ['GET', '/api/career/roadmap/1', undefined],
      ['GET', '/api/career/roadmap', undefined],
    ];
    const OPEN = [
      ['POST', '/api/career/discovery', { answers: { stage: 'y1' } }],
      ['GET', '/api/career/discovery', undefined],
    ];

    it.each([...GATED, ...OPEN])('%s %s: 401 without a token', async (method, path, body) => {
      const H = build({ plan: 3 });
      const res = await H.call(method, path, { auth: false, body });
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: 'Unauthorized' });
    });

    it.each(GATED)('%s %s: no subscription -> 403 PLAN_UPGRADE_REQUIRED (requirePlan(1))', async (method, path, body) => {
      const H = build();
      const res = await H.call(method, path, { body });
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({
        error: 'This feature requires a higher subscription plan.',
        code: 'PLAN_UPGRADE_REQUIRED',
        requiredPlan: 'Learn & Build',
        currentPlan: null,
      });
      expect(H.aiClient.callAI).not.toHaveBeenCalled();
    });

    it.each(GATED)('%s %s: tier 1 passes the gate (not 401/403)', async (method, path, body) => {
      const H = build({ plan: 1 });
      const res = await H.call(method, path, { body });
      expect([200, 404]).toContain(res.status);
    });

    it.each(OPEN)('%s %s: NOT plan-gated (a user with no subscription is served)', async (method, path, body) => {
      const H = build();
      const res = await H.call(method, path, { body });
      expect([200, 404]).toContain(res.status);
    });

    it('fails closed: plan lookup error -> 500, the roadmap generator never runs', async () => {
      const H = build({ plan: 3 });
      H.base.failWhen((sql) => /FROM subscription_plans/.test(sql), new Error('db down'));
      const res = await H.post('/api/career/roadmap', { targetRole: 'Dev' });
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: 'Failed to verify subscription plan' });
      expect(H.aiClient.callAI).not.toHaveBeenCalled();
    });
  });

  describe('POST /roadmap', () => {
    it('400 when targetRole missing', async () => {
      const H = build({ plan: 1 });
      const res = await H.post('/api/career/roadmap', { currentRole: 'Student' });
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'Target role is required' });
      expect(H.aiClient.callAI).not.toHaveBeenCalled();
    });

    it('AI-powered: options, prompt, model, saved row, id merged into the response, aiPowered appended', async () => {
      const H = build({ plan: 1, env: { LM_STUDIO_MODEL_ROADMAP: 'roadmap-model' } });
      H.aiClient.callAI.mockResolvedValueOnce({ ok: true, data: JSON.stringify(aiRoadmap) });
      const res = await H.post('/api/career/roadmap', {
        currentRole: 'Student',
        targetRole: 'Frontend Developer',
        currentSkills: ['HTML', 'CSS'],
        timeframe: '3months',
      });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ...aiRoadmap, id: 1, aiPowered: true });

      const args = H.aiClient.callAI.mock.calls[0][0];
      expect(args).toMatchObject({ maxTokens: 1200, temperature: 0.5, model: 'roadmap-model', structuredJson: true });
      expect(args.userPrompt.startsWith('Build a 3 months roadmap to become a Frontend Developer.\nCurrent role: Student. Skills: HTML, CSS.\n\nJSON schema:')).toBe(true);
      expect(args.systemPrompt).toContain('expert career transition coach');
      expect(H.store.calls.find((c) => c.sql.startsWith('INSERT INTO career_roadmaps')).params).toEqual([
        1, 'Student', 'Frontend Developer', '3months', JSON.stringify(aiRoadmap),
      ]);
    });

    it.each([
      ['3months', '3 months'],
      ['6months', '6 months'],
      ['1year', '1 year'],
      ['invalid', '6 months'],
      [undefined, '6 months'],
    ])('timeframe %p is displayed as %p in the prompt', async (timeframe, shown) => {
      const H = build({ plan: 1 });
      await H.post('/api/career/roadmap', { targetRole: 'Dev', timeframe });
      expect(H.aiClient.callAI.mock.calls[0][0].userPrompt).toContain(`Build a ${shown} roadmap to become a Dev.`);
    });

    it('defaults: currentRole "Fresher", skills "General programming", timeframe 6months saved', async () => {
      const H = build({ plan: 1 });
      await H.post('/api/career/roadmap', { targetRole: 'Dev', timeframe: 'nope' });
      expect(H.aiClient.callAI.mock.calls[0][0].userPrompt).toContain('Current role: Fresher. Skills: General programming.');
      expect(H.store.state.career_roadmaps[0]).toMatchObject({ current_role: 'Fresher', timeframe: '6months' });
    });

    it('string currentSkills are used as-is', async () => {
      const H = build({ plan: 1 });
      await H.post('/api/career/roadmap', { targetRole: 'Dev', currentSkills: 'Python and SQL' });
      expect(H.aiClient.callAI.mock.calls[0][0].userPrompt).toContain('Skills: Python and SQL.');
    });

    it('AI down -> fallback roadmap (3 phases), aiPowered false, saved with id', async () => {
      const H = build({ plan: 1 });
      const res = await H.post('/api/career/roadmap', { targetRole: 'Backend Developer', timeframe: '3months' });
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.aiPowered).toBe(false);
      expect(body.id).toBe(1);
      expect(body.title).toBe('Your Path to Backend Developer');
      expect(body.summary).toBe('A structured 3-month plan to transition into a Backend Developer role.');
      expect(body.estimatedHours).toBe(200);
      expect(body.phases).toHaveLength(3);
      expect(body.phases[0].duration).toBe('1 months');
      expect(body.phases[0].skills).toEqual(['Node.js', 'Express', 'Databases', 'APIs']);
      expect(body.roleDescription).toMatch(/^A Backend Developer is responsible for developing/);
    });

    it('fallback skills depend on the role text; durations depend on the timeframe', async () => {
      const H = build({ plan: 1 });
      const fe = await (await H.post('/api/career/roadmap', { targetRole: 'Frontend Engineer', timeframe: '1year' })).json();
      expect(fe.phases[0].skills).toEqual(['HTML', 'CSS', 'JavaScript', 'React']);
      expect(fe.phases[0].duration).toBe('4 months');
      expect(fe.summary).toBe('A structured 12-month plan to transition into a Frontend Engineer role.');
      const other = await (await H.post('/api/career/roadmap', { targetRole: 'Data Analyst' })).json();
      expect(other.phases[0].skills).toEqual(['Full-stack fundamentals', 'Web basics']);
      expect(other.phases[0].duration).toBe('2 months');
    });

    it('AI answered but no phases -> fallback with aiPowered false', async () => {
      const H = build({ plan: 1 });
      H.aiClient.callAI.mockResolvedValueOnce({ ok: true, data: '{"title":"x","phases":[]}' });
      const body = await (await H.post('/api/career/roadmap', { targetRole: 'Dev' })).json();
      expect(body.aiPowered).toBe(false);
      expect(body.phases).toHaveLength(3);
    });

    it('AI answered with non-JSON -> fallback', async () => {
      const H = build({ plan: 1 });
      H.aiClient.callAI.mockResolvedValueOnce({ ok: true, data: 'nope' });
      expect((await (await H.post('/api/career/roadmap', { targetRole: 'Dev' })).json()).aiPowered).toBe(false);
    });

    it('DB save failure is swallowed: 200 with the roadmap and NO id', async () => {
      const H = build({ plan: 1 });
      H.store.failWhen((sql) => sql.startsWith('INSERT INTO career_roadmaps'), new Error('DB error'));
      const res = await H.post('/api/career/roadmap', { targetRole: 'Dev' });
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.phases).toBeDefined();
      expect('id' in body).toBe(false);
    });

    it('AI client throwing -> 500 {error:"Failed to generate career roadmap"} (the route catches, body is not masked)', async () => {
      const H = build({ plan: 1 });
      H.aiClient.callAI.mockRejectedValueOnce(new Error('boom'));
      const res = await H.post('/api/career/roadmap', { targetRole: 'Dev' });
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: 'Failed to generate career roadmap' });
    });

    it('request without a JSON body -> caught inside the route -> same 500 body', async () => {
      const H = build({ plan: 1 });
      const res = await H.post('/api/career/roadmap', undefined);
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: 'Failed to generate career roadmap' });
    });

    describe('one generation per user at a time (in-memory, per isolate)', () => {
      it('a second concurrent request from the same user gets 429; another user is unaffected; the slot is released afterwards', async () => {
        const H = build({ plan: 1 });
        H.base.state.user_subscriptions.push({ user_id: 2, plan_id: 1 });
        let release;
        H.aiClient.callAI.mockImplementationOnce(() => new Promise((resolve) => { release = () => resolve({ ok: false }); }));

        const first = H.post('/api/career/roadmap', { targetRole: 'Dev' }); // user 1, parked inside callAI
        await waitFor(() => H.aiClient.callAI.mock.calls.length === 1);

        const second = await H.post('/api/career/roadmap', { targetRole: 'Dev' }); // user 1 again
        expect(second.status).toBe(429);
        expect(await second.json()).toEqual({ error: 'Roadmap generation already in progress. Please wait.' });
        expect(H.aiClient.callAI).toHaveBeenCalledTimes(1);

        const otherUser = await H.post('/api/career/roadmap', { targetRole: 'Dev' }, { auth: 2 });
        expect(otherUser.status).toBe(200);

        release();
        expect((await first).status).toBe(200);

        const third = await H.post('/api/career/roadmap', { targetRole: 'Dev' });
        expect(third.status).toBe(200);
      });

      it('the slot is released after a validation 400 and after a thrown error', async () => {
        const H = build({ plan: 1 });
        expect((await H.post('/api/career/roadmap', {})).status).toBe(400);
        H.aiClient.callAI.mockRejectedValueOnce(new Error('boom'));
        expect((await H.post('/api/career/roadmap', { targetRole: 'Dev' })).status).toBe(500);
        expect((await H.post('/api/career/roadmap', { targetRole: 'Dev' })).status).toBe(200);
      });
    });
  });

  describe('GET /roadmap/:id', () => {
    const seed = (H) =>
      H.store.state.career_roadmaps.push(
        { id: 1, user_id: 1, current_role: 'Fresher', target_role: 'A', timeframe: '6months', roadmap: JSON.stringify(aiRoadmap), created_at: new Date(1000) },
        { id: 2, user_id: 2, current_role: 'Fresher', target_role: 'B', timeframe: '6months', roadmap: JSON.stringify(aiRoadmap), created_at: new Date(2000) },
        { id: 3, user_id: 1, current_role: 'Fresher', target_role: 'C', timeframe: '1year', roadmap: aiRoadmap, created_at: new Date(3000) }
      );

    it('returns the row with roadmap JSON parsed (string) or passed through (object)', async () => {
      const H = build({ plan: 1 });
      seed(H);
      const a = await (await H.get('/api/career/roadmap/1')).json();
      expect(a).toMatchObject({ id: 1, target_role: 'A', roadmap: aiRoadmap });
      const c = await (await H.get('/api/career/roadmap/3')).json();
      expect(c).toMatchObject({ id: 3, target_role: 'C', roadmap: aiRoadmap });
    });

    it('404 for an unknown id and for another user\'s roadmap (scoped by user_id)', async () => {
      const H = build({ plan: 1 });
      seed(H);
      for (const id of [999, 2]) {
        const res = await H.get(`/api/career/roadmap/${id}`);
        expect(res.status).toBe(404);
        expect(await res.json()).toEqual({ error: 'Roadmap not found' });
      }
    });

    it('DB failure -> 500 {error:"Failed to fetch roadmap"}', async () => {
      const H = build({ plan: 1 });
      H.store.failWhen((sql) => sql.startsWith('SELECT * FROM career_roadmaps'), new Error('down'));
      const res = await H.get('/api/career/roadmap/1');
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: 'Failed to fetch roadmap' });
    });

    it('/roadmap/:id is registered before /roadmap and does not shadow it', async () => {
      const H = build({ plan: 1 });
      seed(H);
      expect((await (await H.get('/api/career/roadmap')).json()).id).toBe(3); // latest by created_at
      expect((await (await H.get('/api/career/roadmap/1')).json()).id).toBe(1);
    });
  });

  describe('GET /roadmap (latest)', () => {
    it('404 with the exact message when the user has none', async () => {
      const H = build({ plan: 1 });
      const res = await H.get('/api/career/roadmap');
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: 'No roadmap found. Generate one first.' });
    });

    it('DB failure -> 500 {error:"Failed to fetch roadmap"}', async () => {
      const H = build({ plan: 1 });
      H.store.failWhen((sql) => sql.startsWith('SELECT * FROM career_roadmaps'), new Error('down'));
      const res = await H.get('/api/career/roadmap');
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: 'Failed to fetch roadmap' });
    });
  });

  describe('POST /discovery (working-tree route, authenticateToken only)', () => {
    it('upserts the answers for the authenticated user and returns {id, updatedAt}', async () => {
      const H = build();
      const res = await H.post('/api/career/discovery', {
        answers: { stage: 'y3', career_goal: 'frontend' },
        subAnswers: { frontend: ['React', 'Tailwind CSS'] },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.id).toBe(1);
      expect(typeof body.updatedAt).toBe('string');
      expect(Object.keys(body).sort()).toEqual(['id', 'updatedAt']);
      const call = H.store.calls.find((c) => c.sql.startsWith('INSERT INTO career_discovery_responses'));
      expect(call.sql).toContain('ON CONFLICT (user_id) DO UPDATE');
      expect(call.params).toEqual([1, JSON.stringify({ stage: 'y3', career_goal: 'frontend' }), JSON.stringify({ frontend: ['React', 'Tailwind CSS'] })]);
    });

    it('subAnswers default to {}; a second POST updates the same row (one row per user)', async () => {
      const H = build();
      await H.post('/api/career/discovery', { answers: { stage: 'y1' } });
      expect(H.store.state.career_discovery_responses[0].sub_answers).toBe('{}');
      const second = await (await H.post('/api/career/discovery', { answers: { stage: 'y2' }, subAnswers: { a: 1 } })).json();
      expect(second.id).toBe(1);
      expect(H.store.state.career_discovery_responses).toHaveLength(1);
      expect(H.store.state.career_discovery_responses[0]).toMatchObject({ answers: '{"stage":"y2"}', sub_answers: '{"a":1}' });
    });

    it.each([
      ['answers missing', { subAnswers: {} }],
      ['answers null', { answers: null }],
      ['answers a string', { answers: 'y1' }],
      ['answers a number', { answers: 5 }],
    ])('400 "answers is required": %s', async (_l, body) => {
      const H = build();
      const res = await H.post('/api/career/discovery', body);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'answers is required' });
      expect(H.store.state.career_discovery_responses).toHaveLength(0);
    });

    it('preserved quirk: an array counts as an object and is accepted', async () => {
      const H = build();
      expect((await H.post('/api/career/discovery', { answers: ['a'] })).status).toBe(200);
    });

    it('DB failure -> 500 {error:"Failed to save discovery responses"}', async () => {
      const H = build();
      H.store.failWhen((sql) => sql.startsWith('INSERT INTO career_discovery_responses'), new Error('DB error'));
      const res = await H.post('/api/career/discovery', { answers: { stage: 'y1' } });
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: 'Failed to save discovery responses' });
    });

    it('request without a JSON body: the destructure is OUTSIDE the try block -> masked 500 (as on Express 5)', async () => {
      const H = build();
      const res = await H.post('/api/career/discovery', undefined);
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: 'Internal Server Error' });
    });
  });

  describe('GET /discovery (working-tree route, authenticateToken only)', () => {
    it('404 with the exact message when none saved', async () => {
      const H = build();
      const res = await H.get('/api/career/discovery');
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: 'No discovery response found.' });
    });

    it('returns the saved answers (JSON strings parsed) for the caller only', async () => {
      const H = build();
      await H.post('/api/career/discovery', { answers: { stage: 'y3' }, subAnswers: { frontend: ['React'] } });
      const res = await H.get('/api/career/discovery');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.answers).toEqual({ stage: 'y3' });
      expect(body.subAnswers).toEqual({ frontend: ['React'] });
      expect(typeof body.updatedAt).toBe('string');
      expect(Object.keys(body).sort()).toEqual(['answers', 'subAnswers', 'updatedAt']);

      const other = await H.get('/api/career/discovery', { auth: 2 });
      expect(other.status).toBe(404);
    });

    it('object-typed jsonb columns are passed through', async () => {
      const H = build();
      H.store.state.career_discovery_responses.push({ id: 5, user_id: 1, answers: { a: 1 }, sub_answers: { b: 2 }, updated_at: new Date(0) });
      const body = await (await H.get('/api/career/discovery')).json();
      expect(body).toEqual({ answers: { a: 1 }, subAnswers: { b: 2 }, updatedAt: '1970-01-01T00:00:00.000Z' });
    });

    it('DB failure -> 500 {error:"Failed to fetch discovery responses"}', async () => {
      const H = build();
      H.store.failWhen((sql) => sql.startsWith('SELECT answers, sub_answers'), new Error('down'));
      const res = await H.get('/api/career/discovery');
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: 'Failed to fetch discovery responses' });
    });
  });
});
