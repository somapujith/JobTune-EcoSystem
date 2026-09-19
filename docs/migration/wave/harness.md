# Wave notes: `harness` slice (ADR-001 Phase 4, T4.2-T4.6, Worker-side manifest extractor, verification runbook)

Owner scope: `backend/scripts/migration/**` (new files), `backend/tests/migration/**`, `docs/migration/verification-runbook.md`, this
file, and the `scripts` section of `backend/package.json` (npm scripts added, nothing else touched). No Express code, no `src/worker/**`,
no `frontend/**`, no git write commands, no `npm install`, nothing run against a real service: every script was exercised only against
`http.createServer` mocks on 127.0.0.1 (plus `wrangler deploy --dry-run` for the bundle check, which deploys nothing).

## What exists

| File | Purpose |
|---|---|
| `scripts/migration/generate-worker-manifest.js` | builds `createApp({ mountSlices: true })`, lists endpoints through `lib/routes.js listRoutes/listMounts`, emits the reference manifest schema (its `schema` object is imported from `generate-manifest.js`, so it cannot drift). `--only-prefix` (repeatable), `--out`, `--json`. Never crashes on a partial port: a slice whose `routes/mounts/<slice>.js` or `services/registry/<slice>.js` fails to load or whose `mount()` throws is isolated and listed in `manifest.generator.sliceErrors` (child-process test with a real `Module._load` hook) |
| `scripts/migration/parity.js` | worker manifest vs `docs/migration/manifest.render.json` through `compare-manifests.js`; same exit codes (0 / 1 / 2). Ignores the Worker's `GET /admin*` static page (not an API endpoint of the reference); `--strict-static` includes it |
| `scripts/migration/differential.js` | T4.2. Same request to Render and Workers for every manifest endpoint; status + JSON shape (keys/types, values ignored, volatile keys skipped); leak scan of every body (stack frames, internal paths, `postgres://`, secret names) |
| `scripts/migration/auth-matrix.js` | T4.3. C1-C10: cross-verification cells, wrong-secret / alg:none / HS512 / expired forged tokens, session supersede (exact `SESSION_SUPERSEDED` code and message), same-IP re-login, cross-device via spoofed IP headers, logout via refreshToken fallback |
| `scripts/migration/plan-gating-matrix.js` | T4.4. Every requirePlan endpoint x {no-plan, tier1, tier2, tier3}; below-threshold denials by default; gated-on-Render-but-reachable-on-Workers is CRITICAL (exit 2) |
| `scripts/migration/upload-roundtrip.js` | T4.5. `POST /api/ats/v2/parse` text equality, limits/allowlist, `POST /api/resume/v2/export` pdf/docx/txt validity (header/`%%EOF`, ZIP central directory, headers), optional ATS exports |
| `scripts/migration/load-test.js` | T4.6. Health + DB-backed GET, ramped concurrency, p50/p95/p99, exhaustion signs (5xx burst, connection-limit bodies, degraded health answers) |
| `scripts/migration/ratelimit-probe.js` | checklist 18. Wrong-credential logins for the TEST account until a 429 with the Express body appears |
| `scripts/migration/check-bundle.js` | checklist 19. `wrangler deploy --dry-run --outdir <tmp>` then grep; process.exit report with allowlist |
| `scripts/migration/lib/{common,ai-classify,ziputil}.js` | shared helpers; static AI-endpoint classifier; ZIP/PDF inspection |
| `tests/migration/{workerManifest,differential,authMatrix,planGatingMatrix,uploadRoundtrip,loadAndRatelimit,checkBundle}.test.js` + `helpers/{mockServer,fakeAuthServer}.js` | 180 tests with `manifest.test.js` (8 suites), all green: `npx jest tests/migration --coverage=false` |
| `docs/migration/verification-runbook.md` | all 30 checklist items (how / needs / status / command) and the cutover playbook |

npm scripts added: `migration:manifest:worker`, `migration:parity`, `migration:differential`, `migration:auth-matrix`, `migration:plan-matrix`,
`migration:upload`, `migration:loadtest`, `migration:ratelimit`, `migration:bundle`. (`migration:smoke` in the same section was added by someone else.)
The default Jest suite has NO full-parity assertion (it would be red mid-migration); parity runs through the npm script.

## Results produced while building (re-run, do not trust)

- `npm run migration:parity`: **184 compared, critical 0 / error 0 / warn 0 / info 0, exit 0** at the moment it was last run (the Worker exposed 186 endpoints: 184 plus the 2 `/admin` static routes; 177 authenticated, 90 plan-gated with tiers 57/21/12, identical to Render; 0 untagged middleware; 43 mounts). It went from "1 of 184" to "184 of 184" while this slice was being written.
- `npm run migration:bundle`: dry-run build OK (9.92 MiB raw, 1.87 MiB gzip), **0 references** to `initializeTables|runMigrations|ensureTables`. 4 `process.exit` hits: 3 are course-content text inside string literals, 1 is real third-party code (`Async.prototype.fatalError` in mammoth's bundled bluebird, the `isNode2` path): flagged REVIEW for a human. The jsonwebtoken/semver `process.env.NODE_DEBUG` line is allowlisted and listed (it is a `process.env` read, not an exit call; the brief called it the "semver debug line").

## Assumptions the mocks encode (a wrong reading here is shared by the script and its test)

- Login response is `{ user, token, refreshToken, session }` (`token`, not `accessToken`); 409 is `{ error, code: 'ACCOUNT_IN_USE', activeSession }`; supersede is `401 { error: 'This account was signed in on another device. Sign in again to use JobTune on this device.', code: 'SESSION_SUPERSEDED' }`; invalid tokens are `401 { error: 'Unauthorized' }` (read from `routes/auth.js`, `middleware/auth.js`, `sessionService.js`).
- `requirePlan` denial body `{ error: 'This feature requires a higher subscription plan.', code: 'PLAN_UPGRADE_REQUIRED', requiredPlan: <tier name>, currentPlan: <name|null> }`; fail-closed 500 `{ error: 'Failed to verify subscription plan' }`.
- multer errors (size, mimetype) surface as a masked `500 { error: 'Internal Server Error' }`; the routes' own "no file" answer is `400 { status: 'error', message: 'No file uploaded' }` (`routes/atsCheckerV2.js`, Worker README section 5).
- Render's limiters are 100 per 15 min on `/api` and 20 per 15 min on `/api/auth`, 429 bodies as in `docs/migration/rate-limiting.md`. The scripts pace themselves under these (auth-matrix probes tokens on `GET /api/subscriptions/my-plan` so only logins/logouts hit the auth limiter, about 11 per run).
- Worker `/api/health` answers HTTP 200 even when the database is down (`status: 'degraded', db: 'unreachable'`), so the load test reads the body, not just the status.

## Deviations / choices worth knowing

- `differential.js` shares one token across both servers (a single login on Render) instead of logging in on each: JWT secret and database are shared, and one login avoids the single-active-session supersede between the two runs. Workers-issued tokens are covered by auth-matrix C2.
- Safety defaults everywhere: explicit URLs (never defaulted or read from `.env`), refuse identical targets (including localhost vs 127.0.0.1), `--dry-run`, `--test-account-only` for any login (and always for the rate-limit probe), GET-only unless `--allow-writes`, DELETE and writes under `/api/auth|subscriptions|admin|admin-panels` need `--allow-destructive`, AI endpoints skipped unless `--include-ai` (unclassifiable counts as AI), `load-test.js` refuses `*.onrender.com` and more than 50 users without explicit flags. Exit code 64 = usage/refusal, 2 = CRITICAL.
- The AI classifier is a static heuristic over the Express source (AST of the route file plus a transitive "requires aiClient/embeddings" module graph). 45 of the 184 reference endpoints are classified AI at the time of writing; `GET /api/ai-coach/career-score` (DB only) is correctly not AI, `GET /api/guides/:id` and `GET /api/evidence/report` are.
- Nothing was added for item 9 (production hashes) on purpose: a script would have to read production `password_hash` values, which this slice may not do; the runbook gives the human procedure. Item 15 (verify-payment live) is likewise not scripted because it grants a paid tier.

## Not verified / needs orchestrator or user

- No script has run against Render, a deployed Worker, Neon, Vercel or Cloudflare. `wrangler dev --local` was not started by this slice.
- Rate limiting is not provisioned (`[[ratelimits]]` still commented out in `backend/wrangler.toml`), so `migration:ratelimit` against the Worker fails today by design.
- Item 7 (IP through Vercel), 9, 16, 18 (edge + second client), 26-29 are human steps; item 1 still lacks the S11 (Neon) result.
- `docs/migration/wave/BRIEF.md` said the semver debug line has a `process.exit`; the bundle shows it is `process.env.NODE_DEBUG`. The allowlist covers that line and additionally reports the bluebird `process.exit` as REVIEW.
- `workerManifest.test.js` builds the real Worker app but deliberately does not assert that `sliceErrors` is empty or that any prefix beyond `/api/health` exists (mid-wave states must not turn the default suite red). A broken slice is reported by `npm run migration:manifest:worker` / `migration:parity` in `generator.sliceErrors` and as MISSING endpoints, not by Jest.
