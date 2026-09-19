# Verification runbook: ADR-001 "safe to cut over" checklist (section 8) and cutover playbook (Phase 5)

Companion to `docs/migration/ADR-001-cloudflare-workers-port.md`. For each of the 30 checklist items: how it is verified, what
environment it needs, what this repository can say about it today, and the exact command. Nothing here has been run against
Render production or a deployed Worker: every script was exercised only against local mock servers (`npx jest tests/migration
--coverage=false`, 180 tests). **Green Jest is not migration evidence** (ADR section 7, Phase 4 note); the evidence is the output of
the scripts below run against the real servers, pasted next to each checklist box.

Status as of writing (mid-wave; other agents are still editing `backend/src/worker/`): re-run the commands, do not trust this table.

## 0. Conventions

**Environment legend** (the "Needs" column)

| Tag | Meaning |
|---|---|
| CI | fully automated, no external system; safe in CI or on any laptop |
| WORKER | a running Worker: deployed `*.workers.dev`, or `npx wrangler dev --local` for smoke tests (local workerd does not enforce CPU limits) |
| RENDER | the Render production backend, called with a dedicated test account |
| USER | needs you: test accounts, secrets in your shell, or a decision |
| CF | the Cloudflare dashboard / `wrangler` logged in to the account |
| NEON | the Neon console or a SQL client (the harness never connects to the database) |
| VERCEL | a Vercel preview deployment or the production project settings |

**Base URLs** (used as placeholders below): `R` = `https://jobtune-backend-14k0.onrender.com`, `W` = `https://jobtune-ecosystem.somapujith.workers.dev`.
Render's free tier sleeps: warm it first (`curl <R>/api/health`) and give the scripts `--timeout-ms 60000` for the first run.

**Environment variables** (read at run time only; never printed, stored or logged; set them in the shell you run the script from)

| Variable | Used by | Meaning |
|---|---|---|
| `JT_TEST_EMAIL`, `JT_TEST_PASSWORD` | auth-matrix, differential, upload-roundtrip, load-test (optional), ratelimit-probe (email only) | ONE dedicated test account, tier 2 or higher (tier 3 lets differential and upload reach every endpoint) |
| `JT_TEST_TOKEN` | differential, upload-roundtrip, load-test | alternative to the pair above: a bearer token (expires in 15 minutes) |
| `JT_JWT_SECRET` | auth-matrix | optional: the JWT secret shared by both servers, used only to forge an expired and an HS512-with-real-secret token locally. Without it two cells are skipped |
| `JT_TOKEN_NOPLAN`, `JT_TOKEN_TIER1`, `JT_TOKEN_TIER2`, `JT_TOKEN_TIER3` | plan-gating-matrix | bearer tokens for the four plan accounts, OR per account `JT_EMAIL_<NAME>` + `JT_PASSWORD_<NAME>` (re-logs in every 12 minutes) |

PowerShell: `$env:JT_TEST_EMAIL = 'test@example.com'`. Bash: `export JT_TEST_EMAIL=test@example.com`. Passing `--test-account-only` is your
statement that the account(s) are dedicated test accounts: **a login replaces that account's active session** (single active device), and every
script that logs in refuses without the flag.

**Test accounts to create** (normal signup on Render; then assign tiers with the API itself: `GET /api/subscriptions/plans` for plan ids,
then `POST /api/subscriptions/create-order` + `verify-payment` as that user, which is the unguarded mock verifier, item 16):
`noplan` (no plan row), `tier1`, `tier2`, `tier3`. Use the `tier3` account as `JT_TEST_*`. Never use a real user.

**Shared-database warnings.** Render and Workers share one Neon database: any write the scripts make (`--allow-writes`,
`--include-mutating`, `--resume-id`) is performed on both servers, so it happens twice. Render's `express-rate-limit` allows 100 requests
per 15 minutes per IP on `/api` and 20 on `/api/auth`; the scripts pace themselves under that (default budget 80 per 15 min on Render), so a full
plan matrix takes about an hour. A 429 is reported as INCONCLUSIVE, never as a pass.

**Exit codes (all scripts):** `0` pass | `1` failures or inconclusive results | `2` CRITICAL (an entitlement or forged-token leak) | `64` usage error / safety refusal.
Every script supports `--dry-run` (prints the planned requests, sends nothing), `--json`, and refuses when both URLs are the same server.

## 1. The scripts (all under `backend/scripts/migration/`, run from `backend/`)

| npm script | File | Checklist items | What it needs |
|---|---|---|---|
| `npm run migration:manifest:worker` | `generate-worker-manifest.js` | 5, 6 | CI. Builds the Worker app, lists endpoints from the tagged middleware; `--only-prefix`, `--out`, `--json` |
| `npm run migration:parity` | `parity.js` | 5, 6 | CI. Worker manifest vs `docs/migration/manifest.render.json`; exit 2 if a gate was dropped or weakened |
| `npm run migration:bundle` | `check-bundle.js` | 19 (and the process.exit surface of ADR 4.1) | CI. `wrangler deploy --dry-run` build, then grep. Deploys nothing |
| `npm run migration:differential -- ...` | `differential.js` | 3, 4, 22 | RENDER + WORKER + USER |
| `npm run migration:auth-matrix -- ...` | `auth-matrix.js` | 8, 10, 11 | RENDER + WORKER + USER |
| `npm run migration:plan-matrix -- ...` | `plan-gating-matrix.js` | 5, 13 | RENDER + WORKER + four USER test accounts |
| `npm run migration:upload -- ...` | `upload-roundtrip.js` | 2, 23, 24, 25 | RENDER + WORKER + USER (tier 2+) |
| `npm run migration:loadtest -- ...` | `load-test.js` | 20 | WORKER (+ NEON dashboard) |
| `npm run migration:ratelimit -- ...` | `ratelimit-probe.js` | 18 | WORKER (or Render) + USER |

Shared code: `lib/common.js`, `lib/ai-classify.js` (static classification of Express handlers that reach the AI model), `lib/ziputil.js`.
Tests: `backend/tests/migration/*.test.js` (the default suite deliberately contains NO full-parity assertion: it would be red mid-migration).

## 2. The 30 checklist items

Status words: **MET** (evidence produced by a command in this repo, re-run it), **UNIT-ONLY** (proved against fakes; live proof still needed),
**READY** (script written and tested against mocks, never run live), **OPEN** (not met / needs a human), **N/A YET**.

### Compatibility

**1. Phase 0 spike results committed; S7, S9, S10, S11 all green.**
How: table in `docs/CLOUDFLARE_MIGRATION.md` ("Phase 0 spike results"). Needs: USER + NEON. Status: **OPEN.** S7, S9, S10 pass (local workerd, synthetic data);
**S11 (Neon driver) was never run.** Prod-hash and prod-token checks of S7/S9 are also open (items 8, 9). Command (from `backend/spike/auth/s11.mjs`, against a Neon *branch*):
```
# create backend/spike/auth/.dev.vars (git-ignored) with one line: DATABASE_URL=postgresql://USER:PASSWORD@HOST/DB?sslmode=require
npx wrangler dev --local --port 8788 -c spike/auth/wrangler.toml
curl http://127.0.0.1:8788/s11
node spike/auth/s11-driver.mjs 10 http://127.0.0.1:8788        # connection release under concurrency
```

**2. Every S1-S6 failure has a decided, implemented fallback.**
How: `[alias]` in `backend/wrangler.toml` (stubs for `@aws-sdk/client-s3` and `node-ensure`, `pdfkit` standalone) and the wrappers under `src/worker/`; then a runtime round trip. Needs: CI (bundle), WORKER + USER (round trip).
Status: **READY / partly MET.** The bundle builds with the aliases today (`npm run migration:bundle`: dry run OK, 9.92 MiB raw, 1.87 MiB gzip). Runtime proof on a real Worker is item 23/24.
Command: `npm run migration:bundle`, then item 23.

### Correctness / parity

**3. Differential runner: all endpoints return matching status codes, Render vs Workers.** (The manifest has 184 endpoints: 183 in route files plus `/api/health`; the ADR's 181 is stale.)
How: `differential.js`. Needs: RENDER + WORKER + USER. Status: **READY.** Coverage is printed (`compared X of Y`, skipped by reason); the box may only be ticked with `skipped` explained.
Run in three passes; pass 1 is fully safe:
```
# 1) GET only, anonymous (protected endpoints are compared on their 401 answers)
npm run migration:differential -- --render <R> --workers <W> --timeout-ms 60000
# 2) GET only, authenticated as the test account (one login on Render, token reused on both; needs --test-account-only)
npm run migration:differential -- --render <R> --workers <W> --test-account-only --include-ai
# 3) writes (both servers write the shared DB; test account only; AI endpoints cost money on both)
npm run migration:differential -- --render <R> --workers <W> --test-account-only --include-ai --allow-writes --bodies bodies.json
```
`--dry-run` first. DELETE and writes under `/api/auth`, `/api/subscriptions`, `/api/admin*` additionally need `--allow-destructive` (covered by items 8, 15 instead).

**4. Response body shapes match for at least one representative request per endpoint.**
How: same script; shapes = keys and types recursively (values ignored; volatile keys in `IGNORE_DEFAULT`, extend with `--ignore <key>`). Needs: as item 3. Status: **READY.**
Caveat that matters: with the default empty body, most POST endpoints answer a 400 validation error on BOTH servers, which proves only validation-shape parity. A representative success
needs a curated body per endpoint in `--bodies bodies.json` (`{ "POST /api/x": { ... } }`), using synthetic data. Count endpoints whose compared answer was a 2xx and report the rest.

**5. Generated plan-gating manifest diff = zero across all requirePlan call sites.** (The real number is 90 call sites; 100 in the ADR counted comments and the definition line.)
How: static half `migration:parity`; behavioural half item 13. Needs: CI. Status: static half **MET at time of writing**: `184 compared, critical 0, error 0, warn 0`, 90 plan-gated endpoints, tiers 57/21/12 identical to Render.
```
npm run migration:parity                        # exit 0 / 1 / 2
npm run migration:parity -- --only-prefix /api/auth --only-prefix /api/subscriptions
npm run migration:manifest:worker -- --out ../worker-manifest.json   # inspect what the Worker actually exposes
```
The Worker's `/admin` static page is not an API endpoint of the reference and is ignored by `parity.js` (`--strict-static` includes it). An extra ungated endpoint on Workers is an ERROR.

**6. `authenticateToken` coverage diff = zero.**
Same command as item 5 (the comparator reports `AUTH_DROPPED` as CRITICAL). Status: **MET at time of writing** (177 authenticated, 7 public: identical). Also flags `UNTAGGED_MIDDLEWARE`: if any hand-written middleware is not tagged, the manifest cannot see its guard; the count is 0 today.

### Auth / session

**7. `CF-Connecting-IP` resolves to the real end-user IP through the Vercel proxy chain.**
Needs: **human** + deployed Worker + VERCEL preview + NEON. Cannot be scripted from this repo. Status: **OPEN**, and the design predicts a problem: `getClientIp` reads only `CF-Connecting-IP`, which Cloudflare sets to
the immediate peer, i.e. Vercel's egress IP, not the user. If so, every user is the "same device" (single-device gate fails open) and the audit log records Vercel IPs.
Procedure (use a Vercel PREVIEW deployment whose `vercel.json` sends only `/api/health` and `/api/auth/*` to the Worker; do not touch production for this):
1. From network A note your public IP (`curl https://api.ipify.org`); make 3 requests through the preview URL (`curl https://<preview>.vercel.app/api/health`).
2. Repeat from network B (phone hotspot).
3. In Neon: `SELECT ip_address, action, created_at FROM audit_logs ORDER BY created_at DESC LIMIT 20;` (audit rows are written in the background a moment after the response).
4. PASS only if network A's rows show A's IP and network B's rows show B's IP. If both show the same Vercel address: FAIL; the fix is a code change in `src/worker/lib/http.js` (trust the header Vercel sets, e.g. `x-vercel-forwarded-for` / `x-forwarded-for`, only when the request provably came from Vercel) and must be decided by you, then re-run.
Also capture what Render's own `req.ip` is (Render sets no `trust proxy`): the baseline may already be coarse (`auth-matrix` cell C8 reports it).

**8. JWT cross-verification matrix: all 4 cells green.**
How: `auth-matrix.js` C1 (Render token accepted by Workers), C2 (Workers token accepted by Render), C3 (wrong-secret token rejected by both), plus C4 alg:none, C5 HS512, C6 expired. Needs: RENDER + WORKER + USER. Status: **READY.**
```
npm run migration:auth-matrix -- --render <R> --workers <W> --test-account-only           # add JT_JWT_SECRET in the environment for C5b and C6
```
A forged token accepted by either server is CRITICAL (exit 2). Probing uses `GET /api/subscriptions/my-plan` so Render's 20-per-15-min auth limiter only counts about 11 logins/logouts.

**9. `bcryptjs` verifies at least 20 real production bcrypt hashes; bcryptjs-generated hashes verify under Node `bcrypt`.**
Needs: **human** + NEON. The harness deliberately has no script that reads production hashes. Status: **OPEN** (spike: 77/77 synthetic cases agree both ways; real hashes untested).
Procedure: (a) `SELECT substring(password_hash,1,7) AS prefix, count(*) FROM users GROUP BY 1;` to see which `$2a$/$2b$/$2y$` variants exist; (b) run `auth-matrix` (C1/C2: a real production hash of the test account is verified by
`bcryptjs` on the Worker at login); (c) for the other hashes, from a scratch directory export hashes to a local file (hashes only) and check that `bcryptjs.compare('not-the-password', hash)` returns `false` and does not throw
for every one of them (a throw is the S7 caveat: the route must map it to 401); (d) bidirectional: sign up a throwaway account ON THE WORKER, then log in to it ON RENDER. Fail-closed rule (ADR 6.1): if any of this fails, stop.

**10. Single-active-device: supersede fires cross-device, not on same-device re-login.**
How: `auth-matrix.js` C7 (login A, login B: A gets 401 with `code: "SESSION_SUPERSEDED"` and the exact message, B works, A dead on the other server too), C8 (same-IP re-login is not 409), C9 (cross-device via spoofed `X-Forwarded-For`/`CF-Connecting-IP`).
Needs: as item 8. Status: **READY**; C9 is INCONCLUSIVE against any server that ignores client-supplied IP headers (production Cloudflare and Render do; a local `wrangler dev` may honour them), so the true cross-device case is a **human** step: log in on two different networks (laptop plus phone hotspot) and confirm the first gets `SESSION_SUPERSEDED`, and that a second login from the same network is not `409`. Command as item 8.

**11. Logout with an expired access token still revokes via the `refreshToken` fallback.**
How: `auth-matrix.js` C10 (per server; control: logout without the refreshToken revokes nothing). Needs: as item 8. Status: **READY.** Command as item 8 (with `JT_JWT_SECRET` the access token is truly expired; without it, a wrong-secret token stands in).

**12. `audit_logs.ip_address` non-NULL on Workers requests.**
Needs: NEON. Status: **UNIT-ONLY** (`tests/worker/auditLogger.test.js` proves the wiring with a fake db). Live: send a few requests to `<W>/api/health` then
`SELECT ip_address, action, resource, created_at FROM audit_logs ORDER BY created_at DESC LIMIT 20;` and confirm no NULL (and see item 7 for whose IP it is).

### Entitlements / billing

**13. Tier matrix (no plan / 1 / 2 / 3) x all gated endpoints matches Render exactly.**
How: `plan-gating-matrix.js`. By default only BELOW-threshold denials are sent (they never run a handler). Gated on Render but reachable on Workers = CRITICAL (exit 2). Needs: RENDER + WORKER + four test accounts. Status: **READY.**
```
export JT_TOKEN_NOPLAN=... JT_TOKEN_TIER1=... JT_TOKEN_TIER2=... JT_TOKEN_TIER3=...     # or JT_EMAIL_<NAME>/JT_PASSWORD_<NAME> with --test-account-only
npm run migration:plan-matrix -- --render <R> --workers <W> --dry-run                     # prints cells and the time estimate (about 1 hour at the Render budget)
npm run migration:plan-matrix -- --render <R> --workers <W> --test-account-only
npm run migration:plan-matrix -- --render <R> --workers <W> --test-account-only --include-reads      # also GETs at/above the tier (real handlers run)
npm run migration:plan-matrix -- --render <R> --workers <W> --test-account-only --include-mutating   # writes and AI calls at/above the tier: side effects on both servers
```
Below-threshold cells assert 403 + `PLAN_UPGRADE_REQUIRED` + `requiredPlan` = the tier name + `currentPlan` present, identical on both. Residual risk of the default run: if Workers fails to gate an endpoint, that one request runs the real handler with an empty body and a low-tier test account (that is the leak being caught).

**14. `requirePlan` fails closed on DB error (500, never `next()`).**
How: `tests/worker/requirePlan.test.js` (fake db that throws; property test "next() is reached iff a verified numeric tier_level >= minTier"). Needs: CI. Status: **UNIT-ONLY.** Optional live check with synthetic values only (no real database):
```
npx wrangler dev --local --port 8790 --var JWT_SECRET:0123456789abcdef0123456789abcdef0123 --var DATABASE_URL:postgres://u:p@127.0.0.1:1/none --var FRONTEND_URL:http://localhost:5173
TOKEN=$(node -e "console.log(require('jsonwebtoken').sign({id:1},'0123456789abcdef0123456789abcdef0123',{algorithm:'HS256',expiresIn:'10m'}))")
curl -i -H "Authorization: Bearer $TOKEN" http://127.0.0.1:8790/api/skills/questions        # expect 500 {"error":"Failed to verify subscription plan"}, never 200
```
(The token has no `sessionId`, so `authenticateToken` skips the session lookup and the request reaches `requirePlan`, whose plan lookup then fails.) Kill the dev server afterwards.

**15. `verify-payment` idempotency holds; cross-user order access denied.**
How: unit tests (`tests/worker/auth/subscriptions.routes.test.js`, run in CI). Live: needs USER; **not scripted on purpose** (it grants a paid tier and writes `plan_orders` in the real database). Status: **UNIT-ONLY.**
Live procedure, two throwaway test accounts A and B, against Render and again against Workers:
```
curl -s -X POST <base>/api/subscriptions/create-order -H "Authorization: Bearer $TOKEN_A" -H "Content-Type: application/json" -d '{"planId":<id>}'      # note orderRef
curl -s -X POST <base>/api/subscriptions/verify-payment -H "Authorization: Bearer $TOKEN_A" -H "Content-Type: application/json" -d '{"orderRef":"<ref>"}'  # 200
curl -s -X POST <base>/api/subscriptions/verify-payment -H "Authorization: Bearer $TOKEN_A" -H "Content-Type: application/json" -d '{"orderRef":"<ref>"}'  # 200 with alreadyPaid: true
curl -s -X POST <base>/api/subscriptions/verify-payment -H "Authorization: Bearer $TOKEN_B" -H "Content-Type: application/json" -d '{"orderRef":"<ref>"}'  # 403/404, never a grant
# NEON: SELECT order_ref, status, paid_at FROM plan_orders WHERE order_ref = '<ref>';   -- exactly one paid_at
```
(Check the exact request field names in `backend/src/routes/subscriptions.js` before running.)

**16. You have explicitly re-confirmed shipping the unguarded mock payment verifier (ADR 4.3.3).**
Needs: **you.** Status: **OPEN.** `POST /api/subscriptions/verify-payment` has no gateway signature check; any authenticated user can grant themselves any tier. It is identical on Render (not a regression) and is ported as-is and pinned by the test `KNOWN UNGUARDED MOCK VERIFIER` (see `docs/migration/wave/auth.md`).
Decision to record next to the box: ship as-is / disable the endpoint on Workers only / put a guard in front. No script can decide this.

### Infrastructure

**17. All secrets set via `wrangler secret`; zero secrets in `wrangler.toml` or git; `JWT_SECRET` >= 32 chars on Workers.**
Needs: CF + USER. Status: repo side **MET at time of writing** (`backend/wrangler.toml` holds no secret values; comments only); the rest is **OPEN**.
```
git grep -nEi "(JWT_SECRET|DATABASE_URL|API_KEY|PASSWORD|SECRET)\s*=\s*['\"]?[A-Za-z0-9+/_-]{8,}" -- backend/wrangler.toml backend/src ':!*.test.js'      # expect nothing
npx wrangler secret list                                            # names only (needs Cloudflare login): JWT_SECRET, DATABASE_URL, provider keys
curl -i <W>/api/health                                              # {"status":"ok","db":"connected",...} proves config validated (JWT_SECRET >= 32) and the DB answers; "degraded"/"unreachable" is still HTTP 200 but means the DB probe failed; an invalid config answers 500 on every route
```

**18. Rate limiting active at the Cloudflare edge: `/api/auth` <= 20/15 min, `/api` <= 100/15 min, verified by being throttled.**
How: `ratelimit-probe.js`: wrong-credential logins for the TEST account until a 429 with the Express body appears; passes only if the 429 came after at most 20 allowed requests. Needs: WORKER + USER + **CF** (and a **human** for two cells). Status: **OPEN.** Rate limiting is NOT provisioned: `[[ratelimits]]` in `backend/wrangler.toml` is commented out and `docs/migration/rate-limiting.md` says CONFIG ONLY, so the probe fails against the Worker today, correctly. Note the binding cannot express "20 per 15 minutes" (period 10 or 60 s), so use `--expect-max-before-limit 5` for the recommended `5 / 60 s` config, and decide consciously that this is an accepted approximation.
```
npm run migration:ratelimit -- --url <W> --test-account-only --expect-max-before-limit 5           # your IP is throttled for the window afterwards
npm run migration:ratelimit -- --url <R> --test-account-only                                       # baseline: Render should throttle after 20
npm run migration:ratelimit -- --url <W> --test-account-only --path /api/health --method GET --attempts 150 --allow-more --expect-max-before-limit 100   # general limiter
```
Human cells: (1) repeat through the real Vercel path (`--url https://<frontend-domain>`), (2) from a second network confirm a different client is NOT throttled (this also answers the shared-egress-IP question of item 7), (3) watch Workers logs for `rate limiting is NOT active`.

**19. Worker bundle contains zero references to `initializeTables` / `runMigrations` / `ensureTables`.**
How: `check-bundle.js` (`wrangler deploy --dry-run --outdir <tmp>`, then grep). Needs: CI (wrangler installed). Status: **MET at time of writing:** 0 references in a 9.92 MiB bundle (1.87 MiB gzip).
```
npm run migration:bundle                     # add --keep to keep the build output, --strict-exit to fail on REVIEW items
```
It also lists every `process.exit`: 3 are text inside string literals (course content), 1 is real third-party code, `Async.prototype.fatalError` in mammoth's bundled bluebird (`isNode2` path), flagged **REVIEW** for a human decision (unreachable on Workers in practice; not a failure unless `--strict-exit`). The known jsonwebtoken/semver `process.env.NODE_DEBUG` line is allowlisted and listed. Per the Phase 0 spike, `process.exit` at module load is a silent no-op on this compat date, but that is one more reason to keep the config path exit-free (it is: `tests/worker/sourceTree.test.js`).

**20. Neon connection handling verified under concurrent load; no connection exhaustion.**
How: `load-test.js` (health + a public DB-backed GET, ramped concurrency, error rate, p50/p95/p99, 5xx-burst and connection-limit-body detection, and health answers that say `db: "unreachable"`: the Worker's health probe swallows the DB error and still answers HTTP 200, so that is where exhaustion shows first) AND the Neon dashboard's connection graph during the run. Needs: WORKER + **NEON** (human) + the S11 result of item 1. Status: **READY**, unverified.
```
npm run migration:loadtest -- --url <W> --dry-run
npm run migration:loadtest -- --url <W> --concurrency 5,10,20 --duration-s 30 --max-p99-ms 3000      # defaults are gentle (5 users, 15 s, ~100 rps at most); the script refuses onrender.com and > 50 users
```
Watch Neon "Monitoring > Connections" while it runs and afterwards (connections must fall back to baseline; a per-request pool that is not released shows as a plateau). `--db-path` swaps in an authenticated GET (uses `JT_TEST_TOKEN`).

**21. CORS: allowed origin returns the header, a disallowed origin is rejected; security headers diffed against Render.**
Needs: WORKER + RENDER, no credentials. Status: **UNIT-ONLY** (`tests/worker/cors.test.js`, `securityHeaders.test.js` compare against helmet's default set). Live:
```
curl -si -H "Origin: https://<your-frontend-origin>" <W>/api/health | grep -i "^access-control"          # expect allow-origin = that origin, allow-credentials: true
curl -si -H "Origin: https://evil.example" <W>/api/health | grep -i "^access-control"                    # expect NO access-control-allow-origin
curl -si -X OPTIONS -H "Origin: https://<your-frontend-origin>" -H "Access-Control-Request-Method: POST" <W>/api/auth/login | head -20
diff <(curl -sI <R>/api/health | tr -d '\r' | sort | grep -viE "^(date|etag|content-length|x-render|rndr|cf-|server|report-to|nel|alt-svc):") \
     <(curl -sI <W>/api/health | tr -d '\r' | sort | grep -viE "^(date|etag|content-length|x-render|rndr|cf-|server|report-to|nel|alt-svc):")
```
Known accepted differences (Worker README section 4): Express adds a weak `ETag` and `charset=utf-8`; Hono does not. Compare the `content-security-policy`, `strict-transport-security`, `x-*` headers line by line.

**22. Error responses do not leak stack traces or internal paths at any status.**
How: `differential.js` scans EVERY response body from both servers for stack frames, internal file paths, `postgres://` strings and secret names (a leak on Workers is a mismatch); unit tests for the masking (`tests/worker/app.test.js`). Needs: as item 3 (an anonymous run already exercises many 401/404 paths). Status: **READY / UNIT-ONLY.**
Force real error paths too (Workers, unauthenticated where possible): `curl -i -X POST <W>/api/auth/login -H "Content-Type: application/json" -d '{'` (malformed JSON), `curl -i <W>/api/no-such-route` (Express-style HTML 404), and the upload script's rejected-file cases (masked 500). Expect `{"error":"Internal Server Error"}` for every 5xx.

### Document processing

**23. PDF and DOCX upload -> text extraction matches Render on at least 5 real fixtures.**
How: `upload-roundtrip.js` U:* checks (`POST /api/ats/v2/parse`: no DB write, no AI). Default fixtures are the SYNTHETIC files in `backend/spike/docs/fixtures`; for this box point `--fixtures` at 5 or more real resumes you own (PDF and DOCX mix). Needs: RENDER + WORKER + USER (tier 2+). Status: **READY.**
```
npm run migration:upload -- --render <R> --workers <W> --test-account-only --fixtures C:\path\to\real-resumes --limit 12
```
Text must be exactly equal (a whitespace-only difference fails unless `--allow-whitespace-diff`). Note from the spike: Render itself intermittently threw `bad XRef entry` for `pdfParse(Buffer)` on multiple PDFs in one process; a difference could be Render's.

**24. DOCX/PDF/TXT export produces valid, openable files; browser download works end to end.**
How: `upload-roundtrip.js` E:pdf, E:docx, E:txt (`POST /api/resume/v2/export`) validate the bytes (PDF `%PDF-` header and `%%EOF`; DOCX ZIP central directory with `[Content_Types].xml` and `word/document.xml`), `Content-Type`, `Content-Disposition: attachment; filename="*.<ext>"`, `Content-Length`, and compare extracted text between servers; `--resume-id <id> --allow-writes` adds `POST /api/ats/export/docx|txt` for a saved resume (writes an export row). Needs: as item 23. Status: **READY**; the "browser download" and "opens in Word" halves are a **human** step (PDF and DOCX byte equality is not expected: timestamps and ids differ; the script compares text).
```
npm run migration:upload -- --render <R> --workers <W> --test-account-only --no-limits            # exports only
```
Then in a browser on the real frontend: export a resume from the Workers-served flow as DOCX and PDF, open both.

**25. Upload limits and mimetype allowlists preserved (5 MB / 10 MB).**
How: `upload-roundtrip.js` L:* checks: no file -> 400; a PNG is rejected the same way on both; 5 MB + 1 byte on `/api/ats/v2/parse` is rejected the same way on both (on Express multer errors surface as a masked 500); `--include-10mb` adds 10 MB + 1 byte to `/api/resume/upload`. Needs: as item 23. Status: **READY** (source-level parity is unit-tested in `tests/worker/`).
```
npm run migration:upload -- --render <R> --workers <W> --test-account-only --include-10mb
```

### Operational

**26. Cloudflare observability on; error-rate alerting configured before T5.7.**
Needs: CF (human). Status: `[observability] enabled = true` is in `backend/wrangler.toml` (**MET** for logs); alerting is **OPEN** and cannot be verified from the repo. In the dashboard: Workers & Pages > `jobtune-ecosystem` > Metrics/Logs, and Notifications > add an alert on Workers error rate (or a Logpush/third-party monitor). Record which alert, threshold and recipient. Test it by triggering one deliberate 5xx.

**27. Render kept warm and reachable for at least 7 days after the flip.**
Needs: **human / ops**. Status: **OPEN.** Do not stop, delete or downsize the Render service. "Warm" matters on the free tier (it sleeps): schedule a request every 10 minutes for the window (`curl -fsS <R>/api/health`, e.g. a free uptime monitor) and confirm Render answers before you declare the rollback path valid. Calendar the earliest decommission date (T5.10).

**28. Rollback rehearsed at least once during Phase 5.**
Needs: **human** + VERCEL. Status: **OPEN.** Rehearse on a low-risk prefix after T5.2: flip the prefix back to Render (revert the single `vercel.json` line, redeploy), confirm with `migration:differential --only-prefix <p>` that Render now answers, time how long propagation took, then flip forward again. Write the observed duration next to the box. An untested rollback is not a rollback.

**29. Each Phase 5 step observed for its stated window with no elevated error rate.**
Needs: CF + VERCEL (human). Status: **OPEN.** Per step, record: window start/end, Workers error rate and p95 (Cloudflare metrics), Vercel function/rewrite errors, and the output of the scripted spot checks in section 3. Windows are in the playbook below.

**30. Docs updated (`frontend/.env.example`, `docs/archive/ARCHITECTURE.md:345`, `backend/README.md`, `docs/CLOUDFLARE_MIGRATION.md`).**
Needs: CI (a grep) after T5.9. Status: **N/A YET** (post-cutover).
```
git grep -n "onrender.com" -- frontend/.env.example docs/archive/ARCHITECTURE.md backend/README.md docs/CLOUDFLARE_MIGRATION.md      # after T5.9 each remaining hit must be a deliberate historical note
```

### Summary of what needs a human

7 (Vercel IP chain), 9 (production hashes), 10 (second network), 15 (payment steps), 16 (payment verifier decision), 18 (edge rate limiting, second client, Vercel path), 20 (Neon dashboard),
24 (browser download), 26, 27, 28, 29 (Cloudflare/Vercel dashboards and ops), plus item 1's S11 run. Everything else has a script; none of the scripts has been run against a real service.

## 3. Spot checks to run after every Phase 5 step (`<p>` = the prefix just moved)

```
npm run migration:parity -- --only-prefix <p>                                        # CI: the Worker still exposes the same gates
npm run migration:differential -- --render <R> --workers <W> --only-prefix <p> [--test-account-only]
npm run migration:plan-matrix -- --render <R> --workers <W> --only-prefix <p> --test-account-only         # if the prefix has requirePlan endpoints
curl -si https://<frontend-domain><example path under p> | head                        # through Vercel: confirm the Worker answers (e.g. via a header you can see, or Workers logs)
```
Before T5.6 also run item 8, 10, 11 and 18; before T5.5 items 15 and 16.

## 4. Cutover playbook (Phase 5, T5.1-T5.10)

**Illustrative only: nothing here edits `frontend/vercel.json`.** The current file is:
```json
"rewrites": [
  { "source": "/api/(.*)", "destination": "https://jobtune-backend-14k0.onrender.com/api/$1" },
  { "source": "/(.*)", "destination": "/api/ssr" }
]
```
Vercel applies the first matching rewrite, so every Workers rule goes ABOVE the `/api/(.*)` Render rule. `:path*` matches zero or more segments (so `/api/guides` and `/api/guides/x` both match and `/api/guides-x` does not).
Rollback for any step is the same: remove (or point back to Render) the rule(s) added in that step, commit, and redeploy Vercel; both backends share Neon, so there is no data to reconcile. Propagation is expected in about 30 seconds (measure it in item 28).
Keep the Worker URL in one place: `W = https://jobtune-ecosystem.somapujith.workers.dev`.

**T5.1 `/api/health`. Observe 24 h.**
```json
{ "source": "/api/health", "destination": "https://jobtune-ecosystem.somapujith.workers.dev/api/health" },
{ "source": "/api/(.*)",   "destination": "https://jobtune-backend-14k0.onrender.com/api/$1" },
```
Rollback: delete the first line.

**T5.2 one read-only prefix. Observe 24 h.** Genuinely read-only choices per the manifest: `/api/benchmarks` (one admin-only GET) or `/api/dashboard` (one authenticated GET). `/api/guides`, which the ADR also names, has `POST /api/guides/generate` (an AI call), so it is not read-only.
```json
{ "source": "/api/dashboard/:path*", "destination": "https://jobtune-ecosystem.somapujith.workers.dev/api/dashboard/:path*" },
```
(inserted above the catch-all). Rehearse the rollback here (item 28). Needs items 3/4 green for the prefix.

**T5.3 non-auth read prefixes in small batches. Observe 24 h between batches.** One rule per prefix, same shape, e.g. `/api/courses/:path*`, `/api/community/:path*`, `/api/practice/:path*`. Order of risk: prefixes with no `requirePlan` and no uploads first; prefixes with `requirePlan` only after item 13 is green for them. Keep prefixes that share a namespace together: `/api/jobs/:path*` (five Express files plus `/api/jobs/achievement-enhancer`), `/api/resume/:path*` (resume + resumeV2), `/api/ats/:path*` (atsExport + atsCheckerV2); `/api/resume-chat` and `/api/resume-consistency` are distinct prefixes.

**T5.4 write-path prefixes.** Same rules, moved only after `migration:differential --allow-writes` (test account) is clean for the prefix. Window not stated in the ADR: use 24 h per batch. Document routes (`/api/resume`, `/api/ats`) need items 2, 23, 24, 25 first.

**T5.5 `/api/subscriptions`. Observe 48 h.**
```json
{ "source": "/api/subscriptions/:path*", "destination": "https://jobtune-ecosystem.somapujith.workers.dev/api/subscriptions/:path*" },
```
Requires items 15 and 16 (the payment verifier decision) done.

**T5.6 `/api/auth`, the highest-risk step. Observe 48 h.**
```json
{ "source": "/api/auth/:path*", "destination": "https://jobtune-ecosystem.somapujith.workers.dev/api/auth/:path*" },
```
Requires items 7, 8, 9, 10, 11, 12, 18 (rate limiting really throttling through the Vercel path) and a paid Workers plan (bcryptjs measured about 70-80 ms per hash/compare in workerd; the Free plan's 10 ms CPU cap is from memory, verify). Rollback = delete the line; sessions issued by either backend stay valid on the other (same secret, same database).

**T5.7 flip the catch-all `/api/(.*)` to Workers (Render still running).**
```json
{ "source": "/api/(.*)", "destination": "https://jobtune-ecosystem.somapujith.workers.dev/api/$1" },
```
(replacing the Render destination; the per-prefix rules above it become redundant and may stay.) All 30 checklist boxes except 27-30 must be ticked, and item 26 (alerting) must be in place BEFORE this step. Rollback line:
```json
{ "source": "/api/(.*)", "destination": "https://jobtune-backend-14k0.onrender.com/api/$1" },
```

**T5.8 observe 7 days with Render warm** (item 27, 29). Run section 3 daily; keep `migration:parity` in CI.

**T5.9 documentation** (item 30): `frontend/.env.example`, `docs/archive/ARCHITECTURE.md:345`, `backend/README.md`, `docs/CLOUDFLARE_MIGRATION.md`.

**T5.10 decommission Render** only after the 7-day window and item 28, and after copying anything that exists only on Render (its environment variables, for a future rollback). This step is not reversible in the ADR's sense: there is no warm rollback afterwards.

## 5. Known limits of this harness (say them out loud when ticking boxes)

- Everything was tested against local mock servers; **no script has been run against Render, a deployed Worker, Neon, Vercel or Cloudflare.** The mocks encode this repo's reading of Express behaviour (auth, sessions, requirePlan, multer, rate-limit messages), so a wrong reading is shared by the mock and the script.
- `differential.js` compares shapes, not values, and with empty bodies proves mostly validation parity for POST endpoints (item 4). The AI classification is a static heuristic (45 of 184 endpoints are classified as AI at time of writing); unclassifiable endpoints are treated as AI and skipped by default.
- The auth matrix's cross-device cell and the Vercel IP chain cannot be proven from one machine (items 7, 10).
- The plan matrix tests denials by default; at/above-threshold parity needs `--include-reads` / `--include-mutating` and is where real side effects and AI cost live.
- `load-test.js` at its defaults is a connection-handling smoke test, not a capacity test; it cannot see Neon's own connection count.
- `migration:parity` proves the Worker's TAGGED middleware matches the reference. An untagged custom guard would be invisible (reported as `UNTAGGED_MIDDLEWARE`, count 0 today), and Hono's case-sensitive routing versus Express's case-insensitive routing is only flagged when the manifest paths differ in case.
- Third-party `process.exit` in the bundle (mammoth's bluebird) needs a human decision (item 19).
