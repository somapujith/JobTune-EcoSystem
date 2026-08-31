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
    const { career_goal, experience_level, pain_points, field_of_interest, recommended_plan_id } = responses;
    const result = await pool.query(
      'INSERT INTO onboarding_responses (user_id, career_goal, experience_level, pain_points, field_of_interest, recommended_plan_id) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (user_id) DO UPDATE SET career_goal = $2, experience_level = $3, pain_points = $4, field_of_interest = $5, recommended_plan_id = $6 RETURNING *',
      [userId, career_goal, experience_level, pain_points, field_of_interest || null, recommended_plan_id]
    );
    return result.rows[0];
  }

  async getUserOnboardingResponse(userId) {
    const result = await pool.query('SELECT * FROM onboarding_responses WHERE user_id = $1', [userId]);
    return result.rows[0] || null;
  }

  async createOrder(userId, planId) {
    const plan = await this.getPlanById(planId);
    if (!plan) throw new Error('Plan not found');

    const orderRef = `ord_${userId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const result = await pool.query(
      'INSERT INTO plan_orders (order_ref, user_id, plan_id, amount, status) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [orderRef, userId, planId, plan.price, 'pending']
    );
    return { order: result.rows[0], plan };
  }

  async getOrderByRef(orderRef) {
    const result = await pool.query('SELECT * FROM plan_orders WHERE order_ref = $1', [orderRef]);
    return result.rows[0] || null;
  }

  async markOrderPaid(orderRef) {
    const result = await pool.query(
      "UPDATE plan_orders SET status = 'paid', paid_at = CURRENT_TIMESTAMP WHERE order_ref = $1 AND status = 'pending' RETURNING *",
      [orderRef]
    );
    return result.rows[0] || null;
  }
}

module.exports = new PlanService();
