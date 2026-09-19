'use strict';

/**
 * /api/guides: Worker port (leaf1 slice) of backend/src/routes/guides.js.
 *
 *   POST /generate   authenticateToken
 *   GET  /:id        authenticateToken
 *
 * Neither endpoint is plan-gated in Express, so neither is here. Error mapping is unchanged:
 * a service error whose message contains "not found" (case-insensitive) is a 404 with that
 * message, anything else a 500 with a generic error plus `detail` (the raw message, as Express did).
 * As in Express, the JSON body is destructured without a fallback in POST /generate, so a request
 * with no JSON body throws a TypeError and surfaces as the masked 500 from the error handler.
 */
const { createRouter } = require('../lib/routes');
const { authenticateToken } = require('../middleware/auth');
const { getServices } = require('../lib/context');
const { getBody } = require('../lib/http');

const router = createRouter();

// POST /api/guides/generate
router.post('/generate', authenticateToken, async (c) => {
  const { applicationId, jobDescription, role } = getBody(c);

  if (!applicationId && !jobDescription) {
    return c.json({ error: 'applicationId or jobDescription is required' }, 400);
  }

  const { jobGuideGenerator } = getServices(c);
  try {
    const guide = await jobGuideGenerator.generateJobGuide({
      applicationId: applicationId ? Number(applicationId) : undefined,
      jobDescription,
      role,
      userId: c.get('user').id
    });

    return c.json(guide, 200);
  } catch (err) {
    if (err.message && err.message.toLowerCase().includes('not found')) {
      return c.json({ error: err.message }, 404);
    }
    return c.json({ error: 'Failed to generate guide', detail: err.message }, 500);
  }
});

// GET /api/guides/:id
router.get('/:id', authenticateToken, async (c) => {
  const id = Number(c.req.param('id'));

  if (!Number.isInteger(id) || id <= 0) {
    return c.json({ error: 'id must be a positive integer' }, 400);
  }

  const { jobGuideGenerator } = getServices(c);
  try {
    const guide = await jobGuideGenerator.getJobGuide({ id, userId: c.get('user').id });
    return c.json(guide, 200);
  } catch (err) {
    if (err.message && err.message.toLowerCase().includes('not found')) {
      return c.json({ error: err.message }, 404);
    }
    return c.json({ error: 'Failed to fetch guide', detail: err.message }, 500);
  }
});

module.exports = router;
