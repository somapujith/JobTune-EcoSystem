'use strict';

/**
 * Test harness for the `jobs` slice (owned by the jobs slice; copies the pattern of tests/worker/helpers/harness.js
 * without editing it). Everything is synthetic: a made-up JWT secret, the in-memory fake db, a scripted AI client.
 *
 * What it builds:
 *   - createApp() with the six /api/jobs routers mounted in the Express order (mountJobsRoutes),
 *   - a hand-built service container (not createServices, so other slices' work-in-progress cannot break
 *     these tests) exposing planService (real, over the fake db), aiClient / onetLoader (fakes), the two v2
 *     analyzers (the ORIGINAL Express classes, which is the infra contract: the original modules' exports)
 *     and the three services this slice owns (built from the real factories).
 *   - a db whose non-infra statements go through a script(sql, params) function and are recorded in `appCalls`.
 */
const { createApp } = require('../../../src/worker/app');
const { mountRoutes } = require('../../../src/worker/lib/routes');
const { createPlanService } = require('../../../src/worker/services/planService');
const { createAchievementEnhancerService } = require('../../../src/worker/services/achievementEnhancerService');
const { createDiscovery } = require('../../../src/worker/services/discovery');
const { createJobFitScorer } = require('../../../src/worker/services/scoring/strategies/jobFit');
const { makeEnv, makeCtx, signToken, seedPlans, createFakeDb } = require('../helpers/harness');

/** [prefix, route file] in the exact order of backend/src/app.js (mount orders 14, 17, 18, 23, 24, 29). */
const JOBS_MOUNTS = [
  ['/api/jobs', 'jobTracker'],
  ['/api/jobs', 'jobAnalyzer'],
  ['/api/jobs', 'coverLetter'],
  ['/api/jobs', 'jobDiscovery'],
  ['/api/jobs', 'jobFit'],
  ['/api/jobs/achievement-enhancer', 'achievementEnhancer'],
];

function mountJobsRoutes(app) {
  for (const [prefix, name] of JOBS_MOUNTS) {
    mountRoutes(app, prefix, require(`../../../src/worker/routes/${name}`));
  }
  return app;
}

const norm = (sql) => sql.replace(/\s+/g, ' ').trim();

// statements owned by the foundation (plans, audit, sessions): served by the fake db itself
const INFRA_SQL = /^(SELECT \* FROM subscription_plans|SELECT sp\.\* FROM subscription_plans|INSERT INTO audit_logs|INSERT INTO user_subscriptions|UPDATE user_sessions|SELECT id FROM user_sessions)/;

function makeFakeAiClient(extractJSON) {
  const calls = [];
  const client = {
    calls,
    // default: the AI provider is down (ok:false), so routes take their rule-based fallbacks
    reply: { ok: false, error: 'provider down', data: null },
    async callAI(opts) {
      calls.push(opts);
      if (client.reply instanceof Error) throw client.reply;
      return typeof client.reply === 'function' ? client.reply(opts) : client.reply;
    },
    extractJSON,
  };
  return client;
}

/** Deterministic stand-in for the (infra-owned) onetLoader: nothing is recognised, so domain score is 50. */
const nullOnetLoader = { findOccupation: () => null, getDomain: (o) => (o && o.domain) || 'Unknown' };

function buildServices({ db, config, fakes }) {
  const services = {};
  const define = (name, factory) => {
    let instance;
    Object.defineProperty(services, name, {
      enumerable: true,
      get() {
        if (instance === undefined) instance = factory();
        return instance;
      },
    });
  };
  define('planService', () => createPlanService({ db }));
  define('aiClient', () => fakes.aiClient);
  define('onetLoader', () => fakes.onetLoader);
  define('actionVerbAnalyzer', () => require('../../../src/services/v2/actionVerbAnalyzer'));
  define('metricsAnalyzer', () => require('../../../src/services/v2/metricsAnalyzer'));
  define('achievementEnhancerService', () => createAchievementEnhancerService({ services }));
  define('discovery', () => fakes.discovery || createDiscovery({ config, fetch: fakes.fetch }));
  define('jobFit', () => createJobFitScorer({ config, services }));
  return Object.freeze(services);
}

/**
 * @param {object} [opts]
 * @param {number|null} [opts.tier]   subscription tier of the test user (null = no subscription row)
 * @param {number} [opts.userId]
 * @param {(sql: string, params: any[]) => any} [opts.script]  answers app statements (return {rows}); may throw
 * @param {object} [opts.envOverrides]
 * @param {object} [opts.fakes]       { aiClient, onetLoader, fetch, discovery }
 * @param {(app) => void} [opts.mount] defaults to mountJobsRoutes
 */
function makeJobsHarness({ tier = 3, userId = 7, script, envOverrides = {}, fakes = {}, mount = mountJobsRoutes } = {}) {
  const db = createFakeDb();
  seedPlans(db);
  if (tier) db.state.user_subscriptions.push({ user_id: userId, plan_id: tier });

  const realQuery = db.query.bind(db);
  const appCalls = [];
  const defaultScript = () => ({ rows: [], rowCount: 0 });
  db.query = (sql, params = []) => {
    const n = norm(sql);
    if (INFRA_SQL.test(n)) return realQuery(sql, params);
    appCalls.push({ sql: n, params });
    return (async () => {
      await Promise.resolve();
      return (script || defaultScript)(n, params);
    })();
  };

  const { extractJSON } = require('../../../src/utils/aiClient');
  const allFakes = {
    aiClient: makeFakeAiClient(extractJSON),
    onetLoader: nullOnetLoader,
    fetch: async () => { throw new Error('unexpected outbound fetch in a jobs test'); },
    ...fakes,
  };

  const env = makeEnv(envOverrides);
  const app = createApp({
    dbFactory: () => db,
    servicesFactory: ({ db: requestDb, config }) => buildServices({ db: requestDb, config, fakes: allFakes }),
  });
  mount(app);

  const ctx = makeCtx();
  const token = signToken({ id: userId });
  const request = (path, init = {}) => app.request(path, init, env, ctx);

  /** authenticated JSON call; body === undefined sends no body at all */
  const call = (method, path, body, { auth = true, headers = {} } = {}) => {
    const h = { ...headers };
    if (auth) h.Authorization = `Bearer ${token}`;
    const init = { method, headers: h };
    if (body !== undefined) {
      h['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    }
    return request(path, init);
  };

  return { app, db, env, ctx, token, request, call, appCalls, fakes: allFakes };
}

module.exports = { makeJobsHarness, mountJobsRoutes, JOBS_MOUNTS, buildServices, makeFakeAiClient, nullOnetLoader, createFakeDb, norm };
