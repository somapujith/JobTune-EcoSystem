'use strict';

/**
 * Job Fit Route.  Worker port of backend/src/routes/jobFit.js.
 * Mounted at /api/jobs, fifth (last) of the /api/jobs routers.
 *
 *   POST /api/jobs/fit   authenticateToken, requirePlan(3)
 *   Body: { resumeText: string, jobDescription: string }
 *   Returns: { success, score, breakdown, method }
 *
 * The scorer is the injected `services.jobFit` (worker port of scoring/strategies/jobFit).
 * The Express handler passed every failure to next(err); here they are thrown to app.onError, which
 * produces the same masked 500 {"error":"Internal Server Error"} (this includes a request without a JSON
 * body, and non-string resumeText/jobDescription values that reach the scorer's trim()).
 */
const { createRouter } = require('../lib/routes');
const { authenticateToken } = require('../middleware/auth');
const { requirePlan } = require('../middleware/requirePlan');
const { getServices } = require('../lib/context');
const { getBody } = require('../lib/http');

const router = createRouter();

/**
 * POST /api/jobs/fit
 * Body: { resumeText: string, jobDescription: string }
 * Returns: { score, breakdown, method }
 */
router.post('/fit', authenticateToken, requirePlan(3), async (c) => {
  const { resumeText, jobDescription } = getBody(c);

  if (!resumeText || !jobDescription) {
    return c.json({
      success: false,
      error: 'Both resumeText and jobDescription are required'
    }, 400);
  }

  const result = await getServices(c).jobFit.score({ resumeText, jobDescription });

  return c.json({
    success: true,
    score: result.score,
    breakdown: result.breakdown,
    method: result.method
  }, 200);
});

module.exports = router;
