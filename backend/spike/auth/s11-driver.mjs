// S11 concurrency / connection-release driver (Node). See the header of s11.mjs for how to run.
//   node spike/auth/s11-driver.mjs [N=10] [base=http://127.0.0.1:8788]
//
// For each mode (noend | end | waituntil) it fires N PARALLEL real HTTP requests at /s11/req (each one builds
// its own Pool via the real database.worker.js getPool(env)), then samples /s11/activity
// (SELECT count(*) FROM pg_stat_activity WHERE datname = current_database()) at several delays.
// The observer itself holds 1 connection while it measures, so a quiescent database shows total>=1.
//
// NOT RUN by the author (no database access). Aborts immediately if the worker reports {skipped:true}.

const N = Math.min(Math.max(parseInt(process.argv[2] || '10', 10), 1), 25);
const BASE = process.argv[3] || 'http://127.0.0.1:8788';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const get = async (p) => { const r = await fetch(BASE + p); return { status: r.status, body: await r.json().catch(() => null) }; };

const first = await get('/s11/activity');
if (!first.body || first.body.skipped) {
  console.error('Worker returned skipped (no DATABASE_URL in spike/auth/.dev.vars) or is not up:', JSON.stringify(first));
  process.exit(2);
}

const report = [];
for (const mode of ['noend', 'end', 'waituntil']) {
  await sleep(3000);
  const baseline = (await get('/s11/activity')).body;
  const t0 = Date.now();
  const settled = await Promise.allSettled(Array.from({ length: N }, () => get(`/s11/req?mode=${mode}&hold=400`)));
  const okCount = settled.filter((s) => s.status === 'fulfilled' && s.value.status === 200).length;
  const errors = settled
    .map((s) => (s.status === 'fulfilled' ? s.value.body && s.value.body.error : { message: String(s.reason) }))
    .filter(Boolean).slice(0, 3);
  const samples = {};
  let prev = 0;
  for (const delay of [500, 2000, 6000, 15000]) {
    await sleep(delay - prev);
    prev = delay;
    samples[delay] = (await get('/s11/activity')).body;
  }
  report.push({ mode, N, okCount, wallMs: Date.now() - t0, baselineTotal: baseline && baseline.total,
    afterMs: Object.fromEntries(Object.entries(samples).map(([d, s]) => [d, s && s.total])), errors });
}

console.log(`\nS11 connection-release test, N=${N} parallel requests per mode`);
console.log('mode       ok/N   baseline  +0.5s  +2s  +6s  +15s   (pg_stat_activity total for this database)');
for (const r of report) {
  console.log(`${r.mode.padEnd(10)} ${String(r.okCount).padStart(2)}/${r.N}   ${String(r.baselineTotal).padStart(8)}  ${String(r.afterMs[500]).padStart(5)} ${String(r.afterMs[2000]).padStart(4)} ${String(r.afterMs[6000]).padStart(4)} ${String(r.afterMs[15000]).padStart(5)}`);
  if (r.errors.length) console.log('   sample errors:', JSON.stringify(r.errors));
}
console.log('\nRead: a mode whose total does not return to ~baseline by +15s is leaking connections.');
console.log('Pass criterion for the port: `end` and/or `waituntil` return to baseline; `noend` shows what a forgotten teardown costs.');
console.log('\nRAW:', JSON.stringify(report));
