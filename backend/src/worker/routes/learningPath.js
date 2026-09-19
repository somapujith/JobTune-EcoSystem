'use strict';

/**
 * Learning path routes. Worker port of backend/src/routes/learningPath.js (git HEAD 38d8130a).
 * Mounted at /api/learning-path. Every endpoint: authenticateToken only (no plan gate).
 *
 * Route ORDER matters and is preserved (a static two-segment path is registered before the
 * generic /:subject/:tier): GET /:subject/streak must be reached before GET /:subject/:tier.
 * Errors are thrown (Express called next(err)), so they surface through onError: 5xx masked.
 *
 * GET    /subjects
 * GET    /:subject/streak
 * GET    /:subject/:tier
 * GET    /:subject/:tier/:slug
 * POST   /:subject/:tier/:slug/complete
 * DELETE /:subject/:tier/:slug/complete
 */
const { createRouter } = require('../lib/routes');
const { authenticateToken } = require('../middleware/auth');
const { getServices } = require('../lib/context');

const router = createRouter();

router.get('/subjects', authenticateToken, async (c) => {
  const { learningPathService } = getServices(c);
  const subjects = await learningPathService.listSubjects();
  return c.json({ subjects });
});

router.get('/:subject/streak', authenticateToken, async (c) => {
  const { learningPathService } = getServices(c);
  const subject = c.req.param('subject');
  const streak = await learningPathService.getStreak(c.get('user').id, subject);
  return c.json(streak);
});

router.get('/:subject/:tier', authenticateToken, async (c) => {
  const { learningPathService } = getServices(c);
  const subject = c.req.param('subject');
  const tier = c.req.param('tier');
  if (!learningPathService.validateTier(tier)) {
    return c.json({ error: 'Invalid tier' }, 400);
  }
  const topics = await learningPathService.listTopics(c.get('user').id, subject, tier);
  return c.json({ topics });
});

router.get('/:subject/:tier/:slug', authenticateToken, async (c) => {
  const { learningPathService } = getServices(c);
  const subject = c.req.param('subject');
  const tier = c.req.param('tier');
  const slug = c.req.param('slug');
  if (!learningPathService.validateTier(tier)) {
    return c.json({ error: 'Invalid tier' }, 400);
  }
  const topic = await learningPathService.getTopic(c.get('user').id, subject, tier, slug);
  if (!topic) {
    return c.json({ error: 'Topic not found' }, 404);
  }
  return c.json(topic);
});

router.post('/:subject/:tier/:slug/complete', authenticateToken, async (c) => {
  const { learningPathService } = getServices(c);
  const subject = c.req.param('subject');
  const tier = c.req.param('tier');
  const slug = c.req.param('slug');
  const userId = c.get('user').id;
  if (!learningPathService.validateTier(tier)) {
    return c.json({ error: 'Invalid tier' }, 400);
  }
  const topic = await learningPathService.getTopic(userId, subject, tier, slug);
  if (!topic) {
    return c.json({ error: 'Topic not found' }, 404);
  }
  const streak = await learningPathService.markComplete(userId, subject, topic.id);
  return c.json({ completed: true, streak });
});

router.delete('/:subject/:tier/:slug/complete', authenticateToken, async (c) => {
  const { learningPathService } = getServices(c);
  const subject = c.req.param('subject');
  const tier = c.req.param('tier');
  const slug = c.req.param('slug');
  const userId = c.get('user').id;
  if (!learningPathService.validateTier(tier)) {
    return c.json({ error: 'Invalid tier' }, 400);
  }
  const topic = await learningPathService.getTopic(userId, subject, tier, slug);
  if (!topic) {
    return c.json({ error: 'Topic not found' }, 404);
  }
  const streak = await learningPathService.markIncomplete(userId, subject, topic.id);
  return c.json({ completed: false, streak });
});

module.exports = router;
