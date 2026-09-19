'use strict';

/**
 * authenticateToken: Worker port of backend/src/middleware/auth.js (HEAD).
 * (T1.4, ADR-001 sections 4.1, 4.2, 6.2, 10)
 *
 * Behaviour preserved branch for branch:
 *   - no Authorization header / no second token part      -> 401 {"error":"Unauthorized"}
 *   - token = header.split(' ')[1] (so "Basic x" yields token "x", which then fails verify)
 *   - token verified HS256-only (algorithm pinned in lib/jwt.js)
 *   - claims carrying a `sessionId` are checked against user_sessions:
 *       inactive/revoked/expired -> 401 {"error":"This account was signed in on another
 *       device. Sign in again to use JobTune on this device.","code":"SESSION_SUPERSEDED"}
 *       active -> last_active_at touched in the background (errors swallowed)
 *   - ANY error inside that try block, including a database error while checking the
 *     session, returns 401 {"error":"Unauthorized"} (existing behaviour, kept: it is
 *     fail-closed) and logs "JWT Verify Error:" with the message
 *   - success: c.set('user', <decoded claims>) exactly as Express set req.user
 *     (id, sessionId, iat, exp), then the chain continues
 *
 * What changed (and why):
 *   - JWT_SECRET comes from the injected frozen config, not module scope. The original
 *     module-load process-exit path is gone (ADR 4.1). A ConfigError while resolving
 *     config returns 500 {"error":"Internal Server Error"} (detail is logged, never sent)
 *     and NEVER reaches next().
 *   - the fire-and-forget touchSession is handed to ctx.waitUntil so the runtime keeps
 *     it alive after the response.
 *   - next() is called outside the try block so a downstream failure can never be
 *     mis-reported as a 401 by this middleware.
 *   - also records c.set('clientIp', getClientIp(c)) on success (CF-Connecting-IP).
 *     The middleware itself never used the IP; this is a convenience for handlers.
 *
 * Usage (per route, before requirePlan):   router.get('/x', authenticateToken, handler)
 * File-level guard (Express router.use):    router.use('*', authenticateToken)
 */
const { ConfigError } = require('../lib/errors');
const { getConfig, getServices } = require('../lib/context');
const { getClientIp, safeWaitUntil } = require('../lib/http');
const jwt = require('../lib/jwt');
const { tagMiddleware } = require('../lib/tag');

async function authenticateToken(c, next) {
  let config;
  try {
    config = getConfig(c);
  } catch (err) {
    if (err instanceof ConfigError) {
      console.error('auth: configuration error:', err.message);
      return c.json({ error: 'Internal Server Error' }, 500);
    }
    throw err;
  }

  const authHeader = c.req.header('authorization');
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return c.json({ error: 'Unauthorized' }, 401);

  let user;
  try {
    user = await jwt.verify(token, config.jwtSecret);

    if (user.sessionId) {
      const { sessionService } = getServices(c);
      const active = await sessionService.isSessionActive(user.sessionId);
      if (!active) {
        return c.json(
          {
            error: 'This account was signed in on another device. Sign in again to use JobTune on this device.',
            code: 'SESSION_SUPERSEDED',
          },
          401
        );
      }
      safeWaitUntil(c, sessionService.touchSession(user.sessionId).catch(() => {}));
    }
  } catch (err) {
    console.error('JWT Verify Error:', err.message);
    return c.json({ error: 'Unauthorized' }, 401);
  }

  c.set('user', user);
  c.set('clientIp', getClientIp(c));
  return next();
}

tagMiddleware(authenticateToken, 'authenticateToken', { kind: 'auth' });

module.exports = { authenticateToken };
