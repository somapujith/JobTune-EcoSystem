'use strict';

/**
 * The two aggregator-facing files of the slice: routes/mounts/mid2.js and services/registry/mid2.js.
 * (createApp() mounts nothing from the slices by default; worker-entry.js opts in via mountSlices, which is
 * how these files reach production. Nothing here builds the whole app, so other slices' work in progress
 * cannot affect this file.)
 */
const fs = require('fs');
const path = require('path');
const { createApp } = require('../../../src/worker/app');
const { listMounts, listRoutes } = require('../../../src/worker/lib/routes');
const { mount } = require('../../../src/worker/routes/mounts/mid2');
const registry = require('../../../src/worker/services/registry/mid2');
const { createServices, REGISTRY } = require('../../../src/worker/services');
const { makeEnv, makeCtx, signToken, seedPlans, createFakeDb } = require('../helpers/harness');
const { createConfig } = require('../../../src/worker/config');
const { miniApp, MID2_MOUNTS, createMid2Db, quietConsole } = require('./helpers');

const APP_JS = fs.readFileSync(path.resolve(__dirname, '../../../src/app.js'), 'utf8');

describe('routes/mounts/mid2.js', () => {
  it('exports mount(app) and mounts the five routers with the Express prefixes in Express relative order', () => {
    const app = createApp();
    mount(app);
    const prefixes = listMounts(app).map((m) => m.prefix).filter((p) => p !== '/api');
    expect(prefixes).toEqual(['/api/skills', '/api/dashboard', '/api/ai-tutor', '/api/study-tools', '/api/learning-modules']);

    // relative order and prefixes agree with backend/src/app.js
    const positions = prefixes.map((p) => APP_JS.indexOf(`app.use('${p}', `));
    expect(positions.every((i) => i > 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it('registers exactly the same endpoints (method, path, auth, minTier) as the test mini-app', () => {
    const app = createApp();
    mount(app);
    const shape = (a) =>
      listRoutes(a)
        .filter((r) => r.path.startsWith('/api/') && !r.path.startsWith('/api/health'))
        .map((r) => `${r.method} ${r.path} auth=${r.auth} tier=${r.minTier} untagged=${r.untagged}`);
    expect(shape(app)).toHaveLength(22);
    expect(shape(app)).toEqual(shape(miniApp()));
  });

  it('a request through the app mounted by the mount file reaches a router: 401 anonymous, 403 below the plan, 200 with it', async () => {
    const db = createFakeDb();
    seedPlans(db);
    const app = createApp({ dbFactory: () => db });
    mount(app);
    const env = makeEnv();
    const ctx = makeCtx();
    const call = (token) =>
      app.request('/api/skills/questions', token ? { headers: { Authorization: `Bearer ${token}` } } : {}, env, ctx);

    expect((await call(null)).status).toBe(401);
    expect((await call(signToken({ id: 1 }))).status).toBe(403); // authenticated, no plan
    db.state.user_subscriptions.push({ user_id: 1, plan_id: 1 });
    const ok = await call(signToken({ id: 1 }));
    expect(ok.status).toBe(200);
    expect((await ok.json()).total).toBe(8);
    expect(MID2_MOUNTS).toHaveLength(5);
  });
});

describe('services/registry/mid2.js', () => {
  quietConsole();

  it('registers tutorHistoryService only (studyHistoryService and aiClient belong to other slices)', () => {
    expect(Object.keys(registry)).toEqual(['tutorHistoryService']);
    expect(typeof REGISTRY.tutorHistoryService).toBe('function');
  });

  it('the container builds a working tutorHistoryService over the request db, lazily, once per request', async () => {
    const db = createMid2Db();
    const config = createConfig(makeEnv());
    const services = createServices({ db, config });
    const svc = services.tutorHistoryService;
    expect(services.tutorHistoryService).toBe(svc); // cached for the request
    const saved = await svc.saveConversation(1, 'topic', undefined, [{ role: 'user', content: 'hi' }]);
    expect(saved.id).toBe(1);
    expect((await svc.getConversations(1)).map((c) => c.id)).toEqual([1]);
    expect(await svc.getConversation(1, 2)).toBeNull();
  });

  it('a fresh container gives a fresh service (no state shared between requests)', () => {
    const config = createConfig(makeEnv());
    const a = createServices({ db: createMid2Db(), config }).tutorHistoryService;
    const b = createServices({ db: createMid2Db(), config }).tutorHistoryService;
    expect(a).not.toBe(b);
  });
});
