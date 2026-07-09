const express = require('express');
const router = express.Router();
const planService = require('../services/planService');
const recommendationEngine = require('../services/recommendationEngine');
const { authenticateToken } = require('../middleware/auth');

// Get all plans
router.get('/plans', async (req, res, next) => {
  try {
    const plans = await planService.getAllPlans();
    res.json({ plans });
  } catch (err) {
    next(err);
  }
});

// Get user current plan
router.get('/my-plan', authenticateToken, async (req, res, next) => {
  try {
    const plan = await planService.getUserPlan(req.user.id);
    res.json({ plan });
  } catch (err) {
    next(err);
  }
});

// Get recommendation
router.post('/recommend', authenticateToken, async (req, res, next) => {
  try {
    const { careerGoal, experienceLevel, painPoints } = req.body;

    if (!careerGoal || !experienceLevel || !painPoints || painPoints.length === 0) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const recommendation = await recommendationEngine.recommendPlan(careerGoal, experienceLevel, painPoints);

    // Save onboarding response
    try {
      const allPlans = await planService.getAllPlans();
      const recommendedPlanFromDb = allPlans.find(p => p.name === recommendation.recommendedPlan.name);

      await planService.saveOnboardingResponse(req.user.id, {
        career_goal: careerGoal,
        experience_level: experienceLevel,
        pain_points: painPoints,
        recommended_plan_id: recommendedPlanFromDb?.id
      });
    } catch (dbErr) {
      console.warn('Warning: Could not save onboarding response:', dbErr.message);
      // Continue anyway - recommendation is still valid
    }

    res.json({ recommendation });
  } catch (err) {
    console.error('Recommendation error:', err);
    next(err);
  }
});

// Select plan
router.post('/select-plan', authenticateToken, async (req, res, next) => {
  try {
    const { planId } = req.body;

    if (!planId) {
      return res.status(400).json({ error: 'Plan ID required' });
    }

    const plan = await planService.getPlanById(planId);
    if (!plan) {
      return res.status(404).json({ error: 'Plan not found' });
    }

    await planService.assignPlan(req.user.id, planId);
    await planService.setOnboardingCompleted(req.user.id);
    res.json({ success: true, plan });
  } catch (err) {
    next(err);
  }
});

// Check onboarding completion
router.get('/onboarded', authenticateToken, async (req, res, next) => {
  try {
    const onboarded = await planService.getOnboardingCompleted(req.user.id);
    res.json({ onboarded });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
