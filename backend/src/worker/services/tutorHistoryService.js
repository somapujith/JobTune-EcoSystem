'use strict';

/**
 * Worker port of backend/src/services/tutorHistoryService.js (HEAD).
 *
 * The Express module exported a `new TutorHistoryService()` singleton bound to the shared
 * pool. Here it is a factory over the request-scoped db (registry key `tutorHistoryService`):
 *
 *   const { tutorHistoryService } = getServices(c);
 *
 * Public API, SQL text, parameters and return shapes are identical to the original. Methods
 * are closures (safe to destructure). No module-scope state, no ambient globals.
 *
 * Preserved quirks (not fixed on purpose, ADR 4.3):
 *   - updateConversation(id, userId, undefined) sends JSON.stringify(undefined) === undefined as
 *     the messages parameter (the driver turns that into NULL), exactly like Express + pg.
 *   - ids are passed to Postgres as given; a non-numeric id makes the query fail (surfaces as the
 *     masked 500 through the route's error path).
 */
function createTutorHistoryService({ db }) {
  if (!db || typeof db.query !== 'function') {
    throw new TypeError('createTutorHistoryService: db with a query() method is required');
  }

  async function saveConversation(userId, topic, title, messages) {
    const result = await db.query(
      `INSERT INTO tutor_conversations (user_id, topic, title, messages)
       VALUES ($1, $2, $3, $4) RETURNING id, created_at`,
      [userId, topic, title || topic, JSON.stringify(messages)]
    );
    return result.rows[0];
  }

  async function updateConversation(conversationId, userId, messages) {
    await db.query(
      `UPDATE tutor_conversations SET messages = $1, updated_at = NOW()
       WHERE id = $2 AND user_id = $3`,
      [JSON.stringify(messages), conversationId, userId]
    );
  }

  async function getConversations(userId, limit = 20) {
    const result = await db.query(
      `SELECT id, topic, title, created_at, updated_at,
        jsonb_array_length(messages) as message_count
       FROM tutor_conversations WHERE user_id = $1
       ORDER BY updated_at DESC LIMIT $2`,
      [userId, limit]
    );
    return result.rows;
  }

  async function getConversation(conversationId, userId) {
    const result = await db.query(
      'SELECT * FROM tutor_conversations WHERE id = $1 AND user_id = $2',
      [conversationId, userId]
    );
    return result.rows[0] || null;
  }

  async function deleteConversation(conversationId, userId) {
    await db.query('DELETE FROM tutor_conversations WHERE id = $1 AND user_id = $2', [conversationId, userId]);
  }

  return { saveConversation, updateConversation, getConversations, getConversation, deleteConversation };
}

module.exports = { createTutorHistoryService };
