'use strict';

/**
 * /api/activity (routes/activity.js): six endpoints, all authenticateToken only (no plan gate).
 * Real activityService + route; the daily_activity / achievements statements are scripted per test.
 */
const { build } = require('./helpers');

beforeEach(() => jest.spyOn(console, 'error').mockImplementation(() => {}));
afterEach(() => jest.restoreAllMocks());

const ENDPOINTS = [
  ['POST', '/api/activity/track', { toolName: 't', activityType: 'a' }],
  ['GET', '/api/activity/heatmap', undefined],
  ['GET', '/api/activity/weekly', undefined],
  ['GET', '/api/activity/stats', undefined],
  ['GET', '/api/activity/achievements', undefined],
  ['POST', '/api/activity/check-achievements', {}],
];

describe('auth parity', () => {
  it.each(ENDPOINTS)('401 without a token: %s %s', async (method, path, body) => {
    const H = build();
    const res = await H.call(method, path, { body, token: null });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
    expect(H.db.leafCalls).toHaveLength(0);
  });

  it('a malformed Authorization header is a 401 (no second token part)', async () => {
    const H = build();
    const res = await H.call('GET', '/api/activity/weekly', { token: null, headers: { Authorization: 'Bearer' } });
    expect(res.status).toBe(401);
  });

  it.each(ENDPOINTS)('is NOT plan gated: %s %s does not return 403 for a user with no subscription', async (method, path, body) => {
    const H = build();
    H.db.on(/daily_activity|student_achievements|learning_streaks|resumes|skill_assessments|mock_interviews|course_enrollments|practice_submissions|linkedin_analyses/, () => ({ rows: [] }));
    const res = await H.call(method, path, { body });
    expect(res.status).not.toBe(403);
    expect(res.status).toBe(200);
  });
});

describe('POST /api/activity/track', () => {
  const UPSERT = /^INSERT INTO daily_activity/;

  it('upserts the activity for the caller and answers { success: true }', async () => {
    const H = build();
    H.db.on(UPSERT, () => ({ rows: [{ id: 1 }] }));
    const res = await H.post('/api/activity/track', { toolName: 'resume', activityType: 'view', metadata: { score: 85 } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
    expect(H.db.leafCalls[0].params).toEqual([7, 'resume', 'view', '{"score":85}']);
  });

  it('metadata defaults to {} (also when falsy)', async () => {
    const H = build();
    H.db.on(UPSERT, () => ({ rows: [{}] }));
    await H.post('/api/activity/track', { toolName: 'a', activityType: 'b' });
    await H.post('/api/activity/track', { toolName: 'a', activityType: 'b', metadata: null });
    await H.post('/api/activity/track', { toolName: 'a', activityType: 'b', metadata: 0 });
    expect(H.db.leafCalls.map((c) => c.params[3])).toEqual(['{}', '{}', '{}']);
  });

  it.each([
    ['missing toolName', { activityType: 'view' }, 'toolName is required and must be a string'],
    ['empty toolName', { toolName: '', activityType: 'view' }, 'toolName is required and must be a string'],
    ['non-string toolName', { toolName: 5, activityType: 'view' }, 'toolName is required and must be a string'],
    ['missing activityType', { toolName: 'quiz' }, 'activityType is required and must be a string'],
    ['non-string activityType', { toolName: 'quiz', activityType: ['x'] }, 'activityType is required and must be a string'],
  ])('400 %s', async (_n, body, message) => {
    const H = build();
    const res = await H.post('/api/activity/track', body);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: message });
    expect(H.db.leafCalls).toHaveLength(0);
  });

  it('a database error is a 500 { error: "Failed to track activity" } (cause not leaked)', async () => {
    const H = build();
    H.db.failOn(UPSERT, new Error('deadlock detected'));
    const res = await H.post('/api/activity/track', { toolName: 'a', activityType: 'b' });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Failed to track activity' });
    expect(console.error.mock.calls.flat().join(' ')).toMatch(/Activity track error: deadlock detected/);
  });

  it('a request with no body is a caught TypeError -> the same 500 (not a 400)', async () => {
    const H = build();
    const res = await H.call('POST', '/api/activity/track');
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Failed to track activity' });
  });
});

describe('GET /api/activity/heatmap', () => {
  const HEATMAP = /^SELECT activity_date AS date, SUM\(activity_count\)::INTEGER AS count FROM daily_activity WHERE user_id = \$1 AND activity_date >= CURRENT_DATE/;

  it('maps rows to { date, count } under `data`, months defaults to 12', async () => {
    const H = build();
    H.db.on(HEATMAP, () => ({ rows: [{ date: new Date('2026-01-15T00:00:00.000Z'), count: 5 }, { date: '2026-01-16', count: 2 }] }));
    const res = await H.get('/api/activity/heatmap');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: [{ date: '2026-01-15', count: 5 }, { date: '2026-01-16', count: 2 }] });
    expect(H.db.leafCalls[0].params).toEqual([7, 12]);
  });

  it.each([
    ['6', 6],
    ['1', 1],
    ['24', 24],
    ['25', 24], // clamped to 24
    ['999', 24],
    ['-5', 1], // clamped to 1
    ['0', 12], // parseInt('0') is falsy -> default 12 (preserved quirk)
    ['abc', 12],
    ['', 12],
    ['3.9', 3],
    ['6abc', 6],
  ])('months=%p -> %p', async (raw, expected) => {
    const H = build();
    H.db.on(HEATMAP, () => ({ rows: [] }));
    const res = await H.get(`/api/activity/heatmap?months=${raw}`);
    expect(res.status).toBe(200);
    expect(H.db.leafCalls[0].params).toEqual([7, expected]);
  });

  it('an error is a 500 { error: "Failed to fetch heatmap data" }', async () => {
    const H = build();
    H.db.failOn(HEATMAP, new Error('x'));
    const res = await H.get('/api/activity/heatmap');
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Failed to fetch heatmap data' });
  });
});

describe('GET /api/activity/weekly', () => {
  const WEEKLY = /activity_date >= \$2::DATE/;

  it('returns seven days Mon..Sun under `data`, zero-filled', async () => {
    const H = build();
    H.db.on(WEEKLY, () => ({ rows: [] }));
    const res = await H.get('/api/activity/weekly');
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.map((d) => d.day)).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
    expect(data.every((d) => d.count === 0 && /^\d{4}-\d{2}-\d{2}$/.test(d.date))).toBe(true);
    expect(H.db.leafCalls[0].params).toEqual([7, data[0].date]);
  });

  it('places the counts on the matching dates', async () => {
    const H = build();
    let monday;
    H.db.on(WEEKLY, ([, mondayStr]) => {
      monday = mondayStr;
      return { rows: [{ date: mondayStr, count: 3 }] };
    });
    const res = await H.get('/api/activity/weekly');
    const { data } = await res.json();
    expect(data[0]).toEqual({ day: 'Mon', date: monday, count: 3 });
  });

  it('an error is a 500 { error: "Failed to fetch weekly activity" }', async () => {
    const H = build();
    H.db.failOn(WEEKLY, new Error('x'));
    const res = await H.get('/api/activity/weekly');
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Failed to fetch weekly activity' });
  });
});

describe('GET /api/activity/stats', () => {
  const CORE = /COUNT\(DISTINCT activity_date\)/;
  const STREAK = /^SELECT current, longest, daily_goal FROM learning_streaks/;
  const TODAY = /activity_date = CURRENT_DATE/;

  it('returns the aggregated stats object under `data`', async () => {
    const H = build();
    H.db.on(CORE, () => ({ rows: [{ days_active: '12', tools_used: '4', total_activities: 40 }] }));
    H.db.on(STREAK, () => ({ rows: [{ current: 3, longest: 9, daily_goal: 20 }] }));
    H.db.on(TODAY, () => ({ rows: [{ count: 10 }] }));
    const res = await H.get('/api/activity/stats');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      data: { daysActive: 12, toolsUsed: 4, totalActivities: 40, currentStreak: 3, longestStreak: 9, dailyGoal: 20, dailyGoalProgress: 50 },
    });
  });

  it('tolerates a missing learning_streaks table (defaults) exactly like Express', async () => {
    const H = build();
    H.db.on(CORE, () => ({ rows: [{ days_active: '0', tools_used: '0', total_activities: 0 }] }));
    H.db.failOn(STREAK, new Error('relation "learning_streaks" does not exist'));
    H.db.on(TODAY, () => ({ rows: [{ count: 0 }] }));
    const res = await H.get('/api/activity/stats');
    expect(res.status).toBe(200);
    expect((await res.json()).data).toMatchObject({ currentStreak: 0, longestStreak: 0, dailyGoal: 30, dailyGoalProgress: 0 });
  });

  it('a failure of the core query is a 500 { error: "Failed to fetch stats" }', async () => {
    const H = build();
    H.db.failOn(CORE, new Error('x'));
    const res = await H.get('/api/activity/stats');
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Failed to fetch stats' });
  });
});

describe('GET /api/activity/achievements', () => {
  const LIST = /^SELECT achievement_key AS key, unlocked_at FROM student_achievements/;

  it('maps rows to { key, unlockedAt } under `data`', async () => {
    const H = build();
    H.db.on(LIST, () => ({ rows: [{ key: 'first_login', unlocked_at: '2026-05-01T10:00:00.000Z' }] }));
    const res = await H.get('/api/activity/achievements');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: [{ key: 'first_login', unlockedAt: '2026-05-01T10:00:00.000Z' }] });
  });

  it('an error is a 500 { error: "Failed to fetch achievements" }', async () => {
    const H = build();
    H.db.failOn(LIST, new Error('x'));
    const res = await H.get('/api/activity/achievements');
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Failed to fetch achievements' });
  });
});

describe('POST /api/activity/check-achievements', () => {
  it('unlocks the met achievements, persists them and reports them under data.newlyUnlocked', async () => {
    const H = build();
    H.db.on(/^SELECT achievement_key FROM student_achievements/, () => ({ rows: [{ achievement_key: 'first_login' }] }));
    H.db.on(/^SELECT 1 FROM /, () => ({ rows: [] }));
    H.db.on(/^SELECT 1 FROM resumes WHERE user_id = \$1 LIMIT 1$/, () => ({ rows: [{}] })); // later registrations win
    H.db.on(/^SELECT (current, longest|longest) FROM learning_streaks/, () => ({ rows: [] }));
    H.db.on(/^SELECT COUNT\(DISTINCT tool_name\)/, () => ({ rows: [{ cnt: 5 }] }));
    H.db.on(/^INSERT INTO student_achievements/, () => ({ rows: [] }));
    const res = await H.post('/api/activity/check-achievements', {});
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: { newlyUnlocked: ['first_resume', '5_tools'] } });
    const inserts = H.db.leafCallsMatching(/^INSERT INTO student_achievements/);
    expect(inserts.map((c) => c.params)).toEqual([[7, 'first_resume'], [7, '5_tools']]);
  });

  it('works without a request body (the route never reads one)', async () => {
    const H = build();
    H.db.on(/^SELECT achievement_key FROM student_achievements/, () => ({ rows: [] }));
    H.db.on(/^SELECT /, () => ({ rows: [] }));
    const res = await H.call('POST', '/api/activity/check-achievements');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: { newlyUnlocked: [] } });
  });

  it('a missing student_achievements table yields an empty list, not an error', async () => {
    const H = build();
    H.db.failOn(/^SELECT achievement_key FROM student_achievements/, new Error('no table'));
    const res = await H.post('/api/activity/check-achievements', {});
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: { newlyUnlocked: [] } });
  });
});
