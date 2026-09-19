'use strict';

/**
 * Consistent API response envelope   (port of utils/apiResponse.js, T2.x)
 *
 * Same helper names, same bodies, same status codes as the Express module. The ONLY difference is
 * the first argument: Express passed `res`, these take the Hono context `c`, and every helper
 * RETURNS the Response, so a handler must `return` it:
 *
 *   Express:  return apiResponse.badRequest(res, 'company is required');
 *   Worker:   return apiResponse.badRequest(c, 'company is required');
 *
 *   ok(c, data, meta = null)          200  { success: true, data[, meta] }   (meta only when truthy)
 *   fail(c, statusCode, error)        n    { success: false, error }         (error string, or error.message)
 *   badRequest(c, error)              400
 *   unauthorized(c, error='Unauthorized')   401
 *   forbidden(c, error='Forbidden')         403
 *   notFound(c, error='Not found')          404
 *   serverError(c, error='Internal server error')   500, logs 'Server error:' first (the error text is
 *                                     returned in the body, as on Express: this envelope does not mask 5xx)
 *
 * Exposed as `getServices(c).apiResponse`; also importable directly (it is stateless).
 */

function ok(c, data, meta = null) {
  const response = {
    success: true,
    data
  };

  if (meta) {
    response.meta = meta;
  }

  return c.json(response);
}

function fail(c, statusCode, error) {
  return c.json({
    success: false,
    error: typeof error === 'string' ? error : error.message
  }, statusCode);
}

function badRequest(c, error) {
  return fail(c, 400, error);
}

function unauthorized(c, error = 'Unauthorized') {
  return fail(c, 401, error);
}

function forbidden(c, error = 'Forbidden') {
  return fail(c, 403, error);
}

function notFound(c, error = 'Not found') {
  return fail(c, 404, error);
}

function serverError(c, error = 'Internal server error') {
  console.error('Server error:', error);
  return fail(c, 500, error);
}

module.exports = {
  ok,
  fail,
  badRequest,
  unauthorized,
  forbidden,
  notFound,
  serverError
};
