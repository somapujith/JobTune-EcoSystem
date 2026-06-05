const express = require('express');
const { pool } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const router = express.Router();

// Middleware to check admin role
const requireAdmin = async (req, res, next) => {
  try {
    const [users] = await pool.query('SELECT role FROM users WHERE id = ?', [req.user.id]);
    if (users.length === 0 || users[0].role !== 'admin') {
      return res.status(403).json({ error: 'Access denied. Admins only.' });
    }
    next();
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
};

// Apply auth and admin checks to all routes in this file
router.use(authenticateToken, requireAdmin);

// 1. Get Dashboard Stats
router.get('/stats', async (req, res) => {
  try {
    const [[{ total_users }]] = await pool.query('SELECT COUNT(*) as total_users FROM users');
    const [[{ active_admins }]] = await pool.query('SELECT COUNT(*) as active_admins FROM users WHERE role = "admin"');
    const [[{ total_logs }]] = await pool.query('SELECT COUNT(*) as total_logs FROM audit_logs');
    
    // Recent logs count (last 24h)
    const [[{ recent_logs }]] = await pool.query('SELECT COUNT(*) as recent_logs FROM audit_logs WHERE created_at >= NOW() - INTERVAL 1 DAY');

    res.json({
      totalUsers: total_users,
      activeAdmins: active_admins,
      totalAuditLogs: total_logs,
      recentLogs: recent_logs
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error fetching stats' });
  }
});

// 2. Get Users List
router.get('/users', async (req, res) => {
  try {
    const [users] = await pool.query('SELECT id, name, email, role, created_at FROM users ORDER BY created_at DESC');
    res.json(users);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error fetching users' });
  }
});

// 3. Get Audit Logs (with optional user_id filter)
router.get('/audit-logs', async (req, res) => {
  const { user_id } = req.query;
  try {
    let query = `
      SELECT a.id, a.user_id, u.name as user_name, u.email as user_email, a.action, a.resource, a.details, a.ip_address, a.created_at 
      FROM audit_logs a
      LEFT JOIN users u ON a.user_id = u.id
    `;
    const params = [];
    
    if (user_id) {
      query += ' WHERE a.user_id = ? ';
      params.push(user_id);
    }
    
    query += ' ORDER BY a.created_at DESC LIMIT 100'; // limit to 100 for basic UI
    
    const [logs] = await pool.query(query, params);
    
    // Parse details JSON string back to object for UI
    const parsedLogs = logs.map(log => {
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
    
    res.json(parsedLogs);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error fetching audit logs' });
  }
});

// 4. Update user role (grant/revoke admin)
router.put('/users/:id/role', async (req, res) => {
  const { role } = req.body;
  if (!['user', 'admin'].includes(role)) {
    return res.status(400).json({ error: 'Invalid role' });
  }
  
  try {
    await pool.query('UPDATE users SET role = ? WHERE id = ?', [role, req.params.id]);
    res.json({ message: 'User role updated successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error updating user role' });
  }
});

module.exports = router;
