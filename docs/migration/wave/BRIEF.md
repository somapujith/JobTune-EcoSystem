# Porting wave brief (ADR-001 Phases 2-4) — READ FULLY BEFORE STARTING

You are one of several agents porting the Express backend (`backend/src/`) to a Cloudflare Workers / Hono app
(`backend/src/worker/`), in parallel, in one working tree. Governing document: `docs/migration/ADR-001-cloudflare-workers-port.md`
(read §4, §6, §7 Phase 2/3 and §10). Foundation and conventions are DONE and documented in `backend/src/worker/README.md`
(read all of it, especially the Express→Worker cheat sheet, uploads, and route introspection). Phase 0 spike findings are in
`docs/CLOUDFLARE_MIGRATION.md` ("Phase 0 spike results") — read them; they change some ADR assumptions.

## Hard rules (violations get the work thrown away)

1. **No production access.** Never read `backend/.env`, never open a connection to any real database or external service, never use real
   secrets. (The harness already blocked one production DB read in this session; do not work around it.) Tests use the in-memory fake db
   (`backend/tests/worker/helpers/fakeDb.js`) and synthetic secrets only.
2. **No deploys / outward actions.** No `wrangler deploy` (only `--dry-run`), no `wrangler secret put`, no edits to `frontend/`, no `git commit/add/stash/checkout/restore/reset`,
   no `npm install` (concurrent installs corrupt `node_modules`; if you need a package, say so in your report).
3. **Never touch Express code** (`backend/src/{app.js,server.js,routes,services,middleware,utils,config}/**` other than reading). Render stays authoritative.
   Another Claude session has UNCOMMITTED edits in some Express files (planService.js, subscriptions.js, careerRoadmap.js, app.js, database.js,
   runMigrations.js, server.js) — read the WORKING-TREE versions of those (they are the current truth); read HEAD versions of everything else
   (identical anyway). Also untouched by you: the user's Docker files (Dockerfile, docker-compose.yml, .env.docker, .dockerignore), root package.json, docs/SETUP.md, README.md, frontend/**.
4. **No behavior changes.** Port faithfully: same routes, methods, status codes, response bodies (byte-identical JSON shapes/keys/messages), same SQL,
   same validation, same error messages, same middleware order per route. Preserve existing bugs; record them in your notes file, don't fix them (ADR §4.3).
   The only allowed deviations are where the Worker platform forces one (document each) and **fail-closed on entitlements** (`requirePlan` fails closed; never widen access).
5. **Every `authenticateToken` and `requirePlan(n)` in Express appears identically on the Worker route.** Manifest is the referee:
   `docs/migration/manifest.render.json` (endpoint → auth, minTier, guards) generated from Express source; `docs/migration/manifest.render.md` explains the schema and lists oddities.
   Local guards (`requireAdmin`/`requireRole` defined inside route files) must be re-implemented faithfully and tagged via `tagMiddleware` (`{kind:'admin'}` / `{kind:'role', roles:[...]}`) — check
   `backend/src/worker/lib/tag.js` and the manifest schema for exact kinds.
6. **No ambient globals in `src/worker/`**: no `process.env`, `process.exit`, `fs`, `path`-based file reads, `req.ip`, `req.connection`, module-scope timers/side effects, dynamic `require`. Read config via `getConfig(c)` (`config.vars.NAME` for the pass-through vars; if a var you need is missing from
   `PASSTHROUGH_VARS`, tell the orchestrator in your report — only the "infra" slice edits `config.js`). Never import `pool`; use `getDb(c)` or an injected service. The lint test `tests/worker/sourceTree.test.js` enforces these; keep it green.
   Never include `initializeTables|runMigrations|ensureTables`.
7. **Timers**: `setTimeout`/`setInterval`/floating promises after the response do not survive on Workers — use `safeWaitUntil(c, promise)`.
8. Express `req.body` → `getBody(c)`, query → `getQuery(c)`, multer → `readUpload` (keep size + mimetype allowlists), binary responses → `new Response(bytes, {headers})`.

## File ownership (this is how we avoid collisions — do not create/edit files outside your ownership)

You may create/edit ONLY:
- your route files `backend/src/worker/routes/<name>.js` (same base name as the Express file),
- the service/util ports listed for your slice below, at `backend/src/worker/services/<same relative path as Express>.js` (CommonJS factory `createXxx({db, config, services})`, no ambient globals),
- **your slice's registry file** `backend/src/worker/services/registry/<slice>.js` (add one line per service; key = the module's camelCase base name, e.g. `studyHistoryService`) and
  **your slice's mount file** `backend/src/worker/routes/mounts/<slice>.js` (`mountRoutes(app, prefix, router)` in the SAME relative order as `backend/src/app.js`),
- tests under `backend/tests/worker/<slice>/**` (never edit existing test files or helpers; copy helper patterns instead — `tests/worker/helpers/{harness,fakeDb}.js` are read-only for you; if you need a helper change, use your own helper file in your slice dir),
- notes: `docs/migration/wave/<slice>.md` (what you ported, deviations, preserved bugs, anything unverified).
Do NOT edit `src/worker/app.js`, `services/index.js`, `routes/mounts/index.js`, `config.js`, `README.md`, `lib/**`, `middleware/**` or other slices' files. Need a change there? Say so in your report (the orchestrator applies it).

## Cross-slice service contract

A service owned by another slice is **not yours to port**. Code against `getServices(c).<name>` where the object exposes the same public
methods/signatures as the original module's exports (for `module.exports = new Foo()` singletons: the instance API; for classes with statics: the static methods on the object;
for `{fn1, fn2}` exports: those functions). Registry key = camelCase file base name. In tests, inject a fake via `createServices({..., overrides})` / `createApp({servicesFactory})`.
Shared services owned elsewhere: `aiClient`, `aiCache`, `embeddings` (infra); `planService`, `sessionService` (auth slice / foundation; do not modify);
`studyHistoryService` (leaf2); `resumeDatabase` (docs); `recommendationEngine` (auth); v2 analyzers (`services/v2/*` except export engine) (infra).
`aiClient` contract: same exported functions as `backend/src/utils/aiClient.js` (e.g. `callAI(...)`), reading config from the injected `config`, and per-request cache via `aiCache`.

## Testing

- Jest, `--coverage=false` ALWAYS (a coverage run rewrites tracked files under `backend/coverage/`). Run only your slice: `npx jest tests/worker/<slice> --coverage=false`, plus `npx jest tests/worker/sourceTree.test.js --coverage=false`.
- Route tests mount your router into the harness: `makeHarness({ configureApp: (app) => mountRoutes(app, '/api/x', router) })` (see `tests/worker/helpers/harness.js` and `tests/worker/exampleRoute.test.js`). To test real services, register them via `createServices({ overrides })` or supply `servicesFactory`.
- Every route file needs: (a) auth/tier parity tests (401 without token; `PLAN_UPGRADE_REQUIRED` 403 shape for each `requirePlan(n)` endpoint below threshold; ok at threshold), (b) happy path + the main error paths per endpoint (same status/body as Express — read the Express code and its existing test if any in `backend/tests/`), (c) validation failures.
- Green tests prove ported logic vs fakes only. They do NOT prove SQL, Neon behavior or runtime compat; say exactly what you did not verify.
- `createApp()` mounts NOTHING from the slices by default (`mountSlices` is false; only `src/worker-entry.js` opts in), so your tests only ever see routers you mount yourself and other slices' work-in-progress cannot break your tests. The real app includes your `routes/mounts/<slice>.js` and `services/registry/<slice>.js` via aggregators, so **write those two files LAST, only after your route/service files and tests are complete and green, and keep them requiring only finished files** (a syntax error there breaks the whole Worker build for everyone).
- Bundle sanity for your own code: write a throwaway entry under `backend/.wrangler/tmp-<slice>/` (gitignored) that does `createApp()`, mounts only YOUR router(s) and registry entries, exports `{ fetch }`, and run `npx wrangler deploy --dry-run --outdir backend/.wrangler/tmp-<slice>/out --config <a temp wrangler.toml you create there, copying backend/wrangler.toml settings and pointing `main` at your throwaway entry>` to prove your modules bundle under workerd's rules. Delete nothing outside your own tmp dir. Never edit `backend/wrangler.toml` (the `docs` slice only).

## Definition of done per route file (ADR §7)

1. Same status codes as Express for the same inputs. 2. Every `requirePlan(n)` preserved with identical n. 3. `authenticateToken` on exactly the same endpoints. 4. No module-scope `process.env`, no `fs`, no `req.ip`. 5. Response bodies identical in shape for a representative request per endpoint.
Finish by running the manifest checker if it exists (`node backend/scripts/migration/generate-worker-manifest.js --only-prefix <your prefixes>` — another agent is writing it; skip if absent) and state the result.

## Final report (<= 40 lines, your only output)

Files created (paths); endpoints ported (count per file vs Express manifest); tests (counts, pass/fail); registry lines and mounts you added; deviations forced by the platform;
preserved pre-existing bugs (list); anything requiring orchestrator action (config vars, shared-file changes, packages); what you could NOT verify. Do not claim anything you did not run.

## Slice table

| Slice | Owner scope |
|---|---|
| `infra` | Services: `utils/aiClient.js`→`services/aiClient.js`, `utils/aiCache.js`→`services/aiCache.js` (per-isolate LRU; document the hit-rate regression), `utils/embeddings.js`→`services/embeddings.js` (module-scope `LM_STUDIO_URL` → config), `services/taxonomy/onetLoader.js` (static JSON import of `src/data/onet/occupations.json`), `utils/apiResponse.js`→`lib`-style helper `services/apiResponse.js` (export the same helpers), ALL pure v2 analyzers `services/v2/*` (except resumeExportEngine) verbatim-with-DI. Also the ONLY slice allowed to edit `config.js` (PASSTHROUGH_VARS: verify every `process.env.X` in `backend/src/**` is covered; add the working-tree CORS origin `http://127.0.0.1:5173`), `routes/health.js` + `lib/aiCacheStats.js` (mirror the current working-tree Express `/api/health`: async, `SELECT 1`, `{status:'ok'|'degraded', db:'connected'|'unreachable', aiCache}` HTTP 200) and `tests/worker/**` health/config tests. No routes. |
| `auth` | Routes `auth` (+ `authRateLimit()` on `/api/auth/*` per the README), `subscriptions`, `admin`, `adminPanels`; services `recommendationEngine`; **update `services/planService.js`** with `setOnboardingCompleted`/`getOnboardingCompleted` (working-tree Express planService.js) and mirror the working-tree `subscriptions.js` (`GET /onboarded` from `users.onboarding_completed`; `verify-payment` calls `setOnboardingCompleted` after `assignPlan` and in the already-paid branch; NO `/select-plan`). Also `/admin` static page: inline `backend/src/public/admin/index.html` as a served string at the same path Express serves it (see `app.js` `express.static`), never reading files. `requireOnboarding` stays UNMOUNTED (ADR 4.3.1; do not port or mount it). Payment rules ADR §6.4: idempotent `markOrderPaid`, cross-user check preserved; the unguarded mock verifier is ported as-is and flagged in your notes for the user's explicit decision (checklist item 16). Login/signup must use `lib/password.js` and `lib/jwt.js`; wrap `compare` so a malformed stored hash returns false only if Express does the same (spike S7 found bcryptjs THROWS where native returns false — Express native `bcrypt.compare` returned false → 401; preserve 401 via try/catch inside the route). Client IP via `getClientIp(c)` in `getRequestMeta`. |
| `leaf1` | Routes `projects`, `benchmarks`, `resumeConsistency`, `recruiterVisibility`, `guides`, `progress`; services `benchmarks/scorerBenchmark`, `resumeConsistencyService`, `recruiterVisibilityService`, `guides/jobGuideGenerator`, `progressService`. |
| `leaf2` | Routes `evidence`, `piiRedaction`, `activity`, `learningPath`, `studyHistory`; services `evidence/evidenceTracker`, `pii/piiRedactor`, `activityService`, `learningPathService`, `srsService`, `studyHistoryService`. |
| `mid1` | Routes `resumeChat`, `learning`, `jobPreparation`, `careerRoadmap` (includes the two NEW working-tree routes `POST/GET /api/career/discovery`, authenticateToken only), `interview`. |
| `mid2` | Routes `skills`, `dashboard`, `learningModules`, `aiTutor`, `studyTools`; services `tutorHistoryService`. |
| `jobs` | The whole `/api/jobs` group as ONE ordered unit: `jobTracker` + `jobAnalyzer` + `coverLetter` + `jobDiscovery` + `jobFit`, plus the sibling mount `/api/jobs/achievement-enhancer` (`achievementEnhancer` route + `achievementEnhancerService`) — replicate the exact Express mount order from `backend/src/app.js` and prove with a test that no earlier `/api/jobs/:id` route shadows `/api/jobs/achievement-enhancer/*`. Services: `discovery/*` (JobSource, MockJobSource, RemotiveSource, AdzunaSource, index — AdzunaSource module-scope env → config), `scoring/**` (jobFit strategy + anything under `services/scoring`). |
| `large1` | Routes `community`, `projectBuilder`, `courses`. |
| `large2` | Routes `aiCoach`, `profiles`; services `linkedinAnalysisStore`, `linkedinOptimizerService`. |
| `large3` | Route `practice`. |
| `docs` | Doc/upload groups: `/api/resume` = `resume` + `resumeV2` (in Express order), `/api/ats` = `atsExport` + `atsCheckerV2`; services `resumeExport`, `v2/resumeExportEngine`, `resumeDatabase`. Apply spike results (docs/CLOUDFLARE_MIGRATION.md): `pdf-parse` via a pinned `pdf.js v1.10.100` wrapper passing a `Uint8Array`; `mammoth.extractRawText({ arrayBuffer })` (NOT `{buffer}`); pdfkit standalone alias; `unzipper` (if used) and `node-ensure`/`@aws-sdk/client-s3` stubs. You are the ONLY slice that edits `backend/wrangler.toml` (`[alias]` section) and you own `backend/src/worker/stubs/**` (copy the proven stubs from `backend/spike/docs/stubs/` and `backend/spike/docs/wrangler.fixed.toml`). Uploads via `readUpload` with the original limits (5 MB atsCheckerV2 with its mimetype allowlist, 10 MB resume) and unchanged validation. Binary download responses in atsExport with correct `Content-Type` / `Content-Disposition`. Prove with a real `wrangler dev --local` (synthetic data only, port 8790+, kill your processes after) that a generated PDF/DOCX round-trips and a fixture PDF/DOCX uploads and parses (fixtures: `backend/spike/docs/fixtures/` if present — regenerate with `node spike/docs/make-fixtures.mjs`). |
