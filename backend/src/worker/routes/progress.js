'use strict';

/**
 * /api/progress: Worker port (leaf1 slice) of backend/src/routes/progress.js.
 *
 *   GET   /              authenticateToken
 *   GET   /:contextKey   authenticateToken
 *   PUT   /:contextKey   authenticateToken
 *   PATCH /:contextKey   authenticateToken
 *
 * No plan gate in Express, none here. The Express handlers forwarded every error with next(err);
 * here the error is simply thrown out of the handler and the app-level onError renders it
 * (5xx masked as "Internal Server Error"), which is the same path next(err) took.
 * Preserved: a missing JSON body on PUT/PATCH (after the context check) is a TypeError -> masked 500.
 */
const { createRouter } = require('../lib/routes');
const { authenticateToken } = require('../middleware/auth');
const { getServices } = require('../lib/context');
const { getBody } = require('../lib/http');

const router = createRouter();

router.get('/', authenticateToken, async (c) => {
  const { progressService } = getServices(c);
  const items = await progressService.getAllProgress(c.get('user').id);
  return c.json({ progress: items });
});

router.get('/:contextKey', authenticateToken, async (c) => {
  const { progressService } = getServices(c);
  const contextKey = c.req.param('contextKey');
  if (!progressService.validateContext(contextKey)) {
    return c.json({ error: 'Invalid progress context' }, 400);
  }
  const result = await progressService.getProgress(c.get('user').id, contextKey);
  return c.json(result);
});

router.put('/:contextKey', authenticateToken, async (c) => {
  const { progressService } = getServices(c);
  const contextKey = c.req.param('contextKey');
  if (!progressService.validateContext(contextKey)) {
    return c.json({ error: 'Invalid progress context' }, 400);
  }
  const { data } = getBody(c);
  if (data === undefined || typeof data !== 'object' || Array.isArray(data)) {
    return c.json({ error: 'Progress data must be an object' }, 400);
  }
  const result = await progressService.saveProgress(c.get('user').id, contextKey, data);
  return c.json(result);
});

router.patch('/:contextKey', authenticateToken, async (c) => {
  const { progressService } = getServices(c);
  const contextKey = c.req.param('contextKey');
  if (!progressService.validateContext(contextKey)) {
    return c.json({ error: 'Invalid progress context' }, 400);
  }
  const { data } = getBody(c);
  if (data === undefined || typeof data !== 'object' || Array.isArray(data)) {
    return c.json({ error: 'Progress data must be an object' }, 400);
  }
  const result = await progressService.mergeProgress(c.get('user').id, contextKey, data);
  return c.json(result);
});

module.exports = router;
