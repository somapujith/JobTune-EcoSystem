# Cloudflare Workers Migration Plan

Status: **build pipeline connected and passing config validation; app itself still a stub.** The `backend/` project is connected to Cloudflare Workers via **Cloudflare's native Git integration** (Workers & Pages → project → Settings → Build). It deploys automatically on push, using `backend/wrangler.toml` as the config source. What's actually served right now is `backend/src/worker-entry.js`, a stub returning `501` for every request — the real Express app has not been ported. This doc is the porting plan, written against the backend as of 2026-09-14.

## Deploy mechanism

- **Live path:** Cloudflare's Git integration, configured entirely in the Cloudflare dashboard (Build command: none, Deploy command: `npx wrangler deploy`, Root directory: `/backend`). No `CLOUDFLARE_API_TOKEN` or GitHub secret is involved in this path — Cloudflare's own GitHub App has repo access and builds/deploys directly.
- A GitHub Actions–based deploy (`wrangler-action` + a `CLOUDFLARE_API_TOKEN` repo secret) was scaffolded and then removed to avoid two competing deploy paths — Cloudflare's Git integration is the one actually in use. If a CI-gated deploy (tests/lint before deploy) is wanted later, re-add that workflow *and* disconnect the native Git integration first, rather than running both.
- `wrangler` is pinned as a `devDependency` in `backend/package.json` (`4.131.2`, matching what Cloudflare's build environment resolved) so local `npx wrangler` and CI use the same version.
- **Project identity matters and must match exactly:** the Cloudflare Workers project name (`jobtune-ecosystem`) and `account_id` (`af2854d5e1c39fde573717202a1deb36`) in `wrangler.toml` must match the actual connected Cloudflare project — an earlier attempt used a different, incorrect `account_id`/project name pair copied from a mismatched dashboard session, and the build failed hard with `The account_id in your wrangler.toml file must match the account_id for this account`. If a future deploy fails the same way, re-check both values against the Cloudflare dashboard's Workers & Pages overview for this exact project before assuming it's a code problem.
- Deployed URL: `jobtune-ecosystem.somapujith.workers.dev`.

## Why this isn't a drop-in deploy

Cloudflare Workers runs on V8 isolates, not Node.js. There's no filesystem, no raw TCP sockets, no native addons, and no long-running process — every request gets a `fetch(request, env, ctx)` handler instead of `app.listen()`. `nodejs_compat` (enabled in `wrangler.toml`) polyfills a good chunk of the Node API surface, but it does not make native addons or TCP-based DB drivers work.

Concretely, in this codebase today:

| Concern | Current implementation | Workers-compatible? |
|---|---|---|
| HTTP framework | Express 5 (`src/app.js`, `app.listen()`) | No — needs a Workers-native router (Hono recommended — Express-like API, built for Workers) or hand-rolled `fetch` routing |
| Database driver | `pg` ([config/database.js](../backend/src/config/database.js)) — raw TCP `Pool` | No — swap to [`@neondatabase/serverless`](https://github.com/neondatabase/serverless), which speaks HTTP/WebSocket. Since the DB is already Neon, this is a driver swap, not a DB migration |
| Password hashing | `bcrypt` (native addon) — used in [routes/auth.js](../backend/src/routes/auth.js), [services/sessionService.js](../backend/src/services/sessionService.js) | No — swap to `bcryptjs` (pure JS, same API) or rewrite on Workers' native `crypto.subtle` (PBKDF2/scrypt) |
| File uploads | `multer` — used in [routes/atsCheckerV2.js](../backend/src/routes/atsCheckerV2.js), [routes/resume.js](../backend/src/routes/resume.js), [routes/resumeV2.js](../backend/src/routes/resumeV2.js) | No — replace with the Web `Request.formData()` API, which Workers supports natively |
| PDF/DOCX generation & parsing | `pdfkit`, `docx`, `mammoth`, `jszip`, `unzipper`, `xml2js` — used across [routes/resume.js](../backend/src/routes/resume.js), [routes/resumeV2.js](../backend/src/routes/resumeV2.js), [services/resumeExport.js](../backend/src/services/resumeExport.js), [services/v2/resumeExportEngine.js](../backend/src/services/v2/resumeExportEngine.js), [utils/fileParser.js](../backend/src/utils/fileParser.js) | Unverified, mixed risk — some are pure-JS and may work under `nodejs_compat`; others may rely on Node `Buffer`/`stream` internals that behave differently. Needs per-package testing, not an assumption either way |
| SSR frontend serving | `fs.readFileSync` / dynamic `import()` of a built bundle — [ssr/setupFrontend.js](../backend/src/ssr/setupFrontend.js) | No — Workers has no filesystem. Needs Cloudflare's Assets binding (static files) and a different way to invoke the SSR render function (no dynamic `import()` from disk) |
| Admin static bundle | `express.static('public/admin')` — [app.js:94](../backend/src/app.js) | No — same fix as above, via Assets binding |
| JWT signing | `jsonwebtoken` | Likely fine under `nodejs_compat`, but worth confirming — Workers' native `crypto.subtle` is the lower-risk alternative if issues surface |
| Logging | `winston` (console transport only — no file transport found in this codebase) | Likely fine — no filesystem writes detected, just console output |
| Outbound HTTP | `axios` (Adzuna API, LM Studio, Anthropic SDK) | Fine — Workers supports `fetch` natively; `axios` itself should work under `nodejs_compat`, or these call sites could move to native `fetch` to drop the dependency |

## Porting plan (suggested order)

1. **✅ Done — DB driver.** [config/database.worker.js](../backend/src/config/database.worker.js) wraps `@neondatabase/serverless`'s `Pool` (API-compatible with `pg`'s `.query()`, so ported routes' query calls don't need to change) behind a `getPool(env)` function — Workers has no `process.env`, so the connection string comes from the `env` object passed into `fetch(request, env, ctx)` instead. Smoke-tested against the live Neon DB (`SELECT COUNT(*) FROM users` returned the correct count). **Kept as a separate file from [config/database.js](../backend/src/config/database.js) on purpose** — the live Express app still uses `pg`/`database.js` unchanged and untouched; route files should only import `database.worker.js` once they're actually being ported, module by module, not as a blanket swap.
2. **Pick and wire a Workers-native router.** Hono is the closest match to Express's `app.use('/api/x', router)` mounting style already used in [app.js](../backend/src/app.js) — minimizes the diff across all ~28 route files.
3. **Replace `bcrypt` with `bcryptjs`** in [routes/auth.js](../backend/src/routes/auth.js) and [services/sessionService.js](../backend/src/services/sessionService.js) — same API, drop-in.
4. **Rewrite file-upload handling** (3 route files) from `multer` middleware to `await request.formData()`.
5. **Test each document-processing dependency in isolation** under `nodejs_compat` (`pdfkit`, `docx`, `mammoth`, `jszip`, `unzipper`, `xml2js`) before porting the routes that use them — if any fail, the fallback is Cloudflare's Node.js-compatible container product (see "Alternative" below) for just that route, or re-implementing the specific operation.
6. **Move SSR + admin static serving to Cloudflare Assets.** This is the most involved piece — `setupFrontend.js`'s `fs`/dynamic-`import()` pattern needs a real rewrite, not a swap.
7. **Port route files module by module**, using the module docs in [docs/modules/](modules/) as the checklist of what each route actually does — verify plan-gating (`requirePlan`) and auth middleware behavior are preserved, since those are security-relevant.
8. **Move all secrets out of `.env` into `wrangler secret put`** — `JWT_SECRET`, `DATABASE_URL`, `ADZUNA_APP_KEY`, `LM_STUDIO_URL`, etc. Workers doesn't read `.env` files at runtime.
9. **End-to-end test every module** against the deployed Worker before cutting traffic over — pay particular attention to the known existing bugs listed in [docs/README.md](README.md#cross-module-findings-from-code-not-speculation), since porting is a good opportunity to fix them but a bad time to accidentally mask or change their behavior unintentionally.

## Alternative worth considering

If the document-generation dependencies (step 5) turn out to be broadly incompatible, Cloudflare also offers container-based deployment products for full Node.js workloads, which would let you keep Express/`pg`/`bcrypt`/`multer` entirely as-is and get Cloudflare's edge network without a runtime rewrite. Worth a cost/complexity comparison against the full Workers port before committing to this plan — ask if you want that comparison done before starting.

## Files added so far (scaffolding only)

- [backend/wrangler.toml](../backend/wrangler.toml) — Workers project config; `account_id` set, secrets left unset (must be added via `wrangler secret put` or the Cloudflare dashboard's Variables & Secrets UI, not this file)
- [backend/src/worker-entry.js](../backend/src/worker-entry.js) — stub `fetch` handler, returns `501` — not wired to any real route yet, and is what's currently live on the deployed Worker
