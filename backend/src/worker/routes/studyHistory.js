'use strict';

/**
 * Study history + spaced repetition routes. Worker port of backend/src/routes/studyHistory.js
 * (git HEAD 38d8130a). Mounted at /api/study-history. Every endpoint: authenticateToken + requirePlan(1).
 *
 * Errors are thrown (Express called next(err)), so they surface through onError: 5xx masked.
 * The one exception, as in the original: reviewCard's Error('Card not found') is mapped to
 * 404 {"error":"Card not found"}.
 *
 * Preserved on purpose (ADR 4.3): the SRS body destructuring is NOT guarded, so a request with no JSON
 * body is a TypeError -> masked 500 (not a 400). `limit`/`offset` are parseInt'd without further
 * validation, so a non-numeric value reaches the database as NaN and errors out (masked 500).
 */
const { createRouter } = require('../lib/routes');
const { authenticateToken } = require('../middleware/auth');
const { requirePlan } = require('../middleware/requirePlan');
const { getServices } = require('../lib/context');
const { getBody, getQuery } = require('../lib/http');

const router = createRouter();

// ── Study History ──────────────────────────────────────────────────────────

// GET /history — get study sessions (query: type, limit, offset)
router.get('/history', authenticateToken, requirePlan(1), async (c) => {
  const { studyHistoryService } = getServices(c);
  const { type, limit = 20, offset = 0 } = getQuery(c);
  const sessions = await studyHistoryService.getHistory(c.get('user').id, {
    sessionType: type || null,
    limit: parseInt(limit, 10),
    offset: parseInt(offset, 10),
  });
  return c.json({ sessions });
});

// GET /stats — get aggregated study stats
router.get('/stats', authenticateToken, requirePlan(1), async (c) => {
  const { studyHistoryService } = getServices(c);
  const stats = await studyHistoryService.getStats(c.get('user').id);
  return c.json({ stats });
});

// GET /weekly — get weekly summary
router.get('/weekly', authenticateToken, requirePlan(1), async (c) => {
  const { studyHistoryService } = getServices(c);
  const summary = await studyHistoryService.getWeeklySummary(c.get('user').id);
  return c.json({ summary });
});

// ── Spaced Repetition (SRS) ───────────────────────────────────────────────

// POST /srs/decks — save a flashcard deck for SRS
router.post('/srs/decks', authenticateToken, requirePlan(1), async (c) => {
  const { srsService } = getServices(c);
  const { deckId, cards } = getBody(c);
  if (!deckId || !Array.isArray(cards) || cards.length === 0) {
    return c.json({ error: 'deckId and a non-empty cards array are required' }, 400);
  }
  await srsService.saveDeck(c.get('user').id, deckId, cards);
  return c.json({ success: true, deckId, cardCount: cards.length });
});

// GET /srs/decks — get user's decks with stats
router.get('/srs/decks', authenticateToken, requirePlan(1), async (c) => {
  const { srsService } = getServices(c);
  const decks = await srsService.getDecks(c.get('user').id);
  return c.json({ decks });
});

// GET /srs/due — get cards due for review
router.get('/srs/due', authenticateToken, requirePlan(1), async (c) => {
  const { srsService } = getServices(c);
  const { deckId, limit = 20 } = getQuery(c);
  const cards = await srsService.getDueCards(c.get('user').id, deckId || null, parseInt(limit, 10));
  return c.json({ cards });
});

// POST /srs/review — review a card { cardId, quality: 0-5 }
router.post('/srs/review', authenticateToken, requirePlan(1), async (c) => {
  const { srsService } = getServices(c);
  const { cardId, quality } = getBody(c);
  if (cardId === undefined || quality === undefined) {
    return c.json({ error: 'cardId and quality (0-5) are required' }, 400);
  }
  try {
    const result = await srsService.reviewCard(c.get('user').id, cardId, quality);
    return c.json({ success: true, ...result });
  } catch (err) {
    if (err.message === 'Card not found') {
      return c.json({ error: 'Card not found' }, 404);
    }
    throw err;
  }
});

module.exports = router;
