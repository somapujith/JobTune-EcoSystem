'use strict';

/**
 * Password hashing behind a stable seam (ADR-001 section 6.1, spike S7).
 *
 * Express used native `bcrypt` (routes/auth.js: genSalt(10) + hash; compare).
 * Workers cannot load native addons, so this wraps `bcryptjs`, which produces and
 * verifies the same $2b$ format. Route ports must call ONLY these two functions
 * and never require bcryptjs directly, so the implementation can change in one file.
 *
 * NOT YET PROVEN (blocking per ADR 6.1): bcryptjs verifies real production bcrypt
 * hashes AND hashes it produces verify under native bcrypt (rollback safety). That
 * is spike S7 and checklist item 9; nothing here demonstrates it.
 *
 * Operational note: pure-JS bcrypt at cost 10 is CPU heavy. Workers' free plan CPU
 * limit is far below one hash; this needs a plan with the higher CPU limit.
 *
 * Note: services/sessionService.js in Express imported bcrypt but never used it
 * (the only call sites are routes/auth.js), so the ported sessionService does not
 * depend on this module; the auth route port (T3A) is its first consumer.
 */
const bcrypt = require('bcryptjs');

const SALT_ROUNDS = 10; // same cost factor as routes/auth.js

async function hash(password) {
  const salt = await bcrypt.genSalt(SALT_ROUNDS);
  return bcrypt.hash(password, salt);
}

async function compare(password, passwordHash) {
  return bcrypt.compare(password, passwordHash);
}

module.exports = { hash, compare, SALT_ROUNDS };
