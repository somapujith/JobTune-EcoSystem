'use strict';

/**
 * Test helpers for the "mid2" slice (skills, dashboard, learningModules, aiTutor, studyTools,
 * tutorHistoryService). Everything is synthetic: fake db, fake aiClient, fake studyHistoryService,
 * made-up secrets. Nothing touches a network or a real database.
 *
 * The fake db wraps the shared in-memory db (plans / sessions / audit_logs, needed by authenticateToken
 * and requirePlan) and adds the EXACT statements the mid2 routes and tutorHistoryService issue. It matches
 * the whitespace-normalised SQL text, so any change to a ported query fails a test loudly instead of silently
 * returning nothing. It is a behavioural model, not Postgres: it proves route/service logic, NOT SQL
 * correctness, Neon behaviour or anything specific to the Workers runtime.
 */
const { createApp } = require('../../../src/worker/app');
const { createServices } = require('../../../src/worker/services');
const { createRouter, mountRoutes } = require('../../../src/worker/lib/routes');
const { createTutorHistoryService } = require('../../../src/worker/services/tutorHistoryService');
const { makeEnv, makeCtx, signToken, seedPlans, createFakeDb } = require('../helpers/harness');

const USER_ID = 1;
const OTHER_USER_ID = 2;

// The five routers with the prefixes and RELATIVE order of backend/src/app.js
// (skills #3, dashboard #6, ai-tutor #30, study-tools #32, learning-modules #40).
const MID2_MOUNTS = [
  ['/api/skills', () => require('../../../src/worker/routes/skills')],
  ['/api/dashboard', () => require('../../../src/worker/routes/dashboard')],
  ['/api/ai-tutor', () => require('../../../src/worker/routes/aiTutor')],
  ['/api/study-tools', () => require('../../../src/worker/routes/studyTools')],
  ['/api/learning-modules', () => require('../../../src/worker/routes/learningModules')],
];

function mountMid2(app) {
  for (const [prefix, load] of MID2_MOUNTS) mountRoutes(app, prefix, load());
  return app;
}

// Same behaviour as utils/aiClient.extractJSON (copied so the tests do not import Express code).
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

function createFakeAi() {
  return {
    // default: provider unavailable, so routes take their fallback paths
    callAI: jest.fn(async () => ({ ok: false, error: 'unavailable', data: null })),
    extractJSON,
  };
}

const norm = (sql) => sql.replace(/\s+/g, ' ').trim();

function pgError(message, code) {
  const err = new Error(message);
  err.code = code;
  return err;
}

/** Fake db for the mid2 statements, layered over the shared fake (plans, sessions, audit logs). */
function createMid2Db() {
  const base = createFakeDb();
  seedPlans(base);

  const tables = {
    resumes: [],
    mock_interviews: [],
    job_applications: [],
    skill_assessments: [],
    onboarding_responses: [],
    learning_streaks: [],
    daily_activity: [],
    linkedin_analyses: [],
    career_roadmaps: [],
    course_enrollments: [],
    practice_submissions: [],
    tutor_conversations: [],
  };
  const missing = new Set();
  const seq = { skill_assessments: 0, tutor_conversations: 0 };
  const calls = [];
  let clock = () => new Date();

  const table = (name) => {
    if (missing.has(name)) throw pgError(`relation "${name}" does not exist`, '42P01');
    return tables[name];
  };
  const mine = (name, userId) => table(name).filter((r) => r.user_id === userId);
  const newestFirst = (rows, key) => [...rows].sort((a, b) => new Date(b[key]) - new Date(a[key]));
  const res = (rows, rowCount = rows.length) => ({ rows, rowCount });
  const parseJson = (v) => (typeof v === 'string' ? JSON.parse(v) : v);

  const exact = new Map([
    // ---- dashboard --------------------------------------------------------------------------------
    [
      'SELECT overall_score, created_at FROM resumes WHERE user_id = $1 ORDER BY created_at DESC LIMIT 10',
      ([uid]) =>
        res(newestFirst(mine('resumes', uid), 'created_at').slice(0, 10).map((r) => ({ overall_score: r.overall_score, created_at: r.created_at }))),
    ],
    [
      'SELECT score FROM mock_interviews WHERE user_id = $1 ORDER BY created_at DESC',
      ([uid]) => res(newestFirst(mine('mock_interviews', uid), 'created_at').map((r) => ({ score: r.score }))),
    ],
    ['SELECT status FROM job_applications WHERE user_id = $1', ([uid]) => res(mine('job_applications', uid).map((r) => ({ status: r.status })))],
    [
      'SELECT * FROM skill_assessments WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1',
      ([uid]) => res(newestFirst(mine('skill_assessments', uid), 'created_at').slice(0, 1).map((r) => ({ ...r }))),
    ],
    [
      'SELECT career_goal, experience_level, pain_points, field_of_interest FROM onboarding_responses WHERE user_id = $1',
      ([uid]) =>
        res(
          mine('onboarding_responses', uid).map(({ career_goal, experience_level, pain_points, field_of_interest }) => ({
            career_goal, experience_level, pain_points, field_of_interest,
          }))
        ),
    ],
    [
      'SELECT current, longest, daily_goal FROM learning_streaks WHERE user_id = $1',
      ([uid]) => res(mine('learning_streaks', uid).map(({ current, longest, daily_goal }) => ({ current, longest, daily_goal }))),
    ],
    [
      'SELECT COUNT(DISTINCT activity_date) AS days_active, COUNT(DISTINCT tool_name) AS tools_used FROM daily_activity WHERE user_id = $1',
      ([uid]) => {
        const rows = mine('daily_activity', uid);
        // node-postgres returns bigint COUNT() values as strings
        return res([
          {
            days_active: String(new Set(rows.map((r) => r.activity_date)).size),
            tools_used: String(new Set(rows.map((r) => r.tool_name)).size),
          },
        ]);
      },
    ],

    // ---- skills -----------------------------------------------------------------------------------
    [
      'INSERT INTO skill_assessments (user_id, skills, strengths, gaps, role_matches) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      ([user_id, skills, strengths, gaps, role_matches]) => {
        const row = {
          id: ++seq.skill_assessments,
          user_id,
          // jsonb columns come back parsed from the driver
          skills: parseJson(skills),
          strengths: parseJson(strengths),
          gaps: parseJson(gaps),
          role_matches: parseJson(role_matches),
          created_at: clock(),
        };
        table('skill_assessments').push(row);
        return res([{ id: row.id }]);
      },
    ],
    [
      'SELECT * FROM skill_assessments WHERE id = $1',
      ([id]) => res(table('skill_assessments').filter((r) => r.id === id).map((r) => ({ ...r }))),
    ],
    [
      'SELECT id, skills, strengths, gaps, role_matches, created_at FROM skill_assessments WHERE user_id = $1 ORDER BY created_at DESC LIMIT 10',
      ([uid]) =>
        res(
          newestFirst(mine('skill_assessments', uid), 'created_at')
            .slice(0, 10)
            .map(({ id, skills, strengths, gaps, role_matches, created_at }) => ({ id, skills, strengths, gaps, role_matches, created_at }))
        ),
    ],

    // ---- tutorHistoryService ----------------------------------------------------------------------
    [
      'INSERT INTO tutor_conversations (user_id, topic, title, messages) VALUES ($1, $2, $3, $4) RETURNING id, created_at',
      ([user_id, topic, title, messages]) => {
        const now = clock();
        const row = { id: ++seq.tutor_conversations, user_id, topic, title, messages: parseJson(messages), created_at: now, updated_at: now };
        table('tutor_conversations').push(row);
        return res([{ id: row.id, created_at: row.created_at }]);
      },
    ],
    [
      'UPDATE tutor_conversations SET messages = $1, updated_at = NOW() WHERE id = $2 AND user_id = $3',
      ([messages, id, uid]) => {
        const hit = table('tutor_conversations').filter((r) => String(r.id) === String(id) && r.user_id === uid);
        // JSON.stringify(undefined) is undefined; the driver sends NULL for it
        hit.forEach((r) => { r.messages = messages === undefined ? null : parseJson(messages); r.updated_at = clock(); });
        return res([], hit.length);
      },
    ],
    [
      'SELECT id, topic, title, created_at, updated_at, jsonb_array_length(messages) as message_count FROM tutor_conversations WHERE user_id = $1 ORDER BY updated_at DESC LIMIT $2',
      ([uid, limit]) =>
        res(
          newestFirst(mine('tutor_conversations', uid), 'updated_at')
            .slice(0, limit)
            .map((r) => ({
              id: r.id, topic: r.topic, title: r.title, created_at: r.created_at, updated_at: r.updated_at,
              message_count: Array.isArray(r.messages) ? r.messages.length : null,
            }))
        ),
    ],
    [
      'SELECT * FROM tutor_conversations WHERE id = $1 AND user_id = $2',
      ([id, uid]) => {
        assertIntegerId(id);
        return res(table('tutor_conversations').filter((r) => String(r.id) === String(id) && r.user_id === uid).map((r) => ({ ...r })));
      },
    ],
    [
      'DELETE FROM tutor_conversations WHERE id = $1 AND user_id = $2',
      ([id, uid]) => {
        assertIntegerId(id);
        const t = table('tutor_conversations');
        const keep = t.filter((r) => !(String(r.id) === String(id) && r.user_id === uid));
        const removed = t.length - keep.length;
        t.length = 0;
        t.push(...keep);
        return res([], removed);
      },
    ],
  ]);

  function assertIntegerId(id) {
    if (!/^\d+$/.test(String(id))) throw pgError(`invalid input syntax for type integer: "${id}"`, '22P02');
  }

  // SELECT EXISTS(SELECT 1 FROM <table> WHERE user_id = $1 [AND progress > 0]) AS e
  const existsRe = /^SELECT EXISTS\(SELECT 1 FROM (\w+) WHERE user_id = \$1( AND progress > 0)?\) AS e$/;

  // failure injection: like the shared fake's failWhen, but also applied to the mid2 statements
  const failures = [];
  const baseFailWhen = base.failWhen.bind(base);
  base.failWhen = (matcher, error) => {
    failures.push({ matcher, error });
    baseFailWhen(matcher, error);
  };

  const baseQuery = base.query.bind(base);
  base.query = (text, params = []) => {
    const sql = norm(text);
    const handler = exact.get(sql);
    const m = existsRe.exec(sql);
    if (!handler && !m) return baseQuery(text, params);
    calls.push({ sql, params });
    const p = (async () => {
      await Promise.resolve();
      const failure = failures.find((f) => f.matcher(sql));
      if (failure) throw failure.error;
      if (handler) return handler(params);
      const rows = mine(m[1], params[0]).filter((r) => (m[2] ? r.progress > 0 : true));
      return res([{ e: rows.length > 0 }]);
    })();
    return p;
  };

  Object.assign(base, {
    tables,
    /** statements that reached the mid2 layer (not the shared plan/session layer) */
    mid2Calls: calls,
    dropTable(name) { missing.add(name); },
    setClock(fn) { clock = fn; },
    add(name, row) { tables[name].push(row); return row; },
  });
  return base;
}

/**
 * Build an app with the five mid2 routers mounted like backend/src/app.js.
 *  - plan: tier the user (id USER_ID) is subscribed to (omit for "no plan")
 *  - env:  extra Worker env vars (e.g. LM_STUDIO_MODEL_TUTOR)
 *  - overrides: service-container overrides (e.g. { studyHistoryService: undefined })
 *  - registryTutorHistory: use the tutorHistoryService from the real registry instead of an override
 */
function build({ plan, env: envOverrides, overrides = {}, registryTutorHistory = false } = {}) {
  const db = createMid2Db();
  if (plan) db.state.user_subscriptions.push({ user_id: USER_ID, plan_id: plan });
  const ai = createFakeAi();
  const studyHistory = { saveSession: jest.fn(async () => ({ id: 1 })) };

  const servicesFactory = ({ db: requestDb, config }) =>
    createServices({
      db: requestDb,
      config,
      overrides: {
        aiClient: ai,
        studyHistoryService: studyHistory,
        ...(registryTutorHistory ? {} : { tutorHistoryService: createTutorHistoryService({ db: requestDb }) }),
        ...overrides,
      },
    });

  const app = createApp({ dbFactory: () => db, servicesFactory });
  mountMid2(app);

  const env = makeEnv(envOverrides);
  const ctx = makeCtx();
  const token = signToken({ id: USER_ID });
  const otherToken = signToken({ id: OTHER_USER_ID });

  /** call(method, path, { token, body, headers }) - pass token: null for an anonymous request */
  const call = (method, path, { token: t = token, body, headers = {} } = {}) => {
    const init = { method, headers: { ...headers } };
    if (t) init.headers.Authorization = `Bearer ${t}`;
    if (body !== undefined) {
      init.headers['Content-Type'] = 'application/json';
      init.body = typeof body === 'string' ? body : JSON.stringify(body);
    }
    return app.request(path, init, env, ctx);
  };

  return {
    app, db, ai, studyHistory, env, ctx, token, otherToken, call,
    get: (path, opts) => call('GET', path, opts),
    post: (path, body, opts = {}) => call('POST', path, { ...opts, body }),
    put: (path, body, opts = {}) => call('PUT', path, { ...opts, body }),
    del: (path, opts) => call('DELETE', path, opts),
  };
}

/** Silence and capture console noise from the routes under test. */
function quietConsole() {
  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());
}

/** A fresh router-mounted app with only the given routers, for introspection. */
function miniApp(mounts = MID2_MOUNTS) {
  const app = createApp();
  for (const [prefix, load] of mounts) mountRoutes(app, prefix, load());
  return app;
}

module.exports = {
  USER_ID, OTHER_USER_ID, MID2_MOUNTS, mountMid2, miniApp, build, createMid2Db, createFakeAi, extractJSON, quietConsole, createRouter,
};
