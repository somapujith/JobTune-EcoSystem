'use strict';

/**
 * The two aggregated files this slice owns: services/registry/leaf2.js and routes/mounts/leaf2.js.
 * Proves the registry lines build working services through the REAL container (createServices), that
 * evidenceTracker reaches the injected services.embeddings, that studyHistoryService keeps the API
 * mid2/studyTools depends on, and that mount() registers exactly the slice's routers, in order, so a
 * request through the real container + mount works end to end.
 */
const registry = require('../../../src/worker/services/registry/leaf2');
const { createServices, REGISTRY } = require('../../../src/worker/services');
const { createApp } = require('../../../src/worker/app');
const { listMounts, listRoutes } = require('../../../src/worker/lib/routes');
const { mount } = require('../../../src/worker/routes/mounts/leaf2');
const { createConfig } = require('../../../src/worker/config');
const { makeEnv, makeCtx, signToken, seedPlans } = require('../helpers/harness');
const { makeLeaf2Db, TOPICS } = require('./helpers');

const NAMES = ['activityService', 'evidenceTracker', 'learningPathService', 'piiRedactor', 'srsService', 'studyHistoryService'];

describe('services/registry/leaf2.js', () => {
  it('registers exactly the six leaf2 services, keyed by camelCase module base name', () => {
    expect(Object.keys(registry).sort()).toEqual(NAMES);
    for (const name of NAMES) expect(REGISTRY[name]).toBe(registry[name]);
  });

  it('builds each service lazily through the real container with the expected public API', () => {
    const db = makeLeaf2Db();
    const config = createConfig(makeEnv());
    const services = createServices({ db, config });
    expect(Object.keys(services.activityService).sort()).toEqual(
      ['checkAndUnlockAchievements', 'getAchievements', 'getHeatmapData', 'getStats', 'getWeeklyActivity', 'trackActivity']
    );
    expect(Object.keys(services.learningPathService).sort()).toEqual(
      ['getStreak', 'getTopic', 'listSubjects', 'listTopics', 'markComplete', 'markIncomplete', 'touchStreak', 'validateTier']
    );
    expect(Object.keys(services.srsService).sort()).toEqual(['getDecks', 'getDueCards', 'reviewCard', 'saveDeck']);
    expect(Object.keys(services.piiRedactor).sort()).toEqual(['redact', 'restore']);
    expect(Object.keys(services.evidenceTracker).sort()).toEqual(
      ['calculateDiversityScore', 'extractBullets', 'extractSkillsFromText', 'getReuseReport', 'hashBullet', 'logUsage', 'saveBullet']
    );
  });

  it('studyHistoryService keeps the API routes/studyTools (mid2) consumes, and it runs on the request db', async () => {
    const db = makeLeaf2Db();
    const services = createServices({ db, config: createConfig(makeEnv()) });
    expect(Object.keys(services.studyHistoryService).sort()).toEqual(['getHistory', 'getStats', 'getWeeklySummary', 'saveSession']);
    const saved = await services.studyHistoryService.saveSession(7, { sessionType: 'quiz', topic: 'js', score: 3, data: { a: 1 } });
    expect(saved).toEqual({ id: 1, created_at: expect.any(Date) });
    expect(db.state.study_sessions[0]).toMatchObject({ user_id: 7, session_type: 'quiz', topic: 'js', difficulty: null, score: 3, data: { a: 1 } });
  });

  it('evidenceTracker.saveBullet uses the container\'s embeddings service (contract: embedText(text))', async () => {
    const db = makeLeaf2Db();
    const embedText = jest.fn().mockResolvedValue([0.5, 0.25]);
    db.on(/^INSERT INTO evidence_bullets/, () => ({ rows: [{ id: 3 }] }));
    const services = createServices({ db, config: createConfig(makeEnv()), overrides: { embeddings: { embedText } } });
    const bullet = { text: 'Built a Node.js API', skills: ['node.js', 'api'], hash: 'h' };
    await expect(services.evidenceTracker.saveBullet(7, bullet)).resolves.toEqual({ id: 3 });
    expect(embedText).toHaveBeenCalledWith('Built a Node.js API');
    expect(db.leafCalls[0].params).toEqual([7, 'Built a Node.js API', 'h', 'experience', '["node.js","api"]', '[0.5,0.25]']);
  });

  it('a container built once per request shares state: each service instance is cached per request', () => {
    const services = createServices({ db: makeLeaf2Db(), config: createConfig(makeEnv()) });
    expect(services.srsService).toBe(services.srsService);
  });
});

describe('routes/mounts/leaf2.js', () => {
  it('mounts the five routers at the Express prefixes, in the Express order', () => {
    const app = createApp();
    mount(app);
    expect(listMounts(app).map((m) => m.prefix).filter((p) => p !== '/api')).toEqual([
      '/api/evidence',
      '/api/pii',
      '/api/activity',
      '/api/study-history',
      '/api/learning-path',
    ]);
    const paths = listRoutes(app).map((r) => r.path);
    expect(paths.filter((p) => /^\/api\/(evidence|pii|activity|study-history|learning-path)\//.test(p))).toHaveLength(23);
  });

  it('end to end through the REAL container and mount: no test-only service wiring', async () => {
    const db = makeLeaf2Db();
    seedPlans(db);
    db.state.user_subscriptions.push({ user_id: 7, plan_id: 1 });
    db.state.learning_topics.push(...TOPICS);
    const app = createApp({ dbFactory: () => db }); // default servicesFactory = createServices (real registry)
    mount(app);
    const env = makeEnv();
    const ctx = makeCtx();
    const auth = { headers: { Authorization: `Bearer ${signToken({ id: 7 })}` } };

    const subjects = await app.request('/api/learning-path/subjects', auth, env, ctx);
    expect(subjects.status).toBe(200);
    expect(await subjects.json()).toEqual({ subjects: ['python', 'sql'] });

    const decks = await app.request('/api/study-history/srs/decks', auth, env, ctx);
    expect(decks.status).toBe(200);
    expect(await decks.json()).toEqual({ decks: [] });

    const redact = await app.request(
      '/api/pii/redact',
      { method: 'POST', headers: { ...auth.headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ text: 'mail a@b.co', contextType: 'resume' }) },
      env,
      ctx
    );
    expect(await redact.json()).toEqual({ redacted: 'mail [EMAIL_1]', map: { '[EMAIL_1]': 'a@b.co' }, savedId: 1 });

    const denied = await app.request('/api/evidence/report', auth, env, ctx);
    expect(denied.status).toBe(403); // plan 1 < tier 3
    await ctx.drain();
  });
});
