# Slice `leaf2` - notes

Ported from Express at git HEAD `38d8130a` (none of these files has uncommitted edits). Render is untouched.
Scope: routes `evidence`, `piiRedaction`, `activity`, `learningPath`, `studyHistory`; services `evidence/evidenceTracker`,
`pii/piiRedactor`, `activityService`, `learningPathService`, `srsService`, `studyHistoryService`.

## What was ported

| Route file | Mount (Express `app.js` #) | Endpoints | Guards (identical to `manifest.render.json`) |
|---|---|---|---|
| `routes/evidence.js` | `/api/evidence` (21) | `GET /report`, `GET /bullets` | `/report`: `authenticateToken`, `requirePlan(3)`; `/bullets`: `authenticateToken` only |
| `routes/piiRedaction.js` | `/api/pii` (22) | `POST /redact`, `POST /restore` | `authenticateToken` |
| `routes/activity.js` | `/api/activity` (38) | `POST /track`, `GET /heatmap`, `GET /weekly`, `GET /stats`, `GET /achievements`, `POST /check-achievements` | `authenticateToken` |
| `routes/studyHistory.js` | `/api/study-history` (39) | `GET /history`, `/stats`, `/weekly`; `POST /srs/decks`, `GET /srs/decks`, `GET /srs/due`, `POST /srs/review` | `authenticateToken`, `requirePlan(1)` on all 7 |
| `routes/learningPath.js` | `/api/learning-path` (41) | `GET /subjects`, `GET /:subject/streak`, `GET /:subject/:tier`, `GET /:subject/:tier/:slug`, `POST` and `DELETE /:subject/:tier/:slug/complete` | `authenticateToken` |

23 endpoints, matching the 23 leaf2 endpoints in the manifest (2 + 2 + 6 + 7 + 6). No local guards, so no `tagMiddleware` use in this slice.
Registration order inside each router is Express's; it matters for `learningPath` (`/:subject/streak` before `/:subject/:tier`).

| Service (registry key) | Shape | Notes |
|---|---|---|
| `evidenceTracker` | `createEvidenceTracker({ db, services })` -> `{ extractBullets, saveBullet, logUsage, getReuseReport, hashBullet, extractSkillsFromText, calculateDiversityScore }` | `saveBullet` calls `services.embeddings.embedText(text)` (infra slice), resolved at call time; `node:crypto` `createHash('sha256')` unchanged |
| `piiRedactor` | `createPiiRedactor()` -> `{ redact, restore }` | pure; body copied verbatim |
| `activityService` | `createActivityService({ db })` | singleton class -> closure factory, same 6 methods |
| `learningPathService` | `createLearningPathService({ db })` | the original's `this.touchStreak`/`this.getStreak` became closure calls (safe to destructure); also exports `validateTier`, `touchStreak` like the instance did |
| `srsService` | `createSrsService({ db })` | same 4 methods |
| `studyHistoryService` | `createStudyHistoryService({ db })` -> `{ saveSession, getHistory, getStats, getWeeklySummary }` | API identical to the Express singleton; **mid2 `routes/studyTools` consumes `getServices(c).studyHistoryService.saveSession(userId, {...})`**. A test asserts the method set equals the original's |

Wiring: `services/registry/leaf2.js` (6 lines) and `routes/mounts/leaf2.js` (5 `mountRoutes` calls in Express order), both written last.
SQL text is byte-identical to Express modulo whitespace; a differential test proves it (below).

## Deviations (each is platform-forced or behaviour-neutral)

1. **Response headers**: Hono sends `application/json` without `; charset=utf-8` and no weak `ETag` (README section 4, all routes).
2. **Malformed percent-escapes in path params** (`/api/learning-path/%E0%A4%A/streak`): Express 5 answers 400
   `{"error":"Failed to decode param '%E0%A4%A'"}` (from the router, before `authenticateToken`, so also for anonymous callers, verified against
   the Express app with mocked db/auth); Hono passes the raw string through and the request proceeds (200 in the probe). Only `learningPath` has
   params in this slice; the effect is benign (values are only ever bound as `$n` parameters). A global fix belongs in the foundation, not per route.
3. **Case-insensitive routing**: Express serves `/API/LEARNING-PATH/subjects`; Hono 404s (README known difference; verified in a probe).
4. `crypto` is required as `node:crypto` (as `sessionService` already does) instead of `crypto`. Spike S10 proved `createHash`/`randomBytes` in workerd.
5. `getServices(c)` is read inside the `try` in `evidence`/`activity`/`piiRedaction` handlers so a wiring error keeps the route's own 500 body;
   in the `next(err)` routes (`learningPath`, `studyHistory`) it is outside any try, so it becomes the masked global 500. Unobservable when wired correctly.

## Pre-existing behaviour preserved on purpose (ADR 4.3; do NOT fix during the port)

- **Error messages leak in `evidence`**: both 500 bodies include `details: err.message`, so a database error text reaches the client (also true on Render).
- **`GET /api/evidence/bullets?applicationId=`**: parsed with `parseInt(.., 10)` only when the raw value is truthy; `abc` -> `NaN` reaches the database (500 with details);
  `0` is a valid filter; repeated keys become an array whose `parseInt` uses the joined string ("1,2" -> 1).
- **Missing JSON body**: `pii/redact`, `pii/restore` and `activity/track` destructure the body inside their `try`, so no body is a caught `TypeError` -> the route's own 500
  (`Internal server error` / `Failed to track activity`), not a 400. `studyHistory` `srs/decks` and `srs/review` destructure unguarded -> masked global 500.
- **`pii/restore` ownership check** is strict `!==` between the row's integer `user_id` and the token's `id`: a token carrying a string id is 403. `redactionId: 0` passes the presence check (`== null`).
- **`piiRedactor.restore`** passes the stored original as the `String.replace` replacement string, so a stored value containing `$&`, `$1` or `$$` is mangled. `redact()` is a best-effort
  US-centric regex/name-list matcher (10-digit numbers, a 60-name list) with the usual false positives/negatives.
- **`activity/heatmap`**: `parseInt(months)` without radix; `0` and non-numeric fall back to 12 (falsy), then clamped to 1..24. `getStats`: `daily_goal = 0` falls back to 30.
- **`learning_streaks` has two incompatible shapes in the Express code**: `activityService` (and `dashboard`, `courses`) use `current, longest, daily_goal` (the table `courses.js`
  creates), while `learningPathService` and the boot-time table bootstrap use `subject, current_streak, longest_streak, last_active_date`. Whichever `CREATE TABLE IF NOT EXISTS`
  ran first in production decides which code path works, and `activityService` swallows the resulting errors and returns defaults / skips achievements. **Not checked: I have no
  database access.** The Worker port has the same behaviour as Render whichever shape exists.
- **Weekly activity / SRS scheduling use the runtime's local time then `toISOString()` (UTC)**: correct only when the runtime TZ is UTC. Workers is always UTC; Render's TZ is
  unverified (default UTC). The test suite therefore asserts weekly dates relative to what the service reports, not to fixed calendar dates.
- **`srsService`**: `saveDeck` builds one multi-row INSERT with 5 parameters per card and no cap (a very large deck exceeds Postgres' 65,535-parameter limit -> 500);
  `reviewCard` clamps but does not validate `quality` (a non-numeric string becomes `NaN`, skips the fail branch and flows into the UPDATE); `getDueCards` and `getHistory`
  `parseInt` their `limit`/`offset` and pass `NaN`/negatives to Postgres (500).
- **`learningPath`**: `markComplete` is two statements without a transaction (a failure of the streak upsert leaves the progress row written); `DELETE .../complete` on a
  never-completed topic still returns 200 with the current streak; `GET /:subject/streak` accepts any subject string.
- **`evidenceTracker.saveBullet` and `logUsage` have no callers** in the Express code (only `getReuseReport` is used, by `GET /api/evidence/report`), so nothing in the
  current backend populates `evidence_bullets`; the report is empty unless rows come from elsewhere. Also `tests/evidenceTracker.test.js` mocks `generateEmbedding`, which does
  not exist in `utils/embeddings` (it exports `embedText`): a fake-test/dead-code pair, like the `requireOnboarding` one in ADR 4.3.1.
- `pii/redact` stores the map and returns it to the client in the same response (plaintext PII round trip); `pii_redactions` rows are never deleted.

## Tests (`backend/tests/worker/leaf2/`, `npx jest tests/worker/leaf2 --coverage=false`: 8 suites, 397 tests, all passing)

| File | Tests | What it proves (against fakes) |
|---|---|---|
| `manifest.test.js` | 98 | mini-app (`createApp()` + only the five routers at the Express prefixes/order) vs `docs/migration/manifest.render.json` via `listRoutes(app)`: same endpoint set, same registration order, per endpoint `auth` / `minTier` / `admin` / `roles` / ordered guards, no untagged middleware; `app.js` itself is also grepped for the five mount lines. Mutation-checked: dropping `authenticateToken` or raising a `requirePlan` number fails it |
| `services.parity.test.js` | 93 | differential: the ORIGINAL Express services (pool/embeddings mocked) and the Worker factories run identical scenarios with identical scripted db responses; asserts identical SQL text (whitespace-normalised), identical bind parameters and order, identical results or error messages (incl. clock-frozen SM-2 and weekly logic, achievement branches, evidence corpus, PII corpus) |
| `evidence.routes.test.js` | 19 | 401; 403 `PLAN_UPGRADE_REQUIRED` shape with/without plan and at tiers 1, 2; 200 at 3; fail-closed 500 when the plan lookup errors; `bullets` not plan gated; happy paths, `applicationId` parsing quirks, error bodies with `details` |
| `piiRedaction.routes.test.js` | 30 | 401; validation 400s; redact -> restore round trip through a JSONB-like store; 403 other user; 404; strict id comparison; no-body 500; malformed JSON 400; db failure not leaked |
| `activity.routes.test.js` | 46 | 401 x6; not plan gated; `track` validation and defaults; `months` clamping table; weekly zero-fill; stats defaults when tables are missing; achievements unlock and persist |
| `learningPath.routes.test.js` | 43 | 401 x6; not plan gated; route order; tier validation (no db access); topic CRUD; streak logic across days/gaps/subjects/users; 404 paths write nothing; masked 500 |
| `studyHistory.routes.test.js` | 61 | 401 / 403 / 200-at-tier-1 for each of the 7 endpoints; fail-closed; history filters and pagination; full SRS flow (save -> decks -> due -> review, SM-2 intervals 1/6/15); every 400/404/500 path |
| `registry.test.js` | 7 | the six registry keys; services build through the real container; `evidenceTracker` uses `services.embeddings`; `studyHistoryService` keeps the mid2 API; `mount()` order; an end-to-end request through the real container + real `mount()` |

`tests/worker/sourceTree.test.js`: none of the leaf2 files is flagged (I avoided the forbidden tokens, comments included). At the time of the last run that suite still fails for OTHER slices' files
(`routes/atsExport.js`, `resume.js`, `resumeV2.js`, `services/docs/multipart.js` quote Express idioms in comments; `routes/learningModules.js` imports `../../data/*.json`): not mine.

Manifest checker: `node scripts/migration/generate-worker-manifest.js --only-prefix ...` (five prefixes, built with `mountSlices: true`, so through the real registry/mount files) -> 23 endpoints,
auth 23, plan-gated 8 (`{"1":7,"3":1}`); `compare-manifests.js` against `docs/migration/manifest.render.json` with the same `--only-prefix` flags: `RESULT: PASS (critical=0 error=0 warn=0)`.
(In Git Bash set `MSYS_NO_PATHCONV=1` or the `/api/...` arguments are rewritten to Windows paths.)

Bundle sanity: throwaway entry `backend/.wrangler/tmp-leaf2/` (`createApp()` + `routes/mounts/leaf2.js`) with the wrangler.toml aliases;
`wrangler deploy --dry-run` succeeded (1018 KiB / 218 KiB gzip for the whole app incl. other slices' registries); a separate esbuild bundle contains all six leaf2 factories and zero
occurrences of the three schema-bootstrap function names.

## NOT verified (green Jest proves ported logic against fakes only)

- **SQL against a real Postgres/Neon**: nothing ran a statement against a database (no access, by rule). The differential test proves the SQL text/params equal Express's, not that they are valid.
- **Driver type behaviour on Neon in workerd**: `DATE` columns arriving as `Date` objects vs strings (the code handles both for `daily_activity`, but `learning_streaks.last_active_date` and
  `srs_cards.next_review` are returned to clients as-is and would change shape if the driver differs from `pg`), `COUNT(*)` as strings, `JSONB` (`redaction_map`, `skills`, `metadata`) parsed to objects, `REAL` as numbers.
- **The runtime TZ of Render** (see the local-time note above).
- **`node:crypto` `createHash` for `evidenceTracker.hashBullet` inside workerd** (covered generally by spike S10; leaf2 code itself was only bundled, not run in workerd).
- **`services.embeddings`** (infra slice) did not exist when this was written; the contract used is `embedText(text)` returning an array (JSON-stringified into the INSERT). Only `saveBullet` needs it, and nothing calls `saveBullet` today.
- **Cost of `POST /api/activity/check-achievements`**: up to ~26 sequential queries on one request-scoped Neon pool (1 lookup + 11 checks + `profile_complete`'s 3 parallel + up to 11 inserts); whether that fits the Workers CPU/subrequest limits is untested.
- Behaviour under concurrent load / connection release (ADR S11, checklist item 20) is the foundation's open item and is not exercised here.
