-- ATS Analysis Tables

-- Resumes table
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
);

-- Analyses table
CREATE TABLE IF NOT EXISTS analyses (
  id SERIAL PRIMARY KEY,
  resume_id INTEGER NOT NULL,
  section_completeness INTEGER,
  keyword_relevance INTEGER,
  formatting_score INTEGER,
  action_verbs_count INTEGER,
  metrics_count INTEGER,
  missing_sections JSONB,
  recommendations JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (resume_id) REFERENCES resumes(id) ON DELETE CASCADE
);

-- Export history
CREATE TABLE IF NOT EXISTS resume_exports (
  id SERIAL PRIMARY KEY,
  resume_id INTEGER NOT NULL,
  export_format VARCHAR(10), -- 'docx' or 'pdf'
  file_path VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (resume_id) REFERENCES resumes(id) ON DELETE CASCADE
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_resumes_user_id ON resumes(user_id);
CREATE INDEX IF NOT EXISTS idx_resumes_created_at ON resumes(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analyses_resume_id ON analyses(resume_id);
CREATE INDEX IF NOT EXISTS idx_exports_resume_id ON resume_exports(resume_id);
