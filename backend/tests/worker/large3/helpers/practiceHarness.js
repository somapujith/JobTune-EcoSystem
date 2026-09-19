'use strict';

/**
 * Test helpers for the large3 slice (routes/practice.js). Everything is synthetic: made-up secrets,
 * an in-memory fake db, a fake injected aiClient. Nothing touches a network or a real database.
 *
 * - createPracticeDb(): wraps the shared fake db (tests/worker/helpers/fakeDb.js, read-only for this
 *   slice) and adds an in-memory model of the three practice tables. Like the shared fake it matches
 *   the EXACT statements the route issues (whitespace-normalised) and throws on anything else, so a
 *   change to a SQL string in the route fails a test loudly. It models behaviour, not Postgres.
 * - makeAiClient(): a fake of the infra-owned `aiClient` service. `extractJSON` is a verbatim copy of
 *   the Express one (backend/src/utils/aiClient.js) so the preserved "extractJSON receives the
 *   callAI result object" behaviour is exercised for real. Default `callAI` mimics the real contract
 *   (resolves { ok, error, data }).
 * - buildPractice(): app + harness wired to both fakes, with the practice router mounted at /api/practice.
 */
const { createApp } = require('../../../../src/worker/app');
const { mountRoutes } = require('../../../../src/worker/lib/routes');
const { createServices } = require('../../../../src/worker/services');
const practiceRouter = require('../../../../src/worker/routes/practice');
const { makeEnv, makeCtx, signToken, seedPlans, createFakeDb } = require('../../helpers/harness');

const norm = (sql) => sql.replace(/\s+/g, ' ').trim();

// ---- fake practice tables ----------------------------------------------------------------------
function createPracticeDb() {
  const base = createFakeDb();
  const t = { submissions: [], assessments: [], bookmarks: [] };
  const seq = { submissions: 0, assessments: 0, bookmarks: 0 };
  const practiceCalls = [];
  let failing = null; // { match: RegExp|string, error }

  const res = (rows, rowCount = rows.length) => ({ rows, rowCount });
  const byDescCreated = (a, b) => b.created_at - a.created_at;
  const distinct = (arr) => [...new Set(arr)];
  const localMidnight = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

  const handlers = [
    [
      'SELECT DISTINCT problem_id FROM practice_submissions WHERE user_id = $1 AND passed = true',
      ([uid]) => res(distinct(t.submissions.filter((s) => s.user_id === uid && s.passed === true).map((s) => s.problem_id)).map((problem_id) => ({ problem_id }))),
    ],
    [
      'SELECT DISTINCT problem_id FROM practice_submissions WHERE user_id = $1',
      ([uid]) => res(distinct(t.submissions.filter((s) => s.user_id === uid).map((s) => s.problem_id)).map((problem_id) => ({ problem_id }))),
    ],
    [
      'SELECT problem_id FROM practice_bookmarks WHERE user_id = $1',
      ([uid]) => res(t.bookmarks.filter((b) => b.user_id === uid).map((b) => ({ problem_id: b.problem_id }))),
    ],
    [
      'SELECT id FROM practice_bookmarks WHERE user_id = $1 AND problem_id = $2',
      ([uid, pid]) => res(t.bookmarks.filter((b) => b.user_id === uid && b.problem_id === pid).map((b) => ({ id: b.id }))),
    ],
    [
      'SELECT id, language, passed, feedback, created_at FROM practice_submissions WHERE user_id = $1 AND problem_id = $2 ORDER BY created_at DESC LIMIT 5',
      ([uid, pid]) =>
        res(
          t.submissions
            .filter((s) => s.user_id === uid && s.problem_id === pid)
            .sort(byDescCreated)
            .slice(0, 5)
            .map(({ id, language, passed, feedback, created_at }) => ({ id, language, passed, feedback, created_at }))
        ),
    ],
    [
      'INSERT INTO practice_submissions (user_id, problem_id, code, language, passed, results, feedback) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      ([user_id, problem_id, code, language, passed, results, feedback]) => {
        seq.submissions += 1;
        t.submissions.push({
          id: seq.submissions, user_id, problem_id, code, language, passed, results, feedback,
          created_at: new Date(Date.UTC(2026, 0, 1) + seq.submissions * 1000),
        });
        return res([], 1);
      },
    ],
    [
      // NUMERIC / bigint columns come back from pg as strings; the route wraps them in Number()
      'SELECT assessment_id, MAX(score) as best_score, COUNT(*) as attempts FROM assessment_submissions WHERE user_id = $1 GROUP BY assessment_id',
      ([uid]) => {
        const groups = new Map();
        for (const a of t.assessments.filter((x) => x.user_id === uid)) {
          const g = groups.get(a.assessment_id) || { max: -Infinity, n: 0 };
          g.max = Math.max(g.max, a.score);
          g.n += 1;
          groups.set(a.assessment_id, g);
        }
        return res([...groups].map(([assessment_id, g]) => ({ assessment_id, best_score: String(g.max), attempts: String(g.n) })));
      },
    ],
    [
      'INSERT INTO assessment_submissions (user_id, assessment_id, answers, score, total, time_taken, results) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      ([user_id, assessment_id, answers, score, total, time_taken, results]) => {
        seq.assessments += 1;
        t.assessments.push({ id: seq.assessments, user_id, assessment_id, answers, score, total, time_taken, results });
        return res([], 1);
      },
    ],
    [
      'SELECT DISTINCT DATE(created_at) as day FROM practice_submissions WHERE user_id = $1 ORDER BY day DESC LIMIT 30',
      ([uid]) => {
        const days = distinct(t.submissions.filter((s) => s.user_id === uid).map((s) => localMidnight(s.created_at).getTime()));
        return res(days.sort((a, b) => b - a).slice(0, 30).map((ms) => ({ day: new Date(ms) })));
      },
    ],
    [
      'SELECT problem_id, language, passed, created_at FROM practice_submissions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 10',
      ([uid]) =>
        res(
          t.submissions
            .filter((s) => s.user_id === uid)
            .sort(byDescCreated)
            .slice(0, 10)
            .map(({ problem_id, language, passed, created_at }) => ({ problem_id, language, passed, created_at }))
        ),
    ],
    [
      'SELECT COUNT(DISTINCT assessment_id) as completed, AVG(score) as avg_score FROM assessment_submissions WHERE user_id = $1',
      ([uid]) => {
        const mine = t.assessments.filter((x) => x.user_id === uid);
        return res([
          {
            completed: String(distinct(mine.map((x) => x.assessment_id)).length),
            avg_score: mine.length ? String(mine.reduce((s, x) => s + x.score, 0) / mine.length) : null,
          },
        ]);
      },
    ],
    [
      'DELETE FROM practice_bookmarks WHERE user_id = $1 AND problem_id = $2',
      ([uid, pid]) => {
        const before = t.bookmarks.length;
        t.bookmarks = t.bookmarks.filter((b) => !(b.user_id === uid && b.problem_id === pid));
        return res([], before - t.bookmarks.length);
      },
    ],
    [
      'INSERT INTO practice_bookmarks (user_id, problem_id) VALUES ($1, $2)',
      ([user_id, problem_id]) => {
        if (t.bookmarks.some((b) => b.user_id === user_id && b.problem_id === problem_id)) {
          throw new Error('duplicate key value violates unique constraint "practice_bookmarks_user_id_problem_id_key"');
        }
        seq.bookmarks += 1;
        t.bookmarks.push({ id: seq.bookmarks, user_id, problem_id });
        return res([], 1);
      },
    ],
  ];

  const baseQuery = base.query.bind(base);
  base.query = (sql, params) => {
    const n = norm(sql);
    const hit = handlers.find(([text]) => text === n);
    if (!hit) return baseQuery(sql, params);
    practiceCalls.push({ sql: n, params });
    if (failing && (failing.match instanceof RegExp ? failing.match.test(n) : n.includes(failing.match))) {
      return Promise.reject(failing.error);
    }
    try {
      return Promise.resolve(hit[1](params));
    } catch (err) {
      return Promise.reject(err);
    }
  };

  base.practice = t;
  base.practiceCalls = practiceCalls;
  /** Reject every practice query whose normalised sql contains `match` (or matches the RegExp). */
  base.failPractice = (match = '', error = new Error('synthetic database failure')) => { failing = { match, error }; };
  base.clearPracticeFailure = () => { failing = null; };
  base.practiceSql = () => practiceCalls.map((c) => c.sql);
  return base;
}

// ---- fake aiClient -----------------------------------------------------------------------------
// Verbatim copy of extractJSON from backend/src/utils/aiClient.js (Express), so the fake is as strict as the real one.
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

/** @param {{ callAI?: Function }} [opts] */
function makeAiClient({ callAI } = {}) {
  return {
    callAI: callAI || jest.fn(async () => ({ ok: true, error: null, data: '{"hint":"from the model","level":1}' })),
    extractJSON,
  };
}

// ---- app wiring ---------------------------------------------------------------------------------
const USER_ID = 7;

/**
 * @param {{ plan?: number|null, aiClient?: object|null, db?: object, env?: object, mount?: (app) => void }} [opts]
 *   mount: replaces the default mountRoutes(app, '/api/practice', router), e.g. the slice mount file's mount()
 *   plan: tier of the user's plan (1..3 are seeded), null/undefined = the user has no plan
 *   aiClient: null = do not register an aiClient service at all
 */
function buildPractice({ plan = 1, aiClient, db = createPracticeDb(), env = makeEnv(), mount } = {}) {
  seedPlans(db);
  if (plan) db.state.user_subscriptions.push({ user_id: USER_ID, plan_id: plan });
  const ai = aiClient === undefined ? makeAiClient() : aiClient;
  // `aiClient: null` means "the service resolves to nothing". The key MUST stay present (as undefined): with the key
  // absent, createServices would build the REAL aiClient from the registry and attempt real network calls.
  const overrides = { aiClient: ai || undefined };
  const app = createApp({
    dbFactory: () => db,
    servicesFactory: ({ db: d, config }) => createServices({ db: d, config, overrides }),
  });
  if (mount) mount(app);
  else mountRoutes(app, '/api/practice', practiceRouter);
  const ctx = makeCtx();
  const token = signToken({ id: USER_ID });

  const request = (path, init = {}) => app.request(path, init, env, ctx);
  const authed = (path, init = {}) =>
    request(path, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init.headers || {}) } });
  const get = (path) => authed(path);
  const post = (path, body, init = {}) =>
    authed(path, {
      method: 'POST',
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
      ...init,
    });

  return { app, db, ai, env, ctx, token, request, authed, get, post, USER_ID };
}

module.exports = { createPracticeDb, makeAiClient, extractJSON, buildPractice, USER_ID };
