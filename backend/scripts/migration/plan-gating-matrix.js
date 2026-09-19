#!/usr/bin/env node
'use strict';

/**
 * plan-gating-matrix.js  (ADR-001 T4.4, section 6.3, checklist items 5 (behavioural half), 13 and 14 (behavioural half))
 *
 * For every requirePlan endpoint of the Render reference manifest and every test account in {no-plan, tier 1, tier 2, tier 3},
 * sends the same request to Render and to Workers and asserts they answer identically. Below the required tier the answer
 * must be 403 {"code":"PLAN_UPGRADE_REQUIRED","requiredPlan":<tier name>,"currentPlan":<name|null>} on BOTH.
 *
 *   node scripts/migration/plan-gating-matrix.js --render <url> --workers <url> [--test-account-only] [options]
 *
 * WHAT IS TESTED BY DEFAULT (safe): only BELOW-threshold denials. requirePlan runs before the handler, so a correct server never
 * runs the handler for these requests: no side effects, no AI cost. Above-threshold requests DO run the real handler, hence:
 *   --include-reads     also GET requests for accounts at or above the tier (skips endpoints classified as AI unless --include-ai)
 *   --include-mutating  also POST/PUT/PATCH/DELETE (and AI GETs) at or above the tier: side effects and AI cost, BOTH servers
 *                       share one database so every write happens twice. Test accounts only.
 * Residual risk of the default run: if Workers FAILS to gate an endpoint, that request executes the real handler once, with
 * an empty JSON body and a below-threshold test account (validation normally rejects it first). That is the leak being detected.
 *
 * CLASSIFICATION (per endpoint x account, Render answer R, Workers answer W, below threshold)
 *   R and W both 403 with the full body, equal shape .......................... pass
 *   R gated (403) and W answers anything that shows the handler ran ........... CRITICAL (entitlement leak), exit 2
 *      (2xx, 3xx, 400, a JSON 404, a masked 5xx; every answer except the ones listed on the following lines)
 *   W 404 with Express's HTML "Cannot <METHOD> <path>" ......................... fail: not ported yet (not a leak)
 *   W 500 {"error":"Failed to verify subscription plan"} ...................... fail: fail-closed but different from Render
 *   W 403 but body differs (code / requiredPlan / currentPlan) ................ fail
 *   R not 403 (Render itself does not gate) ................................... fail: baseline anomaly, reported before any parity claim
 *   401 on both / 429 .......................................................... inconclusive (token expired or rate limited)
 *
 * CREDENTIALS (environment only, never printed or stored). Per account name NOPLAN, TIER1, TIER2, TIER3:
 *   JT_TOKEN_<NAME>                        a bearer token, OR
 *   JT_EMAIL_<NAME> + JT_PASSWORD_<NAME>   logs in on Render (needs --test-account-only) and re-logs in every --token-ttl-min
 *                                          minutes, because access tokens live 15 minutes and a full run takes longer.
 * The token is issued by Render and used on both servers (same JWT secret, same database).
 * "no plan" = a user without a row in user_subscriptions; tier 1..3 = users assigned the plan with that tier_level.
 *
 * PACING: Render's express-rate-limit allows 100 requests / 15 min / IP on /api. The runner sends at most --budget (default 80)
 * requests to Render per 15 minutes, so a full run takes about one hour; --dry-run prints the estimate.
 *
 * OPTIONS  --reference <f> | --only-prefix <p> (repeatable) | --accounts noplan,tier1,... | --include-reads | --include-mutating
 *          | --include-ai | --budget <n> (80) | --delay-ms <n> (300) | --token-ttl-min <n> (12) | --timeout-ms <n>
 *          | --treat-as-ai / --treat-as-safe <substr> | --dry-run | --json | --verbose
 *
 * Exit codes: 0 all tested cells pass | 1 failures (or inconclusive cells) | 2 CRITICAL leak (gated on Render, reachable on Workers)
 *             | 64 usage / refusal.
 */

const {
  EXIT, REPO_DIR, UsageError, parseArgv, toInt, assertTwoDistinctTargets, httpCall, compareShapes, loadManifest, inPrefixes,
  fillPath, endpointKey, MUTATING, login, ENV, Pacer, runMain, defaultIo, helpText,
} = require('./lib/common');
const { classifyAiEndpoints } = require('./lib/ai-classify');

const TIER_NAMES = { 1: 'Learn & Build', 2: 'Tune & Polish', 3: 'Zero to Hero' };
const ACCOUNTS = [
  { key: 'noplan', env: 'NOPLAN', tier: 0, label: 'no-plan' },
  { key: 'tier1', env: 'TIER1', tier: 1, label: 'tier 1' },
  { key: 'tier2', env: 'TIER2', tier: 2, label: 'tier 2' },
  { key: 'tier3', env: 'TIER3', tier: 3, label: 'tier 3' },
];
const FAIL_CLOSED_MESSAGE = 'Failed to verify subscription plan';

const SPEC = {
  flags: { '--test-account-only': 'testAccountOnly', '--include-reads': 'includeReads', '--include-mutating': 'includeMutating', '--include-ai': 'includeAi', '--dry-run': 'dryRun', '--json': 'json', '--verbose': 'verbose' },
  values: {
    '--render': 'render', '--workers': 'workers', '--reference': 'reference', '--accounts': 'accounts', '--budget': 'budget', '--delay-ms': 'delayMs',
    '--token-ttl-min': 'tokenTtlMin', '--timeout-ms': 'timeoutMs',
  },
  lists: { '--only-prefix': 'onlyPrefixes', '--treat-as-ai': 'treatAsAi', '--treat-as-safe': 'treatAsSafe' },
};

/* ------------------------------------------------------------------------- */
/* Pure pieces (unit-tested)                                                  */
/* ------------------------------------------------------------------------- */

const isDenial = (r) => r.status === 403 && r.json && r.json.code === 'PLAN_UPGRADE_REQUIRED';
const isPlainNotFound = (r) => r.status === 404 && r.json === undefined && /^Cannot [A-Z]+ \//.test(String(r.text || '').replace(/<[^>]*>/g, ' ').trim().replace(/\s+/g, ' '));
const isFailClosed500 = (r) => r.status === 500 && r.json && r.json.error === FAIL_CLOSED_MESSAGE;

/** The full 403 body contract, checked on one server's answer. @returns string[] problems */
function denialProblems(r, minTier) {
  const problems = [];
  if (!isDenial(r)) return [`expected 403 PLAN_UPGRADE_REQUIRED, got HTTP ${r.status}${r.json && r.json.code ? ` ${r.json.code}` : ''}`];
  const b = r.json;
  if (b.error !== 'This feature requires a higher subscription plan.') problems.push(`error message differs: ${JSON.stringify(b.error)}`);
  if (b.requiredPlan !== TIER_NAMES[minTier]) problems.push(`requiredPlan ${JSON.stringify(b.requiredPlan)} (expected ${JSON.stringify(TIER_NAMES[minTier])})`);
  if (!('currentPlan' in b)) problems.push('currentPlan field missing');
  return problems;
}

/**
 * Classify one below-threshold cell. account.tier < minTier.
 * @returns {{ verdict: 'pass'|'fail'|'critical'|'inconclusive', reasons: string[] }}
 */
function classifyDenialCell(R, W, { minTier, account, ignore = new Set() }) {
  if (R.status === 0 || W.status === 0) return { verdict: 'fail', reasons: [`network error: Render=${R.error || R.status} Workers=${W.error || W.status}`] };
  if (R.status === 429 || W.status === 429) return { verdict: 'inconclusive', reasons: [`rate limited (Render ${R.status}, Workers ${W.status})`] };
  if (R.status === 401 && W.status === 401) return { verdict: 'inconclusive', reasons: ['both servers answered 401: the test token was rejected (expired?)'] };
  if (R.status === 401 || W.status === 401) return { verdict: 'fail', reasons: [`one server rejected the token: Render ${R.status}, Workers ${W.status}`] };

  const rOk = isDenial(R);
  if (!rOk) {
    // Render itself does not deny: the reference is not what the manifest claims; parity cannot be judged.
    return { verdict: 'fail', reasons: [`baseline anomaly: Render did not deny ${account.label} (HTTP ${R.status}${R.json && R.json.code ? ` ${R.json.code}` : ''}); Workers answered HTTP ${W.status}`] };
  }
  const rProblems = denialProblems(R, minTier);
  const reasons = rProblems.map((p) => `Render: ${p}`);
  if (isDenial(W)) {
    denialProblems(W, minTier).forEach((p) => reasons.push(`Workers: ${p}`));
    if (R.json.currentPlan !== W.json.currentPlan) reasons.push(`currentPlan differs: Render ${JSON.stringify(R.json.currentPlan)} vs Workers ${JSON.stringify(W.json.currentPlan)}`);
    compareShapes(R.json, W.json, ignore).diffs.forEach((d) => reasons.push(`body ${d.path}: ${d.kind} (${d.detail})`));
    return { verdict: reasons.length ? 'fail' : 'pass', reasons };
  }
  // Render denied; Workers did not.
  if (isPlainNotFound(W)) return { verdict: 'fail', reasons: [...reasons, 'Workers answered Express-style 404: endpoint not ported yet (no leak, but no parity)'] };
  if (isFailClosed500(W)) return { verdict: 'fail', reasons: [...reasons, `Workers failed closed with 500 "${FAIL_CLOSED_MESSAGE}" where Render denied with 403 (no leak; the plan lookup failed on Workers)`] };
  if (W.status === 403) return { verdict: 'fail', reasons: [...reasons, 'Workers answered 403 without code PLAN_UPGRADE_REQUIRED (another guard, not the plan gate)'] };
  return {
    verdict: 'critical',
    reasons: [...reasons, `LEAK: Render gates ${account.label} out of a tier-${minTier} endpoint (403) but Workers answered HTTP ${W.status}${W.json && W.json.code ? ` ${W.json.code}` : ''}: the handler ran`],
  };
}

/** At/above-threshold cell: same status on both, and never a plan denial on Workers when Render lets the request through. */
function classifyPassCell(R, W, { ignore = new Set() }) {
  if (R.status === 0 || W.status === 0) return { verdict: 'fail', reasons: [`network error: Render=${R.error || R.status} Workers=${W.error || W.status}`] };
  if (R.status === 429 || W.status === 429) return { verdict: 'inconclusive', reasons: [`rate limited (Render ${R.status}, Workers ${W.status})`] };
  if (R.status === 401 && W.status === 401) return { verdict: 'inconclusive', reasons: ['both servers answered 401: the test token was rejected (expired?)'] };
  const reasons = [];
  if (isDenial(W) && !isDenial(R)) reasons.push(`Workers denies with PLAN_UPGRADE_REQUIRED but Render lets the account through (HTTP ${R.status}): over-restrictive`);
  else if (isDenial(R) && !isDenial(W)) reasons.push(`Render denies but Workers does not (HTTP ${W.status}) although the account is at or above the tier`);
  else if (R.status !== W.status) reasons.push(`status ${R.status} (Render) vs ${W.status} (Workers)`);
  else if (R.json !== undefined && W.json !== undefined) compareShapes(R.json, W.json, ignore).diffs.forEach((d) => reasons.push(`body ${d.path}: ${d.kind} (${d.detail})`));
  return { verdict: reasons.length ? 'fail' : 'pass', reasons };
}

/**
 * Plan the matrix. Returns cells { key, endpoint, account, kind: 'denial'|'pass', action: 'run'|'skip', reason? }.
 */
function planCells(manifest, opts, accounts, aiMap) {
  const cells = [];
  const gated = manifest.endpoints.filter((e) => e.minTier !== null && e.minTier !== undefined && inPrefixes(e.path, opts.onlyPrefixes));
  for (const e of gated) {
    const key = endpointKey(e);
    const tier = typeof e.minTier === 'number' ? e.minTier : Number(e.minTier);
    const method = String(e.method).toUpperCase();
    for (const acct of accounts) {
      const base = { key, endpoint: e, account: acct, minTier: tier };
      if (!Number.isInteger(tier)) { cells.push({ ...base, kind: 'denial', action: 'skip', reason: `minTier ${JSON.stringify(e.minTier)} is not numeric` }); continue; }
      if (acct.tier < tier) { cells.push({ ...base, kind: 'denial', action: 'run' }); continue; }
      // at or above the threshold: the real handler would run
      const ai = aiMap.get(key) || { ai: true, reason: 'unclassified' };
      if (MUTATING.has(method)) {
        cells.push({ ...base, kind: 'pass', action: opts.includeMutating ? 'run' : 'skip', reason: 'at/above threshold, mutating: runs the real handler (needs --include-mutating)' });
      } else if (ai.ai && !opts.includeAi && !opts.includeMutating) {
        cells.push({ ...base, kind: 'pass', action: 'skip', reason: `at/above threshold, may call the AI model: ${ai.reason} (needs --include-ai or --include-mutating)` });
      } else {
        cells.push({ ...base, kind: 'pass', action: opts.includeReads || opts.includeMutating ? 'run' : 'skip', reason: 'at/above threshold: runs the real handler (needs --include-reads)' });
      }
    }
  }
  return cells;
}

/* ------------------------------------------------------------------------- */
/* Credentials                                                                */
/* ------------------------------------------------------------------------- */

class TokenBook {
  constructor({ io, env, renderBase, ttlMs, testAccountOnly, timeoutMs, pacer }) {
    Object.assign(this, { io, env, renderBase, ttlMs, testAccountOnly, timeoutMs, pacer });
    this.cache = new Map();
    this.logins = 0;
  }
  configured(acct) {
    const n = ENV.tier(acct.env);
    if (this.env[n.token]) return 'token';
    if (this.env[n.email] && this.env[n.password]) return 'login';
    return null;
  }
  async get(acct) {
    const n = ENV.tier(acct.env);
    if (this.env[n.token]) return this.env[n.token];
    const cached = this.cache.get(acct.key);
    if (cached && Date.now() - cached.at < this.ttlMs) return cached.token;
    await this.pacer.wait();
    const r = await login({ base: this.renderBase, email: this.env[n.email], password: this.env[n.password], replaceDevice: true, fetchImpl: this.io.fetchImpl, timeoutMs: this.timeoutMs });
    this.logins++;
    if (!r.ok) throw new UsageError(`login on Render failed for the ${acct.label} test account (HTTP ${r.status}${r.error ? ` ${r.error}` : ''}); nothing further was sent`);
    this.cache.set(acct.key, { token: r.token, at: Date.now() });
    return r.token;
  }
}

/* ------------------------------------------------------------------------- */
/* Runner                                                                     */
/* ------------------------------------------------------------------------- */

async function runPlanMatrix(opts, io) {
  const { render, workers } = assertTwoDistinctTargets(opts.render, opts.workers);
  const manifest = loadManifest(opts.reference);
  const wanted = opts.accounts ? String(opts.accounts).split(',').map((s) => s.trim().toLowerCase()).filter(Boolean) : ACCOUNTS.map((a) => a.key);
  for (const w of wanted) if (!ACCOUNTS.some((a) => a.key === w)) throw new UsageError(`unknown account "${w}" (use noplan,tier1,tier2,tier3)`);
  const selected = ACCOUNTS.filter((a) => wanted.includes(a.key));

  const pacer = new Pacer({ delayMs: opts.delayMs, budget: opts.budget, sleepImpl: io.sleepImpl, log: io.log });
  const authPacer = new Pacer({ delayMs: 0, budget: 0 });
  const book = new TokenBook({ io, env: io.env, renderBase: render, ttlMs: opts.tokenTtlMin * 60 * 1000, testAccountOnly: opts.testAccountOnly, timeoutMs: opts.timeoutMs, pacer: authPacer });

  const modes = selected.map((a) => ({ a, mode: book.configured(a) }));
  const usable = modes.filter((m) => m.mode).map((m) => m.a);
  const missing = modes.filter((m) => !m.mode).map((m) => m.a.label);
  if (!opts.dryRun) {
    if (!usable.length) throw new UsageError(`no test credentials in the environment. Per account (${selected.map((a) => a.env).join(', ')}) set JT_TOKEN_<NAME> or JT_EMAIL_<NAME> + JT_PASSWORD_<NAME>`);
    if (modes.some((m) => m.mode === 'login') && !opts.testAccountOnly) throw new UsageError('refusing to log in: credentials are set but --test-account-only was not given. Logging in replaces an account\'s active session; pass --test-account-only to confirm these are dedicated test accounts.');
  }

  const aiMap = classifyAiEndpoints(manifest.endpoints, { repoDir: opts.repoDir || REPO_DIR, treatAsAi: opts.treatAsAi, treatAsSafe: opts.treatAsSafe });
  const planAccounts = opts.dryRun ? selected : usable;
  const cells = planCells(manifest, opts, planAccounts, aiMap);
  const toRun = cells.filter((c) => c.action === 'run');
  const gatedCount = new Set(cells.map((c) => c.key)).size;

  io.log(`Plan-gating matrix: Render=${render}  Workers=${workers}`);
  io.log(`gated endpoints in scope: ${gatedCount} | accounts: ${planAccounts.map((a) => a.label).join(', ')}${missing.length && !opts.dryRun ? ` | NOT TESTED (no credentials): ${missing.join(', ')}` : ''}`);
  io.log(`cells: ${toRun.length} to run (${toRun.filter((c) => c.kind === 'denial').length} below-threshold denials, ${toRun.filter((c) => c.kind === 'pass').length} at/above), ${cells.length - toRun.length} skipped${opts.dryRun ? '  [DRY RUN: nothing is sent]' : ''}`);
  const estMin = opts.budget > 0 ? Math.ceil((toRun.length / opts.budget) * 15) : Math.ceil((toRun.length * (opts.delayMs + 400)) / 60000);
  io.log(`estimated duration: about ${estMin} minute(s) at ${opts.budget > 0 ? `${opts.budget} Render requests per 15 min` : 'no rate budget'}`);

  const results = [];
  let aborted = false;
  let consec = 0;
  for (const c of cells) {
    const e = c.endpoint;
    const method = String(e.method).toUpperCase();
    const url = fillPath(e.path);
    const label = `${c.key} as ${c.account.label}`;
    if (c.action === 'skip') { results.push({ ...cellInfo(c), verdict: 'skipped', reasons: [c.reason] }); continue; }
    if (opts.dryRun) {
      io.log(`  would ${method.padEnd(6)} ${url}  as ${c.account.label}  expect ${c.kind === 'denial' ? `403 PLAN_UPGRADE_REQUIRED (requires ${TIER_NAMES[c.minTier]})` : 'the same answer on both'}`);
      results.push({ ...cellInfo(c), verdict: 'planned', reasons: [] });
      continue;
    }
    if (aborted) { results.push({ ...cellInfo(c), verdict: 'skipped', reasons: ['aborted after repeated 429 responses'] }); continue; }
    const token = await book.get(c.account);
    const headers = { Authorization: `Bearer ${token}` };
    const body = MUTATING.has(method) ? {} : undefined;
    await pacer.wait();
    const R = await httpCall({ url: render + url, method, headers, body, timeoutMs: opts.timeoutMs, fetchImpl: io.fetchImpl });
    const W = await httpCall({ url: workers + url, method, headers, body, timeoutMs: opts.timeoutMs, fetchImpl: io.fetchImpl });
    const cls = c.kind === 'denial' ? classifyDenialCell(R, W, { minTier: c.minTier, account: c.account }) : classifyPassCell(R, W, {});
    results.push({ ...cellInfo(c), verdict: cls.verdict, reasons: cls.reasons, render: R.status, workers: W.status });
    if (cls.verdict === 'inconclusive' && (R.status === 429 || W.status === 429)) { consec++; if (consec >= 3) { aborted = true; io.err('aborting: 3 consecutive 429 responses. Wait 15 minutes or lower --budget.'); } } else consec = 0;
    if (opts.verbose || cls.verdict !== 'pass') io.log(`  ${cls.verdict.toUpperCase().padEnd(12)} ${label}  [Render ${R.status} / Workers ${W.status}]${cls.reasons.length ? `\n      - ${cls.reasons.join('\n      - ')}` : ''}`);
  }

  const count = (v) => results.filter((r) => r.verdict === v).length;
  const summary = {
    gatedEndpoints: gatedCount, cells: cells.length, pass: count('pass'), fail: count('fail'), critical: count('critical'), inconclusive: count('inconclusive'), skipped: count('skipped'), planned: count('planned'),
    notTestedAccounts: missing,
  };
  const leaks = results.filter((r) => r.verdict === 'critical');
  const exitCode = opts.dryRun ? EXIT.OK : leaks.length ? EXIT.CRITICAL : (summary.fail || summary.inconclusive ? EXIT.FAIL : EXIT.OK);
  return { results, summary, leaks: leaks.map((l) => `${l.key} as ${l.account}`), exitCode, logins: book.logins };
}

const cellInfo = (c) => ({ key: c.key, account: c.account.label, minTier: c.minTier, kind: c.kind });

async function main(argv, ioIn) {
  const io = defaultIo(ioIn);
  return runMain(async () => {
    const a = parseArgv(argv, SPEC);
    if (a.help) { io.log(helpText(__filename)); return EXIT.OK; }
    const opts = {
      ...a,
      budget: toInt('--budget', a.budget, 80, { min: 0 }),
      delayMs: toInt('--delay-ms', a.delayMs, 300, { min: 0 }),
      tokenTtlMin: toInt('--token-ttl-min', a.tokenTtlMin, 12, { min: 0 }),
      timeoutMs: toInt('--timeout-ms', a.timeoutMs, 20000, { min: 100 }),
    };
    const out = await runPlanMatrix(opts, io);
    const s = out.summary;
    io.log('');
    if (out.leaks.length) {
      io.log(`CRITICAL: ${out.leaks.length} entitlement leak(s): gated on Render, reachable on Workers:`);
      out.leaks.forEach((l) => io.log(`  - ${l}`));
    }
    io.log(`RESULT: ${out.exitCode === 0 ? (opts.dryRun ? 'DRY RUN' : 'PASS') : out.exitCode === EXIT.CRITICAL ? 'CRITICAL' : 'FAIL'}  ${s.gatedEndpoints} gated endpoints, ${s.cells} cells | pass ${s.pass} fail ${s.fail} critical ${s.critical} inconclusive ${s.inconclusive} | skipped ${s.skipped}`);
    if (s.skipped && !opts.dryRun) io.log('NOTE: at/above-threshold cells are skipped unless --include-reads / --include-mutating; skipped cells are not evidence of parity.');
    if (s.notTestedAccounts.length && !opts.dryRun) io.log(`NOTE: not tested (no credentials): ${s.notTestedAccounts.join(', ')}. Checklist item 13 needs all four tiers.`);
    if (a.json) io.log(JSON.stringify(out, null, 2));
    return out.exitCode;
  }, io);
}

module.exports = { main, runPlanMatrix, classifyDenialCell, classifyPassCell, planCells, denialProblems, TIER_NAMES };

if (require.main === module) main(process.argv.slice(2)).then((c) => { process.exitCode = c; });
