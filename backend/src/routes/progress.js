const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const progressService = require('../services/progressService');

router.get('/', authenticateToken, async (req, res, next) => {
  try {
    const items = await progressService.getAllProgress(req.user.id);
    res.json({ progress: items });
  } catch (err) {
    next(err);
  }
});

router.get('/:contextKey', authenticateToken, async (req, res, next) => {
  try {
    const { contextKey } = req.params;
    if (!progressService.validateContext(contextKey)) {
      return res.status(400).json({ error: 'Invalid progress context' });
    }
    const result = await progressService.getProgress(req.user.id, contextKey);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.put('/:contextKey', authenticateToken, async (req, res, next) => {
  try {
    const { contextKey } = req.params;
    if (!progressService.validateContext(contextKey)) {
      return res.status(400).json({ error: 'Invalid progress context' });
    }
    const { data } = req.body;
    if (data === undefined || typeof data !== 'object' || Array.isArray(data)) {
      return res.status(400).json({ error: 'Progress data must be an object' });
    }
    const result = await progressService.saveProgress(req.user.id, contextKey, data);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.patch('/:contextKey', authenticateToken, async (req, res, next) => {
  try {
    const { contextKey } = req.params;
    if (!progressService.validateContext(contextKey)) {
      return res.status(400).json({ error: 'Invalid progress context' });
    }
    const { data } = req.body;
    if (data === undefined || typeof data !== 'object' || Array.isArray(data)) {
      return res.status(400).json({ error: 'Progress data must be an object' });
    }
    const result = await progressService.mergeProgress(req.user.id, contextKey, data);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
