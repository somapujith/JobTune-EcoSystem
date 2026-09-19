'use strict';

/**
 * /api/profiles: Worker-specific behaviour that the Express-vs-Worker differential (differential.test.js) cannot
 * express, plus a few independently-derived expectations so the port is not only compared with itself.
 * The auth / plan matrix for every endpoint lives in manifest.test.js.
 */
const { makeHarness, makeAi, aiOk, githubFetchMock } = require('./helpers');

let error;
let warn;
beforeEach(() => {
  error = jest.spyOn(console, 'error').mockImplementation(() => {});
  warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  global.fetch = jest.fn(async (url) => { throw new Error(`unexpected fetch ${url}`); });
});
afterEach(() => {
  delete global.fetch;
  jest.restoreAllMocks();
});

const GH_HEADERS = { Accept: 'application/vnd.github.v3+json', 'User-Agent': 'JobTune-Optimizer' };
const b64 = (text) => Buffer.from(text, 'utf8').toString('base64').replace(/(.{60})/g, '$1\n');

describe('POST /api/profiles/github/analyze (tier 2)', () => {
  const user = { login: 'octocat', name: 'Octo', bio: 'I build web things with care', followers: 3, following: 1, public_repos: 2, blog: 'octo.dev', location: 'Earth' };
  const repos = [
    { name: 'octocat', description: 'profile', language: 'Markdown', topics: ['a', 'b'], stargazers_count: 4, forks_count: 0, homepage: '', pushed_at: '2026-01-01T00:00:00Z', size: 1, fork: false },
    { name: 'web-app', description: 'A web application for testing things', language: 'JavaScript', topics: ['vercel'], stargazers_count: 6, forks_count: 1, homepage: null, pushed_at: '2026-01-01T00:00:00Z', size: 2, fork: false },
    { name: 'a-fork', description: 'ignored', language: 'Go', topics: [], stargazers_count: 100, forks_count: 0, homepage: null, updated_at: '2026-01-01', fork: true },
  ];

  it('calls GitHub exactly as before (three GET requests, GitHub headers, timeout signal) and decodes the profile README', async () => {
    global.fetch = githubFetchMock({ user, repos, readme: { content: b64('# Hello\n\nUnicode ✓ é 😀') } });
    const H = makeHarness({ plan: 2, envOverrides: { LM_STUDIO_MODEL_GITHUB: 'gh-model' } });
    const res = await H.authed('/api/profiles/github/analyze', { method: 'POST', body: { username: '  https://GitHub.com/OctoCat/repo?x=1 ' } });
    expect(res.status).toBe(200);
    const body = await res.json();

    const urls = global.fetch.mock.calls.map((c) => c[0]).sort();
    expect(urls).toEqual([
      'https://api.github.com/repos/octocat/octocat/readme',
      'https://api.github.com/users/octocat',
      'https://api.github.com/users/octocat/repos?per_page=100&sort=updated',
    ]);
    for (const [, init] of global.fetch.mock.calls) {
      expect(init.headers).toEqual(GH_HEADERS);
      expect(init.signal).toBeInstanceOf(AbortSignal);
    }
    expect(body.username).toBe('octocat');
    expect(body.profile.existingReadmeContent).toBe('# Hello\n\nUnicode ✓ é 😀');
    expect(body.repos.map((r) => r.name)).toEqual(['octocat', 'web-app']); // forks are dropped
    expect(body.profile.hasProfileReadme).toBe(true);
    expect(H.ai.calls[0].model).toBe('gh-model'); // config.vars.LM_STUDIO_MODEL_GITHUB reaches callAI
    expect(H.ai.calls[0]).toMatchObject({ maxTokens: 1500, temperature: 0.5, structuredJson: true });
    expect('cache' in H.ai.calls[0]).toBe(false); // caching stays at the aiClient default, as on Express
  });

  it('username handling: only the host-free first path segment is used, so the outbound URL host is always api.github.com', async () => {
    global.fetch = githubFetchMock({ user: { ...user, login: 'evil' }, repos: [] });
    const H = makeHarness({ plan: 2 });
    for (const username of ['evil.example.com/../x', 'http://evil.example/api', 'user@evil.example']) {
      const res = await H.authed('/api/profiles/github/analyze', { method: 'POST', body: { username } });
      expect([200, 400, 404]).toContain(res.status);
    }
    for (const [url] of global.fetch.mock.calls) expect(new URL(url).host).toBe('api.github.com');
  });

  it('a non-GitHub username character never reaches fetch (validation 400)', async () => {
    const H = makeHarness({ plan: 2 });
    for (const username of ['bad name', 'a_b', 'x'.repeat(40), '-lead', 'trail-', 'dou--ble', '../etc/passwd', '<script>']) {
      const res = await H.authed('/api/profiles/github/analyze', { method: 'POST', body: { username } });
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'Invalid GitHub username format.' });
    }
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('a README fetch failure is non-fatal and logged', async () => {
    global.fetch = jest.fn(async (url) => {
      if (/readme$/.test(url)) throw new Error('readme timeout');
      if (/repos\?/.test(url)) return { ok: true, status: 200, json: async () => repos };
      return { ok: true, status: 200, json: async () => user };
    });
    const H = makeHarness({ plan: 2 });
    const res = await H.authed('/api/profiles/github/analyze', { method: 'POST', body: { username: 'octocat' } });
    expect(res.status).toBe(200);
    expect((await res.json()).profile.existingReadmeContent).toBeNull();
    expect(warn).toHaveBeenCalledWith('Profile README fetch failed:', 'readme timeout');
  });

  it('AI output is used when valid (aiPowered true) and capped to 5 suggestions', async () => {
    global.fetch = githubFetchMock({ user, repos });
    const ai = makeAi([aiOk({ profileReadme: '# X', recruiterSummary: 'S', repoSuggestions: [1, 2, 3, 4, 5, 6, 7], hostingRecs: 'nope' })]);
    const H = makeHarness({ plan: 2, ai });
    const body = await (await H.authed('/api/profiles/github/analyze', { method: 'POST', body: { username: 'octocat' } })).json();
    expect(body.stage4).toMatchObject({ aiPowered: true, profileReadme: '# X', recruiterSummary: 'S', hostingRecs: [] });
    expect(body.stage4.repoSuggestions).toHaveLength(5);
    expect(body.generatedReadme).toBe('# X');
    expect(body.report.summary).toBe('S');
    expect(body.score).toBe(body.scores.overall);
    expect(body.scoreLabel).toBe(body.grade);
  });

  it('a mis-wired aiClient is a loud failure (route-level 500), never a silent rule-based fallback', async () => {
    global.fetch = githubFetchMock({ user, repos });
    const H = makeHarness({ plan: 2, ai: {} });
    const res = await H.authed('/api/profiles/github/analyze', { method: 'POST', body: { username: 'octocat' } });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Analysis failed. Please try again.' });
    expect(error.mock.calls.flat().join(' ')).toContain('aiClient service is not registered');
  });
});

describe('POST /api/profiles/github/save and GET /api/profiles/github/history', () => {
  it("stores under the JWT's user id (a user_id in the body is ignored) and history returns only that user's last five", async () => {
    const H = makeHarness({ plan: 2 });
    const res = await H.authed('/api/profiles/github/save', {
      method: 'POST',
      body: { user_id: 999, username: 'octocat', scores: { overall: 81 }, grade: 'Good', report: { r: 1 }, stage4: { s: 1 } },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, id: 1 });
    expect(H.db.state.github_analyses).toEqual([
      expect.objectContaining({ user_id: 1, username: 'octocat', overall_score: 81, grade: 'Good', report: JSON.stringify({ scores: { overall: 81 }, grade: 'Good', report: { r: 1 }, stage4: { s: 1 } }) }),
    ]);

    for (let i = 0; i < 6; i += 1) H.db.state.github_analyses.push({ id: 10 + i, user_id: 1, username: `u${i}`, overall_score: i, grade: 'x', report: '{}', created_at: new Date(5000 + i) });
    H.db.state.github_analyses.push({ id: 50, user_id: 2, username: 'someone-else', overall_score: 1, grade: 'x', report: '{}', created_at: new Date(9e9) });
    const { history } = await (await H.authed('/api/profiles/github/history')).json();
    expect(history).toHaveLength(5);
    expect(history.map((h) => h.username)).not.toContain('someone-else');
  });

  it('defaults for missing fields: username "unknown", score 0, grade "N/A"', async () => {
    const H = makeHarness({ plan: 2 });
    await H.authed('/api/profiles/github/save', { method: 'POST', body: {} });
    expect(H.db.state.github_analyses[0]).toMatchObject({ username: 'unknown', overall_score: 0, grade: 'N/A' });
  });
});

describe('LinkedIn endpoints', () => {
  it('analyze: saves the report and adds analysisId/savedAt; a failing save is reported in persistence, not as an error', async () => {
    const H = makeHarness({ plan: 2 });
    const ok = await (await H.authed('/api/profiles/linkedin/analyze', { method: 'POST', body: { headline: 'Data Engineer', skills: 'SQL' } })).json();
    expect(ok.success).toBe(true);
    expect(ok.analysisId).toBe(1);
    expect(ok.savedAt).toBeDefined();
    expect(ok.persistence).toBeUndefined();

    H.db.breakTable('linkedin_analyses');
    const bad = await H.authed('/api/profiles/linkedin/analyze', { method: 'POST', body: { headline: 'Data Engineer' } });
    expect(bad.status).toBe(200);
    const badBody = await bad.json();
    expect(badBody.persistence).toEqual({ saved: false, reason: 'Analysis completed, but history save failed.' });
    expect(badBody.analysisId).toBeUndefined();
    expect(error).toHaveBeenCalledWith('LinkedIn analysis save error:', expect.stringContaining('linkedin_analyses'));
  });

  it("history/:id never returns another user's analysis (owner check is in the SQL parameters)", async () => {
    const H = makeHarness({ plan: 2 });
    H.db.state.linkedin_analyses.push({ id: 5, user_id: 2, profile_url: 'x', target_roles: [], overall_score: 1, grade: 'g', ai_powered: false, report: '{"secret":1}', created_at: new Date(1) });
    const res = await H.authed('/api/profiles/linkedin/history/5');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'LinkedIn analysis not found' });
    expect(H.db.callsMatching(/FROM linkedin_analyses WHERE id = \$1 AND user_id = \$2/)[0].params).toEqual(['5', 1]);
  });

  it('mis-wired linkedin services are a loud 500 with the route message', async () => {
    const H = makeHarness({ plan: 2 });
    // rebuild an app whose services container lacks the linkedin services
    const { createApp } = require('../../../src/worker/app');
    const { mountRoutes } = require('../../../src/worker/lib/routes');
    const { createServices } = require('../../../src/worker/services');
    const { makeEnv, makeCtx, signToken } = require('../helpers/harness');
    const app = createApp({ dbFactory: () => H.db, servicesFactory: ({ db, config }) => createServices({ db, config, overrides: { aiClient: makeAi(), linkedinAnalysisStore: undefined, linkedinOptimizerService: undefined } }) });
    mountRoutes(app, '/api/profiles', require('./helpers').profilesRouter);
    const auth = { headers: { Authorization: `Bearer ${signToken({ id: 1 })}` } };
    const res = await app.request('/api/profiles/linkedin/history', auth, makeEnv(), makeCtx());
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Failed to fetch LinkedIn history' });
    expect(error.mock.calls.flat().join(' ')).toContain('linkedinAnalysisStore service is not registered');
  });
});

describe('POST /api/profiles/jobmatch (auth only)', () => {
  it('derives keywords, matches, gaps by category and suggestions', async () => {
    const H = makeHarness({}); // no plan needed
    const res = await H.authed('/api/profiles/jobmatch', {
      method: 'POST',
      body: { jobDescription: 'Looking for React, Node.js, PostgreSQL, Docker, Kubernetes and Terraform experience', userSkills: 'react, node.js\npostgresql' },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.matchedKeywords).toEqual(expect.arrayContaining(['react', 'node.js', 'postgresql', 'sql', 'node']));
    expect(body.missingKeywords).toEqual(expect.arrayContaining(['docker', 'kubernetes']));
    expect(body.gapsByCategory.devops).toEqual(expect.arrayContaining(['docker', 'kubernetes']));
    expect(body.matchLabel).toBe(body.matchScore >= 80 ? 'Strong Match' : body.matchScore >= 60 ? 'Good Match' : body.matchScore >= 40 ? 'Partial Match' : 'Skill Gap Detected');
    expect(body.totalJdKeywords).toBe(body.matchedKeywords.length + body.missingKeywords.length);
    expect(body.totalMatched).toBe(body.matchedKeywords.length);
    expect(body.suggestions).toContain('You have a significant gap in devops technologies.');
  });

  it('the exact 400 and the no-keyword response', async () => {
    const H = makeHarness({});
    const bad = await H.authed('/api/profiles/jobmatch', { method: 'POST', body: { jobDescription: 'x' } });
    expect(bad.status).toBe(400);
    expect(await bad.json()).toEqual({ error: 'Job description and user skills are required' });
    const none = await H.authed('/api/profiles/jobmatch', { method: 'POST', body: { jobDescription: 'a friendly team', userSkills: 'js' } });
    expect(await none.json()).toEqual({
      matchScore: 0, matchLabel: 'Cannot Analyze', matchedKeywords: [], missingKeywords: [], gapsByCategory: {},
      suggestions: ['Could not detect any standard tech keywords in the job description.'], totalJdKeywords: 0, totalMatched: 0,
    });
  });

  it('it is synchronous and unguarded like Express: a non-string userSkills is a masked 500', async () => {
    const H = makeHarness({});
    const res = await H.authed('/api/profiles/jobmatch', { method: 'POST', body: { jobDescription: 'react', userSkills: ['react'] } });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal Server Error' });
  });
});

describe('response plumbing', () => {
  it('JSON endpoints answer application/json and keep the global security headers', async () => {
    const H = makeHarness({ plan: 2 });
    const res = await H.authed('/api/profiles/github/history');
    expect(res.headers.get('content-type')).toMatch(/^application\/json/);
    expect(res.headers.get('x-frame-options')).toBe('SAMEORIGIN');
  });
});
