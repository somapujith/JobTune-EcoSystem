'use strict';

/**
 * Entitlement / auth parity for the mid2 slice, refereed by the Express-derived manifest
 * (docs/migration/manifest.render.json, ADR-001 6.3 / T4.1):
 *
 *   1. introspection: a mini app that mounts ONLY the five mid2 routers, with the prefixes recorded in
 *      the manifest (and cross-checked against backend/src/app.js), must expose exactly the manifest's
 *      endpoints with the same auth / minTier / guards, no untagged middleware, no admin/role guards;
 *   2. behaviour: for every endpoint, no/invalid token -> 401; for every gated endpoint the tier matrix
 *      {no plan, 1, 2, 3} yields 403 PLAN_UPGRADE_REQUIRED (exact body) below the threshold and reaches the
 *      handler at or above it.
 */
const fs = require('fs');
const path = require('path');
const { listRoutes, listMounts } = require('../../../src/worker/lib/routes');
const { miniApp, build, MID2_MOUNTS, quietConsole } = require('./helpers');

const REPO_ROOT = path.resolve(__dirname, '../../../..');
const MANIFEST = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'docs/migration/manifest.render.json'), 'utf8'));
const APP_JS = fs.readFileSync(path.join(REPO_ROOT, 'backend/src/app.js'), 'utf8');

const MID2_FILES = ['skills', 'dashboard', 'learningModules', 'aiTutor', 'studyTools'].map((n) => `backend/src/routes/${n}.js`);
const mid2Mounts = MANIFEST.mounts.filter((m) => MID2_FILES.includes(m.routerFile)).sort((a, b) => a.order - b.order);
const mid2Endpoints = MANIFEST.endpoints.filter((e) => MID2_FILES.includes(e.routerFile));

const canon = (method, p) => `${method.toUpperCase()} ${p.toLowerCase().replace(/\/+$/, '').replace(/:[A-Za-z0-9_]+(\{[^}]*\})?/g, ':')}`;
const GUARD_KINDS = ['auth', 'plan', 'admin', 'role'];

describe('mid2 vs docs/migration/manifest.render.json', () => {
  it('the manifest lists 22 endpoints for the 5 routers (3 + 1 + 6 + 8 + 4)', () => {
    expect(mid2Mounts).toHaveLength(5);
    expect(mid2Endpoints).toHaveLength(22);
    const perFile = Object.fromEntries(MID2_FILES.map((f) => [path.basename(f, '.js'), mid2Endpoints.filter((e) => e.routerFile === f).length]));
    expect(perFile).toEqual({ skills: 3, dashboard: 1, learningModules: 6, aiTutor: 8, studyTools: 4 });
  });

  it('mounts use the manifest prefixes, in the manifest (= app.js) order, and app.js really mounts them so', () => {
    expect(mid2Mounts.map((m) => m.prefix)).toEqual(MID2_MOUNTS.map(([prefix]) => prefix));
    for (const m of mid2Mounts) {
      expect(APP_JS).toContain(`app.use('${m.prefix}', ${m.routerVar});`);
    }
    const app = miniApp();
    expect(listMounts(app).map((m) => m.prefix)).toEqual(expect.arrayContaining(mid2Mounts.map((m) => m.prefix)));
  });

  describe('listRoutes(mini app) introspection', () => {
    const app = miniApp();
    const workerRoutes = listRoutes(app).filter((r) => mid2Mounts.some((m) => r.path === m.prefix || r.path.startsWith(`${m.prefix}/`)));

    it('exposes exactly the manifest endpoints (no missing, no extra)', () => {
      const worker = workerRoutes.map((r) => canon(r.method, r.path)).sort();
      const expected = mid2Endpoints.map((e) => canon(e.method, e.path)).sort();
      expect(worker).toEqual(expected);
      expect(new Set(worker).size).toBe(worker.length);
    });

    it.each(mid2Endpoints.map((e) => [e.id, e]))('%s: auth / minTier / guards match the manifest', (_id, e) => {
      const r = workerRoutes.find((w) => canon(w.method, w.path) === canon(e.method, e.path));
      expect(r).toBeDefined();
      expect(r.auth).toBe(e.auth);
      expect(r.minTier).toBe(e.minTier === undefined ? null : e.minTier);
      const guards = r.middleware.filter((m) => GUARD_KINDS.includes(m.kind)).map((m) => m.name);
      expect(guards).toEqual(e.guards);
      // none of these endpoints has an admin or role guard in Express, so none may exist here
      expect(e.admin).toBe(false);
      expect(e.roles).toBeNull();
      expect(r.middleware.some((m) => m.kind === 'admin' || m.kind === 'role')).toBe(false);
      expect(r.untagged).toBe(0);
    });

    it('/api/learning-modules/tracks is registered before /:trackId (Express order)', () => {
      const routes = app.routes.filter((r) => r.method === 'GET' && r.path.startsWith('/api/learning-modules'));
      const order = routes.map((r) => r.path);
      expect(order.indexOf('/api/learning-modules/tracks')).toBeLessThan(order.indexOf('/api/learning-modules/:trackId'));
      expect(order.indexOf('/api/learning-modules/:trackId')).toBeLessThan(order.indexOf('/api/learning-modules/:trackId/:moduleId'));
    });
  });

  describe('runtime gates (401 and the tier matrix)', () => {
    quietConsole();
    const sample = (p) => p.replace(/:[A-Za-z0-9_]+/g, 'x');

    it.each(mid2Endpoints.map((e) => [e.id, e]))('%s: 401 without a token and with a bad token', async (_id, e) => {
      const H = build({ plan: 3 });
      const p = sample(e.path);
      for (const token of [null, 'not-a-jwt']) {
        const res = await H.call(e.method, p, { token, body: e.method === 'GET' || e.method === 'DELETE' ? undefined : {} });
        expect(res.status).toBe(401);
        expect(await res.json()).toEqual({ error: 'Unauthorized' });
      }
      expect(H.ai.callAI).not.toHaveBeenCalled();
      expect(H.studyHistory.saveSession).not.toHaveBeenCalled();
    });

    const TIER_NAMES = { 1: 'Learn & Build', 2: 'Tune & Polish', 3: 'Zero to Hero' };
    const PLAN_NAMES = { 1: 'Learn & Build', 2: 'Tune & Polish', 3: 'Zero to Hero' };
    const gated = mid2Endpoints.filter((e) => e.minTier);
    const plans = [undefined, 1, 2, 3];

    describe.each(gated.map((e) => [e.id, e]))('%s (requirePlan)', (_id, e) => {
      it.each(plans.map((plan) => [plan === undefined ? 'no plan' : `tier ${plan}`, plan]))('%s', async (_label, plan) => {
        const H = build({ plan });
        const res = await H.call(e.method, sample(e.path), {
          body: e.method === 'GET' || e.method === 'DELETE' ? undefined : {},
        });
        if (!plan || plan < e.minTier) {
          expect(res.status).toBe(403);
          expect(await res.json()).toEqual({
            error: 'This feature requires a higher subscription plan.',
            code: 'PLAN_UPGRADE_REQUIRED',
            requiredPlan: TIER_NAMES[e.minTier],
            currentPlan: plan ? PLAN_NAMES[plan] : null,
          });
          // the gate is in front of everything: no AI call, no history write, no db write
          expect(H.ai.callAI).not.toHaveBeenCalled();
          expect(H.studyHistory.saveSession).not.toHaveBeenCalled();
          expect(H.db.mid2Calls).toEqual([]);
        } else {
          // handler reached (its own status varies: 200 / 400 / masked 500 for a bodyless request)
          expect([401, 403]).not.toContain(res.status);
        }
      });
    });

    it('a plan-service failure fails CLOSED on a gated route (500, handler never runs)', async () => {
      const H = build({
        plan: 3,
        overrides: {
          planService: { getUserPlan: async () => { throw new Error('db down'); } },
        },
      });
      const res = await H.post('/api/study-tools/quiz/generate', { topic: 'react' });
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: 'Failed to verify subscription plan' });
      expect(H.ai.callAI).not.toHaveBeenCalled();
    });

    const ungated = mid2Endpoints.filter((e) => !e.minTier);
    it.each(ungated.map((e) => [e.id, e]))('%s: auth only, reachable with a token and no plan', async (_id, e) => {
      const H = build(); // no subscription
      const res = await H.call(e.method, sample(e.path), { body: e.method === 'GET' || e.method === 'DELETE' ? undefined : {} });
      expect([401, 403]).not.toContain(res.status);
    });
  });
});
