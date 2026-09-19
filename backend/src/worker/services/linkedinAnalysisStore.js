'use strict';

/**
 * Worker port of backend/src/services/linkedinAnalysisStore.js (ported from git HEAD 38d8130a).
 * (ADR-001 Phase 2/3, slice "large2")
 *
 * Pure database service. Function names, SQL text, parameter order, defaults and return
 * shapes are identical to the original module's exports; the only change is dependency
 * injection: `createLinkedinAnalysisStore({ db })` instead of a module-level pool.
 * Registry key: `linkedinAnalysisStore` (see services/registry/large2.js).
 *
 * Note (preserved): `target_roles` is passed as a JS array and `report` as a JSON string,
 * exactly as before. Array-to-Postgres-array conversion is the driver's job; that it
 * behaves like node-postgres under the Neon driver is NOT verified by the unit tests.
 */

/**
 * @param {{ db: { query: Function } }} deps
 */
function createLinkedinAnalysisStore({ db }) {
  if (!db || typeof db.query !== 'function') {
    throw new TypeError('createLinkedinAnalysisStore requires a db with query()');
  }

  async function saveLinkedInAnalysis(userId, report) {
    const profile = report.profile || {};
    const targetRoles = Array.isArray(profile.targetRoles) ? profile.targetRoles : [];
    const result = await db.query(
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
    const result = await db.query(
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
    const result = await db.query(
      `SELECT id, report, created_at
     FROM linkedin_analyses
     WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );

    return result.rows[0] || null;
  }

  return { saveLinkedInAnalysis, getLinkedInAnalysisHistory, getLinkedInAnalysisById };
}

module.exports = { createLinkedinAnalysisStore };
