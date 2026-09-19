'use strict';

/** /api/progress: GET /, GET|PUT|PATCH /:contextKey, all authenticateToken only. */
const { build } = require('./helpers');

const CONTEXTS = ['zero-to-hero', 'learn-and-build', 'tune-and-polish', 'preferences'];

describe('/api/progress', () => {
  let errorSpy;
  beforeEach(() => {
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  describe('auth (and NO plan gate)', () => {
    it.each([
      ['GET', '/api/progress'],
      ['GET', '/api/progress/preferences'],
      ['PUT', '/api/progress/preferences'],
      ['PATCH', '/api/progress/preferences'],
    ])('401 for %s %s without a token, before touching the db', async (method, path) => {
      const H = build({ plan: 3 });
      const res = await H.json(method, path, { data: {} }, { auth: false });
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: 'Unauthorized' });
      expect(H.db.calls.some((c) => /user_progress/.test(c.sql))).toBe(false);
    });

    it('a user with no subscription can use every endpoint (Express has no requirePlan)', async () => {
      const H = build();
      expect((await H.authed('/api/progress')).status).toBe(200);
      expect((await H.json('PUT', '/api/progress/preferences', { data: { a: 1 } })).status).toBe(200);
      expect((await H.json('PATCH', '/api/progress/preferences', { data: { b: 2 } })).status).toBe(200);
      expect((await H.authed('/api/progress/preferences')).status).toBe(200);
    });
  });

  describe('GET /api/progress', () => {
    it('{ progress: [] } when the user has nothing', async () => {
      const H = build();
      const res = await H.authed('/api/progress');
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ progress: [] });
    });

    it("lists only the caller's rows, ordered by context_key, as { contextKey, data, updatedAt }", async () => {
      const H = build();
      const t = new Date('2026-06-26T10:00:00.000Z');
      H.db.state.user_progress.push(
        { user_id: 1, context_key: 'zero-to-hero', progress_data: { step: 5 }, updated_at: t },
        { user_id: 2, context_key: 'preferences', progress_data: { theme: 'dark' }, updated_at: t },
        { user_id: 1, context_key: 'learn-and-build', progress_data: null, updated_at: t }
      );
      const res = await H.authed('/api/progress');
      expect(await res.json()).toEqual({
        progress: [
          { contextKey: 'learn-and-build', data: {}, updatedAt: '2026-06-26T10:00:00.000Z' }, // null jsonb -> {}
          { contextKey: 'zero-to-hero', data: { step: 5 }, updatedAt: '2026-06-26T10:00:00.000Z' },
        ],
      });
    });

    it('accepts a trailing slash like Express', async () => {
      const H = build();
      expect((await H.authed('/api/progress/')).status).toBe(200);
    });

    it('a db failure is the masked 500 (never leaks the message)', async () => {
      const H = build();
      H.db.failWhen((sql) => /FROM user_progress/.test(sql), new Error('secret: postgres://u:p@h/db'));
      const res = await H.authed('/api/progress');
      expect(res.status).toBe(500);
      const text = await res.text();
      expect(JSON.parse(text)).toEqual({ error: 'Internal Server Error' });
      expect(text).not.toMatch(/postgres|secret/);
    });
  });

  describe('GET /api/progress/:contextKey', () => {
    it.each(CONTEXTS)('allows context "%s"', async (key) => {
      const H = build();
      expect((await H.authed(`/api/progress/${key}`)).status).toBe(200);
    });

    it.each(['invalid', 'Zero-To-Hero', 'zero_to_hero', 'preferences2', '%20'])('400 {"error":"Invalid progress context"} for "%s"', async (key) => {
      const H = build();
      const res = await H.authed(`/api/progress/${key}`);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'Invalid progress context' });
      expect(H.db.calls.some((c) => /user_progress/.test(c.sql))).toBe(false);
    });

    it('{ data: {}, updatedAt: null } when no row exists', async () => {
      const H = build();
      const res = await H.authed('/api/progress/zero-to-hero');
      expect(await res.json()).toEqual({ data: {}, updatedAt: null });
    });

    it('returns the stored data and timestamp, and null data as {}', async () => {
      const H = build();
      const t = new Date('2026-06-26T10:00:00.000Z');
      H.db.state.user_progress.push(
        { user_id: 1, context_key: 'zero-to-hero', progress_data: { step: 3 }, updated_at: t },
        { user_id: 1, context_key: 'preferences', progress_data: null, updated_at: t }
      );
      expect(await (await H.authed('/api/progress/zero-to-hero')).json()).toEqual({ data: { step: 3 }, updatedAt: '2026-06-26T10:00:00.000Z' });
      expect((await (await H.authed('/api/progress/preferences')).json()).data).toEqual({});
    });

    it("scopes the read to the caller (another user's row is invisible)", async () => {
      const H = build();
      H.db.state.user_progress.push({ user_id: 2, context_key: 'zero-to-hero', progress_data: { step: 9 }, updated_at: new Date() });
      expect(await (await H.authed('/api/progress/zero-to-hero')).json()).toEqual({ data: {}, updatedAt: null });
    });
  });

  describe('PUT /api/progress/:contextKey', () => {
    it('400 for an invalid context, checked before the body', async () => {
      const H = build();
      const withBody = await H.json('PUT', '/api/progress/nope', { data: {} });
      expect(withBody.status).toBe(400);
      expect(await withBody.json()).toEqual({ error: 'Invalid progress context' });
      // even with no body at all: context validation first, so 400 not the TypeError 500
      const noBody = await H.authed('/api/progress/nope', { method: 'PUT' });
      expect(noBody.status).toBe(400);
    });

    it.each([
      ['data missing', {}],
      ['data is a string', { data: 'x' }],
      ['data is a number', { data: 5 }],
      ['data is an array', { data: [1, 2] }],
    ])('400 {"error":"Progress data must be an object"} when %s', async (_label, body) => {
      const H = build();
      const res = await H.json('PUT', '/api/progress/preferences', body);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'Progress data must be an object' });
      expect(H.db.state.user_progress).toHaveLength(0);
    });

    it('PRESERVED: no JSON body at all is a TypeError -> masked 500', async () => {
      const H = build();
      const res = await H.authed('/api/progress/preferences', { method: 'PUT' });
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: 'Internal Server Error' });
    });

    it('200 { data, updatedAt } and stores the value; a second PUT replaces (not merges)', async () => {
      const H = build();
      const first = await H.json('PUT', '/api/progress/zero-to-hero', { data: { step: 3, name: 'a' } });
      expect(first.status).toBe(200);
      const body = await first.json();
      expect(Object.keys(body)).toEqual(['data', 'updatedAt']);
      expect(body.data).toEqual({ step: 3, name: 'a' });
      expect(new Date(body.updatedAt).toISOString()).toBe(body.updatedAt);

      const second = await H.json('PUT', '/api/progress/zero-to-hero', { data: { step: 4 } });
      expect((await second.json()).data).toEqual({ step: 4 });
      expect(H.db.state.user_progress).toHaveLength(1);
      expect(H.db.state.user_progress[0]).toMatchObject({ user_id: 1, context_key: 'zero-to-hero', progress_data: { step: 4 } });
    });

    it('PRESERVED QUIRK: data: null passes the object check (typeof null) and is stored as {}', async () => {
      const H = build();
      const res = await H.json('PUT', '/api/progress/preferences', { data: null });
      expect(res.status).toBe(200);
      expect((await res.json()).data).toEqual({});
      const insert = H.db.calls.find((c) => /INSERT INTO user_progress/.test(c.sql));
      expect(insert.params).toEqual([1, 'preferences', '{}']);
    });

    it('binds user id, context key and the JSON string as $1..$3', async () => {
      const H = build();
      await H.json('PUT', '/api/progress/tune-and-polish', { data: { a: { b: [1, 2] } } });
      const insert = H.db.calls.find((c) => /INSERT INTO user_progress/.test(c.sql));
      expect(insert.params).toEqual([1, 'tune-and-polish', JSON.stringify({ a: { b: [1, 2] } })]);
    });

    it('a db failure is the masked 500', async () => {
      const H = build();
      H.db.failWhen((sql) => /INSERT INTO user_progress/.test(sql), new Error('boom'));
      const res = await H.json('PUT', '/api/progress/preferences', { data: {} });
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: 'Internal Server Error' });
    });
  });

  describe('PATCH /api/progress/:contextKey', () => {
    it('400 for an invalid context and for a non-object data', async () => {
      const H = build();
      expect((await H.json('PATCH', '/api/progress/nope', { data: {} })).status).toBe(400);
      const bad = await H.json('PATCH', '/api/progress/preferences', { data: [] });
      expect(bad.status).toBe(400);
      expect(await bad.json()).toEqual({ error: 'Progress data must be an object' });
    });

    it('PRESERVED: no JSON body at all is a TypeError -> masked 500', async () => {
      const H = build();
      const res = await H.authed('/api/progress/preferences', { method: 'PATCH' });
      expect(res.status).toBe(500);
    });

    it('creates the row when none exists', async () => {
      const H = build();
      const res = await H.json('PATCH', '/api/progress/preferences', { data: { theme: 'dark' } });
      expect(res.status).toBe(200);
      expect((await res.json()).data).toEqual({ theme: 'dark' });
    });

    it('shallow-merges into the existing data (keys overwritten, others kept, nested objects replaced)', async () => {
      const H = build();
      H.db.state.user_progress.push({
        user_id: 1,
        context_key: 'zero-to-hero',
        progress_data: { step: 1, name: 'test', nested: { a: 1, b: 2 } },
        updated_at: new Date(),
      });
      const res = await H.json('PATCH', '/api/progress/zero-to-hero', { data: { step: 2, nested: { c: 3 } } });
      expect(res.status).toBe(200);
      expect((await res.json()).data).toEqual({ step: 2, name: 'test', nested: { c: 3 } });
      // read-then-write: exactly one SELECT then one upsert
      const verbs = H.db.calls.filter((c) => /user_progress/.test(c.sql)).map((c) => c.sql.split(' ')[0]);
      expect(verbs).toEqual(['SELECT', 'INSERT']);
    });

    it('data: null merges nothing (spread of null)', async () => {
      const H = build();
      H.db.state.user_progress.push({ user_id: 1, context_key: 'preferences', progress_data: { keep: true }, updated_at: new Date() });
      const res = await H.json('PATCH', '/api/progress/preferences', { data: null });
      expect((await res.json()).data).toEqual({ keep: true });
    });

    it("does not touch another user's row", async () => {
      const H = build();
      H.db.state.user_progress.push({ user_id: 2, context_key: 'preferences', progress_data: { theirs: 1 }, updated_at: new Date() });
      await H.json('PATCH', '/api/progress/preferences', { data: { mine: 1 } });
      expect(H.db.state.user_progress.find((r) => r.user_id === 2).progress_data).toEqual({ theirs: 1 });
      expect(H.db.state.user_progress.find((r) => r.user_id === 1).progress_data).toEqual({ mine: 1 });
    });
  });

  it('other methods fall through to the 404 default (DELETE is not defined)', async () => {
    const H = build();
    const res = await H.authed('/api/progress/preferences', { method: 'DELETE' });
    expect(res.status).toBe(404);
    expect(errorSpy).not.toHaveBeenCalled();
  });
});
