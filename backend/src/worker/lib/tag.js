'use strict';

/**
 * Middleware tagging, the basis of route introspection (see README "Introspection").
 *
 * Every middleware function created under src/worker/ MUST be passed through
 * tagMiddleware() so that a Worker-side manifest extractor (lib/routes.js
 * listRoutes) can read, from the live Hono app, which routes are behind
 * authentication and which minimum plan tier they require, without parsing
 * source text.
 *
 *   kind   'auth' | 'plan' | 'admin' | 'audit' | 'security' | 'cors' | 'config'
 *          | 'context' | 'body' | 'ratelimit'   (free-form string, but the
 *          extractor only interprets 'auth', 'plan' and 'admin')
 *   name   stable display name; also assigned to fn.name, e.g. "requirePlan(2)"
 *   minTier (kind 'plan' only) the integer tier passed to requirePlan()
 */
const META = Symbol.for('jobtune.worker.middleware.meta');

function tagMiddleware(fn, name, meta = {}) {
  if (typeof fn !== 'function') throw new TypeError('tagMiddleware: fn must be a function');
  if (typeof name !== 'string' || !name) throw new TypeError('tagMiddleware: name must be a non-empty string');
  Object.defineProperty(fn, 'name', { value: name, configurable: true });
  Object.defineProperty(fn, META, { value: Object.freeze({ name, ...meta }), configurable: true });
  return fn;
}

/** @returns {{name: string, kind?: string, minTier?: number}|null} */
function getMiddlewareMeta(fn) {
  return (fn && fn[META]) || null;
}

module.exports = { tagMiddleware, getMiddlewareMeta, META };
