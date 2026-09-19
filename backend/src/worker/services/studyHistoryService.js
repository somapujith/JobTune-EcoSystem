'use strict';

/**
 * Worker port of backend/src/services/studyHistoryService.js (ported from git HEAD 38d8130a).
 *
 * Dependency injection only: `createStudyHistoryService({ db })` instead of a singleton bound to a
 * module-level pool. The exported API is IDENTICAL to the original singleton's instance API
 * (saveSession, getHistory, getStats, getWeeklySummary): the mid2 slice (routes/studyTools) consumes
 * it as `getServices(c).studyHistoryService.saveSession(userId, {...})`.
 */

/**
 * @param {{ db: { query: Function } }} deps
 */
function createStudyHistoryService({ db }) {
  if (!db || typeof db.query !== 'function') throw new TypeError('createStudyHistoryService requires a db with query()');

  // Save a completed study session (quiz, notes, flashcards)
  async function saveSession(userId, { sessionType, topic, difficulty, score, totalQuestions, timeSpentSeconds, data }) {
    const result = await db.query(
      `INSERT INTO study_sessions (user_id, session_type, topic, difficulty, score, total_questions, time_spent_seconds, data)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id, created_at`,
      [userId, sessionType, topic, difficulty || null, score || null, totalQuestions || null, timeSpentSeconds || null, JSON.stringify(data || {})]
    );
    return result.rows[0];
  }

  // Get study history for a user, optionally filtered by type
  async function getHistory(userId, { sessionType, limit = 20, offset = 0 }) {
    let query = 'SELECT id, session_type, topic, difficulty, score, total_questions, time_spent_seconds, created_at FROM study_sessions WHERE user_id = $1';
    const params = [userId];
    if (sessionType) {
      params.push(sessionType);
      query += ` AND session_type = $${params.length}`;
    }
    query += ' ORDER BY created_at DESC LIMIT $' + (params.length + 1) + ' OFFSET $' + (params.length + 2);
    params.push(limit, offset);
    const result = await db.query(query, params);
    return result.rows;
  }

  // Get study stats for a user
  async function getStats(userId) {
    const result = await db.query(`
      SELECT
        session_type,
        COUNT(*) as total_sessions,
        AVG(score) as avg_score,
        SUM(time_spent_seconds) as total_time_seconds,
        MAX(created_at) as last_session
      FROM study_sessions
      WHERE user_id = $1
      GROUP BY session_type
    `, [userId]);
    return result.rows;
  }

  // Get weekly study summary
  async function getWeeklySummary(userId) {
    const result = await db.query(`
      SELECT
        DATE(created_at) as study_date,
        COUNT(*) as sessions,
        SUM(time_spent_seconds) as total_seconds,
        AVG(score) as avg_score
      FROM study_sessions
      WHERE user_id = $1 AND created_at >= NOW() - INTERVAL '7 days'
      GROUP BY DATE(created_at)
      ORDER BY study_date
    `, [userId]);
    return result.rows;
  }

  return { saveSession, getHistory, getStats, getWeeklySummary };
}

module.exports = { createStudyHistoryService };
