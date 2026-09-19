'use strict';

/**
 * Test helpers for the "large2" slice (aiCoach + profiles routes, linkedin services).
 * Everything is synthetic: fake db, fake aiClient, stubbed global fetch. Nothing leaves the process.
 * (Copied patterns from tests/worker/helpers/{harness,fakeDb}.js and exampleRoute.test.js, which are read-only for this slice.)
 */
const { createApp } = require('../../../src/worker/app');
const { mountRoutes } = require('../../../src/worker/lib/routes');
const { createServices } = require('../../../src/worker/services');
const { createLinkedinAnalysisStore } = require('../../../src/worker/services/linkedinAnalysisStore');
const { createLinkedinOptimizerService } = require('../../../src/worker/services/linkedinOptimizerService');
const { makeEnv, makeCtx, signToken, seedPlans, createFakeDb } = require('../helpers/harness');

const profilesRouter = require('../../../src/worker/routes/profiles');
const aiCoachRouter = require('../../../src/worker/routes/aiCoach');

const norm = (sql) => sql.replace(/\s+/g, ' ').trim();

/**
 * Verbatim copy of extractJSON from backend/src/utils/aiClient.js (the infra-owned aiClient contract exposes the
 * same function). Kept as a test double so these tests do not depend on the infra slice's port being finished.
 */
function extractJSON(text) {
  const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  const jsonStr = fenceMatch ? fenceMatch[1].trim() : text.trim();

  try {
    return JSON.parse(jsonStr);
  } catch {
    const start = jsonStr.search(/[{[]/);
    if (start === -1) return null;
    const end = jsonStr.lastIndexOf(jsonStr[start] === '{' ? '}' : ']');
    if (end === -1) return null;
    try {
      return JSON.parse(jsonStr.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}

/**
 * Fake aiClient service. `script` is a list of results returned by successive callAI calls
 * (an Error instance in the list makes that call reject). When the script is exhausted callAI answers
 * { ok:false, error:'offline', data:null } (the shape the real client returns when a provider is down).
 */
function makeAi(script = []) {
  const queue = [...script];
  const ai = {
    calls: [],
    callAI: jest.fn(async (options) => {
      ai.calls.push(options);
      const next = queue.length ? queue.shift() : { ok: false, error: 'offline', data: null };
      if (next instanceof Error) throw next;
      return next;
    }),
    extractJSON: jest.fn(extractJSON),
  };
  return ai;
}
const aiOk = (data) => ({ ok: true, error: null, data: typeof data === 'string' ? data : JSON.stringify(data) });

/** SQL the two routers issue (exact statements, whitespace-normalised). */
function installSql(db) {
  Object.assign(db.state, {
    github_analyses: [],
    linkedin_analyses: [],
    code_reviews: [],
    career_coach_sessions: [],
    profiles: [],
    resumes: [],
    projects: [],
    interview_sessions: [],
  });
  const seq = { github_analyses: 0, linkedin_analyses: 0, code_reviews: 0, career_coach_sessions: 0 };
  const broken = new Set();
  const realQuery = db.query.bind(db);
  const rows = (r, rowCount = r.length) => ({ rows: r, rowCount });

  const handlers = [
    [/^INSERT INTO github_analyses \(user_id, username, overall_score, grade, report\) VALUES \(\$1, \$2, \$3, \$4, \$5\) RETURNING id$/, 'github_analyses',
      ([user_id, username, overall_score, grade, report]) => {
        const row = { id: ++seq.github_analyses, user_id, username, overall_score, grade, report, created_at: new Date(1000 + seq.github_analyses) };
        db.state.github_analyses.push(row);
        return rows([{ id: row.id }]);
      }],
    [/^SELECT id, username, overall_score, grade, created_at FROM github_analyses WHERE user_id = \$1 ORDER BY created_at DESC LIMIT 5$/, 'github_analyses',
      ([uid]) => rows(db.state.github_analyses.filter((r) => r.user_id === uid).sort((a, b) => b.created_at - a.created_at).slice(0, 5)
        .map(({ id, username, overall_score, grade, created_at }) => ({ id, username, overall_score, grade, created_at })))],

    [/^INSERT INTO linkedin_analyses \(user_id, profile_url, target_roles, overall_score, grade, ai_powered, report\) VALUES \(\$1, \$2, \$3, \$4, \$5, \$6, \$7\) RETURNING id, created_at$/, 'linkedin_analyses',
      ([user_id, profile_url, target_roles, overall_score, grade, ai_powered, report]) => {
        const row = { id: ++seq.linkedin_analyses, user_id, profile_url, target_roles, overall_score, grade, ai_powered, report, created_at: new Date(2000 + seq.linkedin_analyses) };
        db.state.linkedin_analyses.push(row);
        return rows([{ id: row.id, created_at: row.created_at }]);
      }],
    [/^SELECT id, profile_url, target_roles, overall_score, grade, ai_powered, created_at FROM linkedin_analyses WHERE user_id = \$1 ORDER BY created_at DESC LIMIT \$2$/, 'linkedin_analyses',
      ([uid, limit]) => rows(db.state.linkedin_analyses.filter((r) => r.user_id === uid).sort((a, b) => b.created_at - a.created_at).slice(0, limit)
        .map(({ id, profile_url, target_roles, overall_score, grade, ai_powered, created_at }) => ({ id, profile_url, target_roles, overall_score, grade, ai_powered, created_at })))],
    [/^SELECT id, report, created_at FROM linkedin_analyses WHERE id = \$1 AND user_id = \$2$/, 'linkedin_analyses',
      ([id, uid]) => {
        if (!/^\d+$/.test(String(id))) throw new Error(`invalid input syntax for type integer: "${id}"`);
        return rows(db.state.linkedin_analyses.filter((r) => r.id === Number(id) && r.user_id === uid)
          .map((r) => ({ id: r.id, report: JSON.parse(r.report), created_at: r.created_at })));
      }],

    [/^INSERT INTO career_coach_sessions \(user_id, session_type, target_role, data\) VALUES \(\$1, \$2, \$3, \$4\)$/, 'career_coach_sessions',
      ([user_id, session_type, target_role, data]) => {
        db.state.career_coach_sessions.push({ id: ++seq.career_coach_sessions, user_id, session_type, target_role, data });
        return rows([], 1);
      }],
    [/^INSERT INTO code_reviews \(user_id, language, review_type, score, issues_count, code_snippet\) VALUES \(\$1, \$2, \$3, \$4, \$5, \$6\)$/, 'code_reviews',
      ([user_id, language, review_type, score, issues_count, code_snippet]) => {
        db.state.code_reviews.push({ id: ++seq.code_reviews, user_id, language, review_type, score, issues_count, code_snippet, created_at: new Date(3000 + seq.code_reviews) });
        return rows([], 1);
      }],
    [/^SELECT id, language, review_type, score, issues_count, code_snippet, created_at FROM code_reviews WHERE user_id = \$1 ORDER BY created_at DESC LIMIT 20$/, 'code_reviews',
      ([uid]) => rows(db.state.code_reviews.filter((r) => r.user_id === uid).sort((a, b) => b.created_at - a.created_at).slice(0, 20)
        .map(({ id, language, review_type, score, issues_count, code_snippet, created_at }) => ({ id, language, review_type, score, issues_count, code_snippet, created_at })))],

    [/^SELECT linkedin_url, github_url, headline, bio FROM profiles WHERE user_id = \$1$/, 'profiles',
      ([uid]) => rows(db.state.profiles.filter((r) => r.user_id === uid))],
    [/^SELECT COUNT\(\*\) as count FROM (resumes|projects|interview_sessions) WHERE user_id = \$1$/, null,
      ([uid], m) => rows([{ count: String(db.state[m[1]].filter((r) => r.user_id === uid).length) }])],
  ];

  db.query = (text, params = []) => {
    const sql = norm(text);
    for (const [re, table, run] of handlers) {
      const m = re.exec(sql);
      if (!m) continue;
      db.calls.push({ sql, params });
      const tableName = table || m[1];
      const p = (async () => {
        await Promise.resolve();
        if (broken.has(tableName)) throw new Error(`relation "${tableName}" does not exist`);
        return run(params, m);
      })();
      return p;
    }
    return realQuery(text, params);
  };
  /** Make every statement against `table` reject like a missing relation. */
  db.breakTable = (table) => broken.add(table);
  db.callsMatching = (re) => db.calls.filter((c) => re.test(c.sql));
  return db;
}

/**
 * Build the app. `plan` is the user's tier (1..3) or falsy for "no subscription".
 * Services are constructed explicitly here so the tests do not depend on services/registry/large2.js
 * (that file is written last); wiring.test.js covers the registry separately.
 */
function makeHarness({ plan, ai = makeAi(), envOverrides, mount = true, userId = 1, seed } = {}) {
  const db = installSql(createFakeDb());
  seedPlans(db);
  if (plan) db.state.user_subscriptions.push({ user_id: userId, plan_id: plan });
  if (seed) seed(db);

  const servicesFactory = ({ db: requestDb, config }) => {
    const base = { aiClient: ai };
    return createServices({
      db: requestDb,
      config,
      overrides: {
        ...base,
        linkedinAnalysisStore: createLinkedinAnalysisStore({ db: requestDb }),
        linkedinOptimizerService: createLinkedinOptimizerService({ config, services: base }),
      },
    });
  };

  const app = createApp({ dbFactory: () => db, servicesFactory });
  if (mount) {
    mountRoutes(app, '/api/profiles', profilesRouter);
    mountRoutes(app, '/api/ai-coach', aiCoachRouter);
  }
  const env = makeEnv(envOverrides);
  const ctx = makeCtx();
  const token = signToken({ id: userId });
  const request = (path, init = {}) => app.request(path, init, env, ctx);
  const authed = (path, { method = 'GET', body, headers = {}, rawBody } = {}) =>
    request(path, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...headers,
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      ...(rawBody !== undefined ? { body: rawBody } : {}),
    });
  return { app, db, ai, env, ctx, token, request, authed };
}

/** A GitHub API response set for fetchGitHubData (user, repos, optional profile README). */
function githubFetchMock({ user, repos, readme, userStatus = 200, reposStatus = 200 } = {}) {
  const json = (status, data) => ({ ok: status >= 200 && status < 300, status, json: async () => data });
  return jest.fn(async (url) => {
    const u = String(url);
    if (/\/readme$/.test(u)) return readme ? json(200, readme) : json(404, { message: 'Not Found' });
    if (/\/repos\?/.test(u)) return json(reposStatus, repos || []);
    return json(userStatus, user);
  });
}

module.exports = {
  norm,
  extractJSON,
  makeAi,
  aiOk,
  installSql,
  makeHarness,
  githubFetchMock,
  profilesRouter,
  aiCoachRouter,
  TIER_NAME: { 1: 'Learn & Build', 2: 'Tune & Polish', 3: 'Zero to Hero' },
};
