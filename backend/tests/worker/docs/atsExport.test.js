'use strict';

/**
 * routes/atsExport.js  (POST /api/ats/export/docx, POST /api/ats/export/txt, GET /api/ats/history; authenticateToken only).
 * Express reference: backend/src/routes/atsExport.js. The binary response headers were compared with a real
 * Express 5.2.1 response (res.setHeader + res.send(Buffer)) in the same session.
 */
jest.mock('../../../src/worker/services/docs/docLibs', () => require('./helpers/realDocLibs'));

const JSZip = require('jszip');
const { makeDocsHarness } = require('./helpers/docsHarness');

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const MASKED = { error: 'Internal Server Error' };
const TEXT = ['Jane Example', 'SUMMARY', 'Engineer who ships.', 'EXPERIENCE', 'Senior Engineer | Example Corp', 'SKILLS', 'JavaScript, SQL'].join('\n');

function seed(H, over = {}) {
  H.db.state.resumes.push({ id: 41, user_id: 1, original_resume: TEXT, optimized_resume: null, created_at: new Date('2026-01-01'), ...over });
}
const post = (H, path, body, t) => H.request(path, H.json(body, t));

describe('/api/ats export + history', () => {
  let H;
  beforeEach(() => {
    H = makeDocsHarness({ plan: null }); // no subscription: these routes are auth-only (no requirePlan)
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  describe('auth parity (authenticateToken on all three, no plan gate)', () => {
    it.each([
      ['POST', '/api/ats/export/docx'],
      ['POST', '/api/ats/export/txt'],
      ['GET', '/api/ats/history'],
    ])('%s %s: 401 without a token', async (method, path) => {
      const res = await H.request(path, { method, headers: { 'Content-Type': 'application/json' }, body: method === 'POST' ? '{"resumeId":41}' : undefined });
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: 'Unauthorized' });
    });

    it('a user with no plan at all is allowed (no requirePlan on these routes)', async () => {
      seed(H);
      expect((await post(H, '/api/ats/export/txt', { resumeId: 41 })).status).toBe(200);
      expect((await H.request('/api/ats/history', H.authed())).status).toBe(200);
    });
  });

  describe('POST /export/docx', () => {
    it('400 when resumeId is missing, 404 when the resume is not found or not owned', async () => {
      seed(H);
      const missing = await post(H, '/api/ats/export/docx', {});
      expect(missing.status).toBe(400);
      expect(await missing.json()).toEqual({ error: 'Resume ID required' });
      const none = await post(H, '/api/ats/export/docx', { resumeId: 999 });
      expect(none.status).toBe(404);
      expect(await none.json()).toEqual({ error: 'Resume not found' });
      const other = await post(H, '/api/ats/export/docx', { resumeId: 41 }, H.otherToken);
      expect(other.status).toBe(404); // user 2 cannot export user 1's resume
      expect(H.db.state.resume_exports).toHaveLength(0);
    });

    it('200 with the Express headers and a valid DOCX built from optimized_resume (preferred) or original_resume', async () => {
      // (body lines avoid the words summary / experience / skills: the section patterns are un-anchored, a preserved quirk)
      seed(H, { optimized_resume: 'SUMMARY\nAlpha bravo charlie\nSKILLS\nDelta echo foxtrot' });
      const res = await post(H, '/api/ats/export/docx', { resumeId: 41 });
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe(DOCX_MIME); // no charset, exactly like send(Buffer)
      expect(res.headers.get('content-disposition')).toBe('attachment; filename="optimized-resume.docx"');
      const bytes = new Uint8Array(await res.arrayBuffer());
      expect(res.headers.get('content-length')).toBe(String(bytes.length));
      expect(Buffer.from(bytes.subarray(0, 2)).toString()).toBe('PK');
      const zip = await JSZip.loadAsync(bytes);
      const xml = await zip.file('word/document.xml').async('string');
      expect(xml).toContain('Alpha bravo charlie');
      expect(xml).not.toContain('Engineer who ships.');
    });

    it('falls back to original_resume and records the export (resume_exports row) before answering', async () => {
      seed(H);
      const res = await post(H, '/api/ats/export/docx', { resumeId: 41 });
      const xml = await (await JSZip.loadAsync(new Uint8Array(await res.arrayBuffer()))).file('word/document.xml').async('string');
      expect(xml).toContain('Engineer who ships.');
      expect(H.db.state.resume_exports).toHaveLength(1);
      expect(H.db.state.resume_exports[0]).toMatchObject({ resume_id: 41, export_format: 'docx' });
      expect(H.db.state.resume_exports[0].file_path).toMatch(/^resume_1_\d+\.docx$/);
    });

    it('a resume with no text at all: masked 500 (the export throws), no export row', async () => {
      seed(H, { original_resume: null, optimized_resume: null });
      const res = await post(H, '/api/ats/export/docx', { resumeId: 41 });
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual(MASKED);
      expect(console.error).toHaveBeenCalledWith('Export error:', expect.any(Error));
      expect(H.db.state.resume_exports).toHaveLength(0);
    });

    it('a failing export-record insert: masked 500, no file is served', async () => {
      seed(H);
      H.db.failWhenDocs((sql) => /INSERT INTO resume_exports/.test(sql), new Error('db down'));
      const res = await post(H, '/api/ats/export/docx', { resumeId: 41 });
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual(MASKED);
      expect(res.headers.get('content-type')).toContain('application/json');
    });

    it('no JSON body at all: masked 500 (destructuring undefined, like Express)', async () => {
      const res = await H.request('/api/ats/export/docx', H.authed({ method: 'POST' }));
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual(MASKED);
    });
  });

  describe('POST /export/txt', () => {
    it('200 with text/plain (no charset) and the exact UTF-8 bytes, Content-Length and Content-Disposition', async () => {
      const text = 'héllo wörld\nSKILLS\nnaïve';
      seed(H, { original_resume: text });
      const res = await post(H, '/api/ats/export/txt', { resumeId: 41 });
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe('text/plain');
      expect(res.headers.get('content-disposition')).toBe('attachment; filename="optimized-resume.txt"');
      const bytes = Buffer.from(await res.arrayBuffer());
      expect(bytes.equals(Buffer.from(text, 'utf-8'))).toBe(true);
      expect(res.headers.get('content-length')).toBe(String(Buffer.byteLength(text)));
      expect(H.db.state.resume_exports[0]).toMatchObject({ resume_id: 41, export_format: 'txt' });
      expect(H.db.state.resume_exports[0].file_path).toMatch(/^resume_1_\d+\.txt$/);
    });

    it('prefers optimized_resume', async () => {
      seed(H, { optimized_resume: 'optimized wins' });
      const res = await post(H, '/api/ats/export/txt', { resumeId: 41 });
      expect(await res.text()).toBe('optimized wins');
    });

    it('400 / 404 / masked-500 paths mirror the docx route', async () => {
      seed(H);
      expect((await post(H, '/api/ats/export/txt', {})).status).toBe(400);
      expect((await post(H, '/api/ats/export/txt', { resumeId: 7 })).status).toBe(404);
      expect((await post(H, '/api/ats/export/txt', { resumeId: 41 }, H.otherToken)).status).toBe(404);
    });

    it('an export that throws is logged and rethrown: masked 500 (Express next(err))', async () => {
      // NB: a resume with no text makes the real toTXT throw a Node-core TypeError, which Hono under Jest's VM
      // realm does not recognise as an Error; inject a same-realm error instead (workerd has no such split)
      H = makeDocsHarness({ plan: null, overrides: { resumeExport: { toTXT: () => { throw new Error('boom'); } } } });
      seed(H);
      const bad = await post(H, '/api/ats/export/txt', { resumeId: 41 });
      expect(bad.status).toBe(500);
      expect(await bad.json()).toEqual(MASKED);
      expect(console.error).toHaveBeenCalledWith('Export error:', expect.any(Error));
      expect(H.db.state.resume_exports).toHaveLength(0);
    });
  });

  describe('GET /history', () => {
    it('returns { data: { resumes, count } } for the caller only, newest first, default limit 10', async () => {
      const svc = require('../../../src/worker/services/resumeDatabase').createResumeDatabase({ db: H.db });
      for (let i = 0; i < 12; i++) await svc.saveResume(1, `r${i}`, { total: i });
      await svc.saveResume(2, 'other user', { total: 1 });
      const res = await H.request('/api/ats/history', H.authed());
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(Object.keys(body)).toEqual(['data']);
      expect(Object.keys(body.data)).toEqual(['resumes', 'count']);
      expect(body.data.count).toBe(10);
      expect(body.data.resumes).toHaveLength(10);
      expect(body.data.resumes[0]).toEqual(expect.objectContaining({ original_score: 11, export_count: '0' }));
    });

    it('honours ?limit, falls back to 10 for junk / zero, and uses the first value of a repeated key', async () => {
      const svc = require('../../../src/worker/services/resumeDatabase').createResumeDatabase({ db: H.db });
      for (let i = 0; i < 12; i++) await svc.saveResume(1, `r${i}`, { total: i });
      const count = async (q) => (await (await H.request(`/api/ats/history${q}`, H.authed())).json()).data.count;
      expect(await count('?limit=3')).toBe(3);
      expect(await count('?limit=abc')).toBe(10);
      expect(await count('?limit=0')).toBe(10);
      expect(await count('?limit=11')).toBe(11);
      expect(await count('?limit=2&limit=5')).toBe(2); // parseInt(['2','5']) === 2, as in Express
    });

    it('a database failure is a masked 500 and is logged', async () => {
      H.db.failWhenDocs((sql) => /FROM resumes r/.test(sql), new Error('db down'));
      const res = await H.request('/api/ats/history', H.authed());
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual(MASKED);
      expect(console.error).toHaveBeenCalledWith('History query error:', expect.any(Error));
    });
  });
});
