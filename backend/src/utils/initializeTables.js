const { pool } = require('../config/database');

const tables = [
  {
    name: 'users',
    query: `
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        github_username VARCHAR(255),
        linkedin_url VARCHAR(255),
        role VARCHAR(50) DEFAULT 'user',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    `
  },
  {
    name: 'resumes',
    query: `
      CREATE TABLE IF NOT EXISTS resumes (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        file_name VARCHAR(255),
        file_size INTEGER,
        overall_score INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_resumes_user_id ON resumes(user_id);
    `
  },
  {
    name: 'mock_interviews',
    query: `
      CREATE TABLE IF NOT EXISTS mock_interviews (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        role VARCHAR(255),
        messages JSONB,
        score INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_mock_interviews_user_id ON mock_interviews(user_id);
    `
  },
  {
    name: 'skill_assessments',
    query: `
      CREATE TABLE IF NOT EXISTS skill_assessments (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        skills JSONB,
        strengths TEXT,
        gaps TEXT,
        role_matches JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_skill_assessments_user_id ON skill_assessments(user_id);
    `
  },
  {
    name: 'learning_roadmaps',
    query: `
      CREATE TABLE IF NOT EXISTS learning_roadmaps (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        gaps TEXT,
        target_role VARCHAR(255),
        roadmap JSONB,
        ai_powered BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_learning_roadmaps_user_id ON learning_roadmaps(user_id);
    `
  },
  {
    name: 'career_roadmaps',
    query: `
      CREATE TABLE IF NOT EXISTS career_roadmaps (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        "current_role" VARCHAR(255),
        target_role VARCHAR(255) NOT NULL,
        timeframe VARCHAR(50),
        roadmap JSONB NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_career_roadmaps_user_id ON career_roadmaps(user_id);
    `
  },
  {
    name: 'resume_embeddings',
    query: `
      CREATE TABLE IF NOT EXISTS resume_embeddings (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        resume_id INTEGER NOT NULL,
        chunk_index INTEGER NOT NULL,
        chunk_text TEXT NOT NULL,
        embedding JSONB NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_resume_embeddings_user_resume ON resume_embeddings(user_id, resume_id);
    `
  },
  {
    name: 'job_applications',
    query: `
      CREATE TABLE IF NOT EXISTS job_applications (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        company VARCHAR(255) NOT NULL,
        role VARCHAR(255) NOT NULL,
        job_description TEXT,
        job_url VARCHAR(1000),
        status VARCHAR(50) DEFAULT 'applied',
        notes TEXT,
        source VARCHAR(100),
        applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_job_applications_user_id ON job_applications(user_id, status);
    `
  },
  {
    name: 'discovered_jobs',
    query: `
      CREATE TABLE IF NOT EXISTS discovered_jobs (
        id SERIAL PRIMARY KEY,
        user_id INTEGER,
        external_id VARCHAR(255),
        source VARCHAR(100),
        title VARCHAR(500) NOT NULL,
        company VARCHAR(255),
        location VARCHAR(255),
        description TEXT,
        url VARCHAR(1000),
        tags JSONB,
        fetched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(source, external_id)
      );
      CREATE INDEX IF NOT EXISTS idx_discovered_jobs_user_id ON discovered_jobs(user_id);
      CREATE INDEX IF NOT EXISTS idx_discovered_jobs_source ON discovered_jobs(source);
    `
  },
  {
    name: 'job_guides',
    query: `
      CREATE TABLE IF NOT EXISTS job_guides (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        application_id INTEGER,
        guide JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_job_guides_user_id ON job_guides(user_id);
    `
  },
  {
    name: 'scorer_benchmarks',
    query: `
      CREATE TABLE IF NOT EXISTS scorer_benchmarks (
        id SERIAL PRIMARY KEY,
        scorer_name VARCHAR(100),
        dataset_name VARCHAR(100),
        metrics JSONB,
        sample_size INTEGER,
        run_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `
  },
  {
    name: 'evidence_bullets',
    query: `
      CREATE TABLE IF NOT EXISTS evidence_bullets (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        bullet_text TEXT NOT NULL,
        bullet_hash VARCHAR(64),
        source_section VARCHAR(100),
        skills JSONB,
        embedding JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, bullet_hash)
      );
      CREATE INDEX IF NOT EXISTS idx_evidence_bullets_user_id ON evidence_bullets(user_id);
    `
  },
  {
    name: 'evidence_usage',
    query: `
      CREATE TABLE IF NOT EXISTS evidence_usage (
        id SERIAL PRIMARY KEY,
        bullet_id INTEGER NOT NULL,
        application_id INTEGER,
        used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        context VARCHAR(100)
      );
      CREATE INDEX IF NOT EXISTS idx_bullet_id ON evidence_usage(bullet_id);
      CREATE INDEX IF NOT EXISTS idx_application_id ON evidence_usage(application_id);
    `
  },
  {
    name: 'audit_logs',
    query: `
      CREATE TABLE IF NOT EXISTS audit_logs (
        id SERIAL PRIMARY KEY,
        user_id INTEGER,
        action VARCHAR(255),
        resource VARCHAR(255),
        details TEXT,
        ip_address VARCHAR(45),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
    `
  },
  {
    name: 'pii_redactions',
    query: `
      CREATE TABLE IF NOT EXISTS pii_redactions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        context_type VARCHAR(50),
        context_id INTEGER,
        redaction_map JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_pii_redactions_user_id ON pii_redactions(user_id);
    `
  },
  {
    name: 'onet_occupations',
    query: `
      CREATE TABLE IF NOT EXISTS onet_occupations (
        code VARCHAR(20) PRIMARY KEY,
        title VARCHAR(500),
        description TEXT,
        domain VARCHAR(255),
        skills JSONB,
        keywords JSONB
      );
    `
  },
  {
    name: 'learning_topics',
    query: `
      CREATE TABLE IF NOT EXISTS learning_topics (
        id SERIAL PRIMARY KEY,
        subject VARCHAR(100) NOT NULL,
        tier VARCHAR(20) NOT NULL,
        topic_order INTEGER NOT NULL,
        slug VARCHAR(150) NOT NULL,
        title VARCHAR(255) NOT NULL,
        content_md TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(subject, tier, slug)
      );
      CREATE INDEX IF NOT EXISTS idx_learning_topics_subject_tier ON learning_topics(subject, tier, topic_order);
    `
  },
  {
    name: 'learning_topic_progress',
    query: `
      CREATE TABLE IF NOT EXISTS learning_topic_progress (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        topic_id INTEGER NOT NULL REFERENCES learning_topics(id) ON DELETE CASCADE,
        completed BOOLEAN NOT NULL DEFAULT true,
        completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, topic_id)
      );
      CREATE INDEX IF NOT EXISTS idx_learning_topic_progress_user ON learning_topic_progress(user_id);
    `
  },
  {
    name: 'learning_streaks',
    query: `
      CREATE TABLE IF NOT EXISTS learning_streaks (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        subject VARCHAR(100) NOT NULL,
        current_streak INTEGER NOT NULL DEFAULT 0,
        longest_streak INTEGER NOT NULL DEFAULT 0,
        last_active_date DATE,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, subject)
      );
      CREATE INDEX IF NOT EXISTS idx_learning_streaks_user ON learning_streaks(user_id);
    `
  }
];

async function initializeTables() {
  console.log('🔄 Initializing database tables...');

  for (const table of tables) {
    try {
      await pool.query(table.query);
      console.log(`✅ ${table.name} table ready`);
    } catch (err) {
      console.error(`❌ ${table.name} table error:`, err.message);
    }
  }

  console.log('✅ All tables initialized');
}

module.exports = { initializeTables };
