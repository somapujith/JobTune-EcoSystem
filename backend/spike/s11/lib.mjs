// Shared helpers for the local S11 spike (Node side). Local, disposable Docker only:
//   Postgres 17 `s11-pg` (127.0.0.1:55432), Neon wsproxy `s11-wsproxy` (127.0.0.1:55433).
// The synthetic container password is read from S11_PW_FILE (default below) -- never hard-coded, never logged.
import { readFileSync } from 'node:fs';

const PW_FILE = process.env.S11_PW_FILE || 'C:/Users/somap/AppData/Local/Temp/s11-local-pw.txt';
export function localPassword() {
  const t = readFileSync(PW_FILE, 'utf8').trim();
  const i = t.lastIndexOf(': ');
  return i >= 0 ? t.slice(i + 2).trim() : t;
}
// host `pg` is resolved INSIDE the wsproxy container (docker network s11net alias).
export const PROXY_HOSTPORT = process.env.S11_PROXY || '127.0.0.1:55433';
// S11_REAL_NEON=1 runs the Node-side scripts against a HOSTED Neon branch instead of the local containers:
//   S11_POOLED_URL  the branch's pooled connection string (host contains -pooler)
//   S11_DIRECT_URL  the branch's direct connection string
// (never put these in a file in the repo; export them in the shell for the run). Untested against Neon in this pass.
const REAL = process.env.S11_REAL_NEON === '1';
export const isRealNeon = REAL;
const need = (k) => { const v = process.env[k]; if (!v) throw new Error(`S11_REAL_NEON=1 needs ${k}`); return v; };
export function neonUrl(db = 'spike_s11') {
  return REAL ? need('S11_POOLED_URL') : `postgres://spike:${encodeURIComponent(localPassword())}@pg/${db}?sslmode=disable`;
}
export function directUrl(db = 'spike_s11') {
  return REAL ? need('S11_DIRECT_URL') : `postgres://spike:${encodeURIComponent(localPassword())}@127.0.0.1:55432/${db}`;
}
export function configureNeon(neonConfig, ws) {
  neonConfig.webSocketConstructor = ws;
  if (REAL) return; // hosted Neon: the driver's defaults (wss://<host>/v2, TLS by the proxy, pipelined password auth)
  neonConfig.useSecureWebSocket = false;
  neonConfig.wsProxy = (host, port) => `${PROXY_HOSTPORT}/v1?address=${host}:${port}`;
  neonConfig.pipelineConnect = false;
}
// PgBouncer (transaction pooling) fronting the same Postgres: container `s11-pgbouncer`, alias `pgb`, port 6432.
// Approximates the "-pooler" endpoint of Neon (PgBouncer, pool_mode=transaction). It is NOT Neon's real pooler.
export function poolerUrl(db = 'spike_s11') {
  return REAL ? need('S11_POOLED_URL') : `postgres://spike:${encodeURIComponent(localPassword())}@pgb:6432/${db}?sslmode=disable`;
}
// plain-`pg` connection configs for the background-contention / observer connections in node-pooler.mjs
export function pgPooledConfig(app) {
  return REAL ? { connectionString: need('S11_POOLED_URL'), application_name: app }
    : { host: '127.0.0.1', port: 55434, user: 'spike', password: localPassword(), database: 'spike_s11', application_name: app };
}
export function pgDirectConfig(app) {
  return REAL ? { connectionString: need('S11_DIRECT_URL'), application_name: app }
    : { host: '127.0.0.1', port: 55432, user: 'spike', password: localPassword(), database: 'spike_s11', application_name: app };
}
