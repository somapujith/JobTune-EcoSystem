const planService = require('../services/planService');

const TIER_NAMES = {
  1: 'Learn & Build',
  2: 'Tune & Polish',
  3: 'Zero to Hero',
};

/**
 * Server-side subscription tier gate. Must run after authenticateToken.
 * Rejects with 403 if the user has no active plan or their plan's
 * tier_level is below minTier — mirrors the frontend's PlanGate logic
 * but as a real enforcement point, since API routes are otherwise
 * reachable directly regardless of UI gating.
 */
function requirePlan(minTier) {
  return async (req, res, next) => {
    try {
      const userPlan = await planService.getUserPlan(req.user.id);

      if (!userPlan || userPlan.tier_level < minTier) {
        return res.status(403).json({
          error: 'This feature requires a higher subscription plan.',
          code: 'PLAN_UPGRADE_REQUIRED',
          requiredPlan: TIER_NAMES[minTier] || null,
          currentPlan: userPlan ? userPlan.name : null,
        });
      }

      req.userPlan = userPlan;
      next();
    } catch (err) {
      console.error('requirePlan error:', err.message);
      res.status(500).json({ error: 'Failed to verify subscription plan' });
    }
  };
}

module.exports = { requirePlan, TIER_NAMES };
