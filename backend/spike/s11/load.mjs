// S11 connection-lifecycle / load test (ADR checklist item 20), LOCAL Postgres only.
// Starts the spike worker (wrangler dev --local), fires N PARALLEL requests per (mode, N, par, max) case, each
// creating its own per-request Pool through the production db.js path, and samples Postgres DIRECTLY
// (pg_stat_activity for application_name = 's11-worker') every 20 ms before / during / after.
//   modes: noend | end | waituntil (production: dbMiddleware -> ctx.waitUntil(db.release()))  [waituntil via /s11/mw/req]
// Usage (from backend/):  node spike/s11/load.mjs [--quick] [--cases=name1,name2]
import pg from 'pg';
import { writeFileSync } from 'node:fs';
import { directUrl, poolerUrl, isRealNeon } from './lib.mjs';
import { startWorker, stopWorker, writeDevVars, removeDevVars, sleep, keyHeaders } from './harness.mjs';

const QUICK = process.argv.includes('--quick');
// --pooler: DATABASE_URL points at PgBouncer (transaction mode, default_pool_size 20) instead of Postgres directly.
// Server connections then belong to the pooler (they stay warm and carry whichever client's application_name), so we
// count every non-observer connection in the database instead of application_name = 's11-worker'.
const POOLER = process.argv.includes('--pooler');
const HOLD = 1000;
const admin = new pg.Pool({ connectionString: directUrl(), max: 2, application_name: 's11-observer' });
const count = async () => {
  const r = await admin.query(`SELECT count(*)::int AS total, count(*) FILTER (WHERE state='active')::int AS active,
    count(*) FILTER (WHERE state='idle')::int AS idle FROM pg_stat_activity WHERE datname = current_database() AND ${POOLER ? "application_name <> 's11-observer'" : "application_name = 's11-worker'"}`);
  return r.rows[0];
};
const killWorkerBackends = () => (POOLER ? Promise.resolve() : admin.query("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE application_name = 's11-worker'"));
const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * p))] : null; };

async function runCase(w, c) {
  const { mode, n, par = 1, max, hold = HOLD } = c;
  const path = mode === 'waituntil' ? `/s11/mw/req?hold=${hold}&par=${par}` : `/s11/req?mode=${mode}&hold=${hold}&par=${par}${max ? `&max=${max}` : ''}`;
  const base = await count();
  const samples = [];
  let stop = false;
  const t0 = Date.now();
  const sampler = (async () => { while (!stop) { const s = await count().catch(() => null); if (s) samples.push([Date.now() - t0, s.total]); await sleep(20); } })();
  const results = await Promise.all(Array.from({ length: n }, async () => {
    const r0 = Date.now();
    try {
      const r = await fetch(w.base + path, { headers: keyHeaders(), signal: AbortSignal.timeout(60000) });
      const t = await r.text(); let b = null; try { b = JSON.parse(t); } catch { /* html */ }
      return { status: r.status, ms: Date.now() - r0, body: b, text: b ? undefined : t.slice(0, 120) };
    } catch (e) { return { status: 'ERR', ms: Date.now() - r0, text: String(e).slice(0, 120) }; }
  }));
  const tResp = Date.now() - t0;
  // keep sampling until back to baseline (or 25 s)
  let releasedAt = null;
  const deadline = Date.now() + 25000;
  while (Date.now() < deadline) {
    const s = samples[samples.length - 1];
    if (s && s[0] >= tResp && s[1] <= base.total) { releasedAt = s[0]; break; }
    await sleep(20);
  }
  stop = true; await sampler;
  const final = await count();
  const okN = results.filter((r) => r.status === 200).length;
  const errs = {};
  for (const r of results.filter((x) => x.status !== 200)) {
    const m = (r.body && r.body.error && r.body.error.message) || r.text || String(r.status);
    errs[m.slice(0, 90)] = (errs[m.slice(0, 90)] || 0) + 1;
  }
  const conns = results.filter((r) => r.body && r.body.connections).map((r) => r.body.connections);
  const out = {
    ...c, ok: okN, failed: n - okN, errors: errs,
    baseline: base.total, peak: Math.max(...samples.map((s) => s[1])), connectionsPerRequest: conns.length ? Math.max(...conns) : null,
    reqMsP50: pct(results.map((r) => r.ms), 0.5), reqMsP95: pct(results.map((r) => r.ms), 0.95),
    lastResponseMs: tResp, backToBaselineMs: releasedAt, releaseLatencyAfterLastResponseMs: releasedAt === null ? null : Math.max(0, releasedAt - tResp),
    finalCount: final.total, leaked: Math.max(0, final.total - base.total),
  };
  if (final.total > base.total) { await killWorkerBackends(); await sleep(700); }  // reset for the next case (leak reported above)
  return out;
}

const cases = [];
const Ns = QUICK ? [20] : [20, 50];
for (const mode of ['waituntil', 'end', 'noend']) for (const n of Ns) cases.push({ name: `${mode}-N${n}`, mode, n });
if (!QUICK) {
  // how many connections does ONE request hold when its handler runs queries in parallel? (dashboard.js does 4)
  for (const par of [4, 8]) cases.push({ name: `waituntil-par${par}-N10`, mode: 'waituntil', n: 10, par });
  cases.push({ name: 'end-par4-max1-N10', mode: 'end', n: 10, par: 4, max: 1 });
  cases.push({ name: 'end-par4-max4-N10', mode: 'end', n: 10, par: 4, max: 4 });
  cases.push({ name: 'end-par4-max10-N10', mode: 'end', n: 10, par: 4, max: 10 });
  // exhaustion sweep: 1 connection per request, hold 1 s, PG max_connections = 100 (3 reserved for superusers)
  for (const n of [80, 95, 100, 110, 130]) cases.push({ name: `waituntil-exhaust-N${n}`, mode: 'waituntil', n });
  for (const n of [20, 30]) cases.push({ name: `waituntil-par4-exhaust-N${n}`, mode: 'waituntil', n, par: 4 });
}
// dashboard.js-shaped requests: 8 parallel short queries in ONE request. `max10` = the driver default BEFORE the
// database.worker.js change; the un-suffixed cases use the production config (max 2).
if (!QUICK) {
  cases.push({ name: 'end-par8-max10-N12', mode: 'end', n: 12, par: 8, max: 10, hold: 250 });
  cases.push({ name: 'end-par8-max10-N14', mode: 'end', n: 14, par: 8, max: 10, hold: 250 });
  cases.push({ name: 'end-par8-max10-N16', mode: 'end', n: 16, par: 8, max: 10, hold: 250 });
  for (const n of [14, 40, 55, 60]) cases.push({ name: `waituntil-par8-prod-N${n}`, mode: 'waituntil', n, par: 8, hold: 250 });
}
if (POOLER) {
  cases.length = 0;
  cases.push({ name: 'pooler-waituntil-N50', mode: 'waituntil', n: 50 });
  cases.push({ name: 'pooler-waituntil-N130', mode: 'waituntil', n: 130 });
  cases.push({ name: 'pooler-waituntil-N200', mode: 'waituntil', n: 200 });
  cases.push({ name: 'pooler-end-N50', mode: 'end', n: 50 });
  cases.push({ name: 'pooler-noend-N50', mode: 'noend', n: 50 });
  cases.push({ name: 'pooler-waituntil-par8-N40', mode: 'waituntil', n: 40, par: 8, hold: 250 });
  cases.push({ name: 'pooler-waituntil-par8-N80', mode: 'waituntil', n: 80, par: 8, hold: 250 });
}
const only = (process.argv.find((a) => a.startsWith('--cases=')) || '').slice(8).split(',').filter(Boolean);
const run = only.length ? cases.filter((c) => only.includes(c.name)) : cases;

let w; const all = [];
try {
  writeDevVars(POOLER && !isRealNeon ? { DATABASE_URL: `${poolerUrl()}&application_name=s11-worker` } : {});
  w = await startWorker();
  const mc = await admin.query('SHOW max_connections');
  console.log(`max_connections=${mc.rows[0].max_connections}  hold=${HOLD}ms  cases=${run.length}`);
  await fetch(w.base + '/s11/req?mode=end&hold=10', { headers: keyHeaders() }); await sleep(500);   // warm the isolate
  console.log('case'.padEnd(28), 'ok/N'.padStart(7), 'conn/req'.padStart(9), 'base->peak'.padStart(11), 'p50/p95 ms'.padStart(12), 'release ms'.padStart(11), 'leaked'.padStart(7), 'errors');
  for (const c of run) {
    await sleep(1500);
    const r = await runCase(w, c);
    all.push(r);
    console.log(c.name.padEnd(28), `${r.ok}/${r.n}`.padStart(7), String(r.connectionsPerRequest).padStart(9), `${r.baseline}->${r.peak}`.padStart(11),
      `${r.reqMsP50}/${r.reqMsP95}`.padStart(12), String(r.releaseLatencyAfterLastResponseMs).padStart(11), String(r.leaked).padStart(7), JSON.stringify(r.errors));
  }
} finally {
  await stopWorker(w).catch(() => {});
  removeDevVars();
  await admin.end().catch(() => {});
  try { writeFileSync(POOLER ? 'spike/s11/out/load-pooler.json' : only.length ? 'spike/s11/out/load-subset.json' : QUICK ? 'spike/s11/out/load-quick.json' : 'spike/s11/out/load.json', JSON.stringify(all, null, 2)); } catch { /* ignore */ }
}
