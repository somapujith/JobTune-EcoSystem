/**
 * Evidence routes — bullet tracking and reuse audit.
 * GET /api/evidence/report
 * GET /api/evidence/bullets
 */

const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { requirePlan } = require('../middleware/requirePlan');
const { getReuseReport } = require('../services/evidence/evidenceTracker');
const { pool } = require('../config/database');

/**
 * GET /api/evidence/report
 * Returns bullet reuse report for authenticated user.
 */
router.get('/report', authenticateToken, requirePlan(3), async (req, res) => {
  try {
    const userId = req.user.id;
    const report = await getReuseReport(userId);
    res.json(report);
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate evidence report', details: err.message });
  }
});

/**
 * GET /api/evidence/bullets
 * Returns all bullets for authenticated user.
 * Optional ?applicationId=N to filter by application.
 */
router.get('/bullets', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const applicationId = req.query.applicationId ? parseInt(req.query.applicationId, 10) : null;

    let sql;
    let params;

    if (applicationId !== null) {
      sql = `SELECT eb.id, eb.bullet_text, eb.skills, eb.source_section, eb.created_at
             FROM evidence_bullets eb
             INNER JOIN evidence_usage eu ON eu.bullet_id = eb.id
             WHERE eb.user_id = $1
               AND eu.application_id = $2
             GROUP BY eb.id, eb.bullet_text, eb.skills, eb.source_section, eb.created_at
             ORDER BY eb.created_at DESC`;
      params = [userId, applicationId];
    } else {
      sql = `SELECT id, bullet_text, skills, source_section, created_at
             FROM evidence_bullets
             WHERE user_id = $1
             ORDER BY created_at DESC`;
      params = [userId];
    }

    const result = await pool.query(sql, params);
    res.json({ bullets: result.rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve bullets', details: err.message });
  }
});

module.exports = router;
