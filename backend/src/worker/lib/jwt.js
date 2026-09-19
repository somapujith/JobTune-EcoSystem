'use strict';

/**
 * JWT sign/verify behind a stable seam (ADR-001 spike S9).
 *
 * Currently backed by `jsonwebtoken`, exactly as the Express backend. The API is
 * ASYNC on purpose so that swapping to `jose` (which is async / WebCrypto based)
 * is a change to this one file only. Never call jsonwebtoken (or jose) from
 * anywhere else in src/worker/.
 *
 * Algorithm is PINNED to HS256 on both sides. verify() never accepts an `alg`
 * from the token: tokens signed with none/HS384/RS256 are rejected.
 *
 * sign(payload, secret, { expiresIn })  -> Promise<string>
 *   expiresIn uses jsonwebtoken semantics (number = seconds, string = "15m").
 * verify(token, secret)                 -> Promise<claims>  (rejects on any failure)
 */
const jsonwebtoken = require('jsonwebtoken');

const ALGORITHM = 'HS256';

async function sign(payload, secret, { expiresIn } = {}) {
  return jsonwebtoken.sign(payload, secret, { expiresIn, algorithm: ALGORITHM });
}

async function verify(token, secret) {
  return jsonwebtoken.verify(token, secret, { algorithms: [ALGORITHM] });
}

module.exports = { sign, verify, ALGORITHM };
