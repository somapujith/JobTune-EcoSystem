// Starts the spike worker, runs /s11 functional tests + module-level-pool + failure scenarios, prints results.
// Usage (from backend/):  node spike/s11/run-functional.mjs [outfile.json]
import { writeFileSync } from 'node:fs';
import { startWorker, stopWorker, writeDevVars, removeDevVars, get, sleep } from './harness.mjs';
const outFile = process.argv[2] || 'spike/s11/out/functional.json';
let w;
const results = {};
try {
  writeDevVars();
  w = await startWorker();
  const f = await get(w, '/s11');
  results.functional = f;
  console.log(`/s11 status=${f.status} passed=${f.body && f.body.passed}/${f.body && f.body.total}`);
  for (const r of (f.body && f.body.results) || []) console.log(`  ${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.ok ? '' : '  ' + JSON.stringify(r).slice(0, 400)}`);

  // module-level pool: 3 sequential requests, then one after >10s idle
  results.shared = [];
  for (let i = 0; i < 3; i++) { results.shared.push(await get(w, '/s11/shared')); await sleep(300); }
  console.log('/s11/shared:', JSON.stringify(results.shared.map((s) => s.body || s.text)));
  writeFileSync('spike/s11/out/worker-log.txt', w.logs.join('\n'));
} finally {
  await stopWorker(w);
  removeDevVars();
  try { writeFileSync(outFile, JSON.stringify(results, null, 2)); } catch { /* out dir */ }
}
