'use strict';

/**
 * resumeDatabase: Worker port of backend/src/services/resumeDatabase.js (HEAD).  (docs slice)
 *
 * The original is a class of statics over the shared pg pool. Here it is a factory over the request-scoped
 * db (`getDb(c)` / the `db` the service container injects); same method names, SQL, parameters, return values
 * and error handling (log, then rethrow the original error). Methods are closures, safe to destructure.
 *
 *   const { resumeDatabase } = getServices(c);
 *   await resumeDatabase.saveResume(userId, text, { total, role, keywordCoverage, missingInfo });
 *
 * Tables (`resumes`, `analyses`, `resume_exports`) already exist in Neon; the Express boot-time DDL is
 * intentionally not ported (ADR 6.5).
 */
function createResumeDatabase({ db }) {
  if (!db || typeof db.query !== 'function') {
    throw new TypeError('createResumeDatabase requires { db } with a query() method');
  }

  /**
   * Save resume analysis to database
   */
  async function saveResume(userId, originalResume, analysis) {
    try {
      const query = `
        INSERT INTO resumes (
          user_id, original_resume, original_score,
          role_detected, keyword_coverage, missing_info, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, NOW())
        RETURNING id, created_at;
      `;

      const values = [
        userId,
        originalResume,
        analysis.total,
        analysis.role || null,
        JSON.stringify(analysis.keywordCoverage || {}),
        JSON.stringify(analysis.missingInfo || {}),
      ];

      const result = await db.query(query, values);
      return result.rows[0];
    } catch (err) {
      console.error('Database save error:', err);
      throw err;
    }
  }

  /**
   * Save optimized resume
   */
  async function updateOptimizedResume(resumeId, optimizedResume, optimizedScore, analysis) {
    try {
      const query = `
        UPDATE resumes
        SET optimized_resume = $1, optimized_score = $2, updated_at = NOW()
        WHERE id = $3
        RETURNING id;
      `;

      const values = [optimizedResume, optimizedScore, resumeId];
      const result = await db.query(query, values);

      // Save detailed analysis
      if (analysis) {
        await saveAnalysis(resumeId, analysis);
      }

      return result.rows[0];
    } catch (err) {
      console.error('Database update error:', err);
      throw err;
    }
  }

  /**
   * Save detailed analysis
   */
  async function saveAnalysis(resumeId, analysis) {
    try {
      const query = `
        INSERT INTO analyses (
          resume_id, section_completeness, keyword_relevance,
          formatting_score, action_verbs_count, metrics_count,
          missing_sections, recommendations, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
        ON CONFLICT (resume_id) DO UPDATE SET
          section_completeness = $2,
          keyword_relevance = $3,
          formatting_score = $4,
          action_verbs_count = $5,
          metrics_count = $6,
          missing_sections = $7,
          recommendations = $8
        RETURNING id;
      `;

      const values = [
        resumeId,
        analysis.breakdown?.['Section Completeness (30)'] || 0,
        analysis.breakdown?.['Keyword Relevance (25)'] || 0,
        analysis.breakdown?.['Formatting (15)'] || 0,
        analysis.details?.actionVerbs?.count || 0,
        analysis.details?.metrics?.count || 0,
        JSON.stringify(analysis.details?.missingSections || []),
        JSON.stringify(analysis.recommendations || []),
      ];

      const result = await db.query(query, values);
      return result.rows[0];
    } catch (err) {
      console.error('Analysis save error:', err);
      throw err;
    }
  }

  /**
   * Get user's resume history
   */
  async function getUserResumes(userId, limit = 10) {
    try {
      const query = `
        SELECT
          r.id, r.original_score, r.optimized_score,
          r.role_detected, r.created_at, r.updated_at,
          COUNT(e.id) as export_count
        FROM resumes r
        LEFT JOIN resume_exports e ON r.id = e.resume_id
        WHERE r.user_id = $1
        GROUP BY r.id
        ORDER BY r.created_at DESC
        LIMIT $2;
      `;

      const result = await db.query(query, [userId, limit]);
      return result.rows;
    } catch (err) {
      console.error('Database query error:', err);
      throw err;
    }
  }

  /**
   * Get resume by ID
   */
  async function getResume(resumeId, userId) {
    try {
      const query = `
        SELECT *
        FROM resumes
        WHERE id = $1 AND user_id = $2;
      `;

      const result = await db.query(query, [resumeId, userId]);
      return result.rows[0];
    } catch (err) {
      console.error('Database query error:', err);
      throw err;
    }
  }

  /**
   * Save export record
   */
  async function saveExport(resumeId, format, filePath) {
    try {
      const query = `
        INSERT INTO resume_exports (resume_id, export_format, file_path, created_at)
        VALUES ($1, $2, $3, NOW())
        RETURNING id;
      `;

      const result = await db.query(query, [resumeId, format, filePath]);
      return result.rows[0];
    } catch (err) {
      console.error('Export save error:', err);
      throw err;
    }
  }

  /**
   * Delete resume
   */
  async function deleteResume(resumeId, userId) {
    try {
      const query = `
        DELETE FROM resumes
        WHERE id = $1 AND user_id = $2
        RETURNING id;
      `;

      const result = await db.query(query, [resumeId, userId]);
      return result.rows[0];
    } catch (err) {
      console.error('Delete error:', err);
      throw err;
    }
  }

  return { saveResume, updateOptimizedResume, saveAnalysis, getUserResumes, getResume, saveExport, deleteResume };
}

module.exports = { createResumeDatabase };
