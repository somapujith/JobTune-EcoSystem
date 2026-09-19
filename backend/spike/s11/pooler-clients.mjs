// Through the transaction pooler, `noend` costs nothing on the SERVER side (the pooler frees a backend after each
// transaction), so the leak moves to the pooler's CLIENT side (Neon: max_client_conn 10,000). This measures PgBouncer's
// own client count (SHOW POOLS cl_active/cl_waiting, SHOW CLIENTS) after N `noend` vs `waituntil` requests.
// Usage: node spike/s11/pooler-clients.mjs [N=50]
import pg from 'pg';
import { localPassword, poolerUrl } from './lib.mjs';
import { startWorker, stopWorker, writeDevVars, removeDevVars, sleep } from './harness.mjs';

const N = Number(process.argv[2] || 50);
const adm = new pg.Client({ host: '127.0.0.1', port: 55434, user: 'spike', password: localPassword(), database: 'pgbouncer' });
await adm.connect();
const clients = async () => {
  const r = await adm.query('SHOW CLIENTS');
  return r.rows.filter((c) => c.database === 'spike_s11' && c.user === 'spike').length;
};
let w;
try {
  writeDevVars({ DATABASE_URL: `${poolerUrl()}&application_name=s11-worker` });
  w = await startWorker();
  console.log('mode        N   clients-before  +0.3s  +3s  +12s  +20s   (PgBouncer client connections, database spike_s11)');
  for (const mode of ['waituntil', 'noend']) {
    const path = mode === 'waituntil' ? '/s11/mw/req?hold=300' : '/s11/req?mode=noend&hold=300';
    const before = await clients();
    await Promise.all(Array.from({ length: N }, () => fetch(w.base + path).then((r) => r.text())));
    const row = [];
    let prev = 0;
    for (const t of [300, 3000, 12000, 20000]) { await sleep(t - prev); prev = t; row.push(await clients()); }
    console.log(mode.padEnd(11), String(N).padStart(3), String(before).padStart(15), row.map((x) => String(x).padStart(6)).join(''));
  }
} finally { await stopWorker(w); removeDevVars(); await adm.end().catch(() => {}); }
