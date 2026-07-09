const mockQuery = jest.fn();
jest.mock('../src/config/database', () => ({
  pool: { query: mockQuery },
}));

// sessionService reads JWT_SECRET at require-time via auth.js dependency chain.
// Set it before requiring.
process.env.JWT_SECRET = 'a-test-secret-that-is-at-least-32-characters-long';

const sessionService = require('../src/services/sessionService');

describe('SessionService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Touch-throttle and active-session caches are process-lifetime by design —
    // reset between tests so mock call ordering stays deterministic
    sessionService.__clearSessionCaches();
  });

  // ─── ensureTables ──────────────────────────────────────────────────────────

  describe('ensureTables()', () => {
    it('executes CREATE TABLE IF NOT EXISTS queries', async () => {
      mockQuery.mockResolvedValueOnce({}).mockResolvedValueOnce({});

      await sessionService.ensureTables();

      expect(mockQuery).toHaveBeenCalledTimes(2);
      expect(mockQuery.mock.calls[0][0]).toContain('user_sessions');
      expect(mockQuery.mock.calls[1][0]).toContain('user_progress');
    });
  });

  // ─── getActiveSession ──────────────────────────────────────────────────────

  describe('getActiveSession()', () => {
    it('returns the active session for a user', async () => {
      const session = { id: 1, device_name: 'Mac', ip_address: '1.2.3.4' };
      mockQuery.mockResolvedValueOnce({ rows: [session] });

      const result = await sessionService.getActiveSession(42);

      expect(result).toEqual(session);
      expect(mockQuery.mock.calls[0][1]).toEqual([42]);
    });

    it('returns null when no active session exists', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await sessionService.getActiveSession(42);

      expect(result).toBeNull();
    });
  });

  // ─── createSession ────────────────────────────────────────────────────────

  describe('createSession()', () => {
    it('creates a new session and returns tokens', async () => {
      // getActiveSession → no existing session
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // INSERT
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 5, expires_at: '2026-07-03', device_name: 'Mac', created_at: '2026-06-26' }],
      });

      const result = await sessionService.createSession(1, { userAgent: 'Mozilla', ipAddress: '1.2.3.4' });

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(result.session.id).toBe(5);
    });

    it('throws ACCOUNT_IN_USE when another device has active session', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 1, device_name: 'iPhone', ip_address: '5.6.7.8', last_active_at: '2026-06-26', created_at: '2026-06-25' }],
      });

      await expect(
        sessionService.createSession(1, { ipAddress: '1.2.3.4' })
      ).rejects.toMatchObject({ code: 'ACCOUNT_IN_USE' });
    });

    it('allows same-device re-login by revoking old session', async () => {
      // getActiveSession → existing session on same IP
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 1, device_name: 'Mac', ip_address: '1.2.3.4' }],
      });
      // revokeAllSessions
      mockQuery.mockResolvedValueOnce({});
      // INSERT new session
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 2, expires_at: '2026-07-03', device_name: 'Mac', created_at: '2026-06-26' }],
      });

      const result = await sessionService.createSession(1, { ipAddress: '1.2.3.4' });

      expect(result.session.id).toBe(2);
    });

    it('allows replaceExisting to take over another device', async () => {
      // getActiveSession → existing session on different IP
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 1, device_name: 'iPhone', ip_address: '5.6.7.8' }],
      });
      // revokeAllSessions
      mockQuery.mockResolvedValueOnce({});
      // INSERT new session
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 2, expires_at: '2026-07-03', device_name: 'Mac', created_at: '2026-06-26' }],
      });

      const result = await sessionService.createSession(
        1,
        { ipAddress: '1.2.3.4' },
        { replaceExisting: true }
      );

      expect(result.session.id).toBe(2);
    });
  });

  // ─── touchSession ─────────────────────────────────────────────────────────

  describe('touchSession()', () => {
    it('updates last_active_at for session', async () => {
      mockQuery.mockResolvedValueOnce({});

      await sessionService.touchSession(5);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE user_sessions'),
        [5]
      );
    });

    it('does nothing when sessionId is falsy', async () => {
      await sessionService.touchSession(null);
      expect(mockQuery).not.toHaveBeenCalled();
    });
  });

  // ─── isSessionActive ──────────────────────────────────────────────────────

  describe('isSessionActive()', () => {
    it('returns true when session exists and is not revoked', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 5 }] });

      const result = await sessionService.isSessionActive(5);

      expect(result).toBe(true);
    });

    it('returns false when session is revoked or expired', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await sessionService.isSessionActive(5);

      expect(result).toBe(false);
    });

    it('returns false for null sessionId', async () => {
      const result = await sessionService.isSessionActive(null);
      expect(result).toBe(false);
    });

    it('returns false for non-numeric sessionId', async () => {
      const result = await sessionService.isSessionActive('abc');
      expect(result).toBe(false);
    });
  });

  // ─── refreshSession ───────────────────────────────────────────────────────

  describe('refreshSession()', () => {
    it('returns new access token for valid refresh token', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 1, user_id: 42, device_name: 'Mac', expires_at: '2026-07-03' }],
      });
      // touchSession
      mockQuery.mockResolvedValueOnce({});

      const result = await sessionService.refreshSession('valid-refresh-token');

      expect(result).toHaveProperty('accessToken');
      expect(result.session.id).toBe(1);
    });

    it('returns null for invalid refresh token', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await sessionService.refreshSession('bad-token');

      expect(result).toBeNull();
    });
  });

  // ─── revokeSession ────────────────────────────────────────────────────────

  describe('revokeSession()', () => {
    it('sets revoked_at on the session', async () => {
      mockQuery.mockResolvedValueOnce({});

      await sessionService.revokeSession(5, 1);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE user_sessions'),
        [5, 1]
      );
    });
  });

  // ─── revokeAllSessions ────────────────────────────────────────────────────

  describe('revokeAllSessions()', () => {
    it('revokes all sessions for user', async () => {
      mockQuery.mockResolvedValueOnce({});

      await sessionService.revokeAllSessions(1);

      const sql = mockQuery.mock.calls[0][0];
      expect(sql).toContain('UPDATE user_sessions');
      expect(sql).not.toContain('id !=');
    });

    it('excludes a specific session when exceptSessionId is given', async () => {
      mockQuery.mockResolvedValueOnce({});

      await sessionService.revokeAllSessions(1, 5);

      const sql = mockQuery.mock.calls[0][0];
      expect(sql).toContain('id !=');
      expect(mockQuery.mock.calls[0][1]).toEqual([1, 5]);
    });
  });

  // ─── listSessions ─────────────────────────────────────────────────────────

  describe('listSessions()', () => {
    it('returns active sessions for user', async () => {
      const sessions = [
        { id: 1, device_name: 'Mac', last_active_at: '2026-06-26' },
        { id: 2, device_name: 'iPhone', last_active_at: '2026-06-25' },
      ];
      mockQuery.mockResolvedValueOnce({ rows: sessions });

      const result = await sessionService.listSessions(1);

      expect(result).toEqual(sessions);
      expect(mockQuery.mock.calls[0][1]).toEqual([1]);
    });
  });
});
