'use strict';

/**
 * Harness for the auth slice tests. Builds a real Worker app (createApp) wired to the auth test db,
 * with the four ported routers mounted exactly like routes/mounts/auth.js does (authRateLimit on
 * /api/auth/*, Express mount order, the static /admin page). The mount file itself is exercised
 * separately (mount.test.js) so route tests do not depend on it.
 *
 * Everything is synthetic: made-up secrets, in-memory db, requests never leave the process.
 */
const { createApp } = require('../../../../src/worker/app');
const { createServices } = require('../../../../src/worker/services');
const { mountRoutes } = require('../../../../src/worker/lib/routes');
const { authRateLimit } = require('../../../../src/worker/middleware/rateLimit');
const { createRecommendationEngine } = require('../../../../src/worker/services/recommendationEngine');
const authRouter = require('../../../../src/worker/routes/auth');
const subscriptionsRouter = require('../../../../src/worker/routes/subscriptions');
const adminRouter = require('../../../../src/worker/routes/admin');
const adminPanelsRouter = require('../../../../src/worker/routes/adminPanels');
const adminStaticRouter = require('../../../../src/worker/routes/adminStatic');
const { makeEnv, makeCtx, signToken, seedPlans, TEST_JWT_SECRET } = require('../../helpers/harness');
const { createAuthDb } = require('./authDb');

/** Same mounts, same order, as backend/src/app.js for this slice (+ authRateLimit on /api/auth/*). */
function mountAuthSlice(app) {
  app.use('/api/auth/*', authRateLimit());
  mountRoutes(app, '/api/auth', authRouter);
  mountRoutes(app, '/api/subscriptions', subscriptionsRouter);
  mountRoutes(app, '/api/admin', adminRouter);
  mountRoutes(app, '/api/admin-panels', adminPanelsRouter);
  mountRoutes(app, '/admin', adminStaticRouter);
}

/**
 * Container factory that adds recommendationEngine as a lazily built override, so the route tests
 * are independent of the registry file (checked in registry.test.js).
 */
function servicesFactoryWithEngine(overridesExtra = {}) {
  return ({ db, config }) => {
    const overrides = { ...overridesExtra };
    let engine;
    if (!('recommendationEngine' in overrides)) {
      Object.defineProperty(overrides, 'recommendationEngine', {
        enumerable: true,
        get() {
          if (!engine) engine = createRecommendationEngine({ services });
          return engine;
        },
      });
    }
    const services = createServices({ db, config, overrides });
    return services;
  };
}

function buildApp({ db = createAuthDb(), env, servicesFactory, mount = mountAuthSlice, plans = true } = {}) {
  if (plans) seedPlans(db);
  const theEnv = env || makeEnv();
  const app = createApp({ dbFactory: () => db, servicesFactory: servicesFactory || servicesFactoryWithEngine() });
  mount(app);
  const ctx = makeCtx();
  const request = (path, init = {}) => app.request(path, init, theEnv, ctx);
  return { app, db, env: theEnv, ctx, request };
}

/** fetch-style init for a JSON request; body may be an object, a raw string, or undefined (no body). */
function jsonInit({ method = 'POST', body, token, ip, ua, headers = {} } = {}) {
  const h = { ...headers };
  if (body !== undefined) h['Content-Type'] = 'application/json';
  if (token) h.Authorization = `Bearer ${token}`;
  if (ip) h['CF-Connecting-IP'] = ip;
  if (ua) h['User-Agent'] = ua;
  return {
    method,
    headers: h,
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  };
}

const SUPERSEDED = {
  error: 'This account was signed in on another device. Sign in again to use JobTune on this device.',
  code: 'SESSION_SUPERSEDED',
};

module.exports = {
  buildApp, mountAuthSlice, servicesFactoryWithEngine, jsonInit, SUPERSEDED,
  makeEnv, makeCtx, signToken, seedPlans, TEST_JWT_SECRET, createAuthDb,
};
