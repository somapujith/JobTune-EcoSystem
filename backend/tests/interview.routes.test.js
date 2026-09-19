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

describe('Interview Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery.mockResolvedValue({ rows: [] });
  });

  // ─── POST /api/interview/start ─────────────────────────────────────────────

  describe('POST /api/interview/start', () => {
    it('starts a new interview with AI-powered question', async () => {
      const aiResponse = {
        feedback: '',
        next_question: 'Tell me about yourself.',
        question_type: 'behavioral',
        is_complete: false,
        tips: ['Be concise'],
      };
      callAI.mockResolvedValueOnce({ ok: true, data: JSON.stringify(aiResponse) });
      extractJSON.mockReturnValueOnce(aiResponse);

      mockQuery.mockResolvedValueOnce({ rows: [{ id: 1 }] }); // DB insert

      const res = await request(app)
        .post('/api/interview/start')
        .send({ role: 'Frontend Developer' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.question).toBe('Tell me about yourself.');
      expect(res.body.data.ai_powered).toBe(true);
    });

    it('falls back when AI is unavailable', async () => {
      callAI.mockResolvedValueOnce({ ok: false });

      mockQuery.mockResolvedValueOnce({ rows: [{ id: 1 }] }); // DB insert

      const res = await request(app)
        .post('/api/interview/start')
        .send({ role: 'Backend Developer' });

      expect(res.status).toBe(200);
      expect(res.body.data.ai_powered).toBe(false);
      expect(res.body.data.question).toBeDefined();
    });

    it('defaults to Full Stack Developer when no role provided', async () => {
      callAI.mockResolvedValueOnce({ ok: false });
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 1 }] });

      const res = await request(app)
        .post('/api/interview/start')
        .send({});

      expect(res.status).toBe(200);
    });
  });

  // ─── POST /api/interview/:id/respond ───────────────────────────────────────

  describe('POST /api/interview/:id/respond', () => {
    it('returns 400 when answer is empty', async () => {
      const res = await request(app)
        .post('/api/interview/1/respond')
        .send({ answer: '' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Answer is required');
    });

    it('returns 404 when interview not found', async () => {
      // default returns { rows: [] } — no interview found

      const res = await request(app)
        .post('/api/interview/999/respond')
        .send({ answer: 'My answer' });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Interview not found');
    });

    it('processes answer and returns next question', async () => {
      // Fetch interview
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 1,
          role: 'Frontend Developer',
          messages: JSON.stringify([{ role: 'interviewer', content: 'First question', type: 'technical' }]),
        }],
      });

      const aiResponse = {
        feedback: 'Good answer about React.',
        next_question: 'What about hooks?',
        question_type: 'technical',
        is_complete: false,
        tips: [],
      };
      callAI.mockResolvedValueOnce({ ok: true, data: JSON.stringify(aiResponse) });
      extractJSON.mockReturnValueOnce(aiResponse);

      const res = await request(app)
        .post('/api/interview/1/respond')
        .send({ answer: 'React uses virtual DOM for efficient updates.' });

      expect(res.status).toBe(200);
      expect(res.body.data.feedback).toBe('Good answer about React.');
      expect(res.body.data.question).toBe('What about hooks?');
    });

    it('handles interview completion', async () => {
      const messages = [];
      for (let i = 0; i < 10; i++) {
        messages.push({ role: i % 2 === 0 ? 'interviewer' : 'candidate', content: `msg ${i}` });
      }

      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 1, role: 'Frontend Developer', messages: JSON.stringify(messages) }],
      });

      const aiResponse = {
        feedback: 'Final feedback.',
        is_complete: true,
        final_score: 78,
        final_feedback: 'Overall great performance.',
        strengths: ['React knowledge'],
        improvements: ['System design'],
      };
      callAI.mockResolvedValueOnce({ ok: true, data: JSON.stringify(aiResponse) });
      extractJSON.mockReturnValueOnce(aiResponse);

      const res = await request(app)
        .post('/api/interview/1/respond')
        .send({ answer: 'Final answer.' });

      expect(res.status).toBe(200);
      expect(res.body.data.is_complete).toBe(true);
      expect(res.body.data.final_score).toBe(78);
    });
  });

  // ─── GET /api/interview/history ────────────────────────────────────────────

  describe('GET /api/interview/history', () => {
    it('returns interview history', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { id: 1, role: 'Frontend Developer', score: 75, created_at: '2026-06-26' },
        ],
      });

      const res = await request(app).get('/api/interview/history');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].role).toBe('Frontend Developer');
    });
  });
});
