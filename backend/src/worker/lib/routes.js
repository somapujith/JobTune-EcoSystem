'use strict';

/**
 * Route registration + introspection.   (T1.3; enables ADR-001 sections 6.3 / 7 T4.1)
 *
 * Route modules are Hono routers created with createRouter() and mounted with
 * mountRoutes(app, prefix, router), the Worker equivalent of
 * `app.use('/api/x', router)`. Always mount through mountRoutes (never app.route
 * directly) so mounts stay enumerable.
 *
 * INTROSPECTION (how a Worker-side manifest extractor works)
 *   listRoutes(app) reads the public `app.routes` array of the live Hono app:
 *   [{ method, path, handler }] in registration order, with mounted routers already
 *   flattened to full paths. Every middleware under src/worker/ is tagged with
 *   tagMiddleware() (lib/tag.js). For every terminal endpoint (a non-ALL route entry;
 *   the LAST handler registered for that method+path) it returns:
 *     { method, path,
 *       handler:    name of the terminal handler function,
 *       middleware: [{ name, kind, minTier?, ... }]   in execution order: `use()`
 *                   entries registered earlier whose path pattern matches, then the
 *                   route-level handlers before the terminal one,
 *       auth:       true when any middleware has kind 'auth',
 *       minTier:    highest minTier among kind 'plan' middleware, or null }
 *   Untagged middleware appear with { name: fn.name || '<anonymous>', kind: 'untagged' };
 *   a non-empty `untagged` count on a route is a review flag.
 *
 * RULES that make this exact:
 *   - use router.use('*', mw) for file-level guards (the Express router.use(mw))
 *   - never use .all() for terminal handlers (an ALL entry is treated as middleware)
 *   - a `use` registered AFTER a route does not guard it (matches Hono's execution)
 *   - call listRoutes on a freshly built app (createApp()), not one that has served
 *     requests: Hono freezes its router after the first match
 */
const { Hono } = require('hono');
const { getMiddlewareMeta } = require('./tag');

const mounts = new WeakMap();

function createRouter() {
  return new Hono({ strict: false });
}

/**
 * @param {Hono} app
 * @param {string} prefix  e.g. '/api/subscriptions' (leading slash, no trailing slash)
 * @param {Hono} routesModule a router from createRouter()
 */
function mountRoutes(app, prefix, routesModule) {
  if (typeof prefix !== 'string' || !prefix.startsWith('/') || (prefix.length > 1 && prefix.endsWith('/'))) {
    throw new TypeError(`mountRoutes: prefix must start with "/" and have no trailing "/": ${String(prefix)}`);
  }
  if (!routesModule || typeof routesModule.fetch !== 'function' || !Array.isArray(routesModule.routes)) {
    throw new TypeError('mountRoutes: routesModule must be a Hono router (createRouter())');
  }
  app.route(prefix, routesModule);
  const list = mounts.get(app) || [];
  list.push({ prefix, routes: routesModule.routes.length });
  mounts.set(app, list);
  return app;
}

/** Mount points registered via mountRoutes, in order. */
function listMounts(app) {
  return [...(mounts.get(app) || [])];
}

/** Convert a Hono route pattern to a RegExp that tests concrete paths. */
function patternToRegExp(pattern) {
  // split() with a capture group alternates: literal, token, literal, token, ...
  const parts = pattern.split(/(:[A-Za-z0-9_]+(?:\{[^}]*\})?\??|\*)/);
  let source = parts
    .map((part, i) => {
      if (i % 2 === 0) return part.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
      return part === '*' ? '.*' : '[^/]+';
    })
    .join('');
  source = source.replace(/\/\.\*$/, '(?:/.*)?'); // '/api/*' also matches '/api'
  return new RegExp(`^${source}$`);
}

/** Replace :params / wildcards in an endpoint path with sample segments. */
function samplePath(path) {
  return path.replace(/:[A-Za-z0-9_]+(\{[^}]*\})?\??/g, 'sample').replace(/\*/g, 'sample');
}

function describeMiddleware(fn) {
  const meta = getMiddlewareMeta(fn);
  if (meta) return { ...meta };
  return { name: fn.name || '<anonymous>', kind: 'untagged' };
}

function listRoutes(app) {
  const entries = app.routes.map((r, index) => ({ ...r, index }));

  const terminals = new Map(); // "METHOD path" -> last entry
  for (const e of entries) {
    if (e.method === 'ALL') continue;
    terminals.set(`${e.method} ${e.path}`, e);
  }

  const result = [];
  for (const terminal of terminals.values()) {
    const concrete = samplePath(terminal.path);

    const useMiddleware = entries.filter(
      (e) => e.method === 'ALL' && e.index < terminal.index && patternToRegExp(e.path).test(concrete)
    );
    const routeLevel = entries.filter(
      (e) => e.method === terminal.method && e.path === terminal.path && e.index < terminal.index
    );

    const middleware = [...useMiddleware, ...routeLevel].map((e) => describeMiddleware(e.handler));
    const plans = middleware.filter((m) => m.kind === 'plan' && Number.isInteger(m.minTier));

    result.push({
      method: terminal.method,
      path: terminal.path,
      handler: terminal.handler.name || '<anonymous>',
      middleware,
      auth: middleware.some((m) => m.kind === 'auth'),
      minTier: plans.length ? Math.max(...plans.map((m) => m.minTier)) : null,
      untagged: middleware.filter((m) => m.kind === 'untagged').length,
    });
  }
  return result;
}

module.exports = { createRouter, mountRoutes, listMounts, listRoutes, patternToRegExp };
