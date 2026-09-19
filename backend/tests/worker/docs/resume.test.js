'use strict';

/**
 * routes/resume.js: 8 endpoints, authenticateToken only (no requirePlan anywhere). Behavioural parity with the
 * Express original (bodies, upload validation, headers) is proven in parity.test.js against the real Express
 * routers; this file pins the auth / tier contract, the injected-service wiring and output validity.
 */
jest.mock('../../../src/worker/services/docs/docLibs', () => require('./helpers/realDocLibs'));

const JSZip = require('jszip');
const { makeDocsHarness } = require('./helpers/docsHarness');
const { makeEnv } = require('../helpers/harness');
const { PDF, DOCX, RESUME_LINES, makePdf, file, multipart } = require('./helpers/fixtures');

const JD = 'Looking for a Node.js and Python engineer with AWS, Docker and SQL.';
const ENDPOINTS = [
  ['POST', '/api/resume/upload'],
  ['GET', '/api/resume/list'],
  ['GET', '/api/resume/scores'],
  ['GET', '/api/resume/41'],
  ['DELETE', '/api/resume/41'],
  ['POST', '/api/resume/tune'],
  ['POST', '/api/resume/ai-edit'],
  ['POST', '/api/resume/build'],
];

describe('routes/resume.js', () => {
  let H;
  beforeEach(() => {
    H = makeDocsHarness({ plan: null }); // no subscription at all: none of these endpoints is plan-gated
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  describe('auth and tier parity (manifest: 8 endpoints, all auth, none requirePlan)', () => {
    it.each(ENDPOINTS)('%s %s answers 401 without a token', async (method, path) => {
      const res = await H.request(path, { method });
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: 'Unauthorized' });
    });

    it.each(ENDPOINTS)('%s %s rejects a bad token with 401', async (method, path) => {
      const res = await H.request(path, { method, headers: { Authorization: 'Bearer not.a.jwt' } });
      expect(res.status).toBe(401);
    });

    it('a user with no plan reaches every endpoint (never a 403 PLAN_UPGRADE_REQUIRED)', async () => {
      const pdf = await makePdf();
      const calls = [
        H.request('/api/resume/upload', H.authed(multipart([['resume', file(pdf, PDF, 'a.pdf')]]))),
        H.request('/api/resume/list', H.authed()),
        H.request('/api/resume/scores', H.authed()),
        H.request('/api/resume/41', H.authed()),
        H.request('/api/resume/41', H.authed({ method: 'DELETE' })),
        H.request('/api/resume/tune', H.authed(multipart([['resume', file(pdf, PDF, 'a.pdf')], ['jobDescription', JD]]))),
        H.request('/api/resume/ai-edit', H.json({ instruction: 'x' })),
        H.request('/api/resume/build', H.json({ fullName: 'A B', targetJobDescription: JD })),
      ];
      const statuses = (await Promise.all(calls)).map((r) => r.status);
      expect(statuses).not.toContain(403);
      expect(statuses).toEqual([200, 200, 200, 404, 404, 200, 200, 200]);
    });
  });

  describe('POST /upload', () => {
    it('analyses a PDF, persists one row for the caller and returns { success, data } with parsed JSON columns', async () => {
      const pdf = await makePdf(RESUME_LINES);
      const res = await H.request('/api/resume/upload', H.authed(multipart([['resume', file(pdf, PDF, 'jane.pdf')]])));
      expect(res.status).toBe(200);
      const { success, data } = await res.json();
      expect(success).toBe(true);
      expect(data).toMatchObject({ user_id: 1, file_name: 'jane.pdf', file_size: pdf.length });
      expect(Object.keys(data.scores).sort()).toEqual(['ats', 'clarity', 'completeness', 'impact', 'industry_fit', 'skills']);
      expect(data.sections).toMatchObject({ summary: true, experience: true, education: true, skills: true });
      expect(data.suggestions).toHaveLength(6);
      expect(H.db.state.resumes).toHaveLength(1);
    });

    it('uses the multipart text field, then the JSON body, for the file name when no file is sent', async () => {
      const a = await H.request('/api/resume/upload', H.authed(multipart([['fileName', 'typed.pdf']])));
      expect((await a.json()).data.file_name).toBe('typed.pdf');
      const b = await H.request('/api/resume/upload', H.json({ fileName: 'json.pdf' }));
      expect((await b.json()).data.file_name).toBe('json.pdf');
      const c = await H.request('/api/resume/upload', H.authed({ method: 'POST' }));
      expect((await c.json()).data.file_name).toBe('resume.pdf');
    });

    it('a database failure is a masked 500 (Express next(err))', async () => {
      H.db.failWhenDocs((sql) => /INSERT INTO resumes/.test(sql), new Error('db down'));
      const res = await H.request('/api/resume/upload', H.authed(multipart([['resume', file('x', PDF, 'a.pdf')]])));
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: 'Internal Server Error' });
    });
  });

  describe('GET /:id vs the /v2 routes mounted after it (registration order)', () => {
    it('GET /api/resume/v2/history is served by resumeV2, not captured by /:id', async () => {
      const res = await H.request('/api/resume/v2/history', H.authed());
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ status: 'success', history: [] });
    });

    it('GET /api/resume/v2 (one segment) IS captured by /:id, exactly as in Express (id = "v2")', async () => {
      // Express then ran `WHERE id = 'v2'`; the fake db has no such row, so the route answers 404 in the same way
      const res = await H.request('/api/resume/v2', H.authed());
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: 'Resume not found' });
    });
  });

  describe('POST /tune: generated files are valid documents', () => {
    const tune = async (fmt) => {
      const parts = [['resume', file(await makePdf(RESUME_LINES), PDF, 'jane.pdf')], ['jobDescription', JD]];
      if (fmt) parts.push(['outputFormat', fmt]);
      const res = await H.request('/api/resume/tune', H.authed(multipart(parts)));
      return { res, body: await res.json() };
    };

    it('docx (default): base64 decodes to a DOCX zip containing the tuned resume', async () => {
      const { res, body } = await tune();
      expect(res.status).toBe(200);
      expect(body.outputFormat).toBe('docx');
      expect(body.mimeType).toBe(DOCX);
      expect(body.fileName).toBe('jane_optimized.docx');
      const zip = await JSZip.loadAsync(Buffer.from(body.fileBase64, 'base64'));
      const xml = await zip.file('word/document.xml').async('string');
      expect(xml).toContain('ATS Optimized Resume');
      expect(xml).toContain('Matched Keywords');
      expect(body.tunedResume).toContain('## ATS Alignment Summary');
    });

    it('pdf: base64 decodes to a PDF', async () => {
      const { body } = await tune('pdf');
      expect(body.outputFormat).toBe('pdf');
      expect(body.mimeType).toBe(PDF);
      const bytes = Buffer.from(body.fileBase64, 'base64');
      expect(bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');
      expect(bytes.subarray(-1024).toString('latin1')).toContain('%%EOF');
    });
  });

  describe('POST /build', () => {
    it('builds a DOCX and a PDF from the questionnaire', async () => {
      const payload = { fullName: 'Jane Example', targetJobDescription: JD, targetJobTitle: 'Engineer', skills: 'Node.js, SQL' };
      const docx = await (await H.request('/api/resume/build', H.json(payload))).json();
      expect(docx.fileName).toBe('Jane_Example_resume.docx');
      expect((await JSZip.loadAsync(Buffer.from(docx.fileBase64, 'base64'))).file('word/document.xml')).toBeTruthy();
      const pdf = await (await H.request('/api/resume/build', H.json({ ...payload, outputFormat: 'pdf' }))).json();
      expect(pdf.fileName).toBe('Jane_Example_resume.pdf');
      expect(Buffer.from(pdf.fileBase64, 'base64').subarray(0, 5).toString('latin1')).toBe('%PDF-');
    });
  });

  describe('POST /ai-edit: the injected aiClient and config', () => {
    it('reads the model from config.vars.LM_STUDIO_MODEL_RESUME and returns the suggestion', async () => {
      H = makeDocsHarness({ plan: null, env: makeEnv({ LM_STUDIO_MODEL_RESUME: 'resume-model-x' }) });
      const res = await H.request('/api/resume/ai-edit', H.json({ instruction: 'Tighten', resumeText: 'my resume' }));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ success: true, data: { suggestion: 'AI SUGGESTION' } });
      expect(H.aiClient.callAI).toHaveBeenCalledTimes(1);
      expect(H.aiClient.callAI.mock.calls[0][0]).toMatchObject({ model: 'resume-model-x', maxTokens: 512, temperature: 0.2 });
      expect(H.aiClient.callAI.mock.calls[0][0].userPrompt).toContain('Instruction: Tighten');
    });

    it('a failing provider is 502 with the provider error; a thrown provider error is a masked 500', async () => {
      H.aiClient.callAI.mockResolvedValueOnce({ ok: false, error: 'model offline' });
      const a = await H.request('/api/resume/ai-edit', H.json({ instruction: 'x' }));
      expect(a.status).toBe(502);
      expect(await a.json()).toEqual({ error: 'model offline' });
      H.aiClient.callAI.mockRejectedValueOnce(new Error('network'));
      const b = await H.request('/api/resume/ai-edit', H.json({ instruction: 'x' }));
      expect(b.status).toBe(500);
      expect(await b.json()).toEqual({ error: 'Internal Server Error' });
    });
  });

  describe('data isolation', () => {
    it('list, scores, get and delete only ever see the caller\'s rows', async () => {
      H.db.state.resumes.push(
        { id: 1, user_id: 1, file_name: 'mine.pdf', scores: { ats: 1 }, overall_score: 10, created_at: new Date('2026-01-02') },
        { id: 2, user_id: 2, file_name: 'theirs.pdf', scores: { ats: 2 }, overall_score: 20, created_at: new Date('2026-01-03') }
      );
      const list = await (await H.request('/api/resume/list', H.authed())).json();
      expect(list.data.map((r) => r.file_name)).toEqual(['mine.pdf']);
      const scores = await (await H.request('/api/resume/scores', H.authed())).json();
      expect(scores.data).toEqual({ scores: { ats: 1 }, overall_score: 10 });
      expect((await H.request('/api/resume/2', H.authed())).status).toBe(404);
      expect((await H.request('/api/resume/2', H.authed({ method: 'DELETE' }))).status).toBe(404);
      expect(H.db.state.resumes).toHaveLength(2);
      expect((await H.request('/api/resume/1', H.authed({ method: 'DELETE' }))).status).toBe(200);
      expect(H.db.state.resumes.map((r) => r.id)).toEqual([2]);
    });
  });
});
