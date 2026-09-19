#!/usr/bin/env node
'use strict';

/**
 * load-test.js  (ADR-001 T4.6, checklist item 20; also the load half of items 14/26 observation)
 *
 * A small, deliberately gentle load generator for ONE server (normally the Workers deployment). It hits two paths:
 *   /api/health                    the health check (a `SELECT 1` on Workers, so it also touches Neon)
 *   /api/subscriptions/plans       a public, DB-backed GET (`SELECT * FROM subscription_plans`); no login needed
 * (--health-path / --db-path override them; when --db-path is given and JT_TEST_TOKEN is set, that request carries the bearer token,
 * so an authenticated DB-backed GET can be used instead.)
 * It reports, per concurrency step: requests, throughput, error rate (network errors + 5xx), 429 count, and p50 / p95 / p99
 * latency per path. It flags the signs of Neon connection exhaustion / Worker resource limits:
 *   - a 5xx BURST: >= --burst-count 5xx within any 2-second window (default 5)
 *   - health answers with db: "unreachable" / status "degraded" (HTTP 200: the Worker's health probe swallows the database error,
 *     so this is where Neon connection exhaustion shows first); they also count as errors
 *   - error bodies that mention connection limits: "too many (clients|connections)", "remaining connection slots",
 *     "connection terminated", "timeout exceeded when trying to connect", "pool", "Worker exceeded", Cloudflare error 1101/1102
 *   - status 502/503/504/522/524/1101 appearing at all
 *   - error rate rising step over step
 * SAFETY: the target URL is explicit (no default); the defaults are low (concurrency 5, 15 s); concurrency above 50 needs
 * --allow-high-load; a *.onrender.com host is refused unless --allow-render-host (that is production capacity and it rate
 * limits at 100 requests / 15 min anyway); each request is a GET; --dry-run prints the plan. Nothing is written or stored.
 *
 *   node scripts/migration/load-test.js --url https://<worker-host> [--concurrency 5,10,20] [--duration-s 15]
 *
 * OPTIONS  --url <base> | --concurrency <n[,n,...]> (5; several values = ramp, one step each) | --duration-s <n> (15 per step)
 *          | --health-path <p> | --db-path <p> | --mix <0-100> (percent of requests to the DB path, default 50)
 *          | --max-error-rate <pct> (1) | --max-p99-ms <n> (0 = no check) | --burst-count <n> (5) | --timeout-ms <n> (15000)
 *          | --think-ms <n> (50; pause after each request per virtual user, so the defaults stay near 100 requests/s at most)
 *          | --allow-high-load | --allow-render-host | --dry-run | --json
 *
 * Exit codes: 0 within thresholds and no exhaustion sign | 1 error rate / p99 above threshold, or an exhaustion sign |
 *             64 usage / refusal.
 * A 429 is counted separately (the rate limiter working is not an outage) and does not count as an error.
 */

const {
  EXIT, UsageError, parseArgv, toInt, normalizeBase, httpCall, pct, sleep, ENV, runMain, defaultIo, helpText,
} = require('./lib/common');

const SPEC = {
  flags: { '--allow-high-load': 'allowHighLoad', '--allow-render-host': 'allowRenderHost', '--dry-run': 'dryRun', '--json': 'json' },
  values: {
    '--url': 'url', '--concurrency': 'concurrency', '--duration-s': 'durationS', '--health-path': 'healthPath', '--db-path': 'dbPath', '--mix': 'mix',
    '--max-error-rate': 'maxErrorRate', '--max-p99-ms': 'maxP99', '--burst-count': 'burstCount', '--timeout-ms': 'timeoutMs', '--think-ms': 'thinkMs',
  },
  lists: {},
};

const EXHAUSTION_BODY_RE = /too many (clients|connections)|remaining connection slots|connection terminated|timeout exceeded when trying to connect|sorry, too many clients|pool|worker exceeded|error code: 110[12]|exceeded (cpu|memory)/i;
const SUSPECT_STATUS = new Set([502, 503, 504, 522, 524, 1101, 1102]);

/** Sliding-window burst detector: is there any window of `windowMs` containing >= count timestamps? */
function hasBurst(stamps, count, windowMs = 2000) {
  const s = [...stamps].sort((a, b) => a - b);
  for (let i = 0; i + count - 1 < s.length; i++) if (s[i + count - 1] - s[i] <= windowMs) return true;
  return false;
}

/** Summarise raw samples of one step. samples: { path, status, ms, t, body? }[] */
function summariseStep(samples, { elapsedMs, burstCount }) {
  const byPath = {};
  for (const s of samples) (byPath[s.path] = byPath[s.path] || []).push(s);
  // a degraded health answer is HTTP 200 with {status:'degraded', db:'unreachable'}: the DB probe failed (exhaustion shows up here first)
  const isErr = (s) => s.status === 0 || s.status >= 500 || s.degraded === true;
  const paths = {};
  for (const [p, list] of Object.entries(byPath)) {
    const ok = list.filter((s) => s.status > 0).map((s) => s.ms).sort((a, b) => a - b);
    paths[p] = {
      requests: list.length,
      errors: list.filter(isErr).length,
      rateLimited: list.filter((s) => s.status === 429).length,
      p50: pct(ok, 50), p95: pct(ok, 95), p99: pct(ok, 99), max: ok.length ? ok[ok.length - 1] : null,
    };
  }
  const all = samples.filter((s) => s.status > 0).map((s) => s.ms).sort((a, b) => a - b);
  const errors = samples.filter(isErr).length;
  const statusCounts = {};
  samples.forEach((s) => { statusCounts[s.status] = (statusCounts[s.status] || 0) + 1; });
  const flags = [];
  const fiveXxStamps = samples.filter((s) => s.status >= 500 || s.degraded).map((s) => s.t);
  if (hasBurst(fiveXxStamps, burstCount)) flags.push(`5xx burst: >= ${burstCount} server errors / degraded health answers within 2 seconds`);
  const degraded = samples.filter((s) => s.degraded);
  if (degraded.length) flags.push(`${degraded.length} health answer(s) reported db unreachable / status degraded (HTTP 200, but the database probe failed: the classic first sign of connection exhaustion)`);
  const suspect = samples.filter((s) => SUSPECT_STATUS.has(s.status));
  if (suspect.length) flags.push(`gateway/timeout/resource statuses seen: ${[...new Set(suspect.map((s) => s.status))].join(', ')} (${suspect.length} responses)`);
  const bodyHits = samples.filter((s) => s.body && EXHAUSTION_BODY_RE.test(s.body));
  if (bodyHits.length) flags.push(`${bodyHits.length} error bod${bodyHits.length === 1 ? 'y' : 'ies'} mention connection limits / resource limits (e.g. ${JSON.stringify(bodyHits[0].body.slice(0, 100))})`);
  const netErrs = samples.filter((s) => s.status === 0);
  if (netErrs.length >= burstCount) flags.push(`${netErrs.length} network errors / timeouts (${[...new Set(netErrs.map((s) => s.error))].slice(0, 3).join('; ')})`);
  return {
    requests: samples.length,
    rps: samples.length / Math.max(elapsedMs / 1000, 0.001),
    errors,
    errorRate: samples.length ? (errors / samples.length) * 100 : 0,
    rateLimited: samples.filter((s) => s.status === 429).length,
    statusCounts,
    p50: pct(all, 50), p95: pct(all, 95), p99: pct(all, 99), max: all.length ? all[all.length - 1] : null,
    paths, flags,
  };
}

async function runStep({ base, paths, mix, concurrency, durationMs, timeoutMs, thinkMs, headers, io, rng }) {
  const samples = [];
  const started = Date.now();
  const deadline = started + durationMs;
  let n = 0;
  const worker = async () => {
    while (Date.now() < deadline) {
      const p = rng() * 100 < mix ? paths.db : paths.health;
      const r = await httpCall({ url: base + p, method: 'GET', headers, timeoutMs, fetchImpl: io.fetchImpl });
      samples.push({
        path: p, status: r.status, ms: r.ms, t: Date.now() - started, error: r.error,
        degraded: !!(r.json && typeof r.json === 'object' && (r.json.status === 'degraded' || r.json.db === 'unreachable')),
        body: r.status >= 500 || r.status === 0 ? String(r.text || r.error || '').slice(0, 300) : undefined,
      });
      n++;
      if (thinkMs > 0) await sleep(thinkMs);
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
  return { samples, elapsedMs: Date.now() - started, n };
}

async function runLoadTest(opts, io) {
  const base = normalizeBase('--url', opts.url);
  const host = new URL(base).hostname;
  if (/onrender\.com$/i.test(host) && !opts.allowRenderHost) {
    throw new UsageError(`refusing to load-test ${host}: that is the production Render host (real capacity, and its rate limiter answers 429 after 100 requests / 15 min). Point --url at the Workers deployment, or pass --allow-render-host if you really mean it.`);
  }
  const steps = String(opts.concurrency || '5').split(',').map((s) => toInt('--concurrency', s.trim(), 5, { min: 1 }));
  if (steps.some((c) => c > 50) && !opts.allowHighLoad) throw new UsageError('--concurrency above 50 needs --allow-high-load (this is a connection-handling check, not a stress test)');
  const mix = toInt('--mix', opts.mix, 50, { min: 0, max: 100 });
  const paths = { health: opts.healthPath || '/api/health', db: opts.dbPath || '/api/subscriptions/plans' };
  const headers = io.env[ENV.TOKEN] && opts.dbPath ? { Authorization: `Bearer ${io.env[ENV.TOKEN]}` } : {};

  io.log(`Load test: ${base}`);
  io.log(`steps: concurrency ${steps.join(' -> ')}, ${opts.durationS}s each | paths: ${paths.health} (${100 - mix}%), ${paths.db} (${mix}%)${headers.Authorization ? ' [bearer from JT_TEST_TOKEN on the db path]' : ''}`);
  if (opts.dryRun) {
    io.log(`  would send GET requests, at most ${Math.max(...steps)} in flight, for ${steps.length * opts.durationS}s total. Nothing sent.`);
    return { steps: [], exitCode: EXIT.OK, dryRun: true };
  }

  // deterministic-enough path mix without Math.random dependence in tests
  let seed = 12345;
  const rng = io.rng || (() => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; });

  const results = [];
  for (const concurrency of steps) {
    const { samples, elapsedMs } = await runStep({ base, paths, mix, concurrency, durationMs: opts.durationS * 1000, timeoutMs: opts.timeoutMs, thinkMs: opts.thinkMs, headers, io, rng });
    const sum = summariseStep(samples, { elapsedMs, burstCount: opts.burstCount });
    results.push({ concurrency, ...sum });
    io.log(`  concurrency ${String(concurrency).padStart(3)}: ${sum.requests} req, ${sum.rps.toFixed(1)} rps | errors ${sum.errors} (${sum.errorRate.toFixed(2)}%) | 429 ${sum.rateLimited} | p50 ${sum.p50}ms p95 ${sum.p95}ms p99 ${sum.p99}ms max ${sum.max}ms`);
    for (const [p, v] of Object.entries(sum.paths)) io.log(`      ${p.padEnd(30)} ${String(v.requests).padStart(6)} req  err ${String(v.errors).padStart(4)}  p50 ${v.p50}ms  p95 ${v.p95}ms  p99 ${v.p99}ms`);
    io.log(`      statuses: ${Object.entries(sum.statusCounts).map(([k, v]) => `${k}x${v}`).join(' ')}`);
    sum.flags.forEach((f) => io.log(`      FLAG: ${f}`));
  }

  const problems = [];
  results.forEach((r) => {
    if (r.errorRate > opts.maxErrorRate) problems.push(`concurrency ${r.concurrency}: error rate ${r.errorRate.toFixed(2)}% > ${opts.maxErrorRate}%`);
    if (opts.maxP99 > 0 && r.p99 > opts.maxP99) problems.push(`concurrency ${r.concurrency}: p99 ${r.p99}ms > ${opts.maxP99}ms`);
    r.flags.forEach((f) => problems.push(`concurrency ${r.concurrency}: ${f}`));
  });
  for (let i = 1; i < results.length; i++) {
    if (results[i].errorRate > results[i - 1].errorRate + 2 && results[i].errorRate > 0) problems.push(`error rate rose from ${results[i - 1].errorRate.toFixed(2)}% (concurrency ${results[i - 1].concurrency}) to ${results[i].errorRate.toFixed(2)}% (concurrency ${results[i].concurrency}): a capacity limit sits between them`);
  }
  return { steps: results, problems, exitCode: problems.length ? EXIT.FAIL : EXIT.OK };
}

async function main(argv, ioIn) {
  const io = defaultIo(ioIn);
  return runMain(async () => {
    const a = parseArgv(argv, SPEC);
    if (a.help) { io.log(helpText(__filename)); return EXIT.OK; }
    const opts = {
      ...a,
      durationS: toInt('--duration-s', a.durationS, 15, { min: 1, max: 600 }),
      maxErrorRate: Number(a.maxErrorRate === undefined ? 1 : a.maxErrorRate),
      maxP99: toInt('--max-p99-ms', a.maxP99, 0, { min: 0 }),
      burstCount: toInt('--burst-count', a.burstCount, 5, { min: 1 }),
      timeoutMs: toInt('--timeout-ms', a.timeoutMs, 15000, { min: 100 }),
      thinkMs: toInt('--think-ms', a.thinkMs, 50, { min: 0 }),
    };
    if (!Number.isFinite(opts.maxErrorRate) || opts.maxErrorRate < 0) throw new UsageError('--max-error-rate must be a non-negative number (percent)');
    const out = await runLoadTest(opts, io);
    if (out.dryRun) return out.exitCode;
    io.log('');
    if (out.problems.length) { io.log('PROBLEMS:'); out.problems.forEach((p) => io.log(`  - ${p}`)); }
    io.log(`RESULT: ${out.exitCode === 0 ? 'PASS' : 'FAIL'}  ${out.steps.length} step(s); ${out.problems.length} problem(s)`);
    io.log('NOTE: a clean run at low concurrency does not prove Neon connection handling under production load (checklist item 20 also needs the Neon dashboard connection count observed during the run).');
    if (a.json) io.log(JSON.stringify(out, null, 2));
    return out.exitCode;
  }, io);
}

module.exports = { main, runLoadTest, summariseStep, hasBurst, EXHAUSTION_BODY_RE };

if (require.main === module) main(process.argv.slice(2)).then((c) => { process.exitCode = c; });
