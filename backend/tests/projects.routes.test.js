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


jest.mock('../src/middleware/requirePlan', () => ({
  requirePlan: () => (req, _res, next) => next(),
}));

const request = require('supertest');
const app = require('../src/app');

describe('GET /api/projects/ideas', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery.mockResolvedValue({ rows: [] });
  });

  it('returns 200 with project ideas array', async () => {
    const res = await request(app).get('/api/projects/ideas');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });

  it('each idea has required fields', async () => {
    const res = await request(app).get('/api/projects/ideas');

    res.body.forEach(idea => {
      expect(idea).toHaveProperty('id');
      expect(idea).toHaveProperty('title');
      expect(idea).toHaveProperty('diff');
      expect(idea).toHaveProperty('tech');
      expect(Array.isArray(idea.tech)).toBe(true);
    });
  });
});
