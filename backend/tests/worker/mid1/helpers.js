'use strict';

/**
 * Shared test helpers for the mid1 slice (resumeChat, learning, jobPreparation, careerRoadmap, interview).
 * Everything is synthetic: fake pool, fake aiClient / embeddings, made-up secrets. No network, no real db.
 *
 * WHAT THIS PROVES: ported logic (branches, statuses, bodies, ordering, gating) against fakes.
 * WHAT IT DOES NOT PROVE: SQL against Postgres/Neon, Neon Pool semantics (in particular that pool.end()
 * waits for a checked-out client, which createFakePool MODELS from node-postgres/pg-pool behaviour),
 * or anything specific to workerd.
 */
const { createApp } = require('../../../src/worker/app');
const { createRequestDb } = require('../../../src/worker/db');
const { mountRoutes } = require('../../../src/worker/lib/routes');
const { createPlanService } = require('../../../src/worker/services/planService');
const { makeEnv, makeCtx, signToken, seedPlans, createFakeDb } = require('../helpers/harness');

const learningRouter = require('../../../src/worker/routes/learning');
const interviewRouter = require('../../../src/worker/routes/interview');
const resumeChatRouter = require('../../../src/worker/routes/resumeChat');
const careerRoadmapRouter = require('../../../src/worker/routes/careerRoadmap');
const jobPreparationRouter = require('../../../src/worker/routes/jobPreparation');

/** Mount order and prefixes exactly as backend/src/app.js (lines 121-137), restricted to this slice. */
const MOUNTS = [
  ['/api/learning', learningRouter],
  ['/api/interview', interviewRouter],
  ['/api/resume-chat', resumeChatRouter],
  ['/api/career', careerRoadmapRouter],
  ['/api/job-prep', jobPreparationRouter],
];
const PREFIXES = MOUNTS.map(([p]) => p);

const norm = (sql) => sql.replace(/\s+/g, ' ').trim();

/**
 * Test-only copy of extractJSON from backend/src/utils/aiClient.js (working tree), so route tests
 * exercise the real parsing semantics without importing the Express module (which reads process env
 * at load). The real Worker uses getServices(c).aiClient.extractJSON from the infra slice.
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

function createFakeAiClient() {
  return { callAI: jest.fn(async () => ({ ok: false, error: 'unavailable' })), extractJSON: jest.fn(extractJSON) };
}

function createFakeEmbeddings() {
  return {
    // one chunk per non-empty paragraph, like a chunker would; the real one is owned by the infra slice
    chunkText: jest.fn((text) => String(text).split('\n\n').filter(Boolean)),
    embedText: jest.fn(async (chunk) => [chunk.length, 1]),
    findTopSimilarChunks: jest.fn(async (_q, chunks, k) => chunks.slice(0, k).map((c) => ({ text: c.text }))),
  };
}

/**
 * Fake store + pg Pool factory. Recognises exactly the statements the mid1 routes issue (whitespace-normalised) and
 * delegates everything else (audit_logs, subscription_plans, user_subscriptions) to the shared fake db.
 * Throws on unknown SQL so a changed query fails a test loudly.
 *
 * Models pg-pool: connect() registers the client synchronously; end() resolves only once every checked-out
 * client has been released; query() after end() rejects.
 */
function createFakePool(base) {
  const state = {
    learning_roadmaps: [],
    career_roadmaps: [],
    career_discovery_responses: [],
    mock_interviews: [],
    resume_embeddings: [],
  };
  const seq = { learning_roadmaps: 0, career_roadmaps: 0, career_discovery_responses: 0, mock_interviews: 0, resume_embeddings: 0 };
  const calls = [];
  const failures = [];
  let tick = 0; // monotonically increasing created_at so ORDER BY created_at DESC is deterministic
  const mkDate = () => new Date(Date.UTC(2026, 0, 1) + ++tick * 1000);
  const rows = (r) => ({ rows: r, rowCount: r.length });

  const handlers = new Map([
    // ---- learning ------------------------------------------------------------
    [
      'INSERT INTO learning_roadmaps (user_id, gaps, target_role, roadmap, ai_powered) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      ([user_id, gaps, target_role, roadmap, ai_powered]) => {
        const row = { id: ++seq.learning_roadmaps, user_id, gaps, target_role, roadmap, ai_powered, created_at: mkDate() };
        state.learning_roadmaps.push(row);
        return rows([{ id: row.id }]);
      },
    ],
    [
      'SELECT * FROM learning_roadmaps WHERE user_id = $1 ORDER BY created_at DESC LIMIT 10',
      ([userId]) =>
        rows(
          state.learning_roadmaps
            .filter((r) => r.user_id === userId)
            .sort((a, b) => b.created_at - a.created_at)
            .slice(0, 10)
            .map((r) => ({ ...r }))
        ),
    ],

    // ---- career roadmap ------------------------------------------------------
    [
      'INSERT INTO career_roadmaps (user_id, "current_role", target_role, timeframe, roadmap) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      ([user_id, current_role, target_role, timeframe, roadmap]) => {
        const row = { id: ++seq.career_roadmaps, user_id, current_role, target_role, timeframe, roadmap, created_at: mkDate() };
        state.career_roadmaps.push(row);
        return rows([{ id: row.id }]);
      },
    ],
    [
      'SELECT * FROM career_roadmaps WHERE id = $1 AND user_id = $2',
      ([id, userId]) => rows(state.career_roadmaps.filter((r) => String(r.id) === String(id) && r.user_id === userId).map((r) => ({ ...r }))),
    ],
    [
      'SELECT * FROM career_roadmaps WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1',
      ([userId]) =>
        rows(
          state.career_roadmaps
            .filter((r) => r.user_id === userId)
            .sort((a, b) => b.created_at - a.created_at)
            .slice(0, 1)
            .map((r) => ({ ...r }))
        ),
    ],

    // ---- career discovery (working-tree routes) ------------------------------
    [
      'INSERT INTO career_discovery_responses (user_id, answers, sub_answers) VALUES ($1, $2, $3) ON CONFLICT (user_id) DO UPDATE SET answers = EXCLUDED.answers, sub_answers = EXCLUDED.sub_answers, updated_at = NOW() RETURNING id, updated_at',
      ([user_id, answers, sub_answers]) => {
        let row = state.career_discovery_responses.find((r) => r.user_id === user_id);
        if (row) {
          row.answers = answers;
          row.sub_answers = sub_answers;
          row.updated_at = mkDate();
        } else {
          row = { id: ++seq.career_discovery_responses, user_id, answers, sub_answers, updated_at: mkDate() };
          state.career_discovery_responses.push(row);
        }
        return rows([{ id: row.id, updated_at: row.updated_at }]);
      },
    ],
    [
      'SELECT answers, sub_answers, updated_at FROM career_discovery_responses WHERE user_id = $1',
      ([userId]) =>
        rows(
          state.career_discovery_responses
            .filter((r) => r.user_id === userId)
            .map(({ answers, sub_answers, updated_at }) => ({ answers, sub_answers, updated_at }))
        ),
    ],

    // ---- interview -----------------------------------------------------------
    [
      'INSERT INTO mock_interviews (user_id, role, messages, score) VALUES ($1, $2, $3, $4) RETURNING id',
      ([user_id, role, messages, score]) => {
        const row = { id: ++seq.mock_interviews, user_id, role, messages, feedback: null, score, created_at: mkDate() };
        state.mock_interviews.push(row);
        return rows([{ id: row.id }]);
      },
    ],
    [
      'SELECT * FROM mock_interviews WHERE id = $1 AND user_id = $2',
      ([id, userId]) => rows(state.mock_interviews.filter((r) => String(r.id) === String(id) && r.user_id === userId).map((r) => ({ ...r }))),
    ],
    [
      'UPDATE mock_interviews SET messages = $1, score = $2, feedback = $3 WHERE id = $4',
      ([messages, score, feedback, id]) => {
        const hit = state.mock_interviews.filter((r) => String(r.id) === String(id));
        hit.forEach((r) => Object.assign(r, { messages, score, feedback }));
        return { rows: [], rowCount: hit.length };
      },
    ],
    [
      'SELECT id, role, score, created_at FROM mock_interviews WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20',
      ([userId]) =>
        rows(
          state.mock_interviews
            .filter((r) => r.user_id === userId)
            .sort((a, b) => b.created_at - a.created_at)
            .slice(0, 20)
            .map(({ id, role, score, created_at }) => ({ id, role, score, created_at }))
        ),
    ],

    // ---- resume embeddings ---------------------------------------------------
    [
      'DELETE FROM resume_embeddings WHERE resume_id = $1',
      ([resumeId]) => {
        const before = state.resume_embeddings.length;
        state.resume_embeddings = state.resume_embeddings.filter((r) => String(r.resume_id) !== String(resumeId));
        return { rows: [], rowCount: before - state.resume_embeddings.length };
      },
    ],
    [
      'INSERT INTO resume_embeddings (user_id, resume_id, chunk_index, chunk_text, embedding) VALUES ($1, $2, $3, $4, $5)',
      ([user_id, resume_id, chunk_index, chunk_text, embedding]) => {
        state.resume_embeddings.push({ id: ++seq.resume_embeddings, user_id, resume_id, chunk_index, chunk_text, embedding });
        return { rows: [], rowCount: 1 };
      },
    ],
    [
      'SELECT chunk_text, embedding FROM resume_embeddings WHERE user_id = $1 AND resume_id = $2 ORDER BY chunk_index',
      ([userId, resumeId]) =>
        rows(
          state.resume_embeddings
            .filter((r) => r.user_id === userId && String(r.resume_id) === String(resumeId))
            .sort((a, b) => a.chunk_index - b.chunk_index)
            .map(({ chunk_text, embedding }) => ({ chunk_text, embedding }))
        ),
    ],
  ]);

  async function exec(text, params = []) {
    const sql = norm(text);
    calls.push({ sql, params });
    await Promise.resolve();
    const failure = failures.find((f) => f.matcher(sql));
    if (failure) throw failure.error;
    const handler = handlers.get(sql);
    if (handler) return handler(params);
    return base.query(text, params); // audit_logs, plans (throws on anything it does not know)
  }

  const pools = [];

  /** One pool per request, like the Worker (db.js creates a Neon Pool per request); state is shared. */
  function newPool() {
    let ended = false;
    let checkedOut = 0;
    let maxCheckedOut = 0;
    let endResolve = null;
    const finishEnd = () => {
      if (ended && checkedOut === 0 && endResolve) {
        const r = endResolve;
        endResolve = null;
        r();
      }
    };

    const pool = {
      get ended() { return ended; },
      get checkedOut() { return checkedOut; },
      get maxCheckedOut() { return maxCheckedOut; },

      query(text, params) {
        if (ended) return Promise.reject(new Error('Cannot use a pool after calling end on the pool'));
        return exec(text, params);
      },
      connect() {
        checkedOut++; // synchronous, like pg-pool's _clients.push
        maxCheckedOut = Math.max(maxCheckedOut, checkedOut);
        let released = false;
        return Promise.resolve({
          query: (text, params) => exec(text, params),
          release() {
            if (released) throw new Error('Release called on client which has already been released to the pool.');
            released = true;
            checkedOut--;
            finishEnd();
          },
        });
      },
      end() {
        ended = true;
        return new Promise((resolve) => {
          endResolve = resolve;
          finishEnd();
        });
      },
    };
    pools.push(pool);
    return pool;
  }

  return {
    state,
    calls,
    pools,
    newPool,
    lastPool: () => pools[pools.length - 1],
    failWhen(matcher, error) {
      failures.push({ matcher, error });
    },
  };
}

/**
 * Build an app with only the mid1 routers mounted (Express order/prefixes), backed by the real
 * createRequestDb (so the release-after-response behaviour is the real one) over the fake pool.
 *
 * opts.plan     tier_level (1-3) to give user 1, or undefined for no subscription
 * opts.env      env overrides (e.g. { LM_STUDIO_MODEL_INTERVIEW: 'interview-model' })
 * opts.aiClient / opts.embeddings  replace the default fakes
 */
function build({ plan, env, aiClient = createFakeAiClient(), embeddings = createFakeEmbeddings(), mountOnly } = {}) {
  const base = createFakeDb();
  seedPlans(base);
  if (plan) base.state.user_subscriptions.push({ user_id: 1, plan_id: plan });
  const store = createFakePool(base);

  const app = createApp({
    dbFactory: () => createRequestDb(() => store.newPool()),
    servicesFactory: ({ db }) => ({ planService: createPlanService({ db }), aiClient, embeddings }),
  });
  for (const [prefix, router] of MOUNTS) {
    if (!mountOnly || mountOnly === prefix) mountRoutes(app, prefix, router);
  }

  const theEnv = makeEnv(env);
  const ctx = makeCtx();
  const token = signToken({ id: 1 });
  const tokenFor = (id) => signToken({ id });

  /** JSON request helper. auth: true (user 1) | false | number (that user id) */
  const call = (method, path, { body, auth = true, headers = {} } = {}) => {
    const h = { ...headers };
    if (auth) h.Authorization = `Bearer ${auth === true ? token : tokenFor(auth)}`;
    const init = { method, headers: h };
    if (body !== undefined) {
      init.body = JSON.stringify(body);
      h['Content-Type'] = 'application/json';
    }
    return app.request(path, init, theEnv, ctx);
  };

  return {
    app, store, base, ctx, aiClient, embeddings, env: theEnv,
    get: (path, o) => call('GET', path, o),
    post: (path, body, o = {}) => call('POST', path, { ...o, body }),
    call,
    /** wait for background work (waitUntil) and the request db release */
    drain: () => ctx.drain(),
  };
}

/** Resolve when predicate() is truthy (macrotask polling, bounded). */
async function waitFor(predicate, { tries = 200 } = {}) {
  for (let i = 0; i < tries; i++) {
    if (predicate()) return;
    await new Promise((r) => setTimeout(r, 1));
  }
  throw new Error('waitFor: condition not met');
}

module.exports = {
  MOUNTS, PREFIXES, build, createFakePool, createFakeAiClient, createFakeEmbeddings, extractJSON, waitFor, norm, seedPlans,
};
