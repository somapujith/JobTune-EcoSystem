const planService = require('../services/planService');

/**
 * Server-side onboarding gate. Must run after authenticateToken.
 * Rejects with 403 until the user has completed the signup survey chain
 * (users.onboarding_completed) — mirrors the frontend's onboarding
 * redirect but as a real enforcement point, since API routes are
 * otherwise reachable directly regardless of UI gating.
 */
const requireOnboarding = async (req, res, next) => {
  try {
    const completed = await planService.getOnboardingCompleted(req.user.id);

    if (!completed) {
      return res.status(403).json({
        error: 'Complete onboarding to access this feature.',
        code: 'ONBOARDING_REQUIRED',
      });
    }

    next();
  } catch (err) {
    console.error('requireOnboarding error:', err.message);
    res.status(500).json({ error: 'Failed to verify onboarding status' });
  }
};

module.exports = { requireOnboarding };
