'use strict';

/**
 * Route registration + introspection (lib/routes.js). This is the contract a later
 * Worker-side manifest extractor relies on: listRoutes(app) -> [{method, path,
 * middleware, auth, minTier}].
 */
const { createApp } = require('../../src/worker/app');
const { createRouter, mountRoutes, listMounts, listRoutes, patternToRegExp } = require('../../src/worker/lib/routes');
const { authenticateToken } = require('../../src/worker/middleware/auth');
const { requirePlan } = require('../../src/worker/middleware/requirePlan');
const { tagMiddleware, getMiddlewareMeta } = require('../../src/worker/lib/tag');
const { makeEnv, makeCtx, createFakeDb } = require('./helpers/harness');

const find = (routes, method, path) => routes.find((r) => r.method === method && r.path === path);
const names = (route) => route.middleware.map((m) => m.name);

describe('tagMiddleware', () => {
  it('sets a stable name and readable metadata', () => {
    const fn = tagMiddleware(async () => {}, 'thing', { kind: 'custom', x: 1 });
    expect(fn.name).toBe('thing');
    expect(getMiddlewareMeta(fn)).toEqual({ name: 'thing', kind: 'custom', x: 1 });
    expect(Object.isFrozen(getMiddlewareMeta(fn))).toBe(true);
  });
  it('validates its arguments and returns null meta for untagged functions', () => {
    expect(() => tagMiddleware('nope', 'x')).toThrow(TypeError);
    expect(() => tagMiddleware(() => {}, '')).toThrow(TypeError);
    expect(getMiddlewareMeta(() => {})).toBeNull();
  });
});

describe('mountRoutes', () => {
  it('validates prefix and module', () => {
    const app = createApp();
    const r = createRouter();
    expect(() => mountRoutes(app, 'api/x', r)).toThrow(TypeError);
    expect(() => mountRoutes(app, '/api/x/', r)).toThrow(TypeError);
    expect(() => mountRoutes(app, '/api/x', {})).toThrow(TypeError);
    expect(() => mountRoutes(app, '/', r)).not.toThrow();
  });

  it('records mounts in order', () => {
    const app = createApp();
    mountRoutes(app, '/api/a', createRouter());
    mountRoutes(app, '/api/b', createRouter());
    expect(listMounts(app).map((m) => m.prefix)).toEqual(['/api', '/api/a', '/api/b']); // /api = health from createApp
  });
});

describe('patternToRegExp', () => {
  it.each([
    ['/api/*', '/api', true],
    ['/api/*', '/api/x/y', true],
    ['/api/*', '/apix', false],
    ['*', '/anything', true],
    ['/api/jobs/:id', '/api/jobs/sample', true],
    ['/api/jobs/:id', '/api/jobs', false],
    ['/api/jobs/:id', '/api/jobs/a/b', false],
    ['/api/a.b', '/api/aXb', false],
  ])('%s vs %s -> %s', (pattern, path, expected) => {
    expect(patternToRegExp(pattern).test(path)).toBe(expected);
  });
});

describe('listRoutes', () => {
  function build() {
    const app = createApp({ dbFactory: () => createFakeDb() });

    const subs = createRouter();
    subs.get('/plans', (c) => c.json([])); // public
    subs.post('/create-order', authenticateToken, (c) => c.json({}));

    const admin = createRouter();
    admin.use('*', authenticateToken, tagMiddleware(async (c, next) => next(), 'requireAdmin', { kind: 'admin' }));
    admin.get('/stats', (c) => c.json({}));
    admin.get('/users/:id', (c) => c.json({}));

    const gated = createRouter();
    gated.get('/free', authenticateToken, requirePlan(1), (c) => c.json({}));
    gated.get('/pro/:slug', authenticateToken, requirePlan(2), (c) => c.json({}));
    gated.post('/hero', authenticateToken, requirePlan(2), requirePlan(3), (c) => c.json({}));
    gated.get('/untagged', async (c, next) => next(), authenticateToken, function namedHandler(c) { return c.json({}); });

    mountRoutes(app, '/api/subscriptions', subs);
    mountRoutes(app, '/api/admin', admin);
    mountRoutes(app, '/api/gated', gated);
    return listRoutes(app);
  }

  let routes;
  beforeAll(() => { routes = build(); });

  it('lists mounted endpoints with their full paths and methods', () => {
    const summary = routes.map((r) => `${r.method} ${r.path}`).sort();
    expect(summary).toEqual(
      [
        'GET /api/health',
        'GET /api/subscriptions/plans',
        'POST /api/subscriptions/create-order',
        'GET /api/admin/stats',
        'GET /api/admin/users/:id',
        'GET /api/gated/free',
        'GET /api/gated/pro/:slug',
        'POST /api/gated/hero',
        'GET /api/gated/untagged',
      ].sort()
    );
  });

  it('reports auth and minTier for route-level middleware', () => {
    expect(find(routes, 'GET', '/api/subscriptions/plans')).toMatchObject({ auth: false, minTier: null });
    expect(find(routes, 'POST', '/api/subscriptions/create-order')).toMatchObject({ auth: true, minTier: null });
    expect(find(routes, 'GET', '/api/gated/free')).toMatchObject({ auth: true, minTier: 1 });
    expect(find(routes, 'GET', '/api/gated/pro/:slug')).toMatchObject({ auth: true, minTier: 2 });
  });

  it('takes the highest minTier when several requirePlan guards stack', () => {
    expect(find(routes, 'POST', '/api/gated/hero').minTier).toBe(3);
  });

  it('applies file-level router.use guards (admin.js pattern) to every route in the router', () => {
    for (const path of ['/api/admin/stats', '/api/admin/users/:id']) {
      const r = find(routes, 'GET', path);
      expect(r.auth).toBe(true);
      expect(names(r)).toEqual(expect.arrayContaining(['authenticateToken', 'requireAdmin']));
      expect(r.middleware.find((m) => m.name === 'requireAdmin').kind).toBe('admin');
    }
    // but not to routes in other routers
    expect(find(routes, 'GET', '/api/subscriptions/plans').auth).toBe(false);
  });

  it('includes global middleware in execution order, before route-level ones', () => {
    const r = find(routes, 'GET', '/api/gated/free');
    expect(names(r)).toEqual([
      'securityHeaders', 'configMiddleware', 'cors', 'dbMiddleware', 'servicesMiddleware', 'bodyParser',
      'auditLogger(API_REQUEST)', 'apiRateLimit', 'authenticateToken', 'requirePlan(1)',
    ]);
  });

  it('applies /api/* middleware (audit, rate limit) only under /api', () => {
    const health = find(routes, 'GET', '/api/health');
    expect(health.auth).toBe(false);
    expect(names(health)).toEqual(expect.arrayContaining(['auditLogger(API_REQUEST)', 'apiRateLimit']));
  });

  it('flags untagged middleware and names terminal handlers', () => {
    const r = find(routes, 'GET', '/api/gated/untagged');
    expect(r.untagged).toBe(1);
    expect(r.handler).toBe('namedHandler');
    expect(r.middleware.some((m) => m.kind === 'untagged')).toBe(true);
    // every endpoint except the deliberately untagged one has zero untagged middleware
    expect(routes.filter((x) => x.untagged > 0).map((x) => x.path)).toEqual(['/api/gated/untagged']);
  });

  it('does not depend on the app having served requests being absent: works on a fresh app only', async () => {
    // documented restriction: listRoutes reads app.routes, valid before the router freezes
    const app = createApp({ dbFactory: () => createFakeDb() });
    const before = listRoutes(app);
    await app.request('/api/health', {}, makeEnv(), makeCtx());
    expect(listRoutes(app)).toEqual(before); // app.routes itself is unchanged by requests
  });
});
