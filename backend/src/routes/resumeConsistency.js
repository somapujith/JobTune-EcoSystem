const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { requirePlan } = require('../middleware/requirePlan');
const { checkConsistency } = require('../services/resumeConsistencyService');

/**
 * Resume Consistency Checker (pipeline tool #10)
 *
 * POST /check
 * Tier: "Tune & Polish" -> requirePlan(2)
 *
 * Cross-compares a candidate's Resume + LinkedIn + GitHub data and returns a
 * categorized consistency report (missing items, title/date mismatches,
 * skill gaps) plus a 0-100 consistency score. Pure rule-based — no LLM.
 *
 * Body: { resume?, linkedin?, github? }  (at least two recommended)
 */
router.post('/check', authenticateToken, requirePlan(2), async (req, res) => {
  try {
    const { resume, linkedin, github } = req.body || {};

    if (!resume && !linkedin && !github) {
      return res.status(400).json({
        error: 'Provide at least one of: resume, linkedin, github. Two or more are needed for a meaningful comparison.',
      });
    }

    const report = checkConsistency({ resume, linkedin, github });

    res.json({
      success: true,
      data: report,
    });
  } catch (err) {
    console.error('Resume consistency check error:', err);
    res.status(500).json({
      error: 'Failed to run consistency check',
    });
  }
});

module.exports = router;
