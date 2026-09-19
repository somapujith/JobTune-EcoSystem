#!/usr/bin/env node
'use strict';

/**
 * differential.js  (ADR-001 T4.2, checklist items 3 and 4)
 *
 * Sends the SAME request for every endpoint of the Render reference manifest to two servers (Render and Workers) and
 * compares the status code and the JSON body SHAPE (keys and types, recursively; values are never compared). Body
 * shape differences: missing key, extra key, type change. Non-JSON bodies: status and media type are compared.
 *
 *   node scripts/migration/differential.js --render https://<render-host> --workers https://<worker-host> [options]
 *
 * SAFETY (defaults are the safe choices)
 *   - GET only. POST/PUT/PATCH need --allow-writes (both servers share ONE database, so every write runs TWICE).
 *     DELETE, and any write under /api/auth, /api/subscriptions, /api/admin, /api/admin-panels, need --allow-destructive.
 *   - Endpoints that call the AI model (static classification of the Express source, see lib/ai-classify.js) are skipped
 *     unless --include-ai (cost, non-determinism). Unclassifiable endpoints count as AI.
 *   - Refuses to run when --render and --workers are the same server.
 *   - --dry-run prints the planned requests and sends nothing (no login either).
 *   - Anything that logs in (JT_TEST_EMAIL / JT_TEST_PASSWORD in the environment) needs --test-account-only, an
 *     acknowledgement that the account is a dedicated test account: a login replaces that account's active session.
 *   - The runner paces itself under Render's express-rate-limit (100 requests / 15 min / IP on /api): --budget (default 80,
 *     0 = unlimited) requests per 15 minutes are sent to Render; a 429 on either side is INCONCLUSIVE, not a pass.
 *
 * CREDENTIALS (environment only, never stored or printed)
 *   JT_TEST_TOKEN                     a bearer token for the test account, used on BOTH servers
 *   JT_TEST_EMAIL + JT_TEST_PASSWORD  test account; logs in ONCE on Render (--test-account-only) and reuses the token on both
 *                                     (JWT secret and database are shared, so the token is valid on both, and one login means
 *                                     no session supersede between the two runs). Neither set: anonymous run, protected
 *                                     endpoints are then compared on their 401 responses.
 *
 * OPTIONS
 *   --reference <file>       reference manifest (default docs/migration/manifest.render.json)
 *   --only-prefix <p>        repeatable; limit to a path prefix
 *   --param name=value       repeatable; value for a :param (default "1" for *id params, else "sample")
 *   --bodies <file.json>     { "POST /api/x": { ... } } request bodies for --allow-writes (default {})
 *   --ignore <key>           repeatable; extra volatile keys skipped entirely (presence and type). Defaults: see IGNORE_DEFAULT
 *   --include-ai | --allow-writes | --allow-destructive | --test-account-only | --dry-run | --json | --verbose
 *   --treat-as-ai <substr> / --treat-as-safe <substr>   repeatable overrides of the AI classification ("POST /api/x" substrings)
 *   --budget <n> (80) | --delay-ms <n> (300) | --timeout-ms <n> (20000)
 *
 * Every response body is also scanned for information leaks (stack traces, internal file paths, postgres:// strings, secret names;
 * checklist item 22): a leak on Workers is a mismatch.
 *
 * Exit codes: 0 all compared endpoints match | 1 mismatch, network error or inconclusive result | 64 usage / safety refusal.
 * Coverage is printed: "compared X of Y" (skipped endpoints are listed by reason); checklist item 3 needs skipped == 0 for
 * the endpoints that matter, so run once with --include-ai and --allow-writes on a test account before claiming it.
 */

const fs = require('fs');
const path = require('path');
const {
  EXIT, REPO_DIR, UsageError, parseArgv, toInt, assertTwoDistinctTargets, httpCall, compareShapes, loadManifest, inPrefixes,
  fillPath, parseParamPairs, endpointKey, MUTATING, isDangerous, findLeaks, resolveTestToken: resolveToken, ENV, Pacer, runMain, defaultIo, helpText,
} = require('./lib/common');
const { classifyAiEndpoints } = require('./lib/ai-classify');

const IGNORE_DEFAULT = [
  'token', 'accessToken', 'refreshToken', 'sessionId', 'timestamp', 'uptime', 'requestId', 'iat', 'exp', 'expiresAt',
  'created_at', 'updated_at', 'createdAt', 'updatedAt', 'last_active_at', 'lastActiveAt', 'lastUsed', 'aiCache',
];

const SPEC = {
  flags: {
    '--include-ai': 'includeAi', '--allow-writes': 'allowWrites', '--allow-destructive': 'allowDestructive',
    '--test-account-only': 'testAccountOnly', '--dry-run': 'dryRun', '--json': 'json', '--verbose': 'verbose',
  },
  values: {
    '--render': 'render', '--workers': 'workers', '--reference': 'reference', '--bodies': 'bodies', '--budget': 'budget',
    '--delay-ms': 'delayMs', '--timeout-ms': 'timeoutMs',
  },
  lists: { '--only-prefix': 'onlyPrefixes', '--param': 'params', '--ignore': 'ignore', '--treat-as-ai': 'treatAsAi', '--treat-as-safe': 'treatAsSafe' },
};

/* ------------------------------------------------------------------------- */
/* Pure pieces (unit-tested)                                                  */
/* ------------------------------------------------------------------------- */

const mediaType = (ct) => String(ct || '').split(';')[0].trim().toLowerCase();

/** Compare one endpoint's two responses. @returns {{ verdict: 'match'|'mismatch'|'error'|'inconclusive', reasons: string[], notes: string[] }} */
function compareResponses(r, w, ignore) {
  if (r.status === 0 || w.status === 0) {
    return { verdict: 'error', reasons: [`network error: Render=${r.error || r.status} Workers=${w.error || w.status}`], notes: [] };
  }
  if (r.status === 429 || w.status === 429) {
    return { verdict: 'inconclusive', reasons: [`rate limited (429): Render=${r.status} Workers=${w.status}`], notes: [] };
  }
  const reasons = [];
  const notes = [];
  // checklist item 22: no stack traces, internal paths, connection strings or secret names in ANY response body
  findLeaks(w.text).forEach((l) => reasons.push(`LEAK on Workers: ${l} in the response body`));
  findLeaks(r.text).forEach((l) => notes.push(`Render response also contains a ${l} (pre-existing, not a Workers difference)`));
  if (r.status !== w.status) reasons.push(`status ${r.status} (Render) vs ${w.status} (Workers)`);
  const rj = r.json !== undefined;
  const wj = w.json !== undefined;
  if (rj && wj) {
    const { diffs, notes: n } = compareShapes(r.json, w.json, ignore);
    diffs.forEach((d) => reasons.push(`body ${d.path}: ${d.kind} (${d.detail})`));
    notes.push(...n);
  } else if (rj !== wj) {
    reasons.push(`body kind differs: Render ${rj ? 'JSON' : `non-JSON (${mediaType(r.contentType) || 'no content-type'})`} vs Workers ${wj ? 'JSON' : `non-JSON (${mediaType(w.contentType) || 'no content-type'})`}`);
  } else if (mediaType(r.contentType) !== mediaType(w.contentType)) {
    reasons.push(`content-type ${mediaType(r.contentType) || '(none)'} vs ${mediaType(w.contentType) || '(none)'}`);
  }
  return { verdict: reasons.length ? 'mismatch' : 'match', reasons, notes };
}

/**
 * Decide what to do with every in-scope endpoint. Returns [{ key, endpoint, action: 'run'|'skip', reason?, ai? }].
 * Order of skip reasons: writes flag, destructive flag, AI flag.
 */
function planEndpoints(manifest, opts, aiMap) {
  return manifest.endpoints.filter((e) => inPrefixes(e.path, opts.onlyPrefixes)).map((e) => {
    const method = String(e.method).toUpperCase();
    const key = endpointKey(e);
    const ai = aiMap.get(key) || { ai: true, reason: 'unclassified' };
    const base = { key, endpoint: e, ai: ai.ai, aiReason: ai.reason };
    if (MUTATING.has(method) && !opts.allowWrites) return { ...base, action: 'skip', reason: 'mutating method (needs --allow-writes)' };
    if (isDangerous(e) && !opts.allowDestructive) return { ...base, action: 'skip', reason: 'destructive / account-affecting (needs --allow-destructive)' };
    if (ai.ai && !opts.includeAi) return { ...base, action: 'skip', reason: `may call the AI model: ${ai.reason} (needs --include-ai)` };
    if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD'].includes(method)) return { ...base, action: 'skip', reason: `unsupported method ${method}` };
    return { ...base, action: 'run' };
  });
}

/* ------------------------------------------------------------------------- */
/* Runner                                                                     */
/* ------------------------------------------------------------------------- */

async function runDifferential(opts, io) {
  const { render, workers } = assertTwoDistinctTargets(opts.render, opts.workers);
  const manifest = loadManifest(opts.reference);
  const ignore = new Set([...IGNORE_DEFAULT, ...(opts.ignore || [])]);
  const aiMap = classifyAiEndpoints(manifest.endpoints, { repoDir: opts.repoDir || REPO_DIR, treatAsAi: opts.treatAsAi, treatAsSafe: opts.treatAsSafe });
  const plan = planEndpoints(manifest, opts, aiMap);
  const params = parseParamPairs(opts.params);
  let bodies = {};
  if (opts.bodies) {
    try { bodies = JSON.parse(fs.readFileSync(path.resolve(opts.bodies), 'utf8')); } catch (e) { throw new UsageError(`cannot read --bodies ${opts.bodies}: ${e.message}`); }
  }

  const cred = await resolveToken({ env: io.env, renderBase: render, testAccountOnly: opts.testAccountOnly, dryRun: opts.dryRun, io, timeoutMs: opts.timeoutMs });
  const toRun = plan.filter((p) => p.action === 'run');
  const results = [];

  io.log(`Differential: Render=${render}  Workers=${workers}`);
  io.log(`credentials: ${cred.source}`);
  io.log(`plan: ${toRun.length} to run, ${plan.length - toRun.length} skipped, ${plan.length} in scope${opts.dryRun ? '  [DRY RUN: nothing is sent]' : ''}`);

  const pacer = new Pacer({ delayMs: opts.delayMs, budget: opts.budget, sleepImpl: io.sleepImpl, log: io.log });
  let consecutive429 = 0;
  let aborted = false;
  for (const p of plan) {
    const e = p.endpoint;
    const method = String(e.method).toUpperCase();
    const url = fillPath(e.path, params);
    if (p.action === 'skip') { results.push({ key: p.key, verdict: 'skipped', reasons: [p.reason], notes: [], url }); continue; }
    if (opts.dryRun) {
      io.log(`  would ${method.padEnd(6)} ${url}  ${e.auth && cred.token !== null ? '[bearer]' : e.auth && cred.pendingLogin ? '[bearer after login]' : e.auth ? '[no token: expects 401]' : '[public]'}${p.ai ? '  [AI]' : ''}`);
      results.push({ key: p.key, verdict: 'planned', reasons: [], notes: [], url });
      continue;
    }
    if (aborted) { results.push({ key: p.key, verdict: 'skipped', reasons: ['aborted after repeated 429 responses'], notes: [], url }); continue; }
    const headers = {};
    if (e.auth && cred.token) headers.Authorization = `Bearer ${cred.token}`;
    const body = MUTATING.has(method) ? (bodies[p.key] !== undefined ? bodies[p.key] : {}) : undefined;
    await pacer.wait();
    const rr = await httpCall({ url: render + url, method, headers, body, timeoutMs: opts.timeoutMs, fetchImpl: io.fetchImpl });
    const ww = await httpCall({ url: workers + url, method, headers, body, timeoutMs: opts.timeoutMs, fetchImpl: io.fetchImpl });
    const cmp = compareResponses(rr, ww, ignore);
    results.push({ key: p.key, url, render: { status: rr.status, contentType: rr.contentType }, workers: { status: ww.status, contentType: ww.contentType }, ...cmp });
    if (cmp.verdict === 'inconclusive') { consecutive429++; if (consecutive429 >= 3) { aborted = true; io.err('aborting: 3 consecutive 429 responses (rate limit). Wait 15 minutes or lower --budget.'); } } else consecutive429 = 0;
    if (opts.verbose || cmp.verdict !== 'match') io.log(`  ${cmp.verdict.toUpperCase().padEnd(12)} ${p.key}${cmp.reasons.length ? `\n      - ${cmp.reasons.join('\n      - ')}` : ''}`);
  }

  const count = (v) => results.filter((r) => r.verdict === v).length;
  const summary = {
    inScope: plan.length, compared: results.filter((r) => ['match', 'mismatch', 'error', 'inconclusive'].includes(r.verdict)).length,
    match: count('match'), mismatch: count('mismatch'), error: count('error'), inconclusive: count('inconclusive'), skipped: count('skipped'), planned: count('planned'),
  };
  const skippedByReason = {};
  results.filter((r) => r.verdict === 'skipped').forEach((r) => { const k = r.reasons[0].replace(/:.*$/, '').replace(/\s*\(.*$/, ''); skippedByReason[k] = (skippedByReason[k] || 0) + 1; });
  const exitCode = opts.dryRun ? EXIT.OK : (summary.mismatch || summary.error || summary.inconclusive ? EXIT.FAIL : EXIT.OK);
  return { results, summary, skippedByReason, exitCode, credentials: cred.source };
}

async function main(argv, ioIn) {
  const io = defaultIo(ioIn);
  return runMain(async () => {
    const a = parseArgv(argv, SPEC);
    if (a.help) { io.log(helpText(__filename)); return EXIT.OK; }
    const opts = {
      ...a,
      budget: toInt('--budget', a.budget, 80, { min: 0 }),
      delayMs: toInt('--delay-ms', a.delayMs, 300, { min: 0 }),
      timeoutMs: toInt('--timeout-ms', a.timeoutMs, 20000, { min: 100 }),
    };
    const out = await runDifferential(opts, io);
    const s = out.summary;
    if (a.json) io.log(JSON.stringify(out, null, 2));
    else {
      io.log('');
      io.log(`RESULT: ${out.exitCode === 0 ? (opts.dryRun ? 'DRY RUN' : 'PASS') : 'FAIL'}  compared ${s.compared} of ${s.inScope} in scope | match ${s.match} mismatch ${s.mismatch} error ${s.error} inconclusive ${s.inconclusive} | skipped ${s.skipped}`);
      if (s.skipped) io.log(`skipped by reason: ${Object.entries(out.skippedByReason).map(([k, v]) => `${k}=${v}`).join('; ')}`);
      if (s.skipped && !opts.dryRun) io.log('NOTE: skipped endpoints are NOT evidence of parity; see --include-ai / --allow-writes (test account only).');
    }
    return out.exitCode;
  }, io);
}

module.exports = { main, runDifferential, compareResponses, planEndpoints, IGNORE_DEFAULT };

if (require.main === module) main(process.argv.slice(2)).then((c) => { process.exitCode = c; });
