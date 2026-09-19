'use strict';

/**
 * routes/resumeV2.js: 5 endpoints; authenticateToken on all, requirePlan(2) on analyze / feedback / export.
 * Behavioural parity with Express is proven in parity.test.js; this file pins the tier contract, the wiring to the
 * injected analyzers (incl. a fake engine so the persist branch, which the real engine never reaches, is covered),
 * and the download response.
 */
jest.mock('../../../src/worker/services/docs/docLibs', () => require('./helpers/realDocLibs'));

const { makeDocsHarness } = require('./helpers/docsHarness');
const { PDF, makePdf, file, multipart } = require('./helpers/fixtures');
const { parsePdf } = require('../../../src/worker/services/docs/docText');

const RESUME = ['Jane Example', 'jane@example.test', 'EXPERIENCE', 'Built APIs used by 50K users.', 'SKILLS', 'Node.js SQL'].join('\n') + '\n' + 'x'.repeat(120);
const GATED = [
  ['POST', '/api/resume/v2/analyze', { resumeText: RESUME }],
  ['POST', '/api/resume/v2/feedback', { resumeText: RESUME }],
  ['POST', '/api/resume/v2/export', { resumeText: RESUME, format: 'txt' }],
];
const AUTH_ONLY = [
  ['GET', '/api/resume/v2/history'],
  ['GET', '/api/resume/v2/5'],
];

describe('routes/resumeV2.js', () => {
  let H;
  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  describe('auth parity', () => {
    it.each([...GATED.map(([m, p]) => [m, p]), ...AUTH_ONLY])('%s %s answers 401 without a token', async (method, path) => {
      H = makeDocsHarness({ plan: 3 });
      const res = await H.request(path, { method, headers: { 'Content-Type': 'application/json' }, body: method === 'POST' ? '{}' : undefined });
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: 'Unauthorized' });
    });
  });

  describe('requirePlan(2) on analyze, feedback and export', () => {
    const upgrade = (current) => ({
      error: 'This feature requires a higher subscription plan.',
      code: 'PLAN_UPGRADE_REQUIRED',
      requiredPlan: 'Tune & Polish',
      currentPlan: current,
    });

    it.each(GATED)('%s %s: 403 PLAN_UPGRADE_REQUIRED with no plan and with tier 1', async (method, path, body) => {
      for (const [plan, current] of [[null, null], [1, 'Learn & Build']]) {
        H = makeDocsHarness({ plan });
        const res = await H.request(path, H.json(body));
        expect(res.status).toBe(403);
        expect(await res.json()).toEqual(upgrade(current));
      }
    });

    it.each(GATED)('%s %s: allowed at tier 2 and tier 3', async (method, path, body) => {
      for (const plan of [2, 3]) {
        H = makeDocsHarness({ plan });
        const res = await H.request(path, H.json(body));
        expect(res.status).toBe(200);
      }
    });

    it('the gate runs before the upload is read (a bad upload is 403, not a masked 500)', async () => {
      H = makeDocsHarness({ plan: 1 });
      const res = await H.request('/api/resume/v2/analyze', H.authed(multipart([['resume', file('x', 'image/png', 'a.png')]])));
      expect(res.status).toBe(403);
    });

    it('a plan lookup failure fails CLOSED with 500, never reaching the handler', async () => {
      H = makeDocsHarness({ plan: 3 });
      const engine = { analyze: jest.fn() };
      H = makeDocsHarness({
        plan: 3,
        overrides: { resumeAnalysisEngine: engine, planService: { getUserPlan: async () => { throw new Error('db down'); } } },
      });
      const res = await H.request('/api/resume/v2/analyze', H.json({ resumeText: RESUME }));
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: 'Failed to verify subscription plan' });
      expect(engine.analyze).not.toHaveBeenCalled();
    });
  });

  describe('history and :resumeId are auth-only (a user with no plan gets through)', () => {
    beforeEach(() => {
      H = makeDocsHarness({ plan: null });
    });

    it('GET /v2/history', async () => {
      const res = await H.request('/api/resume/v2/history', H.authed());
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ status: 'success', history: [] });
    });

    it('GET /v2/:resumeId: 404 shape, and an owner-scoped row', async () => {
      const miss = await H.request('/api/resume/v2/5', H.authed());
      expect(miss.status).toBe(404);
      expect(await miss.json()).toEqual({ status: 'error', message: 'Resume not found' });
      H.db.state.resumes.push({ id: 5, user_id: 1, original_resume: 'r', original_score: 7 }, { id: 6, user_id: 2, original_resume: 'q' });
      const hit = await H.request('/api/resume/v2/5', H.authed());
      expect(hit.status).toBe(200);
      expect(await hit.json()).toEqual({ status: 'success', resume: { id: 5, user_id: 1, original_resume: 'r', original_score: 7 } });
      expect((await H.request('/api/resume/v2/6', H.authed())).status).toBe(404); // someone else's
    });

    it('a database failure answers the route\'s own 500 shapes (not the masked error)', async () => {
      H.db.failWhenDocs(() => true, new Error('db down'));
      const hist = await H.request('/api/resume/v2/history', H.authed());
      expect(hist.status).toBe(500);
      expect(await hist.json()).toEqual({ status: 'error', message: 'Failed to retrieve history' });
      const one = await H.request('/api/resume/v2/5', H.authed());
      expect(one.status).toBe(500);
      expect(await one.json()).toEqual({ status: 'error', message: 'Failed to retrieve resume' });
    });
  });

  describe('POST /v2/analyze wiring', () => {
    const engineResult = {
      overallScore: 81,
      detectedRole: { role: 'backend', displayName: 'Backend Engineer', confidence: 90 },
      scores: { contact: 10 }, maxScores: { contact: 10 }, contactInfo: { email: 'x' }, summary: 's', quality: 'q',
      issues: [], recommendations: [], atsCompatible: true,
      analysis: { keywords: { keywords: { found: ['a', 'b'], total: 5 } }, missingInfo: { missing: ['phone'] } },
    };

    it('passes the resume text (and file bytes) to the injected engine and persists through resumeDatabase', async () => {
      const engine = { analyze: jest.fn(() => engineResult) };
      H = makeDocsHarness({ plan: 2, overrides: { resumeAnalysisEngine: engine } });
      const pdf = await makePdf(['Jane Example', 'Built APIs']);
      const res = await H.request('/api/resume/v2/analyze', H.authed(multipart([['resume', file(pdf, PDF, 'a.pdf')]])));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toMatchObject({ status: 'success', message: 'Resume analyzed successfully', atsCompatible: true, resumeId: expect.any(Number) });
      expect(body.resumeText).toContain('Jane Example');
      expect(body.analysis).toMatchObject({ overallScore: 81, detectedRole: engineResult.detectedRole, processingTimeMs: expect.any(Number) });
      expect(engine.analyze).toHaveBeenCalledWith(expect.stringContaining('Jane Example'), expect.any(Uint8Array));
      expect(engine.analyze.mock.calls[0][1].length).toBe(pdf.length);
      expect(H.db.state.resumes).toHaveLength(1);
      expect(H.db.state.resumes[0]).toMatchObject({
        user_id: 1, original_score: 81, role_detected: 'backend', keyword_coverage: { found: 2, total: 5 }, missing_info: ['phone'],
      });
    });

    it('a persist failure is swallowed: analysis still returned, resumeId null', async () => {
      H = makeDocsHarness({ plan: 2, overrides: { resumeAnalysisEngine: { analyze: () => engineResult } } });
      H.db.failWhenDocs((sql) => /INSERT INTO resumes/.test(sql), new Error('insert failed'));
      const res = await H.request('/api/resume/v2/analyze', H.json({ resumeText: RESUME }));
      expect(res.status).toBe(200);
      expect((await res.json()).resumeId).toBeNull();
      expect(console.error).toHaveBeenCalledWith('Resume analysis saved locally but DB persist failed:', 'insert failed');
    });

    it('an engine that throws is the route\'s own 500 with details', async () => {
      H = makeDocsHarness({ plan: 2, overrides: { resumeAnalysisEngine: { analyze: () => { throw new Error('engine broke'); } } } });
      const res = await H.request('/api/resume/v2/analyze', H.json({ resumeText: RESUME }));
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ status: 'error', message: 'Resume analysis failed', details: 'engine broke' });
    });

    it('preserved bug: with the REAL engine nothing is ever persisted and resumeId is always null', async () => {
      H = makeDocsHarness({ plan: 2 });
      const res = await H.request('/api/resume/v2/analyze', H.json({ resumeText: RESUME }));
      expect(res.status).toBe(200);
      expect((await res.json()).resumeId).toBeNull();
      expect(H.db.state.resumes).toHaveLength(0);
    });
  });

  describe('POST /v2/feedback wiring', () => {
    it('merges the rule-based marker into the critic output', async () => {
      const analysis = { overallScore: 55, detectedRole: { role: 'x' } };
      H = makeDocsHarness({
        plan: 2,
        overrides: {
          resumeAnalysisEngine: { analyze: jest.fn(() => analysis) },
          resumeCriticEngine: { generateQuickFeedback: jest.fn(() => ({ strengths: ['s'], weaknesses: ['w'] })) },
        },
      });
      const res = await H.request('/api/resume/v2/feedback', H.json({ resumeText: 'anything' }));
      expect(await res.json()).toEqual({
        status: 'success',
        message: 'Feedback generated successfully',
        score: 55,
        feedback: { source: 'rule-based', strengths: ['s'], weaknesses: ['w'] },
        roleContext: { role: 'x' },
      });
    });

    it('400 when the text is missing or not a string', async () => {
      H = makeDocsHarness({ plan: 2 });
      for (const body of [{}, { resumeText: 5 }, { resumeText: '' }]) {
        const res = await H.request('/api/resume/v2/feedback', H.json(body));
        expect(res.status).toBe(400);
        expect(await res.json()).toEqual({ status: 'error', message: 'Resume text required' });
      }
    });
  });

  describe('POST /v2/export downloads', () => {
    beforeEach(() => {
      H = makeDocsHarness({ plan: 2 });
    });
    const exp = (body) => H.request('/api/resume/v2/export', H.json(body));

    it('txt: text/plain; charset=utf-8, attachment filename, exact bytes and Content-Length', async () => {
      const text = RESUME + ' héllo';
      const res = await exp({ resumeText: text });
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe('text/plain; charset=utf-8');
      expect(res.headers.get('content-disposition')).toMatch(/^attachment; filename="resume-\d+\.txt"$/);
      expect(res.headers.get('content-length')).toBe(String(Buffer.byteLength(text)));
      expect(await res.text()).toBe(text);
    });

    it('pdf: a valid PDF whose text contains the resume, application/pdf, correct Content-Length', async () => {
      const res = await exp({ resumeText: RESUME, format: 'pdf' });
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe('application/pdf');
      expect(res.headers.get('content-disposition')).toMatch(/^attachment; filename="resume-\d+\.pdf"$/);
      const bytes = new Uint8Array(await res.arrayBuffer());
      expect(res.headers.get('content-length')).toBe(String(bytes.length));
      expect(Buffer.from(bytes.subarray(0, 5)).toString('latin1')).toBe('%PDF-');
      const parsed = await parsePdf(bytes);
      expect(parsed.text.replace(/\s+/g, ' ')).toContain('Jane Example');
    });

    it('docx: preserved quirk, the text under the DOCX mime type (with the charset Express appended)', async () => {
      const res = await exp({ resumeText: RESUME, format: 'docx' });
      expect(res.headers.get('content-type')).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document; charset=utf-8');
      expect(await res.text()).toBe(RESUME);
    });

    it('400 for missing text / invalid format; 500 "Export validation failed" for short content; 500 "Export failed" for a null format', async () => {
      expect((await (await exp({})).json())).toEqual({ status: 'error', message: 'Resume text required' });
      const invalid = await exp({ resumeText: RESUME, format: 'rtf' });
      expect(invalid.status).toBe(400);
      expect(await invalid.json()).toEqual({ status: 'error', message: 'Invalid format. Use: pdf, docx, or txt' });
      const short = await exp({ resumeText: 'too short' });
      expect(short.status).toBe(500);
      expect(await short.json()).toEqual({ status: 'error', message: 'Export validation failed', details: ['Content too short (minimum 100 characters)'] });
      const nul = await exp({ resumeText: RESUME, format: null });
      expect(nul.status).toBe(500);
      expect(await nul.json()).toEqual({ status: 'error', message: 'Export failed', details: expect.stringContaining('toLowerCase') });
    });
  });
});
