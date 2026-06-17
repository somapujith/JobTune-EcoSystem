const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const { pool } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const sessionService = require('../services/sessionService');

function sanitizeUser(user) {
  const { password_hash, ...safe } = user;
  return safe;
}

function getRequestMeta(req) {
  return {
    userAgent: req.headers['user-agent'],
    ipAddress: req.ip || req.connection?.remoteAddress,
    deviceName: req.body?.deviceName,
  };
}

function handleAccountInUse(err, res, next) {
  if (err.code === 'ACCOUNT_IN_USE') {
    return res.status(409).json({
      error: err.message,
      code: 'ACCOUNT_IN_USE',
      activeSession: err.activeSession,
    });
  }
  next(err);
}

// Signup
router.post('/signup', async (req, res, next) => {
  try {
    const { email, password, github_username, linkedin_url } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const existingResult = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existingResult.rows.length > 0) {
      return res.status(400).json({ error: 'User already exists' });
    }

    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);

    const result = await pool.query(
      'INSERT INTO users (email, password_hash, github_username, linkedin_url) VALUES ($1, $2, $3, $4) RETURNING id',
      [email, password_hash, github_username, linkedin_url]
    );

    const userId = result.rows[0].id;
    const newUserResult = await pool.query(
      'SELECT id, email, github_username, linkedin_url, created_at FROM users WHERE id = $1',
      [userId]
    );
    const user = newUserResult.rows[0];

    const session = await sessionService.createSession(user.id, getRequestMeta(req));

    res.status(201).json({
      user,
      token: session.accessToken,
      refreshToken: session.refreshToken,
      session: session.session,
    });
  } catch (err) {
    handleAccountInUse(err, res, next);
  }
});

// Login — one active device per account (pass replaceDevice: true to take over)
router.post('/login', async (req, res, next) => {
  try {
    const { email, password, replaceDevice } = req.body;

    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    const user = result.rows[0];
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    const session = await sessionService.createSession(
      user.id,
      getRequestMeta(req),
      { replaceExisting: !!replaceDevice }
    );

    res.json({
      user: sanitizeUser(user),
      token: session.accessToken,
      refreshToken: session.refreshToken,
      session: session.session,
    });
  } catch (err) {
    handleAccountInUse(err, res, next);
  }
});

// Refresh access token (per-device session)
router.post('/refresh', async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ error: 'Refresh token required' });
    }

    const refreshed = await sessionService.refreshSession(refreshToken);
    if (!refreshed) {
      return res.status(401).json({
        error: 'This account was signed in on another device. Sign in again to use JobTune on this device.',
        code: 'SESSION_SUPERSEDED',
      });
    }

    res.json({
      token: refreshed.accessToken,
      session: refreshed.session,
    });
  } catch (err) {
    next(err);
  }
});

// Logout current session (accepts optional refreshToken as fallback when access token is expired)
router.post('/logout', async (req, res, next) => {
  try {
    const { refreshToken } = req.body;

    // Try access token first
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      try {
        const jwt = require('jsonwebtoken');
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        if (decoded.sessionId) {
          await sessionService.revokeSession(decoded.sessionId, decoded.id);
          return res.json({ success: true });
        }
      } catch {
        // Token expired or invalid — fall through to refreshToken path
      }
    }

    // Fallback: revoke via refresh token
    if (refreshToken) {
      const crypto = require('crypto');
      const hash = crypto.createHash('sha256').update(refreshToken).digest('hex');
      await pool.query(
        'UPDATE user_sessions SET revoked_at = CURRENT_TIMESTAMP WHERE refresh_token_hash = $1 AND revoked_at IS NULL',
        [hash]
      );
    }

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// Logout all other devices
router.post('/logout-all', authenticateToken, async (req, res, next) => {
  try {
    await sessionService.revokeAllSessions(req.user.id, req.user.sessionId);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// List active sessions for this user
router.get('/sessions', authenticateToken, async (req, res, next) => {
  try {
    const sessions = await sessionService.listSessions(req.user.id);
    res.json({
      sessions: sessions.map((s) => ({
        id: s.id,
        deviceName: s.device_name,
        userAgent: s.user_agent,
        ipAddress: s.ip_address,
        lastActiveAt: s.last_active_at,
        expiresAt: s.expires_at,
        createdAt: s.created_at,
        isCurrent: s.id === req.user.sessionId,
      })),
    });
  } catch (err) {
    next(err);
  }
});

// Revoke a specific session (remote sign-out)
router.delete('/sessions/:sessionId', authenticateToken, async (req, res, next) => {
  try {
    const sessionId = Number(req.params.sessionId);
    if (!sessionId) {
      return res.status(400).json({ error: 'Invalid session id' });
    }
    await sessionService.revokeSession(sessionId, req.user.id);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// Get Current User
router.get('/me', authenticateToken, async (req, res, next) => {
  try {
    const result = await pool.query(
      'SELECT id, email, github_username, linkedin_url, created_at FROM users WHERE id = $1',
      [req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({
      user: result.rows[0],
      sessionId: req.user.sessionId || null,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
