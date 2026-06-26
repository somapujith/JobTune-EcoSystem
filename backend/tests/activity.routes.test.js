jest.mock('../src/config/database', () => ({
  pool: { query: jest.fn() },
}));

jest.mock('../src/middleware/auth', () => ({
  authenticateToken: (req, _res, next) => {
    req.user = { id: 1, email: 'test@example.com' };
    next();
  },
}));

jest.mock('../src/services/activityService', () => ({
  trackActivity: jest.fn(),
  getHeatmapData: jest.fn(),
  getWeeklyActivity: jest.fn(),
  getStats: jest.fn(),
  getAchievements: jest.fn(),
  checkAndUnlockAchievements: jest.fn(),
}));

const request = require('supertest');
const app = require('../src/app');
const activityService = require('../src/services/activityService');

// ─── POST /api/activity/track ───────────────────────────────────────────────

describe('POST /api/activity/track', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 200 with {success: true} for valid input', async () => {
    activityService.trackActivity.mockResolvedValueOnce({});

    const res = await request(app)
      .post('/api/activity/track')
      .send({ toolName: 'resume', activityType: 'view' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
    expect(activityService.trackActivity).toHaveBeenCalledWith(1, 'resume', 'view', {});
  });

  it('passes metadata when provided', async () => {
    activityService.trackActivity.mockResolvedValueOnce({});

    await request(app)
      .post('/api/activity/track')
      .send({ toolName: 'quiz', activityType: 'complete', metadata: { score: 85 } });

    expect(activityService.trackActivity).toHaveBeenCalledWith(
      1, 'quiz', 'complete', { score: 85 }
    );
  });

  it('returns 400 when toolName is missing', async () => {
    const res = await request(app)
      .post('/api/activity/track')
      .send({ activityType: 'view' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/toolName/);
    expect(activityService.trackActivity).not.toHaveBeenCalled();
  });

  it('returns 400 when toolName is not a string', async () => {
    const res = await request(app)
      .post('/api/activity/track')
      .send({ toolName: 123, activityType: 'view' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/toolName/);
  });

  it('returns 400 when activityType is missing', async () => {
    const res = await request(app)
      .post('/api/activity/track')
      .send({ toolName: 'resume' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/activityType/);
    expect(activityService.trackActivity).not.toHaveBeenCalled();
  });

  it('returns 400 when activityType is not a string', async () => {
    const res = await request(app)
      .post('/api/activity/track')
      .send({ toolName: 'resume', activityType: true });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/activityType/);
  });

  it('returns 500 when service throws', async () => {
    activityService.trackActivity.mockRejectedValueOnce(new Error('DB error'));

    const res = await request(app)
      .post('/api/activity/track')
      .send({ toolName: 'resume', activityType: 'view' });

    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/Failed to track activity/);
  });
});

// ─── GET /api/activity/heatmap ──────────────────────────────────────────────

describe('GET /api/activity/heatmap', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 200 with data array', async () => {
    const mockData = [
      { date: '2026-06-01', count: 5 },
      { date: '2026-06-02', count: 3 },
    ];
    activityService.getHeatmapData.mockResolvedValueOnce(mockData);

    const res = await request(app).get('/api/activity/heatmap');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual(mockData);
  });

  it('passes months query parameter to service', async () => {
    activityService.getHeatmapData.mockResolvedValueOnce([]);

    await request(app).get('/api/activity/heatmap?months=6');

    expect(activityService.getHeatmapData).toHaveBeenCalledWith(1, 6);
  });

  it('defaults months to 12 when not provided', async () => {
    activityService.getHeatmapData.mockResolvedValueOnce([]);

    await request(app).get('/api/activity/heatmap');

    expect(activityService.getHeatmapData).toHaveBeenCalledWith(1, 12);
  });

  it('caps months at 24', async () => {
    activityService.getHeatmapData.mockResolvedValueOnce([]);

    await request(app).get('/api/activity/heatmap?months=48');

    expect(activityService.getHeatmapData).toHaveBeenCalledWith(1, 24);
  });

  it('treats months=0 as falsy and defaults to 12', async () => {
    activityService.getHeatmapData.mockResolvedValueOnce([]);

    await request(app).get('/api/activity/heatmap?months=0');

    // parseInt('0') is 0 which is falsy, so || 12 kicks in
    expect(activityService.getHeatmapData).toHaveBeenCalledWith(1, 12);
  });

  it('clamps negative months to 1', async () => {
    activityService.getHeatmapData.mockResolvedValueOnce([]);

    await request(app).get('/api/activity/heatmap?months=-5');

    // parseInt('-5') is -5 which is truthy but < 1, so clamped to 1
    expect(activityService.getHeatmapData).toHaveBeenCalledWith(1, 1);
  });

  it('defaults to 12 when months is not a number', async () => {
    activityService.getHeatmapData.mockResolvedValueOnce([]);

    await request(app).get('/api/activity/heatmap?months=abc');

    expect(activityService.getHeatmapData).toHaveBeenCalledWith(1, 12);
  });

  it('returns 500 when service throws', async () => {
    activityService.getHeatmapData.mockRejectedValueOnce(new Error('DB error'));

    const res = await request(app).get('/api/activity/heatmap');

    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/Failed to fetch heatmap data/);
  });
});

// ─── GET /api/activity/weekly ───────────────────────────────────────────────

describe('GET /api/activity/weekly', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 200 with data array of 7 entries', async () => {
    const weekData = [
      { day: 'Mon', date: '2026-06-22', count: 3 },
      { day: 'Tue', date: '2026-06-23', count: 0 },
      { day: 'Wed', date: '2026-06-24', count: 5 },
      { day: 'Thu', date: '2026-06-25', count: 0 },
      { day: 'Fri', date: '2026-06-26', count: 1 },
      { day: 'Sat', date: '2026-06-27', count: 0 },
      { day: 'Sun', date: '2026-06-28', count: 0 },
    ];
    activityService.getWeeklyActivity.mockResolvedValueOnce(weekData);

    const res = await request(app).get('/api/activity/weekly');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(7);
    expect(res.body.data).toEqual(weekData);
  });

  it('calls service with authenticated user id', async () => {
    activityService.getWeeklyActivity.mockResolvedValueOnce([]);

    await request(app).get('/api/activity/weekly');

    expect(activityService.getWeeklyActivity).toHaveBeenCalledWith(1);
  });

  it('returns 500 when service throws', async () => {
    activityService.getWeeklyActivity.mockRejectedValueOnce(new Error('DB error'));

    const res = await request(app).get('/api/activity/weekly');

    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/Failed to fetch weekly activity/);
  });
});

// ─── GET /api/activity/stats ────────────────────────────────────────────────

describe('GET /api/activity/stats', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 200 with data object containing expected fields', async () => {
    const statsData = {
      daysActive: 10,
      toolsUsed: 4,
      totalActivities: 50,
      currentStreak: 3,
      longestStreak: 12,
      dailyGoal: 20,
      dailyGoalProgress: 25,
    };
    activityService.getStats.mockResolvedValueOnce(statsData);

    const res = await request(app).get('/api/activity/stats');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual(statsData);
    expect(res.body.data).toHaveProperty('daysActive');
    expect(res.body.data).toHaveProperty('toolsUsed');
    expect(res.body.data).toHaveProperty('totalActivities');
    expect(res.body.data).toHaveProperty('dailyGoalProgress');
  });

  it('calls service with authenticated user id', async () => {
    activityService.getStats.mockResolvedValueOnce({});

    await request(app).get('/api/activity/stats');

    expect(activityService.getStats).toHaveBeenCalledWith(1);
  });

  it('returns 500 when service throws', async () => {
    activityService.getStats.mockRejectedValueOnce(new Error('DB error'));

    const res = await request(app).get('/api/activity/stats');

    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/Failed to fetch stats/);
  });
});

// ─── GET /api/activity/achievements ─────────────────────────────────────────

describe('GET /api/activity/achievements', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 200 with data array of achievements', async () => {
    const achievements = [
      { key: 'first_login', unlockedAt: '2026-06-01T00:00:00Z' },
      { key: 'first_resume', unlockedAt: '2026-06-05T00:00:00Z' },
    ];
    activityService.getAchievements.mockResolvedValueOnce(achievements);

    const res = await request(app).get('/api/activity/achievements');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual(achievements);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('returns empty array when no achievements', async () => {
    activityService.getAchievements.mockResolvedValueOnce([]);

    const res = await request(app).get('/api/activity/achievements');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it('calls service with authenticated user id', async () => {
    activityService.getAchievements.mockResolvedValueOnce([]);

    await request(app).get('/api/activity/achievements');

    expect(activityService.getAchievements).toHaveBeenCalledWith(1);
  });

  it('returns 500 when service throws', async () => {
    activityService.getAchievements.mockRejectedValueOnce(new Error('DB error'));

    const res = await request(app).get('/api/activity/achievements');

    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/Failed to fetch achievements/);
  });
});

// ─── POST /api/activity/check-achievements ──────────────────────────────────

describe('POST /api/activity/check-achievements', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 200 with newlyUnlocked array', async () => {
    activityService.checkAndUnlockAchievements.mockResolvedValueOnce(['first_login', '5_tools']);

    const res = await request(app).post('/api/activity/check-achievements');

    expect(res.status).toBe(200);
    expect(res.body.data.newlyUnlocked).toEqual(['first_login', '5_tools']);
  });

  it('returns empty newlyUnlocked array when nothing new', async () => {
    activityService.checkAndUnlockAchievements.mockResolvedValueOnce([]);

    const res = await request(app).post('/api/activity/check-achievements');

    expect(res.status).toBe(200);
    expect(res.body.data.newlyUnlocked).toEqual([]);
  });

  it('calls service with authenticated user id', async () => {
    activityService.checkAndUnlockAchievements.mockResolvedValueOnce([]);

    await request(app).post('/api/activity/check-achievements');

    expect(activityService.checkAndUnlockAchievements).toHaveBeenCalledWith(1);
  });

  it('returns 500 when service throws', async () => {
    activityService.checkAndUnlockAchievements.mockRejectedValueOnce(new Error('DB error'));

    const res = await request(app).post('/api/activity/check-achievements');

    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/Failed to check achievements/);
  });
});
