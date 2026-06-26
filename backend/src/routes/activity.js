const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const activityService = require('../services/activityService');

// POST /api/activity/track
router.post('/track', authenticateToken, async (req, res) => {
  try {
    const { toolName, activityType, metadata } = req.body;

    if (!toolName || typeof toolName !== 'string') {
      return res.status(400).json({ error: 'toolName is required and must be a string' });
    }
    if (!activityType || typeof activityType !== 'string') {
      return res.status(400).json({ error: 'activityType is required and must be a string' });
    }

    await activityService.trackActivity(req.user.id, toolName, activityType, metadata || {});
    res.json({ success: true });
  } catch (err) {
    console.error('Activity track error:', err.message);
    res.status(500).json({ error: 'Failed to track activity' });
  }
});

// GET /api/activity/heatmap
router.get('/heatmap', authenticateToken, async (req, res) => {
  try {
    let months = parseInt(req.query.months) || 12;
    if (months < 1) months = 1;
    if (months > 24) months = 24;

    const data = await activityService.getHeatmapData(req.user.id, months);
    res.json({ data });
  } catch (err) {
    console.error('Heatmap error:', err.message);
    res.status(500).json({ error: 'Failed to fetch heatmap data' });
  }
});

// GET /api/activity/weekly
router.get('/weekly', authenticateToken, async (req, res) => {
  try {
    const data = await activityService.getWeeklyActivity(req.user.id);
    res.json({ data });
  } catch (err) {
    console.error('Weekly activity error:', err.message);
    res.status(500).json({ error: 'Failed to fetch weekly activity' });
  }
});

// GET /api/activity/stats
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    const data = await activityService.getStats(req.user.id);
    res.json({ data });
  } catch (err) {
    console.error('Stats error:', err.message);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// GET /api/activity/achievements
router.get('/achievements', authenticateToken, async (req, res) => {
  try {
    const data = await activityService.getAchievements(req.user.id);
    res.json({ data });
  } catch (err) {
    console.error('Achievements error:', err.message);
    res.status(500).json({ error: 'Failed to fetch achievements' });
  }
});

// POST /api/activity/check-achievements
router.post('/check-achievements', authenticateToken, async (req, res) => {
  try {
    const newlyUnlocked = await activityService.checkAndUnlockAchievements(req.user.id);
    res.json({ data: { newlyUnlocked } });
  } catch (err) {
    console.error('Check achievements error:', err.message);
    res.status(500).json({ error: 'Failed to check achievements' });
  }
});

module.exports = router;
