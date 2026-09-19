'use strict';

/**
 * /api/evidence (routes/evidence.js): GET /report (authenticateToken + requirePlan(3)),
 * GET /bullets (authenticateToken only). Real service + route, scripted fake db.
 */
const { build, makeLeaf2Db } = require('./helpers');

const REPORT_SQL = /FROM evidence_bullets eb LEFT JOIN evidence_usage eu/;
const BULLETS_ALL_SQL = /^SELECT id, bullet_text, skills, source_section, created_at FROM evidence_bullets WHERE user_id = \$1 ORDER BY created_at DESC$/;
const BULLETS_APP_SQL = /^SELECT eb\.id, eb\.bullet_text, eb\.skills, eb\.source_section, eb\.created_at FROM evidence_bullets eb INNER JOIN evidence_usage eu/;

beforeEach(() => jest.spyOn(console, 'error').mockImplementation(() => {}));
afterEach(() => jest.restoreAllMocks());

const denied = (requiredPlan, currentPlan) => ({
  error: 'This feature requires a higher subscription plan.',
  code: 'PLAN_UPGRADE_REQUIRED',
  requiredPlan,
  currentPlan,
});

describe('auth and plan parity', () => {
  it.each(['/api/evidence/report', '/api/evidence/bullets'])('401 without a token: %s', async (path) => {
    const H = build({ plan: 3 });
    const res = await H.get(path, { token: null });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
  });

  it('401 with a token signed by another secret', async () => {
    const H = build({ plan: 3 });
    const res = await H.get('/api/evidence/report', { token: require('../helpers/harness').signToken({ id: 7 }, { secret: 'x'.repeat(40) }) });
    expect(res.status).toBe(401);
  });

  it('report: 403 PLAN_UPGRADE_REQUIRED with no plan', async () => {
    const H = build();
    H.db.on(REPORT_SQL, () => { throw new Error('the service must not run'); });
    const res = await H.get('/api/evidence/report');
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual(denied('Zero to Hero', null));
    expect(H.db.leafCallsMatching(REPORT_SQL)).toHaveLength(0);
  });

  it.each([[1, 'Learn & Build'], [2, 'Tune & Polish']])('report: 403 below the tier-3 threshold (plan %i)', async (plan, name) => {
    const H = build({ plan });
    const res = await H.get('/api/evidence/report');
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual(denied('Zero to Hero', name));
  });

  it('report: allowed at exactly tier 3', async () => {
    const H = build({ plan: 3 });
    H.db.on(REPORT_SQL, () => ({ rows: [] }));
    const res = await H.get('/api/evidence/report');
    expect(res.status).toBe(200);
  });

  it('report fails CLOSED (500, service not reached) when the plan lookup errors', async () => {
    const H = build({ plan: 3 });
    H.db.failWhen((sql) => /FROM subscription_plans sp JOIN user_subscriptions/.test(sql), new Error('plans down'));
    H.db.on(REPORT_SQL, () => ({ rows: [] }));
    const res = await H.get('/api/evidence/report');
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Failed to verify subscription plan' });
    expect(H.db.leafCallsMatching(REPORT_SQL)).toHaveLength(0);
  });

  it('bullets is NOT plan gated: a user with no plan gets 200', async () => {
    const H = build();
    H.db.on(BULLETS_ALL_SQL, () => ({ rows: [] }));
    const res = await H.get('/api/evidence/bullets');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ bullets: [] });
  });
});

describe('GET /api/evidence/report', () => {
  it('returns the reuse report computed from the user\'s rows', async () => {
    const H = build({ plan: 3 });
    H.db.on(REPORT_SQL, () => ({
      rows: [
        { id: 1, bullet_text: 'Led team', skills: ['leadership'], usage_count: '4' },
        { id: 2, bullet_text: 'Built API', skills: [], usage_count: '1' },
        { id: 3, bullet_text: 'Wrote tests', skills: [], usage_count: '0' },
      ],
    }));
    const res = await H.get('/api/evidence/report');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      overUsed: [{ bullet: 'Led team', count: 4 }],
      underUsed: [{ bullet: 'Built API', count: 1 }, { bullet: 'Wrote tests', count: 0 }],
      uniqueBullets: 3,
      diversity: 55,
      suggestions: [
        '1 bullet(s) reused more than twice — consider creating variants.',
        '2 bullet(s) rarely used — consider highlighting them in upcoming applications.',
      ],
    });
    expect(H.db.leafCalls.find((c) => REPORT_SQL.test(c.sql)).params).toEqual([7]); // only the caller's id
  });

  it('empty user: the empty report shape', async () => {
    const H = build({ plan: 3 });
    H.db.on(REPORT_SQL, () => ({ rows: [] }));
    const res = await H.get('/api/evidence/report');
    expect(await res.json()).toEqual({ overUsed: [], underUsed: [], uniqueBullets: 0, diversity: 0, suggestions: [] });
  });

  it('a database error is a 500 carrying the message in `details` (existing behaviour, preserved)', async () => {
    const H = build({ plan: 3 });
    H.db.failOn(REPORT_SQL, new Error('connection lost'));
    const res = await H.get('/api/evidence/report');
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Failed to generate evidence report', details: 'connection lost' });
  });
});

describe('GET /api/evidence/bullets', () => {
  const rows = [{ id: 2, bullet_text: 'B', skills: ['sql'], source_section: 'experience', created_at: '2026-09-18T00:00:00.000Z' }];

  it('lists all of the user\'s bullets', async () => {
    const H = build({ plan: 1 });
    H.db.on(BULLETS_ALL_SQL, () => ({ rows }));
    const res = await H.get('/api/evidence/bullets');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ bullets: rows });
    expect(H.db.leafCalls[0].params).toEqual([7]);
  });

  it('?applicationId=N filters through the usage join with an integer parameter', async () => {
    const H = build({ plan: 1 });
    H.db.on(BULLETS_APP_SQL, () => ({ rows }));
    const res = await H.get('/api/evidence/bullets?applicationId=5');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ bullets: rows });
    expect(H.db.leafCalls[0].params).toEqual([7, 5]);
  });

  it('applicationId is parsed with parseInt(.., 10): "12abc" -> 12, repeated keys use the joined string', async () => {
    const H = build({ plan: 1 });
    H.db.on(BULLETS_APP_SQL, () => ({ rows: [] }));
    await H.get('/api/evidence/bullets?applicationId=12abc');
    await H.get('/api/evidence/bullets?applicationId=1&applicationId=2');
    expect(H.db.leafCalls.map((c) => c.params[1])).toEqual([12, 1]);
  });

  it('an empty applicationId is falsy and behaves like no filter', async () => {
    const H = build({ plan: 1 });
    H.db.on(BULLETS_ALL_SQL, () => ({ rows: [] }));
    const res = await H.get('/api/evidence/bullets?applicationId=');
    expect(res.status).toBe(200);
    expect(H.db.leafCalls[0].params).toEqual([7]);
  });

  it('a non-numeric applicationId reaches the database as NaN and fails as a 500 with details (preserved quirk)', async () => {
    const H = build({ plan: 1 });
    H.db.on(BULLETS_APP_SQL, ([, appId]) => {
      if (Number.isNaN(appId)) throw new Error('invalid input syntax for type integer: "NaN"');
      return { rows: [] };
    });
    const res = await H.get('/api/evidence/bullets?applicationId=abc');
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Failed to retrieve bullets', details: 'invalid input syntax for type integer: "NaN"' });
  });

  it('a database error is a 500 with details', async () => {
    const H = build({ plan: 1 });
    H.db.failOn(BULLETS_ALL_SQL, new Error('boom'));
    const res = await H.get('/api/evidence/bullets');
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Failed to retrieve bullets', details: 'boom' });
  });
});

it('uses the request-scoped db only (the harness db sees every query)', async () => {
  const db = makeLeaf2Db();
  const H = build({ db, plan: 3 });
  db.on(REPORT_SQL, () => ({ rows: [] }));
  await H.get('/api/evidence/report');
  expect(db.calls.some((c) => /subscription_plans/.test(c.sql))).toBe(true);
  expect(db.leafCalls).toHaveLength(1);
});
