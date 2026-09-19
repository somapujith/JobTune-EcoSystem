'use strict';

/**
 * MANDATORY manifest comparison for routes/practice.js (ADR-001 6.3, checklist items 5 and 6).
 *
 * Loads docs/migration/manifest.render.json (generated from the Express source), builds a mini app that
 * mounts ONLY the practice router at the same prefix as backend/src/app.js (`/api/practice`), introspects
 * it with listRoutes(app), and asserts for EVERY manifest endpoint that method, path, auth, minTier,
 * guard order, admin/role flags and registration order match. Extras on the Worker side also fail.
 * Negative controls at the bottom prove the referee really fails when a guard is dropped, lowered,
 * reordered or added.
 */
const fs = require('fs');
const path = require('path');
const { createRouter } = require('../../../src/worker/lib/routes');
const { authenticateToken } = require('../../../src/worker/middleware/auth');
const { requirePlan } = require('../../../src/worker/middleware/requirePlan');
const practiceRouter = require('../../../src/worker/routes/practice');
const { PREFIX, manifest, expected, key, introspect, guardNames, diffAgainstManifest } = require('./helpers/manifestDiff');

const APP_JS = path.resolve(__dirname, '../../../src/app.js');

describe('routes/practice.js vs docs/migration/manifest.render.json', () => {
  const actual = introspect(practiceRouter);

  it('the manifest describes the endpoints this slice owns (guards against an empty or stale comparison)', () => {
    expect(expected).toHaveLength(10);
    // the manifest mount for this router is the one app.js registers
    expect(new Set(expected.map((e) => e.mountPrefix))).toEqual(new Set([PREFIX]));
    expect(new Set(expected.map((e) => e.routerFile))).toEqual(new Set(['backend/src/routes/practice.js']));
    expect(manifest.mounts.filter((m) => m.prefix === PREFIX)).toHaveLength(1);
    expect(fs.readFileSync(APP_JS, 'utf8')).toMatch(/app\.use\('\/api\/practice', practiceRoutes\);/);
  });

  it('THE REFEREE: zero differences against the manifest (endpoints, auth, minTier, guards, order)', () => {
    expect(diffAgainstManifest(actual, expected)).toEqual([]);
  });

  it('exposes exactly the same set of endpoints: none missing, none extra', () => {
    const exp = expected.map((e) => key(e.method, e.path)).sort();
    const act = actual.map((r) => key(r.method, r.path)).sort();
    expect(act).toEqual(exp);
    expect(new Set(act).size).toBe(act.length); // no duplicate registration
  });

  it('registers the endpoints in the same order as Express (static-vs-param order is behaviour)', () => {
    const expOrder = [...expected].sort((a, b) => a.order - b.order).map((e) => key(e.method, e.path));
    const actOrder = actual.map((r) => key(r.method, r.path));
    expect(actOrder).toEqual(expOrder);
    // and that is the literal source order of the checklist in the manifest: 10 distinct, consecutive orders
    const orders = [...expected].map((e) => e.order).sort((a, b) => a - b);
    expect(orders.every((o, i) => i === 0 || o === orders[i - 1] + 1)).toBe(true);
  });

  it('every middleware in every practice chain is tagged (nothing invisible to the introspection)', () => {
    expect(actual.map((r) => `${r.method} ${r.path} untagged=${r.untagged}`)).toEqual(
      actual.map((r) => `${r.method} ${r.path} untagged=0`)
    );
  });

  describe.each(expected.map((e) => [e.id, e]))('%s', (_id, exp) => {
    const act = () => actual.find((r) => key(r.method, r.path) === key(exp.method, exp.path));

    it('exists on the Worker with the same method', () => {
      expect(act()).toBeDefined();
      expect(act().method).toBe(exp.method);
    });

    it('auth matches (authenticateToken present iff Express had it)', () => {
      expect(act().auth).toBe(exp.auth);
      expect(exp.auth).toBe(true);
    });

    it('minTier matches exactly (same n, neither dropped, lowered nor raised)', () => {
      expect(act().minTier).toBe(exp.minTier);
      expect(exp.minTier).toBe(1);
    });

    it('guard chain matches in order: authenticateToken then requirePlan(n)', () => {
      expect(guardNames(act())).toEqual(exp.guards);
      expect(exp.guards).toEqual(['authenticateToken', 'requirePlan(1)']);
    });

    it('has no admin/role guard on either side', () => {
      expect(exp.admin).toBe(false);
      expect(exp.roles).toBeNull();
      const kinds = act().middleware.map((m) => m.kind);
      expect(kinds).not.toContain('admin');
      expect(kinds).not.toContain('role');
    });

    it('exactly one authenticateToken and one requirePlan per route, auth before plan', () => {
      const names = act().middleware.map((m) => m.name);
      expect(names.filter((n) => n === 'authenticateToken')).toHaveLength(1);
      expect(names.filter((n) => n.startsWith('requirePlan('))).toHaveLength(1);
      expect(names.indexOf('authenticateToken')).toBeLessThan(names.indexOf('requirePlan(1)'));
    });
  });

  it('total gated endpoints and tier split equal the manifest', () => {
    const tiers = (list) => list.reduce((acc, e) => ({ ...acc, [e.minTier]: (acc[e.minTier] || 0) + 1 }), {});
    expect(tiers(actual)).toEqual(tiers(expected));
    expect(actual.filter((r) => r.auth)).toHaveLength(expected.filter((e) => e.auth).length);
  });
});

describe('negative controls: the referee fails when the Worker router drifts from the manifest', () => {
  const h = (c) => c.json({});
  const ROUTES = expected.map((e) => ({ method: e.method.toLowerCase(), route: e.path.slice(PREFIX.length) }));

  /** Rebuild the practice router shape by hand, then let `mutate` alter one route's guards. */
  function build(mutate) {
    const router = createRouter();
    ROUTES.forEach(({ method, route }, i) => {
      let mws = [authenticateToken, requirePlan(1)];
      const out = mutate ? mutate(i, mws, { method, route }) : mws;
      router[method](route, ...(out || mws), h);
    });
    return introspect(router);
  }

  it('sanity: an untouched rebuild has zero differences', () => {
    expect(diffAgainstManifest(build(), expected)).toEqual([]);
  });

  it('detects a dropped authenticateToken', () => {
    const d = diffAgainstManifest(build((i, mws) => (i === 3 ? [requirePlan(1)] : mws)), expected);
    expect(d.some((x) => x.startsWith('AUTH POST /api/practice/problems/:id/submit'))).toBe(true);
  });

  it('detects a dropped requirePlan', () => {
    const d = diffAgainstManifest(build((i, mws) => (i === 8 ? [authenticateToken] : mws)), expected);
    expect(d.some((x) => x.startsWith('MINTIER GET /api/practice/stats'))).toBe(true);
  });

  it('detects a raised tier (requirePlan(2) where Express had 1)', () => {
    const d = diffAgainstManifest(build((i, mws) => (i === 0 ? [authenticateToken, requirePlan(2)] : mws)), expected);
    expect(d).toContain('MINTIER GET /api/practice/problems: worker=2 manifest=1');
  });

  it('detects plan-before-auth ordering', () => {
    const d = diffAgainstManifest(build((i, mws) => (i === 2 ? [requirePlan(1), authenticateToken] : mws)), expected);
    expect(d.some((x) => x.startsWith('GUARDS POST /api/practice/problems/:id/run'))).toBe(true);
  });

  it('detects a missing and an extra endpoint', () => {
    const router = createRouter();
    router.get('/problems', authenticateToken, requirePlan(1), h);
    router.get('/surprise', h);
    const d = diffAgainstManifest(introspect(router), expected);
    expect(d.some((x) => x.startsWith('MISSING POST /api/practice/problems/:id/bookmark'))).toBe(true);
    expect(d).toContain('EXTRA GET /api/practice/surprise');
  });

  it('detects reordered registration', () => {
    const rev = [...ROUTES].reverse();
    const router = createRouter();
    rev.forEach(({ method, route }) => router[method](route, authenticateToken, requirePlan(1), h));
    expect(diffAgainstManifest(introspect(router), expected)).toContain('ORDER differs from Express registration order');
  });
});
