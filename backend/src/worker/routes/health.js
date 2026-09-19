'use strict';

/**
 * GET /api/health: mirrors the current (working-tree) Express endpoint
 *   { "status": "ok" | "degraded", "db": "connected" | "unreachable", "aiCache": { size, hits, misses, hitRate } }
 * always with HTTP 200 (a database outage shows as status "degraded", not as an error status).
 *
 * The database probe is `SELECT 1` through the request-scoped db, awaited before responding, and any error is
 * swallowed into "unreachable" exactly as the Express handler does. Both bound the probe at 2s (a slow Neon reports "unreachable").
 * aiCache is the real per-isolate cache (see services/aiCache.js and ADR-001 4.5): on a cold isolate it reads
 * zeros, and hitRate is far lower than on Render by design.
 *
 * Mounted at '/api' by createApp, AFTER auditLogger, exactly as Express registered it
 * after `app.use('/api', auditLogger(...))`. Consequence, preserved: every health
 * request also writes an audit_logs row (in the background).
 */
const { createRouter } = require('../lib/routes');
const { getAICacheStats } = require('../lib/aiCacheStats');
const { getDb } = require('../db');

const router = createRouter();

router.get('/health', async function health(c) {
  const db = getDb(c);
  let dbStatus = 'connected';
  let timer;
  try {
    // Bounded probe (mirrors the Express handler): a slow or unreachable Neon reports "unreachable" after 2s.
    await Promise.race([
      db.query('SELECT 1'),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('health db probe timeout')), 2000);
      }),
    ]);
  } catch {
    dbStatus = 'unreachable';
  } finally {
    clearTimeout(timer);
  }
  return c.json({ status: dbStatus === 'connected' ? 'ok' : 'degraded', db: dbStatus, aiCache: getAICacheStats(c) });
});

module.exports = router;
