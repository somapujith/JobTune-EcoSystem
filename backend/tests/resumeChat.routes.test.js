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


jest.mock('../src/utils/aiClient', () => ({
  callAI: jest.fn(),
}));

jest.mock('../src/utils/embeddings', () => ({
  embedText: jest.fn(),
  findTopSimilarChunks: jest.fn(),
  chunkText: jest.fn(),
}));

const request = require('supertest');
const app = require('../src/app');
const { callAI } = require('../src/utils/aiClient');
const { findTopSimilarChunks } = require('../src/utils/embeddings');

describe('Resume Chat Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery.mockResolvedValue({ rows: [] });
  });

  // ─── POST /api/resume-chat/chat ────────────────────────────────────────────

  describe('POST /api/resume-chat/chat', () => {
    it('returns 400 when question is missing', async () => {
      const res = await request(app)
        .post('/api/resume-chat/chat')
        .send({ resumeId: 1 });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('required');
    });

    it('returns 400 when resumeId is missing', async () => {
      const res = await request(app)
        .post('/api/resume-chat/chat')
        .send({ question: 'What skills do I have?' });

      expect(res.status).toBe(400);
    });

    it('returns 404 when no embeddings found', async () => {
      // default returns { rows: [] } — no embeddings

      const res = await request(app)
        .post('/api/resume-chat/chat')
        .send({ question: 'What skills?', resumeId: 1 });

      expect(res.status).toBe(404);
      expect(res.body.error).toContain('embeddings not found');
    });

    it('returns AI-generated answer with sources', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { chunk_text: 'Experienced React developer', embedding: JSON.stringify([0.1, 0.2]) },
          { chunk_text: 'Proficient in Node.js', embedding: JSON.stringify([0.3, 0.4]) },
        ],
      });

      findTopSimilarChunks.mockResolvedValueOnce([
        { text: 'Experienced React developer' },
        { text: 'Proficient in Node.js' },
      ]);

      callAI.mockResolvedValueOnce({
        ok: true,
        data: 'Based on your resume, you have strong React and Node.js skills.',
      });

      const res = await request(app)
        .post('/api/resume-chat/chat')
        .send({ question: 'What are my key skills?', resumeId: 1 });

      expect(res.status).toBe(200);
      expect(res.body.answer).toContain('React');
      expect(res.body.sources).toHaveLength(2);
    });

    it('returns 502 when AI is unavailable', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ chunk_text: 'Resume content', embedding: JSON.stringify([0.1]) }],
      });

      findTopSimilarChunks.mockResolvedValueOnce([{ text: 'Resume content' }]);
      callAI.mockResolvedValueOnce({ ok: false, error: 'Service unavailable' });

      const res = await request(app)
        .post('/api/resume-chat/chat')
        .send({ question: 'What is my experience?', resumeId: 1 });

      expect(res.status).toBe(502);
    });

    it('returns 400 when no relevant chunks found', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ chunk_text: 'text', embedding: JSON.stringify([0.1]) }],
      });

      findTopSimilarChunks.mockResolvedValueOnce([]);

      const res = await request(app)
        .post('/api/resume-chat/chat')
        .send({ question: 'Unrelated question', resumeId: 1 });

      expect(res.status).toBe(400);
    });
  });

  // ─── POST /api/resume-chat/embed ───────────────────────────────────────────

  describe('POST /api/resume-chat/embed', () => {
    it('returns 200 and starts embedding', async () => {
      const res = await request(app)
        .post('/api/resume-chat/embed')
        .send({ resumeId: 1, resumeText: 'My resume content here.' });

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Resume embedding started');
    });

    it('returns 400 when resumeId is missing', async () => {
      const res = await request(app)
        .post('/api/resume-chat/embed')
        .send({ resumeText: 'content' });

      expect(res.status).toBe(400);
    });

    it('returns 400 when resumeText is missing', async () => {
      const res = await request(app)
        .post('/api/resume-chat/embed')
        .send({ resumeId: 1 });

      expect(res.status).toBe(400);
    });
  });
});
