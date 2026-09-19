'use strict';

/**
 * GET /api/benchmarks/run: authenticateToken -> requireAdmin (local guard, tagged kind:'admin').
 * Mirrors backend/tests/benchmarks.routes.test.js plus the cases the local guard implies.
 */
const { build } = require('./helpers');
const { getMiddlewareMeta } = require('../../../src/worker/lib/tag');
const router = require('../../../src/worker/routes/benchmarks');
const { FIXTURE_DATASET } = require('../../../src/worker/services/benchmarks/scorerBenchmark');

const RUN = '/api/benchmarks/run?scorerName=ats&datasetName=default';

describe('GET /api/benchmarks/run', () => {
  beforeEach(() => jest.spyOn(console, 'error').mockImplementation(() => {}));
  afterEach(() => jest.restoreAllMocks());

  it('401 without a token (before any db read for the role)', async () => {
    const H = build({ role: 'admin' });
    const res = await H.request(RUN);
    expect(res.status).toBe(401);
    expect(H.db.calls.some((c) => /FROM users/.test(c.sql))).toBe(false);
  });

  it('200 with metrics for an admin, and persists one scorer_benchmarks row', async () => {
    const H = build({ role: 'admin' });
    const res = await H.authed(RUN);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Object.keys(body)).toEqual(['mae', 'correlation', 'precisionAtThreshold', 'sampleSize']);
    expect(body.sampleSize).toBe(FIXTURE_DATASET.length);
    expect(H.db.state.scorer_benchmarks).toHaveLength(1);
    expect(H.db.state.scorer_benchmarks[0]).toMatchObject({ scorer_name: 'ats', dataset_name: 'default', sample_size: FIXTURE_DATASET.length });
    expect(JSON.parse(H.db.state.scorer_benchmarks[0].metrics)).toEqual({
      mae: body.mae,
      correlation: body.correlation,
      precisionAtThreshold: body.precisionAtThreshold,
    });
  });

  it('metrics are deterministic per scorer (ats / hr / fit) and unknown scorers fall back to ats', async () => {
    const H = build({ role: 'admin' });
    const get = async (scorerName) => (await H.authed(`/api/benchmarks/run?scorerName=${scorerName}&datasetName=d`)).json();
    const ats = await get('ats');
    const hr = await get('hr');
    const fit = await get('fit');
    const unknown = await get('nope');
    expect(unknown).toEqual(ats);
    expect(hr).not.toEqual(ats);
    expect(fit).not.toEqual(hr);
    expect(await get('ats')).toEqual(ats);
  });

  it('403 for an authenticated non-admin, exact body, and nothing is persisted', async () => {
    const H = build({ role: 'user' });
    const res = await H.authed(RUN);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Access denied. Admins only.' });
    expect(H.db.state.scorer_benchmarks).toHaveLength(0);
  });

  it('403 when the user row does not exist', async () => {
    const H = build(); // no users row
    const res = await H.authed(RUN);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Access denied. Admins only.' });
  });

  it('403 for a null role (only the exact string "admin" passes)', async () => {
    const H = build();
    H.db.state.users.push({ id: 1, role: null });
    expect((await H.authed(RUN)).status).toBe(403);
    const H2 = build({ role: 'Admin' });
    expect((await H2.authed(RUN)).status).toBe(403);
  });

  it('reads the role from the db per request, not from the token', async () => {
    const H = build({ role: 'admin' });
    expect((await H.authed(RUN)).status).toBe(200);
    H.db.state.users[0].role = 'user'; // demoted after the token was issued
    expect((await H.authed(RUN)).status).toBe(403);
    const lookups = H.db.calls.filter((c) => /FROM users/.test(c.sql));
    expect(lookups).toHaveLength(2);
    expect(lookups[0].params).toEqual([1]);
  });

  it('500 {"error":"Database error"} when the role lookup fails', async () => {
    const H = build({ role: 'admin' });
    H.db.failWhen((sql) => /FROM users/.test(sql), new Error('DB down'));
    const res = await H.authed(RUN);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Database error' });
  });

  it('400 when scorerName is missing (after the admin check, like Express)', async () => {
    const H = build({ role: 'admin' });
    const res = await H.authed('/api/benchmarks/run?datasetName=default');
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'scorerName query parameter is required' });
    // a non-admin sees 403 first, never the validation message
    const H2 = build({ role: 'user' });
    expect((await H2.authed('/api/benchmarks/run?datasetName=default')).status).toBe(403);
  });

  it('400 when datasetName is missing; empty values count as missing', async () => {
    const H = build({ role: 'admin' });
    const res = await H.authed('/api/benchmarks/run?scorerName=ats');
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'datasetName query parameter is required' });
    const empty = await H.authed('/api/benchmarks/run?scorerName=&datasetName=x');
    expect(empty.status).toBe(400);
    expect((await empty.json()).error).toMatch(/scorerName/);
  });

  it('500 {"error":"Benchmark failed","detail":<message>} when persisting fails (detail is preserved)', async () => {
    const H = build({ role: 'admin' });
    H.db.failWhen((sql) => /INSERT INTO scorer_benchmarks/.test(sql), new Error('relation "scorer_benchmarks" does not exist'));
    const res = await H.authed(RUN);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Benchmark failed', detail: 'relation "scorer_benchmarks" does not exist' });
  });

  it('PRESERVED QUIRK: an array-valued scorerName (repeated query key) is accepted and falls back to ats', async () => {
    const H = build({ role: 'admin' });
    const ats = await (await H.authed(RUN)).json();
    const res = await H.authed('/api/benchmarks/run?scorerName=hr&scorerName=fit&datasetName=d');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(ats);
    expect(H.db.state.scorer_benchmarks[1].scorer_name).toEqual(['hr', 'fit']);
  });
});

describe('requireAdmin tagging (route introspection)', () => {
  it('the local guard is tagged {kind:"admin"} and named requireAdmin', () => {
    const route = router.routes.find((r) => r.method === 'GET' && r.path === '/run');
    expect(route).toBeDefined();
    const guards = router.routes.filter((r) => r.method === 'GET' && r.path === '/run').map((r) => getMiddlewareMeta(r.handler));
    expect(guards.map((m) => m && m.name)).toEqual(['authenticateToken', 'requireAdmin', null]);
    expect(guards[1]).toEqual({ name: 'requireAdmin', kind: 'admin' });
  });
});
