// One failure scenario per process, so an uncaught exception is observable. Usage: node node-failure-scenario.mjs <scenario> [nolistener]
// Scenarios: idle-terminate | inflight-terminate | checkedout-idle-terminate | proxy-unreachable | inflight-proxy-kill | idle-proxy-kill
// proxy-kill scenarios print READY, then wait for the driver script to stop the wsproxy container (docker stop s11-wsproxy).
import ws from 'ws';
import { neonConfig, Pool } from '@neondatabase/serverless';
import { configureNeon, neonUrl, directUrl } from './lib.mjs';
import pg from 'pg';
const scenario = process.argv[2];
const noListener = process.argv[3] === 'nolistener';
configureNeon(neonConfig, ws);
if (scenario === 'proxy-unreachable') neonConfig.wsProxy = (h, p) => `127.0.0.1:1/v1?address=${h}:${p}`;
const log = (...a) => console.log('[' + scenario + (noListener ? '/nolistener' : '') + ']', ...a);
const short = (e) => e instanceof Error ? `${e.constructor.name}: ${e.message}${e.code ? ` [${e.code}]` : ''}` : `NON-ERROR ${Object.prototype.toString.call(e)} type=${e && e.type} msg=${e && e.message}`;
process.on('uncaughtException', (e, origin) => { log('UNCAUGHT', origin, short(e)); process.exitCode = 3; setTimeout(() => process.exit(3), 50); });
process.on('unhandledRejection', (e) => log('UNHANDLED REJECTION', short(e)));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const admin = new pg.Pool({ connectionString: directUrl(), max: 1 });
const killOthers = () => admin.query("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() AND application_name<>'s11-admin'");

const pool = new Pool({ connectionString: neonUrl() });
if (!noListener) pool.on('error', (e) => log('pool error event ->', short(e)));

if (scenario === 'idle-terminate') {
  await pool.query('SELECT 1'); // leaves 1 idle client in the pool
  log('idle client in pool; terminating its backend');
  await killOthers();
  await sleep(700);
  try { const r = await pool.query('SELECT 42 AS x'); log('next query after kill OK ->', r.rows[0].x, '(pool recovered)'); } catch (e) { log('next query rejected ->', short(e)); }
} else if (scenario === 'inflight-terminate') {
  const q = pool.query('SELECT pg_sleep(5)');
  await sleep(500);
  log('query in flight; terminating backend');
  await killOthers();
  try { await q; log('query resolved?!'); } catch (e) { log('query promise rejected ->', short(e)); }
  await sleep(500);
} else if (scenario === 'checkedout-idle-terminate') {
  const c = await pool.connect(); // like resumeChat: client checked out, awaits non-DB work, then queries again
  await c.query('SELECT 1');
  log('client checked out and idle (between queries); terminating its backend');
  await killOthers();
  await sleep(700);
  try { await c.query('SELECT 2'); log('query on dead checked-out client OK?!'); } catch (e) { log('query on dead client rejected ->', short(e)); }
  try { c.release(); } catch (e) { log('release threw', short(e)); }
  await sleep(300);
} else if (scenario === 'proxy-unreachable') {
  try { await pool.query('SELECT 1'); log('resolved?!'); } catch (e) { log('query promise rejected ->', short(e)); }
  await sleep(500);
} else if (scenario === 'inflight-proxy-kill') {
  const q = pool.query('SELECT pg_sleep(20)');
  await sleep(500);
  console.log('READY');
  try { await q; log('query resolved?!'); } catch (e) { log('query promise rejected ->', short(e)); }
  await sleep(500);
} else if (scenario === 'idle-proxy-kill') {
  await pool.query('SELECT 1');
  console.log('READY');
  await sleep(4000);
  try { const r = await pool.query('SELECT 42 AS x'); log('next query OK ->', r.rows[0].x); } catch (e) { log('next query rejected ->', short(e)); }
} else if (scenario === 'checkedout-proxy-kill') {
  const c = await pool.connect();
  await c.query('SELECT 1');
  console.log('READY');
  await sleep(4000);
  try { await c.query('SELECT 2'); log('query OK?!'); } catch (e) { log('query on dead checked-out client rejected ->', short(e)); }
  try { c.release(); } catch (e) { log('release threw', short(e)); }
}
try { await Promise.race([pool.end(), sleep(2000)]); } catch (e) { log('pool.end rejected', short(e)); }
await admin.end().catch(() => {});
log('done');
process.exit(process.exitCode || 0);
