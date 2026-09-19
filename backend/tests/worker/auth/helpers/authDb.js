'use strict';

/**
 * Test db for the auth slice: the shared in-memory fake (tests/worker/helpers/fakeDb.js, read-only
 * for this slice) plus exactly the extra statements the auth / subscriptions / admin routes issue
 * (users, onboarding_responses, the refresh-token logout UPDATE, the admin stats/audit queries).
 * Like the base fake it matches whitespace-normalised SQL and throws on anything unknown, so a query
 * change in a route fails a test instead of silently returning nothing.
 *
 * A behavioural model, not Postgres: it proves route logic against these fakes, NOT SQL correctness.
 */
const bcryptjs = require('bcryptjs');
const { createFakeDb } = require('../../helpers/fakeDb');

const norm = (sql) => sql.replace(/\s+/g, ' ').trim();

function createAuthDb(opts) {
  const db = createFakeDb(opts);
  const baseQuery = db.query.bind(db);
  const basePending = db.pending.bind(db);
  const baseFailWhen = db.failWhen.bind(db);

  db.state.users = [];
  db.state.onboarding_responses = [];
  let userSeq = 0;
  const failures = [];
  const inflight = new Set();
  const res = (rows, rowCount = rows.length) => ({ rows, rowCount });
  const clone = (o) => ({ ...o });
  const ts = () => new Date(db.now);

  const handlers = [
    [/^SELECT id FROM users WHERE email = \$1$/, ([email]) =>
      res(db.state.users.filter((u) => u.email === email).map((u) => ({ id: u.id })))],

    [/^INSERT INTO users \(email, password_hash, github_username, linkedin_url\) VALUES \(\$1, \$2, \$3, \$4\) RETURNING id$/,
      ([email, password_hash, github_username, linkedin_url]) => {
        if (db.state.users.some((u) => u.email === email)) throw new Error('duplicate key value violates unique constraint (email)');
        const row = {
          id: ++userSeq, email, password_hash,
          github_username: github_username === undefined ? null : github_username,
          linkedin_url: linkedin_url === undefined ? null : linkedin_url,
          name: null, role: 'user', onboarding_completed: false, created_at: ts(),
        };
        db.state.users.push(row);
        return res([{ id: row.id }]);
      }],

    [/^SELECT id, email, github_username, linkedin_url, created_at FROM users WHERE id = \$1$/, ([id]) =>
      res(db.state.users.filter((u) => u.id === id).map(({ id: i, email, github_username, linkedin_url, created_at }) =>
        ({ id: i, email, github_username, linkedin_url, created_at })))],

    [/^SELECT \* FROM users WHERE email = \$1$/, ([email]) => res(db.state.users.filter((u) => u.email === email).map(clone))],

    [/^SELECT role FROM users WHERE id = \$1$/, ([id]) =>
      res(db.state.users.filter((u) => u.id === id).map((u) => ({ role: u.role })))],

    [/^UPDATE users SET role = \$1 WHERE id = \$2 RETURNING id$/, ([role, id]) => {
      const hit = db.state.users.filter((u) => u.id === id);
      hit.forEach((u) => { u.role = role; });
      return res(hit.map((u) => ({ id: u.id })));
    }],

    [/^UPDATE users SET onboarding_completed = true WHERE id = \$1$/, ([id]) => {
      const hit = db.state.users.filter((u) => u.id === id);
      hit.forEach((u) => { u.onboarding_completed = true; });
      return res([], hit.length);
    }],

    [/^SELECT onboarding_completed FROM users WHERE id = \$1$/, ([id]) =>
      res(db.state.users.filter((u) => u.id === id).map((u) => ({ onboarding_completed: u.onboarding_completed })))],

    [/^INSERT INTO onboarding_responses \(user_id, career_goal, experience_level, pain_points, field_of_interest, recommended_plan_id\) VALUES \(\$1, \$2, \$3, \$4, \$5, \$6\) ON CONFLICT \(user_id\) DO UPDATE SET career_goal = \$2, experience_level = \$3, pain_points = \$4, field_of_interest = \$5, recommended_plan_id = \$6 RETURNING \*$/,
      ([user_id, career_goal, experience_level, pain_points, field_of_interest, recommended_plan_id]) => {
        let row = db.state.onboarding_responses.find((r) => r.user_id === user_id);
        const next = { user_id, career_goal, experience_level, pain_points, field_of_interest, recommended_plan_id };
        if (row) Object.assign(row, next); else db.state.onboarding_responses.push((row = next));
        return res([clone(row)]);
      }],

    [/^UPDATE user_sessions SET revoked_at = CURRENT_TIMESTAMP WHERE refresh_token_hash = \$1 AND revoked_at IS NULL$/, ([hash]) => {
      const hit = db.state.user_sessions.filter((s) => s.refresh_token_hash === hash && s.revoked_at == null);
      hit.forEach((s) => { s.revoked_at = ts(); });
      return res([], hit.length);
    }],

    // ---- admin ----
    [/^SELECT COUNT\(\*\) as total_users FROM users$/, () => res([{ total_users: String(db.state.users.length) }])],
    [/^SELECT COUNT\(\*\) as active_admins FROM users WHERE role = \$1$/, ([role]) =>
      res([{ active_admins: String(db.state.users.filter((u) => u.role === role).length) }])],
    [/^SELECT COUNT\(\*\) as total_logs FROM audit_logs$/, () => res([{ total_logs: String(db.state.audit_logs.length) }])],
    [/^SELECT COUNT\(\*\) as recent_logs FROM audit_logs WHERE created_at >= NOW\(\) - INTERVAL '1 day'$/, () =>
      res([{ recent_logs: String(db.state.audit_logs.filter((l) => !l.created_at || l.created_at.getTime() >= db.now - 86400000).length) }])],
    [/^SELECT id, name, email, role, created_at FROM users ORDER BY created_at DESC$/, () =>
      res([...db.state.users].sort((a, b) => b.created_at - a.created_at).map(({ id, name, email, role, created_at }) => ({ id, name, email, role, created_at })))],
    [/^SELECT a\.id, a\.user_id, u\.name as user_name, u\.email as user_email, a\.action, a\.resource, a\.details, a\.ip_address, a\.created_at FROM audit_logs a LEFT JOIN users u ON a\.user_id = u\.id( WHERE a\.user_id = \$1)? ORDER BY a\.created_at DESC LIMIT 100$/,
      (params, sql) => {
        const filtered = / WHERE a\.user_id = \$1 /.test(sql);
        let rows = [...db.state.audit_logs];
        if (filtered) rows = rows.filter((l) => String(l.user_id) === String(params[0]));
        rows.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
        return res(rows.slice(0, 100).map((l) => {
          const u = db.state.users.find((x) => x.id === l.user_id);
          return {
            id: l.id, user_id: l.user_id, user_name: u ? u.name : null, user_email: u ? u.email : null,
            action: l.action, resource: l.resource, details: l.details, ip_address: l.ip_address, created_at: l.created_at,
          };
        }));
      }],
  ];

  db.failWhen = (matcher, error) => {
    failures.push({ matcher, error });
    baseFailWhen(matcher, error);
  };

  db.query = (text, params = []) => {
    const sql = norm(text);
    const handler = handlers.find(([re]) => re.test(sql));
    if (!handler) return baseQuery(text, params);
    db.calls.push({ sql, params });
    const p = (async () => {
      await Promise.resolve();
      const failure = failures.find((f) => f.matcher(sql));
      if (failure) throw failure.error;
      return handler[1](params, sql);
    })();
    inflight.add(p);
    const done = () => inflight.delete(p);
    p.then(done, done);
    return p;
  };

  db.pending = async () => {
    do {
      await basePending();
      while (inflight.size) await Promise.allSettled([...inflight]);
    } while (inflight.size);
  };

  /**
   * Insert a user. `password` is hashed with bcryptjs at cost 4 (fast; cost is irrelevant to the
   * logic under test). Pass `passwordHash` to store a specific (e.g. malformed) hash verbatim.
   */
  db.seedUser = ({ email, password, passwordHash, role = 'user', name = null, onboardingCompleted = false, github_username = null, linkedin_url = null } = {}) => {
    const row = {
      id: ++userSeq, email,
      password_hash: passwordHash !== undefined ? passwordHash : bcryptjs.hashSync(password, 4),
      github_username, linkedin_url, name, role, onboarding_completed: onboardingCompleted, created_at: ts(),
    };
    db.state.users.push(row);
    return row;
  };

  return db;
}

module.exports = { createAuthDb, norm };
