'use strict';

/**
 * Security headers: Hono secureHeaders() configured to reproduce helmet 8.2.0's
 * DEFAULT header set, which is what backend/src/app.js applied with `helmet()`
 * (no options) plus `app.disable('x-powered-by')`.   (T1.3, ADR-001 section 2.2)
 *
 * The parity is asserted against the real helmet package by
 * tests/worker/securityHeaders.test.js (it runs helmet's own middleware against a
 * fake response and compares). If helmet is upgraded, that test shows the diff.
 *
 * helmet 8.2.0 defaults (all reproduced):
 *   Content-Security-Policy            (11 directives, listed below)
 *   Cross-Origin-Opener-Policy         same-origin
 *   Cross-Origin-Resource-Policy       same-origin
 *   Origin-Agent-Cluster               ?1
 *   Referrer-Policy                    no-referrer
 *   Strict-Transport-Security          max-age=31536000; includeSubDomains
 *   X-Content-Type-Options             nosniff
 *   X-DNS-Prefetch-Control             off
 *   X-Download-Options                 noopen
 *   X-Frame-Options                    SAMEORIGIN
 *   X-Permitted-Cross-Domain-Policies  none
 *   X-XSS-Protection                   0
 *   X-Powered-By                       removed (Workers never sets it)
 * Not sent by helmet by default, so not sent here: Cross-Origin-Embedder-Policy.
 *
 * INTENDED DIFFERENCES from helmet (documented, asserted by the test):
 *   1. Content-Security-Policy directives are joined with "; " by Hono, helmet
 *      joins with ";". Same directives, same order; whitespace between directives
 *      is insignificant in the CSP grammar.
 *   2. Hono's own HSTS default is max-age=15552000; we override it to helmet's
 *      31536000 so the header value matches.
 *   3. Express's default 404 (finalhandler) replaces CSP with "default-src 'none'"
 *      on the not-found page; middleware/errorHandler.js notFoundHandler marks the
 *      context so this wrapper re-applies that after secureHeaders has run.
 *
 * Header-parity is NOT proof of end-to-end equivalence: compare real responses
 * from Render and the Worker (ADR checklist item 21).
 */
const { secureHeaders } = require('hono/secure-headers');
const { tagMiddleware } = require('../lib/tag');

// helmet 8.2.0 contentSecurityPolicy.getDefaultDirectives(), same order.
const HELMET_DEFAULT_CSP = {
  'default-src': ["'self'"],
  'base-uri': ["'self'"],
  'font-src': ["'self'", 'https:', 'data:'],
  'form-action': ["'self'"],
  'frame-ancestors': ["'self'"],
  'img-src': ["'self'", 'data:'],
  'object-src': ["'none'"],
  'script-src': ["'self'"],
  'script-src-attr': ["'none'"],
  'style-src': ["'self'", 'https:', "'unsafe-inline'"],
  'upgrade-insecure-requests': [],
};

const HELMET_HSTS = 'max-age=31536000; includeSubDomains';

function securityHeaders() {
  const inner = secureHeaders({
    contentSecurityPolicy: HELMET_DEFAULT_CSP,
    strictTransportSecurity: HELMET_HSTS,
    // everything else: Hono defaults == helmet defaults (verified by test)
  });

  const mw = async (c, next) => {
    await inner(c, next);
    if (c.get('finalHandlerResponse')) {
      // Express finalhandler semantics for the default 404 page
      c.res.headers.set('Content-Security-Policy', "default-src 'none'");
      c.res.headers.set('X-Content-Type-Options', 'nosniff');
    }
  };
  return tagMiddleware(mw, 'securityHeaders', { kind: 'security' });
}

module.exports = { securityHeaders, HELMET_DEFAULT_CSP, HELMET_HSTS };
