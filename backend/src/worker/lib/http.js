'use strict';

/**
 * Small request/response helpers that replace Express request properties.
 * Nothing here reads ambient process state; everything comes from the Hono context.
 */

/**
 * Client IP for auth / audit / session logic  (ADR-001 section 4.2).
 *
 * Source: the `CF-Connecting-IP` header ONLY. Cloudflare sets it at the edge and
 * overwrites any client-supplied value, so it cannot be spoofed on a request that
 * reached the Worker through Cloudflare. `X-Forwarded-For` is deliberately NOT
 * consulted: on a direct workers.dev hit it is entirely client-controlled, and
 * nothing has yet proven what Vercel puts in it (checklist item 7).
 *
 * KNOWN FAIL-OPEN RISK (must be verified empirically, ADR checklist item 7):
 * production traffic reaches the Worker through Vercel's rewrite proxy. If
 * CF-Connecting-IP then carries Vercel's egress IP rather than the end user's,
 * every user looks like the "same device" to sessionService.createSession's
 * sameDevice check, so single-active-device enforcement silently stops
 * blocking (fails OPEN), and audit_logs.ip_address holds Vercel IPs. The
 * opposite failure (a per-request-varying IP) would 409 every re-login. This
 * helper cannot tell the difference; only a real request through the real
 * proxy chain can.
 *
 * Returns the trimmed header value, or null when absent/blank/longer than 45
 * characters (the audit_logs / user_sessions.ip_address column is VARCHAR(45)).
 * null has the same falsy semantics the Express code relied on for a missing IP.
 */
function getClientIp(c) {
  const raw = c.req.header('cf-connecting-ip');
  if (!raw) return null;
  const ip = raw.trim();
  if (!ip || ip.length > 45) return null;
  return ip;
}

/**
 * Express `req.originalUrl` equivalent: path + query string, as received.
 */
function getOriginalUrl(c) {
  const u = new URL(c.req.url);
  return u.pathname + u.search;
}

/**
 * Equivalent of Express 5's query-string property ("simple" parser = node:querystring):
 * null-prototype object, repeated keys become arrays of strings.
 */
function getQuery(c) {
  return parseFormEncoded(new URL(c.req.url).searchParams);
}

/** node:querystring's default maxKeys, which Express 5's "simple" query parser inherits. */
const MAX_FORM_PAIRS = 1000;

/**
 * Convert URLSearchParams into a querystring.parse()-shaped object.
 * Linear time: repeated keys are appended IN PLACE (copying the array on every repeat is O(n^2), and a 1 MB body of
 * `a=1&a=1&...` then burns tens of seconds of CPU before routing or auth even runs). Like querystring.parse it stops
 * after `maxPairs` pairs (default 1000); the urlencoded BODY parser rejects more than that up front with a 413.
 * @param {URLSearchParams} params
 * @param {number} [maxPairs]
 */
function parseFormEncoded(params, maxPairs = MAX_FORM_PAIRS) {
  const out = Object.create(null);
  let seen = 0;
  for (const [key, value] of params) {
    if (++seen > maxPairs) break;
    if (key in out) {
      if (Array.isArray(out[key])) out[key].push(value);
      else out[key] = [out[key], value];
    } else {
      out[key] = value;
    }
  }
  return out;
}

/**
 * Equivalent of Express's parsed-body property. Set by middleware/bodyParser.js.
 * Like Express 5 it is `undefined` when the request carried no JSON/urlencoded
 * body (NOT `{}`), so `const { x } = getBody(c)` on a bodyless request throws
 * a TypeError -> masked 500, exactly as it did on Render.
 */
function getBody(c) {
  return c.get('body');
}

/**
 * Schedule background work that must outlive the response (ctx.waitUntil).
 * Hono's `c.executionCtx` getter THROWS when the app was invoked without an
 * ExecutionContext (unit tests, app.request() without a 4th argument), so this
 * is the only sanctioned way to reach waitUntil.
 * @returns {boolean} true if handed to the runtime, false if there was no ctx
 */
function safeWaitUntil(c, promise) {
  let ctx;
  try {
    ctx = c.executionCtx;
  } catch (_) {
    ctx = null;
  }
  if (ctx && typeof ctx.waitUntil === 'function') {
    ctx.waitUntil(promise);
    return true;
  }
  return false;
}

module.exports = { getClientIp, getOriginalUrl, getQuery, getBody, parseFormEncoded, safeWaitUntil, MAX_FORM_PAIRS };
