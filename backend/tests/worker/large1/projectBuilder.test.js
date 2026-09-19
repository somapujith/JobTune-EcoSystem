'use strict';

/**
 * routes/projectBuilder.js: happy paths, AI + fallback branches, validation and error paths per endpoint.
 * The AI is an injected fake (services.aiClient); the model comes from config.vars via the Worker env.
 */
const { makeLarge1, makeAiClient } = require('./helpers');

let errSpy;
let warnSpy;
beforeEach(() => {
  errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

const logged = () => errSpy.mock.calls.map((a) => a.join(' ')).join('\n');
const warned = () => warnSpy.mock.calls.map((a) => a.join(' ')).join('\n');

const PB = '/api/project-builder';
const goodPlan = { name: 'AI Plan', techStack: { frontend: ['React'] }, description: 'd' };

describe('GET /templates', () => {
  it('returns the 8 static templates in order, no db access', async () => {
    const H = makeLarge1({ plan: 1 });
    const res = await H.authed(`${PB}/templates`);
    expect(res.status).toBe(200);
    const { templates } = await res.json();
    expect(templates.map((t) => t.id)).toEqual(['todo', 'ecommerce', 'blog', 'social', 'portfolio', 'dashboard', 'chat', 'api']);
    expect(templates[0]).toEqual({
      id: 'todo',
      name: 'Todo App',
      icon: 'checklist',
      description: 'A full-featured task management application with CRUD, filtering, and persistence.',
      suggestedStack: ['React', 'Node.js', 'PostgreSQL'],
    });
    expect(H.db.calls).toEqual([]);
  });
});

describe('POST /generate', () => {
  it('validation: neither description nor template -> 400', async () => {
    const H = makeLarge1({ plan: 1 });
    const res = await H.json('POST', `${PB}/generate`, {});
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Project description or template is required.' });
    expect(H.aiClient.callAI).not.toHaveBeenCalled();
  });

  it('no JSON body: caught by the handler try/catch -> 500 Failed to generate project plan.', async () => {
    const H = makeLarge1({ plan: 1 });
    const res = await H.authed(`${PB}/generate`, { method: 'POST' });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Failed to generate project plan.' });
    expect(logged()).toContain('Project plan generation error:');
  });

  it('AI ok with valid JSON: returns the AI plan, aiPowered true; prompt/params as Express; model from config', async () => {
    const ai = makeAiClient(async () => ({ ok: true, error: null, data: '```json\n' + JSON.stringify(goodPlan) + '\n```' }));
    const H = makeLarge1({ plan: 1, aiClient: ai, envOverrides: { LM_STUDIO_MODEL_PROJECT: 'proj-model', LM_STUDIO_MODEL: 'default-model' } });
    const res = await H.json('POST', `${PB}/generate`, { description: 'A habit tracker', difficulty: 'Beginner' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ plan: goodPlan, aiPowered: true });
    expect(ai.callAI).toHaveBeenCalledTimes(1);
    const arg = ai.callAI.mock.calls[0][0];
    expect(arg).toMatchObject({ maxTokens: 1200, temperature: 0.5, model: 'proj-model', structuredJson: true });
    expect(arg.systemPrompt).toBe('You are a senior software architect. Output ONLY valid JSON — no markdown, no explanation. Design a complete project plan for a Beginner-level developer.');
    expect(arg.userPrompt).toContain('Create a detailed project plan for: "A habit tracker"\nDifficulty: Beginner\n\n\nJSON schema:');
    expect(arg.userPrompt).toContain('"difficulty": "Beginner",');
  });

  it('model falls back to the default model var, then to undefined', async () => {
    const a = makeAiClient();
    await makeLarge1({ plan: 1, aiClient: a, envOverrides: { LM_STUDIO_MODEL: 'default-model' } }).json('POST', `${PB}/generate`, { description: 'x' });
    expect(a.callAI.mock.calls[0][0].model).toBe('default-model');
    const b = makeAiClient();
    await makeLarge1({ plan: 1, aiClient: b }).json('POST', `${PB}/generate`, { description: 'x' });
    expect(b.callAI.mock.calls[0][0].model).toBeUndefined();
  });

  it('template: prompt names the template + stack; description defaults from the template; default difficulty Intermediate', async () => {
    const ai = makeAiClient();
    const H = makeLarge1({ plan: 1, aiClient: ai });
    const res = await H.json('POST', `${PB}/generate`, { template: 'blog' });
    const arg = ai.callAI.mock.calls[0][0];
    expect(arg.userPrompt).toContain('Create a detailed project plan for: "Content management system with markdown support, categories, and comments."');
    expect(arg.userPrompt).toContain('Difficulty: Intermediate\nTemplate: Blog Platform (React, Express, MongoDB)');
    // AI failed -> fallback built from the template
    const { plan, aiPowered } = await res.json();
    expect(aiPowered).toBe(false);
    expect(plan.name).toBe('Blog Platform');
    expect(plan.techStack.frontend).toEqual(['React']);
    expect(plan.techStack.backend).toEqual(['Express']);
    expect(plan.techStack.database).toEqual(['MongoDB']);
    expect(plan.difficulty).toBe('Intermediate');
    expect(warned()).toContain('AI project plan generation failed, using fallback: no ai in tests');
  });

  it('unknown template with no description: empty project description, generic fallback plan', async () => {
    const ai = makeAiClient();
    const H = makeLarge1({ plan: 1, aiClient: ai });
    const { plan } = await (await H.json('POST', `${PB}/generate`, { template: 'nope' })).json();
    expect(ai.callAI.mock.calls[0][0].userPrompt).toContain('Create a detailed project plan for: ""');
    expect(plan.name).toBe('Custom Project');
    expect(plan.description).toBe('');
    expect(plan.techStack.frontend).toEqual(['React']);
    expect(plan.folderStructure).toHaveLength(20);
    expect(plan.implementationSteps).toHaveLength(6);
  });

  it('AI ok but unparsable / incomplete JSON: fallback plan, aiPowered false, warning logged', async () => {
    for (const data of ['not json at all', JSON.stringify({ name: 'no stack' })]) {
      const H = makeLarge1({ plan: 1, aiClient: makeAiClient(async () => ({ ok: true, data })) });
      const body = await (await H.json('POST', `${PB}/generate`, { description: 'My app', difficulty: 'Advanced' })).json();
      expect(body.aiPowered).toBe(false);
      expect(body.plan.name).toBe('Custom Project');
      expect(body.plan.description).toBe('My app');
      expect(body.plan.difficulty).toBe('Advanced');
    }
    expect(warned()).toContain('Failed to parse project plan JSON, using fallback');
  });

  it('callAI rejecting -> 500 Failed to generate project plan. (not caught inside, as on Express)', async () => {
    const H = makeLarge1({ plan: 1, aiClient: makeAiClient(async () => { throw new Error('socket hang up'); }) });
    const res = await H.json('POST', `${PB}/generate`, { description: 'x' });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Failed to generate project plan.' });
    expect(logged()).toContain('Project plan generation error: socket hang up');
  });
});

describe('POST /readme', () => {
  const projectPlan = {
    name: 'Shop', description: 'A store', techStack: { frontend: ['React'], backend: ['Node.js'], database: ['PostgreSQL'], tools: [] },
    features: [{ name: 'Cart', description: 'Buy things' }],
    apiEndpoints: [{ method: 'GET', path: '/api/items', description: 'List' }],
    folderStructure: [{ path: 'src/', type: 'dir', depth: 0 }, { path: 'src/App.jsx', type: 'file', depth: 1 }],
  };

  it('validation: 400 when projectPlan missing', async () => {
    const H = makeLarge1({ plan: 1 });
    const res = await H.json('POST', `${PB}/readme`, {});
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Project plan is required.' });
  });

  it('AI text is returned as the readme, aiPowered true; params as Express (no structuredJson)', async () => {
    const ai = makeAiClient(async () => ({ ok: true, data: '# From AI' }));
    const H = makeLarge1({ plan: 1, aiClient: ai, envOverrides: { LM_STUDIO_MODEL_PROJECT: 'pm' } });
    const res = await H.json('POST', `${PB}/readme`, { projectPlan });
    expect(await res.json()).toEqual({ readme: '# From AI', aiPowered: true });
    const arg = ai.callAI.mock.calls[0][0];
    expect(arg).toMatchObject({ maxTokens: 1200, temperature: 0.4, model: 'pm' });
    expect(arg).not.toHaveProperty('structuredJson');
    expect(arg.userPrompt).toBe(
      `Generate a professional README.md for this project:\nName: Shop\nDescription: A store\nTech Stack: ${JSON.stringify(projectPlan.techStack)}\nFeatures: ${JSON.stringify(projectPlan.features)}\nAPI Endpoints: ${JSON.stringify(projectPlan.apiEndpoints)}\nFolder Structure: ${JSON.stringify(projectPlan.folderStructure)}`
    );
  });

  it('AI failed or empty: generated fallback README, aiPowered false', async () => {
    for (const result of [{ ok: false, error: 'x', data: null }, { ok: true, data: '' }]) {
      const H = makeLarge1({ plan: 1, aiClient: makeAiClient(async () => result) });
      const { readme, aiPowered } = await (await H.json('POST', `${PB}/readme`, { projectPlan })).json();
      expect(aiPowered).toBe(false);
      expect(readme.startsWith('# Shop\n\nA store\n\n## Tech Stack\n\n- React\n- Node.js\n- PostgreSQL\n\n## Getting Started')).toBe(true);
      expect(readme).toContain('- PostgreSQL 14+');
      expect(readme).toContain('git clone https://github.com/yourusername/shop.git\ncd shop');
      expect(readme).toContain('- **Cart**: Buy things');
      expect(readme).toContain('| GET | `/api/items` | List |');
      expect(readme).toContain('```\nsrc/\n  App.jsx\n```');
      expect(readme.endsWith('This project is licensed under the MIT License.\n')).toBe(true);
    }
    expect(warned()).toContain('AI README generation failed, using fallback');
  });

  it('fallback README defaults when the plan is sparse', async () => {
    const H = makeLarge1({ plan: 1 });
    const { readme } = await (await H.json('POST', `${PB}/readme`, { projectPlan: { foo: 1 } })).json();
    expect(readme.startsWith('# My Project\n\nA web application built with modern technologies.\n')).toBe(true);
    expect(readme).not.toContain('PostgreSQL 14+');
  });

  it('callAI rejecting -> 500 Failed to generate README.', async () => {
    const H = makeLarge1({ plan: 1, aiClient: makeAiClient(async () => { throw new Error('timeout'); }) });
    const res = await H.json('POST', `${PB}/readme`, { projectPlan });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Failed to generate README.' });
  });
});

describe('POST /deployment', () => {
  const projectPlan = { name: 'Shop', techStack: { frontend: ['React'] } };
  const aiGuide = { platform: 'railway', steps: [{ title: 's', command: null, description: 'd' }], notes: ['n'] };

  it('validation: 400 when projectPlan missing', async () => {
    const H = makeLarge1({ plan: 1 });
    const res = await H.json('POST', `${PB}/deployment`, { platform: 'render' });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Project plan is required.' });
  });

  it('AI guide used when it has steps; platform validated; prompt/params as Express', async () => {
    const ai = makeAiClient(async () => ({ ok: true, data: JSON.stringify(aiGuide) }));
    const H = makeLarge1({ plan: 1, aiClient: ai, envOverrides: { LM_STUDIO_MODEL: 'dm' } });
    const res = await H.json('POST', `${PB}/deployment`, { projectPlan, platform: 'railway' });
    expect(await res.json()).toEqual({ guide: aiGuide, aiPowered: true });
    const arg = ai.callAI.mock.calls[0][0];
    expect(arg).toMatchObject({ maxTokens: 800, temperature: 0.4, model: 'dm', structuredJson: true });
    expect(arg.userPrompt.startsWith('Create a deployment guide for deploying "Shop" to railway.\nTech stack: {"frontend":["React"]}')).toBe(true);
    expect(arg.userPrompt).toContain('"platform": "railway",');
  });

  it('unknown platform defaults to vercel in the prompt and the fallback', async () => {
    const ai = makeAiClient();
    const H = makeLarge1({ plan: 1, aiClient: ai });
    const { guide, aiPowered } = await (await H.json('POST', `${PB}/deployment`, { projectPlan, platform: 'heroku' })).json();
    expect(ai.callAI.mock.calls[0][0].userPrompt).toContain('to vercel.');
    expect(aiPowered).toBe(false);
    expect(guide.platform).toBe('Vercel');
    expect(guide.steps).toHaveLength(5);
  });

  it.each([['railway', 'Railway', 6], ['render', 'Render', 6], ['vercel', 'Vercel', 5]])('fallback guide for %s', async (platform, label, steps) => {
    const H = makeLarge1({ plan: 1 });
    const { guide } = await (await H.json('POST', `${PB}/deployment`, { projectPlan, platform })).json();
    expect(guide.platform).toBe(label);
    expect(guide.steps).toHaveLength(steps);
    expect(guide.notes).toHaveLength(3);
  });

  it('AI ok but no steps: fallback guide, aiPowered false', async () => {
    const H = makeLarge1({ plan: 1, aiClient: makeAiClient(async () => ({ ok: true, data: '{"steps": []}' })) });
    const body = await (await H.json('POST', `${PB}/deployment`, { projectPlan, platform: 'render' })).json();
    expect(body.aiPowered).toBe(false);
    expect(body.guide.platform).toBe('Render');
  });

  it('callAI rejecting -> 500 Failed to generate deployment guide.', async () => {
    const H = makeLarge1({ plan: 1, aiClient: makeAiClient(async () => { throw new Error('x'); }) });
    const res = await H.json('POST', `${PB}/deployment`, { projectPlan });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Failed to generate deployment guide.' });
  });
});

describe('workspace', () => {
  const project = { id: 3, name: 'P', plan: {}, status: 'Planning', tasks: [], notes: '', created_at: 'a', updated_at: 'b' };

  describe('GET /workspace', () => {
    it("lists the caller's projects (user id bound as $1)", async () => {
      const H = makeLarge1({ plan: 1, script: (sql) => (/FROM project_workspace/.test(sql) ? { rows: [project] } : undefined) });
      const res = await H.authed(`${PB}/workspace`);
      expect(await res.json()).toEqual({ projects: [project] });
      expect(H.db.calls[0]).toEqual({
        sql: 'SELECT id, name, plan, status, tasks, notes, created_at, updated_at FROM project_workspace WHERE user_id = $1 ORDER BY updated_at DESC',
        params: [1],
      });
    });

    it('db error: 200 { projects: [] }, logged', async () => {
      const H = makeLarge1({ plan: 1, script: () => { throw new Error('no table'); } });
      const res = await H.authed(`${PB}/workspace`);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ projects: [] });
      expect(logged()).toContain('Workspace fetch error: no table');
    });
  });

  describe('POST /workspace', () => {
    it('saves with defaults (plan {}, status Planning, tasks [], notes "")', async () => {
      const H = makeLarge1({ plan: 1, script: (sql, p) => (/^INSERT INTO project_workspace/.test(sql) ? { rows: [{ ...project, id: 8, name: p[1] }] } : undefined) });
      const res = await H.json('POST', `${PB}/workspace`, { name: 'My Project' });
      expect(res.status).toBe(200);
      expect((await res.json()).project.id).toBe(8);
      expect(H.db.calls[0].params).toEqual([1, 'My Project', '{}', 'Planning', '[]', '']);
      expect(H.db.calls[0].sql).toContain('RETURNING id, name, plan, status, tasks, notes, created_at, updated_at');
    });

    it('saves provided fields JSON-encoded', async () => {
      const H = makeLarge1({ plan: 1, script: () => ({ rows: [project] }) });
      await H.json('POST', `${PB}/workspace`, { name: 'n', plan: { a: 1 }, status: 'Building', tasks: [{ t: 1 }], notes: 'hi' });
      expect(H.db.calls[0].params).toEqual([1, 'n', '{"a":1}', 'Building', '[{"t":1}]', 'hi']);
    });

    it('validation: 400 without a name', async () => {
      const H = makeLarge1({ plan: 1 });
      const res = await H.json('POST', `${PB}/workspace`, { status: 'x' });
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'Project name is required.' });
    });

    it('db error: 500 Failed to save project.', async () => {
      const H = makeLarge1({ plan: 1, script: () => { throw new Error('unique'); } });
      const res = await H.json('POST', `${PB}/workspace`, { name: 'n' });
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: 'Failed to save project.' });
      expect(logged()).toContain('Workspace save error: unique');
    });
  });

  describe('PUT /workspace/:id', () => {
    it('builds a dynamic UPDATE from the provided fields only, scoped to the caller', async () => {
      const H = makeLarge1({ plan: 1, script: () => ({ rows: [project] }) });
      const res = await H.json('PUT', `${PB}/workspace/3`, { status: 'Done', notes: 'shipped' });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ project });
      expect(H.db.calls[0]).toEqual({
        sql: 'UPDATE project_workspace SET status = $1, notes = $2, updated_at = NOW() WHERE id = $3 AND user_id = $4 RETURNING id, name, plan, status, tasks, notes, created_at, updated_at',
        params: ['Done', 'shipped', '3', 1],
      });
    });

    it('all three fields; tasks JSON-encoded; empty string / falsy values still count as provided', async () => {
      const H = makeLarge1({ plan: 1, script: () => ({ rows: [project] }) });
      await H.json('PUT', `${PB}/workspace/3`, { status: '', tasks: [], notes: '' });
      expect(H.db.calls[0].sql).toContain('SET status = $1, tasks = $2, notes = $3, updated_at = NOW() WHERE id = $4 AND user_id = $5');
      expect(H.db.calls[0].params).toEqual(['', '[]', '', '3', 1]);
    });

    it('validation: 400 No fields to update.', async () => {
      const H = makeLarge1({ plan: 1 });
      const res = await H.json('PUT', `${PB}/workspace/3`, {});
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'No fields to update.' });
      expect(H.db.calls).toEqual([]);
    });

    it("404 Project not found. when the row is not the caller's", async () => {
      const H = makeLarge1({ plan: 1, script: () => ({ rows: [] }) });
      const res = await H.json('PUT', `${PB}/workspace/99`, { status: 'x' });
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: 'Project not found.' });
    });

    it('db error: 500 Failed to update project.', async () => {
      const H = makeLarge1({ plan: 1, script: () => { throw new Error('bad id'); } });
      const res = await H.json('PUT', `${PB}/workspace/abc`, { status: 'x' });
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: 'Failed to update project.' });
    });

    it('no JSON body: caught -> 500 Failed to update project.', async () => {
      const H = makeLarge1({ plan: 1 });
      const res = await H.authed(`${PB}/workspace/3`, { method: 'PUT' });
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: 'Failed to update project.' });
    });
  });
});
