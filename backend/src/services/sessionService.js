const crypto = require('crypto');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { pool } = require('../config/database');

const ACCESS_TOKEN_TTL = process.env.ACCESS_TOKEN_TTL || '1h';
const REFRESH_TOKEN_DAYS = Number(process.env.REFRESH_TOKEN_DAYS || 30);

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

class SessionService {
  async ensureTables() {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_sessions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        refresh_token_hash VARCHAR(64) NOT NULL UNIQUE,
        device_name VARCHAR(100),
        user_agent TEXT,
        ip_address VARCHAR(45),
        last_active_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP NOT NULL,
        revoked_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);
      CREATE INDEX IF NOT EXISTS idx_user_sessions_active ON user_sessions(user_id, revoked_at);
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_progress (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        context_key VARCHAR(100) NOT NULL,
        progress_data JSONB NOT NULL DEFAULT '{}',
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, context_key)
      );
      CREATE INDEX IF NOT EXISTS idx_user_progress_user_id ON user_progress(user_id);
    `);
  }

  async getActiveSession(userId) {
    const result = await pool.query(
      `SELECT id, device_name, ip_address, last_active_at, created_at
       FROM user_sessions
       WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > CURRENT_TIMESTAMP
       ORDER BY last_active_at DESC
       LIMIT 1`,
      [userId]
    );
    return result.rows[0] || null;
  }

  async createSession(userId, { userAgent, ipAddress, deviceName } = {}, { replaceExisting = false } = {}) {
    const existing = await this.getActiveSession(userId);

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

      // Same device re-login or explicit replace — revoke old sessions before creating new one
      await this.revokeAllSessions(userId);
    }

    const refreshToken = crypto.randomBytes(48).toString('hex');
    const refreshTokenHash = hashToken(refreshToken);
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000);

    const result = await pool.query(
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
    const accessToken = jwt.sign(
      { id: userId, sessionId: session.id },
      process.env.JWT_SECRET,
      { expiresIn: ACCESS_TOKEN_TTL }
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

  async touchSession(sessionId) {
    if (!sessionId) return;
    await pool.query(
      'UPDATE user_sessions SET last_active_at = CURRENT_TIMESTAMP WHERE id = $1 AND revoked_at IS NULL',
      [sessionId]
    );
  }

  async isSessionActive(sessionId) {
    if (!sessionId) return true;
    const result = await pool.query(
      `SELECT id FROM user_sessions
       WHERE id = $1 AND revoked_at IS NULL AND expires_at > CURRENT_TIMESTAMP`,
      [sessionId]
    );
    return result.rows.length > 0;
  }

  async refreshSession(refreshToken) {
    const refreshTokenHash = hashToken(refreshToken);
    const result = await pool.query(
      `SELECT id, user_id, device_name, expires_at
       FROM user_sessions
       WHERE refresh_token_hash = $1 AND revoked_at IS NULL AND expires_at > CURRENT_TIMESTAMP`,
      [refreshTokenHash]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const session = result.rows[0];
    const accessToken = jwt.sign(
      { id: session.user_id, sessionId: session.id },
      process.env.JWT_SECRET,
      { expiresIn: ACCESS_TOKEN_TTL }
    );

    await this.touchSession(session.id);

    return {
      accessToken,
      session: {
        id: session.id,
        deviceName: session.device_name,
        expiresAt: session.expires_at,
      },
    };
  }

  async revokeSession(sessionId, userId) {
    await pool.query(
      'UPDATE user_sessions SET revoked_at = CURRENT_TIMESTAMP WHERE id = $1 AND user_id = $2',
      [sessionId, userId]
    );
  }

  async revokeAllSessions(userId, exceptSessionId = null) {
    if (exceptSessionId) {
      await pool.query(
        `UPDATE user_sessions SET revoked_at = CURRENT_TIMESTAMP
         WHERE user_id = $1 AND id != $2 AND revoked_at IS NULL`,
        [userId, exceptSessionId]
      );
      return;
    }
    await pool.query(
      'UPDATE user_sessions SET revoked_at = CURRENT_TIMESTAMP WHERE user_id = $1 AND revoked_at IS NULL',
      [userId]
    );
  }

  async listSessions(userId) {
    const result = await pool.query(
      `SELECT id, device_name, user_agent, ip_address, last_active_at, expires_at, created_at, revoked_at
       FROM user_sessions
       WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > CURRENT_TIMESTAMP
       ORDER BY last_active_at DESC`,
      [userId]
    );
    return result.rows;
  }
}

module.exports = new SessionService();
