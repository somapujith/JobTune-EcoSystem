const mockQuery = jest.fn();
jest.mock('../src/config/database', () => ({
  pool: { query: mockQuery },
}));

jest.mock('../src/middleware/auth', () => ({
  authenticateToken: (req, _res, next) => {
    req.user = { id: 1, email: 'admin@example.com' };
    next();
  },
}));

const request = require('supertest');
const app = require('../src/app');

describe('Admin Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: any query (including audit logger async) resolves
    mockQuery.mockResolvedValue({ rows: [] });
  });

  // ─── Access Control ────────────────────────────────────────────────────────

  describe('access control', () => {
    it('returns 403 for non-admin users', async () => {
      // requireAdmin role check — user is not admin
      mockQuery.mockResolvedValueOnce({ rows: [{ role: 'user' }] });

      const res = await request(app).get('/api/admin/stats');

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('Access denied. Admins only.');
    });

    it('returns 500 when admin check DB query fails', async () => {
      mockQuery.mockRejectedValueOnce(new Error('DB error'));

      const res = await request(app).get('/api/admin/stats');

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Database error');
    });
  });

  // ─── GET /api/admin/stats ──────────────────────────────────────────────────

  describe('GET /api/admin/stats', () => {
    it('returns dashboard stats', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ role: 'admin' }] }) // requireAdmin
        .mockResolvedValueOnce({ rows: [{ total_users: '100' }] })
        .mockResolvedValueOnce({ rows: [{ active_admins: '3' }] })
        .mockResolvedValueOnce({ rows: [{ total_logs: '500' }] })
        .mockResolvedValueOnce({ rows: [{ recent_logs: '25' }] });

      const res = await request(app).get('/api/admin/stats');

      expect(res.status).toBe(200);
      expect(res.body.totalUsers).toBe('100');
      expect(res.body.activeAdmins).toBe('3');
    });

    it('returns 500 on DB error', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ role: 'admin' }] }) // requireAdmin
        .mockRejectedValueOnce(new Error('DB error'));

      const res = await request(app).get('/api/admin/stats');

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Error fetching stats');
    });
  });

  // ─── GET /api/admin/users ──────────────────────────────────────────────────

  describe('GET /api/admin/users', () => {
    it('returns list of users', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ role: 'admin' }] }) // requireAdmin
        .mockResolvedValueOnce({
          rows: [
            { id: 1, name: 'Admin', email: 'admin@test.com', role: 'admin' },
            { id: 2, name: 'User', email: 'user@test.com', role: 'user' },
          ],
        });

      const res = await request(app).get('/api/admin/users');

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
    });
  });

  // ─── GET /api/admin/audit-logs ─────────────────────────────────────────────

  describe('GET /api/admin/audit-logs', () => {
    it('returns audit logs', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ role: 'admin' }] }) // requireAdmin
        .mockResolvedValueOnce({
          rows: [{ id: 1, action: 'LOGIN', details: '{"method":"POST"}' }],
        });

      const res = await request(app).get('/api/admin/audit-logs');

      expect(res.status).toBe(200);
      expect(res.body[0].details).toEqual({ method: 'POST' });
    });

    it('filters by user_id when provided', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ role: 'admin' }] }) // requireAdmin
        .mockResolvedValueOnce({ rows: [{ id: 1, action: 'LOGIN', details: {} }] });

      await request(app).get('/api/admin/audit-logs?user_id=5');

      // The audit-logs query is the second call (after requireAdmin)
      const auditCall = mockQuery.mock.calls[1];
      expect(auditCall[1]).toEqual(['5']);
    });

    it('handles unparseable details gracefully', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ role: 'admin' }] }) // requireAdmin
        .mockResolvedValueOnce({
          rows: [{ id: 1, action: 'TEST', details: 'not-json' }],
        });

      const res = await request(app).get('/api/admin/audit-logs');

      expect(res.status).toBe(200);
      expect(res.body[0].details).toEqual({ raw: 'not-json' });
    });
  });

  // ─── PUT /api/admin/users/:id/role ─────────────────────────────────────────

  describe('PUT /api/admin/users/:id/role', () => {
    it('updates user role', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ role: 'admin' }] }) // requireAdmin
        .mockResolvedValueOnce({ rows: [{ id: 2 }] }); // UPDATE result

      const res = await request(app)
        .put('/api/admin/users/2/role')
        .send({ role: 'admin' });

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('User role updated successfully');
    });

    it('returns 400 for invalid role', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ role: 'admin' }] }); // requireAdmin

      const res = await request(app)
        .put('/api/admin/users/2/role')
        .send({ role: 'superadmin' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid role');
    });

    it('prevents self-demotion', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ role: 'admin' }] }); // requireAdmin

      const res = await request(app)
        .put('/api/admin/users/1/role')
        .send({ role: 'user' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Cannot remove your own admin role');
    });

    it('returns 404 when target user not found', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ role: 'admin' }] }) // requireAdmin
        .mockResolvedValueOnce({ rows: [] }); // UPDATE found nothing

      const res = await request(app)
        .put('/api/admin/users/999/role')
        .send({ role: 'admin' });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('User not found');
    });
  });
});
