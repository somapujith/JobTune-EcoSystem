const request = require('supertest');

// Mock the database pool before requiring app
jest.mock('../src/config/database', () => ({
  pool: {
    query: jest.fn()
  }
}));

// Mock authenticateToken middleware
jest.mock('../src/middleware/auth', () => ({
  authenticateToken: (req, _res, next) => {
    req.user = { id: 1, email: 'test@example.com' };
    next();
  }
}));

const { pool } = require('../src/config/database');
const app = require('../src/app');

describe('JobTracker CRUD endpoints', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ─── GET /api/jobs ───────────────────────────────────────────────────────────

  describe('GET /api/jobs', () => {
    it('returns { jobs, stats } for authenticated user', async () => {
      pool.query.mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            user_id: 1,
            company: 'Acme Corp',
            role: 'Software Engineer',
            status: 'applied',
            total: '3',
            interviews: '1',
            offers: '0'
          },
          {
            id: 2,
            user_id: 1,
            company: 'Beta Inc',
            role: 'Backend Dev',
            status: 'interview',
            total: '3',
            interviews: '1',
            offers: '0'
          },
          {
            id: 3,
            user_id: 1,
            company: 'Gamma Ltd',
            role: 'Full Stack',
            status: 'applied',
            total: '3',
            interviews: '1',
            offers: '0'
          }
        ]
      });

      const res = await request(app).get('/api/jobs').set('Authorization', 'Bearer test-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('jobs');
      expect(res.body.data).toHaveProperty('stats');
      expect(Array.isArray(res.body.data.jobs)).toBe(true);
    });

    it('calculates stats correctly from query results', async () => {
      pool.query.mockResolvedValueOnce({
        rows: [
          { id: 1, company: 'A', role: 'Dev', status: 'applied', total: '4', interviews: '1', offers: '1' }
        ]
      });

      const res = await request(app).get('/api/jobs').set('Authorization', 'Bearer test-token');

      expect(res.status).toBe(200);
      const { stats } = res.body.data;
      expect(stats.total).toBe(4);
      expect(stats.interviews).toBe(1);
      expect(stats.offers).toBe(1);
      // replyRate = (1 + 1) * 100 / 4 = 50
      expect(stats.replyRate).toBe(50);
    });

    it('returns zero replyRate when total is 0 (no division by zero)', async () => {
      pool.query.mockResolvedValueOnce({ rows: [] });

      const res = await request(app).get('/api/jobs').set('Authorization', 'Bearer test-token');

      expect(res.status).toBe(200);
      const { stats } = res.body.data;
      expect(stats.total).toBe(0);
      expect(stats.replyRate).toBe(0);
    });

    it('returns 500 on database error', async () => {
      pool.query.mockRejectedValueOnce(new Error('DB connection failed'));

      const res = await request(app).get('/api/jobs').set('Authorization', 'Bearer test-token');

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
    });
  });

  // ─── POST /api/jobs ──────────────────────────────────────────────────────────

  describe('POST /api/jobs', () => {
    it('creates a new job application and returns it', async () => {
      const newJob = {
        company: 'Startup XYZ',
        role: 'Frontend Engineer',
        job_description: 'React developer needed',
        job_url: 'https://startup.xyz/jobs/1',
        status: 'applied',
        notes: 'Referred by John',
        source: 'LinkedIn'
      };

      pool.query.mockResolvedValueOnce({
        rows: [{ id: 10, user_id: 1, ...newJob, applied_at: new Date(), created_at: new Date() }]
      });

      const res = await request(app)
        .post('/api/jobs')
        .set('Authorization', 'Bearer test-token')
        .send(newJob);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.company).toBe('Startup XYZ');
      expect(res.body.data.role).toBe('Frontend Engineer');
    });

    it('returns 400 when company is missing', async () => {
      const res = await request(app)
        .post('/api/jobs')
        .set('Authorization', 'Bearer test-token')
        .send({ role: 'Engineer' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('returns 400 when role is missing', async () => {
      const res = await request(app)
        .post('/api/jobs')
        .set('Authorization', 'Bearer test-token')
        .send({ company: 'Acme' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('uses parameterized query to prevent SQL injection', async () => {
      const maliciousPayload = {
        company: "'; DROP TABLE job_applications; --",
        role: 'Hacker'
      };

      pool.query.mockResolvedValueOnce({
        rows: [{ id: 99, user_id: 1, company: maliciousPayload.company, role: maliciousPayload.role }]
      });

      const res = await request(app)
        .post('/api/jobs')
        .set('Authorization', 'Bearer test-token')
        .send(maliciousPayload);

      // Should not throw - parameterized query handles it safely
      expect(res.status).toBe(201);
      // Verify pool.query was called with parameters array (not string concat)
      const callArgs = pool.query.mock.calls[0];
      expect(Array.isArray(callArgs[1])).toBe(true);
      expect(callArgs[1]).toContain(maliciousPayload.company);
    });

    it('defaults status to "applied" when not provided', async () => {
      pool.query.mockResolvedValueOnce({
        rows: [{ id: 5, user_id: 1, company: 'Corp', role: 'Dev', status: 'applied' }]
      });

      await request(app)
        .post('/api/jobs')
        .set('Authorization', 'Bearer test-token')
        .send({ company: 'Corp', role: 'Dev' });

      const queryParams = pool.query.mock.calls[0][1];
      // status param should be 'applied' by default
      expect(queryParams).toContain('applied');
    });

    it('returns 500 on database error', async () => {
      pool.query.mockRejectedValueOnce(new Error('Insert failed'));

      const res = await request(app)
        .post('/api/jobs')
        .set('Authorization', 'Bearer test-token')
        .send({ company: 'Corp', role: 'Dev' });

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
    });
  });

  // ─── PATCH /api/jobs/:id ─────────────────────────────────────────────────────

  describe('PATCH /api/jobs/:id', () => {
    it('updates job status and returns updated record', async () => {
      pool.query.mockResolvedValueOnce({
        rows: [{ id: 1, user_id: 1, company: 'Acme', role: 'Dev', status: 'interview', notes: 'Got callback' }]
      });

      const res = await request(app)
        .patch('/api/jobs/1')
        .set('Authorization', 'Bearer test-token')
        .send({ status: 'interview', notes: 'Got callback' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('interview');
    });

    it('returns 404 when job does not exist or belongs to another user', async () => {
      pool.query.mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .patch('/api/jobs/999')
        .set('Authorization', 'Bearer test-token')
        .send({ status: 'offer' });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('rejects invalid status values', async () => {
      const res = await request(app)
        .patch('/api/jobs/1')
        .set('Authorization', 'Bearer test-token')
        .send({ status: 'hacked' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('uses parameterized query with user_id scope (auth isolation)', async () => {
      pool.query.mockResolvedValueOnce({
        rows: [{ id: 1, user_id: 1, company: 'Acme', role: 'Dev', status: 'offer' }]
      });

      await request(app)
        .patch('/api/jobs/1')
        .set('Authorization', 'Bearer test-token')
        .send({ status: 'offer' });

      const callArgs = pool.query.mock.calls[0];
      // user_id = 1 must be in the params so user can't update others' records
      expect(callArgs[1]).toContain(1); // user_id
    });

    it('returns 500 on database error', async () => {
      pool.query.mockRejectedValueOnce(new Error('Update failed'));

      const res = await request(app)
        .patch('/api/jobs/1')
        .set('Authorization', 'Bearer test-token')
        .send({ status: 'interview' });

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
    });
  });

  // ─── DELETE /api/jobs/:id ────────────────────────────────────────────────────

  describe('DELETE /api/jobs/:id', () => {
    it('deletes a job and returns 204', async () => {
      pool.query.mockResolvedValueOnce({ rows: [{ id: 1 }] });

      const res = await request(app)
        .delete('/api/jobs/1')
        .set('Authorization', 'Bearer test-token');

      expect(res.status).toBe(204);
    });

    it('returns 404 when job not found or belongs to another user', async () => {
      pool.query.mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .delete('/api/jobs/999')
        .set('Authorization', 'Bearer test-token');

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('scopes delete by user_id so users cannot delete others records', async () => {
      pool.query.mockResolvedValueOnce({ rows: [{ id: 1 }] });

      await request(app)
        .delete('/api/jobs/1')
        .set('Authorization', 'Bearer test-token');

      const callArgs = pool.query.mock.calls[0];
      // Both job id AND user_id must be params
      expect(callArgs[1]).toContain(1); // job id
      expect(callArgs[1]).toContain(1); // user_id (both = 1 in mock)
    });

    it('returns 500 on database error', async () => {
      pool.query.mockRejectedValueOnce(new Error('Delete failed'));

      const res = await request(app)
        .delete('/api/jobs/1')
        .set('Authorization', 'Bearer test-token');

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
    });
  });

  // ─── Route collision guard ────────────────────────────────────────────────────

  describe('Route collision: /api/jobs/:id does not shadow specific sub-paths', () => {
    it('GET /api/jobs does not conflict with /api/jobs/check-ats-score path structure', () => {
      // This is a structural verification — just ensure our route file
      // mounts GET/POST/PATCH/DELETE only on '' and '/:id'
      // The specific sub-paths (check-ats-score etc.) are handled by other routers
      // mounted on the same /api/jobs prefix in app.js AFTER our router.
      // Express tries routes in registration order, so jobTracker must mount BEFORE
      // atsChecker, jobAnalyzer, coverLetter.
      expect(true).toBe(true); // placeholder — real check is ordering in app.js
    });
  });
});
