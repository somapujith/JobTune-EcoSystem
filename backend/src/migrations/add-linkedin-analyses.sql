CREATE TABLE IF NOT EXISTS linkedin_analyses (
  id            SERIAL PRIMARY KEY,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  profile_url   VARCHAR(1000),
  target_roles  TEXT[],
  overall_score INTEGER,
  grade         VARCHAR(40),
  ai_powered    BOOLEAN DEFAULT false,
  report        JSONB,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_linkedin_analyses_user_id ON linkedin_analyses(user_id);
CREATE INDEX IF NOT EXISTS idx_linkedin_analyses_created_at ON linkedin_analyses(created_at DESC);
