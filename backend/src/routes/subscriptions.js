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
    const { careerGoal, experienceLevel, painPoints, fieldOfInterest } = req.body;

    if (!careerGoal || !experienceLevel || !painPoints || painPoints.length === 0) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const recommendation = await recommendationEngine.recommendPlan(careerGoal, experienceLevel, painPoints, fieldOfInterest);

    // Save onboarding response
    try {
      const allPlans = await planService.getAllPlans();
      const recommendedPlanFromDb = allPlans.find(p => p.name === recommendation.recommendedPlan.name);

      await planService.saveOnboardingResponse(req.user.id, {
        career_goal: careerGoal,
        experience_level: experienceLevel,
        pain_points: painPoints,
        field_of_interest: fieldOfInterest,
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

// Create a pending order for the chosen plan. Plan is NOT assigned yet —
// assignment happens only after /verify-payment succeeds.
router.post('/create-order', authenticateToken, async (req, res, next) => {
  try {
    const { planId } = req.body;

    if (!planId) {
      return res.status(400).json({ error: 'Plan ID required' });
    }

    const { order, plan } = await planService.createOrder(req.user.id, planId);
    res.json({ success: true, order, plan });
  } catch (err) {
    if (err.message === 'Plan not found') {
      return res.status(404).json({ error: err.message });
    }
    next(err);
  }
});

// Verify payment and assign the plan.
// NOTE: No payment gateway is wired up yet — this is a mock verifier that
// always succeeds for a valid pending order. Replace with real gateway
// signature verification (e.g. Razorpay) before accepting real money.
router.post('/verify-payment', authenticateToken, async (req, res, next) => {
  try {
    const { orderRef } = req.body;

    if (!orderRef) {
      return res.status(400).json({ error: 'orderRef required' });
    }

    const order = await planService.getOrderByRef(orderRef);
    if (!order || order.user_id !== req.user.id) {
      return res.status(404).json({ error: 'Order not found' });
    }
    if (order.status === 'paid') {
      const plan = await planService.getPlanById(order.plan_id);
      return res.json({ success: true, plan, alreadyPaid: true });
    }

    const paidOrder = await planService.markOrderPaid(orderRef);
    if (!paidOrder) {
      return res.status(409).json({ error: 'Order could not be marked paid' });
    }

    await planService.assignPlan(req.user.id, order.plan_id);
    const plan = await planService.getPlanById(order.plan_id);
    res.json({ success: true, plan });
  } catch (err) {
    next(err);
  }
});

// Check onboarding completion
router.get('/onboarded', authenticateToken, async (req, res, next) => {
  try {
    const [response, plan] = await Promise.all([
      planService.getUserOnboardingResponse(req.user.id),
      planService.getUserPlan(req.user.id),
    ]);
    res.json({ onboarded: !!response || !!plan });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
