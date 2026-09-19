const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const learningPathService = require('../services/learningPathService');

router.get('/subjects', authenticateToken, async (req, res, next) => {
  try {
    const subjects = await learningPathService.listSubjects();
    res.json({ subjects });
  } catch (err) {
    next(err);
  }
});

router.get('/:subject/streak', authenticateToken, async (req, res, next) => {
  try {
    const { subject } = req.params;
    const streak = await learningPathService.getStreak(req.user.id, subject);
    res.json(streak);
  } catch (err) {
    next(err);
  }
});

router.get('/:subject/:tier', authenticateToken, async (req, res, next) => {
  try {
    const { subject, tier } = req.params;
    if (!learningPathService.validateTier(tier)) {
      return res.status(400).json({ error: 'Invalid tier' });
    }
    const topics = await learningPathService.listTopics(req.user.id, subject, tier);
    res.json({ topics });
  } catch (err) {
    next(err);
  }
});

router.get('/:subject/:tier/:slug', authenticateToken, async (req, res, next) => {
  try {
    const { subject, tier, slug } = req.params;
    if (!learningPathService.validateTier(tier)) {
      return res.status(400).json({ error: 'Invalid tier' });
    }
    const topic = await learningPathService.getTopic(req.user.id, subject, tier, slug);
    if (!topic) {
      return res.status(404).json({ error: 'Topic not found' });
    }
    res.json(topic);
  } catch (err) {
    next(err);
  }
});

router.post('/:subject/:tier/:slug/complete', authenticateToken, async (req, res, next) => {
  try {
    const { subject, tier, slug } = req.params;
    if (!learningPathService.validateTier(tier)) {
      return res.status(400).json({ error: 'Invalid tier' });
    }
    const topic = await learningPathService.getTopic(req.user.id, subject, tier, slug);
    if (!topic) {
      return res.status(404).json({ error: 'Topic not found' });
    }
    const streak = await learningPathService.markComplete(req.user.id, subject, topic.id);
    res.json({ completed: true, streak });
  } catch (err) {
    next(err);
  }
});

router.delete('/:subject/:tier/:slug/complete', authenticateToken, async (req, res, next) => {
  try {
    const { subject, tier, slug } = req.params;
    if (!learningPathService.validateTier(tier)) {
      return res.status(400).json({ error: 'Invalid tier' });
    }
    const topic = await learningPathService.getTopic(req.user.id, subject, tier, slug);
    if (!topic) {
      return res.status(404).json({ error: 'Topic not found' });
    }
    const streak = await learningPathService.markIncomplete(req.user.id, subject, topic.id);
    res.json({ completed: false, streak });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
