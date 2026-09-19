/**
 * ADR-001 T4.4: plan-gating matrix. Two mock servers implement a tiny requirePlan; quirks make one of them leak, be
 * over-restrictive, fail closed, or be unported, to prove the matrix classifies each case.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { main, classifyDenialCell, classifyPassCell, planCells, TIER_NAMES } = require('../../scripts/migration/plan-gating-matrix');
const { startMock, json, makeIo } = require('./helpers/mockServer');

const TOKENS = {
  'tok-noplan': { tier: 0, name: null },
  'tok-tier1': { tier: 1, name: 'Learn & Build' },
  'tok-tier2': { tier: 2, name: 'Tune & Polish' },
  'tok-tier3': { tier: 3, name: 'Zero to Hero' },
};
const ENV = { JT_TOKEN_NOPLAN: 'tok-noplan', JT_TOKEN_TIER1: 'tok-tier1', JT_TOKEN_TIER2: 'tok-tier2', JT_TOKEN_TIER3: 'tok-tier3' };

const GATES = {
  'GET /api/t1/list': 1,
  'POST /api/t1/make': 1,
  'GET /api/t2/thing/:id': 2,
  'POST /api/t3/ai': 3,
};
const ep = (key, minTier) => { const [method, p] = key.split(' '); return { method, path: p, auth: true, minTier, guards: ['authenticateToken', `requirePlan(${minTier})`] }; };

let tmp;
let render;
let workers;
beforeAll(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'plangate-')); });
afterAll(() => { fs.rmSync(tmp, { recursive: true, force: true }); });
afterEach(async () => { if (render) await render.close(); if (workers) await workers.close(); render = undefined; workers = undefined; });

function manifestFile(extra = []) {
  const f = path.join(tmp, 'ref.json');
  const endpoints = [
    ...Object.entries(GATES).map(([k, t]) => ep(k, t)),
    { method: 'GET', path: '/api/open', auth: false, minTier: null },
    ...extra,
  ];
  fs.writeFileSync(f, JSON.stringify({ schema: { version: 1 }, endpoints }));
  return f;
}

/**
 * quirks: ungated (Set of keys reachable without the gate), missing (Set of keys answered with Express's 404),
 *         overRestrictive (Set of keys that deny even at/above), failClosed (Set answered 500 fail-closed),
 *         badShape (Set answered with a 403 lacking requiredPlan), reachedStatus (status of the handler when the gate is bypassed)
 */
function gateServer(quirks = {}) {
  const q = { ungated: new Set(), missing: new Set(), overRestrictive: new Set(), failClosed: new Set(), badShape: new Set(), reachedStatus: 200, wrongName: false, ...quirks };
  return startMock((rec, _b, res) => {
    const pathNorm = rec.path.replace(/\/\d+$/, '/:id');
    const key = `${rec.method} ${pathNorm}`;
    if (!(key in GATES)) return false;
    if (q.missing.has(key)) { res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(`<pre>Cannot ${rec.method} ${rec.path}</pre>`); return true; }
    const tok = TOKENS[(rec.headers.authorization || '').replace('Bearer ', '')];
    if (!tok) return json(res, 401, { error: 'Unauthorized' });
    if (q.failClosed.has(key)) return json(res, 500, { error: 'Failed to verify subscription plan' });
    const min = GATES[key];
    const denied = q.overRestrictive.has(key) ? true : tok.tier < min;
    if (denied && !q.ungated.has(key)) {
      if (q.badShape.has(key)) return json(res, 403, { error: 'This feature requires a higher subscription plan.', code: 'PLAN_UPGRADE_REQUIRED', currentPlan: tok.name });
      return json(res, 403, { error: 'This feature requires a higher subscription plan.', code: 'PLAN_UPGRADE_REQUIRED', requiredPlan: q.wrongName ? 'Premium' : TIER_NAMES[min], currentPlan: tok.name });
    }
    return json(res, rec.method === 'GET' ? q.reachedStatus : 400, { handled: true });
  });
}

async function setup(renderQuirks, workersQuirks) {
  render = await gateServer(renderQuirks);
  workers = await gateServer(workersQuirks);
}
const argv = (extra = []) => ['--render', render.url, '--workers', workers.url, '--reference', manifestFile(), '--delay-ms', '0', '--budget', '0', '--treat-as-safe', '/api/', ...extra];
const tokenOf = (rec) => (rec.headers.authorization || '').replace('Bearer ', '');

describe('classification (unit)', () => {
  const denial = (name = null, required = 'Tune & Polish') => ({ status: 403, json: { error: 'This feature requires a higher subscription plan.', code: 'PLAN_UPGRADE_REQUIRED', requiredPlan: required, currentPlan: name } });
  const acct = { label: 'tier 1' };
  it('both deny with the full body: pass', () => {
    expect(classifyDenialCell(denial('Learn & Build'), denial('Learn & Build'), { minTier: 2, account: acct }).verdict).toBe('pass');
  });
  it('Workers reaches the handler: CRITICAL', () => {
    const c = classifyDenialCell(denial('x'), { status: 200, json: { a: 1 } }, { minTier: 2, account: acct });
    expect(c.verdict).toBe('critical');
    expect(c.reasons.join(' ')).toMatch(/LEAK/);
    expect(classifyDenialCell(denial('x'), { status: 400, json: { error: 'validation' } }, { minTier: 2, account: acct }).verdict).toBe('critical');
    expect(classifyDenialCell(denial('x'), { status: 500, json: { error: 'Internal Server Error' } }, { minTier: 2, account: acct }).verdict).toBe('critical');
  });
  it('unported (Express 404), fail-closed 500 and a non-plan 403 are failures, not leaks', () => {
    expect(classifyDenialCell(denial('x'), { status: 404, text: '<pre>Cannot GET /x</pre>' }, { minTier: 2, account: acct }).verdict).toBe('fail');
    expect(classifyDenialCell(denial('x'), { status: 500, json: { error: 'Failed to verify subscription plan' } }, { minTier: 2, account: acct }).verdict).toBe('fail');
    expect(classifyDenialCell(denial('x'), { status: 403, json: { error: 'Forbidden' } }, { minTier: 2, account: acct }).verdict).toBe('fail');
  });
  it('a 401 on both is inconclusive; a 429 is inconclusive; Render not gating is a baseline anomaly', () => {
    expect(classifyDenialCell({ status: 401 }, { status: 401 }, { minTier: 1, account: acct }).verdict).toBe('inconclusive');
    expect(classifyDenialCell({ status: 429 }, denial(), { minTier: 1, account: acct }).verdict).toBe('inconclusive');
    const a = classifyDenialCell({ status: 200, json: {} }, denial(), { minTier: 1, account: acct });
    expect(a.verdict).toBe('fail');
    expect(a.reasons[0]).toMatch(/baseline anomaly/);
  });
  it('requires requiredPlan to be the tier name and currentPlan to be present', () => {
    expect(classifyDenialCell(denial('a', 'Premium'), denial('a', 'Premium'), { minTier: 2, account: acct }).verdict).toBe('fail');
    const noCurrent = { status: 403, json: { error: 'This feature requires a higher subscription plan.', code: 'PLAN_UPGRADE_REQUIRED', requiredPlan: 'Tune & Polish' } };
    expect(classifyDenialCell(noCurrent, noCurrent, { minTier: 2, account: acct }).reasons.join(' ')).toMatch(/currentPlan field missing/);
  });
  it('at/above: an over-restrictive Workers denial fails; equal answers pass', () => {
    expect(classifyPassCell({ status: 200, json: { a: 1 } }, denial(), {}).verdict).toBe('fail');
    expect(classifyPassCell({ status: 200, json: { a: 1 } }, { status: 200, json: { a: 2 } }, {}).verdict).toBe('pass');
    expect(classifyPassCell({ status: 200, json: { a: 1 } }, { status: 200, json: { b: 2 } }, {}).verdict).toBe('fail');
  });
  it('planCells: below-threshold denials run by default; at/above only with flags', () => {
    const m = { endpoints: [ep('GET /api/x', 2), ep('POST /api/y', 1)] };
    const accounts = [{ key: 'noplan', tier: 0, label: 'no-plan' }, { key: 'tier2', tier: 2, label: 'tier 2' }];
    const ai = new Map([['GET /api/x', { ai: false }], ['POST /api/y', { ai: true }]]);
    const def = planCells(m, { onlyPrefixes: [] }, accounts, ai);
    expect(def.filter((c) => c.action === 'run').map((c) => `${c.key}|${c.account.key}`)).toEqual(['GET /api/x|noplan', 'POST /api/y|noplan']);
    const reads = planCells(m, { onlyPrefixes: [], includeReads: true }, accounts, ai);
    expect(reads.filter((c) => c.action === 'run').map((c) => `${c.key}|${c.account.key}`)).toEqual(['GET /api/x|noplan', 'GET /api/x|tier2', 'POST /api/y|noplan']);
    const mut = planCells(m, { onlyPrefixes: [], includeMutating: true }, accounts, ai);
    expect(mut.filter((c) => c.action === 'run')).toHaveLength(4);
  });
});

describe('plan-gating matrix against two mock servers', () => {
  it('correct pair: every below-threshold denial passes; NO at/above request is sent by default (handlers never run)', async () => {
    await setup();
    const io = makeIo(ENV);
    const code = await main(argv(), io);
    expect(code).toBe(0);
    // denials: t1 endpoints (2) x noplan = 2; t2 (1) x {noplan,tier1} = 2; t3 (1) x {noplan,tier1,tier2} = 3  => 7 cells, 14 requests
    expect(io.text()).toMatch(/RESULT: PASS  4 gated endpoints, 16 cells \| pass 7 fail 0 critical 0 inconclusive 0 \| skipped 9/);
    expect(render.requests).toHaveLength(7);
    expect(workers.requests).toHaveLength(7);
    for (const rec of [...render.requests, ...workers.requests]) {
      const key = `${rec.method} ${rec.path.replace(/\/\d+$/, '/:id')}`;
      expect(TOKENS[tokenOf(rec)].tier).toBeLessThan(GATES[key]); // only accounts BELOW the tier are ever used
      expect(rec.json === undefined || Object.keys(rec.json).length === 0).toBe(true);
    }
    expect(io.text()).toMatch(/skipped cells are not evidence/);
  });

  it('Workers ungated on one endpoint: CRITICAL, exit 2, names endpoint and account', async () => {
    await setup({}, { ungated: new Set(['GET /api/t2/thing/:id']) });
    const io = makeIo(ENV);
    expect(await main(argv(), io)).toBe(2);
    expect(io.text()).toMatch(/CRITICAL: 2 entitlement leak\(s\)/);
    expect(io.text()).toMatch(/GET \/api\/t2\/thing\/:id as no-plan/);
    expect(io.text()).toMatch(/GET \/api\/t2\/thing\/:id as tier 1/);
    expect(io.text()).toMatch(/RESULT: CRITICAL/);
  });

  it('Workers reaches the handler with a 400 (POST ungated): CRITICAL', async () => {
    await setup({}, { ungated: new Set(['POST /api/t3/ai']) });
    expect(await main(argv(), makeIo(ENV))).toBe(2);
  });

  it('endpoint not ported yet (Express-style 404 on Workers) is a failure, not a leak (exit 1)', async () => {
    await setup({}, { missing: new Set(['GET /api/t1/list']) });
    const io = makeIo(ENV);
    expect(await main(argv(), io)).toBe(1);
    expect(io.text()).toMatch(/not ported yet/);
    expect(io.text()).not.toMatch(/CRITICAL:/);
  });

  it('fail-closed 500 on Workers is a failure (exit 1), not a leak', async () => {
    await setup({}, { failClosed: new Set(['GET /api/t1/list']) });
    const io = makeIo(ENV);
    expect(await main(argv(), io)).toBe(1);
    expect(io.text()).toMatch(/failed closed with 500/);
  });

  it('403 body shape differences (missing requiredPlan, wrong tier name) fail', async () => {
    await setup({}, { badShape: new Set(['POST /api/t1/make']) });
    const io = makeIo(ENV);
    expect(await main(argv(), io)).toBe(1);
    expect(io.text()).toMatch(/requiredPlan undefined/);
    await render.close(); await workers.close();
    await setup({}, { wrongName: true });
    expect(await main(argv(), makeIo(ENV))).toBe(1);
  });

  it('Render itself not gating an endpoint is reported as a baseline anomaly', async () => {
    await setup({ ungated: new Set(['GET /api/t1/list']) }, {});
    const io = makeIo(ENV);
    expect(await main(argv(), io)).toBe(1);
    expect(io.text()).toMatch(/baseline anomaly/);
  });

  it('--include-reads adds GET requests for accounts at/above the tier (never POST); over-restrictive Workers fails', async () => {
    await setup({}, { overRestrictive: new Set(['GET /api/t1/list']) });
    const io = makeIo(ENV);
    const code = await main(argv(['--include-reads']), io);
    const methods = new Set(render.requests.map((r) => r.method));
    expect(methods.has('POST') && render.requests.some((r) => r.method === 'POST' && TOKENS[tokenOf(r)].tier >= GATES['POST ' + r.path])).toBe(false);
    expect(render.requests.some((r) => r.method === 'GET' && TOKENS[tokenOf(r)].tier >= 1 && r.path === '/api/t1/list')).toBe(true);
    expect(code).toBe(1);
    expect(io.text()).toMatch(/over-restrictive/);
  });

  it('--include-mutating also sends mutating requests at/above the tier (both servers, side effects warned in the header)', async () => {
    await setup();
    const code = await main(argv(['--include-mutating']), makeIo(ENV));
    expect(code).toBe(0);
    const above = render.requests.filter((r) => r.method === 'POST' && TOKENS[tokenOf(r)].tier >= GATES[`POST ${r.path}`]);
    expect(above.length).toBeGreaterThan(0);
    expect(workers.requests).toHaveLength(render.requests.length);
  });

  it('a rejected token (401 on both) is inconclusive and fails the run', async () => {
    await setup();
    const io = makeIo({ ...ENV, JT_TOKEN_NOPLAN: 'expired-token' });
    expect(await main(argv(['--accounts', 'noplan']), io)).toBe(1);
    expect(io.text()).toMatch(/INCONCLUSIVE/);
    expect(io.text()).toMatch(/inconclusive 4/);
  });

  it('accounts without credentials are reported as NOT TESTED', async () => {
    await setup();
    const io = makeIo({ JT_TOKEN_NOPLAN: 'tok-noplan' });
    expect(await main(argv(), io)).toBe(0);
    expect(io.text()).toMatch(/NOT TESTED \(no credentials\): tier 1, tier 2, tier 3/);
    expect(io.text()).toMatch(/Checklist item 13 needs all four tiers/);
  });

  it('--only-prefix and --accounts scope the run', async () => {
    await setup();
    await main(argv(['--only-prefix', '/api/t3', '--accounts', 'noplan,tier2']), makeIo(ENV));
    expect(render.requests.map((r) => `${r.method} ${r.path} ${tokenOf(r)}`)).toEqual(['POST /api/t3/ai tok-noplan', 'POST /api/t3/ai tok-tier2']);
  });
});

describe('plan-gating matrix credentials and safety', () => {
  it('login mode needs --test-account-only, logs in on Render only, and re-logs in when the token ages out', async () => {
    await setup();
    let logins = 0;
    render.setHandler((rec, b, res) => {
      if (rec.method === 'POST' && rec.path === '/api/auth/login') { logins++; return json(res, 200, { token: 'tok-noplan', refreshToken: 'r' }); }
      return false;
    });
    const env = { JT_EMAIL_NOPLAN: 'np@example.test', JT_PASSWORD_NOPLAN: 'pw-not-printed' };
    const io = makeIo(env);
    expect(await main(argv(['--accounts', 'noplan']), io)).toBe(64);
    expect(io.errText()).toMatch(/--test-account-only/);
    expect(logins).toBe(0);

    const io2 = makeIo(env);
    await main(argv(['--accounts', 'noplan', '--test-account-only', '--token-ttl-min', '15']), io2);
    expect(logins).toBe(1); // one login serves every cell inside the ttl
    expect(io2.text() + io2.errText()).not.toMatch(/pw-not-printed/);
    expect(workers.requests.some((r) => r.path === '/api/auth/login')).toBe(false);

    logins = 0;
    await main(argv(['--accounts', 'noplan', '--test-account-only', '--token-ttl-min', '0']), makeIo(env));
    expect(logins).toBeGreaterThan(1); // ttl 0: every cell logs in again
  });

  it('refuses when both URLs are the same server', async () => {
    await setup();
    const io = makeIo(ENV);
    expect(await main(['--render', render.url, '--workers', render.url, '--reference', manifestFile()], io)).toBe(64);
    expect(io.errText()).toMatch(/same server/);
    expect(render.requests).toHaveLength(0);
  });

  it('--dry-run prints the cells and sends nothing', async () => {
    await setup();
    const io = makeIo({});
    expect(await main(argv(['--dry-run']), io)).toBe(0);
    expect(io.text()).toMatch(/would GET\s+\/api\/t2\/thing\/1\s+as no-plan\s+expect 403 PLAN_UPGRADE_REQUIRED \(requires Tune & Polish\)/);
    expect(io.text()).toMatch(/estimated duration/);
    expect(render.requests).toHaveLength(0);
    expect(workers.requests).toHaveLength(0);
  });

  it('needs credentials for at least one account, and rejects unknown account names', async () => {
    await setup();
    expect(await main(argv(), makeIo({}))).toBe(64);
    expect(await main(argv(['--accounts', 'gold']), makeIo(ENV))).toBe(64);
  });
});
