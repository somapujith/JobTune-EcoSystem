-- ============================================================================================================
-- PROPOSED schema fixes for the Cloudflare Worker cutover.   NOT APPLIED ANYWHERE.   For the owner to review.
--
-- Origin: `backend/scripts/migration/validate-sql.js` PREPAREd + planned every one of the 219 SQL statements of
-- backend/src/worker/** on a real PostgreSQL 17.11 built from the Express boot DDL (initializeTables + runMigrations +
-- sessionService.ensureTables + the per-route module-load blocks + src/migrations/*.sql), in the two orders Express can
-- produce (see "Boot order" below). What still failed was NEVER a defect of the Worker port: every failing statement is
-- textually identical to an Express statement that fails the same way on the same schema (checked by normalized-text
-- pairing, 218 of 219 Worker statements have an identical Express twin; the 219th is `SELECT 1`).
-- Everything below is therefore a property of the SCHEMA Express creates (or fails to create), not of the port.
-- The Worker must not "fix" these (behavior parity); the schema is where they are closed.
--
-- HOW TO USE
--   1. Run `node backend/scripts/migration/check-schema.js --check` against a Neon BRANCH first: it says which of
--      the items below the branch actually has. Only apply what is missing.
--   2. Every statement is idempotent (`IF NOT EXISTS`) and additive. Sections marked DECISION are commented out: they
--      change behavior or relax a constraint and need an explicit owner call.
--   3. This file was itself executed on PostgreSQL 17 (both boot-order scenarios below): it applies cleanly, twice in
--      a row, and afterwards validate-sql.js reports 0 errors for the statements it covers.
--   4. Never run it straight on production. Branch first, re-run check-schema and validate-sql, then decide.
-- ============================================================================================================


-- ------------------------------------------------------------------------------------------------------------
-- A. Columns that NO DDL in the repository declares (table known)        [category c: missing schema; same in Express]
-- ------------------------------------------------------------------------------------------------------------
-- users.name       used by routes/admin.js GET /users (:75) and GET /audit-logs (:88, `u.name AS user_name`).
--                  Without it both admin endpoints answer 500 (Express: identical, routes/admin.js:47 / :60).
-- users.full_name  used by routes/community.js POST /forums/thread (:183) and /forums/thread/:id/reply (:207):
--                  `SELECT full_name FROM users` for the author name (falls back to 'Anonymous' only when the ROW has
--                  no value; a missing COLUMN is a 500). Express: routes/community.js:231 / :253.
-- Signup inserts neither, so both stay NULL until something writes them (the app already handles NULL: 'Anonymous').
-- If Neon already has these columns (they predate the repository's DDL), this is a no-op.
ALTER TABLE users ADD COLUMN IF NOT EXISTS name VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS full_name VARCHAR(255);


-- ------------------------------------------------------------------------------------------------------------
-- B. Tables NO Postgres DDL in the repository creates                    [category c; same in Express]
-- ------------------------------------------------------------------------------------------------------------
-- routes/aiCoach.js `GET /career-score` (:328, :359, :371) reads profiles, projects and interview_sessions. Each read is
-- inside a try/catch that swallows the error, so with the tables missing the route silently keeps its default scores
-- (profile 40, project 35, interview 25). DECISION: creating EMPTY tables changes the answer (a COUNT of 0 gives
-- 20 / 15 for project / interview instead of the 35 / 25 defaults). Create them only if production really has them
-- (check-schema --check on the branch says), or if the changed scores are acceptable. `projects` exists only in the
-- MySQL-dialect database.sql (`INT AUTO_INCREMENT`, `JSON`), which cannot have run on Neon; below is its translation.
--
-- DECISION (uncomment after review):
-- CREATE TABLE IF NOT EXISTS profiles (
--   id SERIAL PRIMARY KEY,
--   user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
--   headline VARCHAR(255),
--   bio TEXT,
--   github_url VARCHAR(500),
--   linkedin_url VARCHAR(500),
--   created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
--   updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
-- );
-- CREATE TABLE IF NOT EXISTS interview_sessions (
--   id SERIAL PRIMARY KEY,
--   user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
--   created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
-- );
-- CREATE INDEX IF NOT EXISTS idx_interview_sessions_user_id ON interview_sessions(user_id);
-- CREATE TABLE IF NOT EXISTS projects (            -- database.sql (MySQL) translated: INT AUTO_INCREMENT -> SERIAL, JSON -> JSONB
--   id SERIAL PRIMARY KEY,
--   user_id INT REFERENCES users(id) ON DELETE CASCADE,
--   project_id VARCHAR(100),
--   status VARCHAR(50),
--   progress INT DEFAULT 0,
--   dates JSONB,
--   created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
-- );
-- CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id);


-- ------------------------------------------------------------------------------------------------------------
-- C. Boot-order drift: which CREATE TABLE won decides which columns exist   [category b/c; same in Express]
-- ------------------------------------------------------------------------------------------------------------
-- Express boot (src/server.js) loads every route file FIRST (their module-load `CREATE TABLE IF NOT EXISTS` fires
-- immediately) and only then runs initializeTables(). For a table that both define, the route's shape usually wins the
-- race in a database Express created from scratch; on a database initialised with scripts/init_db.js (initializeTables
-- first) the initializeTables shape wins. Whichever it was, the OTHER shape's columns are missing. Additive, idempotent:

-- mock_interviews.feedback   (routes/interview.js:245 UPDATE ... feedback = $3): missing when initializeTables' shape won.
ALTER TABLE mock_interviews ADD COLUMN IF NOT EXISTS feedback JSONB;

-- resumes.scores / resumes.sections   (routes/resume.js:255 INSERT, :277 and :287 SELECT scores): resume.js's own
-- `migrations` list of ALTER ... ADD COLUMN never includes them (only its CREATE TABLE does), so they are missing
-- whenever initializeTables' `resumes` won the race.
ALTER TABLE resumes ADD COLUMN IF NOT EXISTS scores JSONB;
ALTER TABLE resumes ADD COLUMN IF NOT EXISTS sections JSONB;

-- analyses(resume_id) UNIQUE   (services/resumeDatabase.js:91 ON CONFLICT (resume_id)): present when runMigrations
-- created `analyses`; ABSENT when the table came from src/migrations/add-ats-tables.sql (no UNIQUE), where the statement
-- fails at plan time with 42P10 (proved on real PostgreSQL). First look for duplicates (must return 0 rows):
--   SELECT resume_id, COUNT(*) FROM analyses GROUP BY resume_id HAVING COUNT(*) > 1;
CREATE UNIQUE INDEX IF NOT EXISTS uq_analyses_resume_id ON analyses (resume_id);


-- ------------------------------------------------------------------------------------------------------------
-- D. learning_streaks: two incompatible shapes share one table name          [category b; same in Express]
-- ------------------------------------------------------------------------------------------------------------
-- routes/courses.js:54 creates   (user_id UNIQUE, current, longest, last_date, daily_goal)          -- one row per user
-- initializeTables.js:388 creates (user_id, subject NOT NULL, current_streak, longest_streak,
--                                   last_active_date, UNIQUE (user_id, subject))                    -- one row per user+subject
-- The Worker (like Express) uses BOTH: courses / dashboard / activityService the first, learningPathService the second.
-- No single existing shape satisfies every query, and (proved by executing them on real PostgreSQL) even a table that
-- carries every column is not enough, because the constraints disagree. The additive part is safe:
ALTER TABLE learning_streaks ADD COLUMN IF NOT EXISTS current INTEGER DEFAULT 0;
ALTER TABLE learning_streaks ADD COLUMN IF NOT EXISTS longest INTEGER DEFAULT 0;
ALTER TABLE learning_streaks ADD COLUMN IF NOT EXISTS last_date DATE;
ALTER TABLE learning_streaks ADD COLUMN IF NOT EXISTS daily_goal INTEGER DEFAULT 30;
ALTER TABLE learning_streaks ADD COLUMN IF NOT EXISTS subject VARCHAR(100);            -- nullable here, see below
ALTER TABLE learning_streaks ADD COLUMN IF NOT EXISTS current_streak INTEGER NOT NULL DEFAULT 0;
ALTER TABLE learning_streaks ADD COLUMN IF NOT EXISTS longest_streak INTEGER NOT NULL DEFAULT 0;
ALTER TABLE learning_streaks ADD COLUMN IF NOT EXISTS last_active_date DATE;
-- learningPathService's `ON CONFLICT (user_id, subject)` needs exactly this unique index (a no-op when the
-- initializeTables shape already has it):
CREATE UNIQUE INDEX IF NOT EXISTS uq_learning_streaks_user_subject ON learning_streaks (user_id, subject);

-- DECISION (do NOT uncomment blindly): the runtime conflicts that remain, found by executing the statements
--   (a) table came from courses.js: `user_id UNIQUE` (constraint learning_streaks_user_id_key) allows one row per user, so
--       learningPathService's second subject for the same user fails with 23505.
--   (b) table came from initializeTables: `subject NOT NULL` makes courses.js:634
--       `INSERT INTO learning_streaks (user_id, current, longest, last_date) ...` fail with 23502.
--   Relaxing both makes the two features share rows keyed by (user_id, subject) with NULL subject meaning "the course
--   streak"; SELECT ... WHERE user_id = $1 (courses/dashboard/activityService) may then see several rows and read the
--   first. The clean fix is TWO tables (a code change in Express AND the Worker), which is a post-cutover PR, not a schema patch.
-- ALTER TABLE learning_streaks DROP CONSTRAINT IF EXISTS learning_streaks_user_id_key;
-- ALTER TABLE learning_streaks ALTER COLUMN subject DROP NOT NULL;


-- ------------------------------------------------------------------------------------------------------------
-- E. Not schema, but found on the way (nothing to run; owner/Express follow-ups)
-- ------------------------------------------------------------------------------------------------------------
-- * Express boot order on an EMPTY database: `require('./app')` runs the route module-load DDL before initializeTables()
--   has created `users`, so `project_workspace` (routes/projectBuilder.js:11), `code_reviews` and `career_coach_sessions`
--   (routes/aiCoach.js:49/69), which reference users(id), fail with 42P01 on the first boot (the error is only
--   console.error'd); they appear only on the NEXT boot. Reproduced with scripts/migration/replay-boot-ddl.js.
-- * database.sql: all 5 statements fail on PostgreSQL with 42601 (`INT AUTO_INCREMENT`, MySQL dialect). Not fixed.
-- * src/migrations/add-ats-tables.sql declares `resumes.original_resume TEXT NOT NULL`; a database where it created
--   `resumes` breaks routes/resume.js's INSERT (no original_resume) at runtime with 23502. PREPARE cannot see this.
-- * subscription_plans must hold its 3 seed rows (check-schema cannot see rows): SELECT COUNT(*) FROM subscription_plans;
