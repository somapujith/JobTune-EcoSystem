const express = require('express');
const { pool } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { runBenchmark } = require('../services/benchmarks/scorerBenchmark');

const router = express.Router();

// Admin-only middleware (mirrors admin.js pattern)
const requireAdmin = async (req, res, next) => {
  try {
    const result = await pool.query('SELECT role FROM users WHERE id = $1', [req.user.id]);
    if (result.rows.length === 0 || result.rows[0].role !== 'admin') {
      return res.status(403).json({ error: 'Access denied. Admins only.' });
    }
    next();
  } catch (err) {
    return res.status(500).json({ error: 'Database error' });
  }
};

// GET /api/benchmarks/run (admin-only)
router.get('/run', authenticateToken, requireAdmin, async (req, res) => {
  const { scorerName, datasetName } = req.query;

  if (!scorerName) {
    return res.status(400).json({ error: 'scorerName query parameter is required' });
  }
  if (!datasetName) {
    return res.status(400).json({ error: 'datasetName query parameter is required' });
  }

  try {
    const metrics = await runBenchmark({ scorerName, datasetName });
    return res.status(200).json(metrics);
  } catch (err) {
    return res.status(500).json({ error: 'Benchmark failed', detail: err.message });
  }
});

module.exports = router;
