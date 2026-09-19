'use strict';

/**
 * /api/learning-path (routes/learningPath.js): six endpoints, all authenticateToken only.
 * Real learningPathService + route against the stateful learning_topics / progress / streaks model.
 * Errors are thrown (Express called next(err)), so 5xx bodies are the masked global error shape.
 */
const { build, addDays } = require('./helpers');
const { signToken } = require('../helpers/harness');

beforeEach(() => jest.spyOn(console, 'error').mockImplementation(() => {}));
afterEach(() => jest.restoreAllMocks());

const BASE = '/api/learning-path';
const ENDPOINTS = [
  ['GET', `${BASE}/subjects`],
  ['GET', `${BASE}/python/streak`],
  ['GET', `${BASE}/python/Beginner`],
  ['GET', `${BASE}/python/Beginner/variables`],
  ['POST', `${BASE}/python/Beginner/variables/complete`],
  ['DELETE', `${BASE}/python/Beginner/variables/complete`],
];

describe('auth parity', () => {
  it.each(ENDPOINTS)('401 without a token: %s %s', async (method, path) => {
    const H = build();
    const res = await H.call(method, path, { token: null });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
    expect(H.db.leafCalls).toHaveLength(0);
  });

  it.each(ENDPOINTS)('is NOT plan gated: %s %s works for a user with no subscription', async (method, path) => {
    const H = build();
    const res = await H.call(method, path);
    expect(res.status).toBe(200);
  });
});

describe('GET /subjects', () => {
  it('lists the distinct subjects', async () => {
    const H = build();
    const res = await H.get(`${BASE}/subjects`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ subjects: ['python', 'sql'] });
  });

  it('a database error surfaces as the masked global 500', async () => {
    const H = build();
    H.db.failOn(/^SELECT DISTINCT subject/, new Error('secret: postgres://u:p@h/db'));
    const res = await H.get(`${BASE}/subjects`);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal Server Error' });
  });

  it('a trailing slash still matches (Express non-strict routing)', async () => {
    const H = build();
    expect((await H.get(`${BASE}/subjects/`)).status).toBe(200);
  });
});

describe('route order: /:subject/streak is reached before /:subject/:tier', () => {
  it('GET /python/streak returns a streak, not "Invalid tier"', async () => {
    const H = build();
    const res = await H.get(`${BASE}/python/streak`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ currentStreak: 0, longestStreak: 0, lastActiveDate: null });
  });

  it('a subject literally named "subjects" still resolves /:subject/streak', async () => {
    const H = build();
    expect((await H.get(`${BASE}/subjects/streak`)).status).toBe(200);
  });

  it('/:subject/:tier with a real tier lists topics', async () => {
    const H = build();
    const res = await H.get(`${BASE}/python/Beginner`);
    expect(res.status).toBe(200);
  });
});

describe('GET /:subject/:tier', () => {
  it('lists topics in order with completion flags', async () => {
    const H = build();
    const res = await H.get(`${BASE}/python/Beginner`);
    expect(await res.json()).toEqual({
      topics: [
        { id: 1, slug: 'variables', title: 'Variables', order: 1, completed: false, completedAt: null },
        { id: 2, slug: 'loops', title: 'Loops', order: 2, completed: false, completedAt: null },
      ],
    });
  });

  it.each(['beginner', 'Advanced', 'Job%20Tune', 'x'])('400 Invalid tier: %s (case sensitive, no database access)', async (tier) => {
    const H = build();
    const res = await H.get(`${BASE}/python/${tier}`);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid tier' });
    expect(H.db.leafCalls).toHaveLength(0);
  });

  it('accepts all three valid tiers', async () => {
    const H = build();
    for (const tier of ['Beginner', 'Intermediate', 'Job_Tune']) {
      expect((await H.get(`${BASE}/python/${tier}`)).status).toBe(200);
    }
  });

  it('an unknown subject with a valid tier is 200 with an empty list', async () => {
    const H = build();
    const res = await H.get(`${BASE}/cobol/Beginner`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ topics: [] });
  });

  it('path parameters are percent-decoded before they reach the service', async () => {
    const H = build();
    await H.get(`${BASE}/py%20thon/Beginner`);
    expect(H.db.leafCalls[0].params).toEqual([7, 'py thon', 'Beginner']);
  });
});

describe('GET /:subject/:tier/:slug', () => {
  it('returns the topic with its markdown content', async () => {
    const H = build();
    const res = await H.get(`${BASE}/python/Beginner/loops`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: 2, slug: 'loops', title: 'Loops', order: 2, contentMd: '# Loops', completed: false, completedAt: null });
  });

  it('404 Topic not found', async () => {
    const H = build();
    const res = await H.get(`${BASE}/python/Beginner/nope`);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Topic not found' });
  });

  it('the tier is validated before the lookup: 400, no database access', async () => {
    const H = build();
    const res = await H.get(`${BASE}/python/beginner/loops`);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid tier' });
    expect(H.db.leafCalls).toHaveLength(0);
  });

  it('a slug from another tier is not found', async () => {
    const H = build();
    expect((await H.get(`${BASE}/python/Beginner/decorators`)).status).toBe(404);
    expect((await H.get(`${BASE}/python/Intermediate/decorators`)).status).toBe(200);
  });
});

describe('POST/DELETE /:subject/:tier/:slug/complete', () => {
  it('completing sets the streak to 1 and shows the topic as completed', async () => {
    const H = build();
    const res = await H.post(`${BASE}/python/Beginner/variables/complete`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ completed: true, streak: { currentStreak: 1, longestStreak: 1, lastActiveDate: H.db.today } });

    const topic = await (await H.get(`${BASE}/python/Beginner/variables`)).json();
    expect(topic.completed).toBe(true);
    expect(topic.completedAt).toEqual(expect.any(String));
    const list = await (await H.get(`${BASE}/python/Beginner`)).json();
    expect(list.topics.map((t) => t.completed)).toEqual([true, false]);
  });

  it('is idempotent within a day (same-day repeats do not bump the streak)', async () => {
    const H = build();
    await H.post(`${BASE}/python/Beginner/variables/complete`);
    const again = await (await H.post(`${BASE}/python/Beginner/loops/complete`)).json();
    expect(again.streak).toMatchObject({ currentStreak: 1, longestStreak: 1 });
    expect(H.db.state.learning_topic_progress).toHaveLength(2);
    await H.post(`${BASE}/python/Beginner/loops/complete`);
    expect(H.db.state.learning_topic_progress).toHaveLength(2); // ON CONFLICT DO UPDATE, no duplicate
  });

  it('consecutive days extend the streak; a gap resets it but keeps the longest', async () => {
    const H = build();
    H.db.today = addDays('2026-09-19', -3);
    await H.post(`${BASE}/python/Beginner/variables/complete`);
    H.db.today = addDays('2026-09-19', -2);
    await H.post(`${BASE}/python/Beginner/variables/complete`);
    H.db.today = addDays('2026-09-19', -1);
    const three = await (await H.post(`${BASE}/python/Beginner/variables/complete`)).json();
    expect(three.streak).toMatchObject({ currentStreak: 3, longestStreak: 3 });
    H.db.today = addDays('2026-09-19', 3); // a 4-day gap
    const reset = await (await H.post(`${BASE}/python/Beginner/variables/complete`)).json();
    expect(reset.streak).toMatchObject({ currentStreak: 1, longestStreak: 3 });
  });

  it('streaks are per subject', async () => {
    const H = build();
    await H.post(`${BASE}/python/Beginner/variables/complete`);
    const sql = await (await H.get(`${BASE}/sql/streak`)).json();
    expect(sql).toEqual({ currentStreak: 0, longestStreak: 0, lastActiveDate: null });
    const py = await (await H.get(`${BASE}/python/streak`)).json();
    expect(py.currentStreak).toBe(1);
  });

  it('DELETE un-completes and returns the CURRENT streak unchanged', async () => {
    const H = build();
    await H.post(`${BASE}/python/Beginner/variables/complete`);
    const res = await H.del(`${BASE}/python/Beginner/variables/complete`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ completed: false, streak: { currentStreak: 1, longestStreak: 1, lastActiveDate: H.db.today } });
    const topic = await (await H.get(`${BASE}/python/Beginner/variables`)).json();
    expect(topic.completed).toBe(false);
    expect(H.db.state.learning_topic_progress).toHaveLength(0);
  });

  it('DELETE of a never-completed topic is still 200 (idempotent) with the default streak', async () => {
    const H = build();
    const res = await H.del(`${BASE}/python/Beginner/variables/complete`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ completed: false, streak: { currentStreak: 0, longestStreak: 0, lastActiveDate: null } });
  });

  it.each([['POST'], ['DELETE']])('%s: unknown topic is 404 and writes nothing', async (method) => {
    const H = build();
    const res = await H.call(method, `${BASE}/python/Beginner/nope/complete`);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Topic not found' });
    expect(H.db.leafCallsMatching(/^(INSERT|DELETE)/)).toHaveLength(0);
  });

  it.each([['POST'], ['DELETE']])('%s: invalid tier is 400 and touches no data', async (method) => {
    const H = build();
    const res = await H.call(method, `${BASE}/python/beginner/variables/complete`);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid tier' });
    expect(H.db.leafCalls).toHaveLength(0);
  });

  it('progress is per user', async () => {
    const H = build();
    await H.post(`${BASE}/python/Beginner/variables/complete`);
    const other = signToken({ id: 8 });
    const topic = await (await H.get(`${BASE}/python/Beginner/variables`, { token: other })).json();
    expect(topic.completed).toBe(false);
    const streak = await (await H.get(`${BASE}/python/streak`, { token: other })).json();
    expect(streak.currentStreak).toBe(0);
  });

  it('a failure while writing the streak is a masked 500 (progress row was already written, as on Render: no transaction)', async () => {
    const H = build();
    H.db.failOn(/^INSERT INTO learning_streaks/, new Error('deadlock'));
    const res = await H.post(`${BASE}/python/Beginner/variables/complete`);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal Server Error' });
    expect(H.db.state.learning_topic_progress).toHaveLength(1);
  });

  it('DELETE ignores any request body', async () => {
    const H = build();
    await H.post(`${BASE}/python/Beginner/variables/complete`);
    const res = await H.call('DELETE', `${BASE}/python/Beginner/variables/complete`, { body: { anything: true } });
    expect(res.status).toBe(200);
  });
});
