# Slice `large1` - notes

Ported from Express at git HEAD `38d8130a` (none of the three files has uncommitted edits). Render is untouched.
Scope: routes `community`, `projectBuilder`, `courses` (wave 3F, the highest `requirePlan` density in the port).

## What was ported

| Route file | Mount (Express `app.js` #) | Endpoints | Guards (identical to the manifest) |
|---|---|---|---|
| `routes/projectBuilder.js` | `/api/project-builder` (31) | `POST /generate`, `POST /readme`, `POST /deployment`, `GET /workspace`, `POST /workspace`, `PUT /workspace/:id`, `GET /templates` | `authenticateToken`, `requirePlan(1)` on all 7 |
| `routes/courses.js` | `/api/courses` (33) | `GET /`, `GET /progress`, `GET /paths`, `GET /paths/:id`, `GET /:id`, `POST /:id/enroll`, `POST /:id/progress` (registered in the Express order, literals before `/:id`) | `authenticateToken`, `requirePlan(1)` on all 7 |
| `routes/community.js` | `/api/community` (35) | forums: `GET /forums`, `GET /forums/:category`, `GET /forums/thread/:id`, `POST /forums/thread`, `POST /forums/thread/:id/reply`, `POST /forums/thread/:id/vote`; `GET /groups`, `POST /groups`, `GET /events`, `GET /leaderboard`; `POST /communication/practice`, `POST /communication/email` | `authenticateToken` + `requirePlan(1)` on the 10 community endpoints, `requirePlan(2)` on the 2 communication endpoints |

26 endpoints, matching the 26 large1 endpoints (12 + 7 + 7) in `docs/migration/manifest.render.json`. Every one is gated
(tier 1: 24, tier 2: 2). Wiring: `routes/mounts/large1.js` (3 `mountRoutes` calls in Express order), written last.
No services were ported (the slice owns none) and `services/registry/large1.js` is untouched (still `{}`): the routes use the
infra-owned `aiClient` registry entry through `getServices(c).aiClient`.

Method: the large constant blocks (fallback data, prompts, fallback generators, templates) were copied programmatically from
the Express files, and the handler bodies were transcribed mechanically (`res.json(x)` -> `return c.json(x)`, `req.*` -> `getBody/getQuery/c.req.param`,
`pool` -> `getDb(c)`). SQL text, parameters, validation order, messages and status codes are unchanged.

## Verification performed (all run; results in the final report)

* `tests/worker/large1/manifest.test.js`: loads `docs/migration/manifest.render.json`, mounts only these routers at the manifest's
  prefixes in a mini-app, introspects with `listRoutes(app)`, and asserts per endpoint: presence (no extra, none missing),
  `auth`, `admin`/`roles` (none), `minTier`, guard names and order, no untagged middleware, and registration order within each router.
  It also runs an entitlement matrix over **all 26 endpoints** with the real `authenticateToken` + `requirePlan` + `planService`
  (fake db): 401 without a token, 403 `PLAN_UPGRADE_REQUIRED` with the exact body below the threshold (no plan; plan 1 for tier 2), the gate
  passes at the threshold and above, and the fail-closed cases (planService error -> 500, unverifiable `tier_level` -> 500, handler never runs).
* `node scripts/migration/generate-worker-manifest.js --only-prefix /api/community --only-prefix /api/project-builder --only-prefix /api/courses`
  followed by `compare-manifests.js manifest.render.json <that> --only-prefix ...`: 26 vs 26, `RESULT: PASS (critical=0 error=0 warn=0 info=0)`.
* `tests/worker/large1/differential.test.js`: the real Express routers (only their dependencies mocked: pool, auth/plan middleware, `callAI`)
  and the Worker ports are driven with 130+ identical requests over the same scripted db, and must agree on status, JSON body, the exact SQL
  and bound parameters, the arguments passed to `callAI`, and the console.error / console.warn messages. Includes truly bodyless requests over a raw
  socket against Express itself.
* Per-file suites (`community`, `projectBuilder`, `courses`), `aiClientIntegration.test.js` (the routes against the REAL infra `aiClient` service with only
  `fetch` stubbed), `mount.test.js`.
* Bundle: throwaway entry + `wrangler deploy --dry-run` (build OK, 971 KiB / 207 KiB gzip for createApp + this slice + the other slices' aggregator);
  the bundle contains none of `ensureTables`, `initializeTables`, `runMigrations` nor any of the `CREATE TABLE` bootstrap text.
* workerd smoke (`wrangler dev --local`, own tmp config, port 8817, in-memory db and stub ai injected through `createApp` hooks, synthetic JWT secret,
  processes stopped afterwards): 401, tier-2 endpoint as a tier-1 user -> 403 with the exact body, fallback course data, `POST /forums/thread` insert path,
  course progress write path, a bodyless POST -> masked 500, security headers present.

## Deviations (each platform-forced or behaviour-neutral)

1. **Table bootstrap not ported (ADR 6.5).** Each Express file ran an IIFE at module load that issued `CREATE TABLE IF NOT EXISTS`
   (`community_threads`, `community_replies`, `community_votes`, `study_groups`, `community_events`; `project_workspace`; `courses`,
   `course_enrollments`, `learning_paths`, `learning_streaks`). None of it is in the Worker; the tables must already exist (Render's
   boot created them). Reads keep their existing fallbacks to built-in data when a table is missing; `POST /workspace` would 500.
2. **`process.env.LM_STUDIO_MODEL_PROJECT || process.env.LM_STUDIO_MODEL`** (read per request in Express) -> `config.vars.*` via `getConfig(c)`, read per
   request. Both names are already in `PASSTHROUGH_VARS`.
3. **AI through `getServices(c).aiClient.callAI / .extractJSON`** (infra contract), called as methods on the service object. If the registry has no
   `aiClient` entry the projectBuilder AI routes return their own 500 (`Failed to generate ...`) and the community communication routes silently
   fall back (they always do anyway, see bug 1). The registry entry exists today (`services/registry/infra.js`).
4. **courses.js**: Express wrapped every handler in try/catch -> `next(err)`; here exceptions just propagate to `app.onError`, which renders the identical
   masked 500 and log line. The Hono context parameter is named `ctx` there (the handlers use `c` as the loop variable for a course in many closures).
5. **Malformed percent-escapes in path params** (`/api/community/forums/%E0%A4%A`, `/api/courses/%E0%A4%A`, `/api/project-builder/workspace/%E0%A4%A`).
   Express 5 rejects them in the router with 400 `{"error":"Failed to decode param '...'"}` (before `authenticateToken`, so also unauthenticated). Hono's
   `c.req.param()` returns the raw string and the handler runs (verified with a small Node comparison). Not replicated here; it is a cross-cutting router
   concern (same finding as leaf1) and the raw string is only ever bound as a SQL parameter or passed to `Number()`.
6. Known platform differences from the README: JSON `Content-Type` has no `charset`, no weak `ETag`, routing is case-sensitive (`/api/Courses` matches on Express).

## Preserved pre-existing bugs (documented, not fixed - ADR 4.3)

1. **`POST /api/community/communication/practice` and `/communication/email` never use the AI's answer.** The handlers pass `callAI`'s whole result
   (`{ ok, data, error }`) to `extractJSON`, which throws (`text.match is not a function`), so the `catch` always returns the canned fallback feedback.
   The provider is still called on every request (cost and latency for nothing) and `Communication practice AI error: text.match is not a function` is logged.
   The port keeps that exact call shape; tests pin it (unit, differential and against the real infra `aiClient`). If infra ever changes `extractJSON` to
   tolerate objects, this behaviour changes.
2. `GET /forums/:category` looks the `sort` value up on a plain object, so `sort=constructor` splices the text of the `Object` function into the SQL `ORDER BY`
   (it is a syntax error, swallowed into the fallback list; not injectable because the value is never user text).
3. Community and courses answer with **fabricated fallback data** when the tables are empty or missing (fake threads, groups, events; the leaderboard is always
   static). The vote endpoint swallows database errors and answers `{ "success": true }`. Vote row and vote count are separate statements (not atomic; the
   `UNIQUE(user_id, thread_id, reply_id)` with a NULL `reply_id` never conflicts).
4. `GET /courses/:id` overwrites the course's `enrolled` (an enrolment count in the data) with a boolean.
5. `POST /courses/:id/progress`: `completed` falsy or omitted REMOVES the lesson; auto-enrol `INSERT` has no `ON CONFLICT` (two concurrent first requests -> unique
   violation -> 500); streak read-modify-write is not atomic; non-numeric `?page=` gives `NaN` (JSON `null`) pagination.
6. `PUT /project-builder/workspace/:id` and the other writes do not validate field types; a non-numeric `:id` reaches the db and yields the handler's 500 text.
   `readme`/`deployment` interpolate unvalidated `projectPlan` fields into the AI prompt.
7. Missing JSON body: Express 5 leaves `req.body` undefined, so destructuring throws (masked 500 in community/courses, the handler's own 500 text in the
   try/catch handlers of projectBuilder). Preserved through `getBody(c)`; a request WITH `Content-Length: 0` gets `{}` and the 400 validation messages, on both.

## Not verified / limits

* SQL against a real Postgres/Neon: only a scripted in-memory db was used. Not checked: jsonb parameter binding of `JSON.stringify(...)` strings, `ON CONFLICT`,
  `COUNT(*)` bigint-as-string and REAL/DATE result shapes through `@neondatabase/serverless`, request-scoped pool release, connection limits, Workers CPU limits.
* Real AI providers (only `fetch` stubs and the fake/real-with-stub `aiClient`), real production JWTs, the real Vercel proxy chain, rate limiting.
* The workerd smoke used an in-memory db (no Neon). "Green" here means ported logic and wiring agree with Express under the scripted cases.
