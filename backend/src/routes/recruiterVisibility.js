const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { requirePlan } = require('../middleware/requirePlan');
const recruiterVisibilityService = require('../services/recruiterVisibilityService');

/**
 * Recruiter Visibility Checker (pipeline tool #9)
 *
 * POST /api/recruiter-visibility/analyze
 * Auth:  authenticateToken
 * Plan:  requirePlan(2)  ("Tune & Polish" tier)
 *
 * Body (all optional individually, but at least one of resumeText / linkedin /
 * github is required):
 *   {
 *     resumeText:   string,            // raw resume text
 *     linkedin:     object,            // /profiles/linkedin/analyze response OR raw fields
 *     github:       object,            // /profiles/github/analyze response OR raw fields
 *     targetKeywords: string[]|string  // optional role keywords to measure coverage against
 *   }
 *
 * Scoring is fully rule-based and deterministic — no LLM dependency.
 */
router.post('/analyze', authenticateToken, requirePlan(2), async (req, res) => {
  try {
    const { resumeText, linkedin, github, targetKeywords } = req.body || {};

    const result = recruiterVisibilityService.computeVisibility({
      resumeText,
      linkedin,
      github,
      targetKeywords,
    });

    res.json({ success: true, data: result });
  } catch (err) {
    if (err.statusCode === 400) {
      return res.status(400).json({ error: err.message });
    }
    console.error('Recruiter visibility analysis error:', err);
    res.status(500).json({ error: 'Failed to analyze recruiter visibility' });
  }
});

module.exports = router;
