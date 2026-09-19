'use strict';

/**
 * CORS with the DYNAMIC origin allowlist ported from backend/src/app.js (HEAD).
 * (T1.3, ADR-001 section 2.2)
 *
 * The allowlist is computed in config.js from env (FRONTEND_URL, NODE_ENV, PORT),
 * not at module scope; in development mode it also allows the localhost dev ports.
 *
 * Behaviour preserved from the Express `cors` package configuration:
 *   - methods GET, POST, PUT, PATCH, DELETE, OPTIONS; allowed headers
 *     Content-Type, Authorization; credentials: true
 *   - a request with NO Origin header is allowed (curl, server-to-server, same-origin)
 *     and gets no Access-Control-Allow-Origin header
 *   - an allowed Origin is reflected back in Access-Control-Allow-Origin, with Vary: Origin
 *   - a DISALLOWED Origin throws Error('Not allowed by CORS') with no status, which the
 *     Express errorHandler turned into 500 {"error":"Internal Server Error"}. That
 *     (odd, but existing) behaviour is preserved here: onError does the same
 *     masking. Do not "improve" it to 403 during the port.
 *   - preflight (OPTIONS) is answered with 204 by the cors middleware before any route runs.
 *
 * Known minor differences (Hono's cors vs the express cors package):
 *   - preflight responses also carry `Vary: Access-Control-Request-Headers`
 *   - the preflight has no explicit `Content-Length: 0`
 */
const { cors } = require('hono/cors');
const { getConfig } = require('../lib/context');
const { tagMiddleware } = require('../lib/tag');

function corsMiddleware() {
  const inner = cors({
    origin: (origin, c) => {
      const { allowedOrigins } = getConfig(c);
      if (!origin || allowedOrigins.includes(origin)) {
        // no Origin -> allowed, but nothing to reflect (falsy => header omitted)
        return origin || null;
      }
      throw new Error('Not allowed by CORS');
    },
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  });
  return tagMiddleware(inner, 'cors', { kind: 'cors' });
}

module.exports = { corsMiddleware };
