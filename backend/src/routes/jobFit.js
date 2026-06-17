/**
 * Job Fit Route
 * POST /api/jobs/fit — score a candidate resume against a job description
 */

const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { requirePlan } = require('../middleware/requirePlan');
const { score } = require('../services/scoring/strategies/jobFit');

/**
 * POST /api/jobs/fit
 * Body: { resumeText: string, jobDescription: string }
 * Returns: { score, breakdown, method }
 */
router.post('/fit', authenticateToken, requirePlan(3), async (req, res, next) => {
  try {
    const { resumeText, jobDescription } = req.body;

    if (!resumeText || !jobDescription) {
      return res.status(400).json({
        success: false,
        error: 'Both resumeText and jobDescription are required'
      });
    }

    const result = await score({ resumeText, jobDescription });

    return res.status(200).json({
      success: true,
      score: result.score,
      breakdown: result.breakdown,
      method: result.method
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
