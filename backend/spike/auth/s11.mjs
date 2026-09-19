// S11 -- @neondatabase/serverless spike (ADR-001 section 5, S11 + section 5 "design concerns").
//
// STATUS: WRITTEN BUT NOT RUN. The agent that authored this had no permission to touch a real
// database. The route is gated: with no env.DATABASE_URL it returns {skipped:true} and opens NO connection.
//
// WHAT IT EXERCISES (all through the REAL backend/src/config/database.worker.js getPool(env)):
//   T1  SELECT COUNT(*) FROM users                      (read-only; returns a count, no row data)
//   T2  parameterized $1 / $2 queries                   (no PII returned)
//   T3  '; DROP TABLE users; --  passed as a $1 param    (must come back as a literal; users must still exist)
//   T4  multi-statement block in ONE query():           CREATE TEMP TABLE ... ON COMMIT DROP; INSERT ...; SELECT ...
//       (temp table => nothing persists in the schema).  Also T4b: multi-statement WITH params must be rejected.
//   T5  result shape: .rows / .rowCount / .command / .fields, and JS types of int4 / bigint / timestamptz / jsonb
//   C   connection release: N parallel real HTTP requests each creating a Pool via getPool(env), modes
//       noend | end | waituntil (ctx.waitUntil(pool.end())), observing
//       SELECT count(*) FROM pg_stat_activity WHERE datname = current_database()
//
// HOW THE USER RUNS IT (do this against a Neon BRANCH / dev database, not production, if at all possible):
//   1. From backend/, create spike/auth/.dev.vars  (it is git-ignored; never commit it) containing ONE line:
//          DATABASE_URL=postgresql://USER:PASSWORD@HOST/DB?sslmode=require
//      The functional tests are read-only apart from a session-local, ON COMMIT DROP temp table.
//      The concurrency test opens up to N (default 10, max 25) connections per mode -- keep N below the
//      compute's max_connections (a pooled "-pooler" host is fine).
//   2. Start the worker (leave it running):
//          npx wrangler dev --local --port 8788 -c spike/auth/wrangler.toml
//   3. In another terminal, from backend/:
//          curl http://127.0.0.1:8788/s11                          # T1-T5 functional results (JSON)
//          node spike/auth/s11-driver.mjs 10 http://127.0.0.1:8788 # C: concurrency / release test, prints a table
//   4. Paste both outputs back. Then delete spike/auth/.dev.vars.
//
// Routes served by handleS11():
//   GET /s11            functional tests T1-T5
//   GET /s11/req?mode=noend|end|waituntil&hold=400   one "request": getPool(env), hold a connection ~hold ms, tear down per mode
//   GET /s11/activity   observer: pg_stat_activity count for current_database() (uses its own Pool, then ends it)

const enc = (v) => JSON.stringify(v, (_k, x) => (typeof x === 'bigint' ? x.toString() : x));
const json = (body, status = 200) => new Response(enc(body), { status, headers: { 'content-type': 'application/json' } });
const errInfo = (e) => ({ name: e && e.name, message: e && e.message, code: e && e.code });

function shape(res) {
  if (Array.isArray(res)) {
    return { isArray: true, length: res.length, items: res.map(shape) };
  }
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
  try {
    const detail = await fn();
    return { name, ok: detail.ok !== false, ms: Date.now() - t0, ...detail };
  } catch (e) {
    return { name, ok: false, ms: Date.now() - t0, threw: errInfo(e) };
  }
}

async function functional(env, getPool) {
  const pool = getPool(env); // real database.worker.js: new Pool({ connectionString: env.DATABASE_URL })
  const results = [];
  let usersCountBefore = null;
  try {
    results.push(await step('T1 SELECT COUNT(*) FROM users', async () => {
      const r = await pool.query('SELECT COUNT(*) FROM users');
      usersCountBefore = r.rows[0].count;
      return { ok: r.rows.length === 1 && Number.isFinite(Number(r.rows[0].count)),
        count: r.rows[0].count, typeofCount: typeof r.rows[0].count, shape: shape(r) };
    }));

    results.push(await step('T2 parameterized $1/$2', async () => {
      const r = await pool.query('SELECT $1::text AS echo, $2::int AS n', ['hello-$1', 42]);
      const c = await pool.query('SELECT COUNT(*) FROM users WHERE email = $1', ['spike-no-such-user@example.invalid']);
      return { ok: r.rows[0].echo === 'hello-$1' && r.rows[0].n === 42 && Number(c.rows[0].count) === 0,
        echo: r.rows[0], noSuchUserCount: c.rows[0].count };
    }));

    results.push(await step('T3 SQL-injection payload as $1 is a literal', async () => {
      const payload = "'; DROP TABLE users; --";
      const r = await pool.query('SELECT $1::text AS payload', [payload]);
      const w = await pool.query('SELECT COUNT(*) FROM users WHERE email = $1', [payload]);
      const still = await pool.query("SELECT to_regclass('public.users') IS NOT NULL AS users_exists");
      const after = await pool.query('SELECT COUNT(*) FROM users');
      return { ok: r.rows[0].payload === payload && Number(w.rows[0].count) === 0
                 && still.rows[0].users_exists === true && after.rows[0].count === usersCountBefore,
        roundTrippedExactly: r.rows[0].payload === payload, whereMatchCount: w.rows[0].count,
        usersTableStillExists: still.rows[0].users_exists, countBefore: usersCountBefore, countAfter: after.rows[0].count };
    }));

    results.push(await step('T4 multi-statement: CREATE TEMP TABLE; INSERT; SELECT in one query()', async () => {
      const r = await pool.query(`
        CREATE TEMP TABLE spike_s11_tmp (id int, note text) ON COMMIT DROP;
        INSERT INTO spike_s11_tmp VALUES (1, 'a'), (2, 'b');
        SELECT id, note FROM spike_s11_tmp ORDER BY id;
      `);
      const last = Array.isArray(r) ? r[r.length - 1] : r;
      return { ok: last.rows.length === 2 && last.rows[0].note === 'a' && last.rows[1].note === 'b',
        multiReturnsArray: Array.isArray(r), shape: shape(r), lastRows: last.rows };
    }));

    results.push(await step('T4b multi-statement WITH params must be rejected (informational)', async () => {
      try {
        await pool.query('SELECT $1::int AS a; SELECT 2 AS b', [1]);
        return { ok: true, rejected: false, note: 'accepted -- differs from node-postgres (which rejects)' };
      } catch (e) {
        return { ok: true, rejected: true, error: errInfo(e) };
      }
    }));

    results.push(await step('T5 result shape + JS types', async () => {
      const zero = await pool.query('SELECT 1 AS x WHERE false');
      const three = await pool.query('SELECT * FROM generate_series(1,3) AS g(n)');
      const t = await pool.query(`SELECT now() AS t, 1::int AS i, 1::bigint AS b, '{"a":1}'::jsonb AS j,
        ARRAY[1,2]::int[] AS arr, true AS bool, NULL::text AS nul`);
      const row = t.rows[0];
      return { ok: zero.rows.length === 0 && zero.rowCount === 0 && three.rowCount === 3 && three.rows.length === 3,
        zeroRowShape: shape(zero), threeRowShape: shape(three),
        types: { t: row.t instanceof Date ? 'Date' : typeof row.t, i: typeof row.i, b: typeof row.b,
                 j: typeof row.j, arr: Array.isArray(row.arr) ? 'array' : typeof row.arr, bool: typeof row.bool, nul: row.nul } };
    }));
  } finally {
    await pool.end().catch(() => {});
  }
  return results;
}

async function moduleProbe(getPool) {
  // No connection is opened: only checks the module loaded in workerd and that the guard fires.
  const probe = { getPoolType: typeof getPool };
  try { getPool({}); probe.guardWithoutUrl = 'DID NOT THROW'; }
  catch (e) { probe.guardWithoutUrl = 'throws as designed'; probe.guardMessagePrefix = String(e.message).slice(0, 40); }
  return probe;
}

export async function handleS11(request, env, ctx, getPool) {
  const url = new URL(request.url);
  if (!env || !env.DATABASE_URL) {
    return json({ skipped: true, reason: 'DATABASE_URL not present in env; no connection attempted', moduleProbe: await moduleProbe(getPool) });
  }

  if (url.pathname === '/s11/req') {
    const mode = url.searchParams.get('mode') || 'noend';
    const hold = Math.min(Number(url.searchParams.get('hold') || 400), 3000);
    const t0 = Date.now();
    const pool = getPool(env);
    try {
      const r = await pool.query('SELECT pg_sleep($1::float8), pg_backend_pid() AS pid', [hold / 1000]);
      const out = { mode, pid: r.rows[0].pid, holdMs: hold };
      if (mode === 'end') await pool.end();
      else if (mode === 'waituntil') ctx.waitUntil(pool.end().catch(() => {}));
      // mode === 'noend': deliberately leave the Pool alone (what happens if a ported route forgets)
      out.ms = Date.now() - t0;
      return json(out);
    } catch (e) {
      return json({ mode, error: errInfo(e) }, 500);
    }
  }

  if (url.pathname === '/s11/activity') {
    const pool = getPool(env);
    try {
      const r = await pool.query(`SELECT count(*)::int AS total,
          count(*) FILTER (WHERE state = 'idle')::int AS idle,
          count(*) FILTER (WHERE state = 'active')::int AS active,
          count(*) FILTER (WHERE pid = pg_backend_pid())::int AS self
        FROM pg_stat_activity WHERE datname = current_database()`);
      return json(r.rows[0]);
    } catch (e) {
      return json({ error: errInfo(e) }, 500);
    } finally {
      await pool.end().catch(() => {});
    }
  }

  // GET /s11 -> functional tests
  const results = await functional(env, getPool);
  return json({ skipped: false, passed: results.filter((r) => r.ok).length, total: results.length, results });
}
