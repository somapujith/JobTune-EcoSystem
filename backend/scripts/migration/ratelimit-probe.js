#!/usr/bin/env node
'use strict';

/**
 * ratelimit-probe.js  (ADR-001 checklist item 18: "verified by actually being throttled, not by config inspection")
 *
 * Proves that rate limiting is ENFORCED on one server by getting throttled: a short burst of POST /api/auth/login requests
 * with DELIBERATELY WRONG credentials for a TEST account (a random wrong password is generated for every run; the real password
 * is never read or sent). Each wrong login is answered 400 "Invalid credentials" until the limiter answers 429.
 *
 *   node scripts/migration/ratelimit-probe.js --url <base> --test-account-only [--attempts 30] [--expect-max-before-limit 20]
 *
 * SAFETY
 *   - Refuses to run without --test-account-only (the acknowledgement that JT_TEST_EMAIL is a dedicated test account: wrong
 *     logins are how brute-force protection is provoked). The account is never locked out (there is no per-account lockout in
 *     the API) but YOUR IP will be throttled from /api/auth for the limiter window afterwards (15 min on Render's
 *     express-rate-limit, 60 s on the Workers binding); do not run it from a network you need to log in from meanwhile.
 *   - Explicit URL, no default. Low burst: --attempts defaults to 30 and is capped at 60 (--allow-more raises the cap to 200,
 *     which is needed to probe the general /api limiter of 100 per 15 minutes with --path /api/health --method GET).
 *   - Sequential requests (--concurrency 1..5), stops at the first 429 unless --keep-going.
 *
 * PASS requires ALL of:
 *   1. a 429 was observed (throttling really happened);
 *   2. before it, the requests reached the endpoint (400 "Invalid credentials" on login: not blocked by anything else);
 *   3. the first 429 came after no more than --expect-max-before-limit allowed requests (default 20, the ADR's /api/auth budget
 *      of 20 per 15 minutes; use 100 for the general limiter);
 *   4. the 429 body is the expected Express message for the path ("Too many authentication attempts, please try again later." under
 *      /api/auth, "Too many requests, please try again later." otherwise). A different body is a FAILURE (the frontend and the
 *      Express contract read it).
 * Reported for information: the number of requests allowed before the first 429, Retry-After / RateLimit-* headers, and whether
 * the throttle was still active on a final follow-up request.
 * What this cannot prove: that a second client on another network is unaffected, and what happens through the Vercel proxy
 * (ADR checklist item 7). Those are manual steps in the runbook.
 *
 * ENVIRONMENT: JT_TEST_EMAIL (required for the login probe; only the address is used).
 * OPTIONS  --url <base> | --path <p> (/api/auth/login) | --method <M> (POST) | --attempts <n> (30) | --expect-max-before-limit <n> (20)
 *          | --expected-message <text> | --concurrency <n> (1) | --delay-ms <n> (0) | --keep-going | --allow-more | --timeout-ms <n>
 *          | --test-account-only | --dry-run | --json
 * Exit codes: 0 pass | 1 fail | 64 usage / refusal.
 */

const crypto = require('crypto');
const {
  EXIT, UsageError, parseArgv, toInt, normalizeBase, httpCall, ENV, runMain, defaultIo, helpText,
} = require('./lib/common');

const SPEC = {
  flags: { '--test-account-only': 'testAccountOnly', '--keep-going': 'keepGoing', '--allow-more': 'allowMore', '--dry-run': 'dryRun', '--json': 'json' },
  values: {
    '--url': 'url', '--path': 'path', '--method': 'method', '--attempts': 'attempts', '--expect-max-before-limit': 'expectMax', '--expected-message': 'expectedMessage',
    '--concurrency': 'concurrency', '--delay-ms': 'delayMs', '--timeout-ms': 'timeoutMs',
  },
  lists: {},
};

const AUTH_MESSAGE = 'Too many authentication attempts, please try again later.';
const API_MESSAGE = 'Too many requests, please try again later.';

async function runProbe(opts, io) {
  const base = normalizeBase('--url', opts.url);
  const path = opts.path || '/api/auth/login';
  const method = String(opts.method || 'POST').toUpperCase();
  const isLogin = method === 'POST' && /^\/api\/auth\/login\/?$/.test(path);
  if (!opts.testAccountOnly) throw new UsageError('refusing to run: pass --test-account-only. This provokes the rate limiter with wrong logins; your IP will be throttled for the limiter window and the email used must belong to a dedicated test account.');
  const email = io.env[ENV.EMAIL];
  if (isLogin && !email) throw new UsageError(`${ENV.EMAIL} must be set (test account email; only the address is used, with a random WRONG password)`);
  if (!isLogin && method !== 'GET') throw new UsageError('only POST /api/auth/login (wrong credentials) and GET probes are supported');
  const cap = opts.allowMore ? 200 : 60;
  if (opts.attempts > cap) throw new UsageError(`--attempts ${opts.attempts} exceeds the cap of ${cap}${opts.allowMore ? '' : ' (--allow-more raises it to 200)'}`);
  if (opts.concurrency > 5) throw new UsageError('--concurrency above 5 is not allowed for a probe');
  const expectMax = toInt('--expect-max-before-limit', opts.expectMax, 20, { min: 0 });
  const expectedMessage = opts.expectedMessage || (path.startsWith('/api/auth') ? AUTH_MESSAGE : API_MESSAGE);
  const wrongPassword = `wrong-${crypto.randomBytes(12).toString('hex')}`; // random, never a real password

  io.log(`Rate-limit probe: ${method} ${base}${path}${isLogin ? ' with the env test account email and a random WRONG password' : ''}`);
  io.log(`burst: up to ${opts.attempts} requests (concurrency ${opts.concurrency}); expecting a 429 after at most ${expectMax} allowed requests`);
  if (opts.dryRun) { io.log('  dry run: nothing sent.'); return { exitCode: EXIT.OK, dryRun: true }; }

  const samples = [];
  let next = 0;
  let stop = false;
  const one = async () => {
    while (!stop && next < opts.attempts) {
      const i = ++next;
      const r = await httpCall({
        url: base + path, method, timeoutMs: opts.timeoutMs, fetchImpl: io.fetchImpl,
        body: isLogin ? { email, password: wrongPassword } : undefined,
      });
      samples.push({ i, status: r.status, body: r.json, text: r.text, retryAfter: r.retryAfter, ratelimit: r.headers && [...r.headers.keys()].filter((k) => /^ratelimit/i.test(k)).join(','), error: r.error });
      if (r.status === 429 && !opts.keepGoing) stop = true;
      if (opts.delayMs > 0) await io.sleepImpl(opts.delayMs);
    }
  };
  await Promise.all(Array.from({ length: opts.concurrency }, one));
  samples.sort((a, b) => a.i - b.i);

  const first429 = samples.find((s) => s.status === 429);
  const before = first429 ? samples.filter((s) => s.i < first429.i) : samples;
  const counts = {};
  samples.forEach((s) => { counts[s.status] = (counts[s.status] || 0) + 1; });
  io.log(`  statuses: ${Object.entries(counts).map(([k, v]) => `${k}x${v}`).join(' ')}`);

  const problems = [];
  if (!first429) problems.push(`NO 429 in ${samples.length} requests: rate limiting is NOT enforced on this server (checklist item 18 is not met)`);
  else {
    const reached = before.filter((s) => (isLogin ? s.status === 400 : s.status >= 200 && s.status < 300));
    if (isLogin && reached.length !== before.length) problems.push(`before the throttle ${before.length - reached.length} of ${before.length} requests were not the expected 400 "Invalid credentials" (statuses: ${[...new Set(before.map((s) => s.status))].join(', ')}); the endpoint was not reached normally`);
    if (isLogin && before.length && !before.every((s) => s.status !== 400 || (s.body && s.body.error === 'Invalid credentials'))) problems.push('a 400 before the throttle had a body other than {"error":"Invalid credentials"}');
    if (before.length > expectMax) problems.push(`${before.length} requests were allowed before the first 429; the budget is ${expectMax}`);
    const msg = first429.body && first429.body.error;
    if (msg !== expectedMessage) problems.push(`429 body differs from the Express contract: got ${JSON.stringify(first429.body !== undefined ? first429.body : first429.text)}, expected {"error":${JSON.stringify(expectedMessage)}}`);
    io.log(`  first 429 at request #${first429.i}; ${before.length} request(s) were allowed first`);
    io.log(`  Retry-After: ${first429.retryAfter || '(none)'} | RateLimit headers: ${first429.ratelimit || '(none)'}`);
    // follow-up: still throttled?
    const again = await httpCall({ url: base + path, method, timeoutMs: opts.timeoutMs, fetchImpl: io.fetchImpl, body: isLogin ? { email, password: wrongPassword } : undefined });
    io.log(`  follow-up request: HTTP ${again.status}${again.status === 429 ? ' (still throttled)' : ' (throttle already lifted or per-request limiter)'}`);
  }
  samples.filter((s) => s.status === 0).forEach((s) => problems.push(`network error on request #${s.i}: ${s.error}`));

  return { samples: samples.map(({ body, text, ...rest }) => rest), firstThrottleAt: first429 ? first429.i : null, allowedBeforeThrottle: first429 ? before.length : null, problems, exitCode: problems.length ? EXIT.FAIL : EXIT.OK };
}

async function main(argv, ioIn) {
  const io = defaultIo(ioIn);
  return runMain(async () => {
    const a = parseArgv(argv, SPEC);
    if (a.help) { io.log(helpText(__filename)); return EXIT.OK; }
    const opts = {
      ...a,
      attempts: toInt('--attempts', a.attempts, 30, { min: 1 }),
      concurrency: toInt('--concurrency', a.concurrency, 1, { min: 1 }),
      delayMs: toInt('--delay-ms', a.delayMs, 0, { min: 0 }),
      timeoutMs: toInt('--timeout-ms', a.timeoutMs, 15000, { min: 100 }),
    };
    const out = await runProbe(opts, io);
    if (out.dryRun) return out.exitCode;
    io.log('');
    out.problems.forEach((p) => io.log(`  PROBLEM: ${p}`));
    io.log(`RESULT: ${out.exitCode === 0 ? 'PASS  throttling observed' : 'FAIL'}`);
    io.log('NOTE: this proves enforcement for THIS client IP only. Second-client isolation and the Vercel proxy IP question (checklist item 7) are manual steps.');
    if (a.json) io.log(JSON.stringify(out, null, 2));
    return out.exitCode;
  }, io);
}

module.exports = { main, runProbe, AUTH_MESSAGE, API_MESSAGE };

if (require.main === module) main(process.argv.slice(2)).then((c) => { process.exitCode = c; });
