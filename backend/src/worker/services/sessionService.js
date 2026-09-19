'use strict';

/**
 * Worker port of backend/src/services/sessionService.js (ported from git HEAD 38d8130a).
 * (T2.1, ADR-001 sections 4.2, 6.2)
 *
 * Every method name, signature, return shape and error code of the original is
 * preserved, including:
 *   - ACCOUNT_IN_USE error (code + activeSession) from createSession
 *   - the `sameDevice` IP comparison (original line 70), which drives
 *     single-active-device enforcement. `ipAddress` must come from
 *     lib/http.js getClientIp() (CF-Connecting-IP). See that function for the
 *     Vercel-proxy fail-open risk. This service does not decide where the IP
 *     comes from; it only compares what it is given.
 *   - refresh-token hashing (sha256 hex) and 48-byte hex refresh tokens
 *
 * Differences from the original (all mechanical, none semantic):
 *   - factory `createSessionService({ db, config })` instead of a singleton
 *     bound to a module-level pg pool and module-scope config reads.
 *     TTL / refresh days / JWT secret come from the frozen config.
 *   - methods are closures, not class methods: they are safe to destructure.
 *   - jsonwebtoken is reached through lib/jwt.js (async, HS256 pinned).
 *   - the boot-time schema bootstrap method is intentionally NOT ported
 *     (ADR 6.5: the schema already exists in Neon; DDL must never run on a Worker).
 *   - the unused `bcrypt` import of the original is dropped (it never called it).
 *
 * `crypto` is Node's, provided under the nodejs_compat flag (ADR spike S10 covers
 * proving sha256 / randomBytes parity in workerd).
 */
const crypto = require('node:crypto');
const jwt = require('../lib/jwt');

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function parseDeviceName(userAgent = '') {
  if (/mobile/i.test(userAgent)) return 'Mobile device';
  if (/tablet/i.test(userAgent)) return 'Tablet';
  if (/windows/i.test(userAgent)) return 'Windows';
  if (/macintosh|mac os/i.test(userAgent)) return 'Mac';
  if (/linux/i.test(userAgent)) return 'Linux';
  return 'Unknown device';
}

/**
 * @param {{ db: { query: Function }, config: { jwtSecret: string, accessTokenTtl: string, refreshTokenDays: number } }} deps
 */
function createSessionService({ db, config }) {
  if (!db || typeof db.query !== 'function') throw new TypeError('createSessionService requires a db with query()');
  if (!config || !config.jwtSecret) throw new TypeError('createSessionService requires a config with jwtSecret');

  async function getActiveSession(userId) {
    const result = await db.query(
      `SELECT id, device_name, ip_address, last_active_at, created_at
       FROM user_sessions
       WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > CURRENT_TIMESTAMP
       ORDER BY last_active_at DESC
       LIMIT 1`,
      [userId]
    );
    return result.rows[0] || null;
  }

  async function revokeSession(sessionId, userId) {
    await db.query(
      'UPDATE user_sessions SET revoked_at = CURRENT_TIMESTAMP WHERE id = $1 AND user_id = $2',
      [sessionId, userId]
    );
  }

  async function revokeAllSessions(userId, exceptSessionId = null) {
    if (exceptSessionId) {
      await db.query(
        `UPDATE user_sessions SET revoked_at = CURRENT_TIMESTAMP
         WHERE user_id = $1 AND id != $2 AND revoked_at IS NULL`,
        [userId, exceptSessionId]
      );
      return;
    }
    await db.query(
      'UPDATE user_sessions SET revoked_at = CURRENT_TIMESTAMP WHERE user_id = $1 AND revoked_at IS NULL',
      [userId]
    );
  }

  async function touchSession(sessionId) {
    if (!sessionId) return;
    await db.query(
      'UPDATE user_sessions SET last_active_at = CURRENT_TIMESTAMP WHERE id = $1 AND revoked_at IS NULL',
      [sessionId]
    );
  }

  async function createSession(userId, { userAgent, ipAddress, deviceName } = {}, { replaceExisting = false } = {}) {
    const existing = await getActiveSession(userId);

    if (existing) {
      const sameDevice = ipAddress && existing.ip_address && existing.ip_address === ipAddress;

      if (!replaceExisting && !sameDevice) {
        const err = new Error('This account is already active on another device.');
        err.code = 'ACCOUNT_IN_USE';
        err.activeSession = {
          deviceName: existing.device_name,
          ipAddress: existing.ip_address,
          lastActiveAt: existing.last_active_at,
          since: existing.created_at,
        };
        throw err;
      }

      // Same device re-login or explicit replace: revoke old sessions before creating new one
      await revokeAllSessions(userId);
    }

    const refreshToken = crypto.randomBytes(48).toString('hex');
    const refreshTokenHash = hashToken(refreshToken);
    const expiresAt = new Date(Date.now() + config.refreshTokenDays * 24 * 60 * 60 * 1000);

    const result = await db.query(
      `INSERT INTO user_sessions (user_id, refresh_token_hash, device_name, user_agent, ip_address, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, expires_at, device_name, created_at`,
      [
        userId,
        refreshTokenHash,
        deviceName || parseDeviceName(userAgent),
        userAgent || null,
        ipAddress || null,
        expiresAt,
      ]
    );

    const session = result.rows[0];
    const accessToken = await jwt.sign(
      { id: userId, sessionId: session.id },
      config.jwtSecret,
      { expiresIn: config.accessTokenTtl }
    );

    return {
      accessToken,
      refreshToken,
      session: {
        id: session.id,
        deviceName: session.device_name,
        expiresAt: session.expires_at,
        createdAt: session.created_at,
      },
    };
  }

  async function isSessionActive(sessionId) {
    if (!sessionId || !Number.isInteger(Number(sessionId))) return false;
    const result = await db.query(
      `SELECT id FROM user_sessions
       WHERE id = $1 AND revoked_at IS NULL AND expires_at > CURRENT_TIMESTAMP`,
      [sessionId]
    );
    return result.rows.length > 0;
  }

  async function refreshSession(refreshToken) {
    const refreshTokenHash = hashToken(refreshToken);
    const result = await db.query(
      `SELECT id, user_id, device_name, expires_at
       FROM user_sessions
       WHERE refresh_token_hash = $1 AND revoked_at IS NULL AND expires_at > CURRENT_TIMESTAMP`,
      [refreshTokenHash]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const session = result.rows[0];
    const accessToken = await jwt.sign(
      { id: session.user_id, sessionId: session.id },
      config.jwtSecret,
      { expiresIn: config.accessTokenTtl }
    );

    await touchSession(session.id);

    return {
      accessToken,
      session: {
        id: session.id,
        deviceName: session.device_name,
        expiresAt: session.expires_at,
      },
    };
  }

  async function listSessions(userId) {
    const result = await db.query(
      `SELECT id, device_name, user_agent, ip_address, last_active_at, expires_at, created_at, revoked_at
       FROM user_sessions
       WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > CURRENT_TIMESTAMP
       ORDER BY last_active_at DESC`,
      [userId]
    );
    return result.rows;
  }

  return {
    getActiveSession,
    createSession,
    touchSession,
    isSessionActive,
    refreshSession,
    revokeSession,
    revokeAllSessions,
    listSessions,
  };
}

module.exports = { createSessionService, hashToken, parseDeviceName };
