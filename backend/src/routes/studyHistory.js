const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { requirePlan } = require('../middleware/requirePlan');
const studyHistoryService = require('../services/studyHistoryService');
const srsService = require('../services/srsService');

// ── Study History ──────────────────────────────────────────────────────────

// GET /history — get study sessions (query: type, limit, offset)
router.get('/history', authenticateToken, requirePlan(1), async (req, res, next) => {
  try {
    const { type, limit = 20, offset = 0 } = req.query;
    const sessions = await studyHistoryService.getHistory(req.user.id, {
      sessionType: type || null,
      limit: parseInt(limit, 10),
      offset: parseInt(offset, 10),
    });
    res.json({ sessions });
  } catch (err) {
    next(err);
  }
});

// GET /stats — get aggregated study stats
router.get('/stats', authenticateToken, requirePlan(1), async (req, res, next) => {
  try {
    const stats = await studyHistoryService.getStats(req.user.id);
    res.json({ stats });
  } catch (err) {
    next(err);
  }
});

// GET /weekly — get weekly summary
router.get('/weekly', authenticateToken, requirePlan(1), async (req, res, next) => {
  try {
    const summary = await studyHistoryService.getWeeklySummary(req.user.id);
    res.json({ summary });
  } catch (err) {
    next(err);
  }
});

// ── Spaced Repetition (SRS) ───────────────────────────────────────────────

// POST /srs/decks — save a flashcard deck for SRS
router.post('/srs/decks', authenticateToken, requirePlan(1), async (req, res, next) => {
  try {
    const { deckId, cards } = req.body;
    if (!deckId || !Array.isArray(cards) || cards.length === 0) {
      return res.status(400).json({ error: 'deckId and a non-empty cards array are required' });
    }
    await srsService.saveDeck(req.user.id, deckId, cards);
    res.json({ success: true, deckId, cardCount: cards.length });
  } catch (err) {
    next(err);
  }
});

// GET /srs/decks — get user's decks with stats
router.get('/srs/decks', authenticateToken, requirePlan(1), async (req, res, next) => {
  try {
    const decks = await srsService.getDecks(req.user.id);
    res.json({ decks });
  } catch (err) {
    next(err);
  }
});

// GET /srs/due — get cards due for review
router.get('/srs/due', authenticateToken, requirePlan(1), async (req, res, next) => {
  try {
    const { deckId, limit = 20 } = req.query;
    const cards = await srsService.getDueCards(req.user.id, deckId || null, parseInt(limit, 10));
    res.json({ cards });
  } catch (err) {
    next(err);
  }
});

// POST /srs/review — review a card { cardId, quality: 0-5 }
router.post('/srs/review', authenticateToken, requirePlan(1), async (req, res, next) => {
  try {
    const { cardId, quality } = req.body;
    if (cardId === undefined || quality === undefined) {
      return res.status(400).json({ error: 'cardId and quality (0-5) are required' });
    }
    const result = await srsService.reviewCard(req.user.id, cardId, quality);
    res.json({ success: true, ...result });
  } catch (err) {
    if (err.message === 'Card not found') {
      return res.status(404).json({ error: 'Card not found' });
    }
    next(err);
  }
});

module.exports = router;
