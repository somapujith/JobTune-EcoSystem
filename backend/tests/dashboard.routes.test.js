const mockQuery = jest.fn();
jest.mock('../src/config/database', () => ({
  pool: { query: mockQuery },
}));

jest.mock('../src/middleware/auth', () => ({
  authenticateToken: (req, _res, next) => {
    req.user = { id: 1, email: 'test@example.com' };
    next();
  },
}));
jest.mock('../src/middleware/requireOnboarding', () => ({
  requireOnboarding: (req, _res, next) => next(),
}));


const request = require('supertest');
const app = require('../src/app');

describe('GET /api/dashboard/overview', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery.mockResolvedValue({ rows: [] });
  });

  function mockAllDashboardQueries() {
    // resumes
    mockQuery.mockResolvedValueOnce({ rows: [{ overall_score: 80, created_at: new Date(), id: 1 }] });
    // interviews
    mockQuery.mockResolvedValueOnce({ rows: [{ score: 75, created_at: new Date(), id: 1 }] });
    // job_applications
    mockQuery.mockResolvedValueOnce({ rows: [{ status: 'interview' }, { status: 'offer' }] });
    // skill_assessments
    mockQuery.mockResolvedValueOnce({ rows: [{ score: 70 }] });
    // learning_streaks
    mockQuery.mockResolvedValueOnce({ rows: [{ current: 5, longest: 15, daily_goal: 20 }] });
    // activity stats
    mockQuery.mockResolvedValueOnce({ rows: [{ days_active: '10', tools_used: '5' }] });
    // profile completion (4 EXISTS queries)
    mockQuery.mockResolvedValueOnce({ rows: [{ e: true }] });
    mockQuery.mockResolvedValueOnce({ rows: [{ e: true }] });
    mockQuery.mockResolvedValueOnce({ rows: [{ e: false }] });
    mockQuery.mockResolvedValueOnce({ rows: [{ e: false }] });
    // completion status (8 EXISTS queries)
    for (let i = 0; i < 8; i++) {
      mockQuery.mockResolvedValueOnce({ rows: [{ e: i < 3 }] });
    }
  }

  it('returns 200 with comprehensive dashboard data', async () => {
    mockAllDashboardQueries();

    const res = await request(app).get('/api/dashboard/overview');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('readinessScore');
    expect(res.body).toHaveProperty('resumeScore');
    expect(res.body).toHaveProperty('streak');
    expect(res.body).toHaveProperty('actionItems');
    expect(res.body).toHaveProperty('profileCompletion');
    expect(res.body).toHaveProperty('completionStatus');
    expect(res.body).toHaveProperty('lastUpdated');
  });

  it('handles missing tables gracefully', async () => {
    // resumes
    mockQuery.mockResolvedValueOnce({ rows: [] });
    // interviews
    mockQuery.mockResolvedValueOnce({ rows: [] });
    // job_applications — table doesn't exist
    mockQuery.mockRejectedValueOnce(new Error('relation "job_applications" does not exist'));
    // skill_assessments — table doesn't exist
    mockQuery.mockRejectedValueOnce(new Error('relation "skill_assessments" does not exist'));
    // learning_streaks — table doesn't exist
    mockQuery.mockRejectedValueOnce(new Error('relation "learning_streaks" does not exist'));
    // activity stats — table doesn't exist
    mockQuery.mockRejectedValueOnce(new Error('relation "daily_activity" does not exist'));
    // profile completion — table doesn't exist (Promise.all will reject for first)
    mockQuery.mockRejectedValueOnce(new Error('relation "resumes" does not exist'));
    // completion status (8 queries — each may fail independently via Promise.allSettled)
    for (let i = 0; i < 8; i++) {
      mockQuery.mockRejectedValueOnce(new Error('table missing'));
    }

    const res = await request(app).get('/api/dashboard/overview');

    expect(res.status).toBe(200);
    expect(res.body.readinessScore).toBe(0);
    expect(res.body.resumeScore).toBe(0);
  });

  it('returns action items sorted by priority', async () => {
    mockAllDashboardQueries();

    const res = await request(app).get('/api/dashboard/overview');

    expect(res.body.actionItems.length).toBeLessThanOrEqual(4);
    if (res.body.actionItems.length > 1) {
      const priorities = { high: 0, medium: 1, low: 2 };
      for (let i = 1; i < res.body.actionItems.length; i++) {
        expect(priorities[res.body.actionItems[i].priority])
          .toBeGreaterThanOrEqual(priorities[res.body.actionItems[i - 1].priority]);
      }
    }
  });

  it('returns 500 on unexpected error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('Critical DB failure'));

    const res = await request(app).get('/api/dashboard/overview');

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Failed to fetch dashboard data');
  });
});
