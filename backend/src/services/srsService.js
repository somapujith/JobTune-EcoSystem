const { pool } = require('../config/database');

class SRSService {
  // Save a deck of flashcards for spaced repetition
  async saveDeck(userId, deckId, cards) {
    // cards: [{front, back, difficulty}]
    const values = cards.map((card, i) => {
      const offset = i * 5;
      return `($${offset+1}, $${offset+2}, $${offset+3}, $${offset+4}, $${offset+5})`;
    }).join(', ');

    const params = [];
    cards.forEach(card => {
      params.push(userId, deckId, card.front, card.back, card.difficulty || 'medium');
    });

    // Use ON CONFLICT to upsert
    await pool.query(`
      INSERT INTO srs_cards (user_id, deck_id, front, back, difficulty)
      VALUES ${values}
      ON CONFLICT (user_id, deck_id, front) DO UPDATE SET
        back = EXCLUDED.back,
        difficulty = EXCLUDED.difficulty
    `, params);
  }

  // Get cards due for review today
  async getDueCards(userId, deckId = null, limit = 20) {
    let query = `SELECT id, deck_id, front, back, difficulty, ease_factor, interval_days, repetitions, next_review
      FROM srs_cards WHERE user_id = $1 AND next_review <= CURRENT_DATE`;
    const params = [userId];
    if (deckId) {
      params.push(deckId);
      query += ` AND deck_id = $${params.length}`;
    }
    query += ` ORDER BY next_review ASC LIMIT $${params.length + 1}`;
    params.push(limit);
    return (await pool.query(query, params)).rows;
  }

  // Review a card using SM-2 algorithm
  // quality: 0-5 (0=complete blackout, 3=correct with difficulty, 5=perfect)
  async reviewCard(userId, cardId, quality) {
    const card = (await pool.query('SELECT * FROM srs_cards WHERE id = $1 AND user_id = $2', [cardId, userId])).rows[0];
    if (!card) throw new Error('Card not found');

    let { ease_factor, interval_days, repetitions } = card;
    const q = Math.max(0, Math.min(5, quality));

    if (q < 3) {
      // Failed: reset
      repetitions = 0;
      interval_days = 0;
    } else {
      // SM-2 algorithm
      if (repetitions === 0) {
        interval_days = 1;
      } else if (repetitions === 1) {
        interval_days = 6;
      } else {
        interval_days = Math.round(interval_days * ease_factor);
      }
      repetitions += 1;
    }

    ease_factor = Math.max(1.3, ease_factor + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)));

    const nextReview = new Date();
    nextReview.setDate(nextReview.getDate() + interval_days);

    await pool.query(`
      UPDATE srs_cards SET
        ease_factor = $1, interval_days = $2, repetitions = $3,
        next_review = $4, last_reviewed = NOW()
      WHERE id = $5 AND user_id = $6
    `, [ease_factor, interval_days, repetitions, nextReview.toISOString().split('T')[0], cardId, userId]);

    return { ease_factor, interval_days, repetitions, next_review: nextReview.toISOString().split('T')[0] };
  }

  // Get user's decks with review stats
  async getDecks(userId) {
    const result = await pool.query(`
      SELECT
        deck_id,
        COUNT(*) as total_cards,
        COUNT(*) FILTER (WHERE next_review <= CURRENT_DATE) as due_count,
        COUNT(*) FILTER (WHERE repetitions > 0) as reviewed_count,
        AVG(ease_factor) as avg_ease,
        MIN(created_at) as created_at
      FROM srs_cards
      WHERE user_id = $1
      GROUP BY deck_id
      ORDER BY MIN(created_at) DESC
    `, [userId]);
    return result.rows;
  }
}

module.exports = new SRSService();
