-- Local-only fixture for the S11 spike (database spike_s11 in the disposable s11-pg container).
-- Minimal stand-in so `SELECT COUNT(*) FROM users` has something to count. Idempotent.
CREATE TABLE IF NOT EXISTS users (
  id serial PRIMARY KEY,
  email text UNIQUE NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO users (email) VALUES ('a@example.invalid'), ('b@example.invalid'), ('c@example.invalid')
ON CONFLICT (email) DO NOTHING;
