#!/usr/bin/env node
'use strict';

/**
 * auth-matrix.js  (ADR-001 T4.3, section 6.2, checklist items 8, 10, 11)
 *
 * The auth cross-verification matrix between Render and Workers, run against ONE dedicated test account:
 *
 *   C1  Render-issued token accepted by Workers                                   (item 8, cell 1)
 *   C2  Workers-issued token accepted by Render                                   (item 8, cell 2)
 *   C3  token signed with a WRONG secret rejected by both (HS256)                 (item 8, cells 3 and 4)
 *   C4  alg:none token rejected by both
 *   C5  HS512 token rejected by both (wrong secret; also with the real secret when JT_JWT_SECRET is set: proves the pin)
 *   C6  expired token rejected by both (needs JT_JWT_SECRET; otherwise SKIPPED)
 *   C7  session supersede, per server: login A then login B => A gets 401 with code "SESSION_SUPERSEDED" (exact), B works,
 *       and A stays superseded on the OTHER server too (shared database)          (item 10)
 *   C8  same-IP re-login is NOT a 409, per server                                 (item 10, ADR 4.2)
 *   C9  cross-device (different client IP via X-Forwarded-For / CF-Connecting-IP headers), per server: the second login
 *       is 409 ACCOUNT_IN_USE unless replaceDevice. Only meaningful where the server honours client-supplied IP headers
 *       (a local wrangler dev does; production Cloudflare and Render do not): otherwise INCONCLUSIVE and needs a second
 *       network (human step, runbook item 10)
 *   C10 logout with an invalid/expired access token still revokes via the refreshToken fallback, per server (item 11);
 *       control: the same logout WITHOUT the refreshToken revokes nothing
 *
 * Every probe of a token is GET <probe-path> (default /api/subscriptions/my-plan: authenticated, read-only, no plan gate),
 * so the strict 20/15min /api/auth limiter on Render only counts logins and logouts (about 11 requests per run; the runner
 * paces itself to --render-auth-budget, default 18 per 15 minutes).
 *
 *   node scripts/migration/auth-matrix.js --render <url> --workers <url> --test-account-only
 *
 * ENVIRONMENT (never printed or stored)
 *   JT_TEST_EMAIL, JT_TEST_PASSWORD   the dedicated test account (required; logging in replaces its active session)
 *   JT_JWT_SECRET                     optional. The secret shared by both servers, used ONLY to forge an expired token and an
 *                                     HS512-with-the-real-secret token locally. Without it C5b and C6 are skipped and C10
 *                                     uses a wrong-secret token as the "invalid access token".
 *
 * OPTIONS  --probe-path <p> | --render-auth-budget <n> (18; 0 = unlimited) | --workers-auth-per-minute <n> (0 = unlimited)
 *          | --delay-ms <n> (300) | --timeout-ms <n> | --dry-run | --json | --strict (skipped/inconclusive also fail)
 *
 * Exit codes: 0 no check failed | 1 a check failed (or --strict and a check was skipped/inconclusive) |
 *             2 CRITICAL: a forged token (wrong secret / alg none / HS512 / expired) was ACCEPTED by a server | 64 usage / refusal.
 */

const crypto = require('crypto');
const {
  EXIT, UsageError, parseArgv, toInt, assertTwoDistinctTargets, httpCall, login, ENV, Pacer, runMain, defaultIo, helpText,
} = require('./lib/common');

const SPEC = {
  flags: { '--test-account-only': 'testAccountOnly', '--dry-run': 'dryRun', '--json': 'json', '--strict': 'strict' },
  values: {
    '--render': 'render', '--workers': 'workers', '--probe-path': 'probePath', '--render-auth-budget': 'renderAuthBudget',
    '--workers-auth-per-minute': 'workersAuthPerMinute', '--delay-ms': 'delayMs', '--timeout-ms': 'timeoutMs',
  },
  lists: {},
};

const SUPERSEDED_MESSAGE = 'This account was signed in on another device. Sign in again to use JobTune on this device.';
const FORGED_SPOOF_A = '203.0.113.10'; // TEST-NET-3 (RFC 5737), never a real client
const FORGED_SPOOF_B = '203.0.113.11';

/* ------------------------------------------------------------------------- */
/* Token forging (local, never sent anywhere but the servers under test)      */
/* ------------------------------------------------------------------------- */

const b64u = (buf) => Buffer.from(buf).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
const b64uJson = (o) => b64u(JSON.stringify(o));

function decodeClaims(token) {
  try { return JSON.parse(Buffer.from(String(token).split('.')[1], 'base64').toString('utf8')); } catch (e) { return null; }
}

/** alg: HS256 | HS384 | HS512 | none */
function forgeJwt({ alg, secret, claims }) {
  const head = b64uJson({ alg, typ: 'JWT' });
  const body = b64uJson(claims);
  if (alg === 'none') return `${head}.${body}.`;
  const hash = { HS256: 'sha256', HS384: 'sha384', HS512: 'sha512' }[alg];
  if (!hash) throw new Error(`forgeJwt: unsupported alg ${alg}`);
  return `${head}.${body}.${b64u(crypto.createHmac(hash, secret).update(`${head}.${body}`).digest())}`;
}

/* ------------------------------------------------------------------------- */
/* The matrix                                                                 */
/* ------------------------------------------------------------------------- */

const PASS = 'pass';
const FAIL = 'fail';
const SKIP = 'skip';
const INCONCLUSIVE = 'inconclusive';
const CRITICAL = 'critical';

async function runAuthMatrix(opts, io) {
  const { render, workers } = assertTwoDistinctTargets(opts.render, opts.workers);
  const email = io.env[ENV.EMAIL];
  const password = io.env[ENV.PASSWORD];
  const secret = io.env[ENV.JWT_SECRET] || null;
  const probePath = opts.probePath || '/api/subscriptions/my-plan';
  const timeoutMs = opts.timeoutMs;

  if (!opts.dryRun) {
    if (!email || !password) throw new UsageError(`${ENV.EMAIL} and ${ENV.PASSWORD} must be set (dedicated test account)`);
    if (!opts.testAccountOnly) throw new UsageError('refusing to log in: pass --test-account-only to confirm the account in JT_TEST_EMAIL is a dedicated test account (every login here replaces its active session)');
  }

  const pacers = {
    [render]: new Pacer({ delayMs: opts.delayMs, budget: opts.renderAuthBudget, sleepImpl: io.sleepImpl, log: io.log }),
    [workers]: new Pacer({ delayMs: opts.delayMs, budget: opts.workersAuthPerMinute, windowMs: 60 * 1000, sleepImpl: io.sleepImpl, log: io.log }),
  };
  const name = (base) => (base === render ? 'Render' : 'Workers');
  const other = (base) => (base === render ? workers : render);

  const doLogin = async (base, extra = {}) => {
    await pacers[base].wait();
    return login({ base, email, password, fetchImpl: io.fetchImpl, timeoutMs, ...extra });
  };
  const probe = (base, token) => httpCall({ url: base + probePath, headers: token ? { Authorization: `Bearer ${token}` } : {}, timeoutMs, fetchImpl: io.fetchImpl });
  const logout = async (base, { bearer, refreshToken }) => {
    await pacers[base].wait();
    return httpCall({
      url: base + '/api/auth/logout', method: 'POST', body: refreshToken ? { refreshToken } : {}, timeoutMs, fetchImpl: io.fetchImpl,
      headers: bearer ? { Authorization: `Bearer ${bearer}` } : {},
    });
  };
  const isOk = (r) => r.status === 200;
  const superseded = (r) => r.status === 401 && r.json && r.json.code === 'SESSION_SUPERSEDED';
  const unauthorized = (r) => r.status === 401 && r.json && r.json.error === 'Unauthorized' && r.json.code === undefined;
  const brief = (r) => (r.status === 0 ? `network error (${r.error})` : `HTTP ${r.status}${r.json && r.json.code ? ` ${r.json.code}` : ''}${r.json && r.json.error ? ` "${String(r.json.error).slice(0, 60)}"` : ''}`);

  const checks = [];
  const record = (id, title, status, detail) => { checks.push({ id, title, status, detail }); io.log(`  ${status.toUpperCase().padEnd(12)} ${id.padEnd(9)} ${title}${detail ? `\n      ${detail}` : ''}`); };

  io.log(`Auth matrix: Render=${render}  Workers=${workers}  probe=${probePath}`);
  io.log(`test account: ${email ? '(from env)' : '(not set)'}${secret ? ', JWT secret available for local forging' : ', no JWT secret (expired-token and HS512-with-real-secret cells will be skipped)'}`);

  if (opts.dryRun) {
    [
      'C1  login on Render (replaceDevice), probe the token on Workers -> expect 200',
      'C2  login on Workers (replaceDevice), probe the token on Render -> expect 200',
      'C3  forge HS256 token with a random wrong secret; probe both -> expect 401 {"error":"Unauthorized"}',
      'C4  forge alg:none token; probe both -> expect 401',
      `C5  forge HS512 token (wrong secret${secret ? ' and real secret' : ''}); probe both -> expect 401`,
      secret ? 'C6  forge an expired HS256 token with the real secret; probe both -> expect 401' : 'C6  (skipped: no JT_JWT_SECRET)',
      'C7  per server: login A, login B (same IP), probe A -> expect 401 code SESSION_SUPERSEDED, probe B -> 200, probe A on the other server -> 401 SESSION_SUPERSEDED',
      'C8  per server: login twice from the same IP without replaceDevice -> expect 200 (not 409)',
      `C9  per server: login A / login B with spoofed X-Forwarded-For + CF-Connecting-IP (${FORGED_SPOOF_A} / ${FORGED_SPOOF_B}) -> expect 409 ACCOUNT_IN_USE where the server honours them`,
      'C10 per server: logout with an invalid access token + refreshToken -> expect 200 and the session revoked; control without refreshToken revokes nothing',
    ].forEach((l) => io.log(`  would ${l}`));
    return { checks: [], exitCode: EXIT.OK, dryRun: true };
  }

  // ---- C1 / C2: cross verification -------------------------------------------------------------
  const tokenR = await doLogin(render, { replaceDevice: true });
  if (!tokenR.ok) throw new UsageError(`login on Render failed (${brief({ status: tokenR.status, json: tokenR.body, error: tokenR.error })}); nothing was verified`);
  const c1 = await probe(workers, tokenR.token);
  record('C1', 'Render-issued token accepted by Workers', isOk(c1) ? PASS : FAIL, `Workers answered ${brief(c1)}`);

  const tokenW = await doLogin(workers, { replaceDevice: true });
  if (!tokenW.ok) {
    record('C2', 'Workers-issued token accepted by Render', FAIL, `login on Workers failed: HTTP ${tokenW.status}${tokenW.error ? ` ${tokenW.error}` : ''}`);
  } else {
    const c2 = await probe(render, tokenW.token);
    record('C2', 'Workers-issued token accepted by Render', isOk(c2) ? PASS : FAIL, `Render answered ${brief(c2)}`);
  }
  const liveToken = tokenW.ok ? tokenW.token : tokenR.token;
  const claims = decodeClaims(liveToken) || { id: 1, sessionId: 1 };
  const baseClaims = { id: claims.id, sessionId: claims.sessionId };
  const nowS = Math.floor(Date.now() / 1000);
  const wrongSecret = crypto.randomBytes(48).toString('hex'); // random per run, never a real secret

  // ---- C3-C6: forged tokens --------------------------------------------------------------------
  const forgedCheck = async (id, title, token, critical = true) => {
    const rr = await probe(render, token);
    const ww = await probe(workers, token);
    const accepted = [];
    if (rr.status === 200) accepted.push('Render');
    if (ww.status === 200) accepted.push('Workers');
    if (accepted.length) return record(id, title, critical ? CRITICAL : FAIL, `ACCEPTED by ${accepted.join(' and ')} (Render ${brief(rr)}; Workers ${brief(ww)})`);
    const ok = unauthorized(rr) && unauthorized(ww);
    return record(id, title, ok ? PASS : FAIL, `Render ${brief(rr)}; Workers ${brief(ww)}${ok ? '' : ' (expected 401 {"error":"Unauthorized"} on both)'}`);
  };
  await forgedCheck('C3', 'HS256 token signed with a wrong secret is rejected by both', forgeJwt({ alg: 'HS256', secret: wrongSecret, claims: { ...baseClaims, iat: nowS, exp: nowS + 900 } }));
  await forgedCheck('C4', 'alg:none token is rejected by both', forgeJwt({ alg: 'none', claims: { ...baseClaims, iat: nowS, exp: nowS + 900 } }));
  await forgedCheck('C5a', 'HS512 token (wrong secret) is rejected by both', forgeJwt({ alg: 'HS512', secret: wrongSecret, claims: { ...baseClaims, iat: nowS, exp: nowS + 900 } }));
  if (secret) {
    await forgedCheck('C5b', 'HS512 token signed with the REAL secret is rejected by both (algorithm is pinned to HS256)', forgeJwt({ alg: 'HS512', secret, claims: { ...baseClaims, iat: nowS, exp: nowS + 900 } }));
    await forgedCheck('C6', 'expired token (valid signature, exp in the past) is rejected by both', forgeJwt({ alg: 'HS256', secret, claims: { ...baseClaims, iat: nowS - 7200, exp: nowS - 3600 } }));
  } else {
    record('C5b', 'HS512 token signed with the real secret is rejected by both', SKIP, `needs ${ENV.JWT_SECRET}`);
    record('C6', 'expired token is rejected by both', SKIP, `needs ${ENV.JWT_SECRET} to sign an expired token`);
  }

  // ---- C7 / C8 / C9 / C10 per server -----------------------------------------------------------
  for (const base of [render, workers]) {
    const N = name(base);

    // C7 supersede
    const a = await doLogin(base, { replaceDevice: true });
    let b = a.ok ? await doLogin(base) : a;
    let bNote = '';
    if (a.ok && !b.ok && b.status === 409) {
      bNote = ' (second login was 409 ACCOUNT_IN_USE, so this server saw a different IP for two logins from one host; retried with replaceDevice)';
      b = await doLogin(base, { replaceDevice: true });
    }
    if (!a.ok || !b.ok) {
      record(`C7-${N}`, `${N}: login A then login B supersedes A`, FAIL, `logins failed: A=${a.status} B=${b.status}`);
    } else {
      const pa = await probe(base, a.token);
      const pb = await probe(base, b.token);
      const po = await probe(other(base), a.token);
      const exact = superseded(pa) && pa.json.error === SUPERSEDED_MESSAGE;
      const good = exact && isOk(pb) && superseded(po);
      record(`C7-${N}`, `${N}: login A then login B: A gets 401 SESSION_SUPERSEDED (exact code and message), B works, A also superseded on ${name(other(base))}`,
        good ? PASS : FAIL, `A on ${N}: ${brief(pa)}; B on ${N}: ${brief(pb)}; A on ${name(other(base))}: ${brief(po)}${bNote}`);
    }

    // C8 same-IP re-login
    const first = await doLogin(base, { replaceDevice: true });
    const second = first.ok ? await doLogin(base) : first;
    if (!first.ok) record(`C8-${N}`, `${N}: same-IP re-login is not a 409`, FAIL, `first login failed: HTTP ${first.status}`);
    else if (second.ok) record(`C8-${N}`, `${N}: same-IP re-login is not a 409`, PASS, 'second login without replaceDevice succeeded');
    else if (second.status === 409) {
      const baseline = base === render;
      record(`C8-${N}`, `${N}: same-IP re-login is not a 409`, baseline ? INCONCLUSIVE : FAIL,
        baseline
          ? 'Render itself answered 409 ACCOUNT_IN_USE: its req.ip differs between two requests from this host (proxy IP rotation), so the baseline is unstable; not a Workers finding'
          : 'Workers answered 409 ACCOUNT_IN_USE for a same-IP re-login: the client IP is missing or unstable (ADR 4.2 regression: CF-Connecting-IP not reaching the session service)');
    } else record(`C8-${N}`, `${N}: same-IP re-login is not a 409`, FAIL, `second login: HTTP ${second.status}`);

    // C9 cross-device via spoofed IP headers
    const spoof = (ip) => ({ 'X-Forwarded-For': ip, 'CF-Connecting-IP': ip });
    const da = await doLogin(base, { replaceDevice: true, headers: spoof(FORGED_SPOOF_A) });
    if (!da.ok) record(`C9-${N}`, `${N}: cross-device login is 409 ACCOUNT_IN_USE, replaceDevice supersedes`, FAIL, `login A failed: HTTP ${da.status}`);
    else {
      const db = await doLogin(base, { headers: spoof(FORGED_SPOOF_B) });
      if (db.ok) {
        record(`C9-${N}`, `${N}: cross-device login is 409 ACCOUNT_IN_USE, replaceDevice supersedes`, INCONCLUSIVE,
          `${N} ignored the client-supplied IP headers (login B from a "different" IP succeeded); expected for a production edge. Cross-device needs a real second network: runbook item 10 (human)`);
      } else if (db.status === 409 && db.body && db.body.code === 'ACCOUNT_IN_USE') {
        const dc = await doLogin(base, { replaceDevice: true, headers: spoof(FORGED_SPOOF_B) });
        const pa = dc.ok ? await probe(base, da.token) : null;
        record(`C9-${N}`, `${N}: cross-device login is 409 ACCOUNT_IN_USE, replaceDevice supersedes`, dc.ok && superseded(pa) ? PASS : FAIL,
          `login B: 409 ACCOUNT_IN_USE (activeSession ${db.body.activeSession ? 'present' : 'MISSING'}); with replaceDevice: HTTP ${dc.status}; A afterwards: ${pa ? brief(pa) : 'n/a'}`);
      } else record(`C9-${N}`, `${N}: cross-device login is 409 ACCOUNT_IN_USE, replaceDevice supersedes`, FAIL, `login B: HTTP ${db.status} ${db.body && db.body.code ? db.body.code : ''}`);
    }

    // C10 logout via refreshToken fallback
    const s = await doLogin(base, { replaceDevice: true });
    if (!s.ok || !s.refreshToken) record(`C10-${N}`, `${N}: logout with an invalid/expired access token revokes via refreshToken`, FAIL, `login failed: HTTP ${s.status}`);
    else {
      const sc = decodeClaims(s.token) || baseClaims;
      const bad = secret
        ? forgeJwt({ alg: 'HS256', secret, claims: { id: sc.id, sessionId: sc.sessionId, iat: nowS - 7200, exp: nowS - 3600 } })
        : forgeJwt({ alg: 'HS256', secret: wrongSecret, claims: { id: sc.id, sessionId: sc.sessionId, iat: nowS, exp: nowS + 900 } });
      const control = await logout(base, { bearer: bad }); // no refreshToken: must not revoke
      const stillValid = await probe(base, s.token);
      const real = await logout(base, { bearer: bad, refreshToken: s.refreshToken });
      const after = await probe(base, s.token);
      const good = control.status === 200 && isOk(stillValid) && real.status === 200 && real.json && real.json.success === true && superseded(after);
      record(`C10-${N}`, `${N}: logout with ${secret ? 'an expired' : 'an invalid'} access token revokes via refreshToken (control without refreshToken revokes nothing)`, good ? PASS : FAIL,
        `control logout: ${brief(control)}, session afterwards: ${brief(stillValid)}; logout with refreshToken: ${brief(real)}, session afterwards: ${brief(after)}`);
    }
  }

  const n = (st) => checks.filter((c) => c.status === st).length;
  const summary = { pass: n(PASS), fail: n(FAIL), critical: n(CRITICAL), skip: n(SKIP), inconclusive: n(INCONCLUSIVE), total: checks.length };
  let exitCode = EXIT.OK;
  if (summary.critical) exitCode = EXIT.CRITICAL;
  else if (summary.fail || (opts.strict && (summary.skip || summary.inconclusive))) exitCode = EXIT.FAIL;
  return { checks, summary, exitCode };
}

async function main(argv, ioIn) {
  const io = defaultIo(ioIn);
  return runMain(async () => {
    const a = parseArgv(argv, SPEC);
    if (a.help) { io.log(helpText(__filename)); return EXIT.OK; }
    const opts = {
      ...a,
      delayMs: toInt('--delay-ms', a.delayMs, 300, { min: 0 }),
      timeoutMs: toInt('--timeout-ms', a.timeoutMs, 20000, { min: 100 }),
      renderAuthBudget: toInt('--render-auth-budget', a.renderAuthBudget, 18, { min: 0 }),
      workersAuthPerMinute: toInt('--workers-auth-per-minute', a.workersAuthPerMinute, 0, { min: 0 }),
    };
    const out = await runAuthMatrix(opts, io);
    if (out.dryRun) return out.exitCode;
    const s = out.summary;
    io.log('');
    io.log(`RESULT: ${out.exitCode === 0 ? 'PASS' : out.exitCode === EXIT.CRITICAL ? 'CRITICAL' : 'FAIL'}  pass ${s.pass} | fail ${s.fail} | critical ${s.critical} | inconclusive ${s.inconclusive} | skipped ${s.skip} (of ${s.total})`);
    if (s.skip || s.inconclusive) io.log('NOTE: skipped / inconclusive cells are NOT verified. See the runbook for the manual or extra-input steps.');
    if (a.json) io.log(JSON.stringify(out, null, 2));
    return out.exitCode;
  }, io);
}

module.exports = { main, runAuthMatrix, forgeJwt, decodeClaims, SUPERSEDED_MESSAGE };

if (require.main === module) main(process.argv.slice(2)).then((c) => { process.exitCode = c; });
