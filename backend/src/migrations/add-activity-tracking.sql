CREATE TABLE IF NOT EXISTS daily_activity (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  activity_date DATE NOT NULL DEFAULT CURRENT_DATE,
  tool_name VARCHAR(100),
  activity_type VARCHAR(50) NOT NULL,
  activity_count INTEGER DEFAULT 1,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, activity_date, tool_name, activity_type)
);
CREATE INDEX IF NOT EXISTS idx_daily_activity_user_date ON daily_activity(user_id, activity_date);
CREATE INDEX IF NOT EXISTS idx_daily_activity_date ON daily_activity(activity_date);

CREATE TABLE IF NOT EXISTS student_achievements (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  achievement_key VARCHAR(100) NOT NULL,
  unlocked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, achievement_key)
);
CREATE INDEX IF NOT EXISTS idx_student_achievements_user_id ON student_achievements(user_id);
