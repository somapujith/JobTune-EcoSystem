'use strict';

/**
 * Referee for the leaf2 slice (ADR-001 6.3, brief hard rule 5): the Worker routers, mounted on a
 * mini-app at the SAME prefixes and in the same relative order as backend/src/app.js, must expose
 * exactly the endpoints in docs/migration/manifest.render.json (generated from the Express source)
 * with identical auth / minTier / admin / role guards, read back from the LIVE Hono app via
 * listRoutes(app) introspection (no source parsing on the Worker side).
 */
const fs = require('fs');
const path = require('path');
const { createApp } = require('../../../src/worker/app');
const { mountRoutes, listRoutes } = require('../../../src/worker/lib/routes');

const manifest = require('../../../../docs/migration/manifest.render.json');

const evidenceRoutes = require('../../../src/worker/routes/evidence');
const piiRoutes = require('../../../src/worker/routes/piiRedaction');
const activityRoutes = require('../../../src/worker/routes/activity');
const studyHistoryRoutes = require('../../../src/worker/routes/studyHistory');
const learningPathRoutes = require('../../../src/worker/routes/learningPath');

// Express app.js order: evidence(21) pii(22) ... activity(38) study-history(39) ... learning-path(41)
const MOUNTS = [
  { prefix: '/api/evidence', routerFile: 'backend/src/routes/evidence.js', router: evidenceRoutes, varName: 'evidenceRoutes' },
  { prefix: '/api/pii', routerFile: 'backend/src/routes/piiRedaction.js', router: piiRoutes, varName: 'piiRedactionRoutes' },
  { prefix: '/api/activity', routerFile: 'backend/src/routes/activity.js', router: activityRoutes, varName: 'activityRoutes' },
  { prefix: '/api/study-history', routerFile: 'backend/src/routes/studyHistory.js', router: studyHistoryRoutes, varName: 'studyHistoryRoutes' },
  { prefix: '/api/learning-path', routerFile: 'backend/src/routes/learningPath.js', router: learningPathRoutes, varName: 'learningPathRoutes' },
];
const PREFIXES = MOUNTS.map((m) => m.prefix);
const inSlice = (p) => PREFIXES.some((prefix) => p === prefix || p.startsWith(`${prefix}/`));

const canon = (p) => {
  let out = p.toLowerCase();
  if (out.length > 1 && out.endsWith('/')) out = out.slice(0, -1);
  return out.replace(/:[A-Za-z0-9_]+(\{[^}]*\}|\([^)]*\))?\??/g, ':');
};
const keyOf = (method, p) => `${method.toUpperCase()} ${canon(p)}`;

function guardsOf(route) {
  return route.middleware
    .filter((m) => ['auth', 'plan', 'admin', 'role'].includes(m.kind))
    .map((m) => {
      if (m.kind === 'auth') return 'authenticateToken';
      if (m.kind === 'plan') return `requirePlan(${m.minTier})`;
      if (m.kind === 'admin') return 'requireAdmin';
      return `requireRole(${(m.roles || []).map((r) => `'${r}'`).join(',')})`;
    });
}

function buildMiniApp() {
  const app = createApp(); // mountSlices is false: nothing but /api/health is mounted by default
  for (const m of MOUNTS) mountRoutes(app, m.prefix, m.router);
  return app;
}

const expected = manifest.endpoints.filter((e) => inSlice(e.path));

describe('leaf2 manifest parity (docs/migration/manifest.render.json vs live Hono app)', () => {
  it('the manifest lists the slice endpoints (guard against comparing nothing)', () => {
    expect(expected).toHaveLength(23);
    const perPrefix = Object.fromEntries(PREFIXES.map((p) => [p, expected.filter((e) => e.path.startsWith(`${p}/`)).length]));
    expect(perPrefix).toEqual({
      '/api/evidence': 2,
      '/api/pii': 2,
      '/api/activity': 6,
      '/api/study-history': 7,
      '/api/learning-path': 6,
    });
  });

  it('mounts the same prefixes, from the same route files, in the same relative order as the Express app', () => {
    const fromManifest = manifest.mounts
      .filter((m) => MOUNTS.some((x) => x.routerFile === m.routerFile))
      .sort((a, b) => a.order - b.order)
      .map((m) => ({ prefix: m.prefix, routerFile: m.routerFile }));
    expect(fromManifest).toEqual(MOUNTS.map(({ prefix, routerFile }) => ({ prefix, routerFile })));
  });

  it('backend/src/app.js itself registers those prefixes (independent of the generated manifest)', () => {
    const appJs = fs.readFileSync(path.resolve(__dirname, '../../../src/app.js'), 'utf8');
    for (const m of MOUNTS) {
      expect(appJs).toMatch(new RegExp(`app\\.use\\(\\s*['"]${m.prefix}['"]\\s*,\\s*${m.varName}\\s*\\)`));
    }
    // and in the same relative order
    const positions = MOUNTS.map((m) => appJs.indexOf(`app.use('${m.prefix}', ${m.varName})`));
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it('the mini-app exposes exactly the manifest endpoints (no missing, no extra)', () => {
    const routes = listRoutes(buildMiniApp()).filter((r) => inSlice(r.path));
    const worker = routes.map((r) => keyOf(r.method, r.path)).sort();
    const render = expected.map((e) => keyOf(e.method, e.path)).sort();
    expect(worker).toEqual(render);
    expect(new Set(worker).size).toBe(worker.length);
  });

  it('registers the endpoints in the same order as Express (order is behaviour: learning-path params)', () => {
    const routes = listRoutes(buildMiniApp()).filter((r) => inSlice(r.path));
    for (const prefix of PREFIXES) {
      const worker = routes.filter((r) => r.path.startsWith(`${prefix}/`)).map((r) => keyOf(r.method, r.path));
      const render = expected
        .filter((e) => e.path.startsWith(`${prefix}/`))
        .sort((a, b) => a.order - b.order)
        .map((e) => keyOf(e.method, e.path));
      expect(worker).toEqual(render);
    }
  });

  describe.each(expected.map((e) => [`${e.method} ${e.path}`, e]))('%s', (_label, e) => {
    const routes = listRoutes(buildMiniApp());
    const route = routes.find((r) => keyOf(r.method, r.path) === keyOf(e.method, e.path));

    it('exists', () => {
      expect(route).toBeDefined();
    });

    it('auth, minTier, admin, roles and the ordered guard list match', () => {
      expect(route.auth).toBe(e.auth);
      expect(route.minTier).toBe(e.minTier === undefined ? null : e.minTier);
      const guards = guardsOf(route);
      expect(guards).toEqual(e.guards || []);
      expect(guards.includes('requireAdmin')).toBe(!!e.admin);
      expect(guards.some((g) => g.startsWith('requireRole'))).toBe(!!(e.roles && e.roles.length));
    });

    it('has no untagged middleware (introspection is complete)', () => {
      expect(route.untagged).toBe(0);
    });

    it('authenticateToken runs before requirePlan', () => {
      const guards = guardsOf(route);
      if (guards.includes('requirePlan(1)') || guards.some((g) => g.startsWith('requirePlan'))) {
        const planAt = guards.findIndex((g) => g.startsWith('requirePlan'));
        expect(guards.indexOf('authenticateToken')).toBeGreaterThanOrEqual(0);
        expect(guards.indexOf('authenticateToken')).toBeLessThan(planAt);
      }
    });
  });

  it('the plan-gated set is exactly evidence/report (3) and the seven study-history endpoints (1)', () => {
    const gated = listRoutes(buildMiniApp())
      .filter((r) => inSlice(r.path) && r.minTier !== null)
      .map((r) => `${r.method} ${r.path} ${r.minTier}`)
      .sort();
    expect(gated).toEqual(
      [
        'GET /api/evidence/report 3',
        'GET /api/study-history/history 1',
        'GET /api/study-history/stats 1',
        'GET /api/study-history/weekly 1',
        'POST /api/study-history/srs/decks 1',
        'GET /api/study-history/srs/decks 1',
        'GET /api/study-history/srs/due 1',
        'POST /api/study-history/srs/review 1',
      ].sort()
    );
  });
});
