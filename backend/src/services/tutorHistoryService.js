const { pool } = require('../config/database');

class TutorHistoryService {
  async saveConversation(userId, topic, title, messages) {
    const result = await pool.query(
      `INSERT INTO tutor_conversations (user_id, topic, title, messages)
       VALUES ($1, $2, $3, $4) RETURNING id, created_at`,
      [userId, topic, title || topic, JSON.stringify(messages)]
    );
    return result.rows[0];
  }

  async updateConversation(conversationId, userId, messages) {
    await pool.query(
      `UPDATE tutor_conversations SET messages = $1, updated_at = NOW()
       WHERE id = $2 AND user_id = $3`,
      [JSON.stringify(messages), conversationId, userId]
    );
  }

  async getConversations(userId, limit = 20) {
    const result = await pool.query(
      `SELECT id, topic, title, created_at, updated_at,
        jsonb_array_length(messages) as message_count
       FROM tutor_conversations WHERE user_id = $1
       ORDER BY updated_at DESC LIMIT $2`,
      [userId, limit]
    );
    return result.rows;
  }

  async getConversation(conversationId, userId) {
    const result = await pool.query(
      'SELECT * FROM tutor_conversations WHERE id = $1 AND user_id = $2',
      [conversationId, userId]
    );
    return result.rows[0] || null;
  }

  async deleteConversation(conversationId, userId) {
    await pool.query('DELETE FROM tutor_conversations WHERE id = $1 AND user_id = $2', [conversationId, userId]);
  }
}

module.exports = new TutorHistoryService();
