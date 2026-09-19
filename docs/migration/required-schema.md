# Required schema for the Cloudflare Worker

> Generated file. Regenerate with `node backend/scripts/migration/check-schema.js --extract --md docs/migration/required-schema.md` (offline, read-only, no database or network). Do not edit the tables by hand.
> Scope: the SQL in `backend/src/worker/**` (140 files, 211 SQL statements) resolved against every DDL the repository contains.
> Companion tool: `backend/scripts/migration/check-schema.js --check` compares the same requirements with a live Neon catalog.

## Cutover prerequisite (read this first)

The Worker never creates schema (ADR-001 section 6.5): `initializeTables`, `runMigrations`, `sessionService.ensureTables` and the per-route module-load `CREATE TABLE IF NOT EXISTS` blocks are deliberately excluded. **Every table, column and unique constraint listed below must already exist in the Neon database the Worker points at** before the `/api` prefix that uses it receives traffic. Nothing in the Worker will create a missing table; the routes will 500 (or, where the Express code swallowed the error, silently return fallback data).

**38 of the 52 tables exist only because Express created them at boot** (no standalone Postgres DDL file defines them; `database.sql` is MySQL dialect and cannot have been applied to Neon). They exist in Neon only if Render has booted the current Express code against that database, or if a migration/restore carried them over. A brand-new Neon branch/project that Render never booted will lack them, and so will any table added to Express after the last Render boot.

**Some of that DDL is not even committed.** These exist only in uncommitted edits of Express boot files (compared with git `HEAD`), so Neon has them only if Render has been redeployed with those edits and booted:

- table `career_discovery_responses` (`src/utils/runMigrations.js:234`)
- column `users.onboarding_completed` (`src/utils/runMigrations.js:245`)

How to check, before flipping any prefix (read-only; run it against a Neon **branch** of the target database first, never first against production):

```bash
# bash / zsh                                   PowerShell equivalent: $env:DATABASE_URL = '<branch url>'
export DATABASE_URL='postgresql://<user>:<password>@<branch-host>/<db>?sslmode=require'   # this shell only; never commit it
node backend/scripts/migration/check-schema.js --check                      # exit 0 = everything present, 1 = something missing, 2 = could not run
node backend/scripts/migration/check-schema.js --check --print-fix-sql      # also PRINT the CREATE/ALTER statements that would fix the gaps
# use another variable name to avoid touching the one Express uses:  --url-env NEON_BRANCH_URL
```

The script sends only fixed catalog `SELECT`s (`information_schema.tables`, `information_schema.columns`, `pg_constraint`, `pg_indexes`), behind a guard that refuses anything that is not a single plain `SELECT`. It never prints the connection string or credentials, never reads `backend/.env`, and `--print-fix-sql` only prints: run the printed DDL yourself, on the branch.

What `--check` does **not** prove: column types/defaults/nullability, non-unique indexes, foreign keys, and **row data**. In particular `subscription_plans` must contain the three plan rows (Express boot seeds them; `requirePlan` and `/api/subscriptions/*` read them), and `onet_occupations` / `learning_topics` are filled by seed scripts, not by boot. Check those with a `SELECT` on the branch. Use the database **owner** role: `information_schema` lists only objects the connecting role may access, so a role without privileges would report existing tables as missing.

### Tables to verify per `/api` prefix (boot-created only)

Used by shared code (services / middleware), so they gate every prefix that calls that code:

- `audit_logs` via `middleware/auditLogger.js`
- `course_enrollments` via `services/activityService.js`
- `evidence_bullets` via `services/evidence/evidenceTracker.js`
- `evidence_usage` via `services/evidence/evidenceTracker.js`
- `job_applications` via `services/guides/jobGuideGenerator.js`
- `job_guides` via `services/guides/jobGuideGenerator.js`
- `learning_streaks` via `services/activityService.js`, `services/learningPathService.js`
- `learning_topic_progress` via `services/learningPathService.js`
- `learning_topics` via `services/learningPathService.js`
- `mock_interviews` via `services/activityService.js`
- `onet_occupations` via `services/taxonomy/onetLoader.js`
- `practice_submissions` via `services/activityService.js`
- `scorer_benchmarks` via `services/benchmarks/scorerBenchmark.js`
- `skill_assessments` via `services/activityService.js`
- `srs_cards` via `services/srsService.js`
- `study_sessions` via `services/studyHistoryService.js`
- `tutor_conversations` via `services/tutorHistoryService.js`
- `user_progress` via `services/progressService.js`
- `user_sessions` via `services/sessionService.js`
- `users` via `services/planService.js`

| /api prefix | Boot-created tables the route file itself queries |
|---|---|
| `/api/admin` | `audit_logs`, `users` |
| `/api/admin-panels` | `users` |
| `/api/ai-coach` | `career_coach_sessions`, `code_reviews` |
| `/api/auth` | `user_sessions`, `users` |
| `/api/benchmarks` | `users` |
| `/api/career` | `career_discovery_responses`, `career_roadmaps` |
| `/api/community` | `community_events`, `community_replies`, `community_threads`, `community_votes`, `study_groups`, `users` |
| `/api/courses` | `course_enrollments`, `courses`, `learning_paths`, `learning_streaks` |
| `/api/dashboard` | `career_roadmaps`, `course_enrollments`, `job_applications`, `learning_streaks`, `mock_interviews`, `practice_submissions`, `skill_assessments` |
| `/api/evidence` | `evidence_bullets`, `evidence_usage` |
| `/api/interview` | `mock_interviews` |
| `/api/jobs` | `discovered_jobs`, `job_applications` |
| `/api/learning` | `learning_roadmaps` |
| `/api/pii` | `pii_redactions` |
| `/api/practice` | `assessment_submissions`, `practice_bookmarks`, `practice_submissions` |
| `/api/project-builder` | `project_workspace` |
| `/api/resume` | `resume_embeddings` |
| `/api/resume-chat` | `resume_embeddings` |
| `/api/skills` | `skill_assessments` |

## Summary

| Measure | Count |
|---|---|
| Tables referenced by the Worker | 52 |
| Columns referenced (INSERT lists, SET targets, qualified refs, single-table selects) | 328 |
| Defined in `database.sql` | 4 (1 only as MySQL DDL) |
| Defined in a migration file (`src/migrations/*.sql`), not in `database.sql` | 10 (9 also created by Express boot) |
| Defined only by Express boot DDL (initializeTables / runMigrations / route module-load / sessionService) | 36 |
| **NOT FOUND ANYWHERE** | **2** |
| Tables whose only Postgres-applicable DDL is Express boot ("exists only because Express boot created it") | 38 |
| Columns declared nowhere (table known) | 2 |
| ON CONFLICT targets needing a unique constraint / with no matching unique in any DDL | 13 / 0 |
| Tables with conflicting CREATE statements across files (repository-wide) | 7 |

The four DDL rows (`database.sql`, migration-only, boot-only, NOT FOUND) partition the referenced tables by first match in that order; the parenthesised counts show overlap with the other sources.

## Findings

### 1. Tables the Worker uses that no DDL in the repository defines

- **`interview_sessions`**: columns used: user_id; Worker files: `routes/aiCoach.js:372`. Every use is inside a try/catch. Express also references it (`routes/aiCoach.js:379`), so this is pre-existing on Render, not introduced by the port. If this table exists in Neon it came from outside this repository (an earlier database, manual DDL). `--check` tells you.
- **`profiles`**: columns used: bio, github_url, headline, linkedin_url, user_id; Worker files: `routes/aiCoach.js:329`. Every use is inside a try/catch. Express also references it (`routes/aiCoach.js:336`), so this is pre-existing on Render, not introduced by the port. If this table exists in Neon it came from outside this repository (an earlier database, manual DDL). `--check` tells you.

### 2. Columns the Worker uses that no DDL declares (table is known)

- **`users.full_name`** (inferred): `routes/community.js:183`, `routes/community.js:207`. Express also references it (`routes/community.js:231`, `routes/community.js:253`), so this is pre-existing on Render, not introduced by the port. No CREATE TABLE or ALTER TABLE in the repository adds it; if it exists in Neon it predates the repository's DDL. `--check` reports it as missing when it is not there.
- **`users.name`** (certain): `routes/admin.js:75`, `routes/admin.js:88`. Express also references it (`routes/admin.js:47`, `routes/admin.js:60`), so this is pre-existing on Render, not introduced by the port. No CREATE TABLE or ALTER TABLE in the repository adds it; if it exists in Neon it predates the repository's DDL. `--check` reports it as missing when it is not there.

### 3. ON CONFLICT targets and the unique constraints they need

`INSERT ... ON CONFLICT (cols)` raises an error at runtime unless a `UNIQUE`/`PRIMARY KEY` constraint (or unique index) on exactly those columns exists. `--check` verifies this against `pg_constraint` / `pg_indexes`.

| Table | Conflict target | Action | Worker location | Declared by (known DDL) |
|---|---|---|---|---|
| `analyses` | (resume_id) | update | `services/resumeDatabase.js:91` | Express boot src/utils/runMigrations.js:183 |
| `career_discovery_responses` | (user_id) | update | `routes/careerRoadmap.js:172` | Express boot src/utils/runMigrations.js:234 |
| `course_enrollments` | (user_id, course_id) | nothing | `routes/courses.js:551` | Express boot src/routes/courses.js:31 |
| `daily_activity` | (user_id, activity_date, tool_name, activity_type) | update | `services/activityService.js:38` | migration src/migrations/add-activity-tracking.sql<br>Express boot src/utils/initializeTables.js:271<br>Express boot src/utils/runMigrations.js:137 |
| `discovered_jobs` | (source, external_id) | nothing | `routes/jobDiscovery.js:43` | Express boot src/utils/initializeTables.js:133 |
| `evidence_bullets` | (user_id, bullet_hash) | nothing | `services/evidence/evidenceTracker.js:143` | Express boot src/utils/initializeTables.js:180 |
| `learning_streaks` | (user_id, subject) | update | `services/learningPathService.js:106` | Express boot src/utils/initializeTables.js:388 |
| `learning_topic_progress` | (user_id, topic_id) | update | `services/learningPathService.js:137` | Express boot src/utils/initializeTables.js:374 |
| `onboarding_responses` | (user_id) | update | `services/planService.js:63` | migration src/migrations/add-subscriptions.sql<br>Express boot src/utils/runMigrations.js:44 |
| `onet_occupations` | (code) | update | `services/taxonomy/onetLoader.js:112` | Express boot src/utils/initializeTables.js:240 |
| `srs_cards` | (user_id, deck_id, front) | update | `services/srsService.js:42` | Express boot src/utils/initializeTables.js:335 |
| `user_progress` | (user_id, context_key) | update | `services/progressService.js:59` | Express boot src/services/sessionService.js:42 |
| `user_subscriptions` | (user_id) | update | `services/planService.js:54` | migration src/migrations/add-subscriptions.sql<br>Express boot src/utils/runMigrations.js:32 |

### 4. Schema drift: one table, several incompatible CREATE statements

#### `analyses` (used by the Worker)

- variant 1: `src/migrations/add-ats-tables.sql:20` declares `id`, `resume_id`, `section_completeness`, `keyword_relevance`, `formatting_score`, `action_verbs_count`, `metrics_count`, `missing_sections`, `recommendations`, `created_at`. Covers every column the Worker uses.
- variant 2: `src/utils/runMigrations.js:183` declares `id`, `resume_id`, `section_completeness`, `keyword_relevance`, `formatting_score`, `action_verbs_count`, `metrics_count`, `missing_sections`, `recommendations`, `created_at`. Covers every column the Worker uses.
- differences: unique constraints differ: (resume_id) only in variant(s) 2.

#### `learning_roadmaps` (used by the Worker)

- variant 1: `src/routes/learning.js:12` declares `id`, `user_id`, `gaps`, `target_role`, `roadmap`, `ai_powered`, `created_at`. Covers every column the Worker uses.
- variant 2: `src/utils/initializeTables.js:67` declares `id`, `user_id`, `gaps`, `target_role`, `roadmap`, `ai_powered`, `created_at`. Covers every column the Worker uses.
- differences: type family differs: `gaps` (jsonb in 1 vs text in 2).

#### `learning_streaks` (used by the Worker)

- variant 1: `src/routes/courses.js:55` declares `id`, `user_id`, `current`, `longest`, `last_date`, `daily_goal`, `updated_at`. Worker columns this shape lacks: `current_streak`, `last_active_date`, `longest_streak`, `subject`. Worker code that needs this shape: `routes/courses.js`, `routes/dashboard.js`, `services/activityService.js` (`current`, `daily_goal`, `last_date`, `longest`).
- variant 2: `src/utils/initializeTables.js:388` declares `id`, `user_id`, `subject`, `current_streak`, `longest_streak`, `last_active_date`, `updated_at`. Worker columns this shape lacks: `current`, `daily_goal`, `last_date`, `longest`. Worker code that needs this shape: `services/learningPathService.js` (`current_streak`, `last_active_date`, `longest_streak`, `subject`).
- differences: column sets differ: `current` only in variant(s) 1; `current_streak` only in variant(s) 2; `daily_goal` only in variant(s) 1; `last_active_date` only in variant(s) 2; `last_date` only in variant(s) 1; `longest` only in variant(s) 1; `longest_streak` only in variant(s) 2; `subject` only in variant(s) 2. unique constraints differ: (subject,user_id) only in variant(s) 2; (user_id) only in variant(s) 1.
- **No single variant satisfies every Worker query** (Worker files touching it: `routes/courses.js`, `routes/dashboard.js`, `services/activityService.js`, `services/learningPathService.js`). Whichever `CREATE TABLE IF NOT EXISTS` ran first in the live database decides which queries work; this is a pre-existing Express inconsistency the port preserves. `--check` shows the columns actually present.

#### `mock_interviews` (used by the Worker)

- variant 1: `src/routes/interview.js:12` declares `id`, `user_id`, `role`, `messages`, `feedback`, `score`, `created_at`. Covers every column the Worker uses. Worker code that needs this shape: `routes/interview.js` (`feedback`).
- variant 2: `src/utils/initializeTables.js:38` declares `id`, `user_id`, `role`, `messages`, `score`, `created_at`. Worker columns this shape lacks: `feedback`.
- differences: column sets differ: `feedback` only in variant(s) 1.

#### `resumes` (used by the Worker)

- variant 1: `database.sql` (MySQL dialect) declares `id`, `user_id`, `content`, `scores`, `sections`, `file_url`, `created_at`. (MySQL syntax: cannot have run on Postgres, so not counted.)
- variant 2: `src/migrations/add-ats-tables.sql:4` declares `id`, `user_id`, `original_resume`, `optimized_resume`, `original_score`, `optimized_score`, `role_detected`, `keyword_coverage`, `missing_info`, `created_at`, `updated_at`. Worker columns this shape lacks: `scores`, `sections`.
- variant 3: `src/routes/resume.js:36` declares `id`, `user_id`, `file_name`, `file_size`, `scores`, `sections`, `suggestions`, `overall_score`, `created_at`. Covers every column the Worker uses. Worker code that needs this shape: `routes/resume.js` (`scores`, `sections`).
- variant 4: `src/utils/initializeTables.js:23` declares `id`, `user_id`, `file_name`, `file_size`, `overall_score`, `created_at`, `updated_at`. Worker columns this shape lacks: `scores`, `sections`.
- variant 5: `src/utils/runMigrations.js:77` declares `id`, `user_id`, `original_resume`, `optimized_resume`, `original_score`, `optimized_score`, `role_detected`, `keyword_coverage`, `missing_info`, `created_at`, `updated_at`. Worker columns this shape lacks: `scores`, `sections`.
- differences: column sets differ: `content` only in variant(s) 1; `file_url` only in variant(s) 1; `scores` only in variant(s) 1/3; `sections` only in variant(s) 1/3. type family differs: `scores` (json in 1 vs jsonb in 3); `sections` (json in 1 vs jsonb in 3). later reconciled by ALTER TABLE ADD COLUMN: `file_name`, `file_size`, `keyword_coverage`, `missing_info`, `optimized_resume`, `optimized_score`, `original_resume`, `original_score`, `overall_score`, `role_detected`, `suggestions`, `updated_at`.

#### `skill_assessments` (used by the Worker)

- variant 1: `database.sql` (MySQL dialect) declares `id`, `user_id`, `skills`, `strengths`, `gaps`, `role_matches`, `created_at`. (MySQL syntax: cannot have run on Postgres, so not counted.)
- variant 2: `src/utils/initializeTables.js:52` declares `id`, `user_id`, `skills`, `strengths`, `gaps`, `role_matches`, `created_at`. Covers every column the Worker uses.
- differences: type family differs: `gaps` (json in 1 vs text in 2); `role_matches` (json in 1 vs jsonb in 2); `skills` (json in 1 vs jsonb in 2); `strengths` (json in 1 vs text in 2).

#### `users` (used by the Worker)

- variant 1: `database.sql` (MySQL dialect) declares `id`, `email`, `password_hash`, `github_username`, `linkedin_url`, `created_at`. (MySQL syntax: cannot have run on Postgres, so not counted.)
- variant 2: `src/utils/initializeTables.js:7` declares `id`, `email`, `password_hash`, `github_username`, `linkedin_url`, `role`, `created_at`, `updated_at`. Worker columns this shape lacks: `full_name`, `name`.
- differences: column sets differ: `role` only in variant(s) 2; `updated_at` only in variant(s) 2.

`database.sql` and `init_admin_db.js` use MySQL syntax (`AUTO_INCREMENT`, `JSON`, `ENUM`); neither can have run on Postgres/Neon as written.
Worker-referenced tables whose only DDL is MySQL dialect: `projects`.

### 5. Columns that exist only through Express boot on tables that also have a standalone DDL file

- `resumes.file_name`: `src/routes/resume.js:36`
- `resumes.file_size`: `src/routes/resume.js:36`
- `resumes.overall_score`: `src/routes/resume.js:36`
- `resumes.scores`: `src/routes/resume.js:36`
- `resumes.sections`: `src/routes/resume.js:36`
- `resumes.suggestions`: `src/routes/resume.js:36`

### 6. SQL the scanner could not fully resolve

- SQL fragment built at runtime at `services/srsService.js:41`: `values`
- `.query(query)` at `routes/dashboard.js:205`: argument is not a static string (its SQL, if listed elsewhere as a literal, is still counted)

### 7. DDL issued by the Worker

None (expected: ADR 6.5).

### 8. Seed data that Express boot also writes

- `subscription_plans`: rows inserted by `src/migrations/add-subscriptions.sql:48`, `src/utils/runMigrations.js:58` (`runMigrations.js` also re-syncs plan price/description/features on every boot). A table that exists but is empty passes `--check` and still breaks plan gating.

### 9. Parity with the Express SQL

The same extraction over the Express runtime SQL (`src/routes`, `src/services`, `src/middleware`, `src/utils`, `src/config`; the boot DDL files `initializeTables.js` / `runMigrations.js` excluded) requires **exactly the same tables and columns** as the Worker: no Worker-only and no Express-only reference. So the schema requirements above are also what Render needs today; the port adds none.

## Required schema, table by table

Legend: **R/W** = the Worker only reads (R), only writes (W) or both. **Columns**: `col` found in known DDL; `col†` declared nowhere; `col*` declared only by Express boot although the table also has a standalone DDL file; `col‡` declared only in an uncommitted edit of an Express boot file. `(try)` after a file: every query on that table in that file sits inside a `try` block (the catch may still answer 500; read the handler). Columns are those determinable from INSERT lists, UPDATE/ON CONFLICT SET targets, `alias.col` and single-table selects (multi-table unqualified names are not attributed). **Boot-only?** = the only Postgres-applicable DDL is Express boot code (yes means the table must have been created by a Render boot or restored).

| Table | R/W | Columns the Worker uses | DDL source(s) | Exists only because Express boot created it? | Worker files | /api prefixes |
|---|---|---|---|---|---|---|
| `analyses` | W | `action_verbs_count`, `created_at`, `formatting_score`, `id`, `keyword_relevance`, `metrics_count`, `missing_sections`, `recommendations`, `resume_id`, `section_completeness` | migration file src/migrations/add-ats-tables.sql<br>Express boot at src/utils/runMigrations.js:183 | no | `services/resumeDatabase.js` (try) | shared code |
| `assessment_submissions` | R/W | `answers`, `assessment_id`, `results`, `score`, `time_taken`, `total`, `user_id` | Express boot at src/routes/practice.js:25 | **yes** | `routes/practice.js` (try) | `/api/practice` |
| `audit_logs` | R/W | `action`, `created_at`, `details`, `id`, `ip_address`, `resource`, `user_id` | Express boot at src/utils/initializeTables.js:211 | **yes** | `middleware/auditLogger.js` (try)<br>`routes/admin.js` (try) | `/api/admin`<br>shared code |
| `career_coach_sessions` | W | `data`, `session_type`, `target_role`, `user_id` | Express boot at src/routes/aiCoach.js:70 | **yes** | `routes/aiCoach.js` (try) | `/api/ai-coach` |
| `career_discovery_responses` | R/W | `answers`, `id`, `sub_answers`, `updated_at`, `user_id` | Express boot at src/utils/runMigrations.js:234<br>**(uncommitted edit only)** | **yes** | `routes/careerRoadmap.js` (try) | `/api/career` |
| `career_roadmaps` | R/W | `created_at`, `current_role`, `id`, `roadmap`, `target_role`, `timeframe`, `user_id` | Express boot at src/utils/initializeTables.js:82 | **yes** | `routes/careerRoadmap.js` (try)<br>`routes/dashboard.js` (try) | `/api/career`<br>`/api/dashboard` |
| `code_reviews` | R/W | `code_snippet`, `created_at`, `id`, `issues_count`, `language`, `review_type`, `score`, `user_id` | Express boot at src/routes/aiCoach.js:50 | **yes** | `routes/aiCoach.js` (try) | `/api/ai-coach` |
| `community_events` | R | `event_date` | Express boot at src/routes/community.js:73 | **yes** | `routes/community.js` (try) | `/api/community` |
| `community_replies` | R/W | `author_name`, `body`, `created_at`, `thread_id`, `user_id` | Express boot at src/routes/community.js:37 | **yes** | `routes/community.js` (try) | `/api/community` |
| `community_threads` | R/W | `author_name`, `body`, `category`, `created_at`, `id`, `reply_count`, `tags`, `title`, `user_id`, `views`, `votes` | Express boot at src/routes/community.js:22 | **yes** | `routes/community.js` (try) | `/api/community` |
| `community_votes` | R/W | `direction`, `id`, `reply_id`, `thread_id`, `user_id` | Express boot at src/routes/community.js:48 | **yes** | `routes/community.js` (try) | `/api/community` |
| `course_enrollments` | R/W | `completed_lessons`, `course_id`, `progress`, `updated_at`, `user_id` | Express boot at src/routes/courses.js:31 | **yes** | `routes/courses.js`<br>`routes/dashboard.js` (try)<br>`services/activityService.js` | `/api/courses`<br>`/api/dashboard`<br>shared code |
| `courses` | R | `id` | Express boot at src/routes/courses.js:12 | **yes** | `routes/courses.js` (try) | `/api/courses` |
| `daily_activity` | R/W | `activity_count`, `activity_date`, `activity_type`, `metadata`, `tool_name`, `user_id` | migration file src/migrations/add-activity-tracking.sql<br>Express boot at src/utils/initializeTables.js:271<br>Express boot at src/utils/runMigrations.js:137 | no | `routes/dashboard.js` (try)<br>`services/activityService.js` | `/api/dashboard`<br>shared code |
| `discovered_jobs` | W | `company`, `description`, `external_id`, `location`, `source`, `tags`, `title`, `url`, `user_id` | Express boot at src/utils/initializeTables.js:133 | **yes** | `routes/jobDiscovery.js` (try) | `/api/jobs` |
| `evidence_bullets` | R/W | `bullet_hash`, `bullet_text`, `created_at`, `embedding`, `id`, `skills`, `source_section`, `user_id` | Express boot at src/utils/initializeTables.js:180 | **yes** | `routes/evidence.js` (try)<br>`services/evidence/evidenceTracker.js` | `/api/evidence`<br>shared code |
| `evidence_usage` | R/W | `application_id`, `bullet_id`, `context`, `id` | Express boot at src/utils/initializeTables.js:197 | **yes** | `routes/evidence.js` (try)<br>`services/evidence/evidenceTracker.js` | `/api/evidence`<br>shared code |
| `github_analyses` | R/W | `created_at`, `grade`, `id`, `overall_score`, `report`, `user_id`, `username` | migration file src/migrations/add-github-analyses.sql | no | `routes/profiles.js` (try) | `/api/profiles` |
| `interview_sessions` | R | `user_id` | **NOT FOUND ANYWHERE** | n/a (no DDL) | `routes/aiCoach.js` (try) | `/api/ai-coach` |
| `job_applications` | R/W | `applied_at`, `company`, `id`, `job_description`, `job_url`, `notes`, `role`, `source`, `status`, `updated_at`, `user_id` | Express boot at src/utils/initializeTables.js:113 | **yes** | `routes/dashboard.js` (try)<br>`routes/jobTracker.js` (try)<br>`services/guides/jobGuideGenerator.js` | `/api/dashboard`<br>`/api/jobs`<br>shared code |
| `job_guides` | R/W | `application_id`, `guide`, `id`, `user_id` | Express boot at src/utils/initializeTables.js:154 | **yes** | `services/guides/jobGuideGenerator.js` | shared code |
| `learning_paths` | R | `id` | Express boot at src/routes/courses.js:43 | **yes** | `routes/courses.js` (try) | `/api/courses` |
| `learning_roadmaps` | R/W | `ai_powered`, `created_at`, `gaps`, `id`, `roadmap`, `target_role`, `user_id` | Express boot at src/routes/learning.js:12<br>Express boot at src/utils/initializeTables.js:67 | **yes** | `routes/learning.js` | `/api/learning` |
| `learning_streaks` | R/W | `current`, `current_streak`, `daily_goal`, `last_active_date`, `last_date`, `longest`, `longest_streak`, `subject`, `updated_at`, `user_id` | Express boot at src/routes/courses.js:55<br>Express boot at src/utils/initializeTables.js:388 | **yes** | `routes/courses.js` (try)<br>`routes/dashboard.js` (try)<br>`services/activityService.js`<br>`services/learningPathService.js` | `/api/courses`<br>`/api/dashboard`<br>shared code |
| `learning_topic_progress` | R/W | `completed`, `completed_at`, `id`, `topic_id`, `user_id` | Express boot at src/utils/initializeTables.js:374 | **yes** | `services/learningPathService.js` | shared code |
| `learning_topics` | R | `content_md`, `id`, `slug`, `subject`, `tier`, `title`, `topic_order` | Express boot at src/utils/initializeTables.js:356 | **yes** | `services/learningPathService.js` | shared code |
| `linkedin_analyses` | R/W | `ai_powered`, `created_at`, `grade`, `id`, `overall_score`, `profile_url`, `report`, `target_roles`, `user_id` | migration file src/migrations/add-linkedin-analyses.sql<br>Express boot at src/utils/initializeTables.js:253<br>Express boot at src/utils/runMigrations.js:96 | no | `routes/dashboard.js` (try)<br>`services/activityService.js`<br>`services/linkedinAnalysisStore.js` | `/api/dashboard`<br>shared code |
| `mock_interviews` | R/W | `created_at`, `feedback`, `id`, `messages`, `role`, `score`, `user_id` | Express boot at src/routes/interview.js:12<br>Express boot at src/utils/initializeTables.js:38 | **yes** | `routes/dashboard.js` (try)<br>`routes/interview.js`<br>`services/activityService.js` | `/api/dashboard`<br>`/api/interview`<br>shared code |
| `onboarding_responses` | R/W | `career_goal`, `experience_level`, `field_of_interest`, `pain_points`, `recommended_plan_id`, `user_id` | migration file src/migrations/add-subscriptions.sql<br>Express boot at src/utils/runMigrations.js:44 | no | `routes/dashboard.js` (try)<br>`services/planService.js` | `/api/dashboard`<br>shared code |
| `onet_occupations` | W | `code`, `description`, `domain`, `keywords`, `skills`, `title` | Express boot at src/utils/initializeTables.js:240 | **yes** | `services/taxonomy/onetLoader.js` | shared code |
| `pii_redactions` | R/W | `context_id`, `context_type`, `id`, `redaction_map`, `user_id` | Express boot at src/utils/initializeTables.js:226 | **yes** | `routes/piiRedaction.js` (try) | `/api/pii` |
| `plan_orders` | R/W | `amount`, `order_ref`, `paid_at`, `plan_id`, `status`, `user_id` | migration file src/migrations/add-subscriptions.sql<br>Express boot at src/utils/runMigrations.js:219 | no | `services/planService.js` | shared code |
| `practice_bookmarks` | R/W | `id`, `problem_id`, `user_id` | Express boot at src/routes/practice.js:38 | **yes** | `routes/practice.js` (try) | `/api/practice` |
| `practice_submissions` | R/W | `code`, `created_at`, `feedback`, `id`, `language`, `passed`, `problem_id`, `results`, `user_id` | Express boot at src/routes/practice.js:12 | **yes** | `routes/dashboard.js` (try)<br>`routes/practice.js` (try)<br>`services/activityService.js` | `/api/dashboard`<br>`/api/practice`<br>shared code |
| `profiles` | R | `bio`, `github_url`, `headline`, `linkedin_url`, `user_id` | **NOT FOUND ANYWHERE** | n/a (no DDL) | `routes/aiCoach.js` (try) | `/api/ai-coach` |
| `project_workspace` | R/W | `created_at`, `id`, `name`, `notes`, `plan`, `status`, `tasks`, `updated_at`, `user_id` | Express boot at src/routes/projectBuilder.js:12 | **yes** | `routes/projectBuilder.js` (try) | `/api/project-builder` |
| `projects` | R | `user_id` | database.sql (MySQL dialect) | no | `routes/aiCoach.js` (try) | `/api/ai-coach` |
| `resume_embeddings` | R/W | `chunk_index`, `chunk_text`, `embedding`, `resume_id`, `user_id` | Express boot at src/utils/initializeTables.js:98 | **yes** | `routes/resume.js`<br>`routes/resumeChat.js` (try) | `/api/resume`<br>`/api/resume-chat` |
| `resume_exports` | R/W | `created_at`, `export_format`, `file_path`, `id`, `resume_id` | migration file src/migrations/add-ats-tables.sql<br>Express boot at src/utils/runMigrations.js:198 | no | `services/resumeDatabase.js` (try) | shared code |
| `resumes` | R/W | `created_at`, `file_name`*, `file_size`*, `id`, `keyword_coverage`, `missing_info`, `optimized_resume`, `optimized_score`, `original_resume`, `original_score`, `overall_score`*, `role_detected`, `scores`*, `sections`*, `suggestions`*, `updated_at`, `user_id` | database.sql (MySQL dialect)<br>migration file src/migrations/add-ats-tables.sql<br>Express boot at src/routes/resume.js:36<br>Express boot at src/utils/initializeTables.js:23<br>Express boot at src/utils/runMigrations.js:77 | no | `routes/aiCoach.js` (try)<br>`routes/dashboard.js` (try)<br>`routes/resume.js`<br>`services/activityService.js`<br>`services/resumeDatabase.js` (try) | `/api/ai-coach`<br>`/api/dashboard`<br>`/api/resume`<br>shared code |
| `scorer_benchmarks` | W | `dataset_name`, `metrics`, `sample_size`, `scorer_name` | Express boot at src/utils/initializeTables.js:167 | **yes** | `services/benchmarks/scorerBenchmark.js` | shared code |
| `skill_assessments` | R/W | `created_at`, `gaps`, `id`, `role_matches`, `skills`, `strengths`, `user_id` | database.sql (MySQL dialect)<br>Express boot at src/utils/initializeTables.js:52 | **yes** | `routes/dashboard.js` (try)<br>`routes/skills.js`<br>`services/activityService.js` | `/api/dashboard`<br>`/api/skills`<br>shared code |
| `srs_cards` | R/W | `back`, `created_at`, `deck_id`, `difficulty`, `ease_factor`, `front`, `id`, `interval_days`, `last_reviewed`, `next_review`, `repetitions`, `user_id` | Express boot at src/utils/initializeTables.js:335 | **yes** | `services/srsService.js` | shared code |
| `student_achievements` | R/W | `achievement_key`, `unlocked_at`, `user_id` | migration file src/migrations/add-activity-tracking.sql<br>Express boot at src/utils/initializeTables.js:289<br>Express boot at src/utils/runMigrations.js:150 | no | `services/activityService.js` | shared code |
| `study_groups` | R/W | `color`, `created_at`, `creator_id`, `description`, `max_members`, `name`, `topic` | Express boot at src/routes/community.js:59 | **yes** | `routes/community.js` (try) | `/api/community` |
| `study_sessions` | R/W | `created_at`, `data`, `difficulty`, `id`, `score`, `session_type`, `time_spent_seconds`, `topic`, `total_questions`, `user_id` | Express boot at src/utils/initializeTables.js:317 | **yes** | `services/studyHistoryService.js` | shared code |
| `subscription_plans` | R | `id`, `name`, `tier_level` | migration file src/migrations/add-subscriptions.sql<br>Express boot at src/utils/runMigrations.js:19 | no | `services/planService.js` | shared code |
| `tutor_conversations` | R/W | `created_at`, `id`, `messages`, `title`, `topic`, `updated_at`, `user_id` | Express boot at src/utils/initializeTables.js:302 | **yes** | `services/tutorHistoryService.js` | shared code |
| `user_progress` | R/W | `context_key`, `progress_data`, `updated_at`, `user_id` | Express boot at src/services/sessionService.js:42 | **yes** | `services/progressService.js` | shared code |
| `user_sessions` | R/W | `created_at`, `device_name`, `expires_at`, `id`, `ip_address`, `last_active_at`, `refresh_token_hash`, `revoked_at`, `user_agent`, `user_id` | Express boot at src/services/sessionService.js:25 | **yes** | `routes/auth.js`<br>`services/sessionService.js` | `/api/auth`<br>shared code |
| `user_subscriptions` | R/W | `plan_id`, `user_id` | migration file src/migrations/add-subscriptions.sql<br>Express boot at src/utils/runMigrations.js:32 | no | `services/planService.js` | shared code |
| `users` | R/W | `created_at`, `email`, `full_name`†, `github_username`, `id`, `linkedin_url`, `name`†, `onboarding_completed`‡, `password_hash`, `role` | database.sql (MySQL dialect)<br>Express boot at src/utils/initializeTables.js:7 | **yes** | `routes/admin.js` (try)<br>`routes/adminPanels.js` (try)<br>`routes/auth.js`<br>`routes/benchmarks.js` (try)<br>`routes/community.js` (try)<br>`services/planService.js` | `/api/admin`<br>`/api/admin-panels`<br>`/api/auth`<br>`/api/benchmarks`<br>`/api/community`<br>shared code |

## How this was computed, and its limits

- The Worker SQL is found by parsing each `backend/src/worker/**/*.js` file with `@babel/parser` (comments are never SQL), collecting the first argument of every `.query(...)` call (template literals, concatenations, `const` SQL, `let` SQL built with `+=`, `array.join`) plus free-standing string literals that are complete DML statements (this catches the `statusChecks` array in `routes/dashboard.js`). `${...}` fragments that cannot be resolved are listed in finding 6.
- Tables come from `FROM`, `JOIN`, `INSERT INTO`, `UPDATE`, `DELETE FROM`, `USING` and `ON CONFLICT`; CTE names, sub-select aliases and function tables are not tables. Column attribution is deliberately conservative: nothing is asserted for unqualified names in multi-table queries.
- Known DDL = `backend/database.sql`, `backend/src/migrations/*.sql`, and every `CREATE TABLE` / `CREATE INDEX` / `ALTER TABLE` string in `backend/src/**` outside the Worker (including the `for (const [col, def] of ...)` column loops in `runMigrations.js` and `routes/resume.js`, expanded statically).
- Nothing here reads a database. "Defined in the repository" is not "exists in Neon": that is what `--check` is for. Live-only facts (extra columns added by hand, dropped tables, different types) are invisible to this document.
- The files under `src/migrations/*.sql` are not loaded by any boot code; they count as standalone DDL only in the sense that a human could have applied them.

