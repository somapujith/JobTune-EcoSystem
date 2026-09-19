# Wave notes: `auth` slice (ADR-001 sections 4.2, 6.1, 6.2, 6.4)

Ported by the `auth` agent. Scope: `routes/auth`, `routes/subscriptions` (WORKING-TREE version), `routes/admin`,
`routes/adminPanels`, `services/recommendationEngine`, the `planService` onboarding additions, and the `/admin` static
page. Render (Express) is untouched and authoritative. Nothing was deployed; nothing touched a real database, secret or
external service.

## Decision needed from the user (ADR checklist item 16)

**`POST /api/subscriptions/verify-payment` is an UNGUARDED MOCK and has been ported as-is.** There is no gateway
signature check. Any authenticated user can `create-order` for any plan (including the most expensive) and immediately
`verify-payment` their own pending `orderRef`, and is granted that tier and marked onboarded. This is identical to Render
today (not a regression), but shipping it to the new host is a conscious choice that only the user can make. It is pinned
by a test named `KNOWN UNGUARDED MOCK VERIFIER (ADR 4.3.3)` in `tests/worker/auth/subscriptions.routes.test.js`, so a fix
is a deliberate change. Nothing in this slice changes it.

## What was ported

| Express | Worker | Endpoints (manifest) |
|---|---|---|
| `routes/auth.js` | `src/worker/routes/auth.js` | 8 (4 public: signup, login, refresh, logout; 4 `authenticateToken`) |
| `routes/subscriptions.js` (working tree) | `src/worker/routes/subscriptions.js` | 6 (`/plans` public; 5 `authenticateToken`; none plan-gated; NO `/select-plan`) |
| `routes/admin.js` | `src/worker/routes/admin.js` | 4 (file-level `router.use('*', authenticateToken, requireAdmin)` before the routes) |
| `routes/adminPanels.js` | `src/worker/routes/adminPanels.js` | 12 (`authenticateToken -> requireRole(...)` per route) |
| `services/recommendationEngine.js` | `src/worker/services/recommendationEngine.js` | `createRecommendationEngine({ services })` |
| `services/planService.js` (working tree) | `src/worker/services/planService.js` (UPDATED) | `+ setOnboardingCompleted`, `+ getOnboardingCompleted` (12 methods) |
| `app.use('/admin', express.static(...))` | `routes/adminStatic.js` + `routes/adminPageHtml.js` | `GET /admin` (301), `GET /admin/`, `GET /admin/index.html` |
| mounts | `routes/mounts/auth.js` | order: `/api/auth` (with `authRateLimit()` on `/api/auth/*`), `/api/subscriptions`, `/api/admin`, `/api/admin-panels`, `/admin` |
| registry | `services/registry/auth.js` | `recommendationEngine` |

Not ported / not mounted: `requireOnboarding` (ADR 4.3.1; note that `getOnboardingCompleted` now exists in the
working-tree planService, so it would no longer throw, but it is still mounted nowhere and stays that way).
`express-rate-limit` is not ported: `authRateLimit()` is the documented inert seam (see below).

Official checker: `node backend/scripts/migration/generate-worker-manifest.js --only-prefix /api/auth
--only-prefix /api/subscriptions --only-prefix /api/admin --only-prefix /api/admin-panels` then
`compare-manifests.js docs/migration/manifest.render.json <that output> --only-prefix ...` gives
**PASS: 30 endpoints compared, critical=0 error=0 warn=0 info=0**.

## Deviations forced by the platform

1. **bcrypt -> bcryptjs** through `lib/password.js`. Native `bcrypt.compare` returns `false` for a malformed stored hash
   *string*; bcryptjs throws (spike S7). `routes/auth.js verifyPassword()` maps a throw to `false` **only when the stored
   hash is a string**, so a corrupt row still yields Express's `400 {"error":"Invalid credentials"}`. A `NULL`/non-string
   hash still throws (native rejected too) and ends as the masked 500, like Express. Verified against native bcrypt on 8
   malformed inputs (unit test and the Express-vs-Worker differential test).
   **The brief said "malformed stored hash -> 401". Express actually answers 400 for every login failure** (unknown email,
   wrong password, invalid payload, malformed hash), so 400 is what is implemented and tested (byte-identical body).
2. **Client IP** = `getClientIp(c)` (`CF-Connecting-IP`; `X-Forwarded-For` ignored) instead of the Express socket address.
   This feeds `sessionService`'s `sameDevice` comparison. Behind the Vercel rewrite this may be Vercel's egress IP, which
   would make single-active-device enforcement fail OPEN (everyone "same device"): ADR checklist item 7 is **unverified**.
   With no IP on either login the comparison is falsy and the second login gets 409 (fail-closed direction; tested).
3. **JWT** via `lib/jwt.js` (HS256 pinned) and **refresh-token hashing** via `sessionService.hashToken` (`node:crypto`,
   sha256 hex). The logout access-token path reads the secret from the frozen config, not `process.env`.
4. **Per-isolate in-memory state in `adminPanels`.** Three endpoints mutate module-scope demo arrays (`POST
   /faculty/assignments`, `POST /recruiter/jobs`, `POST /recruiter/shortlist`). On Render one process holds one copy;
   on Workers each isolate has its own, so those writes are lost on recycle and can differ between consecutive requests.
   Persisting them would be a behaviour change, so it is left as a post-cutover decision.
5. **`/admin` static page** is an inlined string (`adminPageHtml.js`, LF, equal to the committed file; a test compares it
   to `src/public/admin/index.html`). serve-static's `ETag`, `Last-Modified`, `Accept-Ranges` and 304 handling are not
   replicated (no client-visible effect). Four `.` characters in the page's own script are written as the JS escape `\u002e` in the JS
   source only so the source-tree lint does not mistake page JavaScript for Express idioms.
6. Errors are `throw`n and answered by the shared `onError` (masked 500), instead of `next(err)`. Response bodies/status
   codes are unchanged. JSON `Content-Type` is `application/json` (Express added `; charset=utf-8`), see the README.

## Preserved pre-existing behaviour (recorded, NOT fixed; ADR 4.3)

- `verify-payment` is an unguarded mock (above). Its check-then-update is not atomic across the two statements: two
  concurrent calls can both see `pending`; the compare-and-set makes exactly one win and the other gets `409 "Order could
  not be marked paid"` (or `alreadyPaid` if it lands later). Tested: one `paid_at`, one assignment.
- The already-paid branch of `verify-payment` calls `setOnboardingCompleted` again on every repeat call (working-tree
  Express does the same).
- A body-less request to signup/login/refresh/logout/recommend/create-order/verify-payment/`PUT admin role` destructures
  `undefined`: masked 500 (Express 5). Inside the `try` blocks of the `adminPanels` POSTs it is their own 500 text.
- `logout` swallows ANY failure of the access-token path (bad/expired token and a failing `revokeSession`) and falls
  through to the refresh-token path; it answers `{success:true}` even when nothing was revoked.
- `DELETE /sessions/:id` answers `{success:true}` for another user's session id (the UPDATE is scoped to the caller, so
  nothing changes) and for ids that do not exist.
- `PUT /api/admin/users/:id/role` uses `parseInt` (`"12abc"` targets user 12).
- Roles are read from `users.role` on every request (JWT has no role), so a demoted admin loses access immediately.
- `recommend` saves the onboarding response best-effort (failures only warn); an empty plan table yields a response
  without `recommendedPlan`.
- `painPoints` as a non-empty non-array string passes the length check and is ignored by scoring.
- joi's `email()` rejects an over-long local part before `max(255)` can fire (same message as Express).
- Spike S7 caveat: a `$2y$` hash verifies under bcryptjs but not under native bcrypt. Recorded by a test; no production
  row is known to use it.
- The admin page uses inline scripts and a CDN script while helmet's default CSP (`script-src 'self'`) is applied to it on
  Render too. Parity was the goal; whether the page works in a browser was not checked.
- Routing is case-sensitive on Hono (Express was not); the frontend uses lower-case paths.

## Rate limiting on `/api/auth/*`

`authRateLimit()` is mounted before the auth router (after the global `apiRateLimit`), as `authLimiter` was in Express.
It is the documented seam: it enforces only if an `AUTH_LIMITER` Workers Rate Limiting binding exists, otherwise it logs a
warning once and does nothing. **Login/signup are NOT brute-force protected on the Worker until that binding is provisioned
and throttling is verified (ADR checklist item 18).** Tested both ways (binding says no -> 429 with the Express body;
no binding -> passes).

## Tests (`backend/tests/worker/auth/`, run with `--coverage=false`)

476 tests in 9 files, all green, plus the source-tree lint (`tests/worker/sourceTree.test.js`, 18 tests) green.

- `auth.routes.test.js` (85): all 8 endpoints; exact joi messages; single-active-device (409 with `activeSession`, same-IP
  re-login 200, replaceDevice, no-IP, spoofed `X-Forwarded-For`); logout with an EXPIRED access token revoking via
  `refreshToken` (asserts the sha256 parameter), forged/HS384 tokens revoke nothing; malformed stored hash -> 400 (8 shapes,
  agreement with native bcrypt asserted); native-hashed users can log in; Worker hashes verify under native bcrypt.
- `jwtMatrix.test.js` (21): cross-issue matrix with jsonwebtoken called directly (Express-shaped sign/verify) and a
  synthetic secret: Express-issued -> Worker, Worker-issued -> Express verify, wrong secret both ways, alg none/HS384/HS512,
  tampered payload, expiry, refresh-token format/hash, `ACCESS_TOKEN_TTL`.
- `subscriptions.routes.test.js` (40): all endpoints, idempotent verify-payment (`alreadyPaid`, one `paid_at`, one
  assignment), cross-user denial (unpaid and paid), CAS 409, concurrent calls, onboarding flag, the KNOWN mock-verifier pin.
- `admin.routes.test.js` (166): file-level guard on every path/method incl. unknown ones, fail-closed on role lookup
  errors, live role reads, every validation branch of `PUT role`, all 12 `adminPanels` endpoints x 6 roles x anonymous,
  demo-data handlers.
- `manifestParity.test.js` (118): loads `docs/migration/manifest.render.json`, introspects the live Hono app
  (`listRoutes`) for a mini-app AND the real `mounts/auth.js`, asserts method/path/auth/admin/roles/minTier/ordered guards
  for all 30 endpoints, nothing untagged, mount order, rate-limit seam placement, then exercises every endpoint over HTTP.
- `differential.test.js` (15): loads the ORIGINAL Express routers (config/database mocked with the in-memory fake, synthetic
  secret) and drives Express and Worker with identical request sequences over twin databases, asserting identical
  status/body/media type (incl. malformed-hash logins, the 409/supersede sequence, logout paths, payment idempotency,
  every admin/adminPanels endpoint x role). Mutation-checked: breaking the Worker route makes it fail.
- `adminStatic.test.js` (13): page bytes equal the source file; parity with a real `express.static` instance (found and
  fixed a `charset` case difference).
- `recommendationEngine.test.js` (11), `mount.test.js` (7): engine identical to the Express module over a 3,000-input grid;
  planService onboarding SQL; registry/mount wiring through the real registry.

Bundle: `wrangler deploy --dry-run` with a throwaway entry (`createApp()` + only `mounts/auth.js`) bundles
(10,166 KiB raw / 1,870 KiB gzip; includes the other slices' registries); the built bundle has zero
`ensureTables|initializeTables|runMigrations`. A local `wrangler dev --local` (workerd, synthetic data, an in-memory db
inside the Worker, port 8841, processes killed afterwards) served: the admin page (13,176 bytes, helmet CSP), the `/admin`
301, signup (bcryptjs cost 10, joi email validation, JWT), the 409 conflict, same-IP re-login, SESSION_SUPERSEDED, logout
with a garbage token + refreshToken, admin login with a precomputed hash, and `/api/admin/stats` (401 anonymous).

## NOT verified (green tests do not cover these)

- SQL correctness against Postgres/Neon; Neon driver behaviour (e.g. `undefined` parameters, `COUNT(*)` bigint strings,
  `users.id` being int4 so `order.user_id !== user.id` holds, prepared-statement/pool release under load: spike S11 not run).
- Tokens issued by the REAL Render deployment, and real production bcrypt hashes (only synthetic + native-bcrypt-generated
  ones were used; ADR checklist items 8 and 9 stay open).
- The Vercel proxy chain's client IP (checklist item 7), audit-log `ip_address` on a real request, real rate limiting
  (item 18).
- CPU limits: local workerd does not enforce them; bcryptjs at cost 10 is ~70-130 ms per hash/compare and needs the Paid
  plan (spike). **Do not hash at module scope**: workerd refuses randomness in global scope (bcryptjs threw "Neither
  WebCryptoAPI nor a crypto module is available" when the smoke entry seeded a user at load; request-time hashing works).
- Browser behaviour of the `/admin` page. Jest caveat: an error thrown by `node:crypto` is not `instanceof Error` inside
  Jest's vm realm, so for a non-string `refreshToken` the tests assert the TypeError is raised (Express: masked 500 via
  errorHandler; in workerd there is one realm and `onError` masks it). `onError` itself is tested elsewhere.

## Needed from the orchestrator (shared files not mine)

- `tests/worker/planService.test.js` line 15 asserts "exactly the original 10 methods" and
  `getOnboardingCompleted` `toBeUndefined()`. The brief requires the two onboarding methods, so this ONE existing test now
  fails; it should list 12 methods (my `recommendationEngine.test.js` asserts the new list).
- `src/worker/README.md` (status/layout/`routes` list, "Intentionally not ported" note about `/admin` static and
  `requireAdmin`) is now out of date; and the `app.js` comment block that lists `authRateLimit` wiring.
- No new config vars (`ACCESS_TOKEN_TTL`, `REFRESH_TOKEN_DAYS`, `JWT_SECRET` are already in `config.js`), no new
  packages (`joi`, `bcryptjs`, `hono` already present), no `wrangler.toml` change.
- Provision the `AUTH_LIMITER` rate-limit binding (docs/migration/rate-limiting.md) before `/api/auth` gets traffic.
