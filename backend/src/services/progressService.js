const { pool } = require('../config/database');

const ALLOWED_CONTEXTS = new Set([
  'zero-to-hero',
  'learn-and-build',
  'tune-and-polish',
  'preferences',
]);

class ProgressService {
  validateContext(contextKey) {
    return ALLOWED_CONTEXTS.has(contextKey);
  }

  async getProgress(userId, contextKey) {
    const result = await pool.query(
      'SELECT progress_data, updated_at FROM user_progress WHERE user_id = $1 AND context_key = $2',
      [userId, contextKey]
    );
    if (result.rows.length === 0) {
      return { data: {}, updatedAt: null };
    }
    return {
      data: result.rows[0].progress_data || {},
      updatedAt: result.rows[0].updated_at,
    };
  }

  async getAllProgress(userId) {
    const result = await pool.query(
      'SELECT context_key, progress_data, updated_at FROM user_progress WHERE user_id = $1 ORDER BY context_key',
      [userId]
    );
    return result.rows.map((row) => ({
      contextKey: row.context_key,
      data: row.progress_data || {},
      updatedAt: row.updated_at,
    }));
  }

  async saveProgress(userId, contextKey, data) {
    const result = await pool.query(
      `INSERT INTO user_progress (user_id, context_key, progress_data, updated_at)
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
       ON CONFLICT (user_id, context_key)
       DO UPDATE SET progress_data = $3, updated_at = CURRENT_TIMESTAMP
       RETURNING progress_data, updated_at`,
      [userId, contextKey, JSON.stringify(data || {})]
    );
    return {
      data: result.rows[0].progress_data,
      updatedAt: result.rows[0].updated_at,
    };
  }

  async mergeProgress(userId, contextKey, partial) {
    const current = await this.getProgress(userId, contextKey);
    const merged = { ...current.data, ...partial };
    return this.saveProgress(userId, contextKey, merged);
  }
}

module.exports = new ProgressService();
