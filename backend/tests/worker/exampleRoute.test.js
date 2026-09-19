'use strict';

/**
 * Keeps routes/_example.js (the porting guide) and lib/upload.js honest. Each case is
 * a behaviour a real route port will depend on: DI'd service/db access, auth + plan
 * gate ordering, multipart parsing with the multer-equivalent limits, binary responses,
 * and header merging onto hand-built Responses.
 */
const exampleRouter = require('../../src/worker/routes/_example');
const { mountRoutes, listRoutes } = require('../../src/worker/lib/routes');
const { createApp } = require('../../src/worker/app');
const { readUpload, MULTIPART_SLACK_BYTES } = require('../../src/worker/lib/upload');
const { makeHarness, makeEnv, signToken, bearer, seedPlans, createFakeDb, TEST_ORIGIN } = require('./helpers/harness');

const PDF = 'application/pdf';
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

function build({ plan } = {}) {
  const db = createFakeDb();
  seedPlans(db);
  if (plan) db.state.user_subscriptions.push({ user_id: 1, plan_id: plan });
  const items = [{ id: 7, user_id: 1, title: 'mine' }];
  const realQuery = db.query.bind(db);
  db.query = (sql, params) => {
    if (/^SELECT id, title FROM items/.test(sql)) {
      const [id, userId] = params;
      return Promise.resolve({
        rows: items.filter((i) => String(i.id) === String(id) && i.user_id === userId).map(({ id: i, title }) => ({ id: i, title })),
      });
    }
    if (/^INSERT INTO items/.test(sql)) return Promise.resolve({ rows: [{ id: 99 }] });
    return realQuery(sql, params);
  };
  const H = makeHarness({ db, configureApp: (app) => mountRoutes(app, '/api/_example', exampleRouter) });
  return { ...H, token: signToken({ id: 1 }) };
}

function multipart(fields, { contentLength } = {}) {
  const form = new FormData();
  for (const [name, value] of Object.entries(fields)) form.append(name, value);
  const headers = {};
  if (contentLength !== undefined) headers['Content-Length'] = String(contentLength);
  return { method: 'POST', body: form, headers };
}
const file = (content, type, name = 'resume') => new File([content], name, { type });

describe('routes/_example.js (worked example, not mounted in createApp)', () => {
  beforeEach(() => jest.spyOn(console, 'error').mockImplementation(() => {}));
  afterEach(() => jest.restoreAllMocks());

  it('is not mounted by createApp', async () => {
    const H = makeHarness();
    expect((await H.request('/api/_example/plans')).status).toBe(404);
    expect(listRoutes(createApp()).some((r) => r.path.includes('_example'))).toBe(false);
  });

  it('introspection reports its auth + tiers', () => {
    const app = createApp();
    mountRoutes(app, '/api/_example', exampleRouter);
    const routes = listRoutes(app).filter((r) => r.path.startsWith('/api/_example'));
    const by = (m, p) => routes.find((r) => r.method === m && r.path === `/api/_example${p}`);
    expect(by('GET', '/plans')).toMatchObject({ auth: false, minTier: null });
    expect(by('GET', '/items/:id')).toMatchObject({ auth: true, minTier: 1 });
    expect(by('POST', '/upload')).toMatchObject({ auth: true, minTier: 2 });
    expect(by('GET', '/export.txt')).toMatchObject({ auth: true, minTier: null });
    expect(routes.every((r) => r.untagged === 0)).toBe(true);
  });

  describe('DI: services and db', () => {
    it('public route reads through the injected planService', async () => {
      const { request } = build();
      const res = await request('/api/_example/plans');
      expect(res.status).toBe(200);
      expect((await res.json()).map((p) => p.tier_level)).toEqual([1, 2, 3]);
    });

    it('gated route: 403 without a plan, 200 with one, using c.get("user") and getDb(c)', async () => {
      const denied = build();
      expect((await denied.request('/api/_example/items/7', bearer(denied.token))).status).toBe(403);

      const ok = build({ plan: 1 });
      const res = await ok.request('/api/_example/items/7?verbose=1', bearer(ok.token));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ id: 7, title: 'mine', verbose: true });
      expect((await ok.request('/api/_example/items/8', bearer(ok.token))).status).toBe(404);
    });

    it('JSON body via getBody(c); missing body is a masked 500 like Express (destructuring undefined)', async () => {
      const { request, token } = build({ plan: 1 });
      const created = await request('/api/_example/items', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 't' }),
      });
      expect(created.status).toBe(201);
      expect(await created.json()).toEqual({ id: 99 });

      const bad = await request('/api/_example/items', { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
      expect(bad.status).toBe(500);
      expect(await bad.json()).toEqual({ error: 'Internal Server Error' });
    });

    it('unauthenticated request never reaches the handler', async () => {
      const { request } = build({ plan: 3 });
      expect((await request('/api/_example/items/7')).status).toBe(401);
    });
  });

  describe('multipart upload (multer replacement)', () => {
    const post = (H, fields, extra = {}) => {
      const init = multipart(fields, extra);
      init.headers.Authorization = `Bearer ${H.token}`;
      return H.request('/api/_example/upload', init);
    };

    it('accepts an allowed type and returns file details', async () => {
      const H = build({ plan: 2 });
      const res = await post(H, { resume: file('hello resume', 'text/plain', 'cv.txt') });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        status: 'success', name: 'cv.txt', mimetype: 'text/plain', size: 12, text: 'hello resume',
      });
    });

    it.each([[PDF], [DOCX]])('accepts %s', async (type) => {
      const H = build({ plan: 2 });
      expect((await post(H, { resume: file('bytes', type) })).status).toBe(200);
    });

    it('a disallowed mimetype is rejected the way multer errors surfaced: masked 500', async () => {
      const H = build({ plan: 2 });
      const res = await post(H, { resume: file('MZ..', 'application/x-msdownload', 'evil.exe') });
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: 'Internal Server Error' });
      expect(console.error.mock.calls.flat().join(' ')).toMatch(/Invalid file type/);
    });

    it('a file over the cap is rejected (LIMIT_FILE_SIZE, masked 500); exactly at the cap is accepted', async () => {
      const H = build({ plan: 2 });
      const MAX = 5 * 1024 * 1024;
      const tooBig = await post(H, { resume: file(new Uint8Array(MAX + 1), 'text/plain') });
      expect(tooBig.status).toBe(500);
      expect(console.error.mock.calls.flat().join(' ')).toMatch(/File too large/);
      const exact = await post(H, { resume: file(new Uint8Array(MAX), 'text/plain') });
      expect(exact.status).toBe(200);
    }, 20000);

    it('rejects an oversized body up front from Content-Length without reading it', async () => {
      const H = build({ plan: 2 });
      const res = await post(H, { resume: file('x', 'text/plain') }, { contentLength: 5 * 1024 * 1024 + MULTIPART_SLACK_BYTES + 1 });
      expect(res.status).toBe(500);
      expect(console.error.mock.calls.flat().join(' ')).toMatch(/File too large/);
    });

    it('no file / wrong field name / non-multipart => route-level 400 "No file uploaded"', async () => {
      const H = build({ plan: 2 });
      const wrongField = await post(H, { other: file('x', 'text/plain') });
      expect(wrongField.status).toBe(400);
      expect(await wrongField.json()).toEqual({ status: 'error', message: 'No file uploaded' });

      const textOnly = await post(H, { resume: 'a string, not a file' });
      expect(textOnly.status).toBe(400);

      const json = await H.request('/api/_example/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${H.token}`, 'Content-Type': 'application/json' },
        body: '{}',
      });
      expect(json.status).toBe(400);
    });

    it('auth and the plan gate run BEFORE the body is read (multer order)', async () => {
      const spy = jest.spyOn(Request.prototype, 'formData');
      const noPlan = build();
      const r1 = await post(noPlan, { resume: file('x', 'text/plain') });
      expect(r1.status).toBe(403);
      const anon = build({ plan: 2 });
      const init = multipart({ resume: file('x', 'text/plain') });
      const r2 = await anon.request('/api/_example/upload', init);
      expect(r2.status).toBe(401);
      expect(spy).not.toHaveBeenCalled();
    });

    it('readUpload validates its options', async () => {
      await expect(readUpload({}, {})).rejects.toThrow(TypeError);
      await expect(readUpload({}, { field: 'f', maxBytes: 1.5, allowedMimeTypes: [] })).rejects.toThrow(TypeError);
    });
  });

  describe('binary Response', () => {
    it('returns bytes with the download headers, and middleware headers are merged onto it', async () => {
      const H = build();
      const res = await H.request('/api/_example/export.txt', {
        headers: { Authorization: `Bearer ${H.token}`, Origin: TEST_ORIGIN },
      });
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe('text/plain; charset=utf-8');
      expect(res.headers.get('content-disposition')).toBe('attachment; filename="optimized-resume.txt"');
      expect(res.headers.get('content-length')).toBe('21');
      // headers from global middleware survive on a hand-built Response
      expect(res.headers.get('access-control-allow-origin')).toBe(TEST_ORIGIN);
      expect(res.headers.get('x-frame-options')).toBe('SAMEORIGIN');
      const bytes = new Uint8Array(await res.arrayBuffer());
      expect(new TextDecoder().decode(bytes)).toBe('exported resume text\n');
    });

    it('binary payloads survive byte for byte (non-UTF8 bytes)', async () => {
      const H = build();
      H.app.get('/api/_example/bin', () => new Response(new Uint8Array([0, 255, 128, 37, 80, 68, 70]), {
        headers: { 'Content-Type': 'application/pdf' },
      }));
      const res = await H.request('/api/_example/bin');
      expect([...new Uint8Array(await res.arrayBuffer())]).toEqual([0, 255, 128, 37, 80, 68, 70]);
    });
  });

  it('makeEnv is only needed for direct app.request use (sanity)', () => {
    expect(makeEnv().JWT_SECRET.length).toBeGreaterThanOrEqual(32);
  });
});
