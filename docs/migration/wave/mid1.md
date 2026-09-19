# Slice `mid1` notes (ADR-001 Phase 3)

Routes ported: `resumeChat`, `learning`, `jobPreparation`, `careerRoadmap`, `interview`. Owner: mid1 agent. Everything below was
verified with Jest against fakes and one bundle/runtime smoke test; see "Not verified" for what that does NOT prove.

## What was ported

| Worker file | Mounted at (app.js order) | Endpoints | Guards (identical to `manifest.render.json`) |
|---|---|---|---|
| `src/worker/routes/learning.js` | `/api/learning` (#9) | `POST /generate-roadmap`, `GET /roadmaps`, `GET /resources` | first two `authenticateToken` + `requirePlan(1)`; `/resources` PUBLIC |
| `src/worker/routes/interview.js` | `/api/interview` (#11) | `POST /start`, `POST /:id/respond`, `GET /history` | `/start` auth + `requirePlan(3)`; the other two auth only |
| `src/worker/routes/resumeChat.js` | `/api/resume-chat` (#12) | `POST /chat`, `POST /embed` | auth only |
| `src/worker/routes/careerRoadmap.js` | `/api/career` (#13) | `POST /roadmap`, `GET /roadmap/:id`, `POST /discovery`, `GET /discovery`, `GET /roadmap` | roadmap routes auth + `requirePlan(1)`; **both `/discovery` routes auth only** |
| `src/worker/routes/jobPreparation.js` | `/api/job-prep` (#25) | `POST /star-stories`, `/tutor`, `/projects`, `/project-blueprint` | auth only |

17 endpoints, equal to the 17 in the manifest for these prefixes (3 + 3 + 2 + 5 + 4). `careerRoadmap.js` mirrors the WORKING-TREE Express
file; the manifest (generated from the working tree) records `POST /api/career/discovery` and `GET /api/career/discovery` as
`auth: true, minTier: null, guards: ["authenticateToken"]`, exactly as ported (the `discovery` routes sit between `/roadmap/:id` and
`/roadmap`, same order as Express).

Also written: `src/worker/routes/mounts/mid1.js` (5 `mountRoutes` calls, Express order). `src/worker/services/registry/mid1.js` is
unchanged (`{}`): this slice owns no services; it only consumes `getServices(c).aiClient` (`callAI`, `extractJSON`) and
`getServices(c).embeddings` (`embedText`, `findTopSimilarChunks`, `chunkText`), both now provided by the infra registry.

Env-based model selection goes through `getConfig(c).vars.*` (all already in `PASSTHROUGH_VARS`): `LM_STUDIO_MODEL_INTERVIEW`
(resumeChat, jobPreparation with the `|| 'meta-llama-3.1-8b-instruct'` default, interview `/start`), `LM_STUDIO_MODEL_ROADMAP`
(learning, careerRoadmap). `interview /:id/respond` passes NO model, as on Express.

Errors: handlers whose Express version used `next(err)` (learning, jobPreparation, interview) simply throw, so `onError` renders the
same masked `{"error":"Internal Server Error"}`. Handlers with their own try/catch (resumeChat, careerRoadmap) keep it and return the
same bodies.

## Deviations forced by the platform (each is deliberate and small)

1. **Boot-time DDL not ported.** `learning.js` and `interview.js` ran `CREATE TABLE IF NOT EXISTS learning_roadmaps` / `mock_interviews`
   at module load in Express (ADR 6.5 forbids schema bootstrap on Workers). The tables must already exist in Neon. They are also
   created by `utils/initializeTables.js`, as are `career_roadmaps` and `resume_embeddings`; `career_discovery_responses` is created
   only by the WORKING-TREE `utils/runMigrations.js`, so Neon has it only if that code has run against the target database.
2. **`/api/resume-chat/embed` background job.** Express let `embedAndStoreResume(...)` run as a floating promise. Here it is handed to
   `safeWaitUntil(c, job)`. Extra: `db.js` closes the request pool after the queries that are in flight at the end of the request
   have settled (`release()` only waits for the in-flight set), and this job alternates a network call (`embedText`) with each INSERT,
   so with plain `db.query` the first INSERT would find the pool closed ("db used after release"; reproduced in
   `resumeChat.test.js`, "WHY THE CLIENT IS HELD"). The job therefore checks out one pooled client synchronously via `db.connect()`
   (before the handler returns), runs its queries on it and `client.release()`s in `finally`. A pool cannot finish `end()` while a
   client is checked out, so `db.release()` waits for the job. Checked by READING the installed sources, not by running them:
   `node_modules/pg-pool/index.js` `newClient()` pushes to `_clients` synchronously and `_pulseQueue()` only calls the `end()`
   callback once `_clients` is empty, and the vendored Neon driver (`@neondatabase/serverless`, `class ... extends go.Pool`) contains
   the same `_pulseQueue` code. **Not run against a real Neon connection** (tests use a fake pool that models this). A cleaner fix is
   a small `db.js` API for background work (see "Orchestrator actions").
3. **`embedAndStoreResume` is not exported** from the router module (Express did `module.exports.embedAndStoreResume`). Nothing in
   `backend/src` imports it (resume.js does not call it despite the comment).
4. **`careerRoadmap` `activeGenerations`** (one roadmap generation per user, 429 otherwise) stays an in-memory `Map`, but on Workers it
   is per isolate, not per process: concurrent requests from one user on different isolates can both generate. It is a
   double-click guard, not a security control. Durable enforcement needs a Durable Object or DB lock (not a behaviour-preserving port).
5. Path params: `c.req.param('id')` replaces `req.params.id`. Express (router) answers a malformed percent-escape in a param with
   400; Hono's handling of that edge case was not tested here. Not seen in the client (ids are integers).

No other deviation. In particular: same status codes, same JSON keys, same SQL text (checked mechanically, below), no `requirePlan`
added or widened, no new `authenticateToken`.

## Pre-existing behaviours preserved (NOT fixed, per ADR 4.3), for the user to triage

1. **`POST /api/resume-chat/embed` IDOR (security).** `DELETE FROM resume_embeddings WHERE resume_id = $1` is not scoped by `user_id`
   and the route never checks the caller owns `resumeId`. Any authenticated user can wipe another user's embeddings for a resume id
   and insert rows against it. Ported as-is. Nothing in `backend/src` or `frontend/src` calls `/embed` (or `/chat`) today, so
   exposure is real only for direct callers.
2. **Literal `\n` in prompts.** In `jobPreparation.js` the user prompts (`tutor`, `projects`) and the FALLBACK `readme_draft`
   (`"# <title>\\n\\nA great project."`) contain a backslash followed by `n`, not a newline. Client-visible in the fallback blueprint.
3. **No body -> 500.** Every handler destructures the body (`const { x } = getBody(c)`). A request with no JSON body makes it
   `undefined` and TypeErrors. Inside a try/catch (resumeChat, `POST /career/roadmap`) that is the route's own 500 message; elsewhere,
   including `POST /career/discovery` (destructure sits OUTSIDE its try) it is the masked generic 500.
4. `tutor`: `history` that is a non-array with a length (a string) -> `history.forEach is not a function` -> masked 500.
5. `interview`: a non-string truthy `answer` (e.g. a number) crashes on `.trim()` -> masked 500; a NULL `messages` column crashes on
   `push` -> masked 500; `final_score || 70` turns a real score of 0 into 70; `respond` and `history` have no plan gate (only
   `/start` is tier 3), so a user who later loses tier 3 keeps access to existing interviews.
6. `careerRoadmap`: `POST /discovery` accepts an array for `answers` (`typeof [] === 'object'`); dead variable `hoursPerMonth`; ids
   (`/roadmap/:id`, `/:id/respond`) are not validated, a non-numeric id becomes a DB error (500).
7. `learning` always saves the roadmap row even when the AI fell back (`ai_powered=false`).
8. The default `interview` fallback bank is used when `role` is unknown; a `role` longer than 255 chars fails the INSERT (500).

## Tests (backend/tests/worker/mid1/)

`npx jest tests/worker/mid1 --coverage=false` -> 7 suites, 183 tests, all pass; plus `tests/worker/sourceTree.test.js` (no offenders
from mid1 files; it currently fails only on other slices' files: `services/activityService.js` comment, `routes/learningModules.js`
JSON imports).

* `learning|interview|resumeChat|careerRoadmap|jobPreparation.test.js`: 401 without token; `PLAN_UPGRADE_REQUIRED` 403 exact shape
  (no plan / below threshold; tier ok at threshold; `requirePlan` fails closed on a plan-lookup error) for every gated endpoint;
  "no requirePlan" endpoints served to users with no subscription; happy paths with exact bodies; each error path with the Express
  status/body; validation 400s; the preserved bugs above; `POST /career/roadmap` 429 concurrency guard and slot release;
  `/embed` job lifecycle including the pool-lifetime deviation.
* `manifest.test.js`: loads `docs/migration/manifest.render.json`, builds a mini-app mounting only these routers at the app.js
  prefixes/order, and via `listRoutes(app)` asserts, for all 17 endpoints: same method+path set, `auth`, `minTier`, admin/role,
  ordered guard list, no untagged middleware, same registration order; also that `routes/mounts/mid1.js` mounts the same thing.
* `literalParity.test.js`: parses the Express source (working tree) and the port with `@babel/parser` and compares the multiset of
  every string/template/number/boolean literal (SQL, prompts, messages, status codes, token limits, temperatures). The
  only intentional differences are listed in the test (dropped DDL, the `db.connect` feature test). This test caught one real
  transcription error during development (two prompt lines in `jobPreparation.js` lost a trailing space that is present in the
  CRLF Express file); it was fixed.
* `helpers.js`: fake pg pool (models `pool.end()` waiting for checked-out clients), fake `aiClient`/`embeddings`, app builder over the
  REAL `createRequestDb`.
* `node backend/scripts/migration/generate-worker-manifest.js --only-prefix ...` for the five prefixes, then
  `compare-manifests.js manifest.render.json <worker manifest> --only-prefix ...`: `RESULT: PASS (critical=0 error=0 warn=0)`,
  17/17 endpoints compared. (Run with `MSYS_NO_PATHCONV=1` under Git Bash or `/api/...` is rewritten.)
* Bundle: `wrangler deploy --dry-run` of a throwaway entry (`backend/.wrangler/tmp-mid1/`, gitignored) that mounts only
  `mounts/mid1.js` bundles (about 0.9 MiB, ~180-200 KiB gzip at the time; the size moves as other slices land), and the built bundle contains
  zero occurrences of `initializeTables|runMigrations|ensureTables`.
* Runtime smoke in `wrangler dev --local` (workerd, port 8795, synthetic secrets, `MOCK_AI=true`, unreachable synthetic
  `DATABASE_URL`; processes killed afterwards): `GET /api/learning/resources` 200; no token -> 401; `star-stories` 400 and 200 (mock AI ->
  static fallback); `career/discovery` 400; `resume-chat/chat` 400; `career/roadmap` with an unreachable DB -> 500
  `{"error":"Failed to verify subscription plan"}` (requirePlan failing closed).

## Not verified

* Any SQL against Postgres/Neon (fake pool matches the exact statement text, which the literal test ties to Express, but semantics such
  as `ON CONFLICT (user_id)` needing a unique constraint on `career_discovery_responses.user_id`, JSONB round-trips, `ORDER BY` and
  parameter typing for `id` compare are unproven here).
* Deviation 2 against a live Neon connection (pool `end()` waiting for a checked-out WebSocket client; `client.query` /
  `client.release` on Neon inside workerd), and that the background embedding finishes inside `waitUntil`'s time budget for a
  long resume.
* Real `aiClient` / `embeddings` behaviour (owned by infra; only their contract was used, injected fakes in tests). The smoke
  ran `callAI` in MOCK_AI mode only.
* Response headers (Express ETag/charset differences) and case-insensitive routing (README section 4).
* Real-user plan lookups, real JWTs from Render, CORS/proxy behaviour.

## Observation for the orchestrator (not caused by this slice)

During the smoke, with an unreachable database a NON-gated route (`GET /api/interview/history`) surfaced Neon's
`Uncaught Error: Network connection lost` as an uncaught exception (wrangler's dev error page, HTTP 500, stack in the body) instead of
a rejected query going through `onError`'s masked JSON, while the same failure inside `requirePlan` was caught. That suggests an
unhandled pool `error` event. Worth checking in `db.js` / `config/database.worker.js` (add a pool `error` listener) and a real Neon run
(ADR S11); it is also an information-leak check for the deployed Worker.

## Orchestrator actions / requests

* None required to merge. Optional, shared files (not mine to edit): a `db.js` API such as `db.hold(promise)` that makes `release()`
  wait for a background job would replace the `db.connect()` client hold in `resumeChat.js` and would help any slice with post-response
  DB work that spans non-DB awaits (other slices likely hit the same "used after release" hazard).
* No new config vars, no new packages (`@babel/parser` used by the parity test is jest's transitive dependency, the same one
  `generate-manifest.js` already relies on).
