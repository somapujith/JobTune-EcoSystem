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

describe('POST /api/jobs/analyze-description', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery.mockResolvedValue({ rows: [] });
  });

  it('returns AI-analyzed job description', async () => {
    const analysis = {
      requiredSkills: ['React', 'Node.js'],
      niceToHaveSkills: ['Docker'],
      experienceLevel: '3-5 years',
      seniority: 'Mid',
      keywords: ['React', 'Node.js'],
      responsibilities: ['Build features'],
      salaryRange: '$100k-$130k',
    };

    callAI.mockResolvedValueOnce({ ok: true, data: JSON.stringify(analysis) });

    const res = await request(app)
      .post('/api/jobs/analyze-description')
      .send({
        jobDescription: 'We are looking for a React and Node.js developer with 3-5 years of experience to build scalable web applications.',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.requiredSkills).toContain('React');
  });

  it('uses fallback analysis when AI fails', async () => {
    callAI.mockResolvedValueOnce({ ok: false });

    const res = await request(app)
      .post('/api/jobs/analyze-description')
      .send({
        jobDescription: 'Senior React developer needed with experience in Node.js, Docker, and AWS. 5-7 years of experience required. • Lead technical projects • Mentor junior developers',
      });

    expect(res.status).toBe(200);
    expect(res.body.data.requiredSkills).toContain('React');
    expect(res.body.data.seniority).toBe('Senior');
    expect(res.body.data.responsibilities.length).toBeGreaterThan(0);
  });

  it('returns 400 when job description is too short', async () => {
    const res = await request(app)
      .post('/api/jobs/analyze-description')
      .send({ jobDescription: 'Short text' });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('50 characters');
  });

  it('returns 400 when job description is missing', async () => {
    const res = await request(app)
      .post('/api/jobs/analyze-description')
      .send({});

    expect(res.status).toBe(400);
  });

  it('handles AI returning unparseable JSON', async () => {
    callAI.mockResolvedValueOnce({ ok: true, data: 'not valid json at all' });

    const res = await request(app)
      .post('/api/jobs/analyze-description')
      .send({
        jobDescription: 'We need a Python developer with experience in Django and REST APIs for building scalable backend services.',
      });

    expect(res.status).toBe(200);
    expect(res.body.data.requiredSkills).toBeDefined();
  });
});
