const mockQuery = jest.fn();
jest.mock('../src/config/database', () => ({
  pool: { query: mockQuery },
}));

jest.mock('../src/middleware/auth', () => ({
  authenticateToken: (req, _res, next) => {
    req.user = { id: 1, email: 'test@example.com', sessionId: 10 };
    next();
  },
}));

const mockSessionService = {
  createSession: jest.fn(),
  refreshSession: jest.fn(),
  revokeSession: jest.fn(),
  revokeAllSessions: jest.fn(),
  listSessions: jest.fn(),
};
jest.mock('../src/services/sessionService', () => mockSessionService);

jest.mock('bcrypt', () => ({
  genSalt: jest.fn().mockResolvedValue('salt'),
  hash: jest.fn().mockResolvedValue('hashedpassword'),
  compare: jest.fn(),
}));

const request = require('supertest');
const app = require('../src/app');
const bcrypt = require('bcrypt');

describe('Auth Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: audit logger fires async after response — always resolve
    mockQuery.mockResolvedValue({ rows: [] });
  });

  // ─── POST /api/auth/signup ──────────────────────────────────────────────────

  describe('POST /api/auth/signup', () => {
    it('returns 201 on successful signup', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] }) // check existing user
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // insert user
        .mockResolvedValueOnce({ rows: [{ id: 1, email: 'new@test.com', created_at: '2026-01-01' }] }); // select user

      mockSessionService.createSession.mockResolvedValueOnce({
        accessToken: 'jwt-token',
        refreshToken: 'refresh-token',
        session: { id: 1, deviceName: 'Mac', expiresAt: '2026-01-08' },
      });

      const res = await request(app)
        .post('/api/auth/signup')
        .send({ email: 'new@test.com', password: 'securepassword123' });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('token');
      expect(res.body).toHaveProperty('refreshToken');
      expect(res.body).toHaveProperty('user');
    });

    it('returns 400 for invalid email', async () => {
      const res = await request(app)
        .post('/api/auth/signup')
        .send({ email: 'notanemail', password: 'securepassword123' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
    });

    it('returns 400 when password is too short', async () => {
      const res = await request(app)
        .post('/api/auth/signup')
        .send({ email: 'test@test.com', password: 'short' });

      expect(res.status).toBe(400);
    });

    it('returns 400 when user already exists', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 1 }] }); // existing user found

      const res = await request(app)
        .post('/api/auth/signup')
        .send({ email: 'existing@test.com', password: 'securepassword123' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('User already exists');
    });
  });

  // ─── POST /api/auth/login ──────────────────────────────────────────────────

  describe('POST /api/auth/login', () => {
    it('returns 200 on successful login', async () => {
      const user = { id: 1, email: 'user@test.com', password_hash: 'hash', role: 'user' };
      mockQuery.mockResolvedValueOnce({ rows: [user] }); // select user

      bcrypt.compare.mockResolvedValueOnce(true);

      mockSessionService.createSession.mockResolvedValueOnce({
        accessToken: 'jwt-token',
        refreshToken: 'refresh-token',
        session: { id: 1, deviceName: 'Mac' },
      });

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'user@test.com', password: 'password123' });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('token');
      expect(res.body.user).not.toHaveProperty('password_hash');
    });

    it('returns 400 when user not found', async () => {
      // mockQuery default returns { rows: [] } — no user found

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'nobody@test.com', password: 'password123' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid credentials');
    });

    it('returns 400 for wrong password', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 1, email: 'user@test.com', password_hash: 'hash' }] });
      bcrypt.compare.mockResolvedValueOnce(false);

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'user@test.com', password: 'wrongpassword' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid credentials');
    });

    it('returns 409 when account is in use on another device', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 1, email: 'user@test.com', password_hash: 'hash' }] });
      bcrypt.compare.mockResolvedValueOnce(true);

      const accountInUseErr = new Error('Account active on another device');
      accountInUseErr.code = 'ACCOUNT_IN_USE';
      accountInUseErr.activeSession = { deviceName: 'iPhone', ipAddress: '1.2.3.4' };
      mockSessionService.createSession.mockRejectedValueOnce(accountInUseErr);

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'user@test.com', password: 'password123' });

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('ACCOUNT_IN_USE');
    });
  });

  // ─── POST /api/auth/refresh ────────────────────────────────────────────────

  describe('POST /api/auth/refresh', () => {
    it('returns 200 with new token on valid refresh', async () => {
      mockSessionService.refreshSession.mockResolvedValueOnce({
        accessToken: 'new-jwt',
        session: { id: 1, deviceName: 'Mac' },
      });

      const res = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken: 'valid-refresh-token' });

      expect(res.status).toBe(200);
      expect(res.body.token).toBe('new-jwt');
    });

    it('returns 400 when refresh token is missing', async () => {
      const res = await request(app)
        .post('/api/auth/refresh')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Refresh token required');
    });

    it('returns 401 when session is superseded', async () => {
      mockSessionService.refreshSession.mockResolvedValueOnce(null);

      const res = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken: 'invalid-token' });

      expect(res.status).toBe(401);
      expect(res.body.code).toBe('SESSION_SUPERSEDED');
    });
  });

  // ─── POST /api/auth/logout ─────────────────────────────────────────────────

  describe('POST /api/auth/logout', () => {
    it('returns success when logging out via refresh token', async () => {
      const res = await request(app)
        .post('/api/auth/logout')
        .send({ refreshToken: 'some-refresh-token' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('returns success even with no tokens', async () => {
      const res = await request(app)
        .post('/api/auth/logout')
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  // ─── POST /api/auth/logout-all ─────────────────────────────────────────────

  describe('POST /api/auth/logout-all', () => {
    it('revokes all other sessions', async () => {
      mockSessionService.revokeAllSessions.mockResolvedValueOnce();

      const res = await request(app)
        .post('/api/auth/logout-all');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(mockSessionService.revokeAllSessions).toHaveBeenCalledWith(1, 10);
    });
  });

  // ─── GET /api/auth/sessions ────────────────────────────────────────────────

  describe('GET /api/auth/sessions', () => {
    it('returns list of active sessions', async () => {
      mockSessionService.listSessions.mockResolvedValueOnce([
        {
          id: 10,
          device_name: 'Mac',
          user_agent: 'Mozilla/5.0',
          ip_address: '127.0.0.1',
          last_active_at: '2026-06-26',
          expires_at: '2026-07-03',
          created_at: '2026-06-26',
        },
      ]);

      const res = await request(app).get('/api/auth/sessions');

      expect(res.status).toBe(200);
      expect(res.body.sessions).toHaveLength(1);
      expect(res.body.sessions[0].isCurrent).toBe(true);
    });
  });

  // ─── DELETE /api/auth/sessions/:sessionId ──────────────────────────────────

  describe('DELETE /api/auth/sessions/:sessionId', () => {
    it('revokes a specific session', async () => {
      mockSessionService.revokeSession.mockResolvedValueOnce();

      const res = await request(app).delete('/api/auth/sessions/5');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(mockSessionService.revokeSession).toHaveBeenCalledWith(5, 1);
    });

    it('returns 400 for invalid session id', async () => {
      const res = await request(app).delete('/api/auth/sessions/abc');

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid session id');
    });
  });

  // ─── GET /api/auth/me ──────────────────────────────────────────────────────

  describe('GET /api/auth/me', () => {
    it('returns current user profile', async () => {
      const user = { id: 1, email: 'test@example.com', created_at: '2026-01-01' };
      mockQuery.mockResolvedValueOnce({ rows: [user] });

      const res = await request(app).get('/api/auth/me');

      expect(res.status).toBe(200);
      expect(res.body.user.email).toBe('test@example.com');
      expect(res.body.sessionId).toBe(10);
    });

    it('returns 404 when user not found', async () => {
      // default mockResolvedValue returns { rows: [] }

      const res = await request(app).get('/api/auth/me');

      expect(res.status).toBe(404);
    });
  });
});
