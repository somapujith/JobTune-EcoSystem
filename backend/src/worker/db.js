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
 *     emits 'error' on the pool, and an unhandled 'error' event is an uncaught exception
 *     in the isolate. The listener logs the message only (never the stack or URL). Errors
 *     that arrive after release() has begun are expected teardown noise (workerd reports
 *     "Network connection lost" on every WebSocket the driver itself just closed) and are
 *     not logged. Same for clients handed out by connect(): a checked-out client is NOT
 *     covered by the pool listener, so connect() attaches its own.
 *   - Driver failures that are not Error instances (a WebSocket connect failure rejects
 *     with a bare ErrorEvent, message "Network connection lost") are wrapped into an Error:
 *     Hono only routes `instanceof Error` throws to app.onError; anything else escapes to
 *     the runtime as an unmasked "Uncaught Error" page (S11 spike, docs/migration/s11-results.md).
 *   - After the response is produced, dbMiddleware hands db.release() to
 *     ctx.waitUntil(). release() first waits for every query still in flight
 *     (audit-log inserts, touchSession, ... all issued through this db and
 *     tracked), then calls pool.end(). So fire-and-forget queries are never cut
 *     off by the pool closing under them.
 *
 * VERIFIED LOCALLY (S11 spike, docs/migration/s11-results.md): against Postgres 17 through Neon's
 * open-source wsproxy inside workerd, a per-request Pool released via ctx.waitUntil(db.release())
 * frees the server connection within ~10 ms of the response and the count returns to baseline.
 * NOT VERIFIED (needs a hosted Neon branch): the same against Neon's real proxy/pooler, and the
 * real connection ceiling under concurrent load (checklist item 20).
 * Do not treat "tests pass" as evidence for either.
 *
 * SQL SAFETY: the object only forwards (text, params) to the driver; it never
 * interpolates. Always pass values through $1..$n params.
 */
const { getConfig } = require('./lib/context');
const { tagMiddleware } = require('./lib/tag');
const { safeWaitUntil } = require('./lib/http');

/**
 * The Neon driver rejects with a bare ErrorEvent (not an Error) when its WebSocket cannot connect or
 * drops. Normalise to a real Error, keeping the driver's message and code, so Hono's onError sees it.
 */
function toError(err) {
  if (err instanceof Error) return err;
  const message = (err && err.message) || (typeof err === 'string' ? err : '') || 'database connection error';
  const wrapped = new Error(message);
  if (err && err.code) wrapped.code = err.code;
  wrapped.cause = err;
  return wrapped;
}

/** Log a driver error event: message only (never the stack or the connection string). */
function logDriverError(where, err) {
  const msg = err && err.message;
  // A non-Error event (ErrorEvent) is what workerd emits for every WebSocket close, including the ones we
  // cause ourselves; a real Error (57P01, "Connection terminated unexpectedly") is a genuine server-side drop.
  (err instanceof Error ? console.error : console.warn)(`${where}:`, msg);
}

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
        pool.on('error', (err) => {
          if (released) return; // teardown noise: workerd reports an error for sockets we just closed
          logDriverError('db pool error', err);
        });
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
      return track(p.catch((err) => { throw toError(err); }));
    },

    /**
     * Check out a dedicated client (pg-Pool surface). Promise form only gets the hardening; the
     * callback form is passed straight through. The pool's 'error' listener does not see a checked-out
     * client, so one is attached here: a connection dying between two queries would otherwise be an
     * uncaught exception (proved in the S11 spike). release() still waits for the client (pool.end()
     * does not resolve while a client is checked out), so callers MUST client.release() in a finally.
     */
    connect(...args) {
      if (typeof args[args.length - 1] === 'function') return getPool().connect(...args);
      let p;
      try {
        p = Promise.resolve(getPool().connect(...args));
      } catch (err) {
        p = Promise.reject(err);
      }
      return p.then(
        (client) => {
          if (client && typeof client.on === 'function') {
            client.on('error', (err) => { if (!released) logDriverError('db client error', err); });
          }
          return client;
        },
        (err) => { throw toError(err); },
      );
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
