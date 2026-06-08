const { pool } = require('../config/database');

async function runMigrations() {
  try {
    console.log('🔄 Running database migrations...');

    // Check if subscription_plans table exists
    const result = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'subscription_plans'
      )
    `);

    if (result.rows[0].exists) {
      console.log('✅ Subscription tables already exist');
      return;
    }

    // Create subscription_plans table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS subscription_plans (
        id SERIAL PRIMARY KEY,
        name VARCHAR(50) UNIQUE NOT NULL,
        tier_level INT NOT NULL,
        description TEXT,
        price DECIMAL(10, 2),
        features TEXT[],
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create user_subscriptions table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_subscriptions (
        id SERIAL PRIMARY KEY,
        user_id INT NOT NULL UNIQUE,
        plan_id INT NOT NULL REFERENCES subscription_plans(id),
        selected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        status VARCHAR(20) DEFAULT 'active',
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // Create onboarding_responses table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS onboarding_responses (
        id SERIAL PRIMARY KEY,
        user_id INT NOT NULL UNIQUE,
        career_goal VARCHAR(100),
        experience_level VARCHAR(50),
        pain_points TEXT[],
        recommended_plan_id INT REFERENCES subscription_plans(id),
        completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // Insert default plans
    await pool.query(`
      INSERT INTO subscription_plans (name, tier_level, description, price, features) VALUES
      ('Learn & Build', 1, 'For service role learners', 0, ARRAY['Learning Resources', 'Project Ideas', 'Skill Assessment']),
      ('Tune & Polish', 2, 'For resume & portfolio refinement', 29, ARRAY['Resume Optimizer', 'LinkedIn Optimizer', 'GitHub Optimizer', 'Portfolio Builder', 'Project Ideas', 'Learning Resources']),
      ('Zero to Hero', 3, 'All tools & premium features', 79, ARRAY['Resume Optimizer', 'LinkedIn Optimizer', 'GitHub Optimizer', 'Interview Prep', 'Job Tracker', 'Career Roadmap', 'Skill Assessment', 'Project Ideas', 'Cover Letter Generator', 'ATS Checker', 'Learning Resources', 'Mock Interview'])
      ON CONFLICT (name) DO NOTHING
    `);

    console.log('✅ Database migrations completed successfully');
  } catch (err) {
    console.error('❌ Migration error:', err.message);
    // Don't exit, let server continue
  }
}

module.exports = { runMigrations };
