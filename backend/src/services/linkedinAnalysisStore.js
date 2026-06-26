const { pool } = require('../config/database');

async function saveLinkedInAnalysis(userId, report) {
  const profile = report.profile || {};
  const targetRoles = Array.isArray(profile.targetRoles) ? profile.targetRoles : [];
  const result = await pool.query(
    `INSERT INTO linkedin_analyses
      (user_id, profile_url, target_roles, overall_score, grade, ai_powered, report)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, created_at`,
    [
      userId,
      profile.profileUrl || null,
      targetRoles,
      report.score || 0,
      report.scoreLabel || null,
      Boolean(report.aiPowered),
      JSON.stringify(report),
    ]
  );

  return result.rows[0];
}

async function getLinkedInAnalysisHistory(userId, limit = 10) {
  const safeLimit = Math.min(Number(limit) || 10, 25);
  const result = await pool.query(
    `SELECT
      id,
      profile_url,
      target_roles,
      overall_score,
      grade,
      ai_powered,
      created_at
     FROM linkedin_analyses
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [userId, safeLimit]
  );

  return result.rows;
}

async function getLinkedInAnalysisById(userId, id) {
  const result = await pool.query(
    `SELECT id, report, created_at
     FROM linkedin_analyses
     WHERE id = $1 AND user_id = $2`,
    [id, userId]
  );

  return result.rows[0] || null;
}

module.exports = {
  saveLinkedInAnalysis,
  getLinkedInAnalysisHistory,
  getLinkedInAnalysisById,
};
