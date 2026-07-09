const { pool } = require('../config/database');

// users.onboarding_completed is monotonic — the app only ever flips it to true,
// never back — so completed ids can be cached for the process lifetime. This
// turns the per-request requireOnboarding lookup into a Set.has() after the
// first hit. (A manual DB reset of the flag needs a server restart to be seen.)
const onboardingCompletedCache = new Set();

// A user's plan only changes through assignPlan() — which invalidates the
// entry — so the per-request requirePlan JOIN can be served from a short-lived
// cache. The 60s TTL bounds staleness for changes made outside this process
// (e.g. a manual DB edit or another instance).
const USER_PLAN_TTL_MS = 60 * 1000;
const userPlanCache = new Map(); // userId -> { plan, expires }

class PlanService {
  async getAllPlans() {
    const result = await pool.query('SELECT * FROM subscription_plans ORDER BY tier_level');
    return result.rows;
  }

  async getPlanById(planId) {
    const result = await pool.query('SELECT * FROM subscription_plans WHERE id = $1', [planId]);
    return result.rows[0] || null;
  }

  async getPlanByName(name) {
    const result = await pool.query('SELECT * FROM subscription_plans WHERE name = $1', [name]);
    return result.rows[0] || null;
  }

  async getUserPlan(userId) {
    const cached = userPlanCache.get(userId);
    if (cached && cached.expires > Date.now()) return cached.plan;
    const result = await pool.query(
      'SELECT sp.* FROM subscription_plans sp JOIN user_subscriptions us ON sp.id = us.plan_id WHERE us.user_id = $1',
      [userId]
    );
    const plan = result.rows[0] || null;
    userPlanCache.set(userId, { plan, expires: Date.now() + USER_PLAN_TTL_MS });
    return plan;
  }

  async assignPlan(userId, planId) {
    const result = await pool.query(
      'INSERT INTO user_subscriptions (user_id, plan_id) VALUES ($1, $2) ON CONFLICT (user_id) DO UPDATE SET plan_id = $2 RETURNING *',
      [userId, planId]
    );
    // Plan just changed — drop the cached entry so the next gated request re-reads
    userPlanCache.delete(userId);
    return result.rows[0];
  }

  async saveOnboardingResponse(userId, responses) {
    const { career_goal, experience_level, pain_points, recommended_plan_id } = responses;
    const result = await pool.query(
      'INSERT INTO onboarding_responses (user_id, career_goal, experience_level, pain_points, recommended_plan_id) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (user_id) DO UPDATE SET career_goal = $2, experience_level = $3, pain_points = $4, recommended_plan_id = $5 RETURNING *',
      [userId, career_goal, experience_level, pain_points, recommended_plan_id]
    );
    return result.rows[0];
  }

  async getUserOnboardingResponse(userId) {
    const result = await pool.query('SELECT * FROM onboarding_responses WHERE user_id = $1', [userId]);
    return result.rows[0] || null;
  }

  async setOnboardingCompleted(userId) {
    await pool.query('UPDATE users SET onboarding_completed = true WHERE id = $1', [userId]);
    onboardingCompletedCache.add(userId);
  }

  async getOnboardingCompleted(userId) {
    if (onboardingCompletedCache.has(userId)) return true;
    const result = await pool.query('SELECT onboarding_completed FROM users WHERE id = $1', [userId]);
    const completed = !!result.rows[0]?.onboarding_completed;
    if (completed) onboardingCompletedCache.add(userId);
    return completed;
  }

  // Test hook: the cache is process-lifetime by design, so unit tests need a reset.
  clearOnboardingCompletedCache() {
    onboardingCompletedCache.clear();
  }

  // Test hook: the cache is process-lifetime by design, so unit tests need a reset.
  clearUserPlanCache() {
    userPlanCache.clear();
  }
}

module.exports = new PlanService();
