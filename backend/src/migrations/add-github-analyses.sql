CREATE TABLE IF NOT EXISTS github_analyses (
  id            SERIAL PRIMARY KEY,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  username      VARCHAR(40) NOT NULL,
  overall_score INTEGER,
  grade         VARCHAR(20),
  report        JSONB,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_github_analyses_user_id ON github_analyses(user_id);
CREATE INDEX IF NOT EXISTS idx_github_analyses_created_at ON github_analyses(created_at DESC);
