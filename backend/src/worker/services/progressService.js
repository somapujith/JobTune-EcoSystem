'use strict';

/**
 * ProgressService: Worker port (leaf1 slice) of backend/src/services/progressService.js.
 *
 * The Express module exported a singleton class instance; here it is a factory over the
 * request-scoped db, and every method is a closure (safe to destructure). Method names,
 * signatures, SQL and return shapes are unchanged. registry key: progressService.
 *
 * Preserved as-is: mergeProgress is a read-then-write (getProgress, then an upsert) with no
 * transaction, so two concurrent PATCHes for one user/context can lose an update.
 */

const ALLOWED_CONTEXTS = new Set([
  'zero-to-hero',
  'learn-and-build',
  'tune-and-polish',
  'preferences',
]);

/**
 * @param {{ db: { query: Function } }} deps
 */
function createProgressService({ db }) {
  function validateContext(contextKey) {
    return ALLOWED_CONTEXTS.has(contextKey);
  }

  async function getProgress(userId, contextKey) {
    const result = await db.query(
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

  async function getAllProgress(userId) {
    const result = await db.query(
      'SELECT context_key, progress_data, updated_at FROM user_progress WHERE user_id = $1 ORDER BY context_key',
      [userId]
    );
    return result.rows.map((row) => ({
      contextKey: row.context_key,
      data: row.progress_data || {},
      updatedAt: row.updated_at,
    }));
  }

  async function saveProgress(userId, contextKey, data) {
    const result = await db.query(
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

  async function mergeProgress(userId, contextKey, partial) {
    const current = await getProgress(userId, contextKey);
    const merged = { ...current.data, ...partial };
    return saveProgress(userId, contextKey, merged);
  }

  return { validateContext, getProgress, getAllProgress, saveProgress, mergeProgress };
}

module.exports = { createProgressService };
