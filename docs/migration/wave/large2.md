# Wave 3F, slice `large2`: `/api/ai-coach`, `/api/profiles`, LinkedIn services

Ported from git HEAD `38d8130a` (none of these four Express files had uncommitted edits). Render stays authoritative; nothing under `backend/src/{routes,services,...}` was touched.

## What was ported

| Express | Worker | Notes |
|---|---|---|
| `routes/aiCoach.js` (813 LOC, 7 endpoints, 7 `requirePlan`) | `src/worker/routes/aiCoach.js` | mount `/api/ai-coach` (Express mount #34) |
| `routes/profiles.js` (1061 LOC, 12 endpoints, 8 `requirePlan`) | `src/worker/routes/profiles.js` | mount `/api/profiles` (Express mount #8) |
| `services/linkedinAnalysisStore.js` | `src/worker/services/linkedinAnalysisStore.js` | `createLinkedinAnalysisStore({ db })`, registry key `linkedinAnalysisStore` |
| `services/linkedinOptimizerService.js` (719 LOC) | `src/worker/services/linkedinOptimizerService.js` | `createLinkedinOptimizerService({ config, services })`, registry key `linkedinOptimizerService`; uses `services.aiClient` |

Plus `services/registry/large2.js` (2 lines), `routes/mounts/large2.js` (profiles, then ai-coach; the same relative order as `app.js`), and tests in `tests/worker/large2/`.

Guards per endpoint (all endpoints are authenticated):

* aiCoach: `career-score`, `recommendations`, `skill-gap`, `career-plan`, `compare-roles` are `requirePlan(3)`; `code-review`, `review-history` are `requirePlan(2)`.
* profiles: `github/{analyze,generate-repo-readme,optimize-bio,save}` and `linkedin/{analyze,generate-headline,generate-about,generate-experience}` are `requirePlan(2)`; `github/history`, `linkedin/history`, `linkedin/history/:id`, `jobmatch` are `authenticateToken` only.

How the port was made: the plumbing was rewritten mechanically (`req.user.id` to `c.get('user').id`, `req.body` to `getBody(c)`, `req.query.limit` to `getQuery(c).limit`, `req.params.id` to `c.req.param('id')`, `res.json/status` to `return c.json(x, status)`, `pool.query` to `getDb(c).query`, `callAI/extractJSON` to the injected `aiClient`); all prompts, scoring engines, fallback generators, SQL, status codes and messages are the Express text. The optimizer service body is left at its original indentation on purpose: the LLM prompts are multi-line template literals and re-indenting would change the prompt bytes. The test suite proves this (see "Evidence").

## Deviations forced by the platform (each is deliberate and small)

1. **No `Buffer`.** `profiles.js` decoded the GitHub profile README with `Buffer.from(content, 'base64').toString('utf8')`. Replaced by `decodeBase64Utf8` (`atob` + `TextDecoder`, both present in workerd, probed). It mirrors Node's lenient decoder (stops at the first `=`, skips non-alphabet characters, accepts base64url characters, drops a dangling sextet, keeps a leading BOM, U+FFFD for invalid UTF-8). Fuzzed against Buffer on 20,000 random inputs, plus a differential scenario per quirk, plus the same eight probes run in a real `wrangler dev --local`: identical.
2. **No schema bootstrap.** `aiCoach.js` ran `CREATE TABLE IF NOT EXISTS code_reviews` and `... career_coach_sessions` at module load. Dropped (ADR 6.5). Every read/write against those tables already had its own try/catch, so a missing table degrades exactly as before (best-effort save skipped, `review-history` returns `{"reviews":[]}` with HTTP 200). **Dependency:** `code_reviews` and `career_coach_sessions` exist in Neon only because Render's `aiCoach.js` created them at boot; `github_analyses` is created only by `src/migrations/add-github-analyses.sql`; `linkedin_analyses` by `initializeTables`/`runMigrations`. A fresh Neon branch needs those tables created out of band (DDL for the first two is in the Express `aiCoach.js`).
3. **Config, not environment.** `process.env.LM_STUDIO_MODEL_GITHUB || LM_STUDIO_MODEL` and `LM_STUDIO_MODEL_LINKEDIN || LM_STUDIO_MODEL` are read from `config.vars` at request time. All three names are already in `PASSTHROUGH_VARS`; **no config change is needed.** No module-scope reads existed.
4. **Fail loud on a mis-wired `aiClient` / linkedin service (new, Worker-only).** If `getServices(c).aiClient` (or `linkedinOptimizerService` / `linkedinAnalysisStore`) is missing or lacks `callAI`/`extractJSON`, the route throws (masked 500, or the route's own 500 message) instead of letting an `undefined.callAI` TypeError be swallowed by the handlers' catch blocks and silently degrade every request to the rule-based fallback. This cannot happen on Express (module imports cannot be missing), so it only changes behaviour in a broken deployment. Everything else, including "the AI provider is down", behaves exactly as before.
5. **Header-level differences the README already lists** (Content-Type without `charset=utf-8`, no ETag, Hono's own headers). Not compared by the tests.
6. **Egress differs.** GitHub API (`api.github.com`) and LinkedIn public-page fetches leave from Cloudflare instead of Render. See "What is NOT verified".

## Preserved pre-existing bugs and quirks (documented, NOT fixed; ADR 4.3)

* aiCoach `recommendations`, `skill-gap`, `career-plan`, `compare-roles`, `code-review` destructure the body **outside** their try/catch: a request with no JSON body is a masked 500 (Express 5 behaviour, same here). profiles `github/analyze`, the three `linkedin/generate-*` handlers and `jobmatch` also 500 on a missing body (inside try: the route's own message; `jobmatch`: masked). `github/generate-repo-readme`, `optimize-bio`, `save` and `linkedin/analyze` use `|| {}` and do not.
* aiCoach `skill-gap` with non-string `currentSkills` items (e.g. `[1, 2]`) and the AI unavailable: the fallback generator throws inside the try **and again inside the catch**, so the response is a masked 500 (differential scenario covers it).
* aiCoach `career-score`: when one component query fails, that component keeps its *initial* value (profile 40, project 35, resume 30, interview 25), which differs from the value computed for an empty table (40/20/25/15). The outer catch and `generateFallbackScore` are effectively unreachable (every risky call has its own catch).
* aiCoach fallback generators use `Math.random`: two identical requests get different fallback numbers.
* aiCoach `compare-roles` does not validate role names against `TARGET_ROLES` and interpolates them raw into the prompt (prompt-injection surface, and no length cap). The 5,000-char cap exists only on `code-review`.
* profiles `github/analyze` lower-cases the username; a regex allows 1 to 39 chars. `existingReadmeContent` is fetched only when a repo named exactly like the user exists.
* profiles `linkedin/history/:id` passes the raw id to SQL: a non-numeric id is a Postgres error and a 500 (not 400/404).
* profiles `jobmatch` is a synchronous handler with no try/catch: a non-string `jobDescription`/`userSkills` is a masked 500; it has no plan gate (auth only), which matches the manifest.
* profiles `github/save` stores whatever JSON it is given (no validation); its user id comes from the JWT, never the body (tested).
* `getAIEnhancements` and the LinkedIn calls use the aiClient default `cache: true`; the aiClient cache key ignores the model, so a model change does not invalidate cached answers. That is infra's behaviour, unchanged.

## Evidence (all Jest, `--coverage=false`; 725 tests in `tests/worker/large2/`, 743 with `sourceTree.test.js`; all green)

* `manifest.test.js` (222 tests): loads `docs/migration/manifest.render.json`; mounts only this slice's routers with the `app.js` prefixes in a mini-app; asserts, from `listRoutes(app)`, that the endpoint set is exactly the 19 manifest endpoints (no missing/extra), registration order per router, mount order, `auth`, `minTier`, guard chain (names and order), no admin/role guard, no untagged middleware. Then, **for every one of the 15 plan-gated endpoints and every user tier**: below threshold gives 403 with the exact `PLAN_UPGRADE_REQUIRED` body (`requiredPlan`, `currentPlan`), the handler/AI/DB never runs; at and above threshold the request reaches the handler; all 19 endpoints give 401 without a token and with a bad token. Also fail-closed: a DB error resolving the plan is a 500 and never reaches the handler; a plan row with an unverifiable tier is a 500.
* `differential.test.js` (348 tests): drives the **original Express routers** (read-only `require` of `src/routes/{aiCoach,profiles}.js` and, through them, `src/services/linkedin*.js`, with only auth/plan/db/aiClient mocked) and the Worker port with identical synthetic fixtures (same fake DB, scripted aiClient, stubbed fetch, pinned clock and `Math.random`), and asserts identical status, **byte-identical JSON body**, identical AI calls (prompts, model, budget, temperature, cache flag), identical outbound fetches (URL, headers), identical SQL text and parameters, identical table contents. 113 hand-written scenarios (every endpoint, every branch I could construct) plus 230 seeded random cases (90 GitHub portfolios with boundary values at every scoring threshold, 60 jobmatch, 50 LinkedIn pasted profiles, 30 ai-coach). Mutation checks (temporarily edited the port; all caught): tier changes, dropped `requirePlan`, threshold and boundary edits, prompt whitespace, store cap, slice length, BOM/padding/dangling-sextet base64 handling.
* Service tests port the Express `linkedinAnalysisStore` / `linkedinOptimizerService` tests and add model-selection, wiring and fallback coverage (53 tests). `base64.test.js` (16). `wiring.test.js` (7) exercises the real registry and mount files end to end with only `aiClient` supplied. `aiCoach.routes.test.js` (64) and `profiles.routes.test.js` (15) cover validation, AI-failure fallbacks, best-effort writes, masked errors, ownership checks.
* `node scripts/migration/generate-worker-manifest.js --only-prefix /api/profiles --only-prefix /api/ai-coach` then `compare-manifests.js` against `manifest.render.json` with the same filter: **PASS, 19/19 endpoints, critical=0 error=0 warn=0** (run with `MSYS_NO_PATHCONV=1` under Git Bash, or the prefixes are rewritten to `C:/Program Files/Git/...`).
* Bundle: throwaway entry in `backend/.wrangler/tmp-large2/`, `wrangler deploy --dry-run` succeeds (2552 KiB raw / 570 KiB gzip for the whole app as it is today; this slice's share is small). Built bundle contains zero `initializeTables|runMigrations|ensureTables` and no `CREATE TABLE ... code_reviews / career_coach_sessions`.
* Local workerd (`wrangler dev --local`, port 8797, synthetic secret, no DB, no network; process tree killed afterwards): both routers load; `jobmatch` with a synthetic HS256 token returns the expected 200/400/masked-500; 401 without/with a bad token; gated routes with no reachable DB answer `500 {"error":"Failed to verify subscription plan"}` (fail closed), ungated ones their route-level 500; the base64 probes match Node's Buffer; `AbortSignal.timeout`, `atob`, `TextDecoder`, `fetch` exist; a `LinkedIn analyze` report computed inside workerd is **byte-identical** to the one computed in Node for the same input.

## What is NOT verified

* Anything touching Neon: the SQL text is unchanged and matched against fakes only. In particular `linkedin_analyses.target_roles` receives a JS array and `report` a JSON string exactly as before; that the Neon `Pool` serialises them like node-postgres is assumed, not run (ADR spike S11 is still open).
* Real GitHub, LinkedIn and AI-provider calls from workerd (none were made: no external services were contacted).
* **Operational risk to decide on:** `api.github.com` is called unauthenticated (60 requests/hour per IP). Cloudflare egress IPs are shared by many tenants, so `github/analyze` may see 403s (rendered as "GitHub user ... not found or API unavailable", 404) much more often than from Render. Adding a `GITHUB_TOKEN` would be a behaviour change and was not done. Likewise LinkedIn may answer differently (999 / authwall) to Cloudflare IPs; that path already falls back to "provided data only".
* Workers CPU limits (local workerd does not enforce them). The two analysers are regex/string work on inputs of a few KB; expected to be small but unmeasured.
* Behaviour behind the real Vercel proxy, real JWTs from Render, cross-runtime fetch timeouts.
* `authenticateToken`, `requirePlan`, error masking, CORS are foundation code, exercised here only as consumers.

## Orchestrator actions

* None required in shared files. Config vars used are already in `PASSTHROUGH_VARS`. No new packages.
* Decide/announce: the schema dependency in deviation 2 (tables must exist in Neon) and the GitHub rate-limit risk above.
* Two failures currently exist elsewhere in `tests/worker` and are not from this slice: `planService.test.js` (expects exactly the original 10 methods; the auth slice added onboarding methods) and `docs/mounts.test.js` (docs registry lazy-import count).
