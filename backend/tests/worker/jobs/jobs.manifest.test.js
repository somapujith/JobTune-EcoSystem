'use strict';

/**
 * MANIFEST PARITY for the /api/jobs group (ADR-001 6.3, checklist items 5 and 6; BRIEF rule 5: "manifest is the referee").
 *
 * The Worker app is built with createApp(), the jobs routers are mounted (both by the shared helper AND by the
 * shipped routes/mounts/jobs.js), and listRoutes(app) introspection is compared with
 * docs/migration/manifest.render.json (generated from the Express source): every endpoint, its authenticateToken
 * coverage and its requirePlan minimum tier. The official comparator (scripts/migration/compare-manifests.js)
 * is run on the same data and must report zero findings.
 */
const path = require('path');
const { createApp } = require('../../../src/worker/app');
const { listRoutes, listMounts } = require('../../../src/worker/lib/routes');
const { compareManifests, canonicalizePath } = require('../../../scripts/migration/compare-manifests');
const { mountJobsRoutes, JOBS_MOUNTS } = require('./jobsHarness');
const { mount: shippedMount } = require('../../../src/worker/routes/mounts/jobs');

const manifest = require(path.resolve(__dirname, '../../../../docs/migration/manifest.render.json'));

const PREFIX = '/api/jobs';
const inGroup = (p) => p === PREFIX || p.startsWith(`${PREFIX}/`);
const refEndpoints = manifest.endpoints.filter((e) => inGroup(e.path));

const BUILDERS = {
  'helper mounting (jobsHarness.mountJobsRoutes)': (app) => mountJobsRoutes(app),
  'shipped mount file (routes/mounts/jobs.js)': (app) => shippedMount(app),
};

/** Worker introspection -> manifest-schema endpoint (the same shape generate-worker-manifest.js emits). */
function toManifestEndpoint(r) {
  const plans = r.middleware.filter((m) => m.kind === 'plan');
  return {
    method: r.method,
    path: r.path,
    auth: r.auth,
    admin: r.middleware.some((m) => m.kind === 'admin'),
    roles: null,
    minTier: r.minTier,
    guards: [
      ...(r.auth ? ['authenticateToken'] : []),
      ...plans.map((m) => `requirePlan(${m.minTier})`),
    ],
  };
}

describe('reference sanity (the Express manifest itself)', () => {
  it('lists exactly the nine /api/jobs endpoints this slice ports', () => {
    expect(refEndpoints.map((e) => e.id)).toEqual([
      'GET /api/jobs',
      'POST /api/jobs',
      'PATCH /api/jobs/:id',
      'DELETE /api/jobs/:id',
      'POST /api/jobs/analyze-description',
      'POST /api/jobs/generate-cover-letter',
      'GET /api/jobs/discover',
      'POST /api/jobs/fit',
      'POST /api/jobs/achievement-enhancer/enhance',
    ]);
  });

  it('records the Express mount order for the group: 14, 17, 18, 23, 24 (/api/jobs) then 29 (/api/jobs/achievement-enhancer)', () => {
    const mounts = manifest.mounts.filter((m) => inGroup(m.prefix));
    expect(mounts.map((m) => [m.order, m.prefix, path.basename(m.routerFile, '.js')])).toEqual([
      [14, '/api/jobs', 'jobTracker'],
      [17, '/api/jobs', 'jobAnalyzer'],
      [18, '/api/jobs', 'coverLetter'],
      [23, '/api/jobs', 'jobDiscovery'],
      [24, '/api/jobs', 'jobFit'],
      [29, '/api/jobs/achievement-enhancer', 'achievementEnhancer'],
    ]);
  });

  it('the manifest confirms the auth/tier facts the Worker must reproduce', () => {
    const by = Object.fromEntries(refEndpoints.map((e) => [e.id, [e.auth, e.minTier]]));
    expect(by).toEqual({
      'GET /api/jobs': [true, null],
      'POST /api/jobs': [true, 3],
      'PATCH /api/jobs/:id': [true, null],
      'DELETE /api/jobs/:id': [true, null],
      'POST /api/jobs/analyze-description': [true, 3],
      'POST /api/jobs/generate-cover-letter': [true, 2],
      'GET /api/jobs/discover': [true, 2],
      'POST /api/jobs/fit': [true, 3],
      'POST /api/jobs/achievement-enhancer/enhance': [true, 2],
    });
    expect(refEndpoints.every((e) => e.admin === false && e.roles === null)).toBe(true);
  });
});

describe.each(Object.entries(BUILDERS))('Worker app via %s', (_label, build) => {
  let app;
  let routes;
  beforeEach(() => {
    app = createApp();
    build(app);
    routes = listRoutes(app).filter((r) => inGroup(r.path));
  });

  it('exposes exactly the manifest endpoints: no missing endpoint, no extra endpoint', () => {
    const key = (e) => `${e.method} ${canonicalizePath(e.path)}`;
    expect(routes.map(key).sort()).toEqual(refEndpoints.map(key).sort());
  });

  it('registers them in the Express order (tracker, analyzer, cover letter, discovery, fit, achievement-enhancer)', () => {
    expect(routes.map((r) => `${r.method} ${r.path}`)).toEqual(refEndpoints.map((e) => `${e.method} ${e.path}`));
  });

  it.each(refEndpoints.map((e) => [e.id, e]))('%s: auth and minTier match the manifest, no untagged middleware', (_id, ref) => {
    const w = routes.find((r) => r.method === ref.method && canonicalizePath(r.path) === canonicalizePath(ref.path));
    expect(w).toBeDefined();
    expect(w.auth).toBe(ref.auth);
    expect(w.minTier).toBe(ref.minTier === undefined ? null : ref.minTier);
    expect(w.untagged).toBe(0);
    // authenticateToken must run BEFORE requirePlan (the plan gate needs c.get('user'))
    const kinds = w.middleware.map((m) => m.kind).filter((k) => k === 'auth' || k === 'plan');
    expect(kinds).toEqual(ref.minTier ? ['auth', 'plan'] : ['auth']);
  });

  it('every endpoint in the group is authenticated; the plan-gated ones are exactly the 6 the manifest gates', () => {
    expect(routes.every((r) => r.auth)).toBe(true);
    expect(routes.filter((r) => r.minTier !== null).map((r) => `${r.method} ${r.path} ${r.minTier}`)).toEqual([
      'POST /api/jobs 3',
      'POST /api/jobs/analyze-description 3',
      'POST /api/jobs/generate-cover-letter 2',
      'GET /api/jobs/discover 2',
      'POST /api/jobs/fit 3',
      'POST /api/jobs/achievement-enhancer/enhance 2',
    ]);
  });

  it('PATCH and DELETE /api/jobs/:id carry NO plan gate (as on Express) but do carry authenticateToken', () => {
    for (const method of ['PATCH', 'DELETE']) {
      const w = routes.find((r) => r.method === method && r.path === '/api/jobs/:id');
      expect(w.auth).toBe(true);
      expect(w.minTier).toBeNull();
    }
  });

  it('the official comparator (compare-manifests.js) reports zero findings for the group', () => {
    const candidate = { schema: manifest.schema, endpoints: routes.map(toManifestEndpoint) };
    const result = compareManifests(manifest, candidate, { onlyPrefixes: [PREFIX] });
    expect(result.findings).toEqual([]);
    expect(result.exitCode).toBe(0);
    expect(result.summary.compared).toBe(9);
  });

  it('the comparator would catch a dropped gate (sanity check that the referee is not vacuous)', () => {
    const endpoints = routes.map(toManifestEndpoint).map((e) =>
      e.path === '/api/jobs/fit' ? { ...e, minTier: 2, guards: ['authenticateToken', 'requirePlan(2)'] } : e
    );
    const result = compareManifests(manifest, { schema: manifest.schema, endpoints }, { onlyPrefixes: [PREFIX] });
    expect(result.exitCode).toBe(2);
    expect(result.findings.map((f) => f.code)).toContain('MINTIER_LOWERED');
  });
});

describe('mount order', () => {
  it('the shipped mount file mounts the six routers in the app.js order, and only those', () => {
    const app = createApp();
    shippedMount(app);
    // createApp itself mounts /api (health); only the jobs mounts are of interest here
    const prefixes = listMounts(app).map((m) => m.prefix).filter(inGroup);
    expect(prefixes).toEqual(JOBS_MOUNTS.map(([prefix]) => prefix));
    expect(listMounts(app).map((m) => m.prefix).filter((p) => p !== '/api')).toEqual([
      '/api/jobs', '/api/jobs', '/api/jobs', '/api/jobs', '/api/jobs', '/api/jobs/achievement-enhancer',
    ]);
  });

  it('helper mounting and shipped mounting produce identical route tables', () => {
    const a = createApp();
    mountJobsRoutes(a);
    const b = createApp();
    shippedMount(b);
    const shape = (app) => listRoutes(app).map((r) => ({ method: r.method, path: r.path, handler: r.handler, middleware: r.middleware.map((m) => m.name) }));
    expect(shape(b)).toEqual(shape(a));
  });

  it('mounted relative to the manifest: the order of the six mounts equals the ascending manifest mountOrder', () => {
    const orders = JOBS_MOUNTS.map(([prefix, name]) => {
      const m = manifest.mounts.find((x) => x.prefix === prefix && path.basename(x.routerFile, '.js') === name);
      expect(m).toBeDefined();
      return m.order;
    });
    expect(orders).toEqual([...orders].sort((x, y) => x - y));
    expect(orders).toEqual([14, 17, 18, 23, 24, 29]);
  });
});
