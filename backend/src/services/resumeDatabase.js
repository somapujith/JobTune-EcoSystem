const { pool } = require('../config/database');

class ResumeDatabase {
  /**
   * Save resume analysis to database
   */
  static async saveResume(userId, originalResume, analysis) {
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
        JSON.stringify(analysis.missingInfo || {})
      ];

      const result = await pool.query(query, values);
      return result.rows[0];
    } catch (err) {
      console.error('Database save error:', err);
      throw err;
    }
  }

  /**
   * Save optimized resume
   */
  static async updateOptimizedResume(resumeId, optimizedResume, optimizedScore, analysis) {
    try {
      const query = `
        UPDATE resumes
        SET optimized_resume = $1, optimized_score = $2, updated_at = NOW()
        WHERE id = $3
        RETURNING id;
      `;

      const values = [optimizedResume, optimizedScore, resumeId];
      const result = await pool.query(query, values);

      // Save detailed analysis
      if (analysis) {
        await this.saveAnalysis(resumeId, analysis);
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
  static async saveAnalysis(resumeId, analysis) {
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
        JSON.stringify(analysis.recommendations || [])
      ];

      const result = await pool.query(query, values);
      return result.rows[0];
    } catch (err) {
      console.error('Analysis save error:', err);
      throw err;
    }
  }

  /**
   * Get user's resume history
   */
  static async getUserResumes(userId, limit = 10) {
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

      const result = await pool.query(query, [userId, limit]);
      return result.rows;
    } catch (err) {
      console.error('Database query error:', err);
      throw err;
    }
  }

  /**
   * Get resume by ID
   */
  static async getResume(resumeId, userId) {
    try {
      const query = `
        SELECT *
        FROM resumes
        WHERE id = $1 AND user_id = $2;
      `;

      const result = await pool.query(query, [resumeId, userId]);
      return result.rows[0];
    } catch (err) {
      console.error('Database query error:', err);
      throw err;
    }
  }

  /**
   * Save export record
   */
  static async saveExport(resumeId, format, filePath) {
    try {
      const query = `
        INSERT INTO resume_exports (resume_id, export_format, file_path, created_at)
        VALUES ($1, $2, $3, NOW())
        RETURNING id;
      `;

      const result = await pool.query(query, [resumeId, format, filePath]);
      return result.rows[0];
    } catch (err) {
      console.error('Export save error:', err);
      throw err;
    }
  }

  /**
   * Delete resume
   */
  static async deleteResume(resumeId, userId) {
    try {
      const query = `
        DELETE FROM resumes
        WHERE id = $1 AND user_id = $2
        RETURNING id;
      `;

      const result = await pool.query(query, [resumeId, userId]);
      return result.rows[0];
    } catch (err) {
      console.error('Delete error:', err);
      throw err;
    }
  }
}

module.exports = ResumeDatabase;
