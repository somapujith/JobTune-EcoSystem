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
  extractJSON: jest.fn(),
}));

const request = require('supertest');
const app = require('../src/app');
const { callAI, extractJSON } = require('../src/utils/aiClient');

describe('Career Roadmap Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery.mockResolvedValue({ rows: [] });
  });

  // ─── POST /api/career/roadmap ──────────────────────────────────────────────

  describe('POST /api/career/roadmap', () => {
    it('returns AI-generated roadmap', async () => {
      const roadmap = {
        title: 'Path to Frontend Dev',
        phases: [{ phase: 1, title: 'Foundation' }],
      };
      callAI.mockResolvedValueOnce({ ok: true, data: JSON.stringify(roadmap) });
      extractJSON.mockReturnValueOnce(roadmap);

      mockQuery.mockResolvedValueOnce({ rows: [{ id: 1 }] }); // DB save

      const res = await request(app)
        .post('/api/career/roadmap')
        .send({
          targetRole: 'Frontend Developer',
          currentRole: 'Student',
          currentSkills: ['HTML', 'CSS'],
          timeframe: '6months',
        });

      expect(res.status).toBe(200);
      expect(res.body.title).toBe('Path to Frontend Dev');
      expect(res.body.aiPowered).toBe(true);
    });

    it('returns fallback roadmap when AI fails', async () => {
      callAI.mockResolvedValueOnce({ ok: false, error: 'unavailable' });
      extractJSON.mockReturnValueOnce(null);

      mockQuery.mockResolvedValueOnce({ rows: [{ id: 1 }] }); // DB save

      const res = await request(app)
        .post('/api/career/roadmap')
        .send({ targetRole: 'Backend Developer', timeframe: '3months' });

      expect(res.status).toBe(200);
      expect(res.body.phases).toHaveLength(3);
      expect(res.body.aiPowered).toBe(false);
    });

    it('returns 400 when targetRole is missing', async () => {
      const res = await request(app)
        .post('/api/career/roadmap')
        .send({ currentRole: 'Student' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Target role is required');
    });

    it('defaults timeframe to 6months for invalid values', async () => {
      callAI.mockResolvedValueOnce({ ok: false });
      extractJSON.mockReturnValueOnce(null);
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 1 }] });

      const res = await request(app)
        .post('/api/career/roadmap')
        .send({ targetRole: 'Dev', timeframe: 'invalid' });

      expect(res.status).toBe(200);
      expect(res.body.summary).toContain('6-month');
    });

    it('handles DB save failure gracefully', async () => {
      callAI.mockResolvedValueOnce({ ok: false });
      extractJSON.mockReturnValueOnce(null);
      mockQuery.mockRejectedValueOnce(new Error('DB error'));

      const res = await request(app)
        .post('/api/career/roadmap')
        .send({ targetRole: 'Frontend Developer' });

      expect(res.status).toBe(200);
      expect(res.body.phases).toBeDefined();
    });
  });

  // ─── GET /api/career/roadmap/:id ───────────────────────────────────────────

  describe('GET /api/career/roadmap/:id', () => {
    it('returns saved roadmap by id', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 1,
          user_id: 1,
          roadmap: JSON.stringify({ title: 'My Roadmap', phases: [] }),
        }],
      });

      const res = await request(app).get('/api/career/roadmap/1');

      expect(res.status).toBe(200);
      expect(res.body.roadmap.title).toBe('My Roadmap');
    });

    it('returns 404 when roadmap not found', async () => {
      // default returns { rows: [] }

      const res = await request(app).get('/api/career/roadmap/999');

      expect(res.status).toBe(404);
    });
  });

  // ─── POST /api/career/discovery ────────────────────────────────────────────

  describe('POST /api/career/discovery', () => {
    it('saves discovery answers for the authenticated user', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 7, updated_at: '2026-07-09T00:00:00.000Z' }],
      });

      const res = await request(app)
        .post('/api/career/discovery')
        .send({
          answers: { stage: 'y3', career_goal: 'frontend' },
          subAnswers: { frontend: ['React', 'Tailwind CSS'] },
        });

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(7);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO career_discovery_responses'),
        [1, JSON.stringify({ stage: 'y3', career_goal: 'frontend' }), JSON.stringify({ frontend: ['React', 'Tailwind CSS'] })]
      );
    });

    it('returns 400 when answers is missing', async () => {
      const res = await request(app)
        .post('/api/career/discovery')
        .send({ subAnswers: {} });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('answers is required');
    });

    it('defaults subAnswers to empty object when omitted', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 8, updated_at: '2026-07-09T00:00:00.000Z' }] });

      const res = await request(app)
        .post('/api/career/discovery')
        .send({ answers: { stage: 'y1' } });

      expect(res.status).toBe(200);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.any(String),
        [1, JSON.stringify({ stage: 'y1' }), JSON.stringify({})]
      );
    });

    it('returns 500 when the database write fails', async () => {
      mockQuery.mockRejectedValueOnce(new Error('DB error'));

      const res = await request(app)
        .post('/api/career/discovery')
        .send({ answers: { stage: 'y1' } });

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Failed to save discovery responses');
    });
  });

  // ─── GET /api/career/discovery ─────────────────────────────────────────────

  describe('GET /api/career/discovery', () => {
    it('returns the saved discovery response for the user', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 7,
          user_id: 1,
          answers: JSON.stringify({ stage: 'y3' }),
          sub_answers: JSON.stringify({ frontend: ['React'] }),
          updated_at: '2026-07-09T00:00:00.000Z',
        }],
      });

      const res = await request(app).get('/api/career/discovery');

      expect(res.status).toBe(200);
      expect(res.body.answers.stage).toBe('y3');
      expect(res.body.subAnswers.frontend).toEqual(['React']);
    });

    it('returns 404 when no discovery response exists', async () => {
      // default returns { rows: [] }

      const res = await request(app).get('/api/career/discovery');

      expect(res.status).toBe(404);
    });
  });
});
