'use strict';

/**
 * Manifest referee for the mid1 slice (ADR-001 section 6.3, T4.1).
 *
 * docs/migration/manifest.render.json is generated from the Express source (working tree). Here we build a
 * mini-app that mounts ONLY this slice's routers with the same prefixes and in the same relative order as
 * backend/src/app.js, read the live Hono route table with listRoutes(app), and require that for every
 * endpoint under this slice's prefixes:
 *   - the same set of METHOD + path exists (no missing, no extra),
 *   - auth, minTier, admin, roles and the ordered guard list are identical,
 *   - every middleware is tagged (untagged === 0),
 *   - registration order within each prefix is identical.
 * Also checks that routes/mounts/mid1.js mounts the same thing.
 */
const fs = require('fs');
const path = require('path');
const { createApp } = require('../../../src/worker/app');
const { mountRoutes, listRoutes, listMounts } = require('../../../src/worker/lib/routes');
const { MOUNTS, PREFIXES } = require('./helpers');

const MANIFEST_PATH = path.resolve(__dirname, '../../../../docs/migration/manifest.render.json');
const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));

const inSlice = (p) => PREFIXES.some((prefix) => p === prefix || p.startsWith(prefix + '/'));
/** Comparator keying from manifest.render.md: METHOD + lower-cased path, trailing slash stripped, every :param -> ":" */
const canon = (p) => p.replace(/\/+$/, '').toLowerCase().replace(/:[A-Za-z0-9_]+(\{[^}]*\}|\([^)]*\))?/g, ':') || '/';
const keyOf = (method, p) => `${method.toUpperCase()} ${canon(p)}`;

function workerGuards(route) {
  return route.middleware
    .filter((m) => ['auth', 'plan', 'admin', 'role'].includes(m.kind))
    .map((m) => {
      if (m.kind === 'auth') return 'authenticateToken';
      if (m.kind === 'plan') return `requirePlan(${m.minTier})`;
      if (m.kind === 'admin') return 'requireAdmin';
      return `requireRole(${(m.roles || []).map((r) => `'${r}'`).join(', ')})`;
    });
}

function buildMiniApp() {
  const app = createApp();
  for (const [prefix, router] of MOUNTS) mountRoutes(app, prefix, router);
  return app;
}

const expectedEndpoints = manifest.endpoints.filter((e) => inSlice(e.path));

describe('mid1 routes vs docs/migration/manifest.render.json', () => {
  const app = buildMiniApp();
  const worker = listRoutes(app).filter((r) => inSlice(r.path));
  const workerByKey = new Map(worker.map((r) => [keyOf(r.method, r.path), r]));

  it('the manifest lists 17 endpoints for this slice (5 files) and the port implements exactly those', () => {
    expect(expectedEndpoints).toHaveLength(17);
    expect([...workerByKey.keys()].sort()).toEqual(expectedEndpoints.map((e) => keyOf(e.method, e.path)).sort());
    expect(worker).toHaveLength(17);
  });

  it('per-file endpoint counts match the manifest mount table', () => {
    const counts = {};
    for (const m of manifest.mounts.filter((x) => inSlice(x.prefix))) counts[m.prefix] = (counts[m.prefix] || 0) + m.endpoints;
    expect(counts).toEqual({
      '/api/learning': 3,
      '/api/interview': 3,
      '/api/resume-chat': 2,
      '/api/career': 5,
      '/api/job-prep': 4,
    });
    for (const prefix of PREFIXES) {
      expect(worker.filter((r) => r.path.startsWith(prefix + '/')).length).toBe(counts[prefix]);
    }
  });

  it.each(expectedEndpoints.map((e) => [e.id, e]))('%s: auth / minTier / admin / roles / guards match the manifest', (_id, e) => {
    const r = workerByKey.get(keyOf(e.method, e.path));
    expect(r).toBeDefined();
    expect(r.auth).toBe(e.auth);
    expect(r.minTier).toBe(e.minTier === undefined ? null : e.minTier);
    expect(r.middleware.some((m) => m.kind === 'admin')).toBe(Boolean(e.admin));
    expect(r.middleware.some((m) => m.kind === 'role') ? 'has-role' : null).toBe(e.roles ? 'has-role' : null);
    expect(workerGuards(r)).toEqual(e.guards || []);
    expect(r.untagged).toBe(0);
  });

  it('mount prefixes are in the same relative order as app.js (manifest mountOrder)', () => {
    const manifestOrder = manifest.mounts.filter((m) => inSlice(m.prefix)).sort((a, b) => a.order - b.order).map((m) => m.prefix);
    expect(manifestOrder).toEqual(PREFIXES);
    expect(listMounts(app).map((m) => m.prefix).filter((p) => PREFIXES.includes(p))).toEqual(PREFIXES);
  });

  it('registration order inside each router matches the Express order (manifest "order")', () => {
    const workerOrder = listRoutes(buildMiniApp())
      .filter((r) => inSlice(r.path))
      .map((r) => keyOf(r.method, r.path));
    const expectedOrder = [...expectedEndpoints].sort((a, b) => a.order - b.order).map((e) => keyOf(e.method, e.path));
    expect(workerOrder).toEqual(expectedOrder);
  });

  it('the two working-tree discovery routes are recorded in the manifest and ported: authenticateToken only', () => {
    for (const method of ['POST', 'GET']) {
      const e = manifest.endpoints.find((x) => x.method === method && x.path === '/api/career/discovery');
      expect(e).toMatchObject({ auth: true, minTier: null, guards: ['authenticateToken'], admin: false, roles: null });
      const r = workerByKey.get(keyOf(method, '/api/career/discovery'));
      expect(r).toMatchObject({ auth: true, minTier: null });
      expect(workerGuards(r)).toEqual(['authenticateToken']);
    }
  });

  it('the public surface of the slice is exactly GET /api/learning/resources', () => {
    const publicKeys = worker.filter((r) => !r.auth).map((r) => keyOf(r.method, r.path));
    expect(publicKeys).toEqual(['GET /api/learning/resources']);
    expect(expectedEndpoints.filter((e) => !e.auth).map((e) => keyOf(e.method, e.path))).toEqual(publicKeys);
  });

  it('GET /api/interview/history and POST /api/interview/:id/respond do not shadow each other or /start', () => {
    const interview = worker.filter((r) => r.path.startsWith('/api/interview/')).map((r) => `${r.method} ${r.path}`);
    expect(interview).toEqual(['POST /api/interview/start', 'POST /api/interview/:id/respond', 'GET /api/interview/history']);
  });

  it('routes/mounts/mid1.js mounts the same routers in the same order', () => {
    // required lazily: it is written last and only requires finished route files
    const { mount } = require('../../../src/worker/routes/mounts/mid1');
    const viaMountFile = createApp();
    mount(viaMountFile);
    expect(listMounts(viaMountFile).map((m) => m.prefix).filter((p) => p !== '/api')).toEqual(PREFIXES);
    const a = listRoutes(viaMountFile).filter((r) => inSlice(r.path));
    const b = listRoutes(buildMiniApp()).filter((r) => inSlice(r.path));
    expect(a.map((r) => [r.method, r.path, r.auth, r.minTier])).toEqual(b.map((r) => [r.method, r.path, r.auth, r.minTier]));
  });
});
