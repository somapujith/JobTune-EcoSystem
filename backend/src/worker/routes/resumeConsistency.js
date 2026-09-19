'use strict';

/**
 * /api/resume-consistency: Worker port (leaf1 slice) of backend/src/routes/resumeConsistency.js.
 *
 * Resume Consistency Checker (pipeline tool #10)
 *
 *   POST /check   authenticateToken -> requirePlan(2)   ("Tune & Polish")
 *
 * Cross-compares a candidate's Resume + LinkedIn + GitHub data and returns a categorized
 * consistency report plus a 0-100 consistency score. Pure rule-based, no LLM.
 * Body: { resume?, linkedin?, github? }  (at least one is required, two or more recommended)
 */
const { createRouter } = require('../lib/routes');
const { authenticateToken } = require('../middleware/auth');
const { requirePlan } = require('../middleware/requirePlan');
const { getServices } = require('../lib/context');
const { getBody } = require('../lib/http');

const router = createRouter();

router.post('/check', authenticateToken, requirePlan(2), async (c) => {
  const { resumeConsistencyService } = getServices(c);
  try {
    const { resume, linkedin, github } = getBody(c) || {};

    if (!resume && !linkedin && !github) {
      return c.json({
        error: 'Provide at least one of: resume, linkedin, github. Two or more are needed for a meaningful comparison.',
      }, 400);
    }

    const report = resumeConsistencyService.checkConsistency({ resume, linkedin, github });

    return c.json({
      success: true,
      data: report,
    });
  } catch (err) {
    console.error('Resume consistency check error:', err);
    return c.json({
      error: 'Failed to run consistency check',
    }, 500);
  }
});

module.exports = router;
