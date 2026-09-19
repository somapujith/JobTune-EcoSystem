/**
 * Local full-Worker smoke test (ADR-001 checklist items 21, 22; supports 19).
 *
 * Boots the REAL src/worker-entry.js (all mounted slices) in local workerd via `wrangler dev --local` and checks
 * that it starts, serves, fails closed and masks errors. SYNTHETIC ONLY: a random JWT secret is generated at run
 * time and DATABASE_URL points at an unreachable address, so no database or external service is ever contacted.
 * Run:  npm run migration:smoke      (from backend/; optional PORT env, default 8911)
 * It writes a temporary backend/.dev.vars and deletes it afterwards; it REFUSES to run if one already exists.
 * Proves: the bundle boots within workerd's startup limit, health degrades cleanly, 401 without token, CORS
 * allow/deny, masked 5xx (no stack) when the DB is unreachable, validation 400s.
 * Does NOT prove SQL, Neon behavior, or CPU limits.
 */
import { spawn, execSync } from 'node:child_process';
import { writeFileSync, rmSync, existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const BACKEND = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PORT = Number(process.env.PORT || 8911);
const secret = randomBytes(36).toString('base64url'); // synthetic, generated now
const devVars = resolve(BACKEND, '.dev.vars');
if (existsSync(devVars)) {
  console.error('Refusing to run: backend/.dev.vars already exists (it may hold real values). Move it aside first.');
  process.exit(2);
}
writeFileSync(devVars, `JWT_SECRET=${secret}\nDATABASE_URL=postgres://synthetic:synthetic@127.0.0.1:1/none\nFRONTEND_URL=https://app.example.test\nMOCK_AI=true\n`);

const t0 = Date.now();
const child = spawn('npx', ['wrangler', 'dev', '--local', '--port', String(PORT), '--ip', '127.0.0.1'], { cwd: BACKEND, shell: true, stdio: ['ignore', 'pipe', 'pipe'] });
let log = '';
child.stdout.on('data', (d) => (log += d));
child.stderr.on('data', (d) => (log += d));

const kill = () => { try { execSync(`taskkill /PID ${child.pid} /T /F`, { stdio: 'ignore' }); } catch {} try { rmSync(devVars, { force: true }); } catch {} };
process.on('exit', kill);

const results = [];
const check = (name, ok, extra = '') => results.push({ name, ok, extra });

try {
  let ready = false;
  for (let i = 0; i < 120 && !ready; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    try { const r = await fetch(`http://127.0.0.1:${PORT}/api/health`); ready = true; console.log('first response after', ((Date.now() - t0) / 1000).toFixed(1), 's, status', r.status); } catch {}
  }
  if (!ready) throw new Error('worker never became ready\n' + log.slice(-2000));
  const base = `http://127.0.0.1:${PORT}`;

  let r = await fetch(`${base}/api/health`); let j = await r.json();
  check('health 200 + degraded/unreachable (no DB)', r.status === 200 && j.db === 'unreachable' && j.status === 'degraded', JSON.stringify(j).slice(0, 120));
  check('security headers present', !!r.headers.get('content-security-policy') && r.headers.get('x-content-type-options') === 'nosniff');

  r = await fetch(`${base}/api/practice/problems`); check('protected route without token -> 401', r.status === 401, String(r.status));
  r = await fetch(`${base}/api/subscriptions/plans`); check('public route /subscriptions/plans reaches handler (DB down -> masked 5xx, not a stack)', r.status >= 500 && !(await r.text()).includes('at '), String(r.status));
  r = await fetch(`${base}/api/nope`); check('unknown /api route -> 404', r.status === 404, String(r.status));
  r = await fetch(`${base}/admin/`); check('/admin/ serves page', r.status === 200 && (r.headers.get('content-type') || '').includes('html'), `${r.status} ${r.headers.get('content-type')}`);
  r = await fetch(`${base}/api/health`, { headers: { Origin: 'https://evil.example' } }); const txt = await r.text();
  check('disallowed origin -> masked (no stack, no internal path)', !/at\s+\S+\s+\(|node_modules|\src\|\/src\//.test(txt), `${r.status} ${txt.slice(0, 80)}`);
  r = await fetch(`${base}/api/health`, { headers: { Origin: 'https://app.example.test' } });
  check('allowed origin gets ACAO', r.headers.get('access-control-allow-origin') === 'https://app.example.test', String(r.headers.get('access-control-allow-origin')));
  r = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'bad', password: 'x' }) });
  j = await r.json().catch(() => ({})); check('auth/login validation -> 400 JSON', r.status === 400 && typeof j.error === 'string', `${r.status} ${JSON.stringify(j).slice(0, 100)}`);
  r = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"email":' }); check('malformed JSON body -> 4xx/5xx masked, no stack', r.status >= 400 && !(await r.text()).includes('SyntaxError'), String(r.status));
} catch (e) {
  check('harness', false, String(e.message).slice(0, 800));
} finally {
  kill();
}
for (const x of results) console.log(x.ok ? 'PASS' : 'FAIL', x.name, x.extra ? `| ${x.extra}` : '');
const bad = results.filter((x) => !x.ok).length;
console.log(bad ? `\n${bad} FAILED` : '\nALL PASSED');
const startupErrors = log.split('\n').filter((l) => /error|exceeded|startup|limit/i.test(l)).slice(0, 8);
if (startupErrors.length) console.log('log lines of interest:\n' + startupErrors.join('\n'));
process.exit(bad ? 1 : 0);
