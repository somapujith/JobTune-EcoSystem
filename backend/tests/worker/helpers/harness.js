'use strict';

/**
 * Shared test harness for tests/worker/*. Everything here is synthetic: secrets are
 * made-up strings, the db is the in-memory fake, and requests never leave the process.
 */
const jsonwebtoken = require('jsonwebtoken');
const { createApp } = require('../../../src/worker/app');
const { createRouter, mountRoutes } = require('../../../src/worker/lib/routes');
const { createFakeDb } = require('./fakeDb');

// 48 random-looking characters, generated for this test suite only (not any real secret)
const TEST_JWT_SECRET = 'tQ7vR2mZk9LxP4wHc8NfB3sYd6JgA1eUo5TiKq0XzWrVbM2n';
const TEST_ORIGIN = 'https://app.example.test';

/** A fresh env object every call (createConfig memoizes on object identity). */
function makeEnv(overrides = {}) {
  return {
    JWT_SECRET: TEST_JWT_SECRET,
    FRONTEND_URL: TEST_ORIGIN,
    DATABASE_URL: 'postgres://synthetic-user:synthetic-pass@127.0.0.1:1/none',
    // Permissive stand-ins for the Workers Rate Limiting bindings, so the "limiter not
    // configured" warning does not spam every suite. Tests of the unconfigured path pass
    // { API_LIMITER: undefined } explicitly.
    API_LIMITER: { limit: async () => ({ success: true }) },
    AUTH_LIMITER: { limit: async () => ({ success: true }) },
    ...overrides,
  };
}

/** Minimal ExecutionContext that records waitUntil promises so tests can await them. */
function makeCtx() {
  const waits = [];
  return {
    waits,
    waitUntil: (p) => { waits.push(p); },
    passThroughOnException() {},
    async drain() {
      // background work may schedule more background work
      let seen = 0;
      while (seen < waits.length) {
        const batch = waits.slice(seen);
        seen = waits.length;
        await Promise.allSettled(batch);
      }
    },
  };
}

function signToken(claims, { secret = TEST_JWT_SECRET, ...options } = {}) {
  return jsonwebtoken.sign(claims, secret, { algorithm: 'HS256', ...options });
}

/**
 * Build an app wired to a fake db, plus a `/api/_t` router with the protected test routes:
 *   GET /api/_t/open            no auth
 *   GET /api/_t/protected       authenticateToken
 *   GET /api/_t/tier2           authenticateToken + requirePlan(2)
 */
function makeHarness({ env, db = createFakeDb(), configureApp } = {}) {
  const { authenticateToken } = require('../../../src/worker/middleware/auth');
  const { requirePlan } = require('../../../src/worker/middleware/requirePlan');

  const theEnv = env || makeEnv();
  const app = createApp({ dbFactory: () => db });
  const router = createRouter();
  router.get('/open', (c) => c.json({ ok: true }));
  router.get('/protected', authenticateToken, (c) => c.json({ user: c.get('user'), ip: c.get('clientIp') }));
  router.get('/tier2', authenticateToken, requirePlan(2), (c) => c.json({ plan: c.get('userPlan').name }));
  router.post('/echo', (c) => c.json({ body: c.get('body') === undefined ? null : c.get('body') }));
  router.get('/boom', () => {
    throw new Error('secret internal detail: postgres://user:pw@host/db');
  });
  router.get('/teapot', () => {
    const err = new Error('I am a teapot');
    err.status = 418;
    throw err;
  });
  mountRoutes(app, '/api/_t', router);
  if (configureApp) configureApp(app);

  const ctx = makeCtx();
  const request = (path, init = {}) => app.request(path, init, theEnv, ctx);
  return { app, db, env: theEnv, ctx, request };
}

function seedPlans(db) {
  db.state.subscription_plans.push(
    { id: 1, name: 'Learn & Build', tier_level: 1, price: 0 },
    { id: 2, name: 'Tune & Polish', tier_level: 2, price: 10 },
    { id: 3, name: 'Zero to Hero', tier_level: 3, price: 20 }
  );
}

const bearer = (token) => ({ headers: { Authorization: `Bearer ${token}` } });

module.exports = { TEST_JWT_SECRET, TEST_ORIGIN, makeEnv, makeCtx, signToken, makeHarness, seedPlans, bearer, createFakeDb };
