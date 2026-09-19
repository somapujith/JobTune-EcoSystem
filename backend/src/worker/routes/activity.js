'use strict';

/**
 * Activity routes. Worker port of backend/src/routes/activity.js (git HEAD 38d8130a).
 * Mounted at /api/activity. Every endpoint: authenticateToken only (no plan gate).
 *
 * POST /track, GET /heatmap, GET /weekly, GET /stats, GET /achievements, POST /check-achievements
 *
 * Preserved on purpose (ADR 4.3): the body is destructured inside the try block, so a missing
 * JSON body is a caught TypeError -> the route's own 500 {"error":"Failed to track activity"}.
 * heatmap parses `months` with parseInt and no radix, like the original.
 */
const { createRouter } = require('../lib/routes');
const { authenticateToken } = require('../middleware/auth');
const { getServices } = require('../lib/context');
const { getBody, getQuery } = require('../lib/http');

const router = createRouter();

// POST /api/activity/track
router.post('/track', authenticateToken, async (c) => {
  try {
    const { toolName, activityType, metadata } = getBody(c);

    if (!toolName || typeof toolName !== 'string') {
      return c.json({ error: 'toolName is required and must be a string' }, 400);
    }
    if (!activityType || typeof activityType !== 'string') {
      return c.json({ error: 'activityType is required and must be a string' }, 400);
    }

    await getServices(c).activityService.trackActivity(c.get('user').id, toolName, activityType, metadata || {});
    return c.json({ success: true });
  } catch (err) {
    console.error('Activity track error:', err.message);
    return c.json({ error: 'Failed to track activity' }, 500);
  }
});

// GET /api/activity/heatmap
router.get('/heatmap', authenticateToken, async (c) => {
  try {
    let months = parseInt(getQuery(c).months) || 12;
    if (months < 1) months = 1;
    if (months > 24) months = 24;

    const data = await getServices(c).activityService.getHeatmapData(c.get('user').id, months);
    return c.json({ data });
  } catch (err) {
    console.error('Heatmap error:', err.message);
    return c.json({ error: 'Failed to fetch heatmap data' }, 500);
  }
});

// GET /api/activity/weekly
router.get('/weekly', authenticateToken, async (c) => {
  try {
    const data = await getServices(c).activityService.getWeeklyActivity(c.get('user').id);
    return c.json({ data });
  } catch (err) {
    console.error('Weekly activity error:', err.message);
    return c.json({ error: 'Failed to fetch weekly activity' }, 500);
  }
});

// GET /api/activity/stats
router.get('/stats', authenticateToken, async (c) => {
  try {
    const data = await getServices(c).activityService.getStats(c.get('user').id);
    return c.json({ data });
  } catch (err) {
    console.error('Stats error:', err.message);
    return c.json({ error: 'Failed to fetch stats' }, 500);
  }
});

// GET /api/activity/achievements
router.get('/achievements', authenticateToken, async (c) => {
  try {
    const data = await getServices(c).activityService.getAchievements(c.get('user').id);
    return c.json({ data });
  } catch (err) {
    console.error('Achievements error:', err.message);
    return c.json({ error: 'Failed to fetch achievements' }, 500);
  }
});

// POST /api/activity/check-achievements
router.post('/check-achievements', authenticateToken, async (c) => {
  try {
    const newlyUnlocked = await getServices(c).activityService.checkAndUnlockAchievements(c.get('user').id);
    return c.json({ data: { newlyUnlocked } });
  } catch (err) {
    console.error('Check achievements error:', err.message);
    return c.json({ error: 'Failed to check achievements' }, 500);
  }
});

module.exports = router;
