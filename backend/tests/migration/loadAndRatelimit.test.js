/**
 * ADR-001 T4.6 (load test) and checklist item 18 (rate-limit probe), against local mock servers only.
 */
const { main: loadMain, summariseStep, hasBurst } = require('../../scripts/migration/load-test');
const { main: probeMain, AUTH_MESSAGE, API_MESSAGE } = require('../../scripts/migration/ratelimit-probe');
const { startMock, json, makeIo } = require('./helpers/mockServer');

let server;
afterEach(async () => { if (server) await server.close(); server = undefined; });

describe('load-test helpers', () => {
  it('hasBurst: N events inside a 2 s window', () => {
    expect(hasBurst([0, 100, 200, 300, 400], 5)).toBe(true);
    expect(hasBurst([0, 1000, 2500, 4000, 6000], 3)).toBe(false);
    expect(hasBurst([0, 900, 1800], 3)).toBe(true);
    expect(hasBurst([], 1)).toBe(false);
  });
  it('summariseStep: percentiles, error rate (5xx + network), 429 counted apart, flags', () => {
    const samples = [];
    for (let i = 1; i <= 100; i++) samples.push({ path: '/a', status: 200, ms: i, t: i * 100 });
    samples.push({ path: '/b', status: 429, ms: 1, t: 1 });
    samples.push({ path: '/b', status: 0, ms: 5, t: 2, error: 'ECONNRESET' });
    const s = summariseStep(samples, { elapsedMs: 10000, burstCount: 5 });
    expect(s.p50).toBe(50);
    expect(s.p95).toBe(95);
    expect(s.p99).toBe(99);
    expect(s.errors).toBe(1);
    expect(s.rateLimited).toBe(1);
    expect(s.paths['/b']).toMatchObject({ requests: 2, errors: 1, rateLimited: 1 });
    expect(s.flags).toEqual([]);
    const burst = summariseStep(Array.from({ length: 6 }, (_, i) => ({ path: '/a', status: 500, ms: 10, t: i * 100, body: 'remaining connection slots are reserved' })), { elapsedMs: 1000, burstCount: 5 });
    expect(burst.flags.join('|')).toMatch(/5xx burst/);
    expect(burst.flags.join('|')).toMatch(/mention connection limits/);
    expect(summariseStep([{ path: '/a', status: 522, ms: 1, t: 0 }], { elapsedMs: 1000, burstCount: 5 }).flags.join()).toMatch(/522/);
  });
});

describe('load-test against a mock server', () => {
  const quick = ['--duration-s', '1', '--think-ms', '5'];

  it('healthy server: PASS, both paths hit, in-flight requests never exceed the concurrency, percentiles reported', async () => {
    let inFlight = 0; let maxInFlight = 0;
    server = await startMock((rec, _b, res) => {
      inFlight++; maxInFlight = Math.max(maxInFlight, inFlight);
      setTimeout(() => { inFlight--; json(res, 200, { ok: true }); }, 5);
      return true;
    });
    const io = makeIo();
    const code = await loadMain(['--url', server.url, '--concurrency', '3', ...quick], io);
    expect(code).toBe(0);
    expect(maxInFlight).toBeLessThanOrEqual(3);
    const paths = new Set(server.requests.map((r) => r.path));
    expect(paths).toEqual(new Set(['/api/health', '/api/subscriptions/plans']));
    expect(server.requests.every((r) => r.method === 'GET')).toBe(true);
    expect(io.text()).toMatch(/concurrency\s+3: \d+ req, [\d.]+ rps \| errors 0 \(0\.00%\) \| 429 0 \| p50 \d+ms p95 \d+ms p99 \d+ms/);
    expect(io.text()).toMatch(/RESULT: PASS/);
    expect(io.text()).toMatch(/does not prove Neon connection handling/);
  });

  it('a 5xx burst with connection-limit bodies on the DB path: FAIL with exhaustion flags', async () => {
    server = await startMock((rec, _b, res) => (rec.path === '/api/subscriptions/plans'
      ? json(res, 500, { error: 'sorry, too many clients already' })
      : json(res, 200, { status: 'ok' })));
    const io = makeIo();
    const code = await loadMain(['--url', server.url, '--concurrency', '2', ...quick], io);
    expect(code).toBe(1);
    expect(io.text()).toMatch(/FLAG: 5xx burst/);
    expect(io.text()).toMatch(/mention connection limits/);
    expect(io.text()).toMatch(/error rate [\d.]+% > 1%/);
  });

  it('a degraded health answer (HTTP 200, db unreachable) counts as an error and raises the exhaustion flag', async () => {
    server = await startMock((rec, _b, res) => (rec.path === '/api/health'
      ? json(res, 200, { status: 'degraded', db: 'unreachable', aiCache: {} })
      : json(res, 200, [])));
    const io = makeIo();
    expect(await loadMain(['--url', server.url, '--concurrency', '2', ...quick], io)).toBe(1);
    expect(io.text()).toMatch(/FLAG: \d+ health answer\(s\) reported db unreachable/);
    expect(io.text()).toMatch(/error rate [\d.]+% > 1%/);
    expect(summariseStep([{ path: '/api/health', status: 200, ms: 3, t: 0, degraded: true }], { elapsedMs: 1000, burstCount: 5 }).errors).toBe(1);
  });

  it('429s (the limiter working) are reported separately and are not errors', async () => {
    server = await startMock((rec, _b, res) => json(res, 429, { error: 'Too many requests, please try again later.' }));
    const io = makeIo();
    expect(await loadMain(['--url', server.url, '--concurrency', '2', ...quick], io)).toBe(0);
    expect(io.text()).toMatch(/errors 0 \(0\.00%\) \| 429 [1-9]\d*/);
  });

  it('ramp: several concurrency values produce one step each; a rising error rate is called out', async () => {
    let phase = 0;
    server = await startMock((rec, _b, res) => (phase === 1 && Math.random() < 0.5 ? json(res, 503, { error: 'busy' }) : json(res, 200, {})));
    const io = makeIo();
    const origLog = io.log;
    io.log = (s) => { if (/concurrency\s+2:/.test(s)) phase = 1; origLog(s); };
    await loadMain(['--url', server.url, '--concurrency', '1,2', '--max-error-rate', '100', ...quick], io);
    expect(io.text()).toMatch(/concurrency\s+1:/);
    expect(io.text()).toMatch(/concurrency\s+2:/);
  });

  it('--max-p99-ms fails a slow server', async () => {
    server = await startMock((rec, _b, res) => { setTimeout(() => json(res, 200, {}), 60); return true; });
    const io = makeIo();
    expect(await loadMain(['--url', server.url, '--concurrency', '2', '--max-p99-ms', '10', ...quick], io)).toBe(1);
    expect(io.text()).toMatch(/p99 \d+ms > 10ms/);
  });

  it('safety: explicit URL, no Render production host, concurrency cap, dry run', async () => {
    server = await startMock((rec, _b, res) => json(res, 200, {}));
    let io = makeIo();
    expect(await loadMain([], io)).toBe(64);
    io = makeIo();
    expect(await loadMain(['--url', 'https://jobtune-backend-14k0.onrender.com'], io)).toBe(64);
    expect(io.errText()).toMatch(/production Render host/);
    io = makeIo();
    expect(await loadMain(['--url', server.url, '--concurrency', '60'], io)).toBe(64);
    expect(io.errText()).toMatch(/--allow-high-load/);
    io = makeIo();
    expect(await loadMain(['--url', server.url, '--dry-run', '--concurrency', '5,10'], io)).toBe(0);
    expect(io.text()).toMatch(/Nothing sent/);
    expect(server.requests).toHaveLength(0);
    expect(await loadMain(['--url', server.url, '--mix', '150'], makeIo())).toBe(64);
  });
});

describe('ratelimit-probe against a mock server', () => {
  const ENV = { JT_TEST_EMAIL: 'test@example.test', JT_TEST_PASSWORD: 'REAL-password-must-never-be-sent' };
  /** login endpoint that allows `allow` requests then answers 429 with `message` */
  const limiter = (allow, message = AUTH_MESSAGE, headers = {}) => {
    let n = 0;
    return (rec, _b, res) => {
      if (rec.method === 'POST' && rec.path === '/api/auth/login') {
        n++;
        return n > allow ? json(res, 429, { error: message }, headers) : json(res, 400, { error: 'Invalid credentials' });
      }
      return false;
    };
  };

  it('PASS: 20 wrong logins allowed, the 21st is 429 with the Express body; only the test email and a random wrong password are sent', async () => {
    server = await startMock(limiter(20, AUTH_MESSAGE, { 'Retry-After': '900', 'RateLimit-Limit': '20' }));
    const io = makeIo(ENV);
    const code = await probeMain(['--url', server.url, '--test-account-only'], io);
    expect(io.text()).toMatch(/first 429 at request #21; 20 request\(s\) were allowed first/);
    expect(io.text()).toMatch(/Retry-After: 900 \| RateLimit headers: ratelimit-limit/);
    expect(io.text()).toMatch(/follow-up request: HTTP 429 \(still throttled\)/);
    expect(io.text()).toMatch(/RESULT: PASS/);
    expect(code).toBe(0);
    expect(server.requests).toHaveLength(22); // 21 burst requests (stops at the first 429) + 1 follow-up
    for (const r of server.requests) {
      expect(r.json.email).toBe('test@example.test');
      expect(r.json.password).toMatch(/^wrong-[0-9a-f]{24}$/);
      expect(JSON.stringify(r.json)).not.toContain('REAL-password');
    }
    expect(new Set(server.requests.map((r) => r.json.password)).size).toBe(1);
    expect(io.text() + io.errText()).not.toContain('REAL-password');
  });

  it('FAIL when no 429 ever appears: rate limiting is not enforced', async () => {
    server = await startMock(limiter(1e9));
    const io = makeIo(ENV);
    expect(await probeMain(['--url', server.url, '--test-account-only', '--attempts', '25'], io)).toBe(1);
    expect(io.text()).toMatch(/NO 429 in 25 requests: rate limiting is NOT enforced/);
    expect(server.requests).toHaveLength(25);
  });

  it('FAIL when the limiter is looser than the budget (allows 25 > 20)', async () => {
    server = await startMock(limiter(25));
    const io = makeIo(ENV);
    expect(await probeMain(['--url', server.url, '--test-account-only'], io)).toBe(1);
    expect(io.text()).toMatch(/25 requests were allowed before the first 429; the budget is 20/);
  });

  it('FAIL when the 429 body is not the Express message', async () => {
    server = await startMock(limiter(5, 'Rate limit exceeded'));
    const io = makeIo(ENV);
    expect(await probeMain(['--url', server.url, '--test-account-only'], io)).toBe(1);
    expect(io.text()).toMatch(/429 body differs from the Express contract/);
  });

  it('FAIL when the requests before the throttle were not reaching the login handler (e.g. 500s)', async () => {
    let n = 0;
    server = await startMock((rec, _b, res) => { n++; return n > 3 ? json(res, 429, { error: AUTH_MESSAGE }) : json(res, 500, { error: 'Internal Server Error' }); });
    const io = makeIo(ENV);
    expect(await probeMain(['--url', server.url, '--test-account-only'], io)).toBe(1);
    expect(io.text()).toMatch(/not the expected 400 "Invalid credentials"/);
  });

  it('the general /api limiter probe: GET with --allow-more, expecting the API message and a budget of 100', async () => {
    let n = 0;
    server = await startMock((rec, _b, res) => { n++; return n > 100 ? json(res, 429, { error: API_MESSAGE }) : json(res, 200, { status: 'ok' }); });
    const io = makeIo({});
    const code = await probeMain(['--url', server.url, '--test-account-only', '--path', '/api/health', '--method', 'GET', '--attempts', '150', '--allow-more', '--expect-max-before-limit', '100'], io);
    expect(code).toBe(0);
    expect(io.text()).toMatch(/first 429 at request #101/);
  });

  it('refusals: needs --test-account-only, the test email, a sane attempt cap, no huge concurrency; dry-run sends nothing', async () => {
    server = await startMock(limiter(20));
    let io = makeIo(ENV);
    expect(await probeMain(['--url', server.url], io)).toBe(64);
    expect(io.errText()).toMatch(/--test-account-only/);
    io = makeIo({});
    expect(await probeMain(['--url', server.url, '--test-account-only'], io)).toBe(64);
    expect(io.errText()).toMatch(/JT_TEST_EMAIL/);
    io = makeIo(ENV);
    expect(await probeMain(['--url', server.url, '--test-account-only', '--attempts', '61'], io)).toBe(64);
    expect(io.errText()).toMatch(/cap of 60/);
    expect(await probeMain(['--url', server.url, '--test-account-only', '--attempts', '61', '--allow-more'], makeIo(ENV))).toBe(0); // accepted by --allow-more; the mock throttles at 21
    expect(await probeMain(['--url', server.url, '--test-account-only', '--concurrency', '9'], makeIo(ENV))).toBe(64);
    expect(await probeMain(['--test-account-only'], makeIo(ENV))).toBe(64);
    expect(await probeMain(['--url', server.url, '--test-account-only', '--method', 'DELETE'], makeIo(ENV))).toBe(64);
    const before = server.requests.length;
    io = makeIo(ENV);
    expect(await probeMain(['--url', server.url, '--test-account-only', '--dry-run'], io)).toBe(0);
    expect(server.requests.length).toBe(before);
    expect(io.text()).toMatch(/dry run: nothing sent/);
  });
});
