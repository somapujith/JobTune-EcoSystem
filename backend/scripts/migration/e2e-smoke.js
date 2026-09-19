#!/usr/bin/env node
'use strict';

/**
 * End-to-end acceptance smoke for the API (Render -> Cloudflare Workers cutover). Walks a real user journey over HTTP
 * against ANY base URL: the Worker directly, or the production frontend domain (through the Vercel rewrite).
 *
 *   node scripts/migration/e2e-smoke.js --base https://jobtune-ecosystem.somapujith.workers.dev
 *   node scripts/migration/e2e-smoke.js --base https://job-tune-eco-system.vercel.app --frontend https://job-tune-eco-system.vercel.app --allow-writes
 *
 * Read-only by default (health, public endpoints, auth gate, CORS). With --allow-writes it also creates ONE test
 * account (jt-e2e-<time>-<rand>@example.com, random password), then exercises signup, /me, plan gating, onboarding
 * flag, single-active-device replacement, refresh, logout, and bad-credentials handling. It never touches payments,
 * uploads or AI endpoints. The test account is left behind; the SQL to delete it is printed at the end.
 *
 * Exit code 0 only if every check passes. This is the cutover's acceptance test: a green run is required evidence,
 * but it does NOT replace the remaining human-only items in docs/migration/CUTOVER.md.
 */
const crypto = require('crypto');

function parseArgs(argv) {
  const o = { base: null, frontend: null, allowWrites: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--base') o.base = argv[++i];
    else if (a === '--frontend') o.frontend = argv[++i];
    else if (a === '--allow-writes') o.allowWrites = true;
    else if (a === '--help' || a === '-h') o.help = true;
    else throw new Error(`unknown option ${a}`);
  }
  return o;
}

const trim = (u) => String(u || '').replace(/\/+$/, '');

async function run(opts, log = console.log) {
  const base = trim(opts.base);
  const results = [];
  const check = (name, ok, detail = '') => {
    results.push({ name, ok: !!ok, detail });
    log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  | ' + detail : ''}`);
    return !!ok;
  };
  const call = async (method, path, { token, body, headers = {}, url } = {}) => {
    const t0 = Date.now();
    const init = { method, headers: { Accept: 'application/json', ...headers } };
    if (token) init.headers.Authorization = `Bearer ${token}`;
    if (body !== undefined) {
      init.headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    }
    const res = await fetch(url || base + path, init);
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* not JSON */ }
    return { status: res.status, json, text, headers: res.headers, ms: Date.now() - t0 };
  };
  const noStack = (r) => !/\bat\s+\S+\s+\(|node_modules|\/src\/|\\src\\|postgres(ql)?:\/\//i.test(r.text);

  log(`E2E smoke against ${base}${opts.allowWrites ? '  (writes enabled: one test account)' : '  (read-only)'}`);

  // ---- read-only: liveness, public surface, auth gate, error masking --------------------------------------------
  const health = await call('GET', '/api/health');
  check('GET /api/health is 200 with db connected', health.status === 200 && health.json && health.json.db === 'connected' && health.json.status === 'ok',
    `HTTP ${health.status} ${health.json ? JSON.stringify({ status: health.json.status, db: health.json.db }) : health.text.slice(0, 80)} in ${health.ms} ms`);
  check('security headers present on /api/health', !!health.headers.get('content-security-policy') && health.headers.get('x-content-type-options') === 'nosniff');

  const plans = await call('GET', '/api/subscriptions/plans');
  const planList = Array.isArray(plans.json) ? plans.json : plans.json && (plans.json.plans || plans.json.data);
  check('GET /api/subscriptions/plans returns the 3 plans', plans.status === 200 && Array.isArray(planList) && planList.length === 3,
    `HTTP ${plans.status}, ${Array.isArray(planList) ? planList.length + ' plans' : 'no list'}`);

  const gate = await call('GET', '/api/skills/history');
  check('a protected route without a token is 401', gate.status === 401, `HTTP ${gate.status}`);
  const unknown = await call('GET', '/api/definitely-not-a-route');
  check('an unknown /api route is 404 (not a 5xx)', unknown.status === 404, `HTTP ${unknown.status}`);
  const badLogin = await call('POST', '/api/auth/login', { body: { email: `nobody-${crypto.randomBytes(4).toString('hex')}@example.com`, password: 'wrong-password-1' } });
  check('login with unknown credentials is 400 "Invalid credentials" and leaks nothing', badLogin.status === 400 && badLogin.json && badLogin.json.error === 'Invalid credentials' && noStack(badLogin), `HTTP ${badLogin.status}`);
  const malformed = await call('POST', '/api/auth/login', { headers: { 'Content-Type': 'application/json' }, url: base + '/api/auth/login' });
  check('a request with no body does not leak internals', noStack(malformed) && malformed.status < 600, `HTTP ${malformed.status}`);

  if (opts.frontend) {
    const fe = trim(opts.frontend);
    const page = await call('GET', '', { url: fe + '/' });
    check('frontend home page is served (200, HTML)', page.status === 200 && /html/i.test(page.headers.get('content-type') || ''), `HTTP ${page.status}`);
    const viaFe = await call('GET', '', { url: fe + '/api/health' });
    check('the API is reachable THROUGH the frontend domain (rewrite works)', viaFe.status === 200 && viaFe.json && viaFe.json.db === 'connected', `HTTP ${viaFe.status}`);
    const okOrigin = await call('GET', '/api/health', { headers: { Origin: fe } });
    check('the frontend origin is allowed by CORS', okOrigin.headers.get('access-control-allow-origin') === fe, String(okOrigin.headers.get('access-control-allow-origin')));
    const badOrigin = await call('GET', '/api/health', { headers: { Origin: 'https://evil.example' } });
    check('a foreign origin gets no CORS grant and no internals', !badOrigin.headers.get('access-control-allow-origin') && noStack(badOrigin), `HTTP ${badOrigin.status}`);
  }

  // ---- writes: one test account through the whole session lifecycle ------------------------------------------------
  let email = null;
  if (!opts.allowWrites) {
    log('SKIP  account journey (signup, plan gate, device replacement, refresh, logout): pass --allow-writes to create one test account');
  } else {
    email = `jt-e2e-${Date.now()}-${crypto.randomBytes(3).toString('hex')}@example.com`;
    const password = crypto.randomBytes(12).toString('base64url') + 'aA1!';
    const signup = await call('POST', '/api/auth/signup', { body: { email, password, deviceName: 'e2e-smoke' } });
    const ok1 = check('signup creates the account (201 with token + refreshToken)', signup.status === 201 && signup.json && signup.json.token && signup.json.refreshToken, `HTTP ${signup.status} in ${signup.ms} ms`);
    if (ok1) {
      const tokenA = signup.json.token;
      const me = await call('GET', '/api/auth/me', { token: tokenA });
      check('GET /api/auth/me with the new token returns the account', me.status === 200 && JSON.stringify(me.json).toLowerCase().includes(email.toLowerCase()), `HTTP ${me.status}`);

      const gated = await call('GET', '/api/skills/history', { token: tokenA });
      check('plan gate: a no-plan account is refused with 403 PLAN_UPGRADE_REQUIRED', gated.status === 403 && gated.json && gated.json.code === 'PLAN_UPGRADE_REQUIRED', `HTTP ${gated.status} ${gated.json ? gated.json.code : ''}`);

      const onboarded = await call('GET', '/api/subscriptions/onboarded', { token: tokenA });
      check('GET /api/subscriptions/onboarded works (needs users.onboarding_completed) and is false for a new account', onboarded.status === 200 && onboarded.json && onboarded.json.onboarded === false, `HTTP ${onboarded.status} ${onboarded.text.slice(0, 60)}`);

      let login2 = await call('POST', '/api/auth/login', { body: { email, password, deviceName: 'e2e-smoke-2' } });
      let proxyNote = '';
      if (login2.status === 409 && login2.json && login2.json.code === 'ACCOUNT_IN_USE') {
        // Behind a proxy whose egress IP rotates (Vercel), the same device can look like a different one: the API answers
        // 409 ACCOUNT_IN_USE and the frontend then asks the user to continue here, i.e. logs in again with replaceDevice.
        // That confirmed flow is the correct behavior; a 409 that cannot be resolved this way is not.
        proxyNote = ' (409 ACCOUNT_IN_USE first: the client IP changed through the proxy; resolved with replaceDevice)';
        login2 = await call('POST', '/api/auth/login', { body: { email, password, deviceName: 'e2e-smoke-2', replaceDevice: true } });
      }
      const ok2 = check('logging in again returns a new session (a proxy-induced 409 is resolved by replaceDevice)', login2.status === 200 && login2.json && login2.json.token, `HTTP ${login2.status} ${login2.json && login2.json.code ? login2.json.code : ''}${proxyNote}`);
      if (ok2) {
        const stale = await call('GET', '/api/auth/me', { token: tokenA });
        check('the previous device token is now 401 SESSION_SUPERSEDED (single active device)', stale.status === 401 && stale.json && stale.json.code === 'SESSION_SUPERSEDED', `HTTP ${stale.status} ${stale.json ? stale.json.code : ''}`);
        const refreshed = await call('POST', '/api/auth/refresh', { body: { refreshToken: login2.json.refreshToken } });
        check('refresh issues a new access token', refreshed.status === 200 && refreshed.json && refreshed.json.token, `HTTP ${refreshed.status}`);
        const tokenB = (refreshed.json && refreshed.json.token) || login2.json.token;
        const meB = await call('GET', '/api/auth/me', { token: tokenB });
        check('the refreshed token works', meB.status === 200, `HTTP ${meB.status}`);
        const logout = await call('POST', '/api/auth/logout', { token: tokenB, body: { refreshToken: login2.json.refreshToken } });
        check('logout succeeds', logout.status === 200 && logout.json && logout.json.success === true, `HTTP ${logout.status}`);
        const after = await call('GET', '/api/auth/me', { token: tokenB });
        check('the token is rejected after logout', after.status === 401, `HTTP ${after.status}`);
      }
      const wrongPw = await call('POST', '/api/auth/login', { body: { email, password: password + 'x' } });
      check('a wrong password for a real account is 400 "Invalid credentials"', wrongPw.status === 400 && wrongPw.json && wrongPw.json.error === 'Invalid credentials', `HTTP ${wrongPw.status}`);
    }
  }

  const failed = results.filter((r) => !r.ok);
  log('');
  log(failed.length ? `RESULT: FAIL (${failed.length} of ${results.length} checks failed)` : `RESULT: PASS (${results.length} checks)`);
  if (email) {
    log(`Test account left behind: ${email}`);
    log(`Delete it with: DELETE FROM users WHERE email = '${email}';`);
  }
  return { results, failed, email };
}

async function main(argv = process.argv.slice(2)) {
  let opts;
  try { opts = parseArgs(argv); } catch (e) { console.error(e.message); return 64; }
  if (opts.help || !opts.base) {
    console.log('usage: node scripts/migration/e2e-smoke.js --base <api base URL> [--frontend <frontend URL>] [--allow-writes]');
    return opts.help ? 0 : 64;
  }
  const { failed } = await run(opts);
  return failed.length ? 1 : 0;
}

if (require.main === module) main().then((code) => process.exit(code), (e) => { console.error(e.message); process.exit(2); });

module.exports = { run, main, parseArgs };
