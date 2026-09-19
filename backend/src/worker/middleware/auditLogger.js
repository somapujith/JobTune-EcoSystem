'use strict';

/**
 * auditLogger(action, resource): Worker port of backend/src/middleware/auditLogger.js
 * (HEAD).   (T1.6, ADR-001 sections 4.2, 6.2)
 *
 * Express wrote the audit row from `res.on('finish')`, i.e. after the response was
 * sent. Hono has no finish event, so the row is written AFTER `await next()` and the
 * insert is handed to ctx.waitUntil(). Consequences, all required by the ADR:
 *   - it never blocks the response and never changes it: every failure (config, db,
 *     serialization, insert) is caught and logged as "Audit Log Error:"
 *   - it works when the app is invoked without an ExecutionContext (unit tests):
 *     lib/http.js safeWaitUntil() copes with Hono's throwing c.executionCtx getter
 *   - the insert is issued through the request-scoped db, which is tracked, so the
 *     pool is not closed until the insert settles (db.js release())
 *
 * Row content is unchanged: user_id (from c.get('user'), null if unauthenticated),
 * the action/resource given at mount time, JSON details
 *   { method, url: <path+query as received>, statusCode, query, body: '[REDACTED]' | {} }
 * and ip_address.
 *
 * ip_address: Express used the socket address, which is not available on Workers
 * (that made the audit log silently record NULL, ADR 4.2). It now comes from
 * getClientIp(c) = CF-Connecting-IP. Behind the Vercel rewrite that may be Vercel's
 * egress IP, not the end user's: verify with ADR checklist item 7.
 *
 * Mount with:  app.use('/api/*', auditLogger('API_REQUEST', 'system'))
 * It must sit inside dbMiddleware and bodyParser and outside route-level auth (so it
 * sees c.get('user') set later in the chain when it runs post-next).
 */
const { getClientIp, getOriginalUrl, getQuery, getBody, safeWaitUntil } = require('../lib/http');
const { tagMiddleware } = require('../lib/tag');

const INSERT_SQL =
  'INSERT INTO audit_logs (user_id, action, resource, details, ip_address) VALUES ($1, $2, $3, $4, $5)';

function scheduleAuditInsert(c, action, resource) {
  let job;
  try {
    const user = c.get('user');
    const userId = user ? user.id : null;
    const body = getBody(c);
    const details = {
      method: c.req.method,
      url: getOriginalUrl(c),
      statusCode: c.res.status,
      query: getQuery(c) || {},
      body: body && typeof body === 'object' && Object.keys(body).length > 0 ? '[REDACTED]' : {},
    };
    const ip = getClientIp(c);
    const db = c.get('db');

    // The async wrapper runs synchronously up to the first await, so db.query() is
    // issued (and tracked by the request db) before this function returns.
    job = (async () => {
      try {
        await db.query(INSERT_SQL, [userId, action, resource, JSON.stringify(details), ip]);
      } catch (err) {
        console.error('Audit Log Error:', err.message);
      }
    })();
  } catch (err) {
    console.error('Audit Log Error:', err.message);
    return;
  }
  safeWaitUntil(c, job);
}

const auditLogger = (action, resource) => {
  const middleware = async (c, next) => {
    try {
      await next();
    } finally {
      scheduleAuditInsert(c, action, resource);
    }
  };
  return tagMiddleware(middleware, `auditLogger(${action})`, { kind: 'audit', action, resource });
};

module.exports = { auditLogger };
