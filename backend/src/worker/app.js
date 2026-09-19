'use strict';

/**
 * Hono application factory for the Cloudflare Worker port of the JobTune API.
 * (T1.3, ADR-001)   Parallel copy of backend/src/app.js; Render stays authoritative.
 *
 * createApp(opts) builds a fresh app; nothing is constructed at module scope and no
 * ambient globals are read (config arrives via the Worker `env`, see config.js).
 *
 * Global middleware order (mirrors app.js: helmet -> cors -> body parsers -> audit ->
 * rate limit -> routes), with the DI layers added in front of what needs them:
 *
 *   1 securityHeaders        helmet-equivalent headers (also on error / 404 / preflight)
 *   2 configMiddleware       createConfig(env) -> c.get('config')   (ConfigError -> masked 500)
 *   3 corsMiddleware         dynamic origin allowlist from config
 *   4 dbMiddleware           request-scoped db, released after the response (waitUntil)
 *   5 servicesMiddleware     lazy service container -> c.get('services')
 *   6 bodyParser             JSON / urlencoded, 1 MB limit -> c.get('body')
 *   7 auditLogger            /api/*: background audit_logs insert
 *   8 apiRateLimit           /api/*: PLACEHOLDER (see middleware/rateLimit.js), not enforced
 *   routes                   mounted with mountRoutes() via slices; per route: authenticateToken -> requirePlan(n)
 *
 * app.onError -> errorHandler semantics; app.notFound -> Express's default 404.
 *
 * opts (all optional, for tests / later waves):
 *   dbFactory(config, c)        replace the Neon db (tests inject an in-memory fake)
 *   servicesFactory({db,config}) replace the service container factory
 */
const { Hono } = require('hono');
const { securityHeaders } = require('./middleware/securityHeaders');
const { configMiddleware, servicesMiddleware } = require('./middleware/requestContext');
const { corsMiddleware } = require('./middleware/cors');
const { dbMiddleware, defaultDbFactory } = require('./db');
const { bodyParser } = require('./middleware/bodyParser');
const { auditLogger } = require('./middleware/auditLogger');
const { apiRateLimit } = require('./middleware/rateLimit');
const { onError, notFoundHandler } = require('./middleware/errorHandler');
const { mountRoutes } = require('./lib/routes');
const { mountAll } = require('./routes/mounts');
const healthRoutes = require('./routes/health');

function createApp(opts = {}) {
  // mountSlices: production (worker-entry.js) opts in. Off by default so unit tests that build an app
  // only see the routers they mount themselves and one slice's WIP cannot break another slice's tests.
  const { dbFactory = defaultDbFactory, servicesFactory, mountSlices = false } = opts;

  // strict:false so '/api/health/' matches like Express (non-strict routing by default).
  // Known remaining difference: Express routing is case-insensitive, Hono's is not.
  const app = new Hono({ strict: false });

  app.use('*', securityHeaders());
  app.use('*', configMiddleware());
  app.use('*', corsMiddleware());
  app.use('*', dbMiddleware(dbFactory));
  app.use('*', servicesMiddleware(servicesFactory));
  app.use('*', bodyParser());

  // Global audit logger for the API (app.use('/api', auditLogger('API_REQUEST', 'system')))
  app.use('/api/*', auditLogger('API_REQUEST', 'system'));

  // Rate limiting: replaced by Cloudflare edge rate limiting (ADR 4.4). Placeholder only.
  app.use('/api/*', apiRateLimit());

  // ---- Routes ------------------------------------------------------------------
  // Route modules are mounted per porting slice (routes/mounts/<slice>.js), in the SAME relative order as
  // backend/src/app.js within each shared prefix (several Express files share one, so order is behaviour).
  // Express registered /api/health last, after every router; it has no path overlap with
  // them, so it is mounted here until the router list grows.
  // Each porting slice mounts its own routers from routes/mounts/<slice>.js (ADR-001 Phase 3).
  if (mountSlices) mountAll(app);

  mountRoutes(app, '/api', healthRoutes);

  app.onError(onError);
  app.notFound(notFoundHandler);

  return app;
}

module.exports = { createApp };
