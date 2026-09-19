'use strict';

/**
 * Worker port of backend/src/services/learningPathService.js (ported from git HEAD 38d8130a).
 *
 * Dependency injection only: `createLearningPathService({ db })` instead of a singleton bound to
 * a module-level pool. Method names, SQL text, signatures and return shapes are unchanged. Methods
 * are closures (the original used `this.touchStreak` / `this.getStreak`), so they are safe to
 * destructure.
 *
 * Preserved on purpose (do NOT "fix" during the port, ADR 4.3):
 *   - markComplete inserts into learning_topic_progress with a `completed` column; the streak
 *     upsert compares against the DATABASE's CURRENT_DATE (server clock, DATE type), not the
 *     runtime clock, exactly as the original comment describes.
 */

const TIER_ORDER = ['Beginner', 'Intermediate', 'Job_Tune'];

/**
 * @param {{ db: { query: Function } }} deps
 */
function createLearningPathService({ db }) {
  if (!db || typeof db.query !== 'function') throw new TypeError('createLearningPathService requires a db with query()');

  function validateTier(tier) {
    return TIER_ORDER.includes(tier);
  }

  async function listSubjects() {
    const result = await db.query(
      'SELECT DISTINCT subject FROM learning_topics ORDER BY subject'
    );
    return result.rows.map((row) => row.subject);
  }

  async function listTopics(userId, subject, tier) {
    const result = await db.query(
      `SELECT t.id, t.slug, t.title, t.topic_order,
              (p.id IS NOT NULL) AS completed, p.completed_at
       FROM learning_topics t
       LEFT JOIN learning_topic_progress p
         ON p.topic_id = t.id AND p.user_id = $1
       WHERE t.subject = $2 AND t.tier = $3
       ORDER BY t.topic_order`,
      [userId, subject, tier]
    );
    return result.rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      title: row.title,
      order: row.topic_order,
      completed: row.completed,
      completedAt: row.completed_at,
    }));
  }

  async function getTopic(userId, subject, tier, slug) {
    const result = await db.query(
      `SELECT t.id, t.slug, t.title, t.topic_order, t.content_md,
              (p.id IS NOT NULL) AS completed, p.completed_at
       FROM learning_topics t
       LEFT JOIN learning_topic_progress p
         ON p.topic_id = t.id AND p.user_id = $1
       WHERE t.subject = $2 AND t.tier = $3 AND t.slug = $4`,
      [userId, subject, tier, slug]
    );
    if (result.rows.length === 0) return null;
    const row = result.rows[0];
    return {
      id: row.id,
      slug: row.slug,
      title: row.title,
      order: row.topic_order,
      contentMd: row.content_md,
      completed: row.completed,
      completedAt: row.completed_at,
    };
  }

  async function getStreak(userId, subject) {
    const result = await db.query(
      'SELECT current_streak, longest_streak, last_active_date FROM learning_streaks WHERE user_id = $1 AND subject = $2',
      [userId, subject]
    );
    if (result.rows.length === 0) {
      return { currentStreak: 0, longestStreak: 0, lastActiveDate: null };
    }
    const row = result.rows[0];
    return {
      currentStreak: row.current_streak,
      longestStreak: row.longest_streak,
      lastActiveDate: row.last_active_date,
    };
  }

  // Increments the streak once per calendar day a topic is completed.
  // Same-day repeats are no-ops; a gap of more than one day resets to 1.
  // Day-gap comparisons run entirely in Postgres (server clock, DATE type)
  // so the result is immune to the runtime's local timezone — comparing
  // JS Date objects built from a DB DATE and from new Date() mixes UTC and
  // local-midnight semantics and silently breaks the streak in non-UTC deployments.
  async function touchStreak(userId, subject) {
    const result = await db.query(
      `INSERT INTO learning_streaks (user_id, subject, current_streak, longest_streak, last_active_date, updated_at)
       VALUES ($1, $2, 1, 1, CURRENT_DATE, CURRENT_TIMESTAMP)
       ON CONFLICT (user_id, subject) DO UPDATE SET
         current_streak = CASE
           WHEN learning_streaks.last_active_date = CURRENT_DATE THEN learning_streaks.current_streak
           WHEN learning_streaks.last_active_date = CURRENT_DATE - INTERVAL '1 day' THEN learning_streaks.current_streak + 1
           ELSE 1
         END,
         longest_streak = GREATEST(
           learning_streaks.longest_streak,
           CASE
             WHEN learning_streaks.last_active_date = CURRENT_DATE THEN learning_streaks.current_streak
             WHEN learning_streaks.last_active_date = CURRENT_DATE - INTERVAL '1 day' THEN learning_streaks.current_streak + 1
             ELSE 1
           END
         ),
         last_active_date = CURRENT_DATE,
         updated_at = CURRENT_TIMESTAMP
       RETURNING current_streak, longest_streak, last_active_date`,
      [userId, subject]
    );
    const row = result.rows[0];
    return {
      currentStreak: row.current_streak,
      longestStreak: row.longest_streak,
      lastActiveDate: row.last_active_date,
    };
  }

  async function markComplete(userId, subject, topicId) {
    await db.query(
      `INSERT INTO learning_topic_progress (user_id, topic_id, completed, completed_at)
       VALUES ($1, $2, true, CURRENT_TIMESTAMP)
       ON CONFLICT (user_id, topic_id)
       DO UPDATE SET completed = true, completed_at = CURRENT_TIMESTAMP`,
      [userId, topicId]
    );
    return touchStreak(userId, subject);
  }

  async function markIncomplete(userId, subject, topicId) {
    await db.query(
      'DELETE FROM learning_topic_progress WHERE user_id = $1 AND topic_id = $2',
      [userId, topicId]
    );
    return getStreak(userId, subject);
  }

  return {
    validateTier,
    listSubjects,
    listTopics,
    getTopic,
    markComplete,
    markIncomplete,
    getStreak,
    touchStreak,
  };
}

module.exports = { createLearningPathService };
