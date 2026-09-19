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

jest.mock('../src/utils/aiClient', () => ({
  callAI: jest.fn(),
}));

const request = require('supertest');
const app = require('../src/app');
const { callAI } = require('../src/utils/aiClient');

describe('POST /api/jobs/generate-cover-letter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery.mockResolvedValue({ rows: [] });
  });

  it('returns AI-generated cover letter', async () => {
    callAI.mockResolvedValueOnce({
      ok: true,
      data: 'Dear Hiring Manager, I am excited to apply...',
    });

    const res = await request(app)
      .post('/api/jobs/generate-cover-letter')
      .send({
        jobDescription: 'We are looking for a React developer.',
        companyName: 'Acme Inc',
        position: 'Frontend Developer',
        yourName: 'John Doe',
        experience: '3 years of React experience',
        tone: 'confident',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.letterText).toContain('Dear Hiring Manager');
    expect(res.body.data.generatedAt).toBeDefined();
  });

  it('returns fallback letter when AI fails', async () => {
    callAI.mockResolvedValueOnce({ ok: false });

    const res = await request(app)
      .post('/api/jobs/generate-cover-letter')
      .send({
        jobDescription: 'Looking for a developer.',
        companyName: 'TechCorp',
        position: 'Software Engineer',
        yourName: 'Jane Smith',
        experience: '2 years',
      });

    expect(res.status).toBe(200);
    expect(res.body.data.letterText).toContain('Software Engineer');
    expect(res.body.data.letterText).toContain('TechCorp');
  });

  it('returns 400 when required fields are missing', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] }); // audit logger

    const res = await request(app)
      .post('/api/jobs/generate-cover-letter')
      .send({ companyName: 'Acme' });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('required');
  });

  it('returns 400 when jobDescription is missing', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] }); // audit logger

    const res = await request(app)
      .post('/api/jobs/generate-cover-letter')
      .send({
        companyName: 'Acme',
        position: 'Dev',
        yourName: 'John',
      });

    expect(res.status).toBe(400);
  });
});
