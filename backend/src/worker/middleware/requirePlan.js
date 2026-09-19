'use strict';

/**
 * requirePlan(minTier): Worker port of backend/src/middleware/requirePlan.js (HEAD).
 * (T1.5, ADR-001 sections 6.3, 10)   *** ENTITLEMENT GATE: FAILS CLOSED ***
 *
 * Must run after authenticateToken (needs c.get('user').id).
 *
 * Contract:
 *   - PASS      : plan found AND tier_level is a finite number >= minTier
 *                 -> c.set('userPlan', plan) and next().
 *   - BELOW/NO PLAN: 403 {"error":"This feature requires a higher subscription plan.",
 *                 "code":"PLAN_UPGRADE_REQUIRED","requiredPlan":<tier name|null>,
 *                 "currentPlan":<plan name|null>}    (shape read by the frontend PlanGate)
 *   - ANYTHING ELSE -> 500 {"error":"Failed to verify subscription plan"} and next() is
 *                 NEVER called. That includes: planService throws or rejects, the user
 *                 or user.id is missing, the services container is missing, and a plan
 *                 row whose tier_level is undefined / null / NaN / non-numeric.
 *
 * The one deliberate hardening over the Express original: there, `tier_level < minTier`
 * with an undefined or NaN tier_level evaluates to false and the request was let
 * THROUGH (fail open). Here an unverifiable tier is a 500, per ADR 6.3 ("Explicitly
 * forbid" falling through on ambiguity). Every legitimate row (tier_level is
 * INT NOT NULL) behaves identically to Express. A numeric string such as "2" is
 * accepted and compared numerically, like the original's `<` coercion.
 *
 * A non-integer minTier passed at registration time throws immediately (at module
 * load / deploy validation, never per request): in Express, requirePlan(undefined)
 * silently gated nothing. Every call site found in src/routes passes a literal 1, 2 or 3.
 *
 * Introspection: the returned middleware is tagged {kind:'plan', minTier} and named
 * "requirePlan(<n>)"; see lib/routes.js listRoutes.
 */
const { getServices } = require('../lib/context');
const { tagMiddleware } = require('../lib/tag');

const TIER_NAMES = {
  1: 'Learn & Build',
  2: 'Tune & Polish',
  3: 'Zero to Hero',
};

/** @returns {number|null} the tier as a finite number, or null if unverifiable */
function verifiedTier(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && /^\s*-?\d+(\.\d+)?\s*$/.test(value)) return Number(value);
  return null;
}

function requirePlan(minTier) {
  if (!Number.isInteger(minTier)) {
    throw new TypeError(`requirePlan(minTier): minTier must be an integer, got ${String(minTier)}`);
  }

  const middleware = async (c, next) => {
    let userPlan;
    let allowed;
    try {
      const user = c.get('user');
      if (!user || user.id === undefined || user.id === null) {
        throw new Error('requirePlan ran without an authenticated user');
      }
      userPlan = await getServices(c).planService.getUserPlan(user.id);

      if (!userPlan) {
        allowed = false;
      } else {
        const tier = verifiedTier(userPlan.tier_level);
        if (tier === null) throw new Error('subscription plan has an unverifiable tier_level');
        allowed = tier >= minTier;
      }
    } catch (err) {
      console.error('requirePlan error:', err && err.message);
      return c.json({ error: 'Failed to verify subscription plan' }, 500);
    }

    if (!allowed) {
      return c.json(
        {
          error: 'This feature requires a higher subscription plan.',
          code: 'PLAN_UPGRADE_REQUIRED',
          requiredPlan: TIER_NAMES[minTier] || null,
          currentPlan: userPlan ? userPlan.name : null,
        },
        403
      );
    }

    c.set('userPlan', userPlan);
    return next();
  };

  return tagMiddleware(middleware, `requirePlan(${minTier})`, { kind: 'plan', minTier });
}

module.exports = { requirePlan, TIER_NAMES };
