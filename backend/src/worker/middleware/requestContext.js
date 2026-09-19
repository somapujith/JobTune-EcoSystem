'use strict';

/**
 * Global context-setup middleware.  Order in createApp:
 *   securityHeaders -> configMiddleware -> cors -> dbMiddleware -> servicesMiddleware
 *   -> bodyParser -> auditLogger('/api') -> [route-level: authenticateToken -> requirePlan(n)]
 */
const { createConfig } = require('../config');
const { createServices } = require('../services');
const { tagMiddleware } = require('../lib/tag');
const { getConfig } = require('../lib/context');

/**
 * c.set('config', frozenConfig). Throws ConfigError when env is misconfigured;
 * app.onError turns that into a masked 500 (the message is logged, not returned).
 */
function configMiddleware() {
  const mw = async (c, next) => {
    c.set('config', createConfig(c.env));
    return next();
  };
  return tagMiddleware(mw, 'configMiddleware', { kind: 'config' });
}

/**
 * c.set('services', container). The container is cheap: services are constructed
 * lazily on first property access (see services/index.js).
 * @param {(deps: {db: object, config: object}) => object} [servicesFactory] test/override hook
 */
function servicesMiddleware(servicesFactory = createServices) {
  const mw = async (c, next) => {
    c.set('services', servicesFactory({ db: c.get('db'), config: getConfig(c) }));
    return next();
  };
  return tagMiddleware(mw, 'servicesMiddleware', { kind: 'context' });
}

module.exports = { configMiddleware, servicesMiddleware };
