'use strict';

/**
 * Error + not-found handlers, ported from backend/src/middleware/errorHandler.js
 * (HEAD) and Express's default 404 (finalhandler).   (T1.3, ADR-001 section 7)
 *
 * onError(err, c):  registered with app.onError(). Semantics preserved exactly:
 *   - status = err.status || err.statusCode || 500
 *   - status >= 500: log "[ISO time] METHOD url - message" (and the stack ONLY in
 *     development), respond {"error":"Internal Server Error"}. The real message and
 *     the stack NEVER reach the response body.
 *   - status < 500: respond {"error": err.message} (the client-error message is
 *     deliberately returned, as in Express)
 *   One defensive difference: a status that is not an integer in 200-599 (which
 *   would make `new Response` throw inside the error handler itself) is treated as 500.
 *
 * notFoundHandler(c): Express's behaviour for an unmatched route, byte-for-byte for
 * ordinary paths: 404, text/html; charset=utf-8, body
 *   <!DOCTYPE html> ... <pre>Cannot GET /api/nope</pre> ...
 * plus Content-Security-Policy: default-src 'none' and X-Content-Type-Options: nosniff
 * (securityHeaders.js re-applies these after secureHeaders). Note this is HTML, not
 * JSON: the Express API really did answer unknown /api paths that way.
 * Not replicated: encodeurl's handling of exotic characters (Workers hands us an
 * already-normalised URL).
 */
const { getOriginalUrl } = require('../lib/http');

function onError(err, c) {
  let status = err && (err.status || err.statusCode) || 500;
  if (!Number.isInteger(status) || status < 200 || status > 599) status = 500;

  if (status >= 500) {
    const message = err && err.message;
    console.error(`[${new Date().toISOString()}] ${c.req.method} ${getOriginalUrl(c)} - ${message}`);
    const config = c.get('config');
    if (config && config.isDevelopment) {
      console.error(err && err.stack);
    }
  }

  return c.json({ error: status >= 500 ? 'Internal Server Error' : err.message }, status);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function notFoundHandler(c) {
  const pathname = new URL(c.req.url).pathname;
  const message = escapeHtml(`Cannot ${c.req.method} ${pathname}`)
    .replaceAll('\n', '<br>')
    .replaceAll('  ', ' &nbsp;');

  const body =
    '<!DOCTYPE html>\n' +
    '<html lang="en">\n' +
    '<head>\n' +
    '<meta charset="utf-8">\n' +
    '<title>Error</title>\n' +
    '</head>\n' +
    '<body>\n' +
    '<pre>' + message + '</pre>\n' +
    '</body>\n' +
    '</html>\n';

  c.set('finalHandlerResponse', true);
  return new Response(c.req.method === 'HEAD' ? null : body, {
    status: 404,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy': "default-src 'none'",
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

module.exports = { onError, notFoundHandler };
