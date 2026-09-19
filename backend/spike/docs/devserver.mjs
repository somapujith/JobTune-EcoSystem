// Start / stop `wrangler dev --local` for the spike and ALWAYS clean up the process tree.
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const backend = path.resolve(here, '..', '..');
const wranglerBin = path.join(backend, 'node_modules', 'wrangler', 'bin', 'wrangler.js');

let child = null;
const log = [];

export function killTree() {
  if (!child || child.exitCode !== null || !child.pid) return;
  const pid = child.pid;
  try {
    if (process.platform === 'win32') spawnSync('taskkill', ['/T', '/F', '/PID', String(pid)], { stdio: 'ignore' });
    else process.kill(-pid, 'SIGKILL');
  } catch {}
  child = null;
}

export async function startDev({ config = 'spike/docs/wrangler.toml', port = 8871, inspectorPort = 9441, timeoutMs = 120000 } = {}) {
  log.length = 0; // fresh log per session (the 'Ready on' match must come from THIS wrangler)
  child = spawn(
    process.execPath,
    [wranglerBin, 'dev', '--local', '--port', String(port), '--inspector-port', String(inspectorPort), '-c', config],
    { cwd: backend, env: { ...process.env, NO_COLOR: '1', WRANGLER_SEND_METRICS: 'false', CI: '' }, stdio: ['ignore', 'pipe', 'pipe'], detached: process.platform !== 'win32' }
  );
  child.stdout.on('data', (d) => log.push(String(d)));
  child.stderr.on('data', (d) => log.push(String(d)));
  for (const sig of ['exit', 'SIGINT', 'SIGTERM']) process.on(sig, () => { killTree(); if (sig !== 'exit') process.exit(1); });

  const start = Date.now();
  let base = null;
  while (Date.now() - start < timeoutMs) {
    if (child.exitCode !== null) throw new Error('wrangler exited early:\n' + log.join('').slice(-3000));
    const m = log.join('').match(/Ready on (http:\/\/[^\s]+)/);
    if (m) {
      base = m[1];
      break;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  if (!base) throw new Error('wrangler did not become ready:\n' + log.join('').slice(-3000));
  // readiness poll on /health
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(base + '/health', { signal: AbortSignal.timeout(5000) });
      if (r.ok && (await r.json()).spike === 'jobtune-spike-docs') return { base, log };
      // another wrangler (e.g. a different project) may own this port: fall through and keep polling
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('/health never answered');
}

export function stopDev() {
  killTree();
}
