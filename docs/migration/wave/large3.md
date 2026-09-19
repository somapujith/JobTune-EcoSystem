# Slice `large3`: `/api/practice` (wave 3F)

Ported `backend/src/routes/practice.js` (1233 LOC, 10 endpoints, 10 `requirePlan(1)` sites) to
`backend/src/worker/routes/practice.js`. Express was not touched. Ported from git HEAD `38d8130a`; the Express file has
no uncommitted edits, so working tree and HEAD are identical for it.

## Files

| Path | What |
|---|---|
| `backend/src/worker/routes/practice.js` | the port |
| `backend/src/worker/routes/mounts/large3.js` | `mountRoutes(app, '/api/practice', practiceRoutes)` (written last, after tests were green) |
| `backend/src/worker/services/registry/large3.js` | **unchanged (still `{}`)**: this route owns no service; it uses the shared `aiClient` and `planService` |
| `backend/tests/worker/large3/*.test.js` + `helpers/` | 292 tests in 5 files (below) |
| `docs/migration/wave/large3.md` | this file |

## Endpoint checklist against `docs/migration/manifest.render.json`

Ported in file order; nothing reordered. All ten are `authenticateToken -> requirePlan(1)`, none admin/role, none public.

| # | Method + path | Express line | Manifest `order` | minTier | Worker |
|---|---|---|---|---|---|
| 1 | GET `/api/practice/problems` | 666 | 137 | 1 | ok |
| 2 | GET `/api/practice/problems/:id` | 758 | 138 | 1 | ok |
| 3 | POST `/api/practice/problems/:id/run` | 801 | 139 | 1 | ok |
| 4 | POST `/api/practice/problems/:id/submit` | 855 | 140 | 1 | ok |
| 5 | POST `/api/practice/problems/:id/hint` | 923 | 141 | 1 | ok |
| 6 | GET `/api/practice/assessments` | 966 | 142 | 1 | ok |
| 7 | GET `/api/practice/assessments/:id` | 1009 | 143 | 1 | ok |
| 8 | POST `/api/practice/assessments/:id/submit` | 1045 | 144 | 1 | ok |
| 9 | GET `/api/practice/stats` | 1114 | 145 | 1 | ok |
| 10 | POST `/api/practice/problems/:id/bookmark` | 1210 | 146 | 1 | ok |

Verified two independent ways:
* `tests/worker/large3/practice.manifest.test.js` loads the manifest, mounts ONLY this router at `/api/practice` in a
  fresh `createApp()`, introspects with `listRoutes(app)` and asserts per endpoint: presence, method, `auth`,
  `minTier`, guard list and order (`["authenticateToken","requirePlan(1)"]`), no admin/role, registration order,
  no extras, no untagged middleware. Seven negative controls prove the referee fails on a dropped auth, a dropped
  plan, a raised tier, plan-before-auth, a missing/extra endpoint and a reordered router.
* `node backend/scripts/migration/generate-worker-manifest.js --only-prefix /api/practice` +
  `compare-manifests.js ... --only-prefix /api/practice`: `RESULT: PASS (critical=0 error=0 warn=0 info=0)`, 10/10 compared.
  (Git Bash rewrites `/api/...` arguments into a Windows path; run with `MSYS_NO_PATHCONV=1`.)

## What is verbatim, what changed

Verbatim (asserted by `practice.parity.test.js` against the Express source): the entire data block (17 fallback
problems, 5 fallback assessments, the three AI system prompts, `generateFallbackHint`) byte for byte; all 16 SQL
statements, in order; all 19 `(status, error message)` pairs; all 12 log messages; the guard arguments per route;
every validation rule and response shape.

Mechanical substitutions only (see the diff): `req.query -> getQuery(c)`, `req.body -> getBody(c)`,
`req.params.id -> c.req.param('id')`, `req.user.id -> c.get('user').id`, `pool.query -> getDb(c).query` (called inline at
each site, so an error is contained by exactly the same try/catch as before), `res.status(n).json(x) -> return c.json(x, n)`,
`callAI/extractJSON -> aiClient.callAI/aiClient.extractJSON` from `getServices(c)`.

## Deviations forced by the platform (all documented, none change a happy-path response)

1. **Boot-time table creation dropped.** Express ran, at module load, three `CREATE TABLE IF NOT EXISTS` statements
   (`practice_submissions`, `assessment_submissions`, `practice_bookmarks`) in a floating async block. ADR 6.5 forbids
   schema bootstrap on the Worker, and a module-scope floating promise would not survive anyway. **The three tables must
   already exist in the target Neon database.** They do if Render has booted this code against that database (this file
   is the only place in the repo that creates them; `activityService` and `dashboard` only read them). Please confirm
   before flipping `/api/practice`. If they were missing: the read endpoints and both submit endpoints swallow the error
   (empty states, submissions silently not saved), and only bookmark would 500, exactly as Express behaves when a query fails.
2. **`aiClient` is an injected service.** `getServices(c)` is called inside the same inner `try` that wraps `callAI`, so a
   wiring problem (service missing) degrades to the fallback response, the same catch Express used for any AI failure.
   Consequence: a mis-registered `aiClient` would be silent (see preserved bug 1, the AI result is never used anyway).
3. **Malformed percent-encoding in `:id`** (e.g. `/problems/%E0%A4%A`): Express's router answers `400 {"error":"Failed to
   decode param '%E0%A4%A'"}` at routing time (even before auth); Hono hands the raw string to the handler, so
   problem/assessment ids answer `404 Problem not found` and **bookmark stores the raw string as a problem id**. I ran a
   scratch Express router to confirm the Express side. This is a router-level difference affecting every `:param` route,
   not this file; a global middleware in `app.js` (orchestrator) is the right fix. Pinned in a test.
4. **Route matching is case-sensitive** on Workers (Express matched `/api/practice/Problems`). Already in the worker
   README; pinned in a test.
5. **Timezone in `/stats`.** The streak code uses local-time `setHours(0,0,0,0)` and `new Date(days.rows[i].day)`.
   Workers always run in UTC. On Render this equals the server's TZ (unknown; UTC if it is a default container). If
   Render is not UTC the streak day boundary can shift by hours. Not changed.
6. Response headers differ in the usual global ways (no weak ETag, content-type charset), per the README.

## Preserved pre-existing bugs (NOT fixed, ADR 4.3)

1. **The AI result is never used, on Render or here.** `callAI` resolves `{ ok, error, data }`, but `run`, `submit` and
   `hint` pass that whole object to `extractJSON(text)`, which calls `text.match(...)` on an object and throws a TypeError.
   The inner `catch {}` swallows it and the route returns its canned fallback. So `run`, `submit` and `hint` **always
   return fallback content** ("AI evaluation is currently unavailable...", generic hint text) while still paying for the
   AI call (up to 3 attempts with backoff). A consequence worth knowing: `submit` always stores `passed = false`, so a
   problem can never become "Solved" through the API and `totalSolved` stays 0 for everyone unless rows are written elsewhere.
   Tested three ways, including through the real infra `aiClient` in mock mode and with an unreachable provider.
2. `GET /problems`: `page=abc` gives an empty list and `"page": null` (NaN serialises as null); `page=0`/negative gives an
   empty list; a repeated `search` param (array) makes `.toLowerCase()` throw, a 500 `Failed to fetch problems`.
3. `POST /problems/:id/hint`: `hintLevel` `"abc"` gives `level: null` with the level-1 text; `2.5` gives `level: 2.5`
   with the level-1 text. A request with no JSON body destructures `undefined`, which the route's own catch turns into a
   500 with the route's message (`Failed to get hint`; likewise `Failed to run code`, `Failed to submit solution`,
   `Failed to submit assessment`) instead of a 400; `bookmark` never reads a body.
4. `POST /assessments/:id/submit`: an array or `{}` is accepted as `answers` (typeof object); `timeTaken: 0` becomes `null`.
5. `GET /stats` streak: `diff === i || diff === i + 1` tolerates one skipped day once (`[today, yesterday, 3 days ago]`
   counts 3). Also stats is filled progressively inside one try/catch, so a mid-way DB failure returns a partial
   object with HTTP 200.
6. `POST /problems/:id/bookmark`: no validation or 404: any id string is bookmarked (an id over 64 chars hits the
   VARCHAR(64) column and 500s; an unknown id is stored and never shown). Not swallowed like the read endpoints
   (500 `Failed to toggle bookmark`). The SELECT-then-INSERT toggle can race into a unique-violation 500 under concurrency.
7. `GET /assessments/:id?mode=practice` returns correct answers and explanations to any tier-1 user, so "exam mode" is
   honour-system only. Looks unintended; not changed.
8. Latency shape: `/problems` and `/stats` run their queries sequentially (3 and 5 round trips). On Workers each is a
   network hop to Neon, so these two are slower than on Render (same-region pool). Not parallelised (would change nothing
   observable, but the port is verbatim).

## Tests (`cd backend && npx jest tests/worker/large3 --coverage=false`: 292 passed)

| File | Tests | Covers |
|---|---|---|
| `practice.manifest.test.js` | 73 | manifest referee per endpoint + 7 negative controls |
| `practice.plan.test.js` | 62 | 401 (no/forged token) on all 10; 403 `PLAN_UPGRADE_REQUIRED` exact shape for no plan on all 10, and for the one distinct tier in the manifest (tier 1) with a real tier-0 plan; passes at 1/2/3; no DB write / AI call below threshold; fail-closed 500 when the plan lookup throws or the tier is unusable |
| `practice.routes.test.js` | 134 | every endpoint: happy path, filters/pagination/status, validation 400/404, no-body 500s, exact AI prompts + options, fallback paths, DB-failure swallowing, partial stats, streak table, bookmark toggle, grading + percentile table, real infra `aiClient` integration (fetch stubbed) |
| `practice.parity.test.js` | 18 | source parity with Express (data block, SQL, statuses, logs, guards) and Worker-forbidden constructs |
| `practice.mount.test.js` | 5 | the slice mount file: manifest parity through `mount(app)`, aggregator registration, end-to-end requests |

Other evidence:
* Bundle: `wrangler deploy --dry-run` with a throwaway entry (`createApp()` + `mount()` only) in `backend/.wrangler/tmp-large3/`:
  succeeded, 922.25 KiB / 198.43 KiB gzip (this includes every slice registry that `createApp` pulls in, not only this route). A separate esbuild bundle
  of the same entry contains none of `initializeTables`, `runMigrations`, `ensureTables` or any `CREATE TABLE`.
* `wrangler dev --local` (synthetic secrets, unreachable synthetic DB URL, port 8797, process tree killed afterwards):
  no token 401, bad token 401, valid token with the DB unreachable 500 `{"error":"Failed to verify subscription plan"}` (fail closed,
  never 200), unknown route 404, `/api/health` 200 `degraded`.
* Mutation check: 10 deliberate edits to the route (tier 1 to 2, dropped auth, dropped plan, changed message, changed SQL,
  dropped a filter, changed clamp, data typo, reordered handlers, wrong user id) were each caught by at least one test.
* `tests/worker/sourceTree.test.js`: no offender in any file of this slice. At the time of the last run that test was
  red because of other slices' work in progress (`atsExport.js`, `resume.js`, `resumeV2.js`, `services/docs/multipart.js`
  comments naming Express idioms; `learningModules.js` importing `../../data/*.json`). Not mine, not touched.

## NOT verified

* SQL correctness and driver behaviour against real Neon: the fake db matches the exact statement text and models
  behaviour only. Specifically unproven: `DATE(created_at)` and TIMESTAMP values as parsed by the Neon driver on Workers
  (the streak depends on them), `MAX(score)`/`AVG(score)`/`COUNT` coming back as strings, `UNIQUE(user_id, problem_id)`.
* That the three practice tables exist in the target database (deviation 1).
* Real AI providers (never called; `aiClient` was faked or stubbed).
* Byte-level response parity with Render (headers, ETag, whitespace); no differential run against a live Render.
* Behaviour under the Workers CPU limit / concurrent load; the Vercel proxy chain (`CF-Connecting-IP` is not used here).
* Frontend behaviour against these responses (no frontend edits or tests).
