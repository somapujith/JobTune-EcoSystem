'use strict';

/**
 * A stateful fake of the JobTune auth surface (login, logout, an authenticated probe) for the auth-matrix and plan-gating
 * tests. Two instances share one `store` exactly like Render and Workers share one Neon database. Semantics follow
 * routes/auth.js + sessionService.js + middleware/auth.js (HS256 pinned, exp checked, session revocation, single active
 * session, sameDevice IP comparison, refreshToken logout fallback). `quirks` deliberately break one behaviour so tests can
 * prove the verification scripts notice it.
 */
const crypto = require('crypto');
const { startMock, json } = require('./mockServer');

const SUPERSEDED_MESSAGE = 'This account was signed in on another device. Sign in again to use JobTune on this device.';
const b64u = (buf) => Buffer.from(buf).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');

function signHs256(claims, secret) {
  const head = b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64u(JSON.stringify(claims));
  return `${head}.${body}.${b64u(crypto.createHmac('sha256', secret).update(`${head}.${body}`).digest())}`;
}

/** @returns claims or null */
function verify(token, secret, quirks) {
  const parts = String(token).split('.');
  if (parts.length !== 3) return null;
  let header;
  let claims;
  try {
    header = JSON.parse(Buffer.from(parts[0], 'base64').toString('utf8'));
    claims = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
  } catch (e) { return null; }
  if (header.alg === 'none') {
    if (!quirks.acceptAlgNone) return null;
  } else {
    const hash = { HS256: 'sha256', HS384: 'sha384', HS512: 'sha512' }[header.alg];
    if (!hash || (header.alg !== 'HS256' && !quirks.acceptAnyHmacAlg)) return null; // algorithm pinned to HS256
    const expected = b64u(crypto.createHmac(hash, secret).update(`${parts[0]}.${parts[1]}`).digest());
    if (expected !== parts[2]) return null;
  }
  if (claims.exp && claims.exp < Math.floor(Date.now() / 1000)) return null;
  return claims;
}

function createStore() {
  return { sessions: [], nextId: 1, accessLog: [] };
}

const hashToken = (t) => crypto.createHash('sha256').update(t).digest('hex');

/**
 * @param {object} o
 * @param {object} o.store shared "database"
 * @param {string} o.secret JWT secret of this server
 * @param {boolean} [o.trustIpHeaders] use CF-Connecting-IP / X-Forwarded-For as the client IP (like wrangler dev)
 * @param {object} [o.quirks] acceptAlgNone | acceptAnyHmacAlg | noSessionCheck | noRefreshFallback | ignoreIp
 * @param {string} [o.email] @param {string} [o.password]
 */
async function startFakeAuthServer({ store, secret, trustIpHeaders = false, quirks = {}, email = 'test@example.test', password = 'correct horse battery staple' }) {
  const active = () => store.sessions.filter((s) => !s.revokedAt && s.expiresAt > Date.now());
  const clientIp = (rec) => {
    if (quirks.ignoreIp) return undefined;
    if (trustIpHeaders) return rec.headers['cf-connecting-ip'] || rec.headers['x-forwarded-for'] || rec.headers.host;
    return '127.0.0.1'; // the socket peer: identical for every request from the test process
  };

  const server = await startMock((rec, _b, res) => {
    const { method, path } = rec;
    if (method === 'POST' && path === '/api/auth/login') {
      const b = rec.json || {};
      if (b.email !== email || b.password !== password) return json(res, 400, { error: 'Invalid credentials' });
      const ip = clientIp(rec);
      const existing = active()[0];
      if (existing) {
        const sameDevice = ip && existing.ip && existing.ip === ip;
        if (!b.replaceDevice && !sameDevice) {
          return json(res, 409, { error: 'This account is already active on another device.', code: 'ACCOUNT_IN_USE', activeSession: { deviceName: 'x', ipAddress: existing.ip } });
        }
        store.sessions.forEach((s) => { if (!s.revokedAt) s.revokedAt = Date.now(); });
      }
      const refreshToken = crypto.randomBytes(48).toString('hex');
      const session = { id: store.nextId++, refreshHash: hashToken(refreshToken), ip, expiresAt: Date.now() + 7 * 864e5, revokedAt: null };
      store.sessions.push(session);
      const now = Math.floor(Date.now() / 1000);
      const token = signHs256({ id: 1, sessionId: session.id, iat: now, exp: now + 900 }, secret);
      return json(res, 200, { user: { id: 1, email }, token, refreshToken, session: { id: session.id } });
    }

    if (method === 'POST' && path === '/api/auth/logout') {
      const auth = rec.headers.authorization;
      if (auth && auth.startsWith('Bearer ')) {
        const claims = verify(auth.slice(7), secret, quirks);
        if (claims && claims.sessionId) {
          const s = store.sessions.find((x) => x.id === claims.sessionId);
          if (s && !s.revokedAt) s.revokedAt = Date.now();
          return json(res, 200, { success: true });
        }
      }
      const rt = rec.json && rec.json.refreshToken;
      if (rt && !quirks.noRefreshFallback) {
        const h = hashToken(rt);
        store.sessions.forEach((s) => { if (s.refreshHash === h && !s.revokedAt) s.revokedAt = Date.now(); });
      }
      return json(res, 200, { success: true });
    }

    if (method === 'GET' && path === '/api/subscriptions/my-plan') {
      const auth = rec.headers.authorization;
      const token = auth && auth.split(' ')[1];
      const claims = token && verify(token, secret, quirks);
      if (!claims) return json(res, 401, { error: 'Unauthorized' });
      if (claims.sessionId && !quirks.noSessionCheck) {
        const s = store.sessions.find((x) => x.id === claims.sessionId);
        if (!s || s.revokedAt || s.expiresAt <= Date.now()) return json(res, 401, { error: SUPERSEDED_MESSAGE, code: 'SESSION_SUPERSEDED' });
      }
      store.accessLog.push({ path, claims });
      return json(res, 200, { plan: null });
    }
    return false;
  });
  return server;
}

module.exports = { startFakeAuthServer, createStore, signHs256, SUPERSEDED_MESSAGE };
