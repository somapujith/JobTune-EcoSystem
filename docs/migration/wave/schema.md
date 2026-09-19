# Slice notes: `schema` (required-schema checker for the Worker)

Purpose: ADR-001 section 6.5 removes all boot-time schema creation from the Worker, so every table, column and unique
constraint the Worker's SQL touches must already exist in the target Neon database. This slice builds the tool that makes that
checkable before any `/api` prefix is flipped, and the generated document that lists the requirement.

## What was built (only these files)

| File | Role |
|---|---|
| `backend/scripts/migration/check-schema.js` | CLI: `--extract` (offline, default), `--check` (live, read-only), `--print-fix-sql`, `--out`, `--md`, `--json`, `--verbose`, `--strict`, `--url-env`, `--no-git`, `--help` |
| `backend/scripts/migration/schema/sqlTokens.js` | SQL tokenizer + paren tree |
| `backend/scripts/migration/schema/jsSql.js` | finds SQL strings in JS with `@babel/parser` (comments are never SQL); resolves const / `let ... +=` / `array.push().join()` / conditionals / `for..of` over literal arrays; unresolvable `${}` becomes a reported dynamic fragment |
| `backend/scripts/migration/schema/sqlAnalyze.js` | scope-aware table / column extraction (FROM, JOIN, INSERT INTO, UPDATE, DELETE FROM, USING, ON CONFLICT, CTEs, sub-selects) |
| `backend/scripts/migration/schema/ddlModel.js` | known-DDL model (database.sql, `src/migrations/*.sql`, every `CREATE/ALTER` in `src/**` outside the Worker), drift computation, read-only `git status` / `git show HEAD:file` to flag DDL that exists only in uncommitted edits |
| `backend/scripts/migration/schema/requirements.js` | Worker requirements, resolution against the model, Worker-vs-Express parity |
| `backend/scripts/migration/schema/liveCheck.js` | read-only guard, fixed catalog queries, diff, fix-SQL builder |
| `backend/scripts/migration/schema/render.js` | terminal report and the Markdown document |
| `backend/tests/migration/checkSchema.test.js` | 94 tests, all offline (`npx jest tests/migration/checkSchema.test.js --coverage=false`) |
| `docs/migration/required-schema.md` | generated: `node backend/scripts/migration/check-schema.js --extract --md docs/migration/required-schema.md` |

Nothing outside these paths was touched. No database or network connection was made by this slice, `backend/.env` was never read,
no `npm install`, no git write commands (only `git status` / `git show` are used by the tool, and they are injectable in tests).

## Safety properties of `--check` (verified by tests with a mock pg client)

- The connection string comes only from the environment (`DATABASE_URL`, or `--url-env NAME`); the tool never reads `.env` files
  (a test greps the sources for `dotenv` / `.env` reads).
- It prints host and database name (so a wrong target is visible) but never the URL, user or password; connection errors are
  scrubbed of the URL, user and password before printing.
- Every statement goes through `makeReadOnlyClient`, whose guard accepts exactly one plain `SELECT` and refuses INSERT / UPDATE / DELETE /
  DDL / GRANT / COPY / SET / BEGIN..., `SELECT ... INTO`, `FOR UPDATE`, dollar-quoting, multiple statements, comment-hidden verbs, CTEs
  with DML, and side-effecting functions (`set_config`, `nextval`, `pg_terminate_backend`, ...). A refused statement never reaches the client.
- The only SQL ever sent: five fixed catalog SELECTs (identity, `information_schema.tables`, `information_schema.columns`,
  `pg_constraint`, `pg_indexes`).
- `--print-fix-sql` builds strings from the known DDL and prints them. Nothing executes them (a test asserts the mock database only
  ever receives SELECTs while DDL is printed). Printed DDL is ordered by foreign-key dependency and carries its source per statement.
- Exit codes: 0 ok, 1 something missing (`--check`) or a finding under `--strict`, 2 usage error / could not connect or run.

## Result on the tree as generated (see `docs/migration/required-schema.md` for the full table)

- Worker files scanned: 140 (`routes/_example.js` excluded), 211 SQL statements + 8 free-standing SQL literals.
- 52 tables and 328 columns referenced, 13 `ON CONFLICT` targets.
- DDL provenance (mutually exclusive, first match): `database.sql` 4 (1 of them MySQL-dialect only: `projects`), migration file only-or-with-boot 10
  (9 also created by Express boot), Express boot only 36, NOT FOUND ANYWHERE 2.
- Tables that exist in Neon only because Express created them at boot (no standalone Postgres DDL file): 38 of 52.
- Uncommitted-only DDL (git HEAD comparison): table `career_discovery_responses` and column `users.onboarding_completed` exist only in the
  working-tree `runMigrations.js`.
- Worker vs Express SQL parity: the same extraction over the Express runtime SQL needs exactly the same tables and columns (0 Worker-only,
  0 Express-only). So the port added no schema requirement.

## Findings

Declared NOWHERE in the repository (Express references the same things, so these are pre-existing, not port regressions):
- table `profiles` and table `interview_sessions`: only `routes/aiCoach.js` (career-score, inside try/catch, so a missing table degrades silently);
- table `projects` has DDL only in the MySQL-dialect `database.sql` (same aiCoach query, in try/catch);
- column `users.name` (`routes/admin.js`: `GET /users` and `GET /audit-logs` answer 500 without it) and `users.full_name` (`routes/community.js`:
  `POST /forums/thread` and `POST /forums/thread/:id/reply` answer 500 without it).
  Signup inserts only `email, password_hash, github_username, linkedin_url`, so if these columns exist in Neon they predate the repository's DDL.

Schema drift (same table, incompatible CREATE statements in different files):
- `learning_streaks`: `routes/courses.js:55` = `user_id UNIQUE, current, longest, last_date, daily_goal`; `utils/initializeTables.js:388` =
  `user_id, subject, current_streak, longest_streak, last_active_date, UNIQUE(user_id, subject)`. The Worker uses both shapes
  (`activityService` / `dashboard` / `courses` use the first, `learningPathService` the second): no single shape satisfies every query, whichever
  `CREATE TABLE IF NOT EXISTS` ran first in the live DB decides. Preserved from Express.
- `mock_interviews`: `routes/interview.js:12` has `feedback`, `initializeTables.js:38` does not (the Worker uses `feedback`).
- `analyses`: `runMigrations.js` declares `resume_id UNIQUE`, `src/migrations/add-ats-tables.sql` does not; `resumeDatabase.js` does `ON CONFLICT (resume_id)`.
- `resumes`: five different CREATE statements (database.sql, add-ats-tables.sql, routes/resume.js, initializeTables.js, runMigrations.js); columns
  `file_name, file_size, overall_score, scores, sections, suggestions` come only from `routes/resume.js` module-load DDL.
- type-family drift: `learning_roadmaps.gaps` (JSONB vs TEXT), `skill_assessments.{skills,strengths,gaps,role_matches}` and `resumes.{scores,sections}` (JSON in MySQL `database.sql`).
- `database.sql` and `init_admin_db.js` are MySQL syntax and cannot have run on Postgres/Neon; `src/migrations/*.sql` are loaded by no code.

Data (not schema) prerequisites the tool cannot see: `subscription_plans` must hold the 3 plan rows (boot seeds and re-syncs them); `onet_occupations`
and `learning_topics` are filled by seed scripts.

## Limits / not verified

- Nothing was run against any database. `--check` is verified only against a mock client; the catalog SQL was proof-read for PostgreSQL syntax but
  not executed against a real server or a Neon pooler. Run it on a Neon branch first.
- `--check` compares existence only: not column types / defaults / nullability, non-unique indexes, foreign keys, or row data.
  `information_schema` shows only objects the connecting role may access: use the owner role.
- Column attribution is deliberately conservative: unqualified names in multi-table queries are not asserted (there are none in the current Worker);
  50-odd single-table unqualified columns are marked `inferred`. Dynamic SQL is not statically checkable (1 fragment: bulk `VALUES` in
  `srsService.saveDeck`; 1 wrapper call `db.query(query)` in `dashboard.js`, whose SQL is picked up as literals).
- "Exists only because Express boot created it" means: no Postgres-applicable standalone DDL file (a migration file or a Postgres-dialect database.sql)
  defines it. It is a statement about the repository, not about Neon.
- The document is generated from the working tree at one moment; other slices were still landing. Regenerate before relying on it.
- The tool has no notion of a second schema (it checks `current_schemas(false)`).

## npm scripts to add (orchestrator; this slice does not edit package.json)

```json
"migration:check-schema": "node scripts/migration/check-schema.js",
"migration:check-schema:live": "node scripts/migration/check-schema.js --check"
```
