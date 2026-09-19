'use strict';

/**
 * In-memory fake of the request-scoped db (query surface only), just enough SQL for
 * the Phase 1 worker code: user_sessions, audit_logs, subscription_plans,
 * user_subscriptions, plan_orders. It matches the EXACT statements the services
 * issue (whitespace-normalised) and throws on anything else, so a query change in
 * a service fails a test loudly instead of silently returning nothing.
 *
 * It is a behavioural model, not Postgres: it proves service logic (IP comparison,
 * revocation, tier gating inputs), NOT SQL correctness, driver behaviour, or anything
 * about the Workers runtime.
 *
 * Extras for tests:
 *   db.state          the tables (arrays of row objects)
 *   db.calls          [{ sql, params }] in order
 *   db.now / db.setNow(ms)   the clock behind CURRENT_TIMESTAMP
 *   db.failWhen(fn, err)     reject queries whose normalised sql matches fn(sql)
 *   db.released       true after release() (Promise-returning, mirrors createRequestDb)
 *   db.pending()      resolves when every issued query has settled
 */

const norm = (sql) => sql.replace(/\s+/g, ' ').trim();

function createFakeDb({ now: initialNow = Date.now() } = {}) {
  let clock = initialNow;
  const state = {
    user_sessions: [],
    audit_logs: [],
    subscription_plans: [],
    user_subscriptions: [],
    plan_orders: [],
  };
  const seq = { user_sessions: 0, audit_logs: 0, plan_orders: 0 };
  const calls = [];
  const failures = [];
  const inflight = new Set();

  const ts = () => new Date(clock);
  const live = (s) => s.revoked_at == null && s.expires_at.getTime() > clock;
  const pick = (row, cols) => Object.fromEntries(cols.map((c) => [c, row[c]]));
  const res = (rows, rowCount = rows.length) => ({ rows, rowCount });

  const handlers = [
    // ---- user_sessions -------------------------------------------------------
    [
      /^SELECT id, device_name, ip_address, last_active_at, created_at FROM user_sessions WHERE user_id = \$1 AND revoked_at IS NULL AND expires_at > CURRENT_TIMESTAMP ORDER BY last_active_at DESC LIMIT 1$/,
      ([userId]) => {
        const rows = state.user_sessions
          .filter((s) => s.user_id === userId && live(s))
          .sort((a, b) => b.last_active_at - a.last_active_at)
          .slice(0, 1)
          .map((s) => pick(s, ['id', 'device_name', 'ip_address', 'last_active_at', 'created_at']));
        return res(rows);
      },
    ],
    [
      /^INSERT INTO user_sessions \(user_id, refresh_token_hash, device_name, user_agent, ip_address, expires_at\) VALUES \(\$1, \$2, \$3, \$4, \$5, \$6\) RETURNING id, expires_at, device_name, created_at$/,
      ([user_id, refresh_token_hash, device_name, user_agent, ip_address, expires_at]) => {
        if (state.user_sessions.some((s) => s.refresh_token_hash === refresh_token_hash)) {
          throw new Error('duplicate key value violates unique constraint (refresh_token_hash)');
        }
        const row = {
          id: ++seq.user_sessions,
          user_id, refresh_token_hash, device_name, user_agent, ip_address, expires_at,
          last_active_at: ts(), revoked_at: null, created_at: ts(),
        };
        state.user_sessions.push(row);
        return res([pick(row, ['id', 'expires_at', 'device_name', 'created_at'])]);
      },
    ],
    [
      /^UPDATE user_sessions SET last_active_at = CURRENT_TIMESTAMP WHERE id = \$1 AND revoked_at IS NULL$/,
      ([id]) => {
        const hit = state.user_sessions.filter((s) => s.id === Number(id) && s.revoked_at == null);
        hit.forEach((s) => { s.last_active_at = ts(); });
        return res([], hit.length);
      },
    ],
    [
      /^SELECT id FROM user_sessions WHERE id = \$1 AND revoked_at IS NULL AND expires_at > CURRENT_TIMESTAMP$/,
      ([id]) => res(state.user_sessions.filter((s) => s.id === Number(id) && live(s)).map((s) => ({ id: s.id }))),
    ],
    [
      /^SELECT id, user_id, device_name, expires_at FROM user_sessions WHERE refresh_token_hash = \$1 AND revoked_at IS NULL AND expires_at > CURRENT_TIMESTAMP$/,
      ([hash]) =>
        res(
          state.user_sessions
            .filter((s) => s.refresh_token_hash === hash && live(s))
            .map((s) => pick(s, ['id', 'user_id', 'device_name', 'expires_at']))
        ),
    ],
    [
      /^UPDATE user_sessions SET revoked_at = CURRENT_TIMESTAMP WHERE id = \$1 AND user_id = \$2$/,
      ([id, userId]) => {
        const hit = state.user_sessions.filter((s) => s.id === id && s.user_id === userId);
        hit.forEach((s) => { s.revoked_at = ts(); });
        return res([], hit.length);
      },
    ],
    [
      /^UPDATE user_sessions SET revoked_at = CURRENT_TIMESTAMP WHERE user_id = \$1 AND id != \$2 AND revoked_at IS NULL$/,
      ([userId, except]) => {
        const hit = state.user_sessions.filter((s) => s.user_id === userId && s.id !== except && s.revoked_at == null);
        hit.forEach((s) => { s.revoked_at = ts(); });
        return res([], hit.length);
      },
    ],
    [
      /^UPDATE user_sessions SET revoked_at = CURRENT_TIMESTAMP WHERE user_id = \$1 AND revoked_at IS NULL$/,
      ([userId]) => {
        const hit = state.user_sessions.filter((s) => s.user_id === userId && s.revoked_at == null);
        hit.forEach((s) => { s.revoked_at = ts(); });
        return res([], hit.length);
      },
    ],
    [
      /^SELECT id, device_name, user_agent, ip_address, last_active_at, expires_at, created_at, revoked_at FROM user_sessions WHERE user_id = \$1 AND revoked_at IS NULL AND expires_at > CURRENT_TIMESTAMP ORDER BY last_active_at DESC$/,
      ([userId]) =>
        res(
          state.user_sessions
            .filter((s) => s.user_id === userId && live(s))
            .sort((a, b) => b.last_active_at - a.last_active_at)
            .map((s) => pick(s, ['id', 'device_name', 'user_agent', 'ip_address', 'last_active_at', 'expires_at', 'created_at', 'revoked_at']))
        ),
    ],

    // ---- audit_logs ----------------------------------------------------------
    [
      /^INSERT INTO audit_logs \(user_id, action, resource, details, ip_address\) VALUES \(\$1, \$2, \$3, \$4, \$5\)$/,
      ([user_id, action, resource, details, ip_address]) => {
        state.audit_logs.push({ id: ++seq.audit_logs, user_id, action, resource, details, ip_address });
        return res([], 1);
      },
    ],

    // ---- plans ---------------------------------------------------------------
    [
      /^SELECT \* FROM subscription_plans ORDER BY tier_level$/,
      () => res([...state.subscription_plans].sort((a, b) => a.tier_level - b.tier_level)),
    ],
    [
      /^SELECT \* FROM subscription_plans WHERE id = \$1$/,
      ([id]) => res(state.subscription_plans.filter((p) => p.id === id)),
    ],
    [
      /^SELECT \* FROM subscription_plans WHERE name = \$1$/,
      ([name]) => res(state.subscription_plans.filter((p) => p.name === name)),
    ],
    [
      /^SELECT sp\.\* FROM subscription_plans sp JOIN user_subscriptions us ON sp\.id = us\.plan_id WHERE us\.user_id = \$1$/,
      ([userId]) => {
        const sub = state.user_subscriptions.find((u) => u.user_id === userId);
        return res(sub ? state.subscription_plans.filter((p) => p.id === sub.plan_id) : []);
      },
    ],
    [
      /^INSERT INTO user_subscriptions \(user_id, plan_id\) VALUES \(\$1, \$2\) ON CONFLICT \(user_id\) DO UPDATE SET plan_id = \$2 RETURNING \*$/,
      ([user_id, plan_id]) => {
        let row = state.user_subscriptions.find((u) => u.user_id === user_id);
        if (row) row.plan_id = plan_id;
        else state.user_subscriptions.push((row = { user_id, plan_id }));
        return res([{ ...row }]);
      },
    ],
    [
      /^INSERT INTO plan_orders \(order_ref, user_id, plan_id, amount, status\) VALUES \(\$1, \$2, \$3, \$4, \$5\) RETURNING \*$/,
      ([order_ref, user_id, plan_id, amount, status]) => {
        const row = { id: ++seq.plan_orders, order_ref, user_id, plan_id, amount, status, paid_at: null };
        state.plan_orders.push(row);
        return res([{ ...row }]);
      },
    ],
    [
      /^SELECT \* FROM plan_orders WHERE order_ref = \$1$/,
      ([ref]) => res(state.plan_orders.filter((o) => o.order_ref === ref).map((o) => ({ ...o }))),
    ],
    [
      /^UPDATE plan_orders SET status = 'paid', paid_at = CURRENT_TIMESTAMP WHERE order_ref = \$1 AND status = 'pending' RETURNING \*$/,
      ([ref]) => {
        const hit = state.plan_orders.filter((o) => o.order_ref === ref && o.status === 'pending');
        hit.forEach((o) => { o.status = 'paid'; o.paid_at = ts(); });
        return res(hit.map((o) => ({ ...o })));
      },
    ],
  ];

  const db = {
    state,
    calls,
    get now() { return clock; },
    setNow(ms) { clock = ms; },
    released: false,

    failWhen(matcher, error) {
      failures.push({ matcher, error });
    },

    query(text, params = []) {
      const sql = norm(text);
      calls.push({ sql, params });
      const p = (async () => {
        await Promise.resolve();
        const failure = failures.find((f) => f.matcher(sql));
        if (failure) throw failure.error;
        const handler = handlers.find(([re]) => re.test(sql));
        if (!handler) throw new Error(`FakeDb: unsupported SQL: ${sql}`);
        return handler[1](params);
      })();
      inflight.add(p);
      const done = () => inflight.delete(p);
      p.then(done, done);
      return p;
    },

    async pending() {
      while (inflight.size) await Promise.allSettled([...inflight]);
    },

    async release() {
      await db.pending();
      db.released = true;
    },
  };
  return db;
}

module.exports = { createFakeDb };
