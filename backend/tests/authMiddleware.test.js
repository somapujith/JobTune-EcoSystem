// Set JWT_SECRET before requiring the middleware (it calls process.exit if missing)
process.env.JWT_SECRET = 'a-test-secret-that-is-at-least-32-characters-long';

const mockIsSessionActive = jest.fn();
const mockTouchSession = jest.fn();

jest.mock('../src/services/sessionService', () => ({
  isSessionActive: mockIsSessionActive,
  touchSession: mockTouchSession,
}));

const jwt = require('jsonwebtoken');
const { authenticateToken } = require('../src/middleware/auth');

describe('authenticateToken middleware', () => {
  let req, res, next;

  beforeEach(() => {
    jest.clearAllMocks();
    req = { headers: {} };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    next = jest.fn();
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    console.error.mockRestore();
  });

  it('returns 401 when no authorization header', async () => {
    await authenticateToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Unauthorized' });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 when authorization header has no Bearer prefix', async () => {
    req.headers.authorization = 'Basic abc123';

    await authenticateToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 for invalid JWT token', async () => {
    req.headers.authorization = 'Bearer invalid-token';

    await authenticateToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Unauthorized' });
  });

  it('returns 401 for expired JWT token', async () => {
    const token = jwt.sign({ id: 1 }, process.env.JWT_SECRET, { expiresIn: '-1s', algorithm: 'HS256' });
    req.headers.authorization = `Bearer ${token}`;

    await authenticateToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('calls next() and sets req.user for valid token without sessionId', async () => {
    const token = jwt.sign({ id: 42, email: 'test@test.com' }, process.env.JWT_SECRET, { algorithm: 'HS256' });
    req.headers.authorization = `Bearer ${token}`;

    await authenticateToken(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.user.id).toBe(42);
    expect(mockIsSessionActive).not.toHaveBeenCalled();
  });

  it('checks session activity when token contains sessionId', async () => {
    const token = jwt.sign({ id: 1, sessionId: 5 }, process.env.JWT_SECRET, { algorithm: 'HS256' });
    req.headers.authorization = `Bearer ${token}`;
    mockIsSessionActive.mockResolvedValueOnce(true);
    mockTouchSession.mockResolvedValueOnce();

    await authenticateToken(req, res, next);

    expect(mockIsSessionActive).toHaveBeenCalledWith(5);
    expect(next).toHaveBeenCalled();
    expect(req.user.id).toBe(1);
  });

  it('returns 401 SESSION_SUPERSEDED when session is inactive', async () => {
    const token = jwt.sign({ id: 1, sessionId: 5 }, process.env.JWT_SECRET, { algorithm: 'HS256' });
    req.headers.authorization = `Bearer ${token}`;
    mockIsSessionActive.mockResolvedValueOnce(false);

    await authenticateToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'SESSION_SUPERSEDED' })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('touches session in background for active sessions', async () => {
    const token = jwt.sign({ id: 1, sessionId: 5 }, process.env.JWT_SECRET, { algorithm: 'HS256' });
    req.headers.authorization = `Bearer ${token}`;
    mockIsSessionActive.mockResolvedValueOnce(true);
    mockTouchSession.mockResolvedValueOnce();

    await authenticateToken(req, res, next);

    expect(mockTouchSession).toHaveBeenCalledWith(5);
  });

  it('does not fail if touchSession errors', async () => {
    const token = jwt.sign({ id: 1, sessionId: 5 }, process.env.JWT_SECRET, { algorithm: 'HS256' });
    req.headers.authorization = `Bearer ${token}`;
    mockIsSessionActive.mockResolvedValueOnce(true);
    mockTouchSession.mockRejectedValueOnce(new Error('DB error'));

    await authenticateToken(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it('rejects tokens signed with wrong algorithm', async () => {
    const token = jwt.sign({ id: 1 }, 'different-secret-that-is-also-32-chars', { algorithm: 'HS256' });
    req.headers.authorization = `Bearer ${token}`;

    await authenticateToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
  });
});
