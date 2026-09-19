// S11 step 1b (Node): functional checks + pool.end() semantics via the Neon Pool through wsproxy.
import ws from 'ws';
import { neonConfig, Pool, Client } from '@neondatabase/serverless';
import { configureNeon, neonUrl } from './lib.mjs';
configureNeon(neonConfig, ws);
const out = (k, v) => console.log(k.padEnd(44), typeof v === 'string' ? v : JSON.stringify(v));
const pool = new Pool({ connectionString: neonUrl() });
pool.on('error', (e) => out('pool error event', e.message));
const short = (e) => `${e.name}: ${e.message}${e.code ? ` [${e.code}]` : ''}`;

// T1 / T2 / T3
let r = await pool.query('SELECT COUNT(*) FROM users');
out('T1 COUNT(*)', { rows: r.rows, rowCount: r.rowCount });
r = await pool.query('SELECT $1::text AS echo, $2::int AS n', ['hello-$1', 42]);
out('T2 $1/$2', r.rows[0]);
const payload = "'; DROP TABLE users; --";
r = await pool.query('SELECT $1::text AS payload', [payload]);
out('T3 payload literal round-trip', r.rows[0].payload === payload);
r = await pool.query('SELECT COUNT(*) FROM users WHERE email = $1', [payload]);
out('T3 WHERE email=$1 count', r.rows[0].count);
r = await pool.query("SELECT to_regclass('public.users') IS NOT NULL AS ok");
out('T3 users still exists', r.rows[0].ok);

// T4 multi-statement simple query, DDL+DML+SELECT
r = await pool.query(`CREATE TEMP TABLE spike_s11_tmp (id int, note text) ON COMMIT DROP;
  INSERT INTO spike_s11_tmp VALUES (1,'a'),(2,'b'); SELECT id, note FROM spike_s11_tmp ORDER BY id;`);
out('T4 multi returns array', Array.isArray(r));
out('T4 multi commands', Array.isArray(r) ? r.map((x) => `${x.command}:${x.rowCount}`) : r.command);
out('T4 last rows', (Array.isArray(r) ? r[r.length - 1] : r).rows);
// T4b multi with params
try { await pool.query('SELECT $1::int AS a; SELECT 2 AS b', [1]); out('T4b multi+params', 'ACCEPTED'); }
catch (e) { out('T4b multi+params', 'rejected -> ' + short(e)); }
// T4c CREATE TABLE IF NOT EXISTS multi-statement (ADR S11 exercise), then drop
r = await pool.query('CREATE TABLE IF NOT EXISTS spike_s11_bootstrap (id int); CREATE INDEX IF NOT EXISTS spike_s11_bootstrap_i ON spike_s11_bootstrap(id); INSERT INTO spike_s11_bootstrap VALUES (1);');
out('T4c CREATE TABLE IF NOT EXISTS block', Array.isArray(r) ? r.map((x) => x.command) : r.command);
await pool.query('DROP TABLE spike_s11_bootstrap');
// Temp table across separate query() calls on a Pool (different connection possible; max=10 but sequential reuse => same client)
try {
  await pool.query('CREATE TEMP TABLE s11_t2 (x int)');
  const q = await pool.query('SELECT count(*) FROM s11_t2');
  out('temp table across 2 pool.query (sequential)', 'visible, count=' + q.rows[0].count + ' (same idle client reused)');
} catch (e) { out('temp table across 2 pool.query (sequential)', short(e)); }

// pool.end() semantics ----------------------------------------------------
const p2 = new Pool({ connectionString: neonUrl() });
p2.on('error', (e) => out('p2 error event', e.message));
const c = await p2.connect();
await c.query('SELECT 1');
let endResolvedAt = null; const t0 = Date.now();
const endP = p2.end().then(() => { endResolvedAt = Date.now() - t0; });
await new Promise((r2) => setTimeout(r2, 500));
out('end() resolved while client still checked out?', endResolvedAt !== null ? `YES after ${endResolvedAt}ms` : 'NO (still pending after 500ms)');
try { await p2.query('SELECT 1'); out('query after end() (client still out)', 'OK?!'); } catch (e) { out('query after end() (client still out)', short(e)); }
try { await c.query('SELECT 2'); out('checked-out client query after end() call', 'OK (client still usable)'); } catch (e) { out('checked-out client query after end() call', short(e)); }
c.release();
await endP;
out('end() resolved after release()', `after ${endResolvedAt}ms`);
try { await p2.query('SELECT 1'); } catch (e) { out('query after end() resolved', short(e)); }
try { await p2.connect(); } catch (e) { out('connect after end() resolved', short(e)); }
try { await p2.end(); out('second end()', 'resolved'); } catch (e) { out('second end()', short(e)); }

// end() with client never released: does it hang?
const p3 = new Pool({ connectionString: neonUrl() });
const c3 = await p3.connect();
const race = await Promise.race([p3.end().then(() => 'resolved'), new Promise((r3) => setTimeout(() => r3('HANGS (>3s) while a client is checked out'), 3000))]);
out('end() with never-released client', race);
c3.release(); // let it finish

// idle-pool end(): server connection closed promptly?
const p4 = new Pool({ connectionString: neonUrl() });
await p4.query('SELECT 1');
const before = await pool.query("SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid()");
await p4.end();
await new Promise((r4) => setTimeout(r4, 200));
const after = await pool.query("SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid()");
out('idle p4 end(): others before/after', { before: before.rows[0].n, after: after.rows[0].n });

// default pool max, idleTimeout defaults
out('Pool defaults', { max: pool.options.max, idleTimeoutMillis: pool.options.idleTimeoutMillis, connectionTimeoutMillis: pool.options.connectionTimeoutMillis, allowExitOnIdle: pool.options.allowExitOnIdle });
await pool.end();
