'use strict';

/**
 * Rate limiting via Cloudflare Workers Rate Limiting bindings.   (T1.9, ADR-001 section 4.4)
 *
 * Enforced ONLY when the binding exists in wrangler.toml ([[ratelimits]] API_LIMITER / AUTH_LIMITER); without a
 * binding it does nothing except warn once per isolate. Design decisions taken from PRODUCTION DATA (audit_logs on
 * the live Neon database: 2 distinct client IPs across the last 200 requests, i.e. every user arrives from a shared
 * proxy IP): a per-IP key would throttle all real users together. So:
 *   - AUTH_LIMITER protects login and signup and is keyed by the ACCOUNT under attack (lower-cased email), which is
 *     the brute-force threat model and is unaffected by shared IPs. Other /api/auth/* endpoints (refresh, logout,
 *     sessions) are not counted by it.
 *   - API_LIMITER is a generous per-IP flood backstop (it mainly catches direct hits on the workers.dev URL).
 * The notes below on the original placeholder still describe the Express limiters being replaced.
 *
 * The Express rate-limiter package is deliberately NOT ported: its in-process store is per-isolate
 * and near-useless on Workers, and porting it would silently remove brute-force
 * protection from /api/auth/login (the ADR's "security regression disguised as a
 * port"). The Express limiters being replaced (backend/src/app.js, HEAD):
 *
 *   apiLimiter  : 15 min window, max 100 (500 when NODE_ENV=development), on all /api
 *                 429 body {"error":"Too many requests, please try again later."}
 *   authLimiter : 15 min window, max 20, on /api/auth
 *                 429 body {"error":"Too many authentication attempts, please try again later."}
 *
 * This module is a documented seam, not the control. Behaviour:
 *   - If the Worker has a Cloudflare Workers Rate Limiting binding with the expected
 *     name (API_LIMITER / AUTH_LIMITER) it calls binding.limit({ key: <client IP> })
 *     and answers 429 with the Express-identical body when success is false.
 *   - If the binding is absent (today: always) it does NOTHING except log one warning
 *     per isolate, so the missing protection is visible in Workers logs. It never
 *     pretends to limit.
 *   - If the binding call itself errors, the request is allowed (logged).
 *
 * IMPORTANT LIMITS, see docs/migration/rate-limiting.md for the full analysis:
 *   - The binding only supports 10 s or 60 s periods; it cannot express "20 per
 *     15 minutes". It is a burst limiter, weaker than Express's window.
 *   - The key is CF-Connecting-IP; behind the Vercel proxy that may be a shared egress
 *     IP (ADR checklist item 7), which would throttle everyone together.
 *   - Cloudflare zone WAF rate-limiting rules do not apply to *.workers.dev traffic.
 *
 * ADR checklist item 18 requires verifying by actually being throttled. Until then
 * treat rate limiting as ABSENT on the Worker.
 *
 * Wiring: createApp mounts apiRateLimit() on /api/*. authRateLimit() is exported for
 * the auth route port (wave 3A): app.use('/api/auth/*', authRateLimit()) before
 * mounting the auth routes.
 */
const { getClientIp, getBody } = require('../lib/http');
const { tagMiddleware } = require('../lib/tag');

const warned = new WeakSet();

/** Default key: the client IP (CF-Connecting-IP). */
const ipKey = (c) => getClientIp(c) || 'no-client-ip';

/**
 * Key for AUTH_LIMITER: only POST /api/auth/login and /api/auth/signup are limited, keyed by the lower-cased email in
 * the (already parsed) JSON body. Returns null (= not limited by this limiter) for every other request.
 */
function accountKey(c) {
  if (c.req.method !== 'POST') return null;
  const path = new URL(c.req.url).pathname.replace(/\/+$/, '');
  if (path !== '/api/auth/login' && path !== '/api/auth/signup') return null;
  const body = getBody(c);
  const email = body && typeof body.email === 'string' ? body.email.trim().toLowerCase().slice(0, 254) : '';
  return `acct:${email || '(no-email)'}`;
}

/**
 * @param {{ binding: string, message: string, name: string, keyFor?: (c) => (string|null) }} opts
 *   keyFor returns the limiter key, or null to skip limiting this request (default: the client IP).
 */
function rateLimit({ binding, message, name, keyFor = ipKey }) {
  const mw = async (c, next) => {
    const limiter = c.env && c.env[binding];

    if (!limiter || typeof limiter.limit !== 'function') {
      if (c.env && typeof c.env === 'object' && !warned.has(c.env)) {
        warned.add(c.env);
        console.warn(`rate limiting is NOT active: no ${binding} binding configured (ADR-001 4.4, docs/migration/rate-limiting.md)`);
      }
      return next();
    }

    const key = keyFor(c);
    if (key === null) return next();

    let success = true;
    try {
      ({ success } = await limiter.limit({ key }));
    } catch (err) {
      console.error('rate limit binding error (allowing request):', err && err.message);
    }
    if (!success) return c.json({ error: message }, 429);
    return next();
  };
  return tagMiddleware(mw, name, { kind: 'ratelimit', binding, enforced: 'only-if-binding-present' });
}

const apiRateLimit = () =>
  rateLimit({ binding: 'API_LIMITER', message: 'Too many requests, please try again later.', name: 'apiRateLimit' });

const authRateLimit = () =>
  rateLimit({
    binding: 'AUTH_LIMITER',
    message: 'Too many authentication attempts, please try again later.',
    name: 'authRateLimit',
    keyFor: accountKey,
  });

module.exports = { apiRateLimit, authRateLimit, rateLimit, accountKey };
