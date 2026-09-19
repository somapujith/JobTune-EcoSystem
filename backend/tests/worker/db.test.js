'use strict';

/**
 * Tests the request-scoped db LIFECYCLE logic (lazy pool, in-flight tracking, release
 * ordering) against a fake pool. This proves our release ordering, NOT that Neon
 * actually frees server-side connections (ADR spike S11 / checklist item 20, unverified).
 */
const { Hono } = require('hono');
const { createRequestDb, dbMiddleware, getDb, createNeonDb } = require('../../src/worker/db');
const { makeEnv, makeCtx } = require('./helpers/harness');

function fakePool() {
  const events = [];
  const pool = {
    events,
    query: jest.fn(async (text, params) => {
      events.push(`query:start:${text}`);
      await new Promise((r) => setTimeout(r, 5));
      events.push(`query:end:${text}`);
      return { rows: [{ ok: true }], rowCount: 1, params };
    }),
    connect: jest.fn(async () => ({ release() {} })),
    end: jest.fn(async () => { events.push('end'); }),
  };
  return pool;
}

describe('createRequestDb', () => {
  it('creates the pool lazily, only on first use', async () => {
    const pool = fakePool();
    const factory = jest.fn(() => pool);
    const db = createRequestDb(factory);
    expect(factory).not.toHaveBeenCalled();
    await db.release(); // never used: nothing to close
    expect(factory).not.toHaveBeenCalled();
    expect(pool.end).not.toHaveBeenCalled();
  });

  it('forwards (text, params) untouched and returns the driver result', async () => {
    const pool = fakePool();
    const db = createRequestDb(() => pool);
    const out = await db.query('SELECT $1', ["'; DROP TABLE users; --"]);
    expect(pool.query).toHaveBeenCalledWith('SELECT $1', ["'; DROP TABLE users; --"]);
    expect(out.rows).toEqual([{ ok: true }]);
    expect(out.rowCount).toBe(1);
  });

  it('reuses one pool for the whole request', async () => {
    const pool = fakePool();
    const factory = jest.fn(() => pool);
    const db = createRequestDb(factory);
    await db.query('a');
    await db.query('b');
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it('release() waits for fire-and-forget queries, THEN ends the pool exactly once', async () => {
    const pool = fakePool();
    const db = createRequestDb(() => pool);
    db.query('slow-audit-insert'); // not awaited by the caller
    const released = db.release();
    await released;
    expect(pool.events).toEqual(['query:start:slow-audit-insert', 'query:end:slow-audit-insert', 'end']);
    await db.release(); // idempotent
    expect(pool.end).toHaveBeenCalledTimes(1);
  });

  it('release() also waits for queries started while it is already draining', async () => {
    const pool = fakePool();
    const db = createRequestDb(() => pool);
    db.query('first').then(() => { db.query('chained'); });
    await db.release();
    expect(pool.events.filter((e) => e.startsWith('query:end'))).toEqual(['query:end:first', 'query:end:chained']);
    expect(pool.events[pool.events.length - 1]).toBe('end');
  });

  it('a failing in-flight query does not stop release', async () => {
    const pool = fakePool();
    pool.query.mockRejectedValueOnce(new Error('boom'));
    const db = createRequestDb(() => pool);
    const p = db.query('bad');
    await expect(p).rejects.toThrow('boom');
    await db.release();
    expect(pool.end).toHaveBeenCalledTimes(1);
  });

  it('rejects (rather than throws) when the pool factory fails, like an async pg error', async () => {
    const db = createRequestDb(() => { throw new Error('DATABASE_URL not set'); });
    const p = db.query('SELECT 1');
    await expect(p).rejects.toThrow('DATABASE_URL not set');
    await expect(db.release()).resolves.toBeUndefined();
  });

  it('refuses queries after release', async () => {
    const pool = fakePool();
    const db = createRequestDb(() => pool);
    await db.query('x');
    await db.release();
    await expect(db.query('y')).rejects.toThrow(/after release/);
  });

  it('logs but swallows an error from pool.end()', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const pool = fakePool();
    pool.end.mockRejectedValueOnce(new Error('ws closed'));
    const db = createRequestDb(() => pool);
    await db.query('x');
    await expect(db.release()).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalledWith('db release error:', 'ws closed');
    console.error.mockRestore();
  });

  it('passes connect() through to the pool', async () => {
    const pool = fakePool();
    const db = createRequestDb(() => pool);
    await db.connect();
    expect(pool.connect).toHaveBeenCalled();
  });
});

describe('dbMiddleware / getDb', () => {
  it('sets c.get("db"), and releases via ctx.waitUntil AFTER the response, once background work settles', async () => {
    const pool = fakePool();
    const db = createRequestDb(() => pool);
    const app = new Hono();
    app.use('*', async (c, next) => { c.set('config', { databaseUrl: 'x' }); return next(); });
    app.use('*', dbMiddleware(() => db));
    app.get('/x', (c) => {
      expect(getDb(c)).toBe(db);
      getDb(c).query('background-write'); // fire and forget
      return c.json({ ok: true });
    });

    const ctx = makeCtx();
    const res = await app.request('/x', {}, makeEnv(), ctx);
    expect(res.status).toBe(200);
    expect(pool.end).not.toHaveBeenCalled(); // still waiting on the background query
    expect(ctx.waits.length).toBe(1); // the release job was handed to waitUntil
    await ctx.drain();
    expect(pool.events).toEqual(['query:start:background-write', 'query:end:background-write', 'end']);
  });

  it('releases even when the handler throws', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const pool = fakePool();
    const db = createRequestDb(() => pool);
    const app = new Hono();
    app.use('*', dbMiddleware(() => db));
    app.get('/x', (c) => { c.get('db').query('q'); throw new Error('handler failed'); });
    app.onError((err, c) => c.json({ error: 'x' }, 500));
    const ctx = makeCtx();
    const res = await app.request('/x', {}, makeEnv(), ctx);
    expect(res.status).toBe(500);
    await ctx.drain();
    expect(pool.end).toHaveBeenCalledTimes(1);
    console.error.mockRestore();
  });

  it('works without an ExecutionContext (tests) and still releases', async () => {
    const pool = fakePool();
    const db = createRequestDb(() => pool);
    const app = new Hono();
    app.use('*', dbMiddleware(() => db));
    app.get('/x', (c) => { c.get('db').query('q'); return c.text('ok'); });
    const res = await app.request('/x', {}, makeEnv());
    expect(res.status).toBe(200);
    await new Promise((r) => setTimeout(r, 30));
    expect(pool.end).toHaveBeenCalledTimes(1);
  });

  it('getDb throws a clear error when the middleware did not run', async () => {
    const app = new Hono();
    app.get('/x', (c) => c.text(String(getDb(c))));
    app.onError((err, c) => c.text(err.message, 500));
    const res = await app.request('/x', {}, makeEnv());
    expect(await res.text()).toMatch(/dbMiddleware must run/);
  });

  it('a fresh db is created per request', async () => {
    const seen = [];
    const app = new Hono();
    app.use('*', dbMiddleware(() => createRequestDb(fakePool)));
    app.get('/x', (c) => { seen.push(c.get('db')); return c.text('ok'); });
    await app.request('/x', {}, makeEnv());
    await app.request('/x', {}, makeEnv());
    expect(seen[0]).not.toBe(seen[1]);
  });
});

describe('createNeonDb (production factory)', () => {
  it('with no DATABASE_URL, queries reject with the config/database.worker.js guidance and no network use', async () => {
    const db = createNeonDb({ databaseUrl: undefined });
    await expect(db.query('SELECT 1')).rejects.toThrow(/DATABASE_URL not set/);
    await db.release();
  });
});

describe('pool error listener (an idle Neon socket dropping must not escape unmasked)', () => {
  it("attaches a listener that logs only the message, so an emitted 'error' cannot throw", async () => {
    const { EventEmitter } = require('events');
    const pool = Object.assign(new EventEmitter(), fakePool());
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const db = createRequestDb(() => pool);
    await db.query('SELECT 1');
    expect(pool.listenerCount('error')).toBe(1);
    const err = new Error('Network connection lost');
    err.stack = 'SECRET-STACK-FRAME at postgres://user:pw@host/db';
    expect(() => pool.emit('error', err)).not.toThrow();
    const logged = spy.mock.calls.flat().join(' ');
    expect(logged).toContain('Network connection lost');
    expect(logged).not.toContain('SECRET-STACK-FRAME');
    spy.mockRestore();
    await db.release();
  });

  it('tolerates pool objects without .on (test fakes)', async () => {
    const db = createRequestDb(() => fakePool());
    await expect(db.query('SELECT 1')).resolves.toBeDefined();
    await db.release();
  });
});

describe('db.hold (post-response background work)', () => {
  it('release() waits for held work, so the pool is not ended under it', async () => {
    const pool = fakePool();
    const db = createRequestDb(() => pool);
    let finish;
    const job = new Promise((r) => { finish = r; }).then(() => pool.events.push('job:done'));
    db.hold(job);
    const released = db.release();
    await new Promise((r) => setTimeout(r, 15));
    expect(pool.end).not.toHaveBeenCalled(); // still held
    await db.query('SELECT 1'); // pool is still usable while held
    finish();
    await released;
    expect(pool.events.indexOf('job:done')).toBeLessThan(pool.events.indexOf('end'));
    expect(pool.end).toHaveBeenCalledTimes(1);
  });

  it('a rejected held promise does not block release and is the caller\'s to handle', async () => {
    const pool = fakePool();
    const db = createRequestDb(() => pool);
    const job = Promise.reject(new Error('boom'));
    const held = db.hold(job);
    await expect(held).rejects.toThrow('boom');
    await db.release();
    expect(pool.end).not.toHaveBeenCalled(); // pool never created (no queries), nothing to end
  });
});

// ---------------------------------------------------------------------------------------------
// Defects proven by the S11 spike (docs/migration/s11-results.md), reproduced here with fakes that
// mimic the real driver's behaviour inside workerd.
describe('driver failures that are not Error instances (S11: bare ErrorEvent on WebSocket connect failure)', () => {
  // What @neondatabase/serverless rejects with when the WebSocket cannot connect (observed in workerd):
  // an ErrorEvent-like object, NOT an Error.
  const errorEventLike = () => ({ type: 'error', message: 'Uncaught Error: Network connection lost.' });

  it('query() rejects with a real Error that keeps the driver message', async () => {
    const pool = fakePool();
    pool.query.mockRejectedValueOnce(errorEventLike());
    const db = createRequestDb(() => pool);
    const err = await db.query('SELECT 1').catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe('Uncaught Error: Network connection lost.');
    await db.release();
  });

  it('keeps a driver error code on the wrapped Error', async () => {
    const pool = fakePool();
    pool.query.mockRejectedValueOnce({ message: 'boom', code: '57P01' });
    const db = createRequestDb(() => pool);
    const err = await db.query('SELECT 1').catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err.code).toBe('57P01');
    await db.release();
  });

  it('passes a genuine Error through unchanged (same object, code intact)', async () => {
    const pool = fakePool();
    const original = Object.assign(new Error('duplicate key'), { code: '23505' });
    pool.query.mockRejectedValueOnce(original);
    const db = createRequestDb(() => pool);
    await expect(db.query('INSERT')).rejects.toBe(original);
    await db.release();
  });

  it('reaches Hono app.onError as masked JSON instead of escaping to the runtime (Hono rethrows non-Error values)', async () => {
    const pool = fakePool();
    pool.query.mockRejectedValue(errorEventLike());
    const app = new Hono();
    app.use('*', dbMiddleware(() => createRequestDb(() => pool)));
    app.onError((err, c) => c.json({ error: 'Internal Server Error' }, 500));
    app.get('/bare', async (c) => { await getDb(c).query('SELECT 1'); return c.text('unreachable'); }); // no try/catch
    const res = await app.request('/bare', {}, makeEnv(), makeCtx());
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal Server Error' });
  });

  it('control: WITHOUT the normalisation a raw non-Error throw escapes Hono onError entirely', async () => {
    const app = new Hono();
    app.onError((err, c) => c.json({ error: 'Internal Server Error' }, 500));
    app.get('/raw', async () => { throw errorEventLike(); });
    await expect(app.request('/raw', {}, makeEnv(), makeCtx())).rejects.toMatchObject({ type: 'error' });
  });

  it('connect() also rejects with a real Error', async () => {
    const pool = fakePool();
    pool.connect.mockRejectedValueOnce(errorEventLike());
    const db = createRequestDb(() => pool);
    const err = await db.connect().catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe('Uncaught Error: Network connection lost.');
    await db.release();
  });
});

describe('pool / client error events: teardown noise vs real drops', () => {
  const { EventEmitter } = require('events');
  const emitterPool = () => Object.assign(new EventEmitter(), fakePool());

  it('an error arriving AFTER release() began (workerd reports one for every socket the driver closed) is not logged', async () => {
    const pool = emitterPool();
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const db = createRequestDb(() => pool);
    await db.query('SELECT 1');
    await db.release();
    expect(() => pool.emit('error', { type: 'error', message: 'Uncaught Error: Network connection lost.' })).not.toThrow();
    expect(errSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
    errSpy.mockRestore(); warnSpy.mockRestore();
  });

  it('a non-Error event before release is a warning (ambiguous), a real Error is an error', async () => {
    const pool = emitterPool();
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const db = createRequestDb(() => pool);
    await db.query('SELECT 1');
    pool.emit('error', { type: 'error', message: 'Uncaught Error: Network connection lost.' });
    expect(warnSpy.mock.calls.flat().join(' ')).toContain('Network connection lost');
    expect(errSpy).not.toHaveBeenCalled();
    pool.emit('error', Object.assign(new Error('terminating connection due to administrator command'), { code: '57P01' }));
    expect(errSpy.mock.calls.flat().join(' ')).toContain('terminating connection');
    errSpy.mockRestore(); warnSpy.mockRestore();
    await db.release();
  });

  it('connect(): a checked-out client gets its own error listener (the pool listener does not cover it)', async () => {
    // Real pg-pool detaches its idle listener on checkout: a connection dying between two queries of a checked-out
    // client was an uncaught "Unhandled error" in workerd (S11 spike, scenario dbjs-checkedout-kill).
    const client = Object.assign(new EventEmitter(), { query: jest.fn(async () => ({ rows: [], rowCount: 0 })), release: jest.fn() });
    const pool = emitterPool();
    pool.connect = jest.fn(async () => client);
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const db = createRequestDb(() => pool);
    const got = await db.connect();
    expect(got).toBe(client);
    expect(client.listenerCount('error')).toBe(1);
    const dead = Object.assign(new Error('terminating connection due to administrator command'), { code: '57P01', stack: 'SECRET-STACK postgres://u:pw@h/db' });
    expect(() => client.emit('error', dead)).not.toThrow();
    const logged = errSpy.mock.calls.flat().join(' ');
    expect(logged).toContain('terminating connection');
    expect(logged).not.toContain('SECRET-STACK');
    errSpy.mockRestore();
    got.release();
    await db.release();
  });

  it('connect(): callback form is passed through untouched', async () => {
    const pool = fakePool();
    const db = createRequestDb(() => pool);
    const cb = jest.fn();
    db.connect(cb);
    expect(pool.connect).toHaveBeenCalledWith(cb);
    await db.release();
  });

  it('a released db refuses connect() with a real Error', async () => {
    const db = createRequestDb(() => fakePool());
    await db.query('x');
    await db.release();
    await expect(db.connect()).rejects.toThrow(/after release/);
  });
});
