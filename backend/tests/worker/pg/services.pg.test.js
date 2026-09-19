'use strict';

/**
 * The Worker's SERVICES run against a REAL PostgreSQL through the real createRequestDb (src/worker/db.js) over a real
 * pg.Pool. Skipped unless JT_VALIDATE_DB_URL is set (and refused unless its host is local: these tests write).
 *
 * Why: until this suite existed, every Worker service test ran against tests/worker/helpers/fakeDb.js, an in-memory
 * model that matches SQL TEXT and returns JS values the author chose. It cannot show what Postgres and node-pg really
 * return: bigint COUNT as string, NUMERIC as string, DATE/TIMESTAMP as Date in the process time zone, jsonb parsing,
 * ON CONFLICT arbiter inference, NOT NULL / varchar length limits, row-level locking. Each test below states what it
 * proves; the "REAL vs FAKE" comments name where the fake differs.
 *
 * Schema: a scratch schema built from the repository's own DDL (see pgHarness.js), dropped afterwards.
 */
const {
  describePg, createScratchSchema, requestDb,
} = require('./pgHarness');
const { createRequestDb } = require('../../../src/worker/db');
const { createPlanService } = require('../../../src/worker/services/planService');
const { createSessionService } = require('../../../src/worker/services/sessionService');
const { createProgressService } = require('../../../src/worker/services/progressService');
const { createStudyHistoryService } = require('../../../src/worker/services/studyHistoryService');
const { createActivityService } = require('../../../src/worker/services/activityService');
const { createResumeDatabase } = require('../../../src/worker/services/resumeDatabase');
const { createConfig } = require('../../../src/worker/config');
const { makeEnv } = require('../helpers/harness');

const pad = (n) => String(n).padStart(2, '0');
/** 'YYYY-MM-DD HH:MM:SS' of a Date in the PROCESS time zone (what node-pg sends for a Date parameter). */
const localWallClock = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

describePg('Worker services on a real PostgreSQL (scratch schema built from the repository DDL)', () => {
  jest.setTimeout(60000);

  let schema;
  let db;
  let seq = 0;
  const newUser = async (label = 'u') => {
    seq += 1;
    const r = await schema.query(
      'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id',
      [`${label}${seq}@pg-test.invalid`, 'synthetic-not-a-real-hash']
    );
    return r.rows[0].id;
  };

  beforeAll(async () => {
    schema = await createScratchSchema();
    db = requestDb(schema);
  });

  afterAll(async () => {
    if (db) await db.release();
    if (schema) await schema.drop();
  });

  /* ------------------------------------------------------------------------------------------ */
  describe('createRequestDb over a real pg.Pool', () => {
    it('returns the pg Result shape: rows, rowCount, command, fields', async () => {
      const r = await db.query('SELECT 1::int AS one, $1::text AS t', ['x']);
      expect(r.rows).toEqual([{ one: 1, t: 'x' }]);
      expect(r.rowCount).toBe(1);
      expect(r.command).toBe('SELECT');
      expect(r.fields.map((f) => f.name)).toEqual(['one', 't']);
    });

    it('rowCount of UPDATE / INSERT ... ON CONFLICT DO NOTHING is the affected-row count (0 when nothing matched)', async () => {
      const u = await newUser();
      const none = await db.query('UPDATE users SET role = $1 WHERE id = $2', ['x', u + 1000000]);
      expect(none).toMatchObject({ rowCount: 0, command: 'UPDATE', rows: [] });
      const one = await db.query('UPDATE users SET role = $1 WHERE id = $2', ['member', u]);
      expect(one.rowCount).toBe(1);
      const ach1 = await db.query('INSERT INTO student_achievements (user_id, achievement_key) VALUES ($1, $2) ON CONFLICT DO NOTHING', [u, 'k']);
      const ach2 = await db.query('INSERT INTO student_achievements (user_id, achievement_key) VALUES ($1, $2) ON CONFLICT DO NOTHING', [u, 'k']);
      expect([ach1.rowCount, ach2.rowCount]).toEqual([1, 0]);
    });

    it('a hostile value is data, never SQL (ADR 6.5 spot check): the table survives and the text round-trips verbatim', async () => {
      const u = await newUser();
      const evil = "'; DROP TABLE user_progress; --";
      await createProgressService({ db }).saveProgress(u, 'preferences', { note: evil });
      const back = await createProgressService({ db }).getProgress(u, 'preferences');
      expect(back.data.note).toBe(evil);
      const exists = await schema.query('SELECT to_regclass($1) AS t', [`${schema.name}.user_progress`]);
      expect(exists.rows[0].t).not.toBeNull();
    });

    it('errors carry the Postgres SQLSTATE in .code (the fake throws plain Errors)', async () => {
      await expect(db.query('SELECT * FROM no_such_table_xyz')).rejects.toMatchObject({ code: '42P01' });
      await expect(db.query('SELECT $1::int', ['abc'])).rejects.toMatchObject({ code: '22P02' });
    });

    it('release() waits for a fire-and-forget query, then ends the real pool; use after release throws', async () => {
      let pool;
      const d = createRequestDb(() => { pool = schema.newPool(2); return pool; });
      const slow = d.query('SELECT pg_sleep(0.3), 42 AS answer');
      await d.release();
      const r = await slow; // completed, not cut off by pool.end()
      expect(r.rows[0].answer).toBe(42);
      expect(pool.ended).toBe(true);
      expect(pool.totalCount).toBe(0);
      expect(() => d.query('SELECT 1')).not.toThrow(); // returns a rejected promise, tracked
      await expect(d.query('SELECT 1')).rejects.toThrow('db used after release');
      await d.release(); // idempotent
    });

    it('connect() is a passthrough to a real pooled client', async () => {
      const client = await db.connect();
      try {
        const r = await client.query('SELECT current_schema() AS s');
        expect(r.rows[0].s).toBe(schema.name);
      } finally {
        client.release();
      }
    });
  });

  /* ------------------------------------------------------------------------------------------ */
  describe('driver value types (what the services really receive)', () => {
    it('COUNT / SUM(bigint) / AVG come back as STRINGS; ::INTEGER casts and plain integer columns as numbers', async () => {
      const r = await db.query(
        `SELECT COUNT(*) AS c, COUNT(*)::INTEGER AS ci, SUM(x)::INTEGER AS si, SUM(x::bigint) AS sb, AVG(x) AS a, MAX(x) AS m
         FROM (VALUES (1), (2), (4)) AS t(x)`
      );
      expect(r.rows[0]).toEqual({ c: '3', ci: 3, si: 7, sb: '7', a: '2.3333333333333333', m: 4 });
    });

    it('DATE is a Date at LOCAL midnight; TIMESTAMP (without zone) is a Date read in the process zone; NUMERIC is a string; TEXT[] is an array', async () => {
      const r = await db.query("SELECT DATE '2026-03-05' AS d, TIMESTAMP '2026-03-05 10:20:30' AS ts, 199::numeric(10,2) AS n, ARRAY['a','b']::text[] AS arr");
      const { d, ts, n, arr } = r.rows[0];
      expect(d).toBeInstanceOf(Date);
      expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()]).toEqual([2026, 2, 5, 0]);
      expect([ts.getHours(), ts.getMinutes(), ts.getSeconds()]).toEqual([10, 20, 30]);
      expect(n).toBe('199.00');
      expect(arr).toEqual(['a', 'b']);
    });

    it('a JS ARRAY parameter is sent as a Postgres array literal, so it must be JSON.stringify-ed for a jsonb column (a plain object is stringified by pg)', async () => {
      await expect(db.query("SELECT $1::jsonb AS j", [[1, 2]])).rejects.toMatchObject({ code: '22P02' });
      const ok = await db.query('SELECT $1::jsonb AS j', [JSON.stringify([1, 2])]);
      expect(ok.rows[0].j).toEqual([1, 2]);
      const obj = await db.query('SELECT $1::jsonb AS j', [{ a: 1 }]);
      expect(obj.rows[0].j).toEqual({ a: 1 });
    });
  });

  /* ------------------------------------------------------------------------------------------ */
  describe('planService', () => {
    let plans;
    beforeAll(() => { plans = createPlanService({ db }); });

    it('getAllPlans returns the three seeded plans ordered by tier_level; NUMERIC price is a string, features a real array', async () => {
      const all = await plans.getAllPlans();
      expect(all.map((p) => p.tier_level)).toEqual([1, 2, 3]);
      expect(all.map((p) => p.name)).toEqual(['Learn & Build', 'Tune & Polish', 'Zero to Hero']);
      expect(all[0].price).toBe('199.00'); // REAL vs FAKE: the fake returns whatever number the test seeded
      expect(Array.isArray(all[0].features)).toBe(true);
      expect(all[0].created_at).toBeInstanceOf(Date);
    });

    it('getPlanById / getPlanByName: hit and miss (miss is null)', async () => {
      const z = await plans.getPlanByName('Zero to Hero');
      expect(z.tier_level).toBe(3);
      expect((await plans.getPlanById(z.id)).name).toBe('Zero to Hero');
      expect(await plans.getPlanById(987654)).toBeNull();
      expect(await plans.getPlanByName('nope')).toBeNull();
    });

    it('a non-numeric plan id is a Postgres error 22P02 (the fake just finds nothing)', async () => {
      await expect(plans.getPlanById('abc')).rejects.toMatchObject({ code: '22P02' });
    });

    it('assignPlan: ON CONFLICT (user_id) upserts into ONE row; getUserPlan joins to the current plan', async () => {
      const u = await newUser();
      const p1 = await plans.getPlanByName('Learn & Build');
      const p3 = await plans.getPlanByName('Zero to Hero');
      const a = await plans.assignPlan(u, p1.id);
      const b = await plans.assignPlan(u, p3.id);
      expect(b.id).toBe(a.id);
      expect(b.plan_id).toBe(p3.id);
      expect(b.status).toBe('active');
      expect(b.selected_at).toBeInstanceOf(Date);
      expect((await plans.getUserPlan(u)).tier_level).toBe(3);
      const n = await schema.query('SELECT COUNT(*)::int AS n FROM user_subscriptions WHERE user_id = $1', [u]);
      expect(n.rows[0].n).toBe(1);
      expect(await plans.getUserPlan(await newUser())).toBeNull();
    });

    it('saveOnboardingResponse: TEXT[] round trip and upsert on (user_id); onboarding flag toggles', async () => {
      const u = await newUser();
      const p = await plans.getPlanByName('Tune & Polish');
      const first = await plans.saveOnboardingResponse(u, {
        career_goal: 'backend', experience_level: 'junior', pain_points: ['resume', 'interviews'], recommended_plan_id: p.id,
      });
      expect(first.pain_points).toEqual(['resume', 'interviews']);
      expect(first.field_of_interest).toBeNull();
      const second = await plans.saveOnboardingResponse(u, {
        career_goal: 'data', experience_level: 'mid', pain_points: [], field_of_interest: 'ml', recommended_plan_id: p.id,
      });
      expect(second.id).toBe(first.id);
      expect(second).toMatchObject({ career_goal: 'data', pain_points: [], field_of_interest: 'ml' });
      expect((await plans.getUserOnboardingResponse(u)).career_goal).toBe('data');
      expect(await plans.getOnboardingCompleted(u)).toBe(false);
      await plans.setOnboardingCompleted(u);
      expect(await plans.getOnboardingCompleted(u)).toBe(true);
    });

    it('createOrder + markOrderPaid: the single-statement compare-and-set marks paid ONCE; the second call returns null and paid_at does not move (ADR 6.4)', async () => {
      const u = await newUser();
      const p = await plans.getPlanByName('Learn & Build');
      const { order, plan } = await plans.createOrder(u, p.id);
      expect(order).toMatchObject({ status: 'pending', user_id: u, plan_id: p.id, paid_at: null });
      expect(order.amount).toBe('199.00'); // NUMERIC(10,2) string
      expect(plan.price).toBe('199.00');
      expect(order.order_ref).toMatch(/^ord_\d+_\d+_[a-z0-9]+$/);

      const paid = await plans.markOrderPaid(order.order_ref);
      expect(paid.status).toBe('paid');
      expect(paid.paid_at).toBeInstanceOf(Date);
      expect(await plans.markOrderPaid(order.order_ref)).toBeNull(); // already paid: alreadyPaid path
      const after = await plans.getOrderByRef(order.order_ref);
      expect(after.paid_at.getTime()).toBe(paid.paid_at.getTime());
      expect(await plans.markOrderPaid('ord_does_not_exist')).toBeNull();
    });

    it('markOrderPaid under CONCURRENCY: three simultaneous callers, exactly one wins (row lock + WHERE re-check), one paid_at', async () => {
      const u = await newUser();
      const p = await plans.getPlanByName('Learn & Build');
      const { order } = await plans.createOrder(u, p.id);
      const results = await Promise.all([1, 2, 3].map(() => plans.markOrderPaid(order.order_ref)));
      expect(results.filter(Boolean)).toHaveLength(1); // REAL vs FAKE: a JS fake is single-threaded, this is the database doing the CAS
      const rows = await schema.query("SELECT status, paid_at FROM plan_orders WHERE order_ref = $1", [order.order_ref]);
      expect(rows.rows).toHaveLength(1);
      expect(rows.rows[0].status).toBe('paid');
    });

    it('createOrder for a missing plan throws before any insert', async () => {
      const u = await newUser();
      await expect(plans.createOrder(u, 424242)).rejects.toThrow('Plan not found');
      const n = await schema.query('SELECT COUNT(*)::int AS n FROM plan_orders WHERE user_id = $1', [u]);
      expect(n.rows[0].n).toBe(0);
    });
  });

  /* ------------------------------------------------------------------------------------------ */
  describe('sessionService (single active device, real SQL)', () => {
    let sessions;
    beforeAll(() => { sessions = createSessionService({ db, config: createConfig(makeEnv()) }); });

    const row = async (id) => (await schema.query('SELECT * FROM user_sessions WHERE id = $1', [id])).rows[0];

    it('createSession stores the session and returns Date fields; the refresh token is stored only as sha256', async () => {
      const u = await newUser();
      const out = await sessions.createSession(u, { userAgent: 'Mozilla/5.0 (Windows NT 10.0)', ipAddress: '203.0.113.9' });
      expect(out.session).toMatchObject({ deviceName: 'Windows' });
      expect(Number.isInteger(out.session.id)).toBe(true);
      expect(out.session.expiresAt).toBeInstanceOf(Date);
      expect(out.session.createdAt).toBeInstanceOf(Date);
      const stored = await row(out.session.id);
      expect(stored.ip_address).toBe('203.0.113.9');
      expect(stored.refresh_token_hash).toMatch(/^[0-9a-f]{64}$/);
      expect(stored.refresh_token_hash).not.toContain(out.refreshToken);
      expect(stored.revoked_at).toBeNull();
    });

    it('same IP re-login replaces the old session (sameDevice); the old one is revoked and inactive, the new one active', async () => {
      const u = await newUser();
      const a = await sessions.createSession(u, { ipAddress: '198.51.100.1' });
      const b = await sessions.createSession(u, { ipAddress: '198.51.100.1' });
      expect(b.session.id).not.toBe(a.session.id);
      expect((await row(a.session.id)).revoked_at).toBeInstanceOf(Date);
      expect(await sessions.isSessionActive(a.session.id)).toBe(false);
      expect(await sessions.isSessionActive(b.session.id)).toBe(true);
      expect((await sessions.getActiveSession(u)).id).toBe(b.session.id);
    });

    it('a different IP is refused with ACCOUNT_IN_USE and activeSession details; nothing is revoked or inserted', async () => {
      const u = await newUser();
      const a = await sessions.createSession(u, { userAgent: 'Mozilla/5.0 (Macintosh)', ipAddress: '198.51.100.2' });
      const err = await sessions.createSession(u, { ipAddress: '198.51.100.3' }).catch((e) => e);
      expect(err.code).toBe('ACCOUNT_IN_USE');
      expect(err.activeSession).toMatchObject({ deviceName: 'Mac', ipAddress: '198.51.100.2' });
      expect(err.activeSession.lastActiveAt).toBeInstanceOf(Date);
      expect(err.activeSession.since).toBeInstanceOf(Date);
      expect((await row(a.session.id)).revoked_at).toBeNull();
      expect((await sessions.listSessions(u))).toHaveLength(1);
    });

    it('replaceExisting revokes the other-device session and creates a new one', async () => {
      const u = await newUser();
      const a = await sessions.createSession(u, { ipAddress: '198.51.100.4' });
      const b = await sessions.createSession(u, { ipAddress: '198.51.100.5' }, { replaceExisting: true });
      expect(await sessions.isSessionActive(a.session.id)).toBe(false);
      expect(await sessions.isSessionActive(b.session.id)).toBe(true);
    });

    it('a missing IP never counts as the same device (fail closed): the second login is refused', async () => {
      const u = await newUser();
      await sessions.createSession(u, { ipAddress: '198.51.100.6' });
      await expect(sessions.createSession(u, {})).rejects.toMatchObject({ code: 'ACCOUNT_IN_USE' });
      const u2 = await newUser();
      await sessions.createSession(u2, {}); // stored ip NULL
      await expect(sessions.createSession(u2, { ipAddress: '198.51.100.7' })).rejects.toMatchObject({ code: 'ACCOUNT_IN_USE' });
    });

    it('refreshSession / touchSession / revokeSession / revokeAllSessions on real rows', async () => {
      const u = await newUser();
      const other = await newUser();
      const a = await sessions.createSession(u, { ipAddress: '198.51.100.8' });
      const before = (await row(a.session.id)).last_active_at;
      await new Promise((r) => setTimeout(r, 30));

      const refreshed = await sessions.refreshSession(a.refreshToken);
      expect(refreshed.session.id).toBe(a.session.id);
      expect(typeof refreshed.accessToken).toBe('string');
      expect((await row(a.session.id)).last_active_at.getTime()).toBeGreaterThan(before.getTime());
      expect(await sessions.refreshSession('0'.repeat(96))).toBeNull();

      // revokeSession is scoped to its owner
      const b = await sessions.createSession(other, { ipAddress: '198.51.100.9' });
      await sessions.revokeSession(b.session.id, u);
      expect((await row(b.session.id)).revoked_at).toBeNull();
      await sessions.revokeSession(b.session.id, other);
      expect((await row(b.session.id)).revoked_at).toBeInstanceOf(Date);
      expect(await sessions.refreshSession(b.refreshToken)).toBeNull();

      // revokeAllSessions(userId, except): insert extra active rows directly, keep one
      const extra = await schema.query(
        `INSERT INTO user_sessions (user_id, refresh_token_hash, expires_at) VALUES ($1, $2, CURRENT_TIMESTAMP + INTERVAL '1 day'), ($1, $3, CURRENT_TIMESTAMP + INTERVAL '1 day') RETURNING id`,
        [u, 'e'.repeat(64), 'f'.repeat(64)]
      );
      await sessions.revokeAllSessions(u, extra.rows[0].id);
      expect(await sessions.isSessionActive(extra.rows[0].id)).toBe(true);
      expect(await sessions.isSessionActive(extra.rows[1].id)).toBe(false);
      expect(await sessions.isSessionActive(a.session.id)).toBe(false);
      await sessions.revokeAllSessions(u);
      expect(await sessions.listSessions(u)).toEqual([]);
    });

    it('expiry is decided in SQL: an expired or revoked session is invisible to getActiveSession / isSessionActive / listSessions', async () => {
      const u = await newUser();
      const a = await sessions.createSession(u, { ipAddress: '198.51.100.10' });
      await schema.query("UPDATE user_sessions SET expires_at = CURRENT_TIMESTAMP - INTERVAL '1 hour' WHERE id = $1", [a.session.id]);
      expect(await sessions.getActiveSession(u)).toBeNull();
      expect(await sessions.isSessionActive(a.session.id)).toBe(false);
      expect(await sessions.listSessions(u)).toEqual([]);
      expect(await sessions.refreshSession(a.refreshToken)).toBeNull();
      // and with no live session a login from any IP is allowed again
      await expect(sessions.createSession(u, { ipAddress: '198.51.100.11' })).resolves.toBeDefined();
    });

    it('listSessions returns the documented columns, newest activity first', async () => {
      const u = await newUser();
      await schema.query(
        `INSERT INTO user_sessions (user_id, refresh_token_hash, device_name, last_active_at, expires_at)
         VALUES ($1, $2, 'older', CURRENT_TIMESTAMP - INTERVAL '2 hours', CURRENT_TIMESTAMP + INTERVAL '1 day'),
                ($1, $3, 'newer', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '1 day')`,
        [u, '1'.repeat(64), '2'.repeat(64)]
      );
      const list = await sessions.listSessions(u);
      expect(list.map((s) => s.device_name)).toEqual(['newer', 'older']);
      expect(Object.keys(list[0]).sort()).toEqual(['created_at', 'device_name', 'expires_at', 'id', 'ip_address', 'last_active_at', 'revoked_at', 'user_agent']);
    });

    it('stored expires_at is the Date\'s wall clock in the PROCESS time zone (timestamp WITHOUT time zone + node-pg): fine on Workers (UTC), a shift on a non-UTC host', async () => {
      const u = await newUser();
      const a = await sessions.createSession(u, { ipAddress: '198.51.100.12' });
      const txt = (await schema.query('SELECT expires_at::text AS t FROM user_sessions WHERE id = $1', [a.session.id])).rows[0].t;
      expect(txt.slice(0, 19)).toBe(localWallClock(a.session.expiresAt));
    });

    it('column limits the fake does not enforce: ip_address is varchar(45); an oversized value is a 22001 error', async () => {
      const u = await newUser();
      await expect(sessions.createSession(u, { ipAddress: '1'.repeat(46) })).rejects.toMatchObject({ code: '22001' });
      await expect(sessions.createSession(u, { ipAddress: '2001:0db8:85a3:0000:0000:8a2e:0370:7334' })).resolves.toBeDefined(); // 39 chars
    });

    it('isSessionActive: non-integers short-circuit without SQL; an integer beyond int4 is a 22003 error (the fake answers false)', async () => {
      expect(await sessions.isSessionActive(undefined)).toBe(false);
      expect(await sessions.isSessionActive('abc')).toBe(false);
      await expect(sessions.isSessionActive('99999999999')).rejects.toMatchObject({ code: '22003' });
    });
  });

  /* ------------------------------------------------------------------------------------------ */
  describe('progressService', () => {
    let progress;
    beforeAll(() => { progress = createProgressService({ db }); });

    it('saveProgress: jsonb round trip (nested, unicode), ON CONFLICT (user_id, context_key) keeps one row, updatedAt moves', async () => {
      const u = await newUser();
      const first = await progress.saveProgress(u, 'zero-to-hero', { steps: [1, 2, { deep: true }], label: 'héllo ☃' });
      expect(first.data).toEqual({ steps: [1, 2, { deep: true }], label: 'héllo ☃' }); // parsed object, not a string
      expect(first.updatedAt).toBeInstanceOf(Date);
      await new Promise((r) => setTimeout(r, 30));
      const second = await progress.saveProgress(u, 'zero-to-hero', { steps: [] });
      expect(second.data).toEqual({ steps: [] });
      expect(second.updatedAt.getTime()).toBeGreaterThan(first.updatedAt.getTime());
      const n = await schema.query('SELECT COUNT(*)::int AS n FROM user_progress WHERE user_id = $1', [u]);
      expect(n.rows[0].n).toBe(1);
    });

    it('getProgress / getAllProgress / mergeProgress; a missing row is { data: {}, updatedAt: null }; null data is stored as {}', async () => {
      const u = await newUser();
      expect(await progress.getProgress(u, 'preferences')).toEqual({ data: {}, updatedAt: null });
      await progress.mergeProgress(u, 'preferences', { a: 1 });
      const merged = await progress.mergeProgress(u, 'preferences', { b: 2 });
      expect(merged.data).toEqual({ a: 1, b: 2 });
      await progress.saveProgress(u, 'learn-and-build', null);
      const all = await progress.getAllProgress(u);
      expect(all.map((r) => r.contextKey)).toEqual(['learn-and-build', 'preferences']); // ORDER BY context_key
      expect(all[0].data).toEqual({});
      expect(all[1].updatedAt).toBeInstanceOf(Date);
    });

    it('a JSON array is a valid progress_data value (the JSON.stringify path), and a context_key over 100 characters is a 22001 error', async () => {
      const u = await newUser();
      expect((await progress.saveProgress(u, 'preferences', [1, 2])).data).toEqual([1, 2]);
      await expect(progress.saveProgress(u, 'x'.repeat(101), {})).rejects.toMatchObject({ code: '22001' });
    });
  });

  /* ------------------------------------------------------------------------------------------ */
  describe('studyHistoryService', () => {
    let study;
    beforeAll(() => { study = createStudyHistoryService({ db }); });

    it('saveSession / getHistory (with and without the type filter) / getStats / getWeeklySummary on real rows', async () => {
      const u = await newUser();
      const a = await study.saveSession(u, { sessionType: 'quiz', topic: "O'Reilly; --", difficulty: 'hard', score: 80, totalQuestions: 10, timeSpentSeconds: 120, data: { q: [1, 2] } });
      await study.saveSession(u, { sessionType: 'quiz', topic: 'sql', score: 60, totalQuestions: 10, timeSpentSeconds: 60 });
      await study.saveSession(u, { sessionType: 'notes', topic: 'ts', score: 0 }); // `score || null`: 0 is stored as NULL (Express behavior, preserved)
      expect(a.id).toBeGreaterThan(0);
      expect(a.created_at).toBeInstanceOf(Date);

      const all = await study.getHistory(u, {});
      expect(all).toHaveLength(3);
      expect(all.map((r) => r.topic)).toEqual(['ts', 'sql', "O'Reilly; --"]); // newest first
      expect(all[0].score).toBeNull();
      const quizzes = await study.getHistory(u, { sessionType: 'quiz' });
      expect(quizzes).toHaveLength(2);
      const page = await study.getHistory(u, { limit: 1, offset: 1 });
      expect(page.map((r) => r.topic)).toEqual(['sql']);
      const stored = await schema.query('SELECT data FROM study_sessions WHERE id = $1', [a.id]);
      expect(stored.rows[0].data).toEqual({ q: [1, 2] });

      const stats = await study.getStats(u);
      const quiz = stats.find((r) => r.session_type === 'quiz');
      // REAL vs FAKE: COUNT/SUM(bigint)/AVG are strings; MAX(timestamp) is a Date
      expect(quiz.total_sessions).toBe('2');
      expect(quiz.avg_score).toBe('70.0000000000000000');
      expect(quiz.total_time_seconds).toBe('180');
      expect(quiz.last_session).toBeInstanceOf(Date);

      const week = await study.getWeeklySummary(u);
      expect(week).toHaveLength(1);
      expect(week[0].study_date).toBeInstanceOf(Date);
      expect(week[0].sessions).toBe('3');
    });
  });

  /* ------------------------------------------------------------------------------------------ */
  describe('activityService', () => {
    let activity;
    beforeAll(() => { activity = createActivityService({ db }); });

    it('trackActivity: ON CONFLICT (user_id, activity_date, tool_name, activity_type) increments activity_count on the SAME row', async () => {
      const u = await newUser();
      const first = await activity.trackActivity(u, 'resume', 'analyze', { a: 1 });
      const second = await activity.trackActivity(u, 'resume', 'analyze', { a: 2 });
      expect(first.activity_count).toBe(1);
      expect(second.activity_count).toBe(2);
      expect(second.id).toBe(first.id);
      expect(second.metadata).toEqual({ a: 2 }); // jsonb parsed
      expect(second.activity_date).toBeInstanceOf(Date);
    });

    it('a NULL tool_name never conflicts (NULLs are distinct in a unique constraint): each call inserts a new row (a real-Postgres quirk the fake hides)', async () => {
      const u = await newUser();
      await activity.trackActivity(u, null, 'view');
      await activity.trackActivity(u, null, 'view');
      const n = await schema.query('SELECT COUNT(*)::int AS n FROM daily_activity WHERE user_id = $1', [u]);
      expect(n.rows[0].n).toBe(2);
    });

    it('getHeatmapData: [{date:"YYYY-MM-DD", count:number}]; the DATE goes through local-midnight -> toISOString, so it equals the database date only when the process zone is UTC (Workers)', async () => {
      const u = await newUser();
      await activity.trackActivity(u, 'a', 'x');
      await activity.trackActivity(u, 'b', 'x');
      const heat = await activity.getHeatmapData(u, 3);
      expect(heat).toHaveLength(1);
      expect(heat[0].count).toBe(2); // SUM(...)::INTEGER -> number
      const dbDate = (await schema.query('SELECT CURRENT_DATE::text AS d')).rows[0].d;
      const [y, m, d] = dbDate.split('-').map(Number);
      const viaLocalMidnight = new Date(y, m - 1, d).toISOString().split('T')[0];
      expect(heat[0].date).toBe(viaLocalMidnight);
      if (new Date().getTimezoneOffset() === 0) expect(heat[0].date).toBe(dbDate);
    });

    it('getWeeklyActivity returns 7 named days with numeric counts', async () => {
      const u = await newUser();
      await activity.trackActivity(u, 'a', 'x');
      const week = await activity.getWeeklyActivity(u);
      expect(week.map((d) => d.day)).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
      expect(week.every((d) => typeof d.count === 'number' && /^\d{4}-\d{2}-\d{2}$/.test(d.date))).toBe(true);
    });

    it('getStats: numbers from COUNT(DISTINCT) strings via parseInt; streak defaults when there is no learning_streaks row', async () => {
      const u = await newUser();
      await activity.trackActivity(u, 'a', 'x');
      await activity.trackActivity(u, 'b', 'y');
      const s = await activity.getStats(u);
      expect(s).toMatchObject({ daysActive: 1, toolsUsed: 2, totalActivities: 2, currentStreak: 0, longestStreak: 0, dailyGoal: 30 });
      expect(s.dailyGoalProgress).toBe(7); // round(2 / 30 * 100)
    });

    it('getStats reads the courses.js learning_streaks shape (current / longest / daily_goal)', async () => {
      const u = await newUser();
      await schema.query("INSERT INTO learning_streaks (user_id, subject, current, longest, daily_goal) VALUES ($1, 's', 3, 9, 10)", [u]);
      const s = await activity.getStats(u);
      expect(s).toMatchObject({ currentStreak: 3, longestStreak: 9, dailyGoal: 10 });
    });

    it('the two learning_streaks shapes cannot share one table: courses.js\'s INSERT (no subject) violates NOT NULL on the learningPathService shape (23502)', async () => {
      // REAL finding: PREPARE accepts both statements against the merged table; only execution shows they conflict.
      const u = await newUser();
      await expect(
        db.query('INSERT INTO learning_streaks (user_id, current, longest, last_date) VALUES ($1, 1, 1, $2)', [u, '2026-01-01'])
      ).rejects.toMatchObject({ code: '23502' });
    });

    it('checkAndUnlockAchievements inserts each newly met achievement once (ON CONFLICT DO NOTHING) and getAchievements lists it', async () => {
      const u = await newUser();
      await activity.trackActivity(u, 'resume', 'analyze');
      const unlocked = await activity.checkAndUnlockAchievements(u);
      expect(unlocked).toContain('first_login');
      expect(await activity.checkAndUnlockAchievements(u)).toEqual([]); // already unlocked
      const list = await activity.getAchievements(u);
      expect(list.map((a) => a.key)).toContain('first_login');
      expect(list[0].unlockedAt).toBeInstanceOf(Date);
    });
  });

  /* ------------------------------------------------------------------------------------------ */
  describe('resumeDatabase', () => {
    let resumes;
    beforeAll(() => { resumes = createResumeDatabase({ db }); });

    it('saveResume / getResume / updateOptimizedResume (+ saveAnalysis upsert) / saveExport / getUserResumes / deleteResume', async () => {
      const u = await newUser();
      const other = await newUser();
      const saved = await resumes.saveResume(u, 'my resume text', { total: 55, role: 'Backend', keywordCoverage: { js: 3 }, missingInfo: { phone: true } });
      expect(saved.id).toBeGreaterThan(0);
      expect(saved.created_at).toBeInstanceOf(Date);

      const got = await resumes.getResume(saved.id, u);
      expect(got).toMatchObject({ user_id: u, original_score: 55, role_detected: 'Backend' });
      expect(got.keyword_coverage).toEqual({ js: 3 }); // jsonb parsed
      expect(await resumes.getResume(saved.id, other)).toBeUndefined(); // another user's id: no row

      const analysis = { breakdown: { 'Section Completeness (30)': 20, 'Keyword Relevance (25)': 10, 'Formatting (15)': 9 }, details: { actionVerbs: { count: 4 }, metrics: { count: 2 }, missingSections: ['summary'] }, recommendations: ['add metrics'] };
      const upd = await resumes.updateOptimizedResume(saved.id, 'optimized', 80, analysis);
      expect(upd).toEqual({ id: saved.id });
      // second call: ON CONFLICT (resume_id) DO UPDATE, still ONE analyses row, new values
      await resumes.updateOptimizedResume(saved.id, 'optimized v2', 85, { ...analysis, breakdown: { ...analysis.breakdown, 'Section Completeness (30)': 30 } });
      const an = await schema.query('SELECT section_completeness, missing_sections, recommendations FROM analyses WHERE resume_id = $1', [saved.id]);
      expect(an.rows).toHaveLength(1);
      expect(an.rows[0]).toMatchObject({ section_completeness: 30, missing_sections: ['summary'], recommendations: ['add metrics'] });

      await resumes.saveExport(saved.id, 'pdf', '/tmp/x.pdf');
      const list = await resumes.getUserResumes(u);
      expect(list).toHaveLength(1);
      expect(list[0].export_count).toBe('1'); // COUNT(e.id) is a bigint string
      expect(list[0].optimized_score).toBe(85);

      expect(await resumes.deleteResume(saved.id, other)).toBeUndefined();
      expect(await resumes.deleteResume(saved.id, u)).toEqual({ id: saved.id });
      expect(await resumes.deleteResume(saved.id, u)).toBeUndefined();
    });

    it('analyses without a UNIQUE (resume_id) (the add-ats-tables.sql variant) makes saveAnalysis fail with 42P10 at runtime, exactly what check-schema flags', async () => {
      const bare = await createScratchSchema({
        statements: [
          'CREATE TABLE resumes (id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL)',
          'CREATE TABLE analyses (id SERIAL PRIMARY KEY, resume_id INTEGER NOT NULL, section_completeness INTEGER, keyword_relevance INTEGER, formatting_score INTEGER, action_verbs_count INTEGER, metrics_count INTEGER, missing_sections JSONB, recommendations JSONB, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)',
        ],
      });
      const bareDb = requestDb(bare);
      try {
        await expect(createResumeDatabase({ db: bareDb }).saveAnalysis(1, { breakdown: {}, details: {}, recommendations: [] })).rejects.toMatchObject({ code: '42P10' });
      } finally {
        await bareDb.release();
        await bare.drop();
      }
    });
  });
});
