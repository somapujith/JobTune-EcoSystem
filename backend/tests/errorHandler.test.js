const { errorHandler } = require('../src/middleware/errorHandler');

describe('errorHandler middleware', () => {
  let req, res, next;

  beforeEach(() => {
    req = { method: 'GET', originalUrl: '/api/test' };
    res = {
      headersSent: false,
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    next = jest.fn();
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    console.error.mockRestore();
  });

  it('delegates to next() when headers already sent', () => {
    res.headersSent = true;
    const err = new Error('test');

    errorHandler(err, req, res, next);

    expect(next).toHaveBeenCalledWith(err);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('returns 500 with generic message for server errors', () => {
    const err = new Error('DB connection lost');

    errorHandler(err, req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Internal Server Error' });
  });

  it('returns client error message for 4xx errors', () => {
    const err = new Error('Resource not found');
    err.status = 404;

    errorHandler(err, req, res, next);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'Resource not found' });
  });

  it('uses err.statusCode when err.status is missing', () => {
    const err = new Error('Bad request');
    err.statusCode = 400;

    errorHandler(err, req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Bad request' });
  });

  it('logs server errors to console', () => {
    const err = new Error('Server crash');

    errorHandler(err, req, res, next);

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('GET /api/test - Server crash')
    );
  });

  it('does not log client errors (4xx)', () => {
    const err = new Error('Not found');
    err.status = 404;

    errorHandler(err, req, res, next);

    expect(console.error).not.toHaveBeenCalled();
  });

  it('defaults to 500 when no status is set', () => {
    const err = new Error('Unknown error');

    errorHandler(err, req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Internal Server Error' });
  });
});
