'use strict';

/**
 * Test helpers for the leaf1 slice (projects, benchmarks, resumeConsistency,
 * recruiterVisibility, guides, progress). Everything is synthetic: in-memory db,
 * made-up secrets, no network.
 *
 * tests/worker/helpers/{harness,fakeDb}.js are read-only for this slice, so this file
 * extends their behaviour from the outside:
 *   - makeLeaf1Db()   the shared fake db plus an exact-SQL model of the tables this slice
 *                     touches (users.role, scorer_benchmarks, user_progress, job_applications,
 *                     job_guides). Like the base fake it THROWS on any statement it does not
 *                     recognise, so a SQL change in a service fails a test.
 *   - build()         a createApp() wired to that db with the leaf1 routers mounted at the
 *                     same prefixes as backend/src/app.js and the leaf1 service factories
 *                     supplied through the services container (overrides), plus a fake aiClient.
 *
 * The model is a behavioural stand-in, not Postgres: it proves route/service logic, NOT SQL
 * correctness or Neon behaviour.
 */
const { createApp } = require('../../../src/worker/app');
const { mountRoutes } = require('../../../src/worker/lib/routes');
const { createServices } = require('../../../src/worker/services');
const { makeEnv, makeCtx, signToken, seedPlans, createFakeDb } = require('../helpers/harness');

const { createScorerBenchmark } = require('../../../src/worker/services/benchmarks/scorerBenchmark');
const { createResumeConsistencyService } = require('../../../src/worker/services/resumeConsistencyService');
const { createRecruiterVisibilityService } = require('../../../src/worker/services/recruiterVisibilityService');
const { createJobGuideGenerator } = require('../../../src/worker/services/guides/jobGuideGenerator');
const { createProgressService } = require('../../../src/worker/services/progressService');

const norm = (sql) => sql.replace(/\s+/g, ' ').trim();

/** Shared fake db + the statements this slice issues. */
function makeLeaf1Db() {
  const db = createFakeDb();
  const base = db.query.bind(db);
  const baseFailWhen = db.failWhen.bind(db);
  const failures = [];
  // failWhen must also cover this slice's statements, which the base fake never sees
  db.failWhen = (matcher, error) => {
    failures.push({ matcher, error });
    baseFailWhen(matcher, error);
  };
  const state = {
    users: [], // { id, role }
    scorer_benchmarks: [],
    user_progress: [], // { user_id, context_key, progress_data (object), updated_at }
    job_applications: [], // { id, user_id, company, role, job_description }
    job_guides: [], // { id, user_id, application_id, guide }
  };
  const seq = { scorer_benchmarks: 0, job_guides: 0 };
  Object.assign(db.state, state);

  const res = (rows, rowCount = rows.length) => ({ rows, rowCount });
  const handlers = [
    [
      /^SELECT role FROM users WHERE id = \$1$/,
      ([id]) => res(db.state.users.filter((u) => u.id === id).map((u) => ({ role: u.role }))),
    ],
    [
      /^INSERT INTO scorer_benchmarks \(scorer_name, dataset_name, metrics, sample_size\) VALUES \(\$1, \$2, \$3, \$4\)$/,
      ([scorer_name, dataset_name, metrics, sample_size]) => {
        db.state.scorer_benchmarks.push({ id: ++seq.scorer_benchmarks, scorer_name, dataset_name, metrics, sample_size });
        return res([], 1);
      },
    ],
    [
      /^SELECT progress_data, updated_at FROM user_progress WHERE user_id = \$1 AND context_key = \$2$/,
      ([userId, key]) =>
        res(
          db.state.user_progress
            .filter((r) => r.user_id === userId && r.context_key === key)
            .map((r) => ({ progress_data: r.progress_data, updated_at: r.updated_at }))
        ),
    ],
    [
      /^SELECT context_key, progress_data, updated_at FROM user_progress WHERE user_id = \$1 ORDER BY context_key$/,
      ([userId]) =>
        res(
          db.state.user_progress
            .filter((r) => r.user_id === userId)
            .sort((a, b) => (a.context_key < b.context_key ? -1 : a.context_key > b.context_key ? 1 : 0))
            .map((r) => ({ context_key: r.context_key, progress_data: r.progress_data, updated_at: r.updated_at }))
        ),
    ],
    [
      /^INSERT INTO user_progress \(user_id, context_key, progress_data, updated_at\) VALUES \(\$1, \$2, \$3, CURRENT_TIMESTAMP\) ON CONFLICT \(user_id, context_key\) DO UPDATE SET progress_data = \$3, updated_at = CURRENT_TIMESTAMP RETURNING progress_data, updated_at$/,
      ([userId, key, json]) => {
        // jsonb column: the driver hands the stored value back parsed
        const stored = JSON.parse(json);
        let row = db.state.user_progress.find((r) => r.user_id === userId && r.context_key === key);
        if (row) {
          row.progress_data = stored;
          row.updated_at = new Date(db.now);
        } else {
          db.state.user_progress.push((row = { user_id: userId, context_key: key, progress_data: stored, updated_at: new Date(db.now) }));
        }
        return res([{ progress_data: row.progress_data, updated_at: row.updated_at }]);
      },
    ],
    [
      /^SELECT \* FROM job_applications WHERE id = \$1 AND user_id = \$2$/,
      ([id, userId]) => res(db.state.job_applications.filter((a) => a.id === id && a.user_id === userId).map((a) => ({ ...a }))),
    ],
    [
      /^INSERT INTO job_guides \(user_id, application_id, guide\) VALUES \(\$1, \$2, \$3\) RETURNING id$/,
      ([user_id, application_id, guide]) => {
        const row = { id: ++seq.job_guides, user_id, application_id, guide: JSON.parse(guide) };
        db.state.job_guides.push(row);
        return res([{ id: row.id }]);
      },
    ],
    [
      /^SELECT \* FROM job_guides WHERE id = \$1 AND user_id = \$2$/,
      ([id, userId]) => res(db.state.job_guides.filter((g) => g.id === id && g.user_id === userId).map((g) => ({ ...g }))),
    ],
  ];

  db.query = (text, params = []) => {
    const sql = norm(text);
    const handler = handlers.find(([re]) => re.test(sql));
    if (!handler) return base(text, params); // sessions, audit_logs, plans: the shared fake
    db.calls.push({ sql, params });
    return Promise.resolve().then(() => {
      const failure = failures.find((f) => f.matcher(sql));
      if (failure) throw failure.error;
      return handler[1](params);
    });
  };
  return db;
}

/** A fake aiClient with the contract of utils/aiClient.callAI: resolves { ok, data, error }. */
function makeFakeAi(impl) {
  const calls = [];
  const aiClient = {
    calls,
    callAI: async (args) => {
      calls.push(args);
      return impl ? impl(args) : { ok: false, data: null, error: 'no AI in tests' };
    },
  };
  return aiClient;
}

/** The leaf1 service factories (what the registry entries build), bound to a db and a fake aiClient. */
function leaf1ServiceOverrides({ db, ai }) {
  return {
    scorerBenchmark: createScorerBenchmark({ db }),
    resumeConsistencyService: createResumeConsistencyService(),
    recruiterVisibilityService: createRecruiterVisibilityService(),
    jobGuideGenerator: createJobGuideGenerator({ db, services: { aiClient: ai } }),
    progressService: createProgressService({ db }),
  };
}

const projectsRouter = () => require('../../../src/worker/routes/projects');
const guidesRouter = () => require('../../../src/worker/routes/guides');
const benchmarksRouter = () => require('../../../src/worker/routes/benchmarks');
const progressRouter = () => require('../../../src/worker/routes/progress');
const recruiterVisibilityRouter = () => require('../../../src/worker/routes/recruiterVisibility');
const resumeConsistencyRouter = () => require('../../../src/worker/routes/resumeConsistency');

/** The six routers with the prefixes backend/src/app.js mounts them at, in app.js order. */
function leaf1Mounts() {
  return [
    ['/api/projects', projectsRouter()],
    ['/api/guides', guidesRouter()],
    ['/api/benchmarks', benchmarksRouter()],
    ['/api/progress', progressRouter()],
    ['/api/recruiter-visibility', recruiterVisibilityRouter()],
    ['/api/resume-consistency', resumeConsistencyRouter()],
  ];
}

/** Mount only the leaf1 routers on an app (used for introspection and request tests). */
function mountLeaf1(app) {
  for (const [prefix, router] of leaf1Mounts()) mountRoutes(app, prefix, router);
  return app;
}

/**
 * @param {{ plan?: number|null, userId?: number, role?: string|null, ai?: object, db?: object }} [opts]
 *   plan: tier to subscribe user `userId` to (seeds subscription_plans); null/undefined = no subscription
 *   role: seeds users(id=userId, role)
 */
function build({ plan, userId = 1, role, ai = makeFakeAi(), db = makeLeaf1Db() } = {}) {
  seedPlans(db);
  if (plan) db.state.user_subscriptions.push({ user_id: userId, plan_id: plan });
  if (role !== undefined && role !== null) db.state.users.push({ id: userId, role });

  const app = createApp({
    dbFactory: () => db,
    servicesFactory: ({ db: requestDb, config }) =>
      createServices({
        db: requestDb,
        config,
        overrides: { aiClient: ai, ...leaf1ServiceOverrides({ db: requestDb, ai }) },
      }),
  });
  mountLeaf1(app);

  const env = makeEnv();
  const ctx = makeCtx();
  const token = signToken({ id: userId });
  const request = (path, init = {}) => app.request(path, init, env, ctx);
  const authed = (path, init = {}) =>
    request(path, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init.headers || {}) } });
  // GET/HEAD requests cannot carry a body, so for those the body argument is ignored
  const json = (method, path, body, { auth = true, headers = {} } = {}) => {
    const hasBody = body !== undefined && !['GET', 'HEAD'].includes(method);
    return (auth ? authed : request)(path, {
      method,
      headers: { ...(hasBody ? { 'Content-Type': 'application/json' } : {}), ...headers },
      body: hasBody ? JSON.stringify(body) : undefined,
    });
  };
  return { app, db, ai, env, ctx, token, request, authed, json };
}

module.exports = { makeLeaf1Db, makeFakeAi, leaf1ServiceOverrides, leaf1Mounts, mountLeaf1, build };
