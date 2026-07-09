const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const sessionService = require('../services/sessionService');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32) {
  console.error('FATAL: JWT_SECRET must be set and at least 32 characters long');
  process.exit(1);
}

const authenticateToken = async (req, res, next) => {
  // Skip re-verification only if THIS middleware already ran earlier in the
  // chain (e.g. mount-level onboardingGate followed by a route that also
  // declares authenticateToken) — never trust req.user set by anything else.
  if (req._authenticatedByJwt) return next();

  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const user = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });

    if (user.sessionId) {
      const active = await sessionService.isSessionActive(user.sessionId);
      if (!active) {
        return res.status(401).json({
          error: 'This account was signed in on another device. Sign in again to use JobTune on this device.',
          code: 'SESSION_SUPERSEDED',
        });
      }
      sessionService.touchSession(user.sessionId).catch(() => {});
    }

    req.user = user;
    req._authenticatedByJwt = true;
    next();
  } catch (err) {
    console.error('JWT Verify Error:', err.message);
    return res.status(401).json({ error: 'Unauthorized' });
  }
};

module.exports = { authenticateToken };
