'use strict';

/**
 * Request-scoped database access   (ADR-001 sections 5, 6.5, 10; task T1.2)
 *
 * getDb(c) returns an object with the pg-Pool query surface the ported code uses:
 *   db.query(text, params) -> Promise<{ rows, rowCount, ... }>     ($n binding preserved)
 *   db.connect()           -> passthrough to the underlying pool (no Express-era
 *                             code used it; provided for parity)
 * plus db.release(), which is called by dbMiddleware, never by handlers.
 *
 * LIFECYCLE
 *   - dbMiddleware runs once per request and creates a RequestDb via the injected
 *     `dbFactory(config, c)`. Production uses createNeonDb (below); tests inject
 *     an in-memory fake, so no test ever touches a network.
 *   - The Neon Pool is created LAZILY on the first query, so requests that never
 *     touch the database (e.g. /api/health once audit logging is off) cost nothing.
 *   - db.hold(promise) registers post-response background work that uses this db
 *     (e.g. a job started with safeWaitUntil). release() waits for held promises too,
 *     so the pool is not ended under them. Prefer it over keeping a checked-out client.
 *   - A pool 'error' listener is attached on creation: an idle Neon socket dropping
 *     ("Network connection lost") emits 'error' on the pool, and an unhandled 'error'
 *     event throws out of the isolate as an unmasked runtime error instead of the
 *     masked 500 JSON. The listener logs the message only (never the stack or URL).
 *   - After the response is produced, dbMiddleware hands db.release() to
 *     ctx.waitUntil(). release() first waits for every query still in flight
 *     (audit-log inserts, touchSession, ... all issued through this db and
 *     tracked), then calls pool.end(). So fire-and-forget queries are never cut
 *     off by the pool closing under them.
 *
 * UNVERIFIED (ADR S11): that Neon actually frees the server-side connection
 * promptly after pool.end() inside a Worker, and that a per-request Pool does not
 * exhaust Neon's connection limit under concurrent load (checklist item 20).
 * This file implements the ADR-specified release strategy; it does not prove it.
 * Do not treat "tests pass" as evidence for it.
 *
 * SQL SAFETY: the object only forwards (text, params) to the driver; it never
 * interpolates. Always pass values through $1..$n params.
 */
const { getConfig } = require('./lib/context');
const { tagMiddleware } = require('./lib/tag');
const { safeWaitUntil } = require('./lib/http');

/**
 * Wrap a pool factory into the request-scoped db object.
 * @param {() => {query: Function, end: Function, connect?: Function}} poolFactory
 */
function createRequestDb(poolFactory) {
  let pool = null;
  let released = false;
  const inflight = new Set();

  const getPool = () => {
    if (released) throw new Error('db used after release');
    if (!pool) {
      pool = poolFactory();
      if (pool && typeof pool.on === 'function') {
        pool.on('error', (err) => console.error('db pool error:', err && err.message));
      }
    }
    return pool;
  };

  const track = (p) => {
    inflight.add(p);
    const done = () => inflight.delete(p);
    p.then(done, done);
    return p;
  };

  return {
    query(...args) {
      let p;
      try {
        p = Promise.resolve(getPool().query(...args));
      } catch (err) {
        p = Promise.reject(err);
      }
      return track(p);
    },

    connect(...args) {
      return getPool().connect(...args);
    },

    /**
     * Keep the pool open until `promise` settles (background work after the response).
     * Returns the promise unchanged. A rejection is the caller's to handle; release()
     * only waits for settlement.
     */
    hold(promise) {
      return track(Promise.resolve(promise));
    },

    /** Wait for in-flight queries, then close the pool. Idempotent, never throws. */
    async release() {
      if (released) return;
      await Promise.resolve(); // let synchronously-scheduled work register first
      while (inflight.size > 0) {
        await Promise.allSettled([...inflight]);
      }
      released = true;
      if (pool) {
        try {
          await pool.end();
        } catch (err) {
          console.error('db release error:', err.message);
        }
      }
    },
  };
}

/**
 * Production factory: Neon serverless Pool via the existing config/database.worker.js.
 * `getPool` there expects an env-like object with DATABASE_URL.
 */
function createNeonDb(config) {
  const { getPool } = require('../config/database.worker'); // src/config/database.worker.js (shared, unchanged)
  return createRequestDb(() => getPool({ DATABASE_URL: config.databaseUrl }));
}

/** The dbFactory used unless createApp({ dbFactory }) overrides it. */
const defaultDbFactory = (config) => createNeonDb(config);

/**
 * Middleware: puts a request-scoped db on the context and releases it after the
 * response. Must run after configMiddleware and before anything that queries.
 * @param {(config: object, c: object) => object} dbFactory
 */
function dbMiddleware(dbFactory = defaultDbFactory) {
  const mw = async (c, next) => {
    const db = dbFactory(getConfig(c), c);
    c.set('db', db);
    try {
      await next();
    } finally {
      if (typeof db.release === 'function') {
        const job = Promise.resolve()
          .then(() => db.release())
          .catch((err) => console.error('db release error:', err && err.message));
        safeWaitUntil(c, job);
      }
    }
  };
  return tagMiddleware(mw, 'dbMiddleware', { kind: 'context' });
}

/** Contract accessor (ADR section 10). */
function getDb(c) {
  const db = c.get('db');
  if (!db) throw new Error('db not initialised: dbMiddleware must run before this handler');
  return db;
}

module.exports = { getDb, dbMiddleware, createRequestDb, createNeonDb, defaultDbFactory };
