# Slice `infra`: shared AI/infra services, v2 analyzers, config audit, health

Scope: `aiClient`, `aiCache`, `embeddings`, `onetLoader`, `apiResponse`, the 15 pure v2 analyzers, the `config.js` variable audit
and CORS origin, and `GET /api/health`. No routes are ported (the `infra` mount file stays the no-op it was). Nothing was deployed and no
real secret, database or provider was touched: every outbound call in tests is a stubbed `fetch`.

## What was ported

| Express | Worker (all under `backend/src/worker/`) | Registry key / access |
|---|---|---|
| `utils/aiClient.js` | `services/aiClient.js` (`createAiClient({ config, aiCache, sleep })`) | `getServices(c).aiClient.{callAI, extractJSON, isReasoningModel, modelForStructuredJson, getAICacheStats}` (same names and signatures; methods are closures) |
| `utils/aiCache.js` | `services/aiCache.js` (`AICache`, `createAiCache`, `getIsolateAiCache`) | `aiCache` (`get/set/getStats/clear/_hash`) |
| `utils/embeddings.js` | `services/embeddings.js` (`createEmbeddings({ config })`) | `embeddings.{embedText, cosineSimilarity, findTopSimilarChunks, chunkText}` |
| `services/taxonomy/onetLoader.js` | `services/taxonomy/onetLoader.js` + `services/taxonomy/occupations.json` | `onetLoader.{loadONET, findOccupation, getDomain}` |
| `utils/apiResponse.js` | `services/apiResponse.js` | `apiResponse.{ok, fail, badRequest, unauthorized, forbidden, notFound, serverError}` |
| `services/v2/*` except `resumeExportEngine` (15 files) | `services/v2/*.js`, byte-identical copies | the class itself under its camelCase name (`resumeAnalysisEngine.analyze(...)`, `actionVerbAnalyzer.getSuggestions(...)`, static fields included) |
| working-tree `/api/health` | `routes/health.js`, `lib/aiCacheStats.js` (placeholder replaced) | `GET /api/health` |
| `app.js` CORS list | `config.js` | dev origin `http://127.0.0.1:5173` added after `:5175`, as in the working tree |

Registry: 20 lines in `services/registry/infra.js` (aiCache, aiClient, embeddings, apiResponse, onetLoader + the 15 analyzers). `routes/mounts/infra.js` is unchanged (no routes).

### aiClient specifics (23 files depend on it)
Preserved exactly (each has a test, and 23 differential scenarios run the ORIGINAL module and the port through the same stubbed fetch and require equal results,
equal outbound requests and equal retry delays): provider selection (`AI_PROVIDER` anthropic/gemini need their key, else LM Studio), the three request/response shapes, timeouts
(Gemini 60 s, Anthropic 90 s, LM Studio 120 s via `AbortSignal.timeout`), `MOCK_AI === 'true'` (800 ms, canned text keyed on the prompt, provider and cache untouched),
cache lookup/store around the call with the original key, 3 attempts with 1000/2000 ms back-off and the "stop when the error text contains 400/401/403/422" rule, LM Studio reasoning-model
swap (`LM_STUDIO_MODEL_RESUME` > `_JOB` > `LM_STUDIO_MODEL` > mistral), the 1200 max-token cap, the merged-prompt retry on a 400 mentioning role/system/template, and the context-limit messages.
All config comes from `config.vars` at call time (a test proves an ambient environment is ignored). Per-purpose model names (`LM_STUDIO_MODEL_TUTOR`, ...) are read by the CALLERS from `config.vars`, as the Express routes did with the environment.
`fetch` is the global, called as a bare function (workerd throws "Illegal invocation" for method-style calls), so tests stub `globalThis.fetch`. `sleep` is an optional test seam; the default is a `setTimeout` promise, awaited inside the request.

## Per-isolate aiCache: documented hit-rate regression (ADR 4.5)
On Render one process owned one 500-entry cache. On Workers the cache is one isolate's memory: shared by every request that lands on that isolate (it lives in a lazily created isolate-level
variable, not in the per-request service container), but each isolate warms its own copy, isolates are recycled, and traffic is spread over many. Expect a much lower `aiCache.hitRate`
on `/api/health`, more provider calls, a higher AI bill and higher latency than Render. This is a cost/latency regression, not a correctness bug (a miss falls through to the provider).
Stats are per isolate too: `/api/health` shows the answering isolate only, and reads zeros on a cold isolate. Follow-up after cutover (not done, it would change behaviour): Workers KV or the Cache API. Test: `aiCache.test.js` ("two isolates do not share entries").

## Config audit result (`config.js`)
Re-derived from `backend/src/**` (working tree): 34 distinct variable names. All accounted for: 7 dedicated fields (`ACCESS_TOKEN_TTL`, `DATABASE_URL`, `FRONTEND_URL`, `JWT_SECRET`, `NODE_ENV`, `PORT`, `REFRESH_TOKEN_DAYS`),
21 in `PASSTHROUGH_VARS` (`ADZUNA_APP_ID/KEY`, `AI_PROVIDER`, `ANTHROPIC_API_KEY/MODEL`, `GEMINI_API_KEY/MODEL`, `LM_STUDIO_URL`, the 12 `LM_STUDIO_MODEL*` names incl. bare `LM_STUDIO_MODEL`, `MOCK_AI`), and the 6 `DB_*` names,
deliberately unneeded (node-postgres fallback in `config/database.js` only). **No `PASSTHROUGH_VARS` entry was missing; only a comment and the CORS origin changed in `config.js`.**
`tests/worker/infra/configAudit.test.js` re-derives the list at test time, so a variable added to Express later fails it until handled. It also pins the dev-origin list to the working-tree `app.js`, in order.
Provisioning reminder (orchestrator/user): the AI provider vars must exist as Worker vars/secrets for AI features to work (`AI_PROVIDER`, `GEMINI_API_KEY`/`ANTHROPIC_API_KEY` as secrets, model names), and
`LM_STUDIO_URL`, if used, must be reachable from the edge (the Express default `http://172.19.80.1:1234/v1` is a private LAN address and cannot work from a Worker). `MOCK_AI` must not be `true` in production.

## Health
`GET /api/health` = working-tree Express: awaits `SELECT 1` through the request db, any error becomes `db: 'unreachable'`, body `{status: 'ok'|'degraded', db, aiCache}` (that key order), always HTTP 200, still after `auditLogger` (each health call writes an audit row, as on Express).
`aiCache` is real (`lib/aiCacheStats.js` reads the request container's `aiCache`, falling back to the isolate cache if a custom container has none).

## Deviations forced by the platform / by the source-tree rules (behaviour unchanged)
1. `aiCache` per isolate (above).
2. `onetLoader`: the dynamic `require(path.join(__dirname, ...))` cannot bundle, so it is a static JSON require of `services/taxonomy/occupations.json`. That file is a **byte-for-byte copy** of `src/data/onet/occupations.json`,
   because `tests/worker/sourceTree.test.js` forbids relative imports outside `src/worker/`. A test fails if the copy drifts. If the orchestrator relaxes the lint for `src/data/*.json` (`mid2`'s `learningModules` needs `modules.json`/`questions.json` and currently trips that same rule), change the one `require` in `onetLoader.js` and delete the copy.
3. `apiResponse` helpers take the Hono context `c` instead of `res` and RETURN the Response (bodies and status codes identical, verified against the original with a recording fake `res`).
4. `embeddings`: `LM_STUDIO_URL` / `LM_STUDIO_MODEL_EMBED` were module-scope reads; now read from `config.vars` on each call, same defaults.
5. `Date.now()` on Workers only advances across I/O in production, so `resumeAnalysisEngine.analyze(...).processingTimeMs` will read ~0 there (the v2 files are verbatim). Cosmetic. (In local `wrangler dev` it read 13-18 ms, so this is unconfirmed for the deployed runtime.)
6. `aiCache` hashing keeps the synchronous `require('node:crypto').createHash` (the public API is synchronous). Works under `nodejs_compat` in local workerd (proved below).

## Pre-existing quirks preserved (not fixed)
- Retry stop rule is a regex over the whole error text (`/400|401|403|422/`): a 500 whose body text contains "400" is not retried, and a context-limit LM Studio error (no 4xx code) is retried 3 times.
- Cache key = system|user|maxTokens|temperature only: `model`, `structuredJson` and provider do not partition it, and it is shared by all users. Only a truthy `data` is stored.
- `AI_PROVIDER=anthropic|gemini` without its key silently falls back to LM Studio. The Gemini API key travels in the request URL query string.
- Mock mode: `userPrompt.toLowerCase()` throws on a non-string prompt; the `about` keyword matches any prompt containing it (checked after `summary`).
- `embedText` passes `timeout: 30000`, which `fetch` ignores (no real timeout). `findTopSimilarChunks` can throw on a string embedding that is not valid JSON.
- `/api/health` has no probe timeout and returns 200 even when degraded. `apiResponse.serverError` returns the error message in the body (this envelope never masks 5xx).
- `loadONET` is exported but called by nothing in the app (only by Express's own test).

## Existing tests edited (health/config only, as the brief allows)
`tests/worker/config.test.js` (dev origin list + describe label), `cors.test.js` (loop over the new origin), `app.test.js` (health block: new body, `SELECT 1`), `auditLogger.test.js` (one test: the fake db has no `SELECT 1`, so it answers it for the health assertion).

## Tests (`npx jest tests/worker/infra --coverage=false`: 9 files, 214 tests, all pass)
aiCache (13), aiClient (64, incl. 23 differential scenarios), embeddings (15), apiResponse (19), onetLoader (6), v2 (49: source identity + differential on 7 resume texts), health (11), configAudit (10), registry (27).
Also green with these changes: `app`, `config`, `cors`, `auditLogger`, `lib`, `routes` worker tests.

## Verification beyond Jest (all synthetic, local, processes killed afterwards)
- `wrangler deploy --dry-run` of a throwaway entry (`backend/.wrangler/tmp-infra/`, gitignored) bundles `createApp()` with the infra registry (1.0 MiB / 219 KiB gzip incl. other slices' current code). An esbuild bundle of the same entry contains no `initializeTables|runMigrations|ensureTables`, and no `process.env` read from our code (one hit is `semver` inside `jsonwebtoken`'s dependency tree).
- `wrangler dev --local` (workerd, port 8795, synthetic env, LM Studio replaced by a local Node stub on 8896): `callAI` end to end (real `fetch`, `AbortSignal.timeout`, `node:crypto` hashing): first call a provider hit, an identical second call `cached:true`, `/api/health` `aiCache` `{size:1, hits:1, misses:1, hitRate:50}`;
  `embedText` returned the stub vector; `resumeAnalysisEngine` + `onetLoader.findOccupation` (JSON require) worked; `MOCK_AI=true` took ~0.8 s and made no fetch; health with a dead synthetic `DATABASE_URL` returned `{"status":"degraded","db":"unreachable",...}` with HTTP 200 (real Neon driver failing against `127.0.0.1:1`);
  `Origin: http://127.0.0.1:5173` got `Access-Control-Allow-Origin` in development mode, an unknown origin got the 500 the Express CORS error path produces.
- Worker manifest generator: `/api/health` is public (`auth:false`, no `minTier`), no slice errors.

## NOT verified
Real Gemini/Anthropic/LM Studio responses and error bodies; the deployed (not local) runtime, including CPU limits and `Date.now()` behaviour; a real Neon `SELECT 1` and how long an unreachable Neon takes to fail (no probe timeout, same as Express);
the actual production hit rate; that `LM_STUDIO_URL` values used in prod are reachable from Cloudflare; any header-level (ETag/charset) differential for JSON responses.
