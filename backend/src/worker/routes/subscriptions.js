'use strict';

/**
 * Worker port of backend/src/routes/subscriptions.js, mirrored from the WORKING-TREE version
 * (uncommitted edits by another session; 6 endpoints, no /select-plan).   (T3B, ADR-001 section 6.4)
 *
 *   GET  /plans           public
 *   GET  /my-plan         authenticateToken
 *   POST /recommend       authenticateToken
 *   POST /create-order    authenticateToken   (pending order only; the plan is NOT assigned yet)
 *   POST /verify-payment  authenticateToken   (assigns the plan; marks onboarding complete)
 *   GET  /onboarded       authenticateToken   (users.onboarding_completed)
 *
 * NONE of these is plan-gated (requirePlan): the manifest has minTier null for all six.
 * Payment chain (create-order -> verify-payment -> assignPlan) preserved:
 *   - idempotency rests on planService.markOrderPaid's single UPDATE ... WHERE status = 'pending'
 *     compare-and-set; a second verify-payment returns {alreadyPaid:true} and never rewrites paid_at
 *   - the order must belong to the caller (order.user_id === user id), else 404 "Order not found"
 *
 * *** THE VERIFIER IS A MOCK AND IS UNGUARDED (ADR 4.3.3 / checklist item 16) ***
 * There is no gateway signature check: any authenticated user can POST their own pending orderRef
 * and be granted any plan tier. It is ported AS-IS, exactly like Express. Whether to ship it on the
 * new host is the user's explicit decision; nothing here changes it.
 *
 * Preserved quirks: a body-less request destructures `undefined` -> masked 500 (Express 5); the
 * recommend route saves the onboarding response best-effort (failures only warn) and still answers.
 */
const { createRouter } = require('../lib/routes');
const { authenticateToken } = require('../middleware/auth');
const { getServices } = require('../lib/context');
const { getBody } = require('../lib/http');

const router = createRouter();

// Get all plans
router.get('/plans', async (c) => {
  const { planService } = getServices(c);
  const plans = await planService.getAllPlans();
  return c.json({ plans });
});

// Get user current plan
router.get('/my-plan', authenticateToken, async (c) => {
  const { planService } = getServices(c);
  const plan = await planService.getUserPlan(c.get('user').id);
  return c.json({ plan });
});

// Get recommendation
router.post('/recommend', authenticateToken, async (c) => {
  try {
    const { planService, recommendationEngine } = getServices(c);
    const { careerGoal, experienceLevel, painPoints, fieldOfInterest } = getBody(c);

    if (!careerGoal || !experienceLevel || !painPoints || painPoints.length === 0) {
      return c.json({ error: 'Missing required fields' }, 400);
    }

    const recommendation = await recommendationEngine.recommendPlan(careerGoal, experienceLevel, painPoints, fieldOfInterest);

    // Save onboarding response
    try {
      const allPlans = await planService.getAllPlans();
      const recommendedPlanFromDb = allPlans.find(p => p.name === recommendation.recommendedPlan.name);

      await planService.saveOnboardingResponse(c.get('user').id, {
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

    return c.json({ recommendation });
  } catch (err) {
    console.error('Recommendation error:', err);
    throw err;
  }
});

// Create a pending order for the chosen plan. Plan is NOT assigned yet:
// assignment happens only after /verify-payment succeeds.
router.post('/create-order', authenticateToken, async (c) => {
  try {
    const { planService } = getServices(c);
    const { planId } = getBody(c);

    if (!planId) {
      return c.json({ error: 'Plan ID required' }, 400);
    }

    const { order, plan } = await planService.createOrder(c.get('user').id, planId);
    return c.json({ success: true, order, plan });
  } catch (err) {
    if (err.message === 'Plan not found') {
      return c.json({ error: err.message }, 404);
    }
    throw err;
  }
});

// Verify payment and assign the plan.
// NOTE: No payment gateway is wired up yet: this is a mock verifier that
// always succeeds for a valid pending order. Replace with real gateway
// signature verification (e.g. Razorpay) before accepting real money.
router.post('/verify-payment', authenticateToken, async (c) => {
  const { planService } = getServices(c);
  const user = c.get('user');
  const { orderRef } = getBody(c);

  if (!orderRef) {
    return c.json({ error: 'orderRef required' }, 400);
  }

  const order = await planService.getOrderByRef(orderRef);
  if (!order || order.user_id !== user.id) {
    return c.json({ error: 'Order not found' }, 404);
  }
  if (order.status === 'paid') {
    await planService.setOnboardingCompleted(user.id);
    const plan = await planService.getPlanById(order.plan_id);
    return c.json({ success: true, plan, alreadyPaid: true });
  }

  const paidOrder = await planService.markOrderPaid(orderRef);
  if (!paidOrder) {
    return c.json({ error: 'Order could not be marked paid' }, 409);
  }

  await planService.assignPlan(user.id, order.plan_id);
  await planService.setOnboardingCompleted(user.id);
  const plan = await planService.getPlanById(order.plan_id);
  return c.json({ success: true, plan });
});

// Check onboarding completion
router.get('/onboarded', authenticateToken, async (c) => {
  const { planService } = getServices(c);
  const onboarded = await planService.getOnboardingCompleted(c.get('user').id);
  return c.json({ onboarded });
});

module.exports = router;
