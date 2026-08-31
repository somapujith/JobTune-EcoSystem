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
      ('Learn & Build', 1, 'Build the skills, projects, and portfolio needed for your dream career.', 199, ARRAY['Skill Assessment', 'Career Roadmap', 'Learning Hub', 'Project Builder', 'Portfolio Builder']),
      ('Tune & Polish', 2, 'Turn your existing skills into a recruiter-ready professional profile.', 299, ARRAY['Skill Assessment', 'Career Roadmap', 'Learning Hub', 'Project Builder', 'Portfolio Builder', 'Resume Optimizer', 'ATS Checker', 'LinkedIn Optimizer', 'GitHub Optimizer', 'Recruiter Visibility Checker', 'Application Assistant']),
      ('Zero to Hero', 3, 'The complete career transformation ecosystem.', 499, ARRAY['Skill Assessment', 'Career Roadmap', 'Learning Hub', 'Project Builder', 'Portfolio Builder', 'Resume Optimizer', 'ATS Checker', 'LinkedIn Optimizer', 'GitHub Optimizer', 'Recruiter Visibility Checker', 'Application Assistant', 'Interview Prep', 'Job Analytics', 'Career Readiness Dashboard'])
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
      // Create resumes table (v2-first schema; v1 columns added below if needed)
      await pool.query(`
        CREATE TABLE IF NOT EXISTS resumes (
          id SERIAL PRIMARY KEY,
          user_id INTEGER NOT NULL,
          original_resume TEXT,
          optimized_resume TEXT,
          original_score INTEGER,
          optimized_score INTEGER,
          role_detected VARCHAR(100),
          keyword_coverage JSONB,
          missing_info JSONB,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      console.log('✅ ATS resumes table created');
    }

    // Always-run: keep plan pricing/features in sync with the current pricing strategy (idempotent).
    await pool.query(`
      UPDATE subscription_plans SET price = 199, description = 'Build the skills, projects, and portfolio needed for your dream career.',
        features = ARRAY['Skill Assessment', 'Career Roadmap', 'Learning Hub', 'Project Builder', 'Portfolio Builder']
      WHERE name = 'Learn & Build'
    `);
    await pool.query(`
      UPDATE subscription_plans SET price = 299, description = 'Turn your existing skills into a recruiter-ready professional profile.',
        features = ARRAY['Skill Assessment', 'Career Roadmap', 'Learning Hub', 'Project Builder', 'Portfolio Builder', 'Resume Optimizer', 'ATS Checker', 'LinkedIn Optimizer', 'GitHub Optimizer', 'Recruiter Visibility Checker', 'Application Assistant']
      WHERE name = 'Tune & Polish'
    `);
    await pool.query(`
      UPDATE subscription_plans SET price = 499, description = 'The complete career transformation ecosystem.',
        features = ARRAY['Skill Assessment', 'Career Roadmap', 'Learning Hub', 'Project Builder', 'Portfolio Builder', 'Resume Optimizer', 'ATS Checker', 'LinkedIn Optimizer', 'GitHub Optimizer', 'Recruiter Visibility Checker', 'Application Assistant', 'Interview Prep', 'Job Analytics', 'Career Readiness Dashboard']
      WHERE name = 'Zero to Hero'
    `);

    // Upgrade existing installs: v1 resumes table may lack v2 ATS columns
    const resumeV2Columns = [
      ['original_resume', 'TEXT'],
      ['optimized_resume', 'TEXT'],
      ['original_score', 'INTEGER'],
      ['optimized_score', 'INTEGER'],
      ['role_detected', 'VARCHAR(100)'],
      ['keyword_coverage', 'JSONB'],
      ['missing_info', 'JSONB'],
      ['updated_at', 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP'],
    ];

    for (const [col, def] of resumeV2Columns) {
      await pool.query(`ALTER TABLE resumes ADD COLUMN IF NOT EXISTS ${col} ${def}`);
    }

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
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS resume_exports (
        id SERIAL PRIMARY KEY,
        resume_id INTEGER NOT NULL,
        export_format VARCHAR(10),
        file_path VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_resumes_user_id ON resumes(user_id);
      CREATE INDEX IF NOT EXISTS idx_resumes_created_at ON resumes(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_analyses_resume_id ON analyses(resume_id);
      CREATE INDEX IF NOT EXISTS idx_exports_resume_id ON resume_exports(resume_id);
    `);

    // Field of interest on onboarding responses (added after initial launch)
    await pool.query(`ALTER TABLE onboarding_responses ADD COLUMN IF NOT EXISTS field_of_interest VARCHAR(100)`);

    // Pending plan orders: plan assignment now happens only after payment verification
    await pool.query(`
      CREATE TABLE IF NOT EXISTS plan_orders (
        id SERIAL PRIMARY KEY,
        order_ref VARCHAR(64) UNIQUE NOT NULL,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        plan_id INTEGER NOT NULL REFERENCES subscription_plans(id),
        amount DECIMAL(10, 2) NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        paid_at TIMESTAMP
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_plan_orders_user_id ON plan_orders(user_id)`);

    console.log('✅ Database migrations completed successfully');
  } catch (err) {
    console.error('❌ Migration error:', err.message);
    // Don't exit, let server continue
  }
}

module.exports = { runMigrations };
