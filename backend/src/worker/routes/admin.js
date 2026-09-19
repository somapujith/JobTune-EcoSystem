'use strict';

/**
 * Worker port of backend/src/routes/admin.js (4 endpoints, all admin only).   (T3B, ADR-001 section 7)
 *
 *   GET /stats   GET /users   GET /audit-logs   PUT /users/:id/role
 *
 * FILE-LEVEL GUARD: Express registered `router.use(authenticateToken, requireAdmin)` BEFORE the
 * routes, so every request under /api/admin (any method, any path, including unknown paths and the
 * bare prefix) passes authenticateToken and then requireAdmin first. The Worker registers
 * `router.use('*', authenticateToken, requireAdmin)` at the same position, before every route. Do not
 * move it below a route, and do not add a route above it (a use() registered after a route does not
 * guard it in Hono).
 *
 * requireAdmin is defined locally in the Express file (not in middleware/auth.js), so it is
 * re-implemented here and tagged {kind:'admin'} for route introspection (lib/routes listRoutes ->
 * manifest `admin`). It reads the CURRENT role from the users table on every request (the JWT carries
 * no role), returns 403 {"error":"Access denied. Admins only."} for a missing user or a non-admin,
 * and 500 {"error":"Database error"} when the lookup throws. It fails closed: next() runs only after a
 * row with role === 'admin' was read.
 *
 * Preserved: handlers answer their own 500 bodies ("Error fetching stats", ...) after logging; the
 * PUT handler destructures the body OUTSIDE its try (a body-less request is a masked 500).
 */
const { createRouter } = require('../lib/routes');
const { authenticateToken } = require('../middleware/auth');
const { tagMiddleware } = require('../lib/tag');
const { getDb } = require('../db');
const { getBody, getQuery } = require('../lib/http');

const router = createRouter();

// Middleware to check admin role
const requireAdmin = tagMiddleware(async (c, next) => {
  try {
    const users = await getDb(c).query('SELECT role FROM users WHERE id = $1', [c.get('user').id]);
    if (users.rows.length === 0 || users.rows[0].role !== 'admin') {
      return c.json({ error: 'Access denied. Admins only.' }, 403);
    }
  } catch (err) {
    return c.json({ error: 'Database error' }, 500);
  }
  return next();
}, 'requireAdmin', { kind: 'admin' });

// Apply auth and admin checks to all routes in this file
router.use('*', authenticateToken, requireAdmin);

// 1. Get Dashboard Stats
router.get('/stats', async (c) => {
  try {
    const db = getDb(c);
    const totalUsers = await db.query('SELECT COUNT(*) as total_users FROM users');
    const activeAdmins = await db.query('SELECT COUNT(*) as active_admins FROM users WHERE role = $1', ['admin']);
    const totalLogs = await db.query('SELECT COUNT(*) as total_logs FROM audit_logs');

    // Recent logs count (last 24h)
    const recentLogs = await db.query('SELECT COUNT(*) as recent_logs FROM audit_logs WHERE created_at >= NOW() - INTERVAL \'1 day\'');

    return c.json({
      totalUsers: totalUsers.rows[0].total_users,
      activeAdmins: activeAdmins.rows[0].active_admins,
      totalAuditLogs: totalLogs.rows[0].total_logs,
      recentLogs: recentLogs.rows[0].recent_logs
    });
  } catch (err) {
    console.error(err);
    return c.json({ error: 'Error fetching stats' }, 500);
  }
});

// 2. Get Users List
router.get('/users', async (c) => {
  try {
    const users = await getDb(c).query('SELECT id, name, email, role, created_at FROM users ORDER BY created_at DESC');
    return c.json(users.rows);
  } catch (err) {
    console.error(err);
    return c.json({ error: 'Error fetching users' }, 500);
  }
});

// 3. Get Audit Logs (with optional user_id filter)
router.get('/audit-logs', async (c) => {
  const { user_id } = getQuery(c);
  try {
    let query = `
      SELECT a.id, a.user_id, u.name as user_name, u.email as user_email, a.action, a.resource, a.details, a.ip_address, a.created_at
      FROM audit_logs a
      LEFT JOIN users u ON a.user_id = u.id
    `;
    const params = [];

    if (user_id) {
      query += ' WHERE a.user_id = $1 ';
      params.push(user_id);
    }

    query += ' ORDER BY a.created_at DESC LIMIT 100'; // limit to 100 for basic UI

    const logs = await getDb(c).query(query, params);

    // Parse details JSON string back to object for UI
    const parsedLogs = logs.rows.map(log => {
      let details = log.details;
      if (typeof details === 'string') {
        try {
          details = JSON.parse(details);
        } catch (e) {
          console.warn('Failed to parse audit log details:', e.message);
          details = { raw: details };
        }
      }
      return { ...log, details };
    });

    return c.json(parsedLogs);
  } catch (err) {
    console.error(err);
    return c.json({ error: 'Error fetching audit logs' }, 500);
  }
});

// 4. Update user role (grant/revoke admin)
router.put('/users/:id/role', async (c) => {
  const { role } = getBody(c);
  const targetId = parseInt(c.req.param('id'), 10);

  if (!['user', 'admin'].includes(role)) {
    return c.json({ error: 'Invalid role' }, 400);
  }
  if (!targetId || isNaN(targetId)) {
    return c.json({ error: 'Invalid user id' }, 400);
  }
  if (targetId === c.get('user').id && role !== 'admin') {
    return c.json({ error: 'Cannot remove your own admin role' }, 400);
  }

  try {
    const result = await getDb(c).query('UPDATE users SET role = $1 WHERE id = $2 RETURNING id', [role, targetId]);
    if (result.rows.length === 0) {
      return c.json({ error: 'User not found' }, 404);
    }
    return c.json({ message: 'User role updated successfully' });
  } catch (err) {
    console.error(err);
    return c.json({ error: 'Error updating user role' }, 500);
  }
});

module.exports = router;
