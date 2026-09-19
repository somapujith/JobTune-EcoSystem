'use strict';

/**
 * /api/recruiter-visibility: Worker port (leaf1 slice) of backend/src/routes/recruiterVisibility.js.
 *
 * Recruiter Visibility Checker (pipeline tool #9)
 *
 *   POST /analyze   authenticateToken -> requirePlan(2)   ("Tune & Polish")
 *
 * Body (all optional individually, but at least one of resumeText / linkedin / github is required):
 *   { resumeText: string, linkedin: object, github: object, targetKeywords: string[]|string }
 * Scoring is fully rule-based and deterministic, no LLM dependency. A service error carrying
 * statusCode 400 becomes a 400 with its message; anything else is a generic 500.
 */
const { createRouter } = require('../lib/routes');
const { authenticateToken } = require('../middleware/auth');
const { requirePlan } = require('../middleware/requirePlan');
const { getServices } = require('../lib/context');
const { getBody } = require('../lib/http');

const router = createRouter();

router.post('/analyze', authenticateToken, requirePlan(2), async (c) => {
  const { recruiterVisibilityService } = getServices(c);
  try {
    const { resumeText, linkedin, github, targetKeywords } = getBody(c) || {};

    const result = recruiterVisibilityService.computeVisibility({
      resumeText,
      linkedin,
      github,
      targetKeywords,
    });

    return c.json({ success: true, data: result });
  } catch (err) {
    if (err.statusCode === 400) {
      return c.json({ error: err.message }, 400);
    }
    console.error('Recruiter visibility analysis error:', err);
    return c.json({ error: 'Failed to analyze recruiter visibility' }, 500);
  }
});

module.exports = router;
