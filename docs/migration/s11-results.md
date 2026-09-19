# S11 results: `@neondatabase/serverless` inside workerd, local Postgres (2026-09-20)

Covers ADR-001 section 5 (S11), section 6.5, and checklist items 1 (S11 part), 19/20 (connection handling). Spike code: `backend/spike/s11/`
and `backend/spike/auth/s11.mjs`. Nothing here touched Neon, Render, Supabase or any real `DATABASE_URL`.

## 1. What was actually run (and what was not)

| Layer | Local stand-in | Real Neon |
|---|---|---|
| Worker runtime | **real workerd** via `wrangler 4.131.2 dev --local`, compat date 2026-09-14 + `nodejs_compat` (same as production) | same runtime, but production adds edge behaviours workerd does not reproduce (see section 9, item 6) |
| Driver | **real `@neondatabase/serverless` 1.1.0**, the production `src/config/database.worker.js` -> `src/worker/db.js` path (incl. real `dbMiddleware` + `ctx.waitUntil`) | same package |
| WebSocket proxy | Neon's own open-source `wsproxy` (Docker), plain `ws://`, `pipelineConnect=false` | Neon's proprietary proxy at `wss://<host>/v2` |
| Database | Postgres 17.11, `max_connections=100`, SCRAM-SHA-256 | Neon compute (size-dependent `max_connections`) |
| Pooler | PgBouncer 1.25.2 `pool_mode=transaction`, `default_pool_size=20`, `max_prepared_statements=1000` | Neon's PgBouncer-based `-pooler` endpoint (settings not verified here) |

Local-only differences that matter when reading numbers: loopback latency (no WAN, no TLS), Windows host, host time zone leaks into workerd
(`getTimezoneOffset()` was -330 locally; production Workers are always UTC), and workerd keeps timers alive after the response (section 5).

## 2. Results per criterion

PASS = demonstrated in workerd against local Postgres. CANNOT-VERIFY-LOCALLY = needs a hosted Neon branch (section 9).

| # | Criterion (ADR) | Result | Evidence |
|---|---|---|---|
| S11a | `SELECT COUNT(*) FROM users` succeeds | **PASS** (local) | T1: `{"count":"3"}`, `.rows/.rowCount/.command/.fields` present. `count` is a **string** on both drivers |
| S11b | parameterized `$1` query works | **PASS** | T2 `SELECT $1::text, $2::int` returns `{echo:'hello-$1', n:42}` |
| 6.5 | `'; DROP TABLE users; --` as `$1` is a literal | **PASS** | T3: round-trips byte-exact, `WHERE email=$1` matches 0, `users` still exists, count unchanged (Node and workerd, direct and via PgBouncer) |
| S11c | multi-statement `CREATE TABLE IF NOT EXISTS` block succeeds | **PASS** (simple-query path) | T4c: 3 statements in one `query()` returned an array of 3 results (`CREATE, CREATE, INSERT`). T4: `CREATE TEMP TABLE ... ON COMMIT DROP; INSERT; SELECT` in ONE `query()` works (array of 3, last has the rows) |
| 6.5 | multi-statement WITH params | behaves like `pg` | T4b rejects: `cannot insert multiple commands into a prepared statement` [42601]. Same as node-postgres |
| 6.5 | `pool.query()` shape identical | **PASS** | keys/`command`/`rowCount`/`fields` identical to `pg`; only `pg` has an extra private `_prebuiltEmptyResultObject`. Multi-statement returns an ARRAY of results on both |
| 6.5 | boot DDL (`initializeTables`/`runMigrations`/`ensureTables`) absent from the Worker | not this spike | checklist item 19 is a bundle grep (owned elsewhere); the driver itself does accept multi-statement DDL, so absence is a policy choice, not a driver limit |
| 20 | per-request pool releases the server connection | **PASS** (local) | after `ctx.waitUntil(db.release())`, Postgres was back to baseline **1-24 ms after the last response** in every `end`/`waituntil` run (17 runs, N=10..130) |
| 20 | no exhaustion under concurrent load | **PARTIAL** | local PG (100 conns): 1 conn/request is safe to N~100; dashboard-shaped requests were NOT safe at the driver default (see 5). Fixed with `max:2`. Neon's real ceiling + pooler behaviour are unverified |
| 20 | forgotten teardown (`noend`) | **PASS locally, unverified for production** | connections dropped only at +10 s (pg-pool `idleTimeoutMillis`), i.e. local workerd kept the sockets open after the response |
| S11-x | module-level Pool | **FAILS as predicted** | request 1 ok; request 2 died with `Cannot perform I/O on behalf of a different request` and the runtime cancelled it (`code had hung`); request 3 ok on a new backend. Per-request pools never hit this |
| S11-x | failure handling (uncaught "Network connection lost") | **root cause found and fixed** | section 4 |
| item 1 | S11 green on **hosted Neon** | **CANNOT-VERIFY-LOCALLY** | section 9 |

Full T-list run: `node spike/s11/run-functional.mjs` -> `/s11 status=200 passed=11/11` (T1, T2, T3, T4, T4b, T4c, T5, T6, T7, T8, T9).

## 3. Driver vs `pg` (Node, same queries, `TZ=UTC` and `TZ=Asia/Calcutta`)

`node spike/s11/node-types.mjs` runs 31 expressions through the Neon Pool (WebSocket, wsproxy) and `pg` (TCP). **No differences** (except two separate
`now()` calls a millisecond apart), in both time zones. The Neon driver bundles the same `pg-types` parsers:

| SQL type | JS value (both drivers) | Worker code that depends on it |
|---|---|---|
| `COUNT(*)`, `SUM(int)`, `bigint`, `numeric`, `EXTRACT(EPOCH..)`, `AVG` | **string** | `aiCoach.js:351,363,375` (`parseInt(...count \|\| '0')`), `evidenceTracker.js:101,208-213`, `community.js:101` all `parseInt`; `activityService.js:162` uses `rows[0].count \|\| 0` unchanged from Express (`"0"` is truthy): identical on Express, so no new behaviour |
| `int4`, `float8`, `real`, `COUNT(*)::int` | number | none |
| `date` | `Date` at LOCAL midnight of the process (`2026-09-20` -> `...T00:00:00Z` in UTC, `...T18:30Z` the day before in IST) | `courses.js:616` (`streak.last_date` -> `toISOString().split('T')[0]`), `activityService.js:62,98`: correct only in UTC. **Production Workers are UTC** (Render is expected to be UTC too; not verified here), so fine; but `wrangler dev` on a non-UTC host shows a different day. Run local Worker tests with `TZ=UTC` |
| `timestamp` (no zone) | `Date`, interpreted in process TZ | same caveat (UTC in production) |
| `timestamptz` | `Date`, correct instant | none |
| `json`/`jsonb` | parsed object/array/scalar | none (no double-parse needed) |
| `bool`, `NULL`, `uuid`, `time`, `text[]`, `int[]` | boolean, null, string, string, array, array | none |
| `bigint[]` | array of **strings** | none found |
| `interval` | object `{days:1,hours:2}` | none found |

`pool.end()` semantics (`node spike/s11/node-functional.mjs`): resolves in ~0 ms for idle clients (Postgres connection closed within 200 ms);
**waits for checked-out clients** (pending after 500 ms, resolves 5 ms after `client.release()`), and **hangs forever if a client is never released**;
`query()`/`connect()` after `end()` reject `Cannot use a pool after calling end on the pool`; a second `end()` rejects `Called end on pool more than once`
(`db.js` never calls it twice). Default pool: `max 10`, `idleTimeoutMillis 10000`, `connectionTimeoutMillis 0` (wait forever).

## 4. The uncaught "Network connection lost": root cause and status

Reproduced in workerd through the real `db.js` + `dbMiddleware` + a Hono app with `app.onError` (route without a try/catch, database unreachable):
`X [ERROR] Uncaught Error: Network connection lost.` and wrangler's HTML error page (500), exactly as in `wave/mid1.md`.

**Root cause.** When the driver's WebSocket cannot connect (or drops), the query promise rejects with a bare **`ErrorEvent`**, not an `Error`
(`{type:'error', message:'Uncaught Error: Network connection lost.'}`, `instanceof Error === false`). **Hono's `compose` only sends `instanceof Error`
throws to `app.onError`** (`node_modules/hono/dist/compose.js:24`); anything else is rethrown, so `app.fetch()` itself rejects and the runtime shows its own error page.
The same failure inside `requirePlan` was masked only because that middleware has its own `try/catch` (which catches any value). It is NOT a pool `'error'` event.

Three other, distinct event paths were also measured (each with and without listeners, in Node and workerd; `node spike/s11/node-failure-scenario.mjs <scenario>` and `/s11/fail?scenario=...`):

| Situation | Emitted on | Without handler | Covered before this pass? |
|---|---|---|---|
| connect failure / unreachable proxy (`unreachable`) | the query promise rejects with a non-Error `ErrorEvent` | escapes Hono onError (above) | **NO: worker-entry.js guard yes (masked 500), `db.js` no** |
| in-flight query, backend killed (`inflight-kill`) | query promise rejects with a real Error (57P01) | none needed | yes |
| idle pooled client, backend/socket dropped (`idle-kill`) | **pool** `'error'` (57P01, or the ErrorEvent) | `Uncaught error: terminating connection...` (logged; request survived) | yes (`db.js` pool listener) |
| **checked-out client** (`db.connect()`, resumeChat's pattern), connection dies between two queries | **the client**, not the pool | `Uncaught Error: Unhandled error.` | **NO: real defect** |
| normal `pool.end()` and every query error (pg-pool discards the client) | pool `'error'` with an `ErrorEvent` "Network connection lost" ~4 ms after workerd's clean close (`ws close 1000 wasClean`) | with the listener: 4 false `db pool error` lines per `/s11` run | logged as errors (noise) |

`worker-entry.js` guard: proved to convert the escaped rejection into the masked 500 (`/s11/mw/rawthrow?guard=1` with the identical wrapper -> `{"error":"Internal Server Error"}`;
without it: HTML error page). It cannot cover events fired from WebSocket callbacks (idle pool, checked-out client): those are outside the `fetch()` promise, only listeners cover them.

**Fixes made** (`backend/src/worker/db.js`, tests in `backend/tests/worker/db.test.js`, 31 tests in that file, all pass):
1. `query()` and `connect()` rejections that are not `Error` are wrapped in an `Error` (message and `code` kept, original on `.cause`). After the fix the same route returns the masked `{"error":"Internal Server Error"}` (workerd, verified).
2. `connect()` attaches a client `'error'` listener (message-only log) to the checked-out client. After the fix `dbjs-checkedout-kill` logs `db client error: ...` and nothing is uncaught (workerd, verified).
3. Errors that arrive after `release()` started are dropped silently (teardown noise); before that, a non-Error event logs at `warn`, a real Error at `error`. `/s11` went from 4 error lines to 2 warnings (the two deliberate query-error client discards).
4. Not a bug but recorded: `pool.end()` never resolves while a client is checked out and unreleased. `db.js` cannot force it; `resumeChat.js` releases in `finally`, so a hung embedding job holds the pool until the `waitUntil` budget ends. Prefer `db.hold()` over `db.connect()`.

## 5. Connection lifecycle and load (checklist 20), local Postgres (`max_connections=100`)

Each row: N parallel HTTP requests to the workerd endpoint, one per-request db each (`SELECT pg_sleep(1)`), Postgres sampled every 20 ms
(`node spike/s11/load.mjs`). "release ms" = time from the last response until the server connection count is back to baseline.

| Case | ok/N | conns/request | baseline -> peak | p50/p95 ms | release ms |
|---|---|---|---|---|---|
| `waituntil` (production: `dbMiddleware` -> `ctx.waitUntil`) N=20 / 50 | 20/20, 50/50 | 1 | 0 -> 20 / 50 | 1540 / 1924 | 13 / 4 |
| `end` (await `db.release()`) N=20 / 50 | 20/20, 50/50 | 1 | 0 -> 20 / 50 | 1816 / 1952 | 2 / 5 |
| `noend` (never released) N=20 / 50 | 20/20, 50/50 | 1 | 0 -> 20 / 50 | 1796 / 1920 | **10 000 / 10 019** (idle timeout, not release) |
| 1 conn/request, exhaustion sweep N=80, 95, 100 | all ok | 1 | peak 52, 94, 95 | 2370 / 3395 / 3570 | 6 / 4 / 13 |
| same, N=110, 130 | 106/110, 112/130 | 1 | peak 99 | ~3600 | `sorry, too many clients already` x4, x18 |
| **4 parallel queries/request, driver default (max 10)** N=10 | 10/10 | **4** | 0 -> 40 | 2073 | 9 |
| **8 parallel queries/request (dashboard.js), default max 10** N=12 / 14 / 16 | 12/12, 9/14, 9/16 | **8** | 0 -> 96 / 99 / 99 | ~2600 | 7 at N=12. N=14/16 read 10 000 only because the spike route skips `release()` on its error path (`too many clients` x5, x7); production `dbMiddleware` always releases |
| 8 parallel, **production config (max 2)** N=14 / 40 | 14/14, 40/40 | **2** | 0 -> 28 / 77 | 1881 / 2116 | 2 / 6 |
| same, N=55 / 60 | 49/55, 46/60 | 2 | 0 -> 99 | ~3200-3800 | `too many clients` x6, x14 |
| via PgBouncer (txn mode, pool 20): N=50 / 130 / 200 (`waituntil`) | 50/50, 130/130, 200/200 | (server conns capped) | 20 -> 20 | 2287 / 4787 / 6483 | 20 / 19 / 15 |
| via PgBouncer, 8 parallel, N=40 / 80 | all ok | - | 20 -> 20 | 5736 / 8722 | 3 / 4 |

Findings:
* **One request holds one server connection per query in flight**, up to the Pool `max` (driver default 10). It is 1 for sequential handlers, but `dashboard.js` fans out 8 parallel `EXISTS` queries (and `profiles.js:141` 2, `activityService.js:307` 3): at the default that was 8 connections per dashboard hit, exhausting a 100-connection Postgres at **14** concurrent dashboards.
* **Release is prompt for `end` and `waituntil`** (1-24 ms after the response, count returns to baseline exactly). `waituntil` is the production strategy and works: the pool is closed after the response, the response is not delayed.
* **`noend` is not a permanent leak locally, but the reason is local**: pg-pool's 10 s idle timer fired after the response. Whether Cloudflare production cancels the socket at request end, keeps it, or freezes the timer is unknown here (CANNOT-VERIFY).
* Extra connection = extra latency: a request with 8 parallel 5 ms queries takes median **82 ms at max 1, 76 ms at max 2, 101 ms at max 4, 179 ms at max 10** (each extra connection costs a WebSocket + SCRAM handshake; `node spike/s11/maxbench.mjs`, loopback, relative only).
* `max: 1` **deadlocks** a request that holds a `db.connect()` client and also queries (resumeChat pattern): the second query waits `timeout exceeded when trying to connect` (proved: `/s11/fail?scenario=checkout-starve&max=1` -> rejected after 2001 ms; `max=2` -> ok in 118 ms).
* With no connect timeout a black-holed endpoint hangs the request indefinitely (client gave up at 25 s); with `connectionTimeoutMillis: 10000` it fails after **10.09 s** with the masked 500.
* Through the transaction pooler the server side is capped at the pool size and 200 concurrent requests all succeed (queued, latency grows); `noend` costs no server connection but holds pooler CLIENT slots (50 held until +10 s, `node spike/s11/pooler-clients.mjs`). Neon documents 10 000 client connections for its pooler (from memory, verify).

**Change made** (`backend/src/config/database.worker.js`, tests `backend/tests/worker/databaseWorkerConfig.test.js`): `new Pool({ connectionString, max: 2, connectionTimeoutMillis: 10000 })`; contract `.query(text, params) -> {rows,rowCount}` unchanged, also exports `POOL_MAX`, `CONNECTION_TIMEOUT_MS`.
Effect (same test, before -> after): dashboard-shaped exhaustion **N=14 -> N~50** concurrent requests; black-hole hang unbounded -> 10 s.
Why 2 and not 1: `max: 1` is the DB-optimal value but starves any request that checks a client out (`resumeChat.js:42`). If resumeChat moves to `db.hold()`, use 1.
`neon()` HTTP mode was considered and NOT adopted: it cannot run multi-statement queries or interactive transactions, and `db.connect()` (resumeChat) needs a real connection. The Worker has no `BEGIN`, `SET`, advisory lock, `LISTEN` or named prepared statement (grep of `backend/src`), so `Pool.query` over fetch (`poolQueryViaFetch`) is a viable later optimisation that removes the connection lifecycle problem entirely; it needs Neon's `/sql` endpoint, which the local proxy does not provide (section 9, experiment E2).

## 6. Pooler caveats (PgBouncer transaction mode, an approximation of Neon's pooled endpoint)

`node spike/s11/node-pooler.mjs` (fresh PgBouncer, 60 background clients keeping every server connection busy):

| Behaviour | Result via transaction pooler | Used by the Worker code? |
|---|---|---|
| plain `query(text, params)`, `$1` binding, injection payload | works, literal | yes (everything) |
| multi-statement simple query (`TEMP TABLE ... ON COMMIT DROP; INSERT; SELECT`, DDL blocks) | works (one message = one transaction) | no (boot DDL is excluded) |
| one client's sequential statements | served by **18 distinct backends over 40 statements** | - |
| `CREATE TEMP TABLE` then read in later statements | **1 of 25 reads worked, 24 x `relation does not exist`** | no |
| session `SET s11.leak=...` | **leaked to 2 of 40 other clients** | no `SET` in `backend/src` |
| `SET LOCAL` inside `BEGIN..COMMIT`, `pg_advisory_xact_lock`, a transaction | works, pinned to one backend | no |
| protocol-level named prepared statements | 25/25 ok (PgBouncer 1.25 with `max_prepared_statements=1000`; Neon says it supports this: verify) | no (`query({name})` absent) |
| SQL-level `PREPARE`/`EXECUTE` | **3 of 25 ok** (`prepared statement does not exist` [26000]) | no |
| session `pg_advisory_lock` | acquired on one backend, the next statement (`unlock`) hit another: **`released: false`, lock stays on the pooled backend** (a blocking `pg_advisory_lock` in an earlier run then hung forever on the leftover lock) | no |

Conclusion: the Worker's own SQL (single statements, `$n` params, no session state) is pooler-safe. `db.connect()` clients running several statements without `BEGIN` are safe only because none of them uses session state.
Anything that adds `SET`, temp tables, `LISTEN`, SQL `PREPARE` or session advisory locks must use a transaction or the direct (non-pooler) endpoint.

## 7. Files changed / added

* `backend/src/worker/db.js` (error normalisation, checked-out client listener, teardown-noise filter, header now says "verified locally").
* `backend/src/config/database.worker.js` (`max: 2`, `connectionTimeoutMillis: 10000`).
* `backend/tests/worker/db.test.js` (+11 tests), `backend/tests/worker/databaseWorkerConfig.test.js` (new, 4 tests). `npx jest tests/worker --coverage=false`: 112 suites / 4236 tests pass.
* `backend/spike/auth/s11.mjs` (rewritten: T1-T9, routes, failure scenarios, probe), `s11-driver.mjs` (header), `worker.mjs` (delegates with the new contract).
* `backend/spike/s11/**` (new): `worker.mjs`, `wrangler.toml`, `neon-config.cjs` (spike-only neonConfig from env), `harness.mjs`, `lib.mjs`, scripts below, `schema.sql`.
* Docker created for step 4: container `s11-pgbouncer` (network `s11net`, alias `pgb`, `127.0.0.1:55434`), image `edoburu/pgbouncer:latest`. The orchestrator removes it with the others.

## 8. Re-run commands (from `backend/`; containers `s11-pg`, `s11-wsproxy`, `s11-pgbouncer` running on network `s11net`)

```
docker exec -i s11-pg psql -U spike -d spike_s11 < spike/s11/schema.sql      # users fixture (idempotent)
node spike/s11/node-first.mjs                    # smoke: Neon Pool over wsproxy
TZ=UTC node spike/s11/node-types.mjs             # Neon driver vs pg, 31 types + result shapes (also TZ=Asia/Calcutta)
node spike/s11/node-functional.mjs               # T1-T4c, pool.end() semantics, after-end errors
node spike/s11/node-failure-scenario.mjs idle-terminate   # also: inflight-terminate checkedout-idle-terminate proxy-unreachable [nolistener]
                                                 # (idle-proxy-kill / inflight-proxy-kill / checkedout-proxy-kill need `docker stop s11-wsproxy` at READY)
node spike/s11/run-functional.mjs                # starts wrangler dev --local (port 8930+), runs /s11 + module-level pool, deletes .dev.vars
node spike/s11/explore.mjs "/s11/fail?scenario=dbjs-checkedout-kill" "/s11/mw/bare?proxy=127.0.0.1:1/v1" "/s11/mw/rawthrow?guard=1"   # (MSYS_NO_PATHCONV=1 in Git Bash)
node spike/s11/load.mjs [--quick]                # full matrix + exhaustion sweep (about 6 min); --cases=a,b to pick
node spike/s11/load.mjs --pooler                 # same worker, DATABASE_URL -> PgBouncer
node spike/s11/maxbench.mjs                      # latency vs Pool max
node spike/s11/blackhole.mjs 25000               # connect-timeout behaviour
node spike/s11/node-pooler.mjs                   # PgBouncer session-state behaviours (restart s11-pgbouncer first for a clean run)
node spike/s11/pooler-clients.mjs 50             # PgBouncer client count after noend vs waituntil
npx jest tests/worker --coverage=false
```
Scripts start and kill only their own wrangler/workerd tree and delete `spike/s11/.dev.vars` (only local synthetic values) in `finally`.

## 9. What still requires hosted Neon (nothing below was verified)

1. `wss://<endpoint>/v2` proxy + TLS: that the driver as configured in `database.worker.js` (no neonConfig overrides, default `pipelineConnect:"password"`) connects at all from workerd, and cold/warm connect latency.
2. Neon **compute wake-up** (scale-to-zero): first-request latency vs the new 10 s `connectionTimeoutMillis`.
3. Real `max_connections` for the compute size and the exact error text at exhaustion; direct vs `-pooler` endpoint behaviour under the section 5 load (Neon "Monitoring > Connections").
4. The real pooler's settings (`default_pool_size`, `query_wait_timeout`, prepared-statement support) and section 6 behaviours, in particular multi-statement DDL and temp tables.
5. Server-side release latency and baseline recovery on Neon after `pool.end()` (the pooler may hold server conns; count client connections too).
6. Production-only Workers behaviour: outgoing I/O when a request ends without `waitUntil` (`noend`), the 6-simultaneous-connections-per-request limit and subrequest counts (each WebSocket), CPU time of the SCRAM handshake, `waitUntil`'s post-response time budget, real `getTimezoneOffset()` (UTC).
7. `poolQueryViaFetch` / `neon()` HTTP mode (`https://<host>/sql`): parity, multi-statement rejection, error shapes, and whether it removes the connection lifecycle problem.
8. Real-schema queries (this pass used a two-column `users` fixture): every ported route's SQL, JSONB/array round-trips, `ON CONFLICT`, `pgvector` columns.
9. Failure injection on Neon (killing a backend from the console, suspending the compute mid-request) and the exact error objects Neon's proxy produces.

## 10. Runbook: run the SAME spike against a Neon BRANCH

Requires the account owner. Never use the production branch or its credentials.

1. **Create a branch.** Neon console -> project -> Branches -> Create branch (name `s11-spike`, parent = production branch; prefer schema-only if offered, otherwise the tests only `COUNT(*)` users). It must contain the `users` table (T1).
2. **Get two strings** (Connect dialog): the **pooled** one (host contains `-pooler`) and the **direct** one (untick "Connection pooling"). Export them in the shell only (PowerShell):
   ```
   $env:S11_REAL_NEON='1'
   $env:S11_POOLED_URL='postgresql://USER:PASSWORD@ep-XXXX-pooler.REGION.aws.neon.tech/DB?sslmode=require'
   $env:S11_DIRECT_URL='postgresql://USER:PASSWORD@ep-XXXX.REGION.aws.neon.tech/DB?sslmode=require'
   ```
   `spike/s11/harness.mjs` writes them (plus `application_name=s11-worker`) to the git-ignored `backend/spike/s11/.dev.vars` for the run only and deletes it afterwards; verify the file is gone. Optional `S11_WORKER_URL` selects which string the Worker uses (default pooled).
3. **Node-only checks** (no workerd, from `backend/`): `node spike/s11/node-types.mjs`, `node spike/s11/node-functional.mjs`, `node spike/s11/node-failure-scenario.mjs idle-terminate`, `node spike/s11/node-pooler.mjs`. In these, `S11_REAL_NEON=1` disables the local proxy settings and uses the driver defaults over `ws`. (`node-pooler.mjs` uses temp tables, `SET s11.leak`, an advisory lock and 60 background connections on the branch: run it only on the dedicated branch. The failure scenarios `pg_terminate_backend` every other session in the branch database.)
4. **Worker path (the production code) against Neon**, still `wrangler dev --local` (workerd on your machine, real Neon over the internet): `node spike/s11/run-functional.mjs`. Expect `passed=11/11`. Compare to the local run: T4/T4c on the **pooled** string (multi-statement DDL through the pooler), T5 types, T6/T7 lifecycle, `/s11/shared` (still fails on request 2).
5. **Connection lifecycle and load**, once with the Worker on the **direct** URL (`$env:S11_WORKER_URL=$env:S11_DIRECT_URL`) and once **pooled** (`--pooler`), watching Neon Monitoring > Connections. First `psql "$S11_DIRECT_URL" -c "SHOW max_connections"` and keep N below it:
   ```
   node spike/s11/load.mjs --cases=waituntil-N20,end-N20,noend-N20,waituntil-par8-prod-N14
   node spike/s11/load.mjs --pooler                       # pooled Worker URL: count is every non-observer connection
   ```
   Then raise N (edit `Ns` / `--cases`) toward `max_connections/2` for the par8 case to find the first `remaining connection slots` / `too many connections` error. Record the same columns as section 5.
6. **Failure scenarios on Neon** (direct URL as the Worker URL, so `application_name=s11-worker` is visible): `node spike/s11/explore.mjs "/s11/fail?scenario=idle-kill" "/s11/fail?scenario=inflight-kill" "/s11/fail?scenario=dbjs-checkedout-kill" "/s11/fail?scenario=dbjs-idle-kill"`. Success = `outcome` as locally, no `Uncaught` in the wrangler log. Also suspend the compute from the console (or wait 5 min idle) and time the first `/s11` request.
7. **HTTP-mode experiment (E2):** `$env:S11_EXTRA_VARS='NEON_POOL_QUERY_VIA_FETCH=1'` and rerun step 4 and the load cases. Expect T4/T4c to FAIL (multi-statement over HTTP), T1-T3/T5 to pass, and `pg_stat_activity` to show ~0 connections during load. If yes, `poolQueryViaFetch` (global `neonConfig`, set once in `database.worker.js`) is worth a follow-up; multi-statement callers (none in the Worker) and `db.connect()` still need WebSockets.
8. **Production-edge run (optional, owner only):** deploy the spike as a THROWAWAY Worker with a random name and `S11_KEY`, secrets via `wrangler secret put DATABASE_URL` / `ADMIN_DATABASE_URL` / `S11_KEY` (not `[vars]`), run the scripts with `$env:S11_BASE_URL='https://<name>.<acct>.workers.dev'` and `$env:S11_KEY=...`, then `wrangler delete` the Worker and delete the branch. This is the only way to see section 9 item 6.
9. **Compare** with section 5 and paste results here: release latency (local 1-24 ms), connections per request (1 sequential, 2 with `max:2`), first exhaustion N, `noend` plateau (local: clears at +10 s), pooled multi-statement result (local: works), `checkedout-kill` (local: no uncaught), first-request latency after suspend (local: n/a). Then delete the branch and unset the variables.
