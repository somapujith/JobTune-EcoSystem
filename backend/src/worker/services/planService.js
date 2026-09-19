'use strict';

/**
 * Worker port of backend/src/services/planService.js (ported from git HEAD 38d8130a).
 * (T2.2, ADR-001 sections 6.3, 6.4)
 *
 * Pure database service: every method name, SQL text, signature and return shape
 * of the original is preserved. The only change is dependency injection:
 * `createPlanService({ db })` instead of a singleton bound to a module-level pool.
 *
 * Updated by the auth slice from the WORKING-TREE Express planService.js (uncommitted
 * edits by another session): adds setOnboardingCompleted / getOnboardingCompleted
 * (12 methods now; HEAD 38d8130a had 10). They back GET /api/subscriptions/onboarded
 * and the onboarding flag written by verify-payment. requireOnboarding itself is
 * still NOT ported or mounted (ADR 4.3.1).
 *
 * Preserved on purpose (do NOT "fix" during the port, ADR 4.3 / 6.4):
 *   - markOrderPaid's single-statement compare-and-set
 *     (`WHERE order_ref = $1 AND status = 'pending'`) is the idempotency guard
 *     for verify-payment. Keep it one statement.
 */

/**
 * @param {{ db: { query: Function } }} deps
 */
function createPlanService({ db }) {
  if (!db || typeof db.query !== 'function') throw new TypeError('createPlanService requires a db with query()');

  async function getAllPlans() {
    const result = await db.query('SELECT * FROM subscription_plans ORDER BY tier_level');
    return result.rows;
  }

  async function getPlanById(planId) {
    const result = await db.query('SELECT * FROM subscription_plans WHERE id = $1', [planId]);
    return result.rows[0] || null;
  }

  async function getPlanByName(name) {
    const result = await db.query('SELECT * FROM subscription_plans WHERE name = $1', [name]);
    return result.rows[0] || null;
  }

  async function getUserPlan(userId) {
    const result = await db.query(
      'SELECT sp.* FROM subscription_plans sp JOIN user_subscriptions us ON sp.id = us.plan_id WHERE us.user_id = $1',
      [userId]
    );
    return result.rows[0] || null;
  }

  async function assignPlan(userId, planId) {
    const result = await db.query(
      'INSERT INTO user_subscriptions (user_id, plan_id) VALUES ($1, $2) ON CONFLICT (user_id) DO UPDATE SET plan_id = $2 RETURNING *',
      [userId, planId]
    );
    return result.rows[0];
  }

  async function saveOnboardingResponse(userId, responses) {
    const { career_goal, experience_level, pain_points, field_of_interest, recommended_plan_id } = responses;
    const result = await db.query(
      'INSERT INTO onboarding_responses (user_id, career_goal, experience_level, pain_points, field_of_interest, recommended_plan_id) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (user_id) DO UPDATE SET career_goal = $2, experience_level = $3, pain_points = $4, field_of_interest = $5, recommended_plan_id = $6 RETURNING *',
      [userId, career_goal, experience_level, pain_points, field_of_interest || null, recommended_plan_id]
    );
    return result.rows[0];
  }

  async function getUserOnboardingResponse(userId) {
    const result = await db.query('SELECT * FROM onboarding_responses WHERE user_id = $1', [userId]);
    return result.rows[0] || null;
  }

  async function setOnboardingCompleted(userId) {
    await db.query('UPDATE users SET onboarding_completed = true WHERE id = $1', [userId]);
  }

  async function getOnboardingCompleted(userId) {
    const result = await db.query('SELECT onboarding_completed FROM users WHERE id = $1', [userId]);
    return !!result.rows[0]?.onboarding_completed;
  }

  async function createOrder(userId, planId) {
    const plan = await getPlanById(planId);
    if (!plan) throw new Error('Plan not found');

    const orderRef = `ord_${userId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const result = await db.query(
      'INSERT INTO plan_orders (order_ref, user_id, plan_id, amount, status) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [orderRef, userId, planId, plan.price, 'pending']
    );
    return { order: result.rows[0], plan };
  }

  async function getOrderByRef(orderRef) {
    const result = await db.query('SELECT * FROM plan_orders WHERE order_ref = $1', [orderRef]);
    return result.rows[0] || null;
  }

  async function markOrderPaid(orderRef) {
    const result = await db.query(
      "UPDATE plan_orders SET status = 'paid', paid_at = CURRENT_TIMESTAMP WHERE order_ref = $1 AND status = 'pending' RETURNING *",
      [orderRef]
    );
    return result.rows[0] || null;
  }

  return {
    getAllPlans,
    getPlanById,
    getPlanByName,
    getUserPlan,
    assignPlan,
    saveOnboardingResponse,
    getUserOnboardingResponse,
    setOnboardingCompleted,
    getOnboardingCompleted,
    createOrder,
    getOrderByRef,
    markOrderPaid,
  };
}

module.exports = { createPlanService };
