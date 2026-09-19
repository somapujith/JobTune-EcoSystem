'use strict';

/**
 * Test harness for the docs slice: the shared in-memory fake db (plan lookups for requirePlan) extended
 * with the exact `resumes` / `resume_embeddings` / `resume_exports` statements the four routes and the
 * resumeDatabase service issue. Like tests/worker/helpers/fakeDb.js it matches whole statements and throws
 * on any resume-related SQL it does not know, so a query change fails a test instead of silently returning
 * nothing. It models behaviour, not Postgres: it proves route/service logic, NOT SQL correctness or Neon.
 *
 * Services: the docs slice's own three services are built from their real factories; the infra-owned pure
 * analyzers are the ORIGINAL Express modules (pure, no I/O) and the aiClient is a jest fake.
 */
const { createApp } = require('../../../../src/worker/app');
const { createServices } = require('../../../../src/worker/services');
const { mountRoutes } = require('../../../../src/worker/lib/routes');
const { createResumeDatabase } = require('../../../../src/worker/services/resumeDatabase');
const { createResumeExport } = require('../../../../src/worker/services/resumeExport');
const { createResumeExportEngine } = require('../../../../src/worker/services/v2/resumeExportEngine');
const { makeEnv, makeCtx, signToken, seedPlans, createFakeDb } = require('../../helpers/harness');

const canon = (sql) =>
  sql
    .replace(/\s+/g, ' ')
    .replace(/\( /g, '(')
    .replace(/ \)/g, ')')
    .replace(/;\s*$/, '')
    .trim();

const same = (a, b) => String(a) === String(b);
const parseIfJson = (v) => (typeof v === 'string' ? JSON.parse(v) : v); // jsonb columns come back parsed

function createDocsDb() {
  const db = createFakeDb();
  const base = db.query.bind(db);
  db.state.resumes = [];
  db.state.resume_embeddings = [];
  db.state.resume_exports = [];
  db.docCalls = [];
  let nextResumeId = 100;
  let nextExportId = 500;
  let clock = Date.parse('2026-01-01T00:00:00Z');
  const tick = () => new Date((clock += 1000));
  const res = (rows, rowCount = rows.length) => ({ rows, rowCount });

  const handlers = [
    // ---- routes/resume.js ----------------------------------------------------------------------
    [
      'INSERT INTO resumes (user_id, file_name, file_size, scores, sections, suggestions, overall_score) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id',
      ([user_id, file_name, file_size, scores, sections, suggestions, overall_score]) => {
        const row = {
          id: nextResumeId++, user_id, file_name, file_size,
          scores: parseIfJson(scores), sections: parseIfJson(sections), suggestions: parseIfJson(suggestions),
          overall_score, created_at: tick(),
        };
        db.state.resumes.push(row);
        return res([{ id: row.id }]);
      },
    ],
    ['SELECT * FROM resumes WHERE id = $1', ([id]) => res(db.state.resumes.filter((r) => same(r.id, id)).map((r) => ({ ...r })))],
    [
      'SELECT id, file_name, file_size, overall_score, scores, created_at FROM resumes WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20',
      ([uid]) =>
        res(
          db.state.resumes
            .filter((r) => same(r.user_id, uid))
            .sort((a, b) => b.created_at - a.created_at)
            .slice(0, 20)
            .map(({ id, file_name, file_size, overall_score, scores, created_at }) => ({ id, file_name, file_size, overall_score, scores, created_at }))
        ),
    ],
    [
      'SELECT scores, overall_score FROM resumes WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1',
      ([uid]) =>
        res(
          db.state.resumes
            .filter((r) => same(r.user_id, uid))
            .sort((a, b) => b.created_at - a.created_at)
            .slice(0, 1)
            .map(({ scores, overall_score }) => ({ scores, overall_score }))
        ),
    ],
    [
      'SELECT * FROM resumes WHERE id = $1 AND user_id = $2',
      ([id, uid]) => res(db.state.resumes.filter((r) => same(r.id, id) && same(r.user_id, uid)).map((r) => ({ ...r }))),
    ],
    [
      'SELECT chunk_text FROM resume_embeddings WHERE resume_id = $1 AND user_id = $2 ORDER BY chunk_index',
      ([rid, uid]) =>
        res(
          db.state.resume_embeddings
            .filter((e) => same(e.resume_id, rid) && same(e.user_id, uid))
            .sort((a, b) => a.chunk_index - b.chunk_index)
            .map(({ chunk_text }) => ({ chunk_text }))
        ),
    ],
    [
      'DELETE FROM resumes WHERE id = $1 AND user_id = $2',
      ([id, uid]) => {
        const keep = db.state.resumes.filter((r) => !(same(r.id, id) && same(r.user_id, uid)));
        const removed = db.state.resumes.length - keep.length;
        db.state.resumes = keep;
        return res([], removed);
      },
    ],
    // ---- services/resumeDatabase.js ------------------------------------------------------------
    [
      'INSERT INTO resumes (user_id, original_resume, original_score, role_detected, keyword_coverage, missing_info, created_at) VALUES ($1, $2, $3, $4, $5, $6, NOW()) RETURNING id, created_at',
      ([user_id, original_resume, original_score, role_detected, keyword_coverage, missing_info]) => {
        const row = {
          id: nextResumeId++, user_id, original_resume, original_score, role_detected,
          keyword_coverage: parseIfJson(keyword_coverage), missing_info: parseIfJson(missing_info),
          optimized_resume: null, optimized_score: null, created_at: tick(), updated_at: null,
        };
        db.state.resumes.push(row);
        return res([{ id: row.id, created_at: row.created_at }]);
      },
    ],
    [
      'SELECT r.id, r.original_score, r.optimized_score, r.role_detected, r.created_at, r.updated_at, COUNT(e.id) as export_count FROM resumes r LEFT JOIN resume_exports e ON r.id = e.resume_id WHERE r.user_id = $1 GROUP BY r.id ORDER BY r.created_at DESC LIMIT $2',
      ([uid, limit]) =>
        res(
          db.state.resumes
            .filter((r) => same(r.user_id, uid))
            .sort((a, b) => b.created_at - a.created_at)
            .slice(0, limit)
            .map((r) => ({
              id: r.id, original_score: r.original_score, optimized_score: r.optimized_score, role_detected: r.role_detected,
              created_at: r.created_at, updated_at: r.updated_at,
              export_count: String(db.state.resume_exports.filter((e) => same(e.resume_id, r.id)).length), // bigint -> string
            }))
        ),
    ],
    [
      'INSERT INTO resume_exports (resume_id, export_format, file_path, created_at) VALUES ($1, $2, $3, NOW()) RETURNING id',
      ([resume_id, export_format, file_path]) => {
        const row = { id: nextExportId++, resume_id, export_format, file_path };
        db.state.resume_exports.push(row);
        return res([{ id: row.id }]);
      },
    ],
    [
      'UPDATE resumes SET optimized_resume = $1, optimized_score = $2, updated_at = NOW() WHERE id = $3 RETURNING id',
      ([optimized_resume, optimized_score, id]) => {
        const hit = db.state.resumes.filter((r) => same(r.id, id));
        hit.forEach((r) => { r.optimized_resume = optimized_resume; r.optimized_score = optimized_score; });
        return res(hit.map((r) => ({ id: r.id })));
      },
    ],
    [
      'DELETE FROM resumes WHERE id = $1 AND user_id = $2 RETURNING id',
      ([id, uid]) => {
        const gone = db.state.resumes.filter((r) => same(r.id, id) && same(r.user_id, uid));
        db.state.resumes = db.state.resumes.filter((r) => !gone.includes(r));
        return res(gone.map((r) => ({ id: r.id })));
      },
    ],
  ].map(([sql, fn]) => [canon(sql), fn]);

  const failures = [];
  db.failWhenDocs = (matcher, error) => failures.push({ matcher, error });

  db.query = (sql, params = []) => {
    const key = canon(sql);
    const failure = failures.find((f) => f.matcher(key));
    if (failure) return Promise.reject(failure.error);
    const hit = handlers.find(([k]) => k === key);
    if (hit) {
      db.docCalls.push({ sql: key, params });
      return Promise.resolve(hit[1](params));
    }
    if (/\b(resumes|resume_embeddings|resume_exports|analyses)\b/.test(key)) {
      return Promise.reject(new Error(`docsDb: unhandled resume statement: ${key}`));
    }
    return base(sql, params);
  };
  return db;
}

/** The infra slice's pure analyzers, as the original Express modules (pure code, no I/O). */
function realAnalyzers() {
  return {
    resumeAnalysisEngine: require('../../../../src/services/v2/resumeAnalysisEngine'),
    resumeCriticEngine: require('../../../../src/services/v2/resumeCriticEngine'),
  };
}

const ROUTERS = () => [
  ['/api/resume', require('../../../../src/worker/routes/resume')],
  ['/api/resume', require('../../../../src/worker/routes/resumeV2')],
  ['/api/ats', require('../../../../src/worker/routes/atsExport')],
  ['/api/ats', require('../../../../src/worker/routes/atsCheckerV2')],
];

/**
 * @param {object} [o]
 * @param {number|null} [o.plan]      tier id (1..3) of user 1's subscription; null = no plan at all
 * @param {object} [o.overrides]      extra / replacement services (e.g. aiClient, a throwing engine)
 * @param {object} [o.db]             a prepared createDocsDb()
 */
function makeDocsHarness({ plan = 2, overrides = {}, db = createDocsDb(), env } = {}) {
  seedPlans(db);
  if (plan) db.state.user_subscriptions.push({ user_id: 1, plan_id: plan });
  const theEnv = env || makeEnv();
  const aiClient = { callAI: jest.fn(async () => ({ ok: true, data: 'AI SUGGESTION' })) };

  const app = createApp({
    dbFactory: () => db,
    servicesFactory: ({ db: requestDb, config }) =>
      createServices({
        db: requestDb,
        config,
        overrides: {
          resumeDatabase: createResumeDatabase({ db: requestDb }),
          resumeExport: createResumeExport(),
          resumeExportEngine: createResumeExportEngine(),
          aiClient,
          ...realAnalyzers(),
          ...overrides,
        },
      }),
  });
  for (const [prefix, router] of ROUTERS()) mountRoutes(app, prefix, router);

  const ctx = makeCtx();
  const request = (path, init = {}) => app.request(path, init, theEnv, ctx);
  const token = signToken({ id: 1 });
  const otherToken = signToken({ id: 2 });
  const authed = (init = {}, t = token) => ({ ...init, headers: { Authorization: `Bearer ${t}`, ...(init.headers || {}) } });
  const json = (body, t = token) => ({
    method: 'POST',
    headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { app, db, ctx, env: theEnv, request, token, otherToken, authed, json, aiClient };
}

module.exports = { createDocsDb, makeDocsHarness, realAnalyzers, canon };
