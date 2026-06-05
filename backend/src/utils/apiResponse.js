// Consistent API response envelope

function ok(res, data, meta = null) {
  const response = {
    success: true,
    data
  };

  if (meta) {
    response.meta = meta;
  }

  return res.json(response);
}

function fail(res, statusCode, error) {
  return res.status(statusCode).json({
    success: false,
    error: typeof error === 'string' ? error : error.message
  });
}

function badRequest(res, error) {
  return fail(res, 400, error);
}

function unauthorized(res, error = 'Unauthorized') {
  return fail(res, 401, error);
}

function forbidden(res, error = 'Forbidden') {
  return fail(res, 403, error);
}

function notFound(res, error = 'Not found') {
  return fail(res, 404, error);
}

function serverError(res, error = 'Internal server error') {
  console.error('Server error:', error);
  return fail(res, 500, error);
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
