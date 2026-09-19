// S11 -- @neondatabase/serverless spike (ADR-001 section 5 S11, section 6.5, checklist items 19 and 20).
//
// STATUS (2026-09-20): RUN against a LOCAL Postgres 17 through Neon's own open-source WebSocket proxy
// (github.com/neondatabase/wsproxy) inside `wrangler dev --local` (workerd). NOT run against hosted Neon:
// see docs/migration/s11-results.md for the results, the exact commands, and the list of what still needs a
// real Neon BRANCH (pooler behaviour, TLS/wss, cold connect latency, real max_connections, HTTP mode).
//
// Everything is exercised through the PRODUCTION path: src/worker/db.js (createNeonDb / createRequestDb /
// dbMiddleware) -> src/config/database.worker.js (getPool) -> @neondatabase/serverless Pool. The spike worker
// that mounts this file is spike/s11/worker.mjs (applies neonConfig from env for the local proxy only).
// spike/auth/worker.mjs still mounts it too, for a run against a real Neon URL with the driver's defaults.
//
// Routes (all take env.DATABASE_URL; without it they return {skipped:true} and open NO connection):
//   GET /s11                     functional tests T1-T9 (JSON)
//   GET /s11/req?mode=&hold=&par=&max=   one "request" for the load test.
//        mode=noend      db never released (what a ported route that forgets teardown costs)
//        mode=end        `await db.release()` before responding
//        mode=waituntil  production strategy: dbMiddleware -> ctx.waitUntil(db.release()) AFTER the response
//        hold=ms         each query is SELECT pg_sleep(hold/1000) (default 400, max 5000)
//        par=n           run n such queries in parallel inside the ONE request (default 1, max 12)
//        max=n           (spike/s11 worker only) override Pool `max` for this request
//   GET /s11/activity            pg_stat_activity count via its own db (the Node drivers sample Postgres directly instead)
//   GET /s11/shared              the MODULE-LEVEL Pool anti-pattern (expected to fail on the second request)
//   GET /s11/fail?scenario=...   failure-injection scenarios (see failScenario())
//
// TESTS T1-T9 (functional)
//   T1  SELECT COUNT(*) FROM users
//   T2  parameterized $1 / $2
//   T3  '; DROP TABLE users; --  as a $1 param comes back as a literal; users still exists
//   T4  multi-statement in ONE query(): CREATE TEMP TABLE ... ON COMMIT DROP; INSERT; SELECT. T4b multi-statement WITH params.
//       T4c CREATE TABLE IF NOT EXISTS bootstrap block (the ADR exercise) on a scratch table, dropped afterwards.
//   T5  result shape (.rows/.rowCount/.command/.fields) and JS types (count, bigint, numeric, date, timestamp, jsonb, array)
//   T6  db.release() then db.query() rejects with "db used after release"; release is idempotent
//   T7  db.connect() checkout: release() waits for the checked-out client (resumeChat.js pattern), then ends
//   T8  a query that fails server-side rejects (error text/code kept) and does not poison later queries
//   T9  runtime facts: timezone offset, typeof WebSocket
//
// HOW TO RUN: docs/migration/s11-results.md (local) and its "Neon branch runbook" (hosted).

const enc = (v) => JSON.stringify(v, (_k, x) => (typeof x === 'bigint' ? x.toString() : x));
const json = (body, status = 200) => new Response(enc(body), { status, headers: { 'content-type': 'application/json' } });
const errInfo = (e) => ({ name: e && e.name, message: e && e.message, code: e && e.code, type: e && e.type, isError: e instanceof Error });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function shape(res) {
  if (Array.isArray(res)) return { isArray: true, length: res.length, items: res.map(shape) };
  return {
    isArray: false,
    command: res.command,
    rowCount: res.rowCount,
    rowsIsArray: Array.isArray(res.rows),
    rowsLength: Array.isArray(res.rows) ? res.rows.length : null,
    fieldsLength: Array.isArray(res.fields) ? res.fields.length : null,
    keys: Object.keys(res),
  };
}

async function step(name, fn) {
  const t0 = Date.now();
  console.log('[s11] step start:', name); // marker so worker-log lines can be attributed to a step
  try {
    const detail = await fn();
    console.log('[s11] step end:', name);
    return { name, ok: detail.ok !== false, ms: Date.now() - t0, ...detail };
  } catch (e) {
    return { name, ok: false, ms: Date.now() - t0, threw: errInfo(e) };
  }
}

async function functional(db) {
  const results = [];
  let usersCountBefore = null;
  results.push(await step('T1 SELECT COUNT(*) FROM users', async () => {
    const r = await db.query('SELECT COUNT(*) FROM users');
    usersCountBefore = r.rows[0].count;
    return { ok: r.rows.length === 1 && typeof r.rows[0].count === 'string' && Number.isFinite(Number(r.rows[0].count)),
      count: r.rows[0].count, typeofCount: typeof r.rows[0].count, shape: shape(r) };
  }));

  results.push(await step('T2 parameterized $1/$2', async () => {
    const r = await db.query('SELECT $1::text AS echo, $2::int AS n', ['hello-$1', 42]);
    const c = await db.query('SELECT COUNT(*) FROM users WHERE email = $1', ['spike-no-such-user@example.invalid']);
    return { ok: r.rows[0].echo === 'hello-$1' && r.rows[0].n === 42 && Number(c.rows[0].count) === 0,
      echo: r.rows[0], noSuchUserCount: c.rows[0].count };
  }));

  results.push(await step('T3 SQL-injection payload as $1 is a literal', async () => {
    const payload = "'; DROP TABLE users; --";
    const r = await db.query('SELECT $1::text AS payload', [payload]);
    const w = await db.query('SELECT COUNT(*) FROM users WHERE email = $1', [payload]);
    const still = await db.query("SELECT to_regclass('public.users') IS NOT NULL AS users_exists");
    const after = await db.query('SELECT COUNT(*) FROM users');
    return { ok: r.rows[0].payload === payload && Number(w.rows[0].count) === 0
               && still.rows[0].users_exists === true && after.rows[0].count === usersCountBefore,
      roundTrippedExactly: r.rows[0].payload === payload, whereMatchCount: w.rows[0].count,
      usersTableStillExists: still.rows[0].users_exists, countBefore: usersCountBefore, countAfter: after.rows[0].count };
  }));

  results.push(await step('T4 multi-statement: CREATE TEMP TABLE; INSERT; SELECT in one query()', async () => {
    const r = await db.query(`
      CREATE TEMP TABLE spike_s11_tmp (id int, note text) ON COMMIT DROP;
      INSERT INTO spike_s11_tmp VALUES (1, 'a'), (2, 'b');
      SELECT id, note FROM spike_s11_tmp ORDER BY id;
    `);
    const last = Array.isArray(r) ? r[r.length - 1] : r;
    return { ok: Array.isArray(r) && last.rows.length === 2 && last.rows[0].note === 'a' && last.rows[1].note === 'b',
      multiReturnsArray: Array.isArray(r), shape: shape(r), lastRows: last.rows };
  }));

  results.push(await step('T4b multi-statement WITH params is rejected (same as node-postgres)', async () => {
    try {
      await db.query('SELECT $1::int AS a; SELECT 2 AS b', [1]);
      return { ok: false, rejected: false, note: 'accepted -- differs from node-postgres (which rejects)' };
    } catch (e) {
      return { ok: /multiple commands/.test(String(e && e.message)), rejected: true, error: errInfo(e) };
    }
  }));

  results.push(await step('T4c CREATE TABLE IF NOT EXISTS block (ADR S11 exercise) on a scratch table', async () => {
    const r = await db.query(`CREATE TABLE IF NOT EXISTS spike_s11_bootstrap (id int PRIMARY KEY, note text);
      CREATE INDEX IF NOT EXISTS spike_s11_bootstrap_note ON spike_s11_bootstrap(note);
      INSERT INTO spike_s11_bootstrap VALUES (1, 'x') ON CONFLICT DO NOTHING;`);
    const again = await db.query(`CREATE TABLE IF NOT EXISTS spike_s11_bootstrap (id int PRIMARY KEY, note text);`); // idempotent
    await db.query('DROP TABLE spike_s11_bootstrap');
    return { ok: Array.isArray(r) && r.length === 3, commands: Array.isArray(r) ? r.map((x) => x.command) : r.command, secondRunCommand: again.command };
  }));

  results.push(await step('T5 result shape + JS types', async () => {
    const zero = await db.query('SELECT 1 AS x WHERE false');
    const three = await db.query('SELECT * FROM generate_series(1,3) AS g(n)');
    const upd = await db.query('UPDATE users SET email = email WHERE id = -1');
    const t = await db.query(`SELECT now() AS t, 1::int AS i, 1::bigint AS b, '12.3400'::numeric(10,4) AS num,
      DATE '2026-09-20' AS d, TIMESTAMP '2026-09-20 12:34:56' AS ts, TIMESTAMPTZ '2026-09-20 12:34:56+00' AS tstz,
      '{"a":[1,{"b":null}]}'::jsonb AS j, ARRAY[1,2]::int[] AS arr, ARRAY['x','y']::text[] AS tarr, true AS bool, NULL::text AS nul`);
    const row = t.rows[0];
    const iso = (v) => (v instanceof Date ? v.toISOString() : typeof v);
    return { ok: zero.rows.length === 0 && zero.rowCount === 0 && three.rowCount === 3 && three.rows.length === 3
                 && upd.rowCount === 0 && upd.command === 'UPDATE' && Array.isArray(zero.fields) && zero.fields.length === 1,
      zeroRowShape: shape(zero), threeRowShape: shape(three), updateShape: shape(upd),
      types: { t: row.t instanceof Date ? 'Date' : typeof row.t, i: typeof row.i, b: typeof row.b, num: row.num,
               d: iso(row.d), ts: iso(row.ts), tstz: iso(row.tstz), j: row.j, jTypeof: typeof row.j,
               arr: Array.isArray(row.arr) ? row.arr : typeof row.arr, tarr: row.tarr, bool: typeof row.bool, nul: row.nul } };
  }));

  results.push(await step('T8 server-side error rejects with code, and does not poison later queries', async () => {
    let err = null;
    try { await db.query('SELECT * FROM spike_s11_no_such_table'); } catch (e) { err = e; }
    const after = await db.query('SELECT 1 AS ok');
    return { ok: !!err && err.code === '42P01' && after.rows[0].ok === 1, error: err && errInfo(err), nextQueryOk: after.rows[0].ok === 1 };
  }));

  results.push(await step('T9 runtime facts', async () => ({
    ok: true,
    tzOffsetMinutes: new Date().getTimezoneOffset(),
    typeofWebSocket: typeof WebSocket,
    dateParse: new Date('2026-09-20').toISOString(),
  })));
  return results;
}

// T6 / T7 need their own db instances (they release / hold), so they run from the outer flow with the factory.
async function lifecycleTests(makeDb) {
  const out = [];
  out.push(await step('T6 use after release rejects; release idempotent', async () => {
    const db = makeDb();
    await db.query('SELECT 1');
    const t0 = Date.now();
    await db.release();
    const releaseMs = Date.now() - t0;
    let after = null;
    try { await db.query('SELECT 2'); } catch (e) { after = e; }
    await db.release(); // second release must not throw
    return { ok: !!after && /after release/.test(after.message), releaseMs, error: after && errInfo(after) };
  }));

  out.push(await step('T7 db.connect() checkout: release() waits for the checked-out client (resumeChat pattern)', async () => {
    const db = makeDb();
    const client = await db.connect();
    await client.query('SELECT 1');
    let released = false;
    const relP = db.release().then(() => { released = true; });
    await sleep(400);
    const waitedWhileHeld = released === false;
    const stillWorks = (await client.query('SELECT 42 AS x')).rows[0].x === 42;
    client.release();
    await relP;
    return { ok: waitedWhileHeld && stillWorks && released, waitedWhileHeld, clientUsableAfterReleaseCalled: stillWorks, releasedAfterClientRelease: released };
  }));
  return out;
}

// ---------------------------------------------------------------------------------------------
// Module-level Pool: the anti-pattern database.worker.js warns about. Deliberately at MODULE scope.
let sharedPool = null;
let sharedRequests = 0;

async function shared(env, deps) {
  sharedRequests++;
  const n = sharedRequests;
  if (!sharedPool) sharedPool = deps.makePool(env, {});
  try {
    const r = await sharedPool.query('SELECT pg_backend_pid() AS pid');
    return json({ n, ok: true, pid: r.rows[0].pid });
  } catch (e) {
    return json({ n, ok: false, error: errInfo(e) }, 500);
  }
}

// ---------------------------------------------------------------------------------------------
// Failure injection. Each scenario reports what the awaited promise did; escaped/uncaught errors are visible in
// the wrangler log and as a non-JSON / non-200 response.
async function failScenario(url, env, deps) {
  const scenario = url.searchParams.get('scenario');
  const listener = url.searchParams.get('listener') !== '0';
  const log = [];
  const emitted = [];
  const mkPool = () => deps.makePool(env, {});
  const admin = () => deps.makePool({ ...env, DATABASE_URL: env.ADMIN_DATABASE_URL || env.DATABASE_URL }, { max: 1 });
  const killOthers = async (self) => {
    const a = admin();
    try { await a.query("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid() AND application_name = 's11-worker'"); }
    finally { await a.end().catch(() => {}); }
  };
  const attach = (emitter, label) => { if (listener) emitter.on('error', (e) => emitted.push({ on: label, ...errInfo(e) })); };
  const res = { scenario, listener };
  try {
    if (scenario === 'unreachable') {
      // proxy port closed: connect fails; expect the query promise to reject
      env = { ...env, NEON_WS_PROXY: '127.0.0.1:1/v1' };
      deps.applyNeon(env);
      const db = deps.createRequestDb(() => deps.makePool(env, {}));
      try { await db.query('SELECT 1'); res.outcome = 'resolved?!'; } catch (e) { res.outcome = 'rejected'; res.error = errInfo(e); }
      await db.release();
      deps.applyNeon({ NEON_WS_PROXY: url.searchParams.get('restore') || '127.0.0.1:55433/v1' });
    } else if (scenario === 'unresolvable') {
      // like the earlier smoke: a URL whose host cannot be reached through the DEFAULT driver settings (wss://host/v2)
      const bad = 'postgres://u:p@s11-no-such-host.invalid/db?sslmode=require';
      const { neon } = deps;
      const pool = new neon.Pool({ connectionString: bad });
      if (listener) pool.on('error', (e) => emitted.push({ on: 'pool', ...errInfo(e) }));
      try { await pool.query('SELECT 1'); res.outcome = 'resolved?!'; } catch (e) { res.outcome = 'rejected'; res.error = errInfo(e); }
      await pool.end().catch((e) => { res.endError = errInfo(e); });
    } else if (scenario === 'idle-kill') {
      // pool.query() completed -> idle pooled client; its backend is killed; wait; next query
      const pool = mkPool(); attach(pool, 'pool');
      await pool.query('SELECT 1');
      await killOthers();
      await sleep(700);
      try { const r = await pool.query('SELECT 42 AS x'); res.outcome = 'next query ok'; res.x = r.rows[0].x; } catch (e) { res.outcome = 'next query rejected'; res.error = errInfo(e); }
      await pool.end().catch(() => {});
    } else if (scenario === 'inflight-kill') {
      const pool = mkPool(); attach(pool, 'pool');
      const q = pool.query('SELECT pg_sleep(5)');
      await sleep(600);
      await killOthers();
      try { await q; res.outcome = 'resolved?!'; } catch (e) { res.outcome = 'rejected'; res.error = errInfo(e); }
      await pool.end().catch(() => {});
    } else if (scenario === 'checkedout-kill') {
      // resumeChat pattern: pool.connect() client held while the handler awaits non-DB work; connection dies meanwhile
      const pool = mkPool(); attach(pool, 'pool');
      const client = await pool.connect();
      const clientListener = url.searchParams.get('clientlistener') === '1';
      if (clientListener) client.on('error', (e) => emitted.push({ on: 'client', ...errInfo(e) }));
      await client.query('SELECT 1');
      await killOthers();
      await sleep(700);
      try { await client.query('SELECT 2'); res.outcome = 'query ok?!'; } catch (e) { res.outcome = 'rejected'; res.error = errInfo(e); }
      try { client.release(); } catch (e) { res.releaseError = errInfo(e); }
      await pool.end().catch(() => {});
      res.clientListener = clientListener;
    } else if (scenario === 'checkout-starve') {
      // resumeChat pattern with a small pool: one client checked out for a long job, the handler still needs to query.
      const max = Number(url.searchParams.get('max') || 1);
      const db = deps.createRequestDb(() => deps.makePool(env, { max, connectionTimeoutMillis: 2000 }));
      const client = await db.connect();
      const t0 = Date.now();
      try { const r = await db.query('SELECT 1 AS ok'); res.outcome = 'query ok while a client is checked out'; res.ok = r.rows[0].ok; }
      catch (e) { res.outcome = 'query rejected'; res.error = errInfo(e); }
      res.waitedMs = Date.now() - t0; res.max = max;
      client.release();
      await db.release();
    } else if (scenario === 'dbjs-checkedout-kill') {
      // same as above but through the production db.js connect()
      const db = deps.createRequestDb(() => deps.makePool(env, {}));
      const client = await db.connect();
      await client.query('SELECT 1');
      await killOthers();
      await sleep(700);
      try { await client.query('SELECT 2'); res.outcome = 'query ok?!'; } catch (e) { res.outcome = 'rejected'; res.error = errInfo(e); }
      try { client.release(); } catch (e) { res.releaseError = errInfo(e); }
      await db.release();
    } else if (scenario === 'dbjs-idle-kill') {
      const db = deps.createRequestDb(() => deps.makePool(env, {}));
      await db.query('SELECT 1');
      await killOthers();
      await sleep(700);
      try { const r = await db.query('SELECT 42 AS x'); res.outcome = 'next query ok'; res.x = r.rows[0].x; } catch (e) { res.outcome = 'next query rejected'; res.error = errInfo(e); }
      await db.release();
    } else {
      return json({ error: 'unknown scenario', scenario }, 400);
    }
  } catch (e) {
    res.handlerCaught = errInfo(e);
  }
  res.emitted = emitted;
  res.log = log;
  return json(res);
}

// ---------------------------------------------------------------------------------------------
// Probe: raw Neon Pool with a logging WebSocket subclass, to attribute "Network connection lost" to a socket event.
//   /s11/probe?case=end-immediately|end-after|query-error|sleep-then-end   (spike/s11 worker only; needs deps.neon)
async function probe(url, env, deps) {
  const events = [];
  const t0 = Date.now();
  const ev = (...a) => events.push([Date.now() - t0, ...a]);
  const C = deps.neon.neonConfig;
  const Orig = C.webSocketConstructor;
  class LoggingWS extends WebSocket {
    constructor(u) {
      super(u);
      this.addEventListener('open', () => ev('ws open'));
      this.addEventListener('error', (e) => ev('ws error', e && e.message, e && e.type));
      this.addEventListener('close', (e) => ev('ws close', e.code, e.reason, e.wasClean));
    }
    close(...a) { ev('ws.close() called by driver'); return super.close(...a); }
  }
  C.webSocketConstructor = LoggingWS;
  const kase = url.searchParams.get('case') || 'end-immediately';
  const delay = Number(url.searchParams.get('delay') || 0);
  const pool = new deps.neon.Pool({ connectionString: env.DATABASE_URL, max: 1 });
  if (url.searchParams.get('listener') !== '0') pool.on('error', (e) => ev('POOL error event', e && e.message, e && e.constructor && e.constructor.name));
  try {
    if (kase === 'query-error') {
      try { await pool.query('SELECT * FROM spike_s11_no_such_table'); } catch (e) { ev('query rejected', e.code); }
      await sleep(delay || 500);
      await pool.end().catch((e) => ev('end rejected', e.message));
    } else {
      await pool.query('SELECT 1');
      ev('query done');
      if (delay) await sleep(delay);
      ev('calling pool.end()');
      const e0 = Date.now();
      await pool.end().then(() => ev('pool.end() resolved after', Date.now() - e0, 'ms'), (e) => ev('end rejected', e.message));
    }
    await sleep(700);
  } finally { C.webSocketConstructor = Orig; }
  return json({ case: kase, delay, events });
}

export async function handleS11(request, env, ctx, deps) {
  const url = new URL(request.url);
  if (!env || !env.DATABASE_URL) {
    let guard = 'n/a';
    try { deps.createNeonDb({ databaseUrl: undefined }); guard = 'lazy: pool factory only runs on first query'; } catch (e) { guard = String(e.message).slice(0, 40); }
    return json({ skipped: true, reason: 'DATABASE_URL not present in env; no connection attempted', guard });
  }
  if (deps.applyNeon) deps.applyNeon(env);
  const cfg = { databaseUrl: env.DATABASE_URL };

  if (url.pathname === '/s11/req') {
    const mode = url.searchParams.get('mode') || 'noend';
    const hold = Math.min(Number(url.searchParams.get('hold') || 400), 5000);
    const par = Math.min(Math.max(Number(url.searchParams.get('par') || 1), 1), 12);
    const max = url.searchParams.get('max');
    const t0 = Date.now();
    const db = max && deps.makePool
      ? deps.createRequestDb(() => deps.makePool(env, { max: Number(max) }))
      : deps.createNeonDb(cfg); // production factory
    try {
      const rs = await Promise.all(Array.from({ length: par }, () =>
        db.query('SELECT pg_sleep($1::float8), pg_backend_pid() AS pid', [hold / 1000])));
      const pids = [...new Set(rs.map((r) => r.rows[0].pid))];
      const out = { mode, par, holdMs: hold, connections: pids.length, pids };
      if (mode === 'end') { const t1 = Date.now(); await db.release(); out.releaseMs = Date.now() - t1; }
      else if (mode === 'waituntil') ctx.waitUntil(db.release());
      // mode === 'noend': deliberately never released
      out.ms = Date.now() - t0;
      return json(out);
    } catch (e) {
      if (mode === 'waituntil') ctx.waitUntil(db.release());
      return json({ mode, error: errInfo(e), ms: Date.now() - t0 }, 500);
    }
  }

  if (url.pathname === '/s11/activity') {
    const db = deps.createNeonDb(cfg);
    try {
      const r = await db.query(`SELECT count(*)::int AS total,
          count(*) FILTER (WHERE state = 'idle')::int AS idle,
          count(*) FILTER (WHERE state = 'active')::int AS active,
          count(*) FILTER (WHERE pid = pg_backend_pid())::int AS self
        FROM pg_stat_activity WHERE datname = current_database()`);
      return json(r.rows[0]);
    } catch (e) {
      return json({ error: errInfo(e) }, 500);
    } finally {
      await db.release();
    }
  }

  if (url.pathname === '/s11/probe' && deps.neon) return probe(url, env, deps);
  if (url.pathname === '/s11/shared') return shared(env, deps);
  if (url.pathname === '/s11/fail') return failScenario(url, env, deps);

  // GET /s11 -> functional tests, through the production request-scoped db, released the production way afterwards
  const db = deps.createNeonDb(cfg);
  let results;
  try {
    results = await functional(db);
  } finally {
    ctx.waitUntil(db.release());
  }
  const lifecycle = await lifecycleTests(() => deps.createNeonDb(cfg));
  const all = results.concat(lifecycle);
  return json({ skipped: false, passed: all.filter((r) => r.ok).length, total: all.length, results: all });
}
