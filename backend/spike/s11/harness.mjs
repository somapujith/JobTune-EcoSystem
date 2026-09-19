// Process management + .dev.vars handling for the S11 spike (Windows-aware). Only PIDs started here are killed.
// Writes spike/s11/.dev.vars with ONLY local synthetic values (the throwaway container password) and ALWAYS removes it.
import { spawn, spawnSync } from 'node:child_process';
import { writeFileSync, rmSync, existsSync } from 'node:fs';
import { createServer } from 'node:net';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { localPassword, PROXY_HOSTPORT, isRealNeon } from './lib.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
export const BACKEND = resolve(HERE, '../..');
const WRANGLER_JS = resolve(BACKEND, 'node_modules/wrangler/bin/wrangler.js');
export const DEV_VARS = resolve(HERE, '.dev.vars');
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const started = new Set();
function descendants(rootPid) {
  try {
    const ps = spawnSync('powershell', ['-NoProfile', '-Command',
      'Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId | ConvertTo-Json -Compress'], { encoding: 'utf8', windowsHide: true });
    const rows = JSON.parse(ps.stdout);
    const kids = new Map();
    for (const r of rows) { (kids.get(r.ParentProcessId) || kids.set(r.ParentProcessId, []).get(r.ParentProcessId)).push(r.ProcessId); }
    const out = []; const stack = [rootPid];
    while (stack.length) { const p = stack.pop(); for (const c of kids.get(p) || []) { out.push(c); stack.push(c); } }
    return out;
  } catch { return []; }
}
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
function killTree(pid) {
  if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
  else { try { process.kill(pid, 'SIGKILL'); } catch { /* gone */ } }
}
export async function freePort(start) {
  for (let p = start; p < start + 20; p++) {
    const ok = await new Promise((res) => { const s = createServer(); s.once('error', () => res(false)); s.listen(p, '127.0.0.1', () => s.close(() => res(true))); });
    if (ok) return p;
  }
  throw new Error('no free port near ' + start);
}

// Synthetic, local-only. `extra` may override/add keys (e.g. a PgBouncer URL).
export function writeDevVars(extra = {}) {
  if (process.env.S11_BASE_URL) return; // testing an already-deployed throwaway Worker: nothing to write locally
  let vars;
  if (isRealNeon) {
    // HOSTED Neon branch (S11_REAL_NEON=1). The URLs come from the shell environment, are written ONLY to this git-ignored
    // .dev.vars for the duration of the run, and removed in the callers' finally blocks. No NEON_* proxy overrides: driver defaults.
    const need = (k) => { if (!process.env[k]) throw new Error(`S11_REAL_NEON=1 needs ${k}`); return process.env[k]; };
    const withApp = (u, app) => `${u}${u.includes('?') ? '&' : '?'}application_name=${app}`;
    vars = {
      DATABASE_URL: withApp(process.env.S11_WORKER_URL || need('S11_POOLED_URL'), 's11-worker'),
      ADMIN_DATABASE_URL: withApp(need('S11_DIRECT_URL'), 's11-admin'),
      ...extra,
    };
  } else {
    const pw = encodeURIComponent(localPassword());
    vars = {
      DATABASE_URL: `postgres://spike:${pw}@pg/spike_s11?sslmode=disable&application_name=s11-worker`,
      ADMIN_DATABASE_URL: `postgres://spike:${pw}@pg/spike_s11?sslmode=disable&application_name=s11-admin`,
      NEON_WS_PROXY: `${PROXY_HOSTPORT}/v1`,
      NEON_INSECURE_WS: '1',
      NEON_PIPELINE_CONNECT: 'false',
      ...extra,
    };
  }
  // S11_EXTRA_VARS="A=1,B=2" adds vars (e.g. NEON_POOL_QUERY_VIA_FETCH=1); S11_KEY guards the spike routes if the Worker is ever public
  for (const kv of (process.env.S11_EXTRA_VARS || '').split(',').filter(Boolean)) { const i = kv.indexOf('='); vars[kv.slice(0, i)] = kv.slice(i + 1); }
  if (process.env.S11_KEY) vars.S11_KEY = process.env.S11_KEY;
  writeFileSync(DEV_VARS, Object.entries(vars).map(([k, v]) => `${k}=${v}`).join('\n') + '\n');
}
export function removeDevVars() { try { if (existsSync(DEV_VARS)) rmSync(DEV_VARS); } catch { /* ignore */ } }

export async function startWorker({ basePort = 8930, config = 'spike/s11/wrangler.toml', persist = 'spike/s11/out/.wrangler-state' } = {}) {
  if (process.env.S11_BASE_URL) return { base: process.env.S11_BASE_URL.replace(/[/]$/, ''), external: true, logs: [], stopped: false };
  const port = await freePort(basePort);
  const inspector = await freePort(9330 + Math.floor(Math.random() * 200));
  const args = [WRANGLER_JS, 'dev', '--local', '--port', String(port), '--ip', '127.0.0.1', '--inspector-port', String(inspector),
    '-c', config, '--persist-to', persist, '--show-interactive-dev-session', 'false', '--log-level', 'log'];
  const env = { ...process.env, CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: 'false', WRANGLER_SEND_METRICS: 'false', NO_COLOR: '1', FORCE_COLOR: '0' };
  for (const k of ['DATABASE_URL', 'JWT_SECRET', 'NEON_DATABASE_URL']) delete env[k];
  const proc = spawn(process.execPath, args, { cwd: BACKEND, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  const w = { proc, port, logs: [], stopped: false, exited: false, base: `http://127.0.0.1:${port}` };
  started.add(proc.pid);
  const onData = (buf) => { for (const line of String(buf).split(/\r?\n/)) if (line.trim()) w.logs.push(line); };
  proc.stdout.on('data', onData); proc.stderr.on('data', onData);
  proc.on('exit', (code) => { w.exited = true; w.exitCode = code; });
  const t0 = Date.now();
  for (;;) {
    if (w.exited) throw new Error('wrangler exited early:\n' + w.logs.slice(-30).join('\n'));
    try { const r = await fetch(w.base + '/health', { signal: AbortSignal.timeout(4000) }); if (r.ok) break; } catch { /* not up yet */ }
    if (Date.now() - t0 > 150000) throw new Error('wrangler not ready in 150s:\n' + w.logs.slice(-30).join('\n'));
    await sleep(500);
  }
  return w;
}
export async function stopWorker(w) {
  if (!w || w.stopped || w.external) return;
  w.stopped = true;
  const kids = descendants(w.proc.pid);
  killTree(w.proc.pid);
  await sleep(800);
  for (const p of [w.proc.pid, ...kids].filter(alive)) killTree(p);
  await sleep(300);
  started.delete(w.proc.pid);
  return { pid: w.proc.pid, descendants: kids, leftover: [w.proc.pid, ...kids].filter(alive) };
}
export async function stopAll() { removeDevVars(); }
export const keyHeaders = () => (process.env.S11_KEY ? { 'x-s11-key': process.env.S11_KEY } : {});
export const get = async (w, path, timeoutMs = 60000) => {
  const r = await fetch(w.base + path, { headers: keyHeaders(), signal: AbortSignal.timeout(timeoutMs) });
  const text = await r.text();
  let body = null; try { body = JSON.parse(text); } catch { /* keep text */ }
  return { status: r.status, body, text: body ? undefined : text.slice(0, 600) };
};
