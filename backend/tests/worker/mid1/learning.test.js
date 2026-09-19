'use strict';

const { build } = require('./helpers');

describe('worker routes/learning.js (mounted at /api/learning)', () => {
  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  describe('auth and plan gating parity', () => {
    it('POST /generate-roadmap and GET /roadmaps: 401 without a token, before any body/db work', async () => {
      const H = build({ plan: 1 });
      for (const res of [await H.post('/api/learning/generate-roadmap', { gaps: ['a'] }, { auth: false }), await H.get('/api/learning/roadmaps', { auth: false })]) {
        expect(res.status).toBe(401);
        expect(await res.json()).toEqual({ error: 'Unauthorized' });
      }
      expect(H.aiClient.callAI).not.toHaveBeenCalled();
    });

    it.each([
      ['POST', '/api/learning/generate-roadmap'],
      ['GET', '/api/learning/roadmaps'],
    ])('%s %s: no subscription -> 403 PLAN_UPGRADE_REQUIRED (requirePlan(1))', async (method, path) => {
      const H = build(); // no plan
      const res = await H.call(method, path, { body: method === 'POST' ? { gaps: ['sql'] } : undefined });
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({
        error: 'This feature requires a higher subscription plan.',
        code: 'PLAN_UPGRADE_REQUIRED',
        requiredPlan: 'Learn & Build',
        currentPlan: null,
      });
      expect(H.aiClient.callAI).not.toHaveBeenCalled();
      expect(H.store.state.learning_roadmaps).toHaveLength(0);
    });

    it('tier 1 is enough (threshold), higher tiers also pass', async () => {
      for (const plan of [1, 2, 3]) {
        const H = build({ plan });
        expect((await H.get('/api/learning/roadmaps')).status).toBe(200);
      }
    });

    it('fails closed: a plan lookup error is a 500 and the handler never runs', async () => {
      const H = build({ plan: 3 });
      H.base.failWhen((sql) => /FROM subscription_plans/.test(sql), new Error('db down'));
      const res = await H.post('/api/learning/generate-roadmap', { gaps: ['sql'] });
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: 'Failed to verify subscription plan' });
      expect(H.aiClient.callAI).not.toHaveBeenCalled();
    });

    it('GET /resources is PUBLIC (no token needed) and has the exact static body', async () => {
      const H = build();
      const res = await H.get('/api/learning/resources', { auth: false });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual([
        { id: 1, title: 'Complete React Guide', type: 'Video', category: 'Frontend' },
        { id: 2, title: 'Node.js Crash Course', type: 'Video', category: 'Backend' },
        { id: 3, title: 'SQL for Beginners', type: 'Article', category: 'Database' },
      ]);
    });
  });

  describe('POST /generate-roadmap', () => {
    const aiRoadmap = { title: 'T', summary: 'S', weeks: [{ week: 1 }], milestones: [], estimated_total_hours: 10 };

    it.each([
      ['missing body field', { targetRole: 'X' }],
      ['gaps not an array', { gaps: 'sql' }],
      ['gaps empty', { gaps: [] }],
      ['gaps null', { gaps: null }],
    ])('400 "gaps array is required": %s', async (_label, body) => {
      const H = build({ plan: 1 });
      const res = await H.post('/api/learning/generate-roadmap', body);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'gaps array is required' });
      expect(H.aiClient.callAI).not.toHaveBeenCalled();
    });

    it('AI-powered path: passes prompt/model/options, saves the parsed roadmap, returns the exact shape', async () => {
      const H = build({ plan: 1, env: { LM_STUDIO_MODEL_ROADMAP: 'roadmap-model' } });
      H.aiClient.callAI.mockResolvedValueOnce({ ok: true, data: '```json\n' + JSON.stringify(aiRoadmap) + '\n```' });

      const res = await H.post('/api/learning/generate-roadmap', { gaps: ['React', 'SQL'], targetRole: 'Frontend Dev' });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ success: true, data: { id: 1, roadmap: aiRoadmap, ai_powered: true } });

      const args = H.aiClient.callAI.mock.calls[0][0];
      expect(args).toMatchObject({
        maxTokens: 1200,
        model: 'roadmap-model',
        structuredJson: true,
        userPrompt: 'Skill gaps to address: React, SQL\nTarget role: Frontend Dev\n\nCreate a 4-week learning roadmap.',
      });
      expect(args.systemPrompt).toContain('generate a personalized 4-week learning roadmap');
      expect(Object.keys(args).sort()).toEqual(['maxTokens', 'model', 'structuredJson', 'systemPrompt', 'userPrompt']);

      expect(H.store.calls.find((c) => c.sql.startsWith('INSERT INTO learning_roadmaps')).params).toEqual([
        1,
        JSON.stringify(['React', 'SQL']),
        'Frontend Dev',
        JSON.stringify(aiRoadmap),
        true,
      ]);
    });

    it('no targetRole: prompt has no target line and target_role is saved as empty string', async () => {
      const H = build({ plan: 1 });
      H.aiClient.callAI.mockResolvedValueOnce({ ok: true, data: JSON.stringify(aiRoadmap) });
      await H.post('/api/learning/generate-roadmap', { gaps: ['Docker'] });
      expect(H.aiClient.callAI.mock.calls[0][0].userPrompt).toBe('Skill gaps to address: Docker\n\nCreate a 4-week learning roadmap.');
      expect(H.store.state.learning_roadmaps[0].target_role).toBe('');
      expect(H.store.state.learning_roadmaps[0].ai_powered).toBe(true);
    });

    it('model is undefined when LM_STUDIO_MODEL_ROADMAP is unset (same as an unset variable on Express)', async () => {
      const H = build({ plan: 1 });
      await H.post('/api/learning/generate-roadmap', { gaps: ['Docker'] });
      expect(H.aiClient.callAI.mock.calls[0][0].model).toBeUndefined();
    });

    it('AI down -> fallback roadmap, ai_powered false, still saved', async () => {
      const H = build({ plan: 1 });
      const res = await H.post('/api/learning/generate-roadmap', { gaps: ['Go', 'Rust', 'C', 'Zig'], targetRole: 'Systems Dev' });
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data.ai_powered).toBe(false);
      expect(body.data.roadmap.title).toBe('Your Personalized Roadmap to Systems Dev');
      expect(body.data.roadmap.summary).toBe(
        'A focused 4-week plan to bridge your skill gaps in Go, Rust, C and prepare you for the Systems Dev role.'
      );
      expect(body.data.roadmap.weeks).toHaveLength(4);
      expect(body.data.roadmap.weeks[0].goals[0]).toBe('Understand the basics of Go');
      expect(body.data.roadmap.weeks[1].goals[1]).toBe('Begin exploring Rust');
      expect(body.data.roadmap.weeks[2].tasks[2].title).toBe('C Workshop');
      expect(body.data.roadmap.estimated_total_hours).toBe(40);
      expect(H.store.state.learning_roadmaps[0].ai_powered).toBe(false);
    });

    it('fallback with a single gap and no role uses the defaults', async () => {
      const H = build({ plan: 1 });
      const body = await (await H.post('/api/learning/generate-roadmap', { gaps: ['Go'] })).json();
      const r = body.data.roadmap;
      expect(r.title).toBe('Your Personalized Roadmap to Junior Developer');
      expect(r.weeks[1].goals[1]).toBe('Strengthen fundamentals');
      expect(r.weeks[1].tasks[1].title).toBe('Advanced Concepts Tutorial');
      expect(r.weeks[2].tasks[2].title).toBe('Soft Skills Workshop');
    });

    it('AI answered but without "weeks" -> fallback (ai_powered false)', async () => {
      const H = build({ plan: 1 });
      H.aiClient.callAI.mockResolvedValueOnce({ ok: true, data: '{"title":"no weeks"}' });
      const body = await (await H.post('/api/learning/generate-roadmap', { gaps: ['Go'] })).json();
      expect(body.data.ai_powered).toBe(false);
      expect(body.data.roadmap.weeks).toHaveLength(4);
    });

    it('AI answered with non-JSON -> fallback', async () => {
      const H = build({ plan: 1 });
      H.aiClient.callAI.mockResolvedValueOnce({ ok: true, data: 'sorry I cannot' });
      const body = await (await H.post('/api/learning/generate-roadmap', { gaps: ['Go'] })).json();
      expect(body.data.ai_powered).toBe(false);
    });

    it('database failure -> masked 500 (Express: next(err) -> errorHandler)', async () => {
      const H = build({ plan: 1 });
      H.store.failWhen((sql) => sql.startsWith('INSERT INTO learning_roadmaps'), new Error('relation "learning_roadmaps" does not exist'));
      const res = await H.post('/api/learning/generate-roadmap', { gaps: ['Go'] });
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: 'Internal Server Error' });
    });

    it('AI client throwing -> masked 500', async () => {
      const H = build({ plan: 1 });
      H.aiClient.callAI.mockRejectedValueOnce(new Error('boom: secret detail'));
      const res = await H.post('/api/learning/generate-roadmap', { gaps: ['Go'] });
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: 'Internal Server Error' });
    });

    it('request without a JSON body -> TypeError -> masked 500 (Express 5 req.body is undefined)', async () => {
      const H = build({ plan: 1 });
      const res = await H.post('/api/learning/generate-roadmap', undefined);
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: 'Internal Server Error' });
    });
  });

  describe('GET /roadmaps', () => {
    it('returns the user\'s roadmaps newest first, parsing JSON strings and passing objects through', async () => {
      const H = build({ plan: 1 });
      H.store.state.learning_roadmaps.push(
        { id: 1, user_id: 1, gaps: '["a"]', target_role: '', roadmap: '{"weeks":[1]}', ai_powered: false, created_at: new Date(1000) },
        { id: 2, user_id: 1, gaps: ['b'], target_role: 'X', roadmap: { weeks: [2] }, ai_powered: true, created_at: new Date(2000) },
        { id: 3, user_id: 2, gaps: ['c'], target_role: 'Other user', roadmap: {}, ai_powered: false, created_at: new Date(3000) }
      );
      const res = await H.get('/api/learning/roadmaps');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.map((r) => r.id)).toEqual([2, 1]);
      expect(body.data[1]).toMatchObject({ gaps: ['a'], roadmap: { weeks: [1] } });
      expect(body.data[0]).toMatchObject({ gaps: ['b'], roadmap: { weeks: [2] }, target_role: 'X', ai_powered: true });
    });

    it('empty list', async () => {
      const H = build({ plan: 1 });
      expect(await (await H.get('/api/learning/roadmaps')).json()).toEqual({ success: true, data: [] });
    });

    it('database failure -> masked 500', async () => {
      const H = build({ plan: 1 });
      H.store.failWhen((sql) => sql.startsWith('SELECT * FROM learning_roadmaps'), new Error('down'));
      const res = await H.get('/api/learning/roadmaps');
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: 'Internal Server Error' });
    });
  });
});
