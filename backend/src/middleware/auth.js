const jwt = require('jsonwebtoken');
const sessionService = require('../services/sessionService');

const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (token == null) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const user = jwt.verify(token, process.env.JWT_SECRET);

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
    next();
  } catch (err) {
    console.error('JWT Verify Error:', err.message);
    return res.status(401).json({ error: 'Unauthorized' });
  }
};

module.exports = { authenticateToken };
