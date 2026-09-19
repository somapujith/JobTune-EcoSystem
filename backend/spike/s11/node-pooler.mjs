// S11 step 4: the key session-state / pooling behaviours through PgBouncer in TRANSACTION mode (an approximation of
// Neon's pooled endpoint), using the Neon driver over the wsproxy. Prints facts, not assertions.
import ws from 'ws';
import { neonConfig, Pool, Client } from '@neondatabase/serverless';
import { configureNeon, poolerUrl, pgPooledConfig, pgDirectConfig } from './lib.mjs';
configureNeon(neonConfig, ws);
const url = poolerUrl();
const out = (k, v) => console.log(k.padEnd(62), typeof v === 'string' ? v : JSON.stringify(v));
const short = (e) => (e instanceof Error ? `${e.message}${e.code ? ` [${e.code}]` : ''}` : String(e && e.message));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Background contention: keep every pooler server connection busy (60 plain-TCP clients looping pg_sleep through the
// published pooler port), so a client's next transaction is served by whichever backend frees up, not "its own".
import pg from 'pg';
let bg = null;
function startContention(n = 60, ms = 150) {
  const p = new pg.Pool({ ...pgPooledConfig('s11-contend'), max: n });
  p.on('error', () => {});
  let stop = false;
  const loops = Array.from({ length: n }, async () => { while (!stop) await p.query('SELECT pg_sleep($1::float8)', [ms / 1000]).catch(() => {}); });
  bg = { stop: async () => { stop = true; await Promise.all(loops); await p.end().catch(() => {}); } };
  return sleep(1500); // let it saturate
}
const stopContention = async () => { if (bg) { await bg.stop(); bg = null; } };

// P1 basics
const pool = new Pool({ connectionString: url, max: 1 });
pool.on('error', (e) => out('pool error event', short(e)));
let r = await pool.query('SELECT COUNT(*) FROM users');
out('P1 SELECT COUNT(*) FROM users', r.rows);
const payload = "'; DROP TABLE users; --";
r = await pool.query('SELECT $1::text AS p', [payload]);
out('P1 $1 injection payload comes back as a literal', r.rows[0].p === payload);

// P2 multi-statement in one simple query (one message => one transaction => one server connection)
try {
  r = await pool.query('CREATE TEMP TABLE s11_pool_tmp (id int) ON COMMIT DROP; INSERT INTO s11_pool_tmp VALUES (1),(2); SELECT count(*)::int AS n FROM s11_pool_tmp;');
  out('P2 multi-statement TEMP TABLE+INSERT+SELECT in one query()', { isArray: Array.isArray(r), last: r[r.length - 1].rows });
} catch (e) { out('P2 multi-statement', 'FAILED ' + short(e)); }
try {
  r = await pool.query('CREATE TABLE IF NOT EXISTS s11_pool_boot (id int); INSERT INTO s11_pool_boot VALUES (1);');
  out('P2b multi-statement DDL+DML block', r.map((x) => x.command));
  await pool.query('DROP TABLE s11_pool_boot');
} catch (e) { out('P2b multi-statement DDL block', 'FAILED ' + short(e)); }

// P3 one client (one WS connection): which backends serve its sequential statements, under contention
const client = new Client({ connectionString: url });
client.on('error', (e) => out('client error event', short(e)));
await client.connect();
const pids = new Set();
await startContention();
for (let i = 0; i < 40; i++) { const x = await client.query('SELECT pg_backend_pid() AS pid'); pids.add(x.rows[0].pid); await sleep(10); }
await stopContention();
out('P3 distinct backend pids seen by ONE client across 40 statements', { distinct: pids.size });

// P4 temp table (session state) across statements, under contention
await client.query('CREATE TEMP TABLE s11_sess_tmp (id int)');
let missing = 0, seen = 0, firstErr = null;
await startContention();
for (let i = 0; i < 25; i++) {
  try { await client.query('SELECT count(*) FROM s11_sess_tmp'); seen++; } catch (e) { missing++; firstErr = firstErr || short(e); }
  await sleep(20);
}
await stopContention();
out('P4 temp table created in stmt 1, read by 25 later statements', { visible: seen, failed: missing, firstError: firstErr });

// P5 SET (session-level) leaks to other clients
await client.query("SET s11.leak = 'from-client-A'");
await startContention();
const others = await Promise.all(Array.from({ length: 40 }, async () => {
  const p = new Pool({ connectionString: url, max: 1 }); p.on('error', () => {});
  try { const x = await p.query("SELECT current_setting('s11.leak', true) AS v, pg_sleep(0.05)"); return x.rows[0].v; } finally { await p.end().catch(() => {}); }
}));
await stopContention();
out('P5 SET s11.leak in client A: OTHER clients that see it', { leaked: others.filter((v) => v === 'from-client-A').length, of: others.length });

// P6 SET LOCAL inside an explicit transaction is safe
await client.query('BEGIN'); await client.query("SET LOCAL s11.local = 'x'");
const inTx = await client.query("SELECT current_setting('s11.local', true) AS v"); await client.query('COMMIT');
const after = await client.query("SELECT current_setting('s11.local', true) AS v");
out('P6 SET LOCAL within BEGIN..COMMIT (inside / after)', { inside: inTx.rows[0].v, after: after.rows[0].v });

// P7 protocol-level named prepared statements (node-pg query({name,text}))
let prepOk = 0, prepFail = 0, prepErr = null;
await startContention();
for (let i = 0; i < 25; i++) {
  try { await client.query({ name: 's11-named', text: 'SELECT $1::int + 1 AS v', values: [i] }); prepOk++; } catch (e) { prepFail++; prepErr = prepErr || short(e); }
  await sleep(10);
}
await stopContention();
out('P7 named prepared statement x25 (max_prepared_statements=1000)', { ok: prepOk, failed: prepFail, firstError: prepErr });

// P8 SQL-level PREPARE / EXECUTE (unsupported in transaction mode)
let sqlOk = 0, sqlFail = 0, sqlErr = null;
try { await client.query('PREPARE s11_sqlprep AS SELECT 1'); } catch (e) { sqlErr = short(e); }
await startContention();
for (let i = 0; i < 25; i++) { try { await client.query('EXECUTE s11_sqlprep'); sqlOk++; } catch (e) { sqlFail++; sqlErr = sqlErr || short(e); } await sleep(10); }
await stopContention();
out('P8 SQL-level PREPARE then EXECUTE x25', { ok: sqlOk, failed: sqlFail, firstError: sqlErr });

// P9 session advisory lock vs transaction-scoped advisory lock
const direct = new pg.Pool({ ...pgDirectConfig('s11-observer'), max: 1 });
const advisoryHolders = async () => (await direct.query("SELECT pid FROM pg_locks WHERE locktype='advisory' AND granted AND objid = 424242")).rows.map((x) => x.pid);
try {
  // (never the blocking pg_advisory_lock: an earlier run proved the lock outlives the client on the pooled backend)
  const a = await client.query('SELECT pg_try_advisory_lock(424242) AS got');
  await startContention();
  const p2 = new Pool({ connectionString: url, max: 1 }); p2.on('error', () => {});
  const got = await p2.query('SELECT pg_try_advisory_lock(424242) AS got');
  await p2.end().catch(() => {});
  await stopContention();
  out('P9 session advisory lock: A got it / B (other client) also got it', { aGot: a.rows[0].got, bGot: got.rows[0].got });
  const unlock = await client.query('SELECT pg_advisory_unlock(424242) AS released');
  out('P9 A unlocks on its next statement: released?', { released: unlock.rows[0].released, meaning: unlock.rows[0].released ? 'same backend' : 'a DIFFERENT backend: the lock stays held on the pooled backend' });
  const holders = await advisoryHolders();
  out('P9 backends still holding advisory lock 424242 after A finished', { holders: holders.length });
  if (holders.length) await direct.query('SELECT pg_terminate_backend(pid) FROM pg_locks WHERE locktype=\'advisory\' AND objid = 424242');
} catch (e) { out('P9 session advisory lock', 'FAILED ' + short(e)); }
await direct.end().catch(() => {});
r = await client.query('BEGIN').then(() => client.query('SELECT pg_advisory_xact_lock(1)')).then(() => client.query('COMMIT')).then(() => 'ok').catch((e) => 'FAILED ' + short(e));
out('P9b pg_advisory_xact_lock inside BEGIN..COMMIT', r);

// P10 explicit transaction pins one backend
await client.query('BEGIN');
const t1 = (await client.query('SELECT pg_backend_pid() AS p')).rows[0].p;
await startContention();
const t2 = (await client.query('SELECT pg_backend_pid() AS p')).rows[0].p;
await client.query('COMMIT'); await stopContention();
out('P10 same backend for both statements inside BEGIN..COMMIT', t1 === t2);

await client.end().catch(() => {});
await pool.end().catch(() => {});
process.exit(0);
