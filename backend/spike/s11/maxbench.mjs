// Latency of ONE request that runs `par` parallel short queries (dashboard.js runs 8) for several Pool `max` values.
// Sequential requests (no cross-request contention), hold = 5 ms per query. Local loopback numbers: relative only.
import { startWorker, stopWorker, writeDevVars, removeDevVars, sleep } from './harness.mjs';
let w;
try {
  writeDevVars(); w = await startWorker();
  const med = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
  for (let i = 0; i < 3; i++) await fetch(w.base + '/s11/req?mode=end&hold=5&par=8'); // warm
  console.log('par  max  connections  median ms  (15 sequential requests, 5 ms queries)');
  for (const [par, max] of [[1, 1], [4, 1], [4, 2], [4, 4], [8, 1], [8, 2], [8, 4], [8, 10]]) {
    const ms = []; let conns = 0;
    for (let i = 0; i < 15; i++) {
      const t0 = Date.now();
      const r = await (await fetch(`${w.base}/s11/req?mode=end&hold=5&par=${par}&max=${max}`)).json();
      ms.push(Date.now() - t0); conns = Math.max(conns, r.connections);
      await sleep(50);
    }
    console.log(String(par).padStart(3), String(max).padStart(4), String(conns).padStart(12), String(med(ms)).padStart(10), ' min', Math.min(...ms), ' max', Math.max(...ms));
  }
} finally { await stopWorker(w); removeDevVars(); }
