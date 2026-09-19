'use strict';

/**
 * Typed accessors for the Hono context variables set by the global middleware.
 * Route and middleware code should use these instead of raw c.get() so that a
 * missing wiring step fails with a clear message.
 *
 *   c.get('config')    frozen config             (middleware/requestContext.js configMiddleware)
 *   c.get('db')        request-scoped db          (db.js dbMiddleware)
 *   c.get('services')  lazy service container     (middleware/requestContext.js servicesMiddleware)
 *   c.get('user')      JWT claims                  (middleware/auth.js authenticateToken)
 *   c.get('userPlan')  subscription_plans row      (middleware/requirePlan.js)
 *   c.get('body')      parsed JSON/urlencoded body (middleware/bodyParser.js)
 */
const { createConfig } = require('../config');

/**
 * Returns the request's frozen config. Normally already in the context; when a
 * middleware is mounted on a bare Hono app (unit tests) it falls back to
 * building it from c.env. May throw ConfigError.
 */
function getConfig(c) {
  return c.get('config') || createConfig(c.env);
}

function getServices(c) {
  const services = c.get('services');
  if (!services) {
    throw new Error('services not initialised: servicesMiddleware must run before this handler');
  }
  return services;
}

module.exports = { getConfig, getServices };
