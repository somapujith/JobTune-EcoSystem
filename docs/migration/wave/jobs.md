# Wave notes: `jobs` slice (ADR-001 wave 3E, the `/api/jobs` group)

Ported by the `jobs` agent. Render/Express is untouched. Ported from the working tree at git HEAD `38d8130a`
(none of the files in this slice had uncommitted edits).

## What was ported

Routes (`backend/src/worker/routes/`), 9 endpoints, identical to the 9 `/api/jobs*` entries of `docs/migration/manifest.render.json`:

| Route file | Endpoint | Guards (== manifest) |
|---|---|---|
| `jobTracker.js` | `GET /api/jobs` | auth |
| | `POST /api/jobs` | auth, requirePlan(3) |
| | `PATCH /api/jobs/:id` | auth (no plan gate) |
| | `DELETE /api/jobs/:id` | auth (no plan gate) |
| `jobAnalyzer.js` | `POST /api/jobs/analyze-description` | auth, requirePlan(3) |
| `coverLetter.js` | `POST /api/jobs/generate-cover-letter` | auth, requirePlan(2) |
| `jobDiscovery.js` | `GET /api/jobs/discover` | auth, requirePlan(2) |
| `jobFit.js` | `POST /api/jobs/fit` | auth, requirePlan(3) |
| `achievementEnhancer.js` | `POST /api/jobs/achievement-enhancer/enhance` | auth, requirePlan(2) |

Services (`backend/src/worker/services/`): `achievementEnhancerService.js`, `discovery/{JobSource,MockJobSource,RemotiveSource,AdzunaSource,index}.js`,
`scoring/strategies/jobFit.js`. Registry (`services/registry/jobs.js`, 3 lines): `achievementEnhancerService`, `discovery`, `jobFit`.
Mount (`routes/mounts/jobs.js`): six `mountRoutes` calls in the exact order of `backend/src/app.js` (mount orders 14, 17, 18, 23, 24, then 29).

Dependencies on other slices, all through the container, nothing copied: `services.aiClient` (`callAI`, `extractJSON`), `services.onetLoader`
(`findOccupation`, `getDomain`), `services.actionVerbAnalyzer` (`analyze`, `STRONG_VERBS`), `services.metricsAnalyzer` (`analyze`) from infra;
`planService` (via `requirePlan`). `services/apiResponse.js` (infra) is imported directly by `jobTracker.js` and `jobDiscovery.js` (it is stateless;
signature `(c, ...)`). All four container entries exist in infra's registry as of this writing and the slice's tests run against them
(`registry.test.js`, `jobFit.scorer.test.js`, `achievementEnhancerService.test.js`).

## Ordering (the ADR's "highest ordering risk")

Express registers, for `/api/jobs`: tracker (`GET /`, `POST /`, `PATCH /:id`, `DELETE /:id`), analyzer, cover letter, discovery, fit, then the sibling mount
`/api/jobs/achievement-enhancer`. Consequences that the Worker reproduces exactly (and `tests/worker/jobs/jobs.routing.test.js` proves against the REAL
Express routers on a bare `express()` app, request by request):

* `PATCH|DELETE /api/jobs/<any single segment>` (including `discover`, `fit`, `analyze-description`, `generate-cover-letter`, `achievement-enhancer`) is
  captured by the tracker's `/:id` (NaN id -> database error -> 500 with the raw message; a real numeric id works). No `GET|POST|PUT /:id` exists, so
  `GET /api/jobs/5` is a 404 and every static route is reachable by its own method.
* `/:id` never matches two segments, so `POST /api/jobs/achievement-enhancer/enhance` is not shadowed (also asserted structurally: no earlier POST route
  pattern matches it, and for every endpoint the first registered route matching its own path+method is itself).

Test evidence: 64 request cases run against both stacks (status, byte-identical body text with timestamps masked, SQL + parameters, AI-client call options) plus 8 structural / known-difference checks, and 36 manifest checks
including the official `compare-manifests.js` (zero findings; and a negative control proving the referee catches a lowered tier).
`node scripts/migration/generate-worker-manifest.js --only-prefix /api/jobs` + `compare-manifests.js`: PASS, 9/9 compared, exit 0
(on Windows Git Bash prefix `MSYS_NO_PATHCONV=1`, otherwise `/api/jobs` is rewritten to a filesystem path).

## Deviations forced by the platform (each documented in the file header too)

1. **RemotiveSource: `node-fetch` -> platform `fetch` (behavioural difference vs Render, needs your decision).** The Express class does
   `require('node-fetch')` lazily inside `search()`. `node-fetch` is not in `backend/package.json`, not in the lockfile and not in `node_modules` in this
   working tree, so the `require` throws and the surrounding `catch` returns `[]`: on Render `GET /api/jobs/discover?source=remotive` almost certainly
   ALWAYS returns zero jobs (I did not verify Render's actual `node_modules`; the existing Jest test hides this by mocking `node-fetch` as a virtual module).
   A Worker cannot `require('node-fetch')`, so the port calls the platform `fetch` (injectable, default = global, called as a bare function because workerd
   throws "Illegal invocation" for method-style calls). Result: on Workers `source=remotive` will return REAL Remotive jobs and write them to
   `discovered_jobs`. If the point is strict parity ("Remotive returns nothing"), that is a one-line change; I judged returning real data the only sensible
   port, but it is a change you should know about.
2. **AdzunaSource:** `ADZUNA_APP_ID` / `ADZUNA_APP_KEY` come from `config.vars` (already in `PASSTHROUGH_VARS`), read at call time. `fetch` injected as above.
3. **Model names:** `process.env.LM_STUDIO_MODEL_{JOB,SKILLS,RESUME,FIT}` -> `config.vars.*` (all in `PASSTHROUGH_VARS`). Precedence chains unchanged
   (analyzer JOB->SKILLS, cover letter JOB->RESUME, enhancer RESUME->JOB, fit FIT->`'qwen2.5-7b'`).
4. **Services are factories** (`createDiscovery({config, fetch})`, `createJobFitScorer({config, services})`,
   `createAchievementEnhancerService({services})`); the two v2 analyzers, the AI client and the O*NET loader come from the container, resolved lazily.
5. **jobFit scorer resolves `services.aiClient` and throws if it is missing, OUTSIDE the "any LLM failure -> rule based" try/catch.** Without this a
   mis-wired container would have silently degraded every score to the rule-based path (the original could not have this failure mode). Provider failures still fall back exactly as before.
6. `next(err)` in `jobFit` became `throw err` (same masked 500 through `onError`). `res.status(204).send()` became `c.body(null, 204)`.
7. Header-level differences already listed in `src/worker/README.md` (no weak `ETag`, `application/json` without `; charset=utf-8`), and
   **path case**: Express matches `/api/jobs/DISCOVER`, Hono does not; and **malformed percent-encoding in a `:param`** (`PATCH /api/jobs/%E0%A4%A`): Express's
   router answers 400 `{"error":"Failed to decode param '...'"}` before the handler, Hono passes the raw text through (here it becomes a NaN id -> database error -> 500).
   Both are generic router differences affecting every param route in the backend, not jobs-specific; both are asserted in the routing test as known differences
   (the frontend uses lower-case paths and never sends malformed encodings).

## Pre-existing behaviour preserved, NOT fixed (ADR 4.3)

* Tracker: `GET /api/jobs` and `PATCH|DELETE /:id` are not plan-gated (only `POST` needs tier 3): a user with no plan can list, edit and delete existing rows.
* Tracker: `POST` performs no `status` validation (any string is inserted; only `PATCH` validates); `PATCH` cannot clear `notes` or `status`
  (`COALESCE`, `status || null`); `parseInt` semantics on `:id` (`12abc` -> 12, `abc` -> NaN, sent to the database, which rejects it).
* `apiResponse.serverError` returns the raw error message in the 500 body (`{success:false,error:<db message>}`): DB error text is exposed to the client on
  tracker and discovery paths. Neon's messages will differ from `pg`'s.
* A missing/undefined JSON body: tracker `POST`/`PATCH` and `fit` throw a TypeError -> masked `{"error":"Internal Server Error"}`; analyzer / cover letter
  read the body inside their `try`, so they answer their own 500 text (`Failed to analyze job description` / `Failed to generate cover letter`);
  the enhancer tolerates it (400).
* Cover letter: an omitted `experience` is interpolated as the literal text `undefined`; the fallback letter ignores `tone` (`toneWord` is unused) and
  opens with the very phrase the system prompt forbids; a truthy non-string `jobDescription` -> 500.
* Analyzer fallback: the seniority regex `mid|intermediate` matches inside words (`middleware`), the bullet regex `[•-]\s*([^•\n]+)` treats any hyphen as a
  bullet and swallows following hyphens up to a newline; the parsed AI JSON `null` -> TypeError -> 500.
* Discovery: `cached: true` is reported even when every cache write failed; cache inserts run sequentially and are awaited before the response (up to 20
  sequential queries; on Workers each is a round trip); the dedupe key `(source, external_id)` is global, so the first user to see a job owns the row;
  `VALID_SOURCES` includes `adzuna` although the route's docs still say `mock | remotive`; a source that returns `[]` does NOT fall back to mock, only a throw does
  (Remotive and Adzuna never throw, they swallow errors into `[]`, so the fallback path is reachable only via a bug or the mock source).
* Enhancer: `hasStrongVerb` keeps the leading verb and lower-cases only the first object word (`Created attendance System`); AI output is discarded
  unless it has at least as many lines as inputs; `callAI`'s cache key ignores the model (infra).
* jobFit: a truthy non-string `resumeText`/`jobDescription` reaches `trim()` in the scorer and produces the masked 500.

## Tests (`backend/tests/worker/jobs/`, all synthetic; 12 suites, 431 tests, all passing; run with `npx jest tests/worker/jobs --coverage=false`)

`jobTracker.routes`, `jobAnalyzer.routes`, `coverLetter.routes`, `jobDiscovery.routes`, `jobFit.routes`, `achievementEnhancer.routes` (401 / tier 403 shape /
threshold ok / happy path / validation / error paths / exact SQL + params / AI prompts and models), `discovery.services` (vs Express sources, incl. Adzuna URL parity),
`jobFit.scorer` (vs Express over a 12-input corpus x 7 AI behaviours, also through the real registry and real infra `onetLoader`),
`achievementEnhancerService` (vs Express, also with the real infra analyzers), `jobs.routing` (vs the real Express routers), `jobs.manifest`
(`listRoutes` vs `manifest.render.json`, official comparator), `registry` (real `createServices`, shipped mount file, plan gates on the fully wired app,
and the real infra `aiClient` with only the provider `fetch` stubbed). Helper: `jobsHarness.js`.
The Express modules are loaded in tests only with `config/database`, the auth middleware and the plan gate mocked BEFORE they load (the database module
otherwise loads an env file); no real database, secret or network is touched.

## Not verified

* Nothing ran against Neon or a real database: SQL is compared textually with Express (identical statements and parameters) but not executed; the tables
  `job_applications` / `discovered_jobs` were not inspected. Neon-specific behaviour (error messages, NaN parameter binding, 20 sequential inserts on the request pool) is untested.
* Nothing ran in workerd/`wrangler dev`. Only `wrangler deploy --dry-run` (bundle builds; a separate esbuild pass shows no `initializeTables`/`runMigrations`/`ensureTables`
  and no `node-fetch` in the bundle). Outbound `fetch` from a Worker to Remotive/Adzuna was never exercised; the bare-call wrapper follows the infra note about "Illegal invocation".
* Real Remotive/Adzuna payload shapes are as assumed by the Express code (unchanged mapping); no live API call was made.
* Auth 401 / tier 403 behaviour of the routes is proven through the Worker's own `authenticateToken` / `requirePlan`; on the Express side of the differential
  tests those are stubbed, so it is not an Express-vs-Worker status comparison for 401/403 (the manifest comparison covers the guard placement).
* Full `npx jest tests/worker` currently has 4 failing suites outside this slice (sourceTree, planService, mid2/aiTutor, auth/admin.routes: other slices' work in progress).
  `sourceTree.test.js` lists no offender from `jobs` files.

---

## Orchestrator decision (supersedes the RemotiveSource deviation above)

Verified `node-fetch` is absent from `backend/package.json`, the lockfile and `node_modules`, so on Render
`source=remotive` always returns `[]` (the require failure is swallowed by the `try/catch`). ADR-001 §4 says the port
must not change behavior, and a working Remotive source would (a) show up as a false diff in the differential runner
and (b) start writing third-party job data into `discovered_jobs` from prod. `RemotiveSource` therefore defaults to a
fetch that fails the same way, returning `[]`. The `{ fetch }` constructor seam remains. **Post-cutover fix (one line):**
make `DEFAULT_FETCH` `(...args) => fetch(...args)`, or add `node-fetch` to Express too and fix both together.
