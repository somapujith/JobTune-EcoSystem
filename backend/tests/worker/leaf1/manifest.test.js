'use strict';

/**
 * Manifest parity for the leaf1 slice (ADR-001 6.3, checklist items 5 and 6).
 *
 * docs/migration/manifest.render.json is generated from the Express source and is the referee.
 * Here a mini-app mounts ONLY the leaf1 routers, at the prefixes the manifest (and, independently,
 * backend/src/app.js) records, and listRoutes(app) introspects the live Hono app. For every leaf1
 * endpoint in the manifest the Worker route must have the same auth / admin / minTier / guard
 * list, with no extra and no missing endpoints. The repo's own comparator
 * (scripts/migration/compare-manifests.js) is run as a second referee, and negative controls
 * prove that the comparison actually fails when a gate is dropped.
 */
const fs = require('fs');
const path = require('path');
const { createApp } = require('../../../src/worker/app');
const { mountRoutes, listRoutes, listMounts } = require('../../../src/worker/lib/routes');
const { compareManifests } = require('../../../scripts/migration/compare-manifests');
const { leaf1Mounts } = require('./helpers');

const REPO_ROOT = path.resolve(__dirname, '../../../..');
const manifest = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'docs/migration/manifest.render.json'), 'utf8'));
const EXPRESS_APP_SRC = fs.readFileSync(path.join(REPO_ROOT, 'backend/src/app.js'), 'utf8');

const ROUTE_NAMES = ['projects', 'guides', 'benchmarks', 'progress', 'recruiterVisibility', 'resumeConsistency'];
const ROUTE_FILES = ROUTE_NAMES.map((n) => `backend/src/routes/${n}.js`);

// Manifest keying (docs/migration/manifest.render.md): METHOD + lower-cased path, every :param -> ":"
const canon = (p) => p.toLowerCase().replace(/\/$/, '').replace(/:[A-Za-z0-9_]+(\{[^}]*\}|\([^)]*\))?/g, ':') || '/';
const key = (method, p) => `${method.toUpperCase()} ${canon(p)}`;

const manifestMounts = manifest.mounts
  .filter((m) => ROUTE_FILES.includes(m.routerFile))
  .sort((a, b) => a.order - b.order);
const manifestEndpoints = manifest.endpoints.filter((e) => ROUTE_FILES.includes(e.routerFile));

/** Build the mini-app: only leaf1 routers, prefixes taken from the manifest, in Express order. */
function buildMiniApp() {
  const app = createApp();
  for (const m of manifestMounts) {
    const name = path.basename(m.routerFile, '.js');
    mountRoutes(app, m.prefix, require(`../../../src/worker/routes/${name}`));
  }
  return app;
}

const guardsOf = (route) => route.middleware.filter((m) => ['auth', 'plan', 'admin'].includes(m.kind)).map((m) => m.name);

describe('leaf1 vs docs/migration/manifest.render.json', () => {
  const app = buildMiniApp();
  const prefixes = manifestMounts.map((m) => m.prefix);
  const workerRoutes = listRoutes(app).filter((r) => prefixes.some((p) => r.path === p || r.path.startsWith(p + '/')));
  const byKey = new Map(workerRoutes.map((r) => [key(r.method, r.path), r]));

  it('the manifest lists the expected leaf1 surface: 6 mounts, 10 endpoints', () => {
    expect(manifestMounts.map((m) => m.prefix)).toEqual([
      '/api/projects',
      '/api/guides',
      '/api/benchmarks',
      '/api/progress',
      '/api/recruiter-visibility',
      '/api/resume-consistency',
    ]);
    expect(manifestEndpoints).toHaveLength(10);
    expect(manifestEndpoints.map((e) => e.id).sort()).toEqual(
      [
        'GET /api/projects/ideas',
        'POST /api/guides/generate',
        'GET /api/guides/:id',
        'GET /api/benchmarks/run',
        'GET /api/progress',
        'GET /api/progress/:contextKey',
        'PUT /api/progress/:contextKey',
        'PATCH /api/progress/:contextKey',
        'POST /api/recruiter-visibility/analyze',
        'POST /api/resume-consistency/check',
      ].sort()
    );
  });

  it('prefixes match backend/src/app.js (independent read of the Express source), in the same relative order', () => {
    const fromSource = [];
    for (const name of ROUTE_NAMES) {
      const varName = new RegExp(`const (\\w+) = require\\('\\./routes/${name}'\\)`).exec(EXPRESS_APP_SRC);
      expect(varName).not.toBeNull();
      const use = new RegExp(`app\\.use\\('([^']+)',\\s*${varName[1]}\\)`).exec(EXPRESS_APP_SRC);
      expect(use).not.toBeNull();
      fromSource.push({ prefix: use[1], index: use.index });
    }
    expect(fromSource.sort((a, b) => a.index - b.index).map((x) => x.prefix)).toEqual(prefixes);
    // and the test helper's hard-coded mount table agrees with both
    expect(leaf1Mounts().map(([p]) => p)).toEqual(prefixes);
  });

  it('mounts exactly those prefixes (plus the health route createApp always has)', () => {
    expect(listMounts(app).map((m) => m.prefix)).toEqual(['/api', ...prefixes]);
  });

  it('exposes exactly the manifest endpoints: none missing, none extra', () => {
    expect([...byKey.keys()].sort()).toEqual(manifestEndpoints.map((e) => key(e.method, e.path)).sort());
    expect(workerRoutes).toHaveLength(10);
  });

  it.each(manifestEndpoints.map((e) => [e.id, e]))('%s: auth / admin / roles / minTier / guards match the manifest', (_id, e) => {
    const r = byKey.get(key(e.method, e.path));
    expect(r).toBeDefined();
    expect(r.method).toBe(e.method);
    expect(r.auth).toBe(e.auth);
    expect(r.minTier).toBe(e.minTier === undefined ? null : e.minTier);
    expect(r.middleware.some((m) => m.kind === 'admin')).toBe(!!e.admin);
    // no role guard exists in this slice; the manifest has none either
    expect(e.roles == null).toBe(true);
    expect(r.middleware.some((m) => m.kind === 'role')).toBe(false);
    // guards in effective order, canonical names
    expect(guardsOf(r)).toEqual(e.guards);
    // every middleware in the chain is tagged (nothing invisible to introspection)
    expect(r.untagged).toBe(0);
  });

  it('every leaf1 endpoint is authenticated (the public surface of the manifest is not in this slice)', () => {
    expect(workerRoutes.every((r) => r.auth === true)).toBe(true);
    expect(manifestEndpoints.every((e) => e.auth === true)).toBe(true);
  });

  it('tier profile: projects T1, recruiter-visibility T2, resume-consistency T2, all others ungated', () => {
    const tiers = Object.fromEntries(workerRoutes.map((r) => [`${r.method} ${r.path}`, r.minTier]));
    expect(tiers).toEqual({
      'GET /api/projects/ideas': 1,
      'POST /api/guides/generate': null,
      'GET /api/guides/:id': null,
      'GET /api/benchmarks/run': null,
      'GET /api/progress': null,
      'GET /api/progress/:contextKey': null,
      'PUT /api/progress/:contextKey': null,
      'PATCH /api/progress/:contextKey': null,
      'POST /api/recruiter-visibility/analyze': 2,
      'POST /api/resume-consistency/check': 2,
    });
  });

  describe('scripts/migration/compare-manifests.js as a second referee', () => {
    const candidate = () => ({
      schema: { version: manifest.schema.version },
      endpoints: workerRoutes.map((r) => ({
        method: r.method,
        path: r.path,
        auth: r.auth,
        admin: r.middleware.some((m) => m.kind === 'admin'),
        roles: null,
        minTier: r.minTier,
        guards: guardsOf(r),
      })),
    });
    const compare = (cand) => compareManifests(manifest, cand, { onlyPrefixes: prefixes });

    it('reference vs Worker candidate: zero findings, exit 0', () => {
      const result = compare(candidate());
      expect(result.findings.filter((f) => f.severity !== 'INFO')).toEqual([]);
      expect(result.exitCode).toBe(0);
      expect(result.summary).toMatchObject({ reference: 10, candidate: 10, compared: 10 });
    });

    it('negative control: dropping requirePlan from resume-consistency is CRITICAL (exit 2)', () => {
      const cand = candidate();
      const e = cand.endpoints.find((x) => x.path === '/api/resume-consistency/check');
      e.minTier = null;
      e.guards = ['authenticateToken'];
      const result = compare(cand);
      expect(result.exitCode).toBe(2);
    });

    it('negative control: lowering recruiter-visibility from tier 2 to tier 1 is CRITICAL', () => {
      const cand = candidate();
      cand.endpoints.find((x) => x.path === '/api/recruiter-visibility/analyze').minTier = 1;
      expect(compare(cand).exitCode).toBe(2);
    });

    it('negative control: dropping the admin guard from benchmarks is CRITICAL', () => {
      const cand = candidate();
      const e = cand.endpoints.find((x) => x.path === '/api/benchmarks/run');
      e.admin = false;
      e.guards = ['authenticateToken'];
      expect(compare(cand).exitCode).toBe(2);
    });

    it('negative control: dropping authentication from a progress endpoint is CRITICAL', () => {
      const cand = candidate();
      cand.endpoints.find((x) => x.method === 'PUT' && x.path === '/api/progress/:contextKey').auth = false;
      expect(compare(cand).exitCode).toBe(2);
    });

    it('negative control: a missing endpoint is an ERROR (exit 1)', () => {
      const cand = candidate();
      cand.endpoints = cand.endpoints.filter((x) => x.path !== '/api/projects/ideas');
      expect(compare(cand).exitCode).toBe(1);
    });
  });
});
