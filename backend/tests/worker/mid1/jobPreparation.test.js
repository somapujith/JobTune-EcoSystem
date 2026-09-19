'use strict';

const { build } = require('./helpers');

const STAR_FALLBACK = {
  success: true,
  data: {
    stories: [
      {
        title: 'Leading a critical migration',
        situation: 'Our legacy monolith was experiencing 5-second load times during peak hours.',
        task: 'I was tasked with migrating the most heavily used microservice to a new Node.js architecture within 3 weeks.',
        action: 'I mapped out the endpoints, led a daily standup with 2 other devs to ensure no duplicate work, and implemented Redis caching to reduce database load.',
        result: 'We successfully launched on time with zero downtime, and response times dropped from 5 seconds to 120ms, increasing user retention by 15%.',
      },
    ],
  },
};
const PROJECTS_FALLBACK = {
  success: true,
  data: {
    projects: [
      { title: 'Task Manager Pro', description: 'A robust task manager with real-time updates.', skills_gained: ['React', 'WebSockets'] },
      { title: 'E-commerce Dashboard', description: 'Admin panel for managing inventory and orders.', skills_gained: ['Node.js', 'SQL'] },
    ],
  },
};
const DEFAULT_MODEL = 'meta-llama-3.1-8b-instruct';

describe('worker routes/jobPreparation.js (mounted at /api/job-prep)', () => {
  beforeEach(() => jest.spyOn(console, 'error').mockImplementation(() => {}));
  afterEach(() => jest.restoreAllMocks());

  const ENDPOINTS = [
    ['/api/job-prep/star-stories', { topic: 'Leadership' }],
    ['/api/job-prep/tutor', { message: 'What is a closure?' }],
    ['/api/job-prep/projects', { role: 'Backend Developer' }],
    ['/api/job-prep/project-blueprint', { projectTitle: 'Chat App' }],
  ];

  describe('auth parity (authenticateToken only, NO plan gate)', () => {
    it.each(ENDPOINTS)('POST %s: 401 without a token', async (path, body) => {
      const H = build({ plan: 3 });
      const res = await H.post(path, body, { auth: false });
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: 'Unauthorized' });
      expect(H.aiClient.callAI).not.toHaveBeenCalled();
    });

    it.each(ENDPOINTS)('POST %s: works for a user with NO subscription (no requirePlan)', async (path, body) => {
      const H = build(); // no plan at all
      const res = await H.post(path, body);
      expect(res.status).toBe(200);
      expect(H.aiClient.callAI).toHaveBeenCalledTimes(1);
    });
  });

  describe('POST /star-stories', () => {
    it('400 when topic missing', async () => {
      const H = build();
      const res = await H.post('/api/job-prep/star-stories', {});
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'Topic is required' });
    });

    it('AI ok + parsed stories -> {success, data: parsed}; model falls back to the llama default', async () => {
      const H = build();
      const parsed = { stories: [{ title: 'x', situation: 's', task: 't', action: 'a', result: 'r' }] };
      H.aiClient.callAI.mockResolvedValueOnce({ ok: true, data: JSON.stringify(parsed) });
      const res = await H.post('/api/job-prep/star-stories', { topic: 'Conflict' });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ success: true, data: parsed });
      const args = H.aiClient.callAI.mock.calls[0][0];
      expect(args).toMatchObject({ maxTokens: 1000, model: DEFAULT_MODEL, userPrompt: 'Generate 2 STAR stories for the topic: Conflict' });
      expect(args.systemPrompt).toContain('expert career coach and interview prep assistant. \n');
      expect(Object.keys(args).sort()).toEqual(['maxTokens', 'model', 'systemPrompt', 'userPrompt']);
    });

    it('LM_STUDIO_MODEL_INTERVIEW (config.vars) overrides the default model', async () => {
      const H = build({ env: { LM_STUDIO_MODEL_INTERVIEW: 'my-interview-model' } });
      await H.post('/api/job-prep/star-stories', { topic: 'x' });
      expect(H.aiClient.callAI.mock.calls[0][0].model).toBe('my-interview-model');
    });

    it('AI down -> static fallback story (200)', async () => {
      const H = build();
      const res = await H.post('/api/job-prep/star-stories', { topic: 'x' });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual(STAR_FALLBACK);
    });

    it.each([['non-JSON', 'hello'], ['JSON without stories', '{"nope":1}']])('AI ok but %s -> static fallback story', async (_l, data) => {
      const H = build();
      H.aiClient.callAI.mockResolvedValueOnce({ ok: true, data });
      expect(await (await H.post('/api/job-prep/star-stories', { topic: 'x' })).json()).toEqual(STAR_FALLBACK);
    });

    it('AI client throwing -> masked 500; no body -> masked 500', async () => {
      const H = build();
      H.aiClient.callAI.mockRejectedValueOnce(new Error('boom'));
      let res = await H.post('/api/job-prep/star-stories', { topic: 'x' });
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: 'Internal Server Error' });
      res = await H.post('/api/job-prep/star-stories', undefined);
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: 'Internal Server Error' });
    });
  });

  describe('POST /tutor', () => {
    it('400 when message missing', async () => {
      const H = build();
      const res = await H.post('/api/job-prep/tutor', { history: [] });
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'Message is required' });
    });

    it('builds the prompt with LITERAL backslash-n sequences (preserved Express quirk) and trims the reply', async () => {
      const H = build();
      H.aiClient.callAI.mockResolvedValueOnce({ ok: true, data: '  Sure!  \n' });
      const res = await H.post('/api/job-prep/tutor', {
        message: 'And async?',
        history: [
          { role: 'user', content: 'What is JS?' },
          { role: 'assistant', content: 'A language.' },
        ],
      });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ success: true, data: { reply: 'Sure!' } });
      const args = H.aiClient.callAI.mock.calls[0][0];
      // each "\n" below is a backslash followed by n, not a newline
      expect(args.userPrompt).toBe(
        'Previous conversation:\\nStudent: What is JS?\\nTutor: A language.\\n\\nStudent\'s new question: And async?\\n\\nReply as the Tutor:'
      );
      expect(args.userPrompt).not.toContain('\n');
      expect(args).toMatchObject({ maxTokens: 500, model: DEFAULT_MODEL });
      expect(args.systemPrompt).toContain("Zero to Hero' career roadmap");
    });

    it('no history -> only the header and the question', async () => {
      const H = build();
      await H.post('/api/job-prep/tutor', { message: 'Hi' });
      expect(H.aiClient.callAI.mock.calls[0][0].userPrompt).toBe(
        "Previous conversation:\\n\\nStudent's new question: Hi\\n\\nReply as the Tutor:"
      );
    });

    it('AI down -> friendly canned reply with success:true', async () => {
      const H = build();
      const res = await H.post('/api/job-prep/tutor', { message: 'Hi' });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        success: true,
        data: { reply: "I'm having a little trouble connecting right now, but keep up the great work! Try asking again in a moment." },
      });
    });

    it('preserved bug: a non-array history with a length (string) -> history.forEach is not a function -> masked 500', async () => {
      const H = build();
      const res = await H.post('/api/job-prep/tutor', { message: 'Hi', history: 'abc' });
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: 'Internal Server Error' });
      expect(H.aiClient.callAI).not.toHaveBeenCalled();
    });
  });

  describe('POST /projects', () => {
    it('400 when role missing', async () => {
      const H = build();
      const res = await H.post('/api/job-prep/projects', { skills: 'js' });
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'Target role is required' });
    });

    it('AI ok -> parsed projects; prompt uses skills or "Basic knowledge" with literal backslash-n', async () => {
      const H = build();
      const parsed = { projects: [{ title: 'P', description: 'D', skills_gained: ['x'] }] };
      H.aiClient.callAI.mockResolvedValue({ ok: true, data: JSON.stringify(parsed) });
      expect(await (await H.post('/api/job-prep/projects', { role: 'Dev', skills: 'JS, SQL' })).json()).toEqual({ success: true, data: parsed });
      expect(H.aiClient.callAI.mock.calls[0][0].userPrompt).toBe('Target Role: Dev\\nCurrent Skills: JS, SQL\\nSuggest 3 projects.');
      await H.post('/api/job-prep/projects', { role: 'Dev' });
      expect(H.aiClient.callAI.mock.calls[1][0].userPrompt).toBe('Target Role: Dev\\nCurrent Skills: Basic knowledge\\nSuggest 3 projects.');
      expect(H.aiClient.callAI.mock.calls[0][0]).toMatchObject({ maxTokens: 800, model: DEFAULT_MODEL });
    });

    it('AI down / unparsable / missing "projects" -> static fallback', async () => {
      const H = build();
      expect(await (await H.post('/api/job-prep/projects', { role: 'Dev' })).json()).toEqual(PROJECTS_FALLBACK);
      H.aiClient.callAI.mockResolvedValueOnce({ ok: true, data: 'no json' });
      expect(await (await H.post('/api/job-prep/projects', { role: 'Dev' })).json()).toEqual(PROJECTS_FALLBACK);
      H.aiClient.callAI.mockResolvedValueOnce({ ok: true, data: '{"stories":[]}' });
      expect(await (await H.post('/api/job-prep/projects', { role: 'Dev' })).json()).toEqual(PROJECTS_FALLBACK);
    });
  });

  describe('POST /project-blueprint', () => {
    it('400 when projectTitle missing', async () => {
      const H = build();
      const res = await H.post('/api/job-prep/project-blueprint', {});
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'Project title is required' });
    });

    it('AI ok -> parsed blueprint; call options preserved', async () => {
      const H = build();
      const parsed = { blueprint: { architecture: 'MVC', setup_commands: ['x'], steps: ['s'], readme_draft: '# R' } };
      H.aiClient.callAI.mockResolvedValueOnce({ ok: true, data: JSON.stringify(parsed) });
      const res = await H.post('/api/job-prep/project-blueprint', { projectTitle: 'Chat' });
      expect(await res.json()).toEqual({ success: true, data: parsed });
      expect(H.aiClient.callAI.mock.calls[0][0]).toMatchObject({
        maxTokens: 1000,
        model: DEFAULT_MODEL,
        userPrompt: 'Generate a blueprint for: Chat',
      });
    });

    it('AI down / bad JSON -> static blueprint whose readme_draft has a literal backslash-n (preserved quirk)', async () => {
      const H = build();
      const expected = {
        success: true,
        data: {
          blueprint: {
            architecture: 'Standard React Frontend with Node/Express Backend',
            setup_commands: ['npx create-react-app frontend', 'npm init -y'],
            steps: ['Initialize git', 'Setup Express server', 'Build React UI', 'Connect to DB'],
            readme_draft: '# Chat\\n\\nA great project.',
          },
        },
      };
      expect(await (await H.post('/api/job-prep/project-blueprint', { projectTitle: 'Chat' })).json()).toEqual(expected);
      H.aiClient.callAI.mockResolvedValueOnce({ ok: true, data: '{"blueprint":null}' });
      expect(await (await H.post('/api/job-prep/project-blueprint', { projectTitle: 'Chat' })).json()).toEqual(expected);
    });
  });
});
