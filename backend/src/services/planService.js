const { pool } = require('../config/database');

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
    const result = await pool.query(
      'SELECT sp.* FROM subscription_plans sp JOIN user_subscriptions us ON sp.id = us.plan_id WHERE us.user_id = $1',
      [userId]
    );
    return result.rows[0] || null;
  }

  async assignPlan(userId, planId) {
    const result = await pool.query(
      'INSERT INTO user_subscriptions (user_id, plan_id) VALUES ($1, $2) ON CONFLICT (user_id) DO UPDATE SET plan_id = $2 RETURNING *',
      [userId, planId]
    );
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

  hasAccess(userPlan, toolName) {
    if (!userPlan) return false;
    return userPlan.features && userPlan.features.includes(toolName);
  }
}

module.exports = new PlanService();
