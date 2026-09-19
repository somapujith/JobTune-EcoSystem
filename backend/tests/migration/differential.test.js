/**
 * ADR-001 T4.2: differential runner. Two local mock servers stand in for Render and Workers; no real service is contacted.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const { main, runDifferential, compareResponses, planEndpoints } = require('../../scripts/migration/differential');
const { compareShapes, fillPath, sameTarget, Pacer, normalizeBase } = require('../../scripts/migration/lib/common');
const { classifyAiEndpoints } = require('../../scripts/migration/lib/ai-classify');
const { startMock, json, router, makeIo } = require('./helpers/mockServer');

let tmp;
let render;
let workers;
beforeAll(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'differential-')); });
afterAll(() => { fs.rmSync(tmp, { recursive: true, force: true }); });
beforeEach(async () => {
  render = await startMock(() => false);
  workers = await startMock(() => false);
});
afterEach(async () => { await render.close(); await workers.close(); });

function writeManifest(endpoints, name = 'ref.json') {
  const f = path.join(tmp, name);
  fs.writeFileSync(f, JSON.stringify({ schema: { version: 1 }, endpoints }));
  return f;
}
const ep = (method, p, extra = {}) => ({ method, path: p, auth: false, admin: false, roles: null, minTier: null, guards: [], ...extra });
const both = (routes) => { render.setHandler(router(routes)); workers.setHandler(router(routes)); };
const args = (manifest, extra = []) => ['--render', render.url, '--workers', workers.url, '--reference', manifest, '--delay-ms', '0', '--treat-as-safe', '/api/', ...extra];

describe('compareShapes (unit)', () => {
  it('identical shapes; values are never compared', () => {
    expect(compareShapes({ a: 1, b: 'x', c: [1, 2] }, { a: 99, b: 'y', c: [3] }).diffs).toEqual([]);
  });
  it('reports missing, extra and type differences with their path', () => {
    const r = compareShapes({ a: 1, b: { c: 'x', d: 1 }, e: [] }, { a: '1', b: { c: 'x', z: 1 }, e: [] });
    expect(r.diffs.map((d) => `${d.path}:${d.kind}`).sort()).toEqual(['$.a:type', '$.b.d:missing', '$.b.z:extra']);
  });
  it('null versus a value is a type difference on plain objects, but tolerated inside array elements', () => {
    expect(compareShapes({ a: null }, { a: 'x' }).diffs).toHaveLength(1);
    expect(compareShapes({ l: [{ a: null }, { a: 'x' }] }, { l: [{ a: 'y' }] }).diffs).toEqual([]);
  });
  it('merges array element shapes; detects a key missing on every element of one side', () => {
    expect(compareShapes({ l: [{ a: 1 }, { a: 2, b: 3 }] }, { l: [{ a: 1, b: 3 }] }).diffs).toEqual([]);
    expect(compareShapes({ l: [{ a: 1, b: 1 }] }, { l: [{ a: 1 }] }).diffs.map((d) => d.path)).toEqual(['$.l[].b']);
  });
  it('an empty array on one side is a note, not a difference', () => {
    const r = compareShapes({ l: [] }, { l: [{ a: 1 }] });
    expect(r.diffs).toEqual([]);
    expect(r.notes[0]).toMatch(/empty array on Render only/);
  });
  it('ignored keys are skipped entirely', () => {
    expect(compareShapes({ token: 'a', x: 1 }, { token: null, x: 1 }, new Set(['token'])).diffs).toEqual([]);
    expect(compareShapes({ token: 'a', x: 1 }, { x: 1 }, new Set(['token'])).diffs).toEqual([]);
  });
});

describe('helpers', () => {
  it('fillPath replaces params, regex constraints and wildcards', () => {
    expect(fillPath('/api/x/:id/y/:slug')).toBe('/api/x/1/y/sample');
    expect(fillPath('/api/x/:id{[0-9]+}/:name(\\w+)', { name: 'a b' })).toBe('/api/x/1/a%20b');
  });
  it('sameTarget treats localhost and 127.0.0.1 on one port as the same server', () => {
    expect(sameTarget('http://localhost:8787', 'http://127.0.0.1:8787')).toBe(true);
    expect(sameTarget('https://a.example', 'https://a.example/')).toBe(true);
    expect(sameTarget('https://a.example', 'https://b.example')).toBe(false);
    expect(sameTarget('http://127.0.0.1:1', 'http://127.0.0.1:2')).toBe(false);
  });
  it('normalizeBase rejects junk', () => {
    expect(() => normalizeBase('--x', 'ftp://x')).toThrow(/http/);
    expect(() => normalizeBase('--x', 'https://x?a=1')).toThrow(/query/);
    expect(normalizeBase('--x', 'https://x.example/base/')).toBe('https://x.example/base');
  });
  it('Pacer waits when the per-window budget is exhausted', async () => {
    let t = 0;
    const waits = [];
    const p = new Pacer({ delayMs: 0, budget: 2, windowMs: 1000, now: () => t, sleepImpl: async (ms) => { waits.push(ms); t += ms; } });
    await p.wait(); await p.wait(); await p.wait();
    expect(waits).toHaveLength(1);
    expect(waits[0]).toBeGreaterThanOrEqual(1000);
  });
});

describe('compareResponses (unit)', () => {
  const R = (status, jsonBody, ct = 'application/json') => ({ status, json: jsonBody, contentType: ct });
  it('match / mismatch / inconclusive / error', () => {
    expect(compareResponses(R(200, { a: 1 }), R(200, { a: 2 }), new Set()).verdict).toBe('match');
    expect(compareResponses(R(200, { a: 1 }), R(403, { a: 1 }), new Set()).reasons[0]).toMatch(/status 200 \(Render\) vs 403/);
    expect(compareResponses(R(429, {}), R(200, {}), new Set()).verdict).toBe('inconclusive');
    expect(compareResponses({ status: 0, error: 'ECONNREFUSED' }, R(200, {}), new Set()).verdict).toBe('error');
    expect(compareResponses(R(404, undefined, 'text/html; charset=utf-8'), R(404, undefined, 'text/html'), new Set()).verdict).toBe('match');
    expect(compareResponses(R(404, undefined, 'text/html'), R(404, { error: 'x' }), new Set()).reasons[0]).toMatch(/body kind differs/);
  });
});

describe('differential runner against two mock servers', () => {
  const manifest = () => writeManifest([ep('GET', '/api/a'), ep('GET', '/api/items/:id')]);

  it('identical responses -> PASS, exit 0, and both servers were called for every endpoint', async () => {
    both({
      'GET /api/a': (r, res) => json(res, 200, { ok: true, list: [{ id: 1, n: 'x' }] }),
      'GET /api/items/1': (r, res) => json(res, 200, { id: 1 }),
    });
    const io = makeIo();
    const code = await main(args(manifest()), io);
    expect(code).toBe(0);
    expect(io.text()).toMatch(/RESULT: PASS  compared 2 of 2 in scope \| match 2/);
    expect(render.requests.map((r) => r.path)).toEqual(['/api/a', '/api/items/1']);
    expect(workers.requests.map((r) => r.path)).toEqual(['/api/a', '/api/items/1']);
  });

  it('status difference -> FAIL', async () => {
    render.setHandler(router({ 'GET /api/a': (r, res) => json(res, 200, { ok: true }) }));
    workers.setHandler(router({ 'GET /api/a': (r, res) => json(res, 403, { ok: true }) }));
    const io = makeIo();
    const code = await main(args(writeManifest([ep('GET', '/api/a')])), io);
    expect(code).toBe(1);
    expect(io.text()).toMatch(/MISMATCH\s+GET \/api\/a[\s\S]*status 200 \(Render\) vs 403 \(Workers\)/);
  });

  it('missing key on Workers -> FAIL', async () => {
    render.setHandler(router({ 'GET /api/a': (r, res) => json(res, 200, { ok: true, extra: 1 }) }));
    workers.setHandler(router({ 'GET /api/a': (r, res) => json(res, 200, { ok: true }) }));
    const io = makeIo();
    expect(await main(args(writeManifest([ep('GET', '/api/a')])), io)).toBe(1);
    expect(io.text()).toMatch(/\$\.extra: missing/);
  });

  it('extra key on Workers -> FAIL', async () => {
    render.setHandler(router({ 'GET /api/a': (r, res) => json(res, 200, { ok: true }) }));
    workers.setHandler(router({ 'GET /api/a': (r, res) => json(res, 200, { ok: true, leaked: 'x' }) }));
    const io = makeIo();
    expect(await main(args(writeManifest([ep('GET', '/api/a')])), io)).toBe(1);
    expect(io.text()).toMatch(/\$\.leaked: extra/);
  });

  it('type difference -> FAIL, nested inside arrays too', async () => {
    render.setHandler(router({ 'GET /api/a': (r, res) => json(res, 200, { rows: [{ id: 1 }] }) }));
    workers.setHandler(router({ 'GET /api/a': (r, res) => json(res, 200, { rows: [{ id: '1' }] }) }));
    const io = makeIo();
    expect(await main(args(writeManifest([ep('GET', '/api/a')])), io)).toBe(1);
    expect(io.text()).toMatch(/\$\.rows\[\]\.id: type \(number vs string\)/);
  });

  it('volatile keys in the default ignore list do not fail; --ignore extends the list', async () => {
    render.setHandler(router({ 'GET /api/a': (r, res) => json(res, 200, { token: 'abc', created_at: '2024', note: 'x' }) }));
    workers.setHandler(router({ 'GET /api/a': (r, res) => json(res, 200, { token: null, created_at: null, note: null }) }));
    const m = writeManifest([ep('GET', '/api/a')]);
    expect(await main(args(m), makeIo())).toBe(1); // `note` string vs null is a real type difference
    expect(await main(args(m, ['--ignore', 'note']), makeIo())).toBe(0);
  });

  it('a 5xx on both sides with the same shape matches; body kind difference fails', async () => {
    both({ 'GET /api/a': (r, res) => json(res, 500, { error: 'Internal Server Error' }) });
    expect(await main(args(writeManifest([ep('GET', '/api/a')])), makeIo())).toBe(0);
    workers.setHandler(router({ 'GET /api/a': (r, res) => { res.writeHead(500, { 'Content-Type': 'text/html' }); res.end('<html>'); return true; } }));
    expect(await main(args(writeManifest([ep('GET', '/api/a')])), makeIo())).toBe(1);
  });

  it('a network failure on one side is an error (exit 1)', async () => {
    both({ 'GET /api/a': (r, res) => json(res, 200, {}) });
    const m = writeManifest([ep('GET', '/api/a')]);
    await workers.close();
    workers = await startMock(() => false); // fresh server, but point the run at a dead port
    const io = makeIo();
    const code = await main(['--render', render.url, '--workers', 'http://127.0.0.1:1', '--reference', m, '--delay-ms', '0', '--timeout-ms', '3000', '--treat-as-safe', '/api/'], io);
    expect(code).toBe(1);
    expect(io.text()).toMatch(/ERROR\s+GET \/api\/a/);
  });

  it('refuses to run when both URLs are the same server (exit 64, nothing sent)', async () => {
    const io = makeIo();
    expect(await main(['--render', render.url, '--workers', render.url + '/', '--reference', manifest(), '--treat-as-safe', '/api/'], io)).toBe(64);
    expect(io.errText()).toMatch(/same server/);
    const asLocalhost = render.url.replace('127.0.0.1', 'localhost');
    expect(await main(['--render', render.url, '--workers', asLocalhost, '--reference', manifest()], makeIo())).toBe(64);
    expect(render.requests).toHaveLength(0);
  });

  it('--dry-run prints the planned requests and sends nothing (not even a login)', async () => {
    const io = makeIo({ JT_TEST_EMAIL: 'test@example.test', JT_TEST_PASSWORD: 'never-printed' });
    const m = writeManifest([ep('GET', '/api/a', { auth: true }), ep('POST', '/api/w'), ep('GET', '/api/items/:id')]);
    const code = await main(args(m, ['--dry-run', '--test-account-only']), io);
    expect(code).toBe(0);
    expect(io.text()).toMatch(/would GET\s+\/api\/a\s+\[bearer after login\]/);
    expect(io.text()).toMatch(/would GET\s+\/api\/items\/1/);
    expect(io.text()).not.toMatch(/would POST/);
    expect(io.text()).toMatch(/DRY RUN/);
    expect(io.text()).not.toMatch(/never-printed/);
    expect(render.requests).toHaveLength(0);
    expect(workers.requests).toHaveLength(0);
  });

  it('is GET-only by default; writes need --allow-writes; DELETE and auth/subscription/admin writes need --allow-destructive', async () => {
    both({
      'GET /api/a': (r, res) => json(res, 200, {}),
      'POST /api/w': (r, res) => json(res, 201, { got: true }),
      'POST /api/auth/login': (r, res) => json(res, 400, { error: 'Invalid credentials' }),
      'DELETE /api/w/1': (r, res) => json(res, 200, {}),
    });
    const m = writeManifest([ep('GET', '/api/a'), ep('POST', '/api/w'), ep('POST', '/api/auth/login'), ep('DELETE', '/api/w/:id')]);
    const ro = makeIo();
    expect(await main(args(m), ro)).toBe(0);
    expect(render.requests.map((r) => r.method)).toEqual(['GET']);
    expect(ro.text()).toMatch(/skipped by reason: mutating method=3/);

    render.requests.length = 0; workers.requests.length = 0;
    const rw = makeIo();
    expect(await main(args(m, ['--allow-writes']), rw)).toBe(0);
    expect(render.requests.map((r) => `${r.method} ${r.path}`)).toEqual(['GET /api/a', 'POST /api/w']);
    expect(workers.requests.map((r) => `${r.method} ${r.path}`)).toEqual(['GET /api/a', 'POST /api/w']); // written on BOTH
    expect(rw.text()).toMatch(/destructive \/ account-affecting=2/);

    render.requests.length = 0; workers.requests.length = 0;
    expect(await main(args(m, ['--allow-writes', '--allow-destructive']), makeIo())).toBe(0);
    expect(render.requests.map((r) => `${r.method} ${r.path}`)).toEqual(['GET /api/a', 'POST /api/w', 'POST /api/auth/login', 'DELETE /api/w/1']);
  });

  it('sends bodies from --bodies for mutating requests', async () => {
    both({ 'POST /api/w': (r, res) => json(res, 201, {}) });
    const bodies = path.join(tmp, 'bodies.json');
    fs.writeFileSync(bodies, JSON.stringify({ 'POST /api/w': { title: 'synthetic' } }));
    await main(args(writeManifest([ep('POST', '/api/w')]), ['--allow-writes', '--bodies', bodies]), makeIo());
    expect(render.requests[0].json).toEqual({ title: 'synthetic' });
    expect(workers.requests[0].json).toEqual({ title: 'synthetic' });
  });

  it('skips AI endpoints unless --include-ai (fixture Express source, static classification)', async () => {
    const repo = path.join(tmp, 'repo');
    const w = (rel, text) => { fs.mkdirSync(path.dirname(path.join(repo, rel)), { recursive: true }); fs.writeFileSync(path.join(repo, rel), text); };
    w('backend/src/utils/aiClient.js', 'module.exports = { callAI: async () => ({}) };');
    w('backend/src/services/gen.js', "const { callAI } = require('../utils/aiClient');\nmodule.exports = { generate: (x) => callAI(x) };");
    w('backend/src/services/plain.js', 'module.exports = { list: () => [] };');
    const routeSrc = [
      "const express = require('express');",
      'const router = express.Router();',
      "const gen = require('../services/gen');",
      "const plain = require('../services/plain');",
      "const { callAI } = require('../utils/aiClient');",
      'async function helper(x) { return callAI(x); }',
      "router.get('/pure', async (req, res) => res.json(plain.list()));",
      "router.get('/viaservice', async (req, res) => res.json(await gen.generate(1)));",
      "router.get('/viahelper', async (req, res) => res.json(await helper(1)));",
      "router.get('/direct', async (req, res) => res.json(await callAI({})));",
      'module.exports = router;',
    ].join('\n');
    w('backend/src/routes/r.js', routeSrc);
    const line = (needle) => routeSrc.split('\n').findIndex((l) => l.includes(needle)) + 1;
    const eps = ['pure', 'viaservice', 'viahelper', 'direct'].map((n) => ep('GET', `/api/${n}`, { sourceFile: 'backend/src/routes/r.js', line: line(`'/${n}'`) }));
    const cls = classifyAiEndpoints(eps, { repoDir: repo });
    expect([...cls.entries()].map(([k, v]) => `${k}=${v.ai}`)).toEqual(['GET /api/pure=false', 'GET /api/viaservice=true', 'GET /api/viahelper=true', 'GET /api/direct=true']);

    both({ 'GET /api/pure': (r, res) => json(res, 200, []), 'GET /api/viaservice': (r, res) => json(res, 200, {}), 'GET /api/viahelper': (r, res) => json(res, 200, {}), 'GET /api/direct': (r, res) => json(res, 200, {}) });
    const io = makeIo();
    const base = { render: render.url, workers: workers.url, reference: writeManifest(eps, 'ai.json'), repoDir: repo, delayMs: 0, timeoutMs: 5000, budget: 0 };
    const out = await runDifferential(base, io);
    expect(render.requests.map((r) => r.path)).toEqual(['/api/pure']);
    expect(out.summary).toMatchObject({ compared: 1, skipped: 3 });
    expect(out.skippedByReason['may call the AI model']).toBe(3);

    render.requests.length = 0;
    const out2 = await runDifferential({ ...base, includeAi: true }, makeIo());
    expect(render.requests).toHaveLength(4);
    expect(out2.summary.skipped).toBe(0);
  });

  it('unclassifiable endpoints (no source info) are treated as AI and skipped by default', async () => {
    both({ 'GET /api/a': (r, res) => json(res, 200, {}) });
    const io = makeIo();
    const code = await main(['--render', render.url, '--workers', workers.url, '--reference', writeManifest([ep('GET', '/api/a')]), '--delay-ms', '0'], io);
    expect(code).toBe(0);
    expect(render.requests).toHaveLength(0);
    expect(io.text()).toMatch(/may call the AI model=1/);
  });

  describe('credentials', () => {
    const authManifest = () => writeManifest([ep('GET', '/api/me', { auth: true }), ep('GET', '/api/pub')]);
    const routes = (seen) => ({
      'GET /api/me': (r, res) => { seen.push(r.headers.authorization || null); return json(res, r.headers.authorization ? 200 : 401, { user: 1 }); },
      'GET /api/pub': (r, res) => { seen.push(`pub:${r.headers.authorization || null}`); return json(res, 200, {}); },
    });

    it('refuses to log in without --test-account-only (exit 64, nothing sent)', async () => {
      const io = makeIo({ JT_TEST_EMAIL: 'test@example.test', JT_TEST_PASSWORD: 'pw' });
      expect(await main(args(authManifest()), io)).toBe(64);
      expect(io.errText()).toMatch(/--test-account-only/);
      expect(render.requests).toHaveLength(0);
    });

    it('with --test-account-only: logs in ONCE on Render, uses that token on both, never sends it to public endpoints', async () => {
      const seenR = []; const seenW = [];
      render.setHandler(router({
        ...routes(seenR),
        'POST /api/auth/login': (r, res) => json(res, 200, { token: 'render-issued-token', refreshToken: 'r', session: {} }),
      }));
      workers.setHandler(router(routes(seenW)));
      const io = makeIo({ JT_TEST_EMAIL: 'test@example.test', JT_TEST_PASSWORD: 'pw' });
      expect(await main(args(authManifest(), ['--test-account-only']), io)).toBe(0);
      const login = render.requests.filter((r) => r.path === '/api/auth/login');
      expect(login).toHaveLength(1);
      expect(login[0].json).toEqual({ email: 'test@example.test', password: 'pw', replaceDevice: true });
      expect(workers.requests.some((r) => r.path === '/api/auth/login')).toBe(false);
      expect(seenR).toEqual(['Bearer render-issued-token', 'pub:null']);
      expect(seenW).toEqual(['Bearer render-issued-token', 'pub:null']);
      expect(io.text() + io.errText()).not.toMatch(/render-issued-token|"pw"/);
    });

    it('JT_TEST_TOKEN is used on both servers without any login', async () => {
      const seenR = []; const seenW = [];
      render.setHandler(router(routes(seenR)));
      workers.setHandler(router(routes(seenW)));
      const io = makeIo({ JT_TEST_TOKEN: 'env-token' });
      expect(await main(args(authManifest()), io)).toBe(0);
      expect(seenR[0]).toBe('Bearer env-token');
      expect(seenW[0]).toBe('Bearer env-token');
      expect(render.requests.some((r) => r.path === '/api/auth/login')).toBe(false);
    });

    it('anonymous: protected endpoints are compared on their 401 responses', async () => {
      render.setHandler(router(routes([])));
      workers.setHandler(router({ ...routes([]), 'GET /api/me': (r, res) => json(res, 200, { user: 1 }) })); // Workers forgot auth
      const io = makeIo();
      expect(await main(args(authManifest()), io)).toBe(1);
      expect(io.text()).toMatch(/status 401 \(Render\) vs 200 \(Workers\)/);
    });

    it('a failed login stops the run before anything is compared', async () => {
      render.setHandler(router({ 'POST /api/auth/login': (r, res) => json(res, 400, { error: 'Invalid credentials' }) }));
      const io = makeIo({ JT_TEST_EMAIL: 'a@b.test', JT_TEST_PASSWORD: 'x' });
      expect(await main(args(authManifest(), ['--test-account-only']), io)).toBe(64);
      expect(io.errText()).toMatch(/login on Render failed \(HTTP 400\)/);
      expect(workers.requests).toHaveLength(0);
    });
  });

  it('a 429 is INCONCLUSIVE (never a pass); three in a row abort the run', async () => {
    const eps = ['a', 'b', 'c', 'd', 'e'].map((n) => ep('GET', `/api/${n}`));
    render.setHandler((rec, _b, res) => json(res, 429, {}));
    workers.setHandler((rec, _b, res) => json(res, 200, {}));
    const io = makeIo();
    const code = await main(args(writeManifest(eps)), io);
    expect(code).toBe(1);
    expect(io.errText()).toMatch(/aborting: 3 consecutive 429/);
    expect(io.text()).toMatch(/inconclusive 3/);
    expect(render.requests).toHaveLength(3);
  });

  it('a stack trace, internal path, connection string or secret name in a Workers body is a mismatch (checklist item 22); on Render only it is a note', async () => {
    const leaky = { error: 'boom', stack: 'Error: boom\n    at handler (/app/src/routes/x.js:10:5)\n    at next (/app/node_modules/express/lib/router/route.js:1:1)' };
    render.setHandler(router({ 'GET /api/a': (r, res) => json(res, 500, { error: 'Internal Server Error' }) }));
    workers.setHandler(router({ 'GET /api/a': (r, res) => json(res, 500, leaky) }));
    const io = makeIo();
    expect(await main(args(writeManifest([ep('GET', '/api/a')])), io)).toBe(1);
    expect(io.text()).toMatch(/LEAK on Workers: stack trace in the response body/);
    expect(io.text()).toMatch(/LEAK on Workers: internal file path/);

    workers.setHandler(router({ 'GET /api/a': (r, res) => json(res, 500, { error: 'connect failed postgres://user:pw@host/db' }) }));
    const io2 = makeIo();
    expect(await main(args(writeManifest([ep('GET', '/api/a')])), io2)).toBe(1);
    expect(io2.text()).toMatch(/LEAK on Workers: database connection string/);

    // Render leaking too: the run still passes when Workers is clean and same-shaped (the leak is pre-existing on Render)
    render.setHandler(router({ 'GET /api/a': (r, res) => json(res, 500, { error: 'x', stack: leaky.stack }) }));
    workers.setHandler(router({ 'GET /api/a': (r, res) => json(res, 500, { error: 'x' }) }));
    const io3 = makeIo();
    const code = await main(args(writeManifest([ep('GET', '/api/a')]), ['--verbose']), io3);
    expect(io3.text()).toMatch(/MISMATCH|body \$\.stack: missing/); // shape differs (stack key missing on Workers), and no LEAK line for Workers
    expect(io3.text()).not.toMatch(/LEAK on Workers/);
    expect(code).toBe(1);
  });

  it('planEndpoints reports a reason for every skipped endpoint', () => {
    const plan = planEndpoints({ endpoints: [ep('GET', '/api/a'), ep('POST', '/api/b'), ep('DELETE', '/api/c'), ep('GET', '/api/ai')] },
      { onlyPrefixes: [] }, new Map([['GET /api/a', { ai: false }], ['POST /api/b', { ai: false }], ['DELETE /api/c', { ai: false }], ['GET /api/ai', { ai: true, reason: 'uses callAI' }]]));
    expect(plan.map((p) => `${p.key}:${p.action}`)).toEqual(['GET /api/a:run', 'POST /api/b:skip', 'DELETE /api/c:skip', 'GET /api/ai:skip']);
  });

  it('--only-prefix scopes the run; unknown options and missing URLs are usage errors', async () => {
    both({ 'GET /api/a': (r, res) => json(res, 200, {}), 'GET /api/other/x': (r, res) => json(res, 200, {}) });
    const m = writeManifest([ep('GET', '/api/a'), ep('GET', '/api/other/x')]);
    await main(args(m, ['--only-prefix', '/api/other']), makeIo());
    expect(render.requests.map((r) => r.path)).toEqual(['/api/other/x']);
    expect(await main(['--nope'], makeIo())).toBe(64);
    expect(await main(['--reference', m], makeIo())).toBe(64);
  });
});
