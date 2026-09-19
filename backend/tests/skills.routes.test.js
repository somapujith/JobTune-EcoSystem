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

describe('Skills Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery.mockResolvedValue({ rows: [] });
  });

  // ─── GET /api/skills/questions ─────────────────────────────────────────────

  describe('GET /api/skills/questions', () => {
    it('returns 200 with questions array', async () => {
      const res = await request(app).get('/api/skills/questions');

      expect(res.status).toBe(200);
      expect(res.body.questions).toBeDefined();
      expect(res.body.questions.length).toBeGreaterThan(0);
      expect(res.body.total).toBe(res.body.questions.length);
    });

    it('respects difficulty parameter', async () => {
      const res = await request(app).get('/api/skills/questions?difficulty=hard');

      expect(res.status).toBe(200);
      expect(res.body.difficulty).toBe('hard');
    });

    it('caps count at 15', async () => {
      const res = await request(app).get('/api/skills/questions?count=50');

      expect(res.status).toBe(200);
      expect(res.body.questions.length).toBeLessThanOrEqual(15);
    });

    it('defaults to 8 questions at medium difficulty', async () => {
      const res = await request(app).get('/api/skills/questions');

      expect(res.body.questions.length).toBe(8);
      expect(res.body.difficulty).toBe('medium');
    });
  });

  // ─── POST /api/skills/assessment ───────────────────────────────────────────

  describe('POST /api/skills/assessment', () => {
    it('returns AI-powered assessment when AI succeeds', async () => {
      const aiResult = {
        strengths: ['React.js'],
        gaps: ['System Design'],
        role_matches: ['Junior Developer'],
        analysis: 'Good foundation.',
        scores: { technical_depth: 65, problem_solving: 70, communication: 75, industry_readiness: 60 },
        recommendations: [],
      };

      callAI.mockResolvedValueOnce({ ok: true, data: JSON.stringify(aiResult) });
      extractJSON.mockReturnValueOnce(aiResult);

      // DB insert + select
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 1 }] })
        .mockResolvedValueOnce({ rows: [{ id: 1, skills: '{}' }] });

      const res = await request(app)
        .post('/api/skills/assessment')
        .send({
          answers: [
            { questionId: 't1', questionText: 'What is React?', answer: 'A library for building UIs', category: 'React', difficulty: 'easy' },
          ],
        });

      expect(res.status).toBe(200);
      expect(res.body.strengths).toEqual(['React.js']);
      expect(res.body.ai_powered).toBe(true);
    });

    it('falls back to keyword-based analysis when AI fails', async () => {
      callAI.mockResolvedValueOnce({ ok: false, error: 'unavailable' });

      // DB insert + select
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 1 }] })
        .mockResolvedValueOnce({ rows: [{ id: 1, skills: '{}' }] });

      const res = await request(app)
        .post('/api/skills/assessment')
        .send({
          answers: [
            { questionId: 't1', questionText: 'What is React?', answer: 'React uses virtual DOM for efficient rendering and state management with hooks', category: 'React', difficulty: 'easy' },
          ],
        });

      expect(res.status).toBe(200);
      expect(res.body.strengths).toBeDefined();
      expect(res.body.ai_powered).toBe(false);
    });

    it('handles legacy answer format', async () => {
      callAI.mockResolvedValueOnce({ ok: false });

      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 1 }] })
        .mockResolvedValueOnce({ rows: [{ id: 1, skills: '{}' }] });

      const res = await request(app)
        .post('/api/skills/assessment')
        .send({
          answers: { 1: 'I use Redux for state', 2: 'Event loop manages async tasks' },
        });

      expect(res.status).toBe(200);
      expect(res.body.strengths).toBeDefined();
    });
  });

  // ─── GET /api/skills/history ───────────────────────────────────────────────

  describe('GET /api/skills/history', () => {
    it('returns assessment history', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            skills: JSON.stringify({ scores: { technical_depth: 70 } }),
            strengths: JSON.stringify(['React']),
            gaps: JSON.stringify(['Docker']),
            role_matches: JSON.stringify(['Junior Dev']),
            created_at: '2026-06-26',
          },
        ],
      });

      const res = await request(app).get('/api/skills/history');

      expect(res.status).toBe(200);
      expect(res.body.history).toHaveLength(1);
      expect(res.body.history[0].scores).toEqual({ technical_depth: 70 });
    });

    it('returns 500 on DB error', async () => {
      mockQuery.mockRejectedValueOnce(new Error('DB error'));

      const res = await request(app).get('/api/skills/history');

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Failed to fetch assessment history');
    });
  });
});
