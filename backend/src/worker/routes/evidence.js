'use strict';

/**
 * Evidence routes: bullet tracking and reuse audit.
 * Worker port of backend/src/routes/evidence.js (git HEAD 38d8130a). Mounted at /api/evidence.
 *
 * GET /api/evidence/report   authenticateToken + requirePlan(3)
 * GET /api/evidence/bullets  authenticateToken   (NOT plan gated, as in the original)
 *
 * Preserved on purpose (ADR 4.3): both handlers return `details: err.message` in their 500 bodies,
 * so a database error message reaches the client exactly as it does on Render.
 */
const { createRouter } = require('../lib/routes');
const { authenticateToken } = require('../middleware/auth');
const { requirePlan } = require('../middleware/requirePlan');
const { getServices } = require('../lib/context');
const { getDb } = require('../db');
const { getQuery } = require('../lib/http');

const router = createRouter();

/**
 * GET /api/evidence/report
 * Returns bullet reuse report for authenticated user.
 */
router.get('/report', authenticateToken, requirePlan(3), async (c) => {
  try {
    const userId = c.get('user').id;
    const { evidenceTracker } = getServices(c);
    const report = await evidenceTracker.getReuseReport(userId);
    return c.json(report);
  } catch (err) {
    return c.json({ error: 'Failed to generate evidence report', details: err.message }, 500);
  }
});

/**
 * GET /api/evidence/bullets
 * Returns all bullets for authenticated user.
 * Optional ?applicationId=N to filter by application.
 */
router.get('/bullets', authenticateToken, async (c) => {
  try {
    const userId = c.get('user').id;
    const query = getQuery(c);
    const applicationId = query.applicationId ? parseInt(query.applicationId, 10) : null;

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

    const result = await getDb(c).query(sql, params);
    return c.json({ bullets: result.rows });
  } catch (err) {
    return c.json({ error: 'Failed to retrieve bullets', details: err.message }, 500);
  }
});

module.exports = router;
