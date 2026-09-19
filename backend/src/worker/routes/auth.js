'use strict';

/**
 * Worker port of backend/src/routes/auth.js (8 endpoints).   (T3A, ADR-001 sections 4.2, 6.1, 6.2)
 * Highest-risk slice: identity, single-active-device sessions and JWT issuance live here.
 *
 *   POST   /signup           public   (joi validation, 201 {user, token, refreshToken, session})
 *   POST   /login            public   (one active device; replaceDevice:true takes over; ACCOUNT_IN_USE 409)
 *   POST   /refresh          public   (refresh token -> new access token, SESSION_SUPERSEDED 401)
 *   POST   /logout           public   (access token first, refreshToken fallback when it is expired/invalid)
 *   POST   /logout-all       authenticateToken
 *   GET    /sessions         authenticateToken
 *   DELETE /sessions/:sessionId  authenticateToken
 *   GET    /me               authenticateToken
 *
 * Every status code, response body, error message and joi message is the Express one, byte for byte.
 * Preserved on purpose (do not "fix" here; see docs/migration/wave/auth.md):
 *   - a missing/non-JSON body makes the handler destructure `undefined`: TypeError -> masked 500
 *     (signup, login, refresh and logout all behave like that on Express 5)
 *   - login answers an unknown email AND a wrong password with the same 400 "Invalid credentials"
 *     (400, not 401)
 *   - logout swallows ANY failure of the access-token path (bad/expired token, and also a failing
 *     revokeSession) and falls through to the refreshToken path
 *   - logout with no usable token/refreshToken still answers {success:true}
 *   - the deviceName handed to the session comes from the RAW parsed body, not the joi-validated copy
 *   - signup/login/refresh/logout are public; authRateLimit() is mounted on /api/auth/* (mounts/auth.js)
 *
 * Forced by the platform (each documented in the notes file):
 *   - bcrypt -> bcryptjs behind lib/password.js. Native bcrypt.compare returned false for a
 *     malformed stored hash string; bcryptjs THROWS (spike S7), so verifyPassword() below turns
 *     that into false for string hashes, keeping the Express 400 "Invalid credentials". A
 *     null/non-string stored hash still throws (native rejected too) -> masked 500 like Express.
 *   - client IP: getClientIp(c) (CF-Connecting-IP) instead of the Express socket address. This
 *     drives sessionService's single-active-device `sameDevice` check (ADR 4.2, checklist item 7).
 *   - JWT via lib/jwt.js (HS256 pinned), refresh-token hashing via sessionService.hashToken.
 */
const Joi = require('joi');
const { createRouter } = require('../lib/routes');
const { authenticateToken } = require('../middleware/auth');
const { getConfig, getServices } = require('../lib/context');
const { getDb } = require('../db');
const { getBody, getClientIp } = require('../lib/http');
const jwt = require('../lib/jwt');
const passwords = require('../lib/password');
const { hashToken } = require('../services/sessionService');

const router = createRouter();

const signupSchema = Joi.object({
  email: Joi.string().email().max(255).required(),
  password: Joi.string().min(8).max(128).required(),
  github_username: Joi.string().max(39).pattern(/^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i).allow('', null),
  linkedin_url: Joi.string().uri().max(500).allow('', null),
  deviceName: Joi.string().max(100).allow('', null),
});

const loginSchema = Joi.object({
  email: Joi.string().email().max(255).required(),
  password: Joi.string().max(128).required(),
  replaceDevice: Joi.boolean(),
  deviceName: Joi.string().max(100).allow('', null),
});

function sanitizeUser(user) {
  const { password_hash, ...safe } = user;
  return safe;
}

function getRequestMeta(c) {
  const body = getBody(c);
  return {
    userAgent: c.req.header('user-agent'),
    ipAddress: getClientIp(c),
    deviceName: body?.deviceName,
  };
}

/**
 * bcrypt.compare with native semantics for a malformed stored hash. Native bcrypt returned false
 * for a malformed hash STRING (e.g. wrong length, bad prefix or cost) and rejected for a
 * null/undefined/non-string hash. bcryptjs throws for the first group, so only string hashes are
 * mapped to false here; anything else keeps throwing (-> masked 500, as on Express).
 */
async function verifyPassword(plain, storedHash) {
  try {
    return await passwords.compare(plain, storedHash);
  } catch (err) {
    if (typeof storedHash === 'string') return false;
    throw err;
  }
}

/** Same body as Express handleAccountInUse; anything else is rethrown (Express next(err)). */
function accountInUseResponse(c, err) {
  if (err && err.code === 'ACCOUNT_IN_USE') {
    return c.json(
      {
        error: err.message,
        code: 'ACCOUNT_IN_USE',
        activeSession: err.activeSession,
      },
      409
    );
  }
  throw err;
}

// Signup
router.post('/signup', async (c) => {
  try {
    const { error: validationError, value } = signupSchema.validate(getBody(c), { stripUnknown: true });
    if (validationError) {
      return c.json({ error: validationError.details[0].message }, 400);
    }
    const { email, password, github_username, linkedin_url } = value;

    const db = getDb(c);
    const { sessionService } = getServices(c);

    const existingResult = await db.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existingResult.rows.length > 0) {
      return c.json({ error: 'User already exists' }, 400);
    }

    const password_hash = await passwords.hash(password);

    const result = await db.query(
      'INSERT INTO users (email, password_hash, github_username, linkedin_url) VALUES ($1, $2, $3, $4) RETURNING id',
      [email, password_hash, github_username, linkedin_url]
    );

    const userId = result.rows[0].id;
    const newUserResult = await db.query(
      'SELECT id, email, github_username, linkedin_url, created_at FROM users WHERE id = $1',
      [userId]
    );
    const user = newUserResult.rows[0];

    const session = await sessionService.createSession(user.id, getRequestMeta(c));

    return c.json(
      {
        user,
        token: session.accessToken,
        refreshToken: session.refreshToken,
        session: session.session,
      },
      201
    );
  } catch (err) {
    return accountInUseResponse(c, err);
  }
});

// Login: one active device per account (pass replaceDevice: true to take over)
router.post('/login', async (c) => {
  try {
    const { error: validationError, value } = loginSchema.validate(getBody(c), { stripUnknown: true });
    if (validationError) {
      return c.json({ error: 'Invalid credentials' }, 400);
    }
    const { email, password, replaceDevice } = value;

    const db = getDb(c);
    const { sessionService } = getServices(c);

    const result = await db.query('SELECT * FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0) {
      return c.json({ error: 'Invalid credentials' }, 400);
    }

    const user = result.rows[0];
    const validPassword = await verifyPassword(password, user.password_hash);
    if (!validPassword) {
      return c.json({ error: 'Invalid credentials' }, 400);
    }

    const session = await sessionService.createSession(
      user.id,
      getRequestMeta(c),
      { replaceExisting: !!replaceDevice }
    );

    return c.json({
      user: sanitizeUser(user),
      token: session.accessToken,
      refreshToken: session.refreshToken,
      session: session.session,
    });
  } catch (err) {
    return accountInUseResponse(c, err);
  }
});

// Refresh access token (per-device session)
router.post('/refresh', async (c) => {
  const { refreshToken } = getBody(c);
  if (!refreshToken) {
    return c.json({ error: 'Refresh token required' }, 400);
  }

  const { sessionService } = getServices(c);
  const refreshed = await sessionService.refreshSession(refreshToken);
  if (!refreshed) {
    return c.json(
      {
        error: 'This account was signed in on another device. Sign in again to use JobTune on this device.',
        code: 'SESSION_SUPERSEDED',
      },
      401
    );
  }

  return c.json({
    token: refreshed.accessToken,
    session: refreshed.session,
  });
});

// Logout current session (accepts optional refreshToken as fallback when access token is expired)
router.post('/logout', async (c) => {
  const { refreshToken } = getBody(c);
  const { sessionService } = getServices(c);

  // Try access token first
  const authHeader = c.req.header('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    try {
      const decoded = await jwt.verify(token, getConfig(c).jwtSecret);
      if (decoded.sessionId) {
        await sessionService.revokeSession(decoded.sessionId, decoded.id);
        return c.json({ success: true });
      }
    } catch {
      // Token expired or invalid: fall through to refreshToken path
    }
  }

  // Fallback: revoke via refresh token
  if (refreshToken) {
    const hash = hashToken(refreshToken);
    await getDb(c).query(
      'UPDATE user_sessions SET revoked_at = CURRENT_TIMESTAMP WHERE refresh_token_hash = $1 AND revoked_at IS NULL',
      [hash]
    );
  }

  return c.json({ success: true });
});

// Logout all other devices
router.post('/logout-all', authenticateToken, async (c) => {
  const user = c.get('user');
  await getServices(c).sessionService.revokeAllSessions(user.id, user.sessionId);
  return c.json({ success: true });
});

// List active sessions for this user
router.get('/sessions', authenticateToken, async (c) => {
  const user = c.get('user');
  const sessions = await getServices(c).sessionService.listSessions(user.id);
  return c.json({
    sessions: sessions.map((s) => ({
      id: s.id,
      deviceName: s.device_name,
      userAgent: s.user_agent,
      ipAddress: s.ip_address,
      lastActiveAt: s.last_active_at,
      expiresAt: s.expires_at,
      createdAt: s.created_at,
      isCurrent: s.id === user.sessionId,
    })),
  });
});

// Revoke a specific session (remote sign-out)
router.delete('/sessions/:sessionId', authenticateToken, async (c) => {
  const sessionId = Number(c.req.param('sessionId'));
  if (!sessionId) {
    return c.json({ error: 'Invalid session id' }, 400);
  }
  await getServices(c).sessionService.revokeSession(sessionId, c.get('user').id);
  return c.json({ success: true });
});

// Get Current User
router.get('/me', authenticateToken, async (c) => {
  const user = c.get('user');
  const result = await getDb(c).query(
    'SELECT id, email, github_username, linkedin_url, created_at FROM users WHERE id = $1',
    [user.id]
  );
  if (result.rows.length === 0) {
    return c.json({ error: 'User not found' }, 404);
  }
  return c.json({
    user: result.rows[0],
    sessionId: user.sessionId || null,
  });
});

module.exports = router;
