const mockQuery = jest.fn();
jest.mock('../src/config/database', () => ({
  pool: { query: mockQuery },
}));

const { auditLogger } = require('../src/middleware/auditLogger');

describe('auditLogger middleware', () => {
  let req, res, next;
  let finishCallback;

  beforeEach(() => {
    jest.clearAllMocks();
    req = {
      method: 'POST',
      originalUrl: '/api/test',
      query: { page: '1' },
      body: { name: 'test' },
      user: { id: 42 },
      ip: '127.0.0.1',
    };
    res = {
      statusCode: 200,
      on: jest.fn((event, cb) => {
        if (event === 'finish') finishCallback = cb;
      }),
    };
    next = jest.fn();
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    console.error.mockRestore();
  });

  it('calls next() immediately', async () => {
    const middleware = auditLogger('CREATE', 'user');
    await middleware(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('registers a finish event listener', async () => {
    const middleware = auditLogger('CREATE', 'user');
    await middleware(req, res, next);
    expect(res.on).toHaveBeenCalledWith('finish', expect.any(Function));
  });

  it('inserts audit log with correct parameters on finish', async () => {
    mockQuery.mockResolvedValueOnce({});
    const middleware = auditLogger('UPDATE', 'profile');
    await middleware(req, res, next);

    await finishCallback();

    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO audit_logs'),
      [
        42,
        'UPDATE',
        'profile',
        expect.stringContaining('"method":"POST"'),
        '127.0.0.1',
      ]
    );
  });

  it('redacts body when it has content', async () => {
    mockQuery.mockResolvedValueOnce({});
    const middleware = auditLogger('CREATE', 'user');
    await middleware(req, res, next);

    await finishCallback();

    const detailsJson = mockQuery.mock.calls[0][1][3];
    const details = JSON.parse(detailsJson);
    expect(details.body).toBe('[REDACTED]');
  });

  it('uses empty object for body when body is empty', async () => {
    req.body = {};
    mockQuery.mockResolvedValueOnce({});
    const middleware = auditLogger('READ', 'user');
    await middleware(req, res, next);

    await finishCallback();

    const detailsJson = mockQuery.mock.calls[0][1][3];
    const details = JSON.parse(detailsJson);
    expect(details.body).toEqual({});
  });

  it('uses null userId when req.user is missing', async () => {
    req.user = undefined;
    mockQuery.mockResolvedValueOnce({});
    const middleware = auditLogger('READ', 'system');
    await middleware(req, res, next);

    await finishCallback();

    expect(mockQuery.mock.calls[0][1][0]).toBeNull();
  });

  it('handles DB errors gracefully', async () => {
    mockQuery.mockRejectedValueOnce(new Error('DB down'));
    const middleware = auditLogger('CREATE', 'user');
    await middleware(req, res, next);

    await finishCallback();

    expect(console.error).toHaveBeenCalledWith('Audit Log Error:', 'DB down');
  });
});
