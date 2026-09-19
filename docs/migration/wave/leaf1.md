# Slice `leaf1` - notes

Ported from Express at git HEAD `38d8130a` (none of these files has uncommitted edits). Render is untouched.
Scope: routes `projects`, `benchmarks`, `resumeConsistency`, `recruiterVisibility`, `guides`, `progress`; services
`benchmarks/scorerBenchmark`, `resumeConsistencyService`, `recruiterVisibilityService`, `guides/jobGuideGenerator`, `progressService`.

## What was ported

| Route file | Mount (Express `app.js` #) | Endpoints | Guards (identical to manifest) |
|---|---|---|---|
| `routes/projects.js` | `/api/projects` (7) | `GET /ideas` | `authenticateToken`, `requirePlan(1)` |
| `routes/guides.js` | `/api/guides` (19) | `POST /generate`, `GET /:id` | `authenticateToken` (no plan gate) |
| `routes/benchmarks.js` | `/api/benchmarks` (20) | `GET /run` | `authenticateToken`, `requireAdmin` (local, tagged `{kind:'admin'}`) |
| `routes/progress.js` | `/api/progress` (26) | `GET /`, `GET|PUT|PATCH /:contextKey` | `authenticateToken` (no plan gate) |
| `routes/recruiterVisibility.js` | `/api/recruiter-visibility` (27) | `POST /analyze` | `authenticateToken`, `requirePlan(2)` |
| `routes/resumeConsistency.js` | `/api/resume-consistency` (28) | `POST /check` | `authenticateToken`, `requirePlan(2)` |

10 endpoints, matching the 10 leaf1 endpoints in `docs/migration/manifest.render.json`.

| Service (registry key) | Shape | Notes |
|---|---|---|
| `scorerBenchmark` | `createScorerBenchmark({ db })` -> `{ runBenchmark, computeMetrics, FIXTURE_DATASET }` | fixture + scorers copied verbatim; only the INSERT goes through `db` |
| `progressService` | `createProgressService({ db })` | singleton class -> closure factory (`this` removed) |
| `jobGuideGenerator` | `createJobGuideGenerator({ db, services })` | LLM via `services.aiClient.callAI` (infra), read at call time inside the existing try |
| `resumeConsistencyService` | `createResumeConsistencyService()` | pure, body copied verbatim |
| `recruiterVisibilityService` | `createRecruiterVisibilityService()` | pure, body copied verbatim |

Wiring: `services/registry/leaf1.js` (5 lines) and `routes/mounts/leaf1.js` (6 `mountRoutes` calls in Express order). Both were written last.

## Deviations (each is either platform-forced or behaviour-neutral)

1. **`requireAdmin` calls `next()` after the try block, not inside it.** In Express the router never propagated a downstream
   handler's exception back through `next()`, so the original `try { ...; next(); } catch { 500 'Database error' }` could only
   catch the role lookup. In Hono, `await next()` inside the try would also catch handler exceptions and mislabel them as
   "Database error". Behaviour is therefore the same as Express; a missing user claim still yields 500 "Database error" (the
   `c.get('user').id` read stays inside the try).
2. **`getServices(c)` is read before/outside the `try`** in the four handlers that have one. A wiring error (container missing)
   becomes the masked 500 from `onError` rather than the route's own error body. Unobservable in a correctly wired Worker.
3. **Malformed percent-escapes in path params** (`/api/guides/%E0%A4%A`, `/api/progress/%E0%A4%A`). Express 5 rejects these in the
   router with 400 `{"error":"Failed to decode param '...'"}` (before `authenticateToken`, so also for unauthenticated callers).
   Hono falls back to the raw string, so an authenticated caller gets the route's own 400 (`id must be a positive integer` /
   `Invalid progress context`) and an unauthenticated one gets 401. Same 400 for real clients; not reproduced.
4. Platform/README differences that apply to every route: no `charset=utf-8` on JSON, no weak ETag, case-sensitive routing
   (`/API/progress` is a 404 here, matched on Express).
5. `getBody(c)` / `getQuery(c)` replace the Express request body and query properties (README cheat sheet). No behaviour change; the
   test suites pin the `undefined`-body and repeated-key (array) cases.

## Pre-existing behaviour preserved on purpose (do NOT fix during the port, ADR 4.3)

- **No plan gate on `/api/guides/*` and `/api/progress/*`** (manifest confirms). `POST /api/guides/generate` performs an LLM call and
  DB write for any authenticated user, including one with no subscription. Worth a product decision after cutover.
- **`/api/guides/generate` with no JSON body** is a TypeError (the body is destructured without `|| {}`) -> masked 500, not a 400.
  Same for `PUT`/`PATCH /api/progress/:contextKey` with a valid context but no JSON body.
- **Error `detail` leaks raw messages** on 500 from `guides` (`Failed to generate guide` / `Failed to fetch guide`) and `benchmarks`
  (`Benchmark failed`), including database error text. The guides routes are reachable by any authenticated user.
- **"not found" substring matching**: any error whose message contains `not found` (any case), including a database error, becomes a 404
  on the guides routes.
- **benchmarks scorer lookup uses a plain object**: `scorerName=constructor` / `toString` selects an `Object.prototype` member as
  the scorer, producing NaN metrics that are persisted as JSON `null`; `scorerName=__proto__` throws `scorer is not a function` -> 500
  `Benchmark failed`. A repeated `scorerName` key (array) is accepted and falls back to `ats`, and the array is what gets stored in
  `scorer_benchmarks.scorer_name`. `datasetName` is never validated and does not change what is scored (always the same 7 fixtures).
- **progress**: `data: null` passes the "must be an object" check (`typeof null`) and is stored as `{}`; `PATCH` is read-then-write with
  no transaction (concurrent PATCHes can lose an update); `merge` is shallow (nested objects are replaced).
- **recruiterVisibility**: a non-string entry in `targetKeywords` (e.g. `[123]`) throws inside the service and is a 500, not a 400.
  **resumeConsistency**: a `null` entry in `experience` is a 500.
- `getJobGuide` returns the whole `SELECT *` row (`id`, `user_id`, `application_id`, `guide`, `created_at`).
- `guides` accept any positive integer via `Number()` coercion (`1e0`, ` 5` ...).

## Contract assumptions on other slices

- `services.aiClient.callAI({ systemPrompt, userPrompt, maxTokens, temperature })` resolving `{ ok, data }` (infra). Verified against the
  infra slice's registered `aiClient` with only the outbound `fetch` stubbed (test in `wiring.test.js`, skipped automatically if infra
  ever unregisters `aiClient`).
- If `aiClient` were not registered, `guides/generate` would silently return the template guide (the LLM lookup sits inside the same try
  that already turns any `callAI` failure into the fallback). Express behaved the same for an unreachable provider.
- `planService` / `sessionService` (foundation) are used only through `requirePlan` / `authenticateToken`. `requirePlan` fails closed.

## Verification performed

- `npx jest tests/worker/leaf1 --coverage=false`: 10 suites, 229 tests, all passing. Route suites cover 401 / plan-403 shape /
  threshold-ok, validation, happy-path bodies and error bodies per endpoint; `parity.test.js` runs each ported service **and the Express
  original side by side** (Express with its pool and aiClient mocked) on scripted queries and ~800 generated inputs and requires identical
  return values, thrown messages, SQL text, bound parameters and `callAI` arguments (mutation-checked: changing a temperature and a
  scoring weight made it fail); `manifest.test.js` builds a mini-app mounting only the leaf1 routers at the manifest prefixes (also
  cross-read from `backend/src/app.js`) and compares `listRoutes(app)` with `manifest.render.json` field by field, then feeds a candidate
  manifest to `scripts/migration/compare-manifests.js` (exit 0) with five negative controls (dropped plan / lowered tier / dropped admin /
  dropped auth = exit 2, missing endpoint = exit 1).
- `node scripts/migration/generate-worker-manifest.js --only-prefix ...` (full `createApp({mountSlices:true})`) followed by
  `compare-manifests.js --only-prefix ...` for the six leaf1 prefixes: 10 endpoints, 10 compared, **0 findings, exit 0**.
- `tests/worker/sourceTree.test.js`: no leaf1 file is flagged. The suite currently fails (3 cases) only because of other slices' files
  (`atsExport`, `resume`, `resumeV2`, `docs/multipart`, `learningModules`, `activityService`); not touched by this slice.
- Bundle: `wrangler deploy --dry-run` of a throwaway entry (`backend/.wrangler/tmp-leaf1/`, gitignored) that runs `createApp()` +
  the leaf1 `mount()` built successfully (about 843 KiB, 181 KiB gzip); the bundle contains the leaf1 code and zero references to
  `initializeTables` / `runMigrations` / `ensureTables`.

## NOT verified

- Anything against real Postgres / Neon: SQL was copied verbatim and is byte-compared with Express, but never executed. The tables
  `user_progress` (created by `sessionService.ensureTables`), `job_guides` and `scorer_benchmarks` (created by `utils/initializeTables.js`)
  exist only if Render's boot DDL has already run against that Neon database; the Worker never creates them (ADR 6.5).
- JSON round-trip of `jsonb` columns and `timestamp` values through the Neon driver (the fake db returns parsed objects and `Date`s, which is
  how `pg` behaves; Neon's serverless `Pool` is expected to match, unproven).
- Nothing ran inside workerd: no `wrangler dev`, no request served by the bundle. Bundling proves the modules resolve, not that they run there.
- Real Render-issued JWTs, real plan rows, and Express-vs-Worker byte comparison of HTTP responses (the differential runner, T4.2).
- Header-level parity (ETag, `charset`), case-insensitive routing, and Express's percent-decode 400 (see deviations).
