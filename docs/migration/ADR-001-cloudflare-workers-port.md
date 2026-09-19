# ADR-001: Port JobTune Express Backend to Cloudflare Workers (Render → Workers Cutover)

**Status:** Proposed
**Date:** 2026-09-19
**Decision owner:** Pujith Soma
**Reversibility:** Two-way door *if* executed as a dual-run cutover (recommended). One-way door if executed as a big-bang replace (rejected below).

---

## 0. TL;DR for the impatient

The existing `docs/CLOUDFLARE_MIGRATION.md` is **directionally correct but materially incomplete and wrong in two places**. The two corrections change the plan's shape significantly:

1. **SSR is NOT a backend problem.** The doc calls SSR/static serving "the most involved piece" (step 6). It is not in scope at all. Production SSR already runs on **Vercel** (`/Users/psoma/Projects/Jobtune/JobTune-EcoSystem/frontend/api/ssr.js` + `frontend/vercel.json`). The backend's `src/ssr/setupFrontend.js` never activates in prod because `frontend/dist/client/index.html` does not exist on the Render box — it logs "API-only mode" and returns `false`. **Action: delete it from the Worker port entirely.** This removes the single largest line item from the doc's plan.
2. **The cutover is not DNS.** It's a one-line edit to `frontend/vercel.json`'s rewrite destination. This is enormously good news: the rollback is a git revert of one line, with propagation in ~30 seconds, and **no DNS TTL exposure**. This is what makes the whole migration a two-way door.

Additional corrections: the doc's compat table **omits `pdf-parse`** (the highest-risk dependency of all, used in 4 files), **omits `jszip`** being a transitive dep of mammoth rather than a direct one, **omits `joi`, `helmet`, `express-rate-limit`, `cors`** entirely, and mis-states `axios`/`winston`/`@anthropic-ai/sdk` as in-use (all three are **declared in package.json but never `require`d** in `src/`).

---

## 1. Context

`backend/` is an Express 5 app on Render (`jobtune-backend-14k0.onrender.com`) serving real production traffic. A Cloudflare Workers project (`jobtune-ecosystem.somapujith.workers.dev`) exists but serves only a 501 stub (`backend/src/worker-entry.js`). The goal is a full port and cutover.

Verified current surface (measured 2026-09-19, not copied from doc):

| Metric | Value |
|---|---|
| Route files | 41 (`src/routes/`) |
| Total endpoints | 181 (`router.get/post/put/patch/delete`) |
| Total route LOC | 11,145 |
| Files importing `config/database` (pg pool) | 39 |
| Middleware files | 5 |
| Mount points in `app.js` | 41 (several route files share a prefix — see §3.2) |
| Files calling `aiClient` | 23 |

The forcing function: the user wants Workers to be prod. The constraint: auth, session management, and plan-gating (subscription billing enforcement) are in the blast radius, and there is no payment gateway yet but there *is* a real `plan_orders` table and a `verify-payment` endpoint that grants entitlements.

---

## 2. Corrected compatibility table

Verified by `require()`-pattern grep across `src/` (the doc's list was produced by loose substring grep, which matched inside `src/data/modules.json` and `src/data/questions.json` and produced false positives).

### 2.1 Corrections to the doc's existing rows

| Concern | Doc says | **Actual, verified** | Verdict |
|---|---|---|---|
| `bcrypt` | `routes/auth.js`, `services/sessionService.js` | Confirmed exactly: `src/routes/auth.js`, `src/services/sessionService.js`. (Doc's own grep also flagged `routes/projectBuilder.js` — that was a false positive from the word "bcrypt" in a data string; verified no `require('bcrypt')` there.) | Doc correct |
| `multer` | 3 files | Confirmed exactly: `src/routes/atsCheckerV2.js`, `src/routes/resume.js`, `src/routes/resumeV2.js`. All three use `multer.memoryStorage()` — **no disk writes**, which makes the `Request.formData()` rewrite much easier than the doc implies. | Doc correct, risk overstated |
| `pdfkit` | `routes/resume.js`, `services/v2/resumeExportEngine.js` | Confirmed. **New finding:** `node_modules/pdfkit/js/pdfkit.js` directly `require`s `fs`, `stream`, `zlib`, `events`. Under `nodejs_compat` these are polyfilled, but `fs` is the risk. | Doc correct; needs spike |
| `docx` | `routes/resume.js`, `services/resumeExport.js` | Confirmed. Pure-JS, outputs via `Packer.toBuffer()`. **Lowest risk of the doc-gen set.** | Doc correct |
| `mammoth` | `routes/resume.js`, `routes/resumeV2.js`, `services/resumeExport.js`, `utils/fileParser.js` | **Doc is wrong.** Actual: `src/routes/atsCheckerV2.js`, `src/routes/resumeV2.js` only. Not in `resume.js`, not in `resumeExport.js`, not in `fileParser.js`. | **Corrected** |
| `jszip` | listed as directly used | **Doc is wrong.** Zero direct `require('jszip')` anywhere in `src/`. It is a *transitive* dependency of `mammoth`. Remove from the direct-port checklist; it still matters as a mammoth sub-risk. | **Corrected** |
| `unzipper` | across many files | **Doc overstates.** Actual: `src/utils/fileParser.js` **only**. **Highest-risk lib in the set** — transitively depends on `fs-extra`, `graceful-fs`, `bluebird`, `duplexer2`. `graceful-fs` monkey-patches Node's `fs` module at load time and is the most likely hard failure under `nodejs_compat`. | **Corrected; risk raised** |
| `xml2js` | across many files | **Doc overstates.** Actual: `src/utils/fileParser.js` **only**. Pure JS, low risk. | **Corrected** |
| `jsonwebtoken` | "likely fine" | Confirmed in `src/middleware/auth.js`, `src/routes/auth.js`, `src/services/sessionService.js`. HS256 only. Low risk under `nodejs_compat` (needs `crypto`), but see §4.1 for a **blocking** module-load issue unrelated to the library. | Doc correct on lib; misses the real bug |
| `winston` | "used, console transport only" | **Not used at all.** Zero `require('winston')` in `src/`. It is a stale `package.json` entry. Drop it. | **Corrected** |
| `axios` | "used for Adzuna, LM Studio, Anthropic" | **Not used at all** in `src/`. Zero `require('axios')`. All outbound HTTP already uses **native `fetch`** (verified in `src/utils/aiClient.js`, `src/utils/embeddings.js`). This is a *gift* — the outbound HTTP layer is already Workers-native. | **Corrected — good news** |
| `@anthropic-ai/sdk` | implied in use | Not `require`d in `src/`. `aiClient.js` has an `anthropic` provider branch but reaches it via `fetch`. Drop the dep. | **Corrected** |
| `pg` | `config/database.js` | Confirmed — single import site, but **39 files import the `{ pool }` it exports**. | Doc correct |
| SSR | "most involved piece, needs Assets binding" | **Out of scope — see §0.1.** Delete, don't port. | **Corrected — scope removed** |
| Admin static (`express.static('public/admin')`) | needs Assets binding | Technically true but trivial: it is **one file**, `src/public/admin/index.html`. Inline it as a string constant or use an Assets binding — a 30-minute task, not an architectural one. | Risk overstated |

### 2.2 Dependencies the doc MISSED entirely

| Dep | Where | Workers-compatible? | Action |
|---|---|---|---|
| **`pdf-parse` 1.1.4** | `src/routes/atsCheckerV2.js`, `src/routes/resume.js`, `src/routes/resumeV2.js`, `src/utils/fileParser.js` (**4 files — most-used doc lib in the codebase**) | **Highest risk of any dependency.** Wraps a bundled legacy `pdf.js`. v1.1.4 is notorious for a debug-mode branch that does `fs.readFileSync('./test/data/...')` when `!module.parent`. Under bundling, `module.parent` semantics are unreliable. | **Dedicated spike, first.** Fallback: `unpdf` (Workers-targeted pdf.js fork) |
| **`joi` 18** | `src/routes/auth.js` (signup/login validation) | Pure JS, expected fine — but it is on the **auth critical path**, so verify explicitly, not by assumption | Spike + auth parity tests |
| **`helmet`** | `src/app.js` | Express-middleware-shaped; **no Hono equivalent by that name**. Hono has `secureHeaders()`. Header sets differ. | Must re-derive headers, not port |
| **`express-rate-limit`** | `src/app.js` (two limiters: `apiLimiter` 100/15min, `authLimiter` 20/15min) | **Will not work.** Uses an in-process memory store. Workers isolates are ephemeral and globally distributed — an in-memory counter is per-isolate and near-useless. | **Architectural change required — see §4.4** |
| **`cors`** | `src/app.js` | Express middleware. Hono has `cors()`. Current config has a **dynamic origin callback** with a dev-mode allowlist. | Re-derive |
| **`dotenv`** | `src/config/database.js`, `src/server.js` | No-op on Workers | Remove from Worker path |

### 2.3 Node-core API usage (verified)

| API | Sites | Workers status |
|---|---|---|
| `require('fs')` | `src/services/resumeExport.js` (imported but **unused** — dead import), `src/ssr/setupFrontend.js` (out of scope) | Both resolve to nothing. **No real `fs` dependency in ported code.** Excellent. |
| `require('path')` | `src/app.js`, `src/services/resumeExport.js` (unused), `src/services/taxonomy/onetLoader.js`, `src/ssr/setupFrontend.js` | `onetLoader.js` does `require(path.join(...'data/onet/occupations.json'))` — a **dynamic require of a JSON file**. Will not bundle. Fix: static `import occupations from '../../data/onet/occupations.json'` (12 KB, safe to inline). |
| `crypto` | `src/middleware/auth.js`, `src/services/sessionService.js`, `src/utils/aiCache.js` | `createHash('sha256')`, `randomBytes(48)`. Supported under `nodejs_compat`. Low risk, but session security depends on it — **verify explicitly**. |
| `process.exit` | `src/middleware/auth.js:8` | **Blocking. See §4.1.** |
| `setInterval` | none | Clean. |
| `res.sendFile`/`redirect`/`cookie`/`render`/`locals` | **zero occurrences** | Very clean — the app is a pure JSON API plus 2 binary download endpoints. Big de-risker for the Hono port. |
| `res.setHeader` + `res.send(buffer)` | `src/routes/atsExport.js` (4 sites) | The only binary-response paths. Map to `new Response(buffer, {headers})`. |
| `req.ip` / `req.connection.remoteAddress` | `src/middleware/auditLogger.js`, `src/routes/auth.js` | **Semantically load-bearing — see §4.2.** Workers has no `req.ip`; must use `CF-Connecting-IP`. |

---

## 3. Alternatives considered

### Alternative A — Cloudflare Containers / keep Node runtime
Deploy the Express app unchanged to Cloudflare's container product.
- **Pros:** Zero rewrite. `pg`, `bcrypt`, `multer`, `pdfkit`, `pdf-parse`, `unzipper` all keep working. Eliminates every risk in §4 except §4.4.
- **Cons:** Loses the actual benefit of Workers (isolate cold-start, edge distribution, free-tier economics). Containers are priced closer to Render than to Workers. Does not satisfy the stated goal.
- **Fatal flaw:** It's a hosting change, not the migration asked for. If the motivation is cost or edge latency, this delivers neither well.
- **Rejected** — but explicitly **retained as the per-route escape hatch** for document processing if the §5 spike fails (see §7, Phase 2 exit criteria).

### Alternative B — Big-bang port: rewrite all 41 route files, deploy, flip
- **Pros:** Shortest total engineering time if nothing goes wrong. No dual-maintenance window.
- **Cons:** 181 endpoints, 11k LOC, auth + entitlements in scope, all changing at once. No incremental verification signal.
- **Fatal flaw:** **Makes the decision a one-way door.** If plan-gating silently breaks (e.g. `requirePlan` fails open instead of closed), paying-tier features leak to free users and you learn about it from a user, not a test. Additionally, any single unported doc-gen lib blocks the entire cutover.
- **Rejected.**

### Alternative C — Strangler-fig at the Vercel rewrite layer (**RECOMMENDED**)
Port module-by-module to Workers. Keep Render live. Use `frontend/vercel.json`'s rewrite rules to route *individual path prefixes* to Workers while everything else still hits Render. Migrate prefixes one at a time, verifying each, then flip the catch-all last.

```jsonc
// Illustrative shape only — not implementation
"rewrites": [
  { "source": "/api/health/(.*)",  "destination": "https://jobtune-ecosystem.somapujith.workers.dev/api/health/$1" },
  { "source": "/api/(.*)",         "destination": "https://jobtune-backend-14k0.onrender.com/api/$1" }
]
```

- **Pros:** Every step is independently verifiable against real traffic. Rollback per-module is a one-line revert. Render stays authoritative until the last prefix moves. Both backends share the same Neon DB, so there is **no data migration and no split-brain on state** — only on in-memory caches (`aiCache`) and rate-limit counters, both of which are non-durable by design and tolerate inconsistency.
- **Cons:** Longer wall-clock. Dual maintenance (a bugfix during the window must land in both paths). Extra network hop through Vercel during the window (already present today, so no regression).
- **Key cost:** discipline — you must resist flipping the catch-all early.
- **ACCEPTED.**

### Alternative D — Hand-rolled `fetch` router instead of Hono
- **Pros:** Zero framework dependency; total control.
- **Cons:** You would be reimplementing path params (the codebase uses 3-deep params like `/:subject/:tier/:slug`), middleware chaining, and body parsing across 181 endpoints.
- **Fatal flaw:** Re-deriving middleware-ordering semantics by hand on an auth-and-entitlements codebase is exactly where security bugs get introduced.
- **Rejected.** Use **Hono** — its `app.route()`/`app.use()` model maps near-1:1 onto the existing `app.use('/api/x', router)` structure.

---

## 4. Decision

**Port to Hono on Workers via a strangler-fig cutover at the Vercel rewrite layer (Alternative C), gated behind a hard compatibility spike (§5) that must pass before any route porting begins.**

Design principles:
- **Render remains authoritative** until every module has passed verification on Workers.
- **Fail-closed on entitlements.** Any ambiguity in `requirePlan` / auth behavior resolves to denial.
- **No behavior changes during the port.** Existing bugs (§4.3) get *documented and preserved*, then fixed in a separate PR after cutover. Porting is not the time to change semantics.
- **Shared-nothing between the two backends** except the Neon DB.

### 4.1 BLOCKING BUG: `src/middleware/auth.js` cannot load on Workers

```js
// src/middleware/auth.js:5-9
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32) {
  console.error('FATAL: JWT_SECRET must be set and at least 32 characters long');
  process.exit(1);
}
```

Two independent failures: (a) `process.env` is empty on Workers — secrets arrive via the `env` argument to `fetch(request, env, ctx)`; (b) `process.exit` does not exist. **This executes at module load**, so importing this file kills the isolate before any request is served.

**This same pattern (module-scope `process.env` read) affects 26 files** — full list from `grep -rlE "process\.env" src/`:
`app.js`, `config/database.js`, `middleware/auth.js`, `middleware/errorHandler.js`, `routes/{achievementEnhancer,aiTutor,auth,careerRoadmap,coverLetter,interview,jobAnalyzer,jobPreparation,learning,profiles,projectBuilder,resume,resumeChat,skills}.js`, `server.js`, `services/discovery/AdzunaSource.js`, `services/linkedinOptimizerService.js`, `services/scoring/strategies/jobFit.js`, `services/sessionService.js`, `utils/aiClient.js`, `utils/embeddings.js`.

Most are lazy (read inside a handler) and survive as `undefined`, silently degrading. The genuinely module-scope ones that will misbehave:
- `middleware/auth.js:5` — hard crash (above)
- `services/sessionService.js:6-7` — `ACCESS_TOKEN_TTL`, `REFRESH_TOKEN_DAYS` read at module scope → silently fall back to `'15m'`/`7`. **Not a crash, but a silent security-relevant config change** if prod overrides them.
- `utils/embeddings.js:7` — `LM_STUDIO_URL` at module scope → silently falls back to the LAN IP `http://172.19.80.1:1234/v1`, which is unreachable from the edge.
- `app.js:74-89` — `FRONTEND_URL`, `NODE_ENV`, `PORT` at module scope → **CORS allowlist silently computes to `['https://undefined']`**, rejecting every browser origin.

**Required design:** an explicit config module that takes `env` as input and is invoked once per request (or memoized per isolate after first request), e.g. a `createConfig(env)` returning a frozen object, threaded through Hono's context (`c.env` / `c.set('config', ...)`). No module-scope env reads anywhere in the Worker path. Full env var list to provision (34 distinct, from `grep -rhoE "process\.env\.[A-Z_0-9]+"`): `ACCESS_TOKEN_TTL`, `ADZUNA_APP_ID`, `ADZUNA_APP_KEY`, `AI_PROVIDER`, `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `DATABASE_URL`, `DB_HOST`, `DB_NAME`, `DB_PASSWORD`, `DB_PORT`, `DB_SSL`, `DB_USER`, `FRONTEND_URL`, `GEMINI_API_KEY`, `GEMINI_MODEL`, `JWT_SECRET`, `LM_STUDIO_MODEL{,_EMBED,_FIT,_GITHUB,_INTERVIEW,_JOB,_LINKEDIN,_PROJECT,_RESUME,_ROADMAP,_SKILLS,_TUTOR}`, `LM_STUDIO_URL`, `MOCK_AI`, `NODE_ENV`, `PORT`, `REFRESH_TOKEN_DAYS`. (The `DB_*` set is only used by the `pg` fallback branch in `config/database.js` and is **not needed** on Workers, which uses `DATABASE_URL` only.)

### 4.2 Client IP semantics are security-relevant, not cosmetic

`req.ip` is used in two places and **both change behavior**:
- `src/middleware/auditLogger.js:19` — `req.ip || req.connection.remoteAddress` written to `audit_logs.ip_address`. On Workers both are `undefined` → **audit log silently records NULL IPs**. Silent loss of security telemetry.
- `src/routes/auth.js:32` (`getRequestMeta`) → flows into `sessionService.createSession`, which at `sessionService.js:70` does:
  ```js
  const sameDevice = ipAddress && existing.ip_address && existing.ip_address === ipAddress;
  ```
  This drives the **single-active-device enforcement**. If `ipAddress` becomes `undefined`, `sameDevice` is always falsy → **every re-login from the same device now throws `ACCOUNT_IN_USE` (409)** instead of silently rotating the session. This is a user-visible auth regression affecting 100% of returning users.

**Required:** map to `request.headers.get('CF-Connecting-IP')` before any auth/session route is ported. Note the *reverse* risk: because Vercel proxies `/api/*`, the Worker may see **Vercel's** egress IP rather than the end user's — in which case every user looks like the "same device" and the single-device gate **fails open**. Must be verified empirically against the real proxy chain (§8, item 7), not reasoned about.

### 4.3 Pre-existing bugs found during this analysis — DO NOT fix during the port

Record these; fix in a separate post-cutover PR so the port stays a behavior-preserving change.

1. **`requireOnboarding` is dead code AND broken.** `src/middleware/requireOnboarding.js:12` calls `planService.getOnboardingCompleted(...)`, which **does not exist** on `planService` (verified against all 11 methods in `src/services/planService.js`). It would throw → caught → 500. It is also **mounted nowhere** (`grep -rln requireOnboarding src/` returns only the file itself), so it never runs. Tests pass only because `tests/requireOnboarding.test.js` and `tests/subscriptions.routes.test.js` **mock the nonexistent method**. This is a fake-test / dead-code pair. Note: commit `61e295b4` claims to add an "onboarding gate middleware" — it is not actually wired in.
2. **`src/services/resumeExport.js:2-3`** imports `fs` and `path` and uses neither. Dead imports (conveniently — removes an `fs` dependency from the port).
3. **`/api/subscriptions/verify-payment`** (`src/routes/subscriptions.js`) is a **mock verifier with no gateway signature check** — any authenticated user can POST their own pending `orderRef` and be granted any plan tier. Documented in-code as intentional-for-now. **This must not be ported without a conscious decision**, because moving it to a new hostname is a good moment to accidentally forget it's unguarded. See §6.3.

### 4.4 Rate limiting must be re-architected, not ported

`express-rate-limit`'s memory store is meaningless across distributed isolates. Options, in order of preference:
1. **Cloudflare Rate Limiting rules** (platform-level, zero code, applied at the edge before the Worker runs) — strongly preferred for `apiLimiter`.
2. **Workers Rate Limiting binding** (`[[unsafe.bindings]]` / the native ratelimit binding) for the stricter `authLimiter` (20/15min on `/api/auth`).
3. Durable Object counter — correct but overkill here.
4. **Unacceptable:** porting the in-memory limiter and calling it done. That silently removes brute-force protection from `/api/auth/login`. This is a **security regression disguised as a port**, and it is the single easiest mistake to make in this migration.

### 4.5 Note on `aiCache`

`src/utils/aiCache.js` is a 500-entry in-memory LRU. On Workers it becomes per-isolate, so hit rate drops sharply (each isolate warms its own). This is a **cost/latency regression, not a correctness one** — `callAI` falls through to the provider on miss. Accept for v1; consider Workers KV or Cache API post-cutover. Flag it so nobody mistakes the AI-bill increase for a bug.

---

## 5. Phase 0 — Compatibility spike (BLOCKING GATE)

**Nothing else starts until this completes.** Its outcome determines whether the plan proceeds as written, or whether document-processing routes get carved out to Alternative A (Containers).

Note: `wrangler` is listed in `backend/package.json` devDependencies at `4.131.2` but is **not currently installed in `node_modules`** — first task is `npm install`.

Build one throwaway Worker that imports each library and exercises its real code path against a real fixture. **Importing successfully is not passing** — the failure modes here are runtime, not load-time.

| # | Library | Exercise | Pass criterion | If it fails |
|---|---|---|---|---|
| S1 | **`pdf-parse` 1.1.4** | Parse a real resume PDF from a `Uint8Array` | Returns correct `.text` | Swap to `unpdf`; re-verify extraction output equivalence on ≥5 fixtures |
| S2 | **`unzipper` 0.12.3** | `Open.buffer()` on a real DOCX | Finds `word/document.xml`, returns buffer | Replace `utils/fileParser.js` DOCX path with `mammoth` (already a dep, already used for exactly this in 2 other files) — **likely outcome, and it simplifies the codebase** |
| S3 | **`pdfkit` 0.16** | Generate a PDF, get bytes out | Non-empty, valid PDF header | Route-level carve-out to Containers, or client-side generation |
| S4 | **`docx` 9.7** | `Packer.toBuffer()` | Valid DOCX opens in Word | Same carve-out |
| S5 | **`mammoth` 1.12** | `extractRawText` on a DOCX | Correct text | Elevates S2 to critical |
| S6 | **`xml2js`** | `parseStringPromise` | Correct object | Native `DOMParser` or regex extraction |
| S7 | **`bcryptjs`** | Hash + **verify an existing `bcrypt`-generated hash from the prod `users` table** | Verifies | **Hard blocker** — see §6.1 |
| S8 | **`joi` 18** | Run the actual `signupSchema`/`loginSchema` from `routes/auth.js` | Same accept/reject as Node | Hand-rolled validators |
| S9 | **`jsonwebtoken`** | Sign HS256, verify, verify an **existing prod-issued token** | Passes | `jose` (Workers-native) |
| S10 | **`crypto`** | `createHash('sha256')`, `randomBytes(48)` | Matches Node output for same input | `crypto.subtle` / `crypto.getRandomValues` |
| S11 | **`@neondatabase/serverless`** | `SELECT COUNT(*) FROM users`; a parameterized `$1` query; a multi-statement `CREATE TABLE IF NOT EXISTS` block | All succeed | See §6.5 |

**Deliverable:** a results table committed to `docs/CLOUDFLARE_MIGRATION.md`, replacing the current "Unverified, mixed risk" row with facts.

**Re: `config/database.worker.js`.** Confirmed **exists** at `/Users/psoma/Projects/Jobtune/JobTune-EcoSystem/backend/src/config/database.worker.js` (27 lines) and is written as described: it wraps `@neondatabase/serverless`'s `Pool` behind `getPool(env)`. `@neondatabase/serverless ^1.1.0` **is** in `package.json` dependencies. **Not yet re-verified working** (no wrangler locally, no DB credentials in this pass) — the prior doc's claim of a successful `SELECT COUNT(*)` smoke test is plausible but is S11's job to re-confirm. Two design concerns with the file as written, both for S11:
- It constructs a **new `Pool` per `getPool(env)` call**, i.e. per request. For Neon's HTTP/WS driver this is the documented pattern, but confirm connections are actually released (`ctx.waitUntil` on pool teardown) or you will exhaust Neon's connection limit under load.
- `sessionService.ensureTables()` and `utils/initializeTables.js` / `utils/runMigrations.js` issue **multi-statement DDL in a single `.query()`**. The Neon HTTP driver does not support multi-statement queries the way `pg` does. **These must not run on Workers at all** (see §6.5).

---

## 6. Highest-risk areas and their required verification

Ranked by blast radius.

### 6.1 Password hashing — `bcrypt` → `bcryptjs` (S7)
**Risk:** every existing user is locked out of their account.
**Why it's subtle:** `bcryptjs` is API-compatible and *should* verify `bcrypt`-produced hashes (same algorithm, same `$2b$` format). But `bcrypt@6` defaults to `$2b$`, and older `bcryptjs` versions had `$2a$`/`$2b$` prefix-handling quirks.
**Required verification before cutover:**
- Pull ≥20 real `password_hash` values (hashes only, never plaintext) from prod `users`, spanning the oldest and newest rows.
- Assert `bcryptjs.compare(knownPlaintext, hash) === true` for a test account whose password you control, on the Worker runtime.
- Assert a hash freshly generated by `bcryptjs` on Workers verifies under Node `bcrypt` (bidirectional — required so that a rollback to Render doesn't lock out users who signed up during the Workers window).
**Fail-closed rule:** if bidirectional verification does not hold, **stop**. Do not proceed with a "users can reset their password" workaround.

### 6.2 Auth / session / JWT
Surface: `src/middleware/auth.js`, `src/routes/auth.js` (253 LOC, 8 endpoints), `src/services/sessionService.js` (209 LOC).
**Risks:** (a) the §4.1 module-load crash; (b) the §4.2 IP-semantics change breaking single-device enforcement in *either* direction; (c) JWT signed on one backend must verify on the other during the dual-run window.
**Required verification:**
- Same `JWT_SECRET` provisioned to both Render and Workers (this is what makes tokens portable across the window).
- Cross-verification matrix, all four cells green: token issued by Render → accepted by Workers; issued by Workers → accepted by Render; and both reject a token signed with a wrong secret.
- Session-supersede behavior test: login device A, login device B, assert A gets `401 SESSION_SUPERSEDED` with that exact `code`; assert re-login from A's same IP does **not** 409.
- `/api/auth/logout` with an **expired** access token must still revoke via the `refreshToken` fallback path (`routes/auth.js` lines ~148-180).
- Assert `audit_logs.ip_address` is non-NULL on Workers-served requests.

### 6.3 Plan gating / entitlements — `requirePlan`
Surface: `src/middleware/requirePlan.js` + **26 route files, 100 `requirePlan(...)` call sites** (exact per-file counts measured; largest: `community.js` 14, `aiCoach.js` 11, `practice.js` 10, `profiles.js` 8, `projectBuilder.js` 7, `courses.js` 7, `studyHistory.js` 7).
**Risk:** a tier-2/3 feature becomes reachable by a tier-1 user. This is revenue leakage and it is **silent** — nothing errors, users just get free stuff.
**The specific failure mode to guard:** `requirePlan` currently returns **500** when `planService.getUserPlan` throws. On Workers, a DB misconfiguration would turn every gated route into a 500 — which is loud and therefore safe. But if anyone "improves" this during the port to fall through on error, it fails **open**. Explicitly forbid that.
**Required verification (the single most important test artifact in this migration):**
- Enumerate all 100 call sites into a machine-readable `endpoint → minTier` manifest. Generate it from source, don't hand-write it.
- Automated matrix: for each gated endpoint × {no plan, tier 1, tier 2, tier 3}, assert Workers returns the **same status code** as Render. Expect `403` with `code: 'PLAN_UPGRADE_REQUIRED'` below threshold.
- **Diff the Workers manifest against the Render manifest.** Zero differences. Any endpoint gated on Render and ungated on Workers blocks cutover.

### 6.4 Payments / subscriptions
Surface: `src/routes/subscriptions.js` (129 LOC), `src/services/planService.js` — `createOrder`, `markOrderPaid`, `assignPlan`.
**Risk:** the `create-order` → `verify-payment` → `assignPlan` chain grants entitlements. `markOrderPaid` relies on `WHERE order_ref = $1 AND status = 'pending'` as its idempotency guard — a single-statement compare-and-set. **Verify the Neon driver preserves this atomicity** (it should; it's one statement), because if the Worker retries on a transient network error you could double-assign.
**Required verification:**
- Idempotency: call `verify-payment` twice with the same `orderRef`; second must return `alreadyPaid: true`, and `plan_orders` must show exactly one `paid_at`.
- Cross-user: user A cannot verify user B's `orderRef` (guarded at `subscriptions.js` by `order.user_id !== req.user.id` — confirm it survives the port).
- **Explicitly re-confirm with the user** that shipping the unguarded mock verifier (§4.3.3) to the new prod backend is intentional. It is currently exploitable for free tier upgrades on Render too, so it's not a *regression* — but "we moved the exploit to a new host" should be a conscious choice.

### 6.5 Database layer and the schema-bootstrap trap
39 files import `{ pool }` from `config/database.js`. The Worker path must route them to `getPool(env)`.
**The trap:** `src/server.js` calls `initializeTables()`, `runMigrations()`, and `sessionService.ensureTables()` on boot. These issue multi-statement DDL. **They must be excluded from the Worker entirely** — the schema already exists in Neon (Render created it), the Neon HTTP driver may reject multi-statement queries, and running DDL on every cold start is both wasteful and dangerous.
**Required verification:** the Worker bundle contains **zero** references to `initializeTables`, `runMigrations`, or `ensureTables`. Assert via bundle grep, not by inspection.
Also verify: `pool.query()` return shape (`.rows`, `.rowCount`) is identical; `$1` parameterization works (SQL injection protection depends on it — spot-check a query with a `'; DROP` payload and confirm it's treated as a literal).

### 6.6 Document generation and upload
Surface: `src/routes/resume.js` (774 LOC), `src/routes/resumeV2.js` (275), `src/routes/atsCheckerV2.js` (78), `src/routes/atsExport.js` (97), `src/services/resumeExport.js`, `src/services/v2/resumeExportEngine.js`, `src/utils/fileParser.js`.
**Mitigating factor:** all three multer instances use `memoryStorage()` — no disk. The rewrite to `await c.req.formData()` → `await file.arrayBuffer()` is mechanical. Preserve the existing limits: 5 MB + mimetype allowlist (`atsCheckerV2.js:16-18`), 10 MB (`resume.js:15`). **Do not drop the mimetype allowlist** — it's an upload-validation boundary.
**Required verification:** round-trip each format (PDF in → text out; DOCX in → text out; JSON in → DOCX/PDF/TXT out), byte-comparing Workers output against Render output for identical input on ≥5 real resume fixtures. `atsExport.js`'s `res.setHeader` + `res.send(buffer)` must become a `Response` with correct `Content-Type` and `Content-Disposition` — verify the browser actually downloads a valid file, not a corrupted one.

---

## 7. Task breakdown for parallel execution

Dependency rule: **Phase N cannot start until Phase N-1's exit criteria are met.** Within a phase, `[P]` tasks are parallel-safe (disjoint files); `[S]` are sequential/blocking.

### Phase 0 — Spike (blocking gate) — 1 agent
- `[S] T0.1` `npm install` in `backend/` (wrangler is declared but absent).
- `[S] T0.2` Build throwaway spike Worker; run S1–S11 (§5). Commit results table into `docs/CLOUDFLARE_MIGRATION.md`.
- **Exit:** S7 (bcryptjs bidirectional), S9 (JWT), S10 (crypto), S11 (Neon) **must all pass** — these are unconditional blockers. S1–S6 failures are acceptable if each has a decided fallback recorded.

### Phase 1 — Foundation (strictly sequential, 1 agent, no parallelism)
Everything downstream imports these. Getting them wrong poisons all 41 route ports.
- `[S] T1.1` `src/worker/config.js` — `createConfig(env)`. Frozen object. Validates `JWT_SECRET.length >= 32` and **returns a 500 response** rather than `process.exit`. Replaces all module-scope `process.env` reads (§4.1).
- `[S] T1.2` `src/worker/db.js` — request-scoped pool accessor over `config/database.worker.js`. Verify connection release (S11 finding).
- `[S] T1.3` `src/worker/app.js` — Hono app skeleton: `cors()` (port the dynamic-origin allowlist from `app.js:91-102`), `secureHeaders()` (re-derive helmet's header set and **diff actual response headers against Render's**), JSON body parsing with the 1 MB limit, and the `errorHandler` equivalent (must preserve the `status >= 500 → "Internal Server Error"` masking from `middleware/errorHandler.js` — do not leak stack traces).
- `[S] T1.4` Port `middleware/auth.js` → Hono middleware. Fix §4.1 and §4.2 (`CF-Connecting-IP`). Set `c.set('user', ...)`.
- `[S] T1.5` Port `middleware/requirePlan.js`. **Fail-closed.** Preserve the 403 + `PLAN_UPGRADE_REQUIRED` + `requiredPlan`/`currentPlan` response shape exactly (the frontend's PlanGate reads these fields).
- `[S] T1.6` Port `middleware/auditLogger.js` — `res.on('finish')` has no Hono equivalent; use `ctx.waitUntil()` for the post-response DB insert. Must not block the response. Must populate `ip_address`.
- `[S] T1.7` Wire `worker-entry.js` → Hono app. Add `/api/health` only. Deploy. Confirm 200 from the `.workers.dev` URL.
- `[S] T1.8` `wrangler secret put` for all secrets; `[vars]` for non-secrets (§4.1 list, minus the unneeded `DB_*` set). **Same `JWT_SECRET` as Render** (§6.2).
- `[S] T1.9` Provision Cloudflare rate-limiting (§4.4). Do **not** port `express-rate-limit`.
- **Exit:** `/api/health` 200 on Workers; a manually-crafted request with a Render-issued JWT passes `authenticateToken` on Workers.

### Phase 2 — Shared services (parallel, disjoint files)
- `[P] T2.1` `services/sessionService.js` — bcrypt→bcryptjs, `env`-threaded config, `crypto` verification. **Highest risk in this phase — assign your strongest agent.**
- `[P] T2.2` `services/planService.js` — pure DB, mechanical.
- `[P] T2.3` `utils/aiClient.js` + `utils/aiCache.js` — already uses native `fetch`; mostly just env threading. Document the per-isolate cache regression (§4.5).
- `[P] T2.4` `utils/fileParser.js` — apply S1/S2 outcomes. Likely: drop `unzipper`+`xml2js`, use `mammoth`.
- `[P] T2.5` `services/taxonomy/onetLoader.js` — replace the dynamic `require(path.join(...))` with a static JSON import.
- `[P] T2.6` `utils/embeddings.js` — module-scope `LM_STUDIO_URL` → config.
- `[P] T2.7` `services/resumeExport.js`, `services/v2/resumeExportEngine.js` — drop dead `fs`/`path` imports; apply S3/S4.
- `[P] T2.8` Remaining leaf services (`activityService`, `progressService`, `srsService`, `studyHistoryService`, `tutorHistoryService`, `resumeDatabase`, `linkedinAnalysisStore`, `learningPathService`, `recommendationEngine`, `evidence/`, `guides/`, `pii/`, `discovery/`, `scoring/`) — mechanical `pool` → `c.get('db')` rethreading.
- **Exit:** every service imports config/db by injection, zero module-scope `process.env`, zero `fs`. If S3/S4 failed, doc-gen routes are formally carved out to Alternative A and removed from Phase 3 scope.

### Phase 3 — Route porting (heavily parallel)
Group by mount prefix, because **`app.js` mounts multiple route files on the same prefix** — these share a namespace and must be ported together to avoid ordering bugs:
- `/api/resume` ← `resume.js` **+** `resumeV2.js`
- `/api/ats` ← `atsExport.js` **+** `atsCheckerV2.js`
- `/api/jobs` ← `jobTracker.js` **+** `jobAnalyzer.js` **+** `coverLetter.js` **+** `jobDiscovery.js` **+** `jobFit.js` (five files, one prefix — plus `/api/jobs/achievement-enhancer` nested inside it). **Highest ordering risk in the whole port.** Assign one agent, sequentially.

Suggested waves, ordered so the riskiest thing ships first behind the smallest traffic share:

| Wave | Modules | Parallel? | Notes |
|---|---|---|---|
| 3A | `auth.js` | `[S]` alone | §6.2. Nothing else ports until auth is green. |
| 3B | `subscriptions.js`, `admin.js`, `adminPanels.js` | `[P]` x3 | §6.4. `admin.js` has a `router.use(authenticateToken, requireAdmin)` file-level guard — preserve it; a Hono `app.use` on the sub-route. |
| 3C | Low-complexity, no uploads, no doc-gen: `projects`(13), `benchmarks`(40), `jobFit`(41)*, `resumeConsistency`(43), `recruiterVisibility`(46), `guides`(51), `progress`(62), `evidence`(65), `piiRedaction`(71), `activity`(85), `learningPath`(88), `studyHistory`(99) | `[P]` up to 6 | *`jobFit` belongs to the `/api/jobs` group — port with 3E instead |
| 3D | Mid: `resumeChat`(131), `achievementEnhancer`(152), `learning`(190), `jobPreparation`(223), `careerRoadmap`(234), `interview`(284), `skills`(290), `dashboard`(306), `learningModules`(342), `aiTutor`(357), `studyTools`(371) | `[P]` up to 4 | Mostly `callAI` + DB |
| 3E | `/api/jobs` group: `jobTracker`+`jobAnalyzer`+`coverLetter`+`jobDiscovery`+`jobFit` | `[S]` one agent | Prefix collision |
| 3F | Large: `community`(572), `projectBuilder`(574), `courses`(704), `aiCoach`(813), `profiles`(1061), `practice`(1233) | `[P]` up to 3 | Highest `requirePlan` density — §6.3 matrix is mandatory per-file |
| 3G | Upload/doc-gen: `/api/resume` group + `/api/ats` group | `[S]` one agent | §6.6. Only if Phase 0 S1–S5 passed |
| 3H | `/admin` static: inline the single `src/public/admin/index.html` or add an Assets binding | `[P]` | Trivial |
| 3I | **Delete** `src/ssr/setupFrontend.js` from the Worker path | `[P]` | §0.1 — do not port |

Per-route-file definition of done (enforce mechanically, not by review):
1. All endpoints respond with the same status codes as Render for the same inputs.
2. Every `requirePlan(n)` call site preserved with the identical `n`. Diffed against the generated manifest.
3. `authenticateToken` present on exactly the endpoints that had it on Render.
4. No module-scope `process.env`. No `fs`. No `req.ip`/`req.connection`.
5. Response body shapes byte-identical for a representative request per endpoint.

### Phase 4 — Verification harness (starts in parallel with Phase 2; blocks Phase 5)
- `[P] T4.1` Generate the `endpoint → {auth, minTier}` manifest from Render's source. **This is the reference artifact** for §6.3.
- `[P] T4.2` Differential test runner: same request → Render and Workers → assert status + body-shape equality. Must run against a **non-production test account**.
- `[P] T4.3` Auth cross-verification matrix (§6.2).
- `[P] T4.4` Plan-gating matrix across all 100 call sites (§6.3).
- `[P] T4.5` Upload/export round-trip fixtures (§6.6).
- `[P] T4.6` Load test: concurrent requests to confirm Neon connection handling doesn't exhaust limits (§5, S11).
- **Note on the existing Jest suite:** the 37 files in `backend/tests/` are mock-heavy and per the user's own constraints are mock-based by design. They will **not** catch runtime incompatibility — they never touch the Workers runtime. `tests/requireOnboarding.test.js` actively passes against a nonexistent method (§4.3.1). **Do not treat a green `npm test` as migration evidence.** T4.2's differential runner is the real gate.

### Phase 5 — Incremental cutover (strictly sequential, one agent, one prefix at a time)
For each prefix, in this order: **low-risk reads → writes → auth → catch-all.**
1. `[S] T5.1` `/api/health` → Workers. Observe 24h.
2. `[S] T5.2` One read-only prefix (`/api/benchmarks` or `/api/guides`). Observe 24h.
3. `[S] T5.3` Non-auth read prefixes in small batches. Observe 24h between batches.
4. `[S] T5.4` Write-path prefixes.
5. `[S] T5.5` `/api/subscriptions` (§6.4). Observe 48h.
6. `[S] T5.6` `/api/auth` (§6.2). **Highest-risk single step in the migration.** Observe 48h.
7. `[S] T5.7` Flip the catch-all `/api/(.*)` to Workers. Render still running.
8. `[S] T5.8` Observe 7 days with Render warm as instant rollback.
9. `[S] T5.9` Update `frontend/.env.example`, `docs/archive/ARCHITECTURE.md:345`, `backend/README.md`, `docs/CLOUDFLARE_MIGRATION.md`.
10. `[S] T5.10` Only then decommission Render.

**Rollback at any step:** revert the `frontend/vercel.json` rewrite line, redeploy Vercel. Both backends share the Neon DB, so no data reconciliation is needed.

---

## 8. Definition of done — "safe to cut over" checklist

Every box must be checked with **evidence** (actual output), not assertion. Any unchecked box blocks the catch-all flip (T5.7).

**Compatibility**
- [ ] 1. Phase 0 spike results committed; S7, S9, S10, S11 all green.
- [ ] 2. Every S1–S6 failure has a decided, implemented fallback (not "we'll see").

**Correctness / parity**
- [ ] 3. Differential runner: all 181 endpoints return matching status codes Render vs. Workers.
- [ ] 4. Response body shapes match for ≥1 representative request per endpoint.
- [ ] 5. Generated plan-gating manifest diff = **zero differences** across all 100 `requirePlan` call sites.
- [ ] 6. `authenticateToken` coverage diff = zero differences.

**Auth / session**
- [ ] 7. `CF-Connecting-IP` resolves to the **real end-user IP** through the Vercel proxy chain — empirically confirmed, not assumed (§4.2 fail-open risk).
- [ ] 8. JWT cross-verification matrix: all 4 cells green.
- [ ] 9. `bcryptjs` verifies ≥20 real prod `bcrypt` hashes; `bcryptjs`-generated hashes verify under Node `bcrypt` (bidirectional, for rollback safety).
- [ ] 10. Single-active-device: supersede fires cross-device; does **not** fire on same-device re-login.
- [ ] 11. Logout with expired access token still revokes via `refreshToken` fallback.
- [ ] 12. `audit_logs.ip_address` non-NULL on Workers requests.

**Entitlements / billing**
- [ ] 13. Tier matrix (no-plan / 1 / 2 / 3) × all gated endpoints matches Render exactly.
- [ ] 14. `requirePlan` fails **closed** on DB error (returns 500, never `next()`).
- [ ] 15. `verify-payment` idempotency holds; cross-user order access denied.
- [ ] 16. User has explicitly re-confirmed shipping the unguarded mock payment verifier (§4.3.3).

**Infrastructure**
- [ ] 17. All secrets set via `wrangler secret`; **zero secrets in `wrangler.toml` or git**. Confirm `JWT_SECRET` ≥32 chars on Workers.
- [ ] 18. Rate limiting active at the Cloudflare edge: `/api/auth` ≤20/15min, `/api` ≤100/15min. **Verified by actually being throttled**, not by config inspection.
- [ ] 19. Worker bundle contains zero references to `initializeTables`/`runMigrations`/`ensureTables` (grep the built bundle).
- [ ] 20. Neon connection handling verified under concurrent load; no connection exhaustion.
- [ ] 21. CORS: allowed origin returns the header; a disallowed origin is rejected. Security headers diffed against Render's.
- [ ] 22. Error responses do not leak stack traces or internal paths at any status.

**Document processing** (or formally carved out to Containers)
- [ ] 23. PDF and DOCX upload → text extraction matches Render on ≥5 real fixtures.
- [ ] 24. DOCX/PDF/TXT export produces valid, openable files; browser download works end-to-end.
- [ ] 25. Upload limits and mimetype allowlists preserved (5 MB / 10 MB).

**Operational**
- [ ] 26. Cloudflare observability on; error-rate alerting configured **before** T5.7.
- [ ] 27. Render kept warm and reachable for ≥7 days post-flip.
- [ ] 28. Rollback rehearsed at least once during Phase 5 (deliberately revert a prefix and confirm recovery) — an untested rollback is not a rollback.
- [ ] 29. Each Phase 5 step observed for its stated window with no elevated error rate.
- [ ] 30. Docs updated (`frontend/.env.example`, `docs/archive/ARCHITECTURE.md:345`, `backend/README.md`, `docs/CLOUDFLARE_MIGRATION.md`).

---

## 9. Consequences

**Positive**
- Edge distribution; no cold-start-to-container latency; likely lower hosting cost.
- The port forces removal of real dead code (`setupFrontend.js`, dead `fs` imports, `winston`/`axios`/`@anthropic-ai/sdk` phantom deps, possibly `unzipper`+`xml2js`).
- Config becomes explicitly injected rather than ambient `process.env` — a genuine architecture improvement that also makes the code more testable.
- Rate limiting moves to the edge, where it is actually effective (the current in-process limiter is already weak on Render's single instance).

**Negative**
- Dual-maintenance window: bugfixes must land in both paths until T5.10.
- `aiCache` hit rate drops → higher AI provider spend (§4.5).
- Loses the ability to run boot-time migrations; schema changes now need an out-of-band process.
- 11k LOC of route code touched — even mechanical changes carry transcription risk across 181 endpoints.

**Risks**
- **Silent entitlement leakage** (§6.3) — highest-severity, lowest-visibility risk. Mitigated only by the generated manifest diff; manual review will not catch it.
- **`CF-Connecting-IP` fails open through the Vercel proxy** (§4.2), silently disabling single-device enforcement. Checklist item 7.
- **`pdf-parse` incompatibility** (§5, S1) — most likely spike failure; contained by the Phase 0 gate.
- **Rate limiting quietly dropped** (§4.4) — the easiest mistake to make, because the code "ports fine" and nothing errors.
- **Payment verifier moves to a new host while still unguarded** (§4.3.3).

---

## 10. Contracts

**`createConfig(env) → FrozenConfig`**
- Pre: `env` is the Workers `env` binding object.
- Post: returns a frozen config, or throws a typed `ConfigError`. Validates `JWT_SECRET.length >= 32`. **Never** calls `process.exit`. Callers convert `ConfigError` to a 500 response.
- Invariant: no module in the Worker path reads `process.env`.

**`getDb(c) → Pool`**
- Pre: request-scoped Hono context with config set.
- Post: a `pg`-API-compatible pool (`.query(text, params) → {rows, rowCount}`).
- Invariant: connections released before the response settles or via `ctx.waitUntil`. Parameterized `$n` binding preserved (SQL-injection boundary).

**`authMiddleware(c, next)`**
- Pre: `Authorization: Bearer <jwt>`.
- Post: on success sets `c.set('user', {id, sessionId})` and calls `next()`. On failure returns 401 and **does not** call `next()`.
- Invariants: HS256 only (algorithm pinned — never accept `alg` from the token). Session-revocation check preserved. `SESSION_SUPERSEDED` code preserved. Client IP from `CF-Connecting-IP`.

**`requirePlan(minTier) → middleware`**
- Pre: runs strictly after `authMiddleware`; `c.get('user').id` present.
- Post: on pass sets `c.set('userPlan', plan)` and calls `next()`. Below threshold returns 403 `{error, code:'PLAN_UPGRADE_REQUIRED', requiredPlan, currentPlan}`. **On any error returns 500 and does not call `next()`.**
- Invariant: **fails closed.** No code path reaches `next()` without a verified `tier_level >= minTier`.

**Route handler contract**
- Pre: config + db in context; user set if authenticated.
- Post: returns a `Response`. Status codes and body shapes identical to the Express original.
- Invariant: no `fs`, no `process.env`, no `req.ip`, no module-scope side effects.

---

## 11. Key file references

- Migration doc (to be corrected): `/Users/psoma/Projects/Jobtune/JobTune-EcoSystem/docs/CLOUDFLARE_MIGRATION.md`
- **Cutover control point:** `/Users/psoma/Projects/Jobtune/JobTune-EcoSystem/frontend/vercel.json` (line 5 — the Render rewrite)
- Express app / mount table: `/Users/psoma/Projects/Jobtune/JobTune-EcoSystem/backend/src/app.js`
- Worker stub: `/Users/psoma/Projects/Jobtune/JobTune-EcoSystem/backend/src/worker-entry.js`
- Worker config: `/Users/psoma/Projects/Jobtune/JobTune-EcoSystem/backend/wrangler.toml`
- Neon driver (verified present, untested): `/Users/psoma/Projects/Jobtune/JobTune-EcoSystem/backend/src/config/database.worker.js`
- Blocking `process.exit` bug: `/Users/psoma/Projects/Jobtune/JobTune-EcoSystem/backend/src/middleware/auth.js` (line 8)
- Entitlement gate: `/Users/psoma/Projects/Jobtune/JobTune-EcoSystem/backend/src/middleware/requirePlan.js`
- Dead+broken onboarding gate: `/Users/psoma/Projects/Jobtune/JobTune-EcoSystem/backend/src/middleware/requireOnboarding.js` (line 12 calls nonexistent `planService.getOnboardingCompleted`)
- Single-device logic: `/Users/psoma/Projects/Jobtune/JobTune-EcoSystem/backend/src/services/sessionService.js` (line 70, `sameDevice` IP comparison)
- Mock payment verifier: `/Users/psoma/Projects/Jobtune/JobTune-EcoSystem/backend/src/routes/subscriptions.js`
- SSR to delete, not port: `/Users/psoma/Projects/Jobtune/JobTune-EcoSystem/backend/src/ssr/setupFrontend.js`
- Real (Vercel) SSR: `/Users/psoma/Projects/Jobtune/JobTune-EcoSystem/frontend/api/ssr.js`
- Dynamic JSON require to fix: `/Users/psoma/Projects/Jobtune/JobTune-EcoSystem/backend/src/services/taxonomy/onetLoader.js` (line 23)
- Binary responses: `/Users/psoma/Projects/Jobtune/JobTune-EcoSystem/backend/src/routes/atsExport.js`

---

## 12. Recommended immediate next step

Run **Phase 0 only** and report back. Do not begin Phase 1 until the spike results are in — S1 (`pdf-parse`) and S7 (`bcryptjs` hash compatibility) have a material chance of changing the plan's shape, and S7 in particular can invalidate the whole approach.

One decision needed from the user before Phase 1: **checklist item 16** — confirm that shipping the unguarded mock payment verifier to the new prod backend is intentional.
