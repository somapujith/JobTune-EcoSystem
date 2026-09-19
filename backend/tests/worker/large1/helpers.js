'use strict';

/**
 * Helpers private to the "large1" slice tests (community, projectBuilder, courses).
 * Everything is synthetic: made-up secrets (from the shared harness), an in-memory scripted db,
 * a fake aiClient. Nothing here touches a network or a real database.
 */
const { createApp } = require('../../../src/worker/app');
const { createServices } = require('../../../src/worker/services');
const { mountRoutes } = require('../../../src/worker/lib/routes');
const { makeEnv, makeCtx, signToken, seedPlans, createFakeDb } = require('../helpers/harness');

const manifest = require('../../../../docs/migration/manifest.render.json');

const ROUTER_FILES = {
  'backend/src/routes/community.js': () => require('../../../src/worker/routes/community'),
  'backend/src/routes/projectBuilder.js': () => require('../../../src/worker/routes/projectBuilder'),
  'backend/src/routes/courses.js': () => require('../../../src/worker/routes/courses'),
};

/** Manifest mount rows for the three files, in Express registration order (from app.js). */
function large1Mounts() {
  return manifest.mounts
    .filter((m) => Object.prototype.hasOwnProperty.call(ROUTER_FILES, m.routerFile))
    .sort((a, b) => a.order - b.order);
}

/** Manifest endpoints under the three prefixes. */
function large1Endpoints() {
  const prefixes = large1Mounts().map((m) => m.prefix);
  return manifest.endpoints.filter((e) => prefixes.some((p) => e.path === p || e.path.startsWith(`${p}/`)));
}

/** Mount ONLY the three routers with the prefixes the Express app.js used (taken from the manifest). */
function mountLarge1(app) {
  for (const m of large1Mounts()) mountRoutes(app, m.prefix, ROUTER_FILES[m.routerFile]());
  return app;
}

const norm = (sql) => sql.replace(/\s+/g, ' ').trim();

/**
 * A scripted db. `script(sql, params)` (sql whitespace-normalised) sees route-level SQL only and returns
 * `{rows, rowCount?}`, a bare rows array, throws/rejects to simulate a database error, or returns
 * undefined to fall through to the shared in-memory fake. Plan/session/audit SQL is answered by the
 * fake directly. `calls` records the route-level statements.
 */
function makeScriptedDb(script = () => undefined) {
  const fake = createFakeDb();
  const calls = [];
  const db = {
    fake,
    calls,
    async query(text, params = []) {
      const sql = norm(text);
      // infrastructure SQL (audit-log insert, the plan gate's subscription lookup, sessions) always goes
      // to the shared fake and is never shown to the script or recorded in `calls`
      if (/^INSERT INTO audit_logs/.test(sql) || /subscription_plans|user_sessions/.test(sql)) {
        return fake.query(text, params);
      }
      calls.push({ sql, params });
      const out = await script(sql, params);
      if (out === undefined) return fake.query(text, params);
      if (Array.isArray(out)) return { rows: out, rowCount: out.length };
      return { rowCount: out.rows ? out.rows.length : 0, ...out };
    },
    async release() {
      await fake.release();
    },
  };
  return db;
}

/** Verbatim copy of extractJSON from backend/src/utils/aiClient.js, so the fake behaves like the real one. */
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

/** Fake of the infra-owned aiClient service: same callAI/extractJSON surface as utils/aiClient.js. */
function makeAiClient(callAI) {
  const fn = jest.fn(callAI || (async () => ({ ok: false, error: 'no ai in tests', data: null })));
  return { callAI: fn, extractJSON };
}

/**
 * Build an app that mounts only the large1 routers.
 *   plan:   tier (1|2|3) for user 1, or null/undefined for "no plan"
 *   script: scripted db handler (see makeScriptedDb)
 *   aiClient / envOverrides: injected fakes (aiClient: null = the real registry service)
 *   planService: optional override of the whole planService (e.g. one that throws)
 */
function makeLarge1({ plan, script, aiClient = makeAiClient(), envOverrides, planService, userId = 1 } = {}) {
  const db = makeScriptedDb(script);
  seedPlans(db.fake);
  if (plan) db.fake.state.user_subscriptions.push({ user_id: userId, plan_id: plan });

  const env = makeEnv(envOverrides);
  // aiClient: null -> use the real infra-owned service from the registry (see aiClientIntegration.test.js)
  const overrides = {};
  if (aiClient !== null) overrides.aiClient = aiClient;
  if (planService) overrides.planService = planService;
  const app = createApp({
    dbFactory: () => db,
    servicesFactory: ({ db: d, config }) => createServices({ db: d, config, overrides }),
  });
  mountLarge1(app);

  const ctx = makeCtx();
  const token = signToken({ id: userId });
  const request = (p, init = {}) => app.request(p, init, env, ctx);
  const authed = (p, init = {}) =>
    request(p, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init.headers || {}) } });
  const json = (method, p, body, init = {}) =>
    authed(p, {
      method,
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init.headers || {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  return { app, db, env, ctx, token, aiClient, request, authed, json };
}

module.exports = {
  manifest,
  ROUTER_FILES,
  large1Mounts,
  large1Endpoints,
  mountLarge1,
  makeScriptedDb,
  makeAiClient,
  makeLarge1,
  extractJSON,
  norm,
};
