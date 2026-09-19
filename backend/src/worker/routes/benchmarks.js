'use strict';

/**
 * /api/benchmarks: Worker port (leaf1 slice) of backend/src/routes/benchmarks.js.
 *
 *   GET /run   authenticateToken -> requireAdmin      (admin only; not plan-gated)
 *
 * requireAdmin is defined locally in the Express route file (it is NOT the middleware of
 * routes/admin.js), so it is re-implemented here and tagged {kind:'admin'} for route
 * introspection (manifest field admin:true, guards ["authenticateToken","requireAdmin"]).
 * Behaviour is identical: role looked up from the users table on every request (not from the
 * token); no row or role !== 'admin' -> 403 "Access denied. Admins only."; any failure while
 * reading the user or the role (including a missing user claim) -> 500 "Database error".
 * As in Express, the downstream handler runs OUTSIDE the try, so a handler failure is never
 * reported as "Database error".
 */
const { createRouter } = require('../lib/routes');
const { authenticateToken } = require('../middleware/auth');
const { tagMiddleware } = require('../lib/tag');
const { getDb } = require('../db');
const { getServices } = require('../lib/context');
const { getQuery } = require('../lib/http');

const router = createRouter();

// Admin-only middleware (mirrors the admin route file pattern)
const requireAdmin = tagMiddleware(
  async (c, next) => {
    try {
      const result = await getDb(c).query('SELECT role FROM users WHERE id = $1', [c.get('user').id]);
      if (result.rows.length === 0 || result.rows[0].role !== 'admin') {
        return c.json({ error: 'Access denied. Admins only.' }, 403);
      }
    } catch (err) {
      return c.json({ error: 'Database error' }, 500);
    }
    return next();
  },
  'requireAdmin',
  { kind: 'admin' }
);

// GET /api/benchmarks/run (admin-only)
router.get('/run', authenticateToken, requireAdmin, async (c) => {
  const { scorerName, datasetName } = getQuery(c);

  if (!scorerName) {
    return c.json({ error: 'scorerName query parameter is required' }, 400);
  }
  if (!datasetName) {
    return c.json({ error: 'datasetName query parameter is required' }, 400);
  }

  const { scorerBenchmark } = getServices(c);
  try {
    const metrics = await scorerBenchmark.runBenchmark({ scorerName, datasetName });
    return c.json(metrics, 200);
  } catch (err) {
    return c.json({ error: 'Benchmark failed', detail: err.message }, 500);
  }
});

module.exports = router;
