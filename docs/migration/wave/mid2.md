# Slice `mid2` notes (ADR-001 Phase 3)

Routes ported: `skills`, `dashboard`, `learningModules`, `aiTutor`, `studyTools`. Service ported: `tutorHistoryService`. Owner: mid2 agent.
Verified with Jest against fakes, a `wrangler deploy --dry-run` bundle, and one local `wrangler dev --local` (workerd) smoke test with
synthetic secrets; see "Not verified" for what none of that proves.

## What was ported

| Worker file | Mounted at (app.js order) | Endpoints | Guards (identical to `manifest.render.json`) |
|---|---|---|---|
| `src/worker/routes/skills.js` | `/api/skills` (#3) | `GET /questions`, `POST /assessment`, `GET /history` | all `authenticateToken` + `requirePlan(1)` |
| `src/worker/routes/dashboard.js` | `/api/dashboard` (#6) | `GET /overview` | `authenticateToken` only |
| `src/worker/routes/aiTutor.js` | `/api/ai-tutor` (#30) | `GET /topics`, `POST /chat`, `POST /doubt`, `GET /conversations`, `GET /conversations/:id`, `POST /conversations`, `PUT /conversations/:id`, `DELETE /conversations/:id` | first three auth + `requirePlan(1)`; the five conversation routes auth only |
| `src/worker/routes/studyTools.js` | `/api/study-tools` (#32) | `POST /notes/generate`, `/flashcards/generate`, `/quiz/generate`, `/quiz/submit` | all auth + `requirePlan(1)` |
| `src/worker/routes/learningModules.js` | `/api/learning-modules` (#40) | `GET /tracks`, `GET /:trackId`, `GET /:trackId/:moduleId`, `POST /knowledge-check`, `POST /module-assessment`, `POST /module-assessment/submit` | first four auth only; the two `module-assessment` routes auth + `requirePlan(3)` |
| `src/worker/services/tutorHistoryService.js` | registry key `tutorHistoryService` | `saveConversation`, `updateConversation`, `getConversations`, `getConversation`, `deleteConversation` | n/a |

22 endpoints, equal to the 22 the manifest lists for these prefixes (3 + 1 + 8 + 4 + 6). Written last: `services/registry/mid2.js` (one line:
`tutorHistoryService: ({ db }) => createTutorHistoryService({ db })`) and `routes/mounts/mid2.js` (5 `mountRoutes` calls in the app.js
relative order skills, dashboard, ai-tutor, study-tools, learning-modules).

Consumed from other slices through `getServices(c)` (same public API as the Express modules): `aiClient` (`callAI`, `extractJSON`; infra) in
skills, aiTutor, studyTools, learningModules; `studyHistoryService.saveSession(userId, {...})` (leaf2) in studyTools. Model names come from
`getConfig(c).vars.LM_STUDIO_MODEL_SKILLS` (skills `/assessment`) and `.LM_STUDIO_MODEL_TUTOR` (aiTutor `/chat`, `/doubt`); both are already in
`PASSTHROUGH_VARS`, no `config.js` change is needed. There was no route-file-level state computed from env in these five files; the module-scope
values that remain (`QUESTION_BANK`, `TOPICS`, the system prompts, fallback generators) are immutable constants, and every per-request value
(`Date.now()`, `Math.random()`, `new Date()`) is computed inside handlers.

## How the port was made (and how drift is caught)

Route bodies were produced mechanically from the Express source (verbatim copy of every constant, prompt, SQL string and helper; scripted
rewrite of `req`/`res`/`pool`/`callAI`/`process.env` only) and then reviewed as a unified diff against the Express file. `tests/worker/mid2/parity.test.js`
keeps that guarantee: it parses Express and Worker files and asserts every string literal / template segment (SQL, prompts, messages, paths) and every
numeric literal (status codes, token limits, temperatures, tiers) of the Express file still exists in the Worker file, that the Worker adds only an
explicit allow-list of platform literals, and that every `router.<method>(path, ...guards, handler)` has the same method, path, guard chain and
order. It reads Express as text only. **It will go red if anyone later edits an Express route**, which is the intended "re-sync the port" alarm.

## Deviations forced by the platform

1. **`pool` -> `getDb(c)`** (request-scoped Neon db); `req`/`res`/`next` -> Hono context; `next(err)` -> `throw` (the shared `onError` masks 5xx as
   `{"error":"Internal Server Error"}` exactly like `errorHandler.js`). The `try/catch` blocks whose only job was `next(err)` were removed; every
   catch that returns its own JSON (`Failed to fetch dashboard data`, `Failed to generate notes`, ...) is kept.
2. **Static JSON data** (`routes/learningModules.js`): `src/data/modules.json` (538 KiB) and `questions.json` (405 KiB, together about 214 KiB gzip) are
   `require`d with literal paths (esbuild inlines them) from inside two accessor functions rather than at module scope. In the built bundle
   they are wrapped in esbuild's lazy `__commonJS` initialiser, so a Worker isolate does not evaluate ~1 MB of JSON at startup for every request, only
   on the first learning-modules call. The shared source-tree lint allows `src/data/*.json` imports (it was relaxed by the orchestrator meanwhile).
3. **`studyHistoryService` wiring guard** (`routes/studyTools.js`): the Express route required the module at load time, so a missing service would
   have failed at boot. Here the service comes from the container, and a missing one would otherwise surface as a `TypeError` inside the
   "non-blocking" save's own `try/catch`, silently discarding every study session. `getStudyHistoryService(c)` therefore throws (masked 500, cause
   logged) at the top of the three handlers that save history when it is not registered. With the service registered the behaviour is identical.
   Fail-loud on a wiring error only; no request input can reach it.
4. **aiTutor fallback sample code**: the async example string contains `res.json()` twice (JavaScript shown to the student). The source writes those two
   dots as `\x2e` escapes so `tests/worker/sourceTree.test.js` (raw-text grep for Express idioms) does not mistake sample code inside a string for a
   real Express handler. The runtime string is byte-identical and a test asserts it.
5. **Known routing differences that come with Hono (README section 4), inherited, not specific to this slice**: routing is case-sensitive
   (`/api/Learning-Modules/tracks` is a 404 here, 200 on Express; observed), and a malformed percent-encoded path parameter
   (`/api/learning-modules/%E0%A4%A`) reaches the handler as the raw segment (here: 404 `Track not found`); Express's router rejects such a parameter
   with a 400 before any handler runs (documented Express behaviour, not run here).
6. **Neon concurrency (unverified)**: `dashboard.js` fires `Promise.all` of 4 queries and `Promise.allSettled` of 8 more against the one
   request-scoped pool (plus the background audit insert). On Render they shared a long-lived `pg` pool. This is the highest connection fan-out of
   the slice; see ADR S11 / checklist item 20.

## Preserved pre-existing bugs and quirks (ADR 4.3: recorded, NOT fixed)

Every one of these is asserted by a test so a future "fix" is a conscious decision.

skills
- `GET /questions` computes `count` (`Math.min(parseInt(...) || 8, 15)`) but `selectQuestions` ignores it: always 4 technical + 2 behavioural + 2 coding.
- `POST /assessment`: when the AI answers but the JSON is unusable, the keyword fallback is used yet `ai_powered` stays `true` (`aiResult.ok`).
- A body without `answers` takes the legacy branch and dies on `answers[q.id]`: masked 500, not a 400.

dashboard
- `generateActionItems` reads `profile.resumeScore`, which the caller never sets (`undefined < 70` is false): the "Optimize Your Resume" item is only
  ever shown when the user has NO resume.
- `jobsApplied` is passed as the boolean `jobStats.total > 0`, and `true < 5` is true, so "Increase Job Applications" is shown for every user.
- `recentActivity` uses columns the SELECTs do not fetch: ids are `resume-undefined` / `interview-undefined` and the interview date is
  `NaN years ago` (the Express unit test hides this by mocking richer rows).
- `skill_assessments` has no `score` / `scores` column, so any user with an assessment gets `skillScore` 65 (the `score` and `scores` branches are dead).
- `profileCompletion` is all-or-nothing: one missing table among the four `EXISTS` checks (`Promise.all`) leaves it at 0.
- The comment numbering has two "8." sections (cosmetic).

learningModules
- `knowledge-check`: `generateDistractors` returns one of three fixed generic sets unrelated to the question; `correctSnippet` can be the empty string
  for an answer that starts with blank text (the local workerd smoke returned an empty-string option for "What is React Fiber?"); options are shuffled with
  `sort(() => Math.random() - 0.5)`. A non-string skill is a masked 500.
- `GET /:trackId` looks the id up in a plain object, so `constructor`, `toString`, ... pass `if (!track)` and fail on `track.modules`: masked 500.
- `module-assessment/submit` grades whatever `questions` (including `correct` and `correctKeywords`) the client sends, persists nothing, and
  `passed` is only a message; the "next module is unlocked" claim is enforced nowhere server-side. `module-assessment` also returns `aiPowered: true`
  when the AI text was unusable and the fallback questions were served.

aiTutor
- Fallback chat suggestions: an empty/absent `topic` matches EVERY topic name through `includes('')`, so the first topic (frontend) is chosen.
- `/chat` sends `cache: false`, `/doubt` does not.
- `PUT /conversations/:id` without `messages` sends `JSON.stringify(undefined)` (a NULL parameter) and blanks the stored messages; `PUT` and `DELETE`
  answer `{"success":true}` even when no row matched (e.g. someone else's conversation); a non-numeric id reaches Postgres and is a masked 500;
  `GET /conversations/:id` returns `SELECT *` (includes `user_id`).
- `/doubt` and `/chat` return `ai_powered: true` when the AI answered with unusable JSON and the fallback/raw text was used.

studyTools
- `quiz/submit` trusts the client-supplied `questions` and `answers`, so a caller can record any score in their study history; `quizId` from
  `quiz/generate` is not stored or checked. `Math.max(count, 5)` coerces numeric strings; an empty `questions` array gives a `NaN` score (serialised
  `null`) and the lowest feedback band; `timeTaken: 0` is echoed but stored as NULL. leaf2's `saveSession` also stores a score of 0 as NULL
  (`score || null`), as Express's did.

## Not verified (green Jest is not migration evidence, ADR section 7 Phase 4)

- **SQL correctness and driver behaviour on Neon.** The fake db matches the exact statement text (so a changed query fails a test) but is not
  Postgres. Unproven: `jsonb` parameters sent as `JSON.stringify` strings, `jsonb_array_length(messages)`, `EXISTS(...)` shapes, the `undefined` -> NULL
  parameter conversion for `PUT /conversations/:id` in the Neon driver, `COUNT` returned as strings, table existence in the target Neon database
  (`skill_assessments`, `tutor_conversations`, `study_sessions`, `learning_streaks`, `daily_activity`, `onboarding_responses`, ...).
- **Neon connection behaviour under concurrency** (dashboard fan-out, deviation 6).
- **Real AI providers.** The seams were exercised against infra's real `aiClient` with a mocked `fetch` only; no provider was called.
- **Workers CPU limits.** Local workerd does not enforce them; the dashboard aggregation, the shuffles and the first (lazy) evaluation of ~1 MB of JSON
  were not measured for CPU time on a deployed Worker.
- **Byte-level parity with Render** for real requests: no differential run against Render was possible (no production access). Body shapes and
  status codes are checked against the Express source by reading and by the parity test, not by comparing live responses. Headers differ as
  documented in the README (ETag, charset).
- **Percent-decoding / case-sensitivity** differences (deviation 5) were observed on the Worker side only.

## What was run

- `npx jest tests/worker/mid2 --coverage=false`: 11 suites, 339 tests, all passing (`manifest` 107, `studyTools` 55, `aiTutor` 45, `learningModules` 26,
  `parity` 26, `sourceLint` 21, `skills` 19, `dashboard` 18, `tutorHistoryService` 9, `integration` 7, `wiring` 6). `tests/worker/sourceTree.test.js`
  passes with the slice in the tree. Nothing was run with coverage (it rewrites tracked files under `backend/coverage/`).
- `node scripts/migration/generate-worker-manifest.js --only-prefix ...` for the five prefixes: 22 endpoints, 22 authenticated, plan-gated
  `{"1":10,"3":2}`. `node scripts/migration/parity.js` with the same prefixes: `RESULT: PASS (critical=0 error=0 warn=0 info=0)`, 22 compared.
- `wrangler deploy --dry-run` with a throwaway entry under `backend/.wrangler/tmp-mid2/`: bundles (2072 KiB raw / 455 KiB gzip for the whole tree
  as it was then; includes other slices because `createApp()` requires every registry and mount file). The bundle contains no `initializeTables`,
  `runMigrations` or `ensureTables`, and `modules.json` is behind the lazy `__commonJS` wrapper.
- `wrangler dev --local` on port 8795 (killed afterwards) with synthetic `JWT_SECRET`/`DATABASE_URL` (unreachable 127.0.0.1:1): `GET /tracks` 200,
  module fetch 200 (static JSON works under workerd), unknown track 404, `POST /knowledge-check` 200 / 400, no token 401, and a plan-gated route with the
  database unreachable answered `500 {"error":"Failed to verify subscription plan"}` (fails closed).

## Test map (`backend/tests/worker/mid2/`)

`helpers.js` (fake db over the shared fake, fake aiClient, `build()`), `manifest.test.js` (manifest introspection + 401 + tier matrix
{none,1,2,3} for every endpoint + fail-closed), `skills`, `dashboard`, `learningModules`, `aiTutor`, `studyTools` (happy paths, fallbacks, validation,
masked and route-level 500s, preserved quirks), `tutorHistoryService`, `parity` (source-literal fidelity), `sourceLint` (slice-local copy of the ADR
invariants), `wiring` (mount file + registry entry), `integration` (real infra `aiClient` + leaf2 `studyHistoryService` + the registry, fetch and db faked).
