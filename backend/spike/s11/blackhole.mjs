// A TCP listener that accepts connections and never answers (a black-holed database endpoint / wsproxy).
// Starts the spike worker, sends ONE request whose driver is pointed at it, reports how long until it fails.
// Usage: node spike/s11/blackhole.mjs [clientTimeoutMs=20000] [path=/s11/mw/bare]
import { createServer } from 'node:net';
import { startWorker, stopWorker, writeDevVars, removeDevVars } from './harness.mjs';
const clientTimeout = Number(process.argv[2] || 20000);
const path = process.argv[3] || '/s11/mw/bare';
const srv = createServer((sock) => { sock.on('error', () => {}); /* never respond */ });
await new Promise((r) => srv.listen(55555, '127.0.0.1', r));
let w;
try {
  writeDevVars(); w = await startWorker();
  const strip = (l) => l.replace(/\x1b\[[0-9;]*m/g, '');
  const seen = w.logs.length;
  const t0 = Date.now();
  let out;
  try {
    const r = await fetch(`${w.base}${path}?proxy=127.0.0.1:55555/v1`, { signal: AbortSignal.timeout(clientTimeout) });
    out = { status: r.status, body: (await r.text()).slice(0, 200) };
  } catch (e) { out = { clientGaveUpAfterMs: Date.now() - t0, error: String(e).slice(0, 100) }; }
  console.log('black-hole endpoint ->', JSON.stringify(out), 'elapsed', Date.now() - t0, 'ms');
  for (const l of w.logs.slice(seen)) console.log('  log:', strip(l).slice(0, 200));
} finally { await stopWorker(w); removeDevVars(); srv.close(); }
