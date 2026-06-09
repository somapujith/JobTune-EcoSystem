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

    if (!result.rows[0].exists) {

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
    }

    // Check if resumes table exists
    const atsResult = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'resumes'
      )
    `);

    if (!atsResult.rows[0].exists) {
      // Create resumes table
      await pool.query(`
        CREATE TABLE IF NOT EXISTS resumes (
          id SERIAL PRIMARY KEY,
          user_id INTEGER NOT NULL,
          original_resume TEXT NOT NULL,
          optimized_resume TEXT,
          original_score INTEGER,
          optimized_score INTEGER,
          role_detected VARCHAR(100),
          keyword_coverage JSONB,
          missing_info JSONB,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
      `);

      // Create analyses table
      await pool.query(`
        CREATE TABLE IF NOT EXISTS analyses (
          id SERIAL PRIMARY KEY,
          resume_id INTEGER NOT NULL UNIQUE,
          section_completeness INTEGER,
          keyword_relevance INTEGER,
          formatting_score INTEGER,
          action_verbs_count INTEGER,
          metrics_count INTEGER,
          missing_sections JSONB,
          recommendations JSONB,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (resume_id) REFERENCES resumes(id) ON DELETE CASCADE
        )
      `);

      // Create resume_exports table
      await pool.query(`
        CREATE TABLE IF NOT EXISTS resume_exports (
          id SERIAL PRIMARY KEY,
          resume_id INTEGER NOT NULL,
          export_format VARCHAR(10),
          file_path VARCHAR(255),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (resume_id) REFERENCES resumes(id) ON DELETE CASCADE
        )
      `);

      // Create indexes
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_resumes_user_id ON resumes(user_id);
        CREATE INDEX IF NOT EXISTS idx_resumes_created_at ON resumes(created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_analyses_resume_id ON analyses(resume_id);
        CREATE INDEX IF NOT EXISTS idx_exports_resume_id ON resume_exports(resume_id);
      `);

      console.log('✅ ATS tables created');
    }

    console.log('✅ Database migrations completed successfully');
  } catch (err) {
    console.error('❌ Migration error:', err.message);
    // Don't exit, let server continue
  }
}

module.exports = { runMigrations };
