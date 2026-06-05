/**
 * Integration tests for /api/benchmarks routes — TDD
 * Admin-only access control is a key requirement.
 */

jest.mock('../src/config/database', () => ({
  pool: { query: jest.fn() }
}));

jest.mock('../src/utils/aiClient', () => ({
  callAI: jest.fn()
}));

// Default: authenticated as user id=1
jest.mock('../src/middleware/auth', () => ({
  authenticateToken: (req, _res, next) => {
    req.user = { id: 1, email: 'test@example.com' };
    next();
  }
}));

const request = require('supertest');
const { pool } = require('../src/config/database');
const app = require('../src/app');

// ─── Admin user scenario ─────────────────────────────────────────────────────

describe('GET /api/benchmarks/run — admin user', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 200 with metrics for admin user', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ role: 'admin' }] })  // requireAdmin lookup
      .mockResolvedValueOnce({ rows: [{ id: 1 }] });          // INSERT benchmark

    const res = await request(app)
      .get('/api/benchmarks/run')
      .query({ scorerName: 'ats', datasetName: 'default' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('mae');
    expect(res.body).toHaveProperty('correlation');
    expect(res.body).toHaveProperty('precisionAtThreshold');
    expect(res.body).toHaveProperty('sampleSize');
  });
});

// ─── Non-admin user scenario ─────────────────────────────────────────────────

describe('GET /api/benchmarks/run — non-admin user', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 403 for non-admin authenticated user', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ role: 'user' }] });

    const res = await request(app)
      .get('/api/benchmarks/run')
      .query({ scorerName: 'ats', datasetName: 'default' });

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/admin/i);
  });
});

// ─── Missing query params — validation happens before requireAdmin? No, after. ──
// requireAdmin needs DB. For param validation tests, mock as admin.

describe('GET /api/benchmarks/run — missing params', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 400 when scorerName is missing', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ role: 'admin' }] });

    const res = await request(app)
      .get('/api/benchmarks/run')
      .query({ datasetName: 'default' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/scorerName/i);
  });

  it('returns 400 when datasetName is missing', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ role: 'admin' }] });

    const res = await request(app)
      .get('/api/benchmarks/run')
      .query({ scorerName: 'ats' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/datasetName/i);
  });
});

// ─── DB error in requireAdmin ─────────────────────────────────────────────────

describe('GET /api/benchmarks/run — DB error', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 500 when DB fails during admin check', async () => {
    pool.query.mockRejectedValueOnce(new Error('DB down'));

    const res = await request(app)
      .get('/api/benchmarks/run')
      .query({ scorerName: 'ats', datasetName: 'default' });

    expect(res.status).toBe(500);
  });
});
