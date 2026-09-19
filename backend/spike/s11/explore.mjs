// Ad-hoc exploration helper: node spike/s11/explore.mjs "/s11/req?mode=end" "/s11/req?mode=waituntil" ...
// Starts the worker, hits each path in order (1s apart), prints the response and the worker log lines it produced.
import { startWorker, stopWorker, writeDevVars, removeDevVars, get, sleep } from './harness.mjs';
let w;
try {
  writeDevVars();
  w = await startWorker();
  const strip = (l) => l.replace(/\x1b\[[0-9;]*m/g, '');
  let seen = w.logs.length;
  for (const p of process.argv.slice(2)) {
    const r = await get(w, p).catch((e) => ({ status: 'FETCH-ERR', text: String(e) }));
    await sleep(1500);
    console.log('>>', p, r.status, JSON.stringify(r.body || r.text).slice(0, 700));
    for (const l of w.logs.slice(seen)) console.log('   log:', strip(l).slice(0, 300));
    seen = w.logs.length;
  }
} finally { await stopWorker(w); removeDevVars(); }
