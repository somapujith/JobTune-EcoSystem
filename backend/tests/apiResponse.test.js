const apiResponse = require('../src/utils/apiResponse');

describe('apiResponse utilities', () => {
  let mockRes;

  beforeEach(() => {
    mockRes = {
      json: jest.fn().mockReturnThis(),
      status: jest.fn().mockReturnThis()
    };
  });

  describe('ok()', () => {
    it('returns success response with data', () => {
      const data = { id: 1, name: 'test' };
      apiResponse.ok(mockRes, data);

      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data
      });
    });

    it('includes meta when provided', () => {
      const data = { items: [] };
      const meta = { total: 0, page: 1 };
      apiResponse.ok(mockRes, data, meta);

      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data,
        meta
      });
    });
  });

  describe('fail()', () => {
    it('returns error with status code', () => {
      apiResponse.fail(mockRes, 400, 'Bad request');

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Bad request'
      });
    });

    it('handles Error objects', () => {
      const error = new Error('Test error');
      apiResponse.fail(mockRes, 500, error);

      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Test error'
      });
    });
  });

  describe('convenience methods', () => {
    it('badRequest uses 400', () => {
      apiResponse.badRequest(mockRes, 'Invalid input');
      expect(mockRes.status).toHaveBeenCalledWith(400);
    });

    it('unauthorized uses 401', () => {
      apiResponse.unauthorized(mockRes);
      expect(mockRes.status).toHaveBeenCalledWith(401);
    });

    it('forbidden uses 403', () => {
      apiResponse.forbidden(mockRes);
      expect(mockRes.status).toHaveBeenCalledWith(403);
    });

    it('notFound uses 404', () => {
      apiResponse.notFound(mockRes);
      expect(mockRes.status).toHaveBeenCalledWith(404);
    });

    it('serverError uses 500', () => {
      apiResponse.serverError(mockRes);
      expect(mockRes.status).toHaveBeenCalledWith(500);
    });
  });
});
