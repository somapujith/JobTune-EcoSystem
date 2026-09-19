# src/worker: the Cloudflare Worker port of the JobTune API

Parallel copy of the Express backend, built for Cloudflare Workers with Hono.
Governing document: `docs/migration/ADR-001-cloudflare-workers-port.md` (read sections 4, 6, 7 and 10).

**Render (Express, `src/app.js` + `src/server.js`) is untouched and stays authoritative.** Nothing under
`src/worker/` is imported by the Express app, and nothing here imports the Express-side middleware, services or
routes it was ported from (`tests/worker/sourceTree.test.js` enforces this). The only shared file is
`src/config/database.worker.js`, used by `db.js`.

Status: **all 41 Express route files are ported** (184 endpoints incl. `/api/health`; the Worker manifest matches the
Render reference manifest with zero differences, `npm run migration:parity`). Nothing has been deployed by this work
and no production traffic reaches the Worker. Slice notes (deviations, preserved bugs, unverified items) are in
`docs/migration/wave/*.md`; the verification plan is `docs/migration/verification-runbook.md`.

**How slices are wired:** each porting slice owns `services/registry/<slice>.js` (service factories) and
`routes/mounts/<slice>.js` (router mounts), aggregated by `services/index.js` and `routes/mounts/index.js`.
`createApp()` mounts NO slices by default (unit tests see only what they mount); `src/worker-entry.js` calls
`createApp({ mountSlices: true })`.

## 1. Golden rules (every port follows these)

1. **No behaviour changes.** Preserve existing bugs; document them, fix them in a separate post-cutover PR (ADR 4.3).
2. **Fail closed on entitlements.** `requirePlan` is the pattern: any doubt is a 403/500, never `next()`.
3. **No ambient globals.** No `process.env`, `process.exit`, `fs`, `req.ip`, `req.connection`, no module-scope side
   effects. Config, db, services and client IP come from the Hono context. Enforced by a Jest test that greps the tree.
4. **No schema bootstrap.** The three boot-time DDL functions of the Express server are excluded from the Worker
   entirely (ADR 6.5). Also grep-enforced, and checked again on the built bundle.
5. **Every middleware you create is tagged** with `tagMiddleware()` so routes stay introspectable (section 6).
6. **Do not port `express-rate-limit`.** See `docs/migration/rate-limiting.md`.

## 2. Layout

```
src/worker-entry.js        the ONLY ES module (import app; export default { fetch }). Everything else is CommonJS.
src/worker/
  app.js                   createApp(opts): global middleware chain, onError, notFound, route mounting
  config.js                createConfig(env): frozen config, ConfigError, memoized per env identity
  db.js                    getDb(c), dbMiddleware, request-scoped Neon pool with waitUntil release
  lib/
    errors.js              ConfigError, HttpError
    tag.js                 tagMiddleware(fn, name, meta), getMiddlewareMeta(fn)
    routes.js              createRouter(), mountRoutes(app, prefix, router), listRoutes(app) (introspection)
    context.js             getConfig(c), getServices(c)
    http.js                getClientIp(c), getOriginalUrl(c), getQuery(c), getBody(c), safeWaitUntil(c, p)
    jwt.js                 sign / verify behind one seam (jsonwebtoken today, HS256 pinned, async API)
    password.js            hash / compare behind one seam (bcryptjs)
    upload.js              readUpload(c, {field, maxBytes, allowedMimeTypes}) = multer replacement
    aiCacheStats.js        real per-isolate aiCache stats for the health endpoint
  middleware/
    securityHeaders.js     helmet 8 default header set via Hono secureHeaders
    cors.js                dynamic origin allowlist from config
    bodyParser.js          express.json / express.urlencoded (1 MB) -> c.get('body')
    requestContext.js      configMiddleware, servicesMiddleware
    auditLogger.js         auditLogger(action, resource)
    auth.js                authenticateToken
    requirePlan.js         requirePlan(minTier), TIER_NAMES
    rateLimit.js           apiRateLimit(), authRateLimit(): PLACEHOLDER seam, inert without a binding
    errorHandler.js        onError, notFoundHandler
  services/
    index.js               createServices({db, config}) + REGISTRY (add new services here)
    sessionService.js      createSessionService({db, config})
    planService.js         createPlanService({db})
  routes/
    health.js              GET /api/health (the only mounted route)
    _example.js            worked example, NOT mounted (copy it)
```

## 3. Conventions as implemented

### Config: `createConfig(env)`
* `env` is the Workers env binding. Returns a deeply frozen object or throws `ConfigError` (never exits).
  Validates `JWT_SECRET` is a string of at least 32 characters. Memoized in a `WeakMap` keyed by the `env` object
  (one computation per isolate; a failed validation is not cached).
* Fields: `nodeEnv`, `isDevelopment`, `jwtSecret`, `accessTokenTtl` (default `15m`), `refreshTokenDays`
  (default 7, clamped to 30), `databaseUrl`, `frontendUrl`, `serverPort`, `allowedOrigins`, and `vars`: the
  pass-through variables from ADR 4.1 (`AI_PROVIDER`, `LM_STUDIO_URL`, ...; see `PASSTHROUGH_VARS`).
  **To add config:** add a derived field in `config.js`, or add the name to `PASSTHROUGH_VARS` and read
  `config.vars.NAME`. Never read `env` anywhere else.
* The object contains secrets. Never log or serialize it (`toJSON` returns a redacted stub as a backstop).
* A `ConfigError` becomes a masked `500 {"error":"Internal Server Error"}` on every route (the message, which names the
  bad variable but never its value, is logged for operators).

### Context variables
| Variable | Set by | Content |
|---|---|---|
| `c.get('config')` | `configMiddleware` | frozen config |
| `c.get('db')` | `dbMiddleware` | request-scoped db (`query`, `connect`); use `getDb(c)` |
| `c.get('services')` | `servicesMiddleware` | lazy container: `sessionService`, `planService`; use `getServices(c)` |
| `c.get('user')` | `authenticateToken` | the decoded JWT claims exactly as Express had `req.user` (`id`, `sessionId`, `iat`, `exp`) |
| `c.get('clientIp')` | `authenticateToken` | `getClientIp(c)` at auth time |
| `c.get('userPlan')` | `requirePlan` | the `subscription_plans` row |
| `c.get('body')` | `bodyParser` | Express 5 `req.body` semantics; use `getBody(c)` |

Global middleware order: `securityHeaders -> configMiddleware -> cors -> dbMiddleware -> servicesMiddleware ->
bodyParser -> auditLogger('/api/*') -> apiRateLimit('/api/*') -> routes`. Per route: `authenticateToken -> requirePlan(n)`.

### Services are factories
`createSessionService({ db, config })`, `createPlanService({ db })`. Every method name, signature, return shape and
error code of the original is preserved (`ACCOUNT_IN_USE` with `activeSession`, the `sameDevice` IP comparison,
`markOrderPaid` compare-and-set). Methods are closures (safe to destructure).
**To add a service** (one line in `services/index.js`):
```js
const REGISTRY = {
  // ...
  activityService: ({ db }) => createActivityService({ db }),   // factory receives { db, config, services }
};
```
Then `const { activityService } = getServices(c)`. Services are built lazily, once per request. Tests override with
`createServices({ db, config, overrides: { planService: fake } })`. Route/service code never imports `pool`.

### Database
`getDb(c)` returns the request-scoped db. `dbMiddleware` creates it, and after the response hands `db.release()` to
`ctx.waitUntil`. `release()` first waits for every query still in flight (audit inserts, fire-and-forget touches),
then ends the Neon pool. So **background queries must go through `getDb(c)` / an injected service** to be waited on.
Always use `$n` parameters, never string interpolation.
**Unverified (ADR spike S11, checklist item 20):** that Neon actually frees connections promptly after `pool.end()`
inside a Worker, and that a per-request pool survives concurrent load. The release order is implemented and
unit-tested against a fake pool only.

### Client IP (security relevant, ADR 4.2)
`getClientIp(c)` returns the `CF-Connecting-IP` header (trimmed; `null` if absent, blank or over 45 chars).
It deliberately ignores `X-Forwarded-For`: on a direct `workers.dev` hit that header is client-controlled, and nothing
has proven what Vercel puts in it. Used by `auditLogger`, `authenticateToken` (`c.get('clientIp')`), the rate-limit
seam and (later) the auth routes' `getRequestMeta`.
**Known fail-open risk, must be verified empirically (ADR checklist item 7):** production traffic reaches the Worker
through Vercel's rewrite. If `CF-Connecting-IP` there is Vercel's egress IP, every user looks like the same device,
single-active-device enforcement silently stops blocking, and `audit_logs.ip_address` records Vercel IPs. Nothing in
this codebase can detect that; only a request through the real proxy chain can. Also note that on Render today
`req.ip` is the socket peer (no `trust proxy` is set), so whether Render's own behaviour is already coarse is worth
checking at the same time.

### Errors
`onError` reproduces `middleware/errorHandler.js`: `status = err.status || err.statusCode || 500`; 5xx is masked as
`{"error":"Internal Server Error"}` (message logged, stack logged only in development, never returned); 4xx returns
`{"error": err.message}`. **In handlers `throw` instead of `next(err)`**; do not catch-and-mask. Use `HttpError(status,
message)` for an error with a status. A status outside 200-599 is treated as 500.
Unknown routes get Express's default 404: `text/html` body `Cannot GET /path` (not JSON).

### JWT and passwords
Only `lib/jwt.js` may require `jsonwebtoken` and only `lib/password.js` may require `bcryptjs` (lint-enforced), so
swapping to `jose` (spike S9) or changing the hashing library is a one-file change. `jwt.sign/verify` are async and
HS256-pinned. **Not proven** (spikes S7/S9/S10, checklist items 8, 9): bcryptjs against real production hashes both
ways, and cross-verification of real Render-issued tokens. Pure-JS bcrypt at cost 10 is CPU heavy; check the Workers
CPU limit for the chosen plan.

## 4. How a route port looks

Copy `routes/_example.js`. It shows, tested in `tests/worker/exampleRoute.test.js`: DI'd service and db access,
`authenticateToken` + `requirePlan(n)` per route, query/params/body access, a multipart upload with size and mimetype
checks, and a binary `Response`.

Express -> Hono cheat sheet:

| Express | Worker |
|---|---|
| `const router = express.Router()` / `module.exports = router` | `const router = createRouter()` / `module.exports = router` |
| `app.use('/api/x', router)` | `mountRoutes(app, '/api/x', router)` in `app.js`, **same order as `backend/src/app.js`** |
| `router.use(authenticateToken, requireAdmin)` | `router.use('*', authenticateToken, requireAdmin)` **before** the routes it guards |
| `res.status(n).json(x)` / `res.json(x)` | `return c.json(x, n)` / `return c.json(x)` |
| `res.status(204).end()` | `return c.body(null, 204)` |
| `res.setHeader(...); res.send(buffer)` | `return new Response(buffer, { headers })` |
| `req.body` | `getBody(c)` (undefined when no JSON/urlencoded body, like Express 5) |
| `req.query` | `getQuery(c)` (querystring semantics; repeated keys are arrays) |
| `req.params.id` | `c.req.param('id')` |
| `req.headers['x']` | `c.req.header('x')` |
| `req.user` / `req.userPlan` | `c.get('user')` / `c.get('userPlan')` |
| `req.ip`, `req.connection.remoteAddress` | `getClientIp(c)` |
| `req.originalUrl` | `getOriginalUrl(c)` |
| `next(err)` | `throw err` |
| `pool.query(...)` | `getDb(c).query(...)`, or a service from `getServices(c)` |
| `process.env.X` | `getConfig(c)` / `c.get('config')` |
| `multer.single('f')` | `readUpload(c, {...})` (section 5) |
| `setTimeout`/floating promise after responding | `safeWaitUntil(c, promise)` |

Porting pitfalls (each has bitten ports like this before):
* **Return the Response.** A handler that calls `c.json(...)` without `return` produces an empty/404 response.
* **Order is behaviour.** Middleware and routers run in registration order; several Express files share a prefix
  (`/api/jobs` has five). Mount them in the Express order.
* **Auth before body.** In Express, `authenticateToken, requirePlan(n), upload.single(...)` authenticated before
  parsing the upload. Keep that order (`readUpload` reads the body only when called).
* `requirePlan(n)` numbers and `authenticateToken` presence must match Express exactly; the manifest diff checks it.
* Express routing is case-insensitive; Hono's is case-sensitive (trailing slashes are handled, `strict: false`).
* Express added a weak `ETag` and `charset=utf-8` on JSON; Hono does not. Client-visible effect is nil, but a
  header-level differential test will show it.

## 5. Uploads (multer replacement)

`readUpload` preserves multer's observable behaviour: not multipart or no file under the field returns `undefined`
(the route sends its own "No file uploaded" 400); the part's own content type is checked against the allowlist
(`Error('Invalid file type')`) before the size (`LIMIT_FILE_SIZE` / `File too large`). Both errors have **no `status`,
so they surface as masked 500 exactly as on Express** (multer errors reached `errorHandler` without a status).
Do not drop the allowlist or the cap (ADR 6.6, checklist item 25). Original limits: 5 MB
(`atsCheckerV2`), 10 MB (`resume`). `file.buffer` is a `Uint8Array`. The 1 MB body limit applies only to JSON and
urlencoded bodies, never to multipart.

## 6. Route introspection (for the Worker-side manifest extractor)

Goal: enumerate `{method, path, middleware names, auth, minTier}` from the live app so the Worker's gating can be
diffed against the manifest generated from Express source (ADR 6.3, T4.1, checklist items 5 and 6).

How it works:
1. Every middleware in `src/worker/` is created through `tagMiddleware(fn, name, meta)` (`lib/tag.js`), which sets a
   stable `fn.name` and a frozen metadata object under `Symbol.for('jobtune.worker.middleware.meta')`.
   `authenticateToken` is `{kind:'auth'}`; `requirePlan(2)` is named `requirePlan(2)` and tagged `{kind:'plan', minTier:2}`;
   `auditLogger('API_REQUEST', 'system')` is `{kind:'audit', action, resource}`; a future `requireAdmin` should be
   `{kind:'admin'}`.
2. `mountRoutes(app, prefix, router)` is the only sanctioned way to mount; it validates the prefix and records the
   mount (`listMounts(app)`).
3. `listRoutes(app)` (`lib/routes.js`) reads Hono's public `app.routes` (`[{method, path, handler}]` in registration
   order, mounted routers already flattened to full paths). For each terminal endpoint (a non-`ALL` entry; the last
   handler registered for that method+path) it computes, in execution order, the `use()` entries registered earlier whose
   path pattern matches (file-level guards, global middleware), then the route-level handlers before the terminal one.
   Result per endpoint: `{ method, path, handler, middleware: [{name, kind, minTier?, ...}], auth, minTier, untagged }`
   where `auth` is true if any middleware has `kind:'auth'`, and `minTier` is the highest `minTier` of `kind:'plan'`
   middleware (or `null`).
4. Untagged middleware are reported as `{kind:'untagged'}` and counted in `untagged`; a non-zero count is a review flag.
5. Rules that keep it exact: use `router.use('*', mw)` for file-level guards; never use `.all()` for terminal handlers;
   a `use` registered after a route does not guard it (matches Hono); call `listRoutes` on a freshly built
   `createApp()` (Hono freezes its router after the first match).

Example: `listRoutes(createApp())` today returns one endpoint, `GET /api/health`, with `auth:false, minTier:null`.
Covered by `tests/worker/routes.test.js` and `tests/worker/exampleRoute.test.js`.

## 7. Rate limiting

Not ported and **not enforced**. `middleware/rateLimit.js` is an inert seam that enforces only if a Workers Rate
Limiting binding named `API_LIMITER` / `AUTH_LIMITER` exists, and otherwise logs one warning per isolate. See
`docs/migration/rate-limiting.md` for the config, its limits (period can only be 10 or 60 s), and what must be verified.

## 8. Tests

`npx jest tests/worker --coverage=false` (from `backend/`). Helpers in `tests/worker/helpers/`: `harness.js`
(`makeHarness`, `makeEnv`, `signToken`, synthetic secret) and `fakeDb.js` (in-memory db that understands exactly the
statements the ported services issue and throws on anything else).

**What these tests prove:** the ported logic (branches, response shapes, status codes, fail-closed behaviour, IP
comparison, header set vs helmet, error masking, source-tree invariants) under Node, against fakes.
**What they do NOT prove** (ADR section 7, Phase 4 note: do not treat green Jest as migration evidence): SQL
correctness, Neon driver or connection behaviour, bcryptjs against production hashes, Render-issued tokens,
the Vercel proxy IP chain, real rate limiting, or anything specific to the Workers runtime. Runtime behaviour was
smoke-tested separately in local `wrangler dev` (workerd); the differential runner (T4.2) is the real gate.

## 9. Ported from (foundation: git HEAD 38d8130a; route slices: the Express working tree, which includes another session's uncommitted onboarding/health changes, see docs/migration/wave/*.md)

`src/app.js` (helmet/cors/parsers/health/order), `src/middleware/{auth,requirePlan,auditLogger,errorHandler}.js`,
`src/services/{sessionService,planService}.js`, `src/config/database.worker.js` (reused as is).

Intentionally not ported: the boot-time schema bootstrap (ADR 6.5), `requireOnboarding` (dead and broken, ADR 4.3.1),
`setupFrontend`/SSR (ADR 0.1), the unused `bcrypt` import in sessionService, and `express-rate-limit`. (`/admin` static and
`requireAdmin`/`requireRole` were ported with their routes as tagged `{kind:'admin'}` / role middleware.)
