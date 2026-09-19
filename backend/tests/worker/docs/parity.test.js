'use strict';

/**
 * Express-vs-Worker DIFFERENTIAL tests for the four document route files.
 *
 * The same HTTP request goes to (a) the ORIGINAL Express routers running behind a real express() with the real
 * multer, body parsers and errorHandler (helpers/expressReference.js) and (b) the Worker app, each with its own
 * identically-seeded in-memory db. Status, JSON body, the download headers and the resulting db rows are compared.
 * Only the things that legitimately cannot be equal are masked: timing fields, timestamps embedded in file
 * names, and the bytes of generated PDF / DOCX files (compared by extracted text instead).
 *
 * What this proves: ported route logic, upload validation, response shapes and headers against the real Express
 * behaviour. What it does NOT prove: workerd, the Neon driver, SQL against Postgres, authenticateToken /
 * requirePlan (stubbed on the Express side; gating is asserted on the Worker routes in the per-route tests).
 */
jest.mock('../../../src/worker/services/docs/docLibs', () => require('./helpers/realDocLibs'));

const JSZip = require('jszip');
const pdfParseRef = require('pdf-parse');
const { signToken } = require('../helpers/harness');
const { startExpress } = require('./helpers/expressReference');
const { createDocsDb, makeDocsHarness } = require('./helpers/docsHarness');
const { PDF, DOCX, RESUME_LINES, makePdf, makeBigPdf, makeDocx, file, multipart } = require('./helpers/fixtures');

const RESUME_TEXT_LONG = RESUME_LINES.join('\n') + '\n' + 'Deployed Docker on AWS, reduced costs by 40%, mentored 3 engineers. '.repeat(6);
const JD = 'We need a Node.js and Python engineer with AWS, Docker, SQL and REST API experience. Kubernetes a plus.';

let current; // { dbE, H } for the running test
let expressServer;
let aiClient;

beforeAll(async () => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  aiClient = { callAI: jest.fn() };
  const pool = {
    query: (sql, params) => (/^\s*(CREATE|ALTER)\b/i.test(sql) ? Promise.resolve({ rows: [], rowCount: 0 }) : current.dbE.query(sql, params)),
  };
  expressServer = await startExpress({ pool, aiClient });
});
afterAll(async () => {
  await expressServer.close();
  jest.restoreAllMocks();
});
beforeEach(() => {
  aiClient.callAI.mockReset();
  aiClient.callAI.mockResolvedValue({ ok: true, data: 'AI SUGGESTION' });
  const dbE = createDocsDb();
  const H = makeDocsHarness({ plan: 2, overrides: { aiClient } });
  current = { dbE, H };
});

// ---- plumbing -----------------------------------------------------------------------------------
const auth = (side, id = 1) => `Bearer ${side === 'express' ? `express-user-${id}` : signToken({ id })}`;

async function send(side, spec) {
  const init = spec.build(side);
  init.headers = { ...(spec.noAuth ? {} : { Authorization: auth(side, spec.user || 1) }), ...(init.headers || {}) };
  if (side === 'express') {
    const res = await fetch(expressServer.base + spec.path, init);
    return finish(res);
  }
  const res = await current.H.request(spec.path, init);
  return finish(res);
}

async function finish(res) {
  const bytes = Buffer.from(await res.arrayBuffer());
  const type = res.headers.get('content-type') || '';
  return {
    status: res.status,
    type: type.replace(/^application\/json; charset=utf-8$/, 'application/json'), // Express adds a charset to JSON, Hono does not (README section 4)
    disposition: res.headers.get('content-disposition'),
    length: res.headers.get('content-length'),
    bytes,
    body: type.includes('json') ? JSON.parse(bytes.toString('utf8')) : undefined,
  };
}

/** Run the spec on both sides. `seed(db)` is applied to BOTH databases before the request. */
async function both(spec) {
  if (spec.seed) {
    spec.seed(current.dbE);
    spec.seed(current.H.db);
  }
  const e = await send('express', spec);
  const w = await send('worker', spec);
  return { e, w };
}

const rows = (db) => ({
  resumes: JSON.parse(JSON.stringify(db.state.resumes)),
  exports: db.state.resume_exports.map(({ id, resume_id, export_format }) => ({ id, resume_id, export_format })),
  exportPaths: db.state.resume_exports.map((r) => r.file_path.replace(/\d{10,}/, 'TS')),
});
const dbState = () => ({ e: rows(current.dbE), w: rows(current.H.db) });

const json = (body) => (side) => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const form = (parts) => () => multipart(parts);
const get = () => () => ({ method: 'GET' });
const del = () => () => ({ method: 'DELETE' });
const maskTiming = (o) => {
  const c = JSON.parse(JSON.stringify(o));
  if (c && c.analysis) c.analysis.processingTimeMs = 'T';
  return c;
};
const maskName = (s) => (s === null || s === undefined ? s : s.replace(/\d{10,}/, 'TS'));

const seedResume = (over = {}) => (db) =>
  db.state.resumes.push({
    id: 41, user_id: 1, file_name: 'seed.pdf', file_size: 10, scores: { ats: 80 }, sections: { skills: true }, suggestions: [],
    overall_score: 77, original_resume: RESUME_TEXT_LONG, optimized_resume: null, original_score: 70, role_detected: 'backend',
    created_at: new Date('2026-02-01T00:00:00Z'), updated_at: null, ...over,
  });

// The one documented textual deviation: V8 names the destructured expression in its TypeError message, which
// Express reported as 'req.body' and the Worker reports as 'getBody(...)' (only reachable without a JSON body).
const maskDestructure = (o) => {
  if (o === undefined) return o;
  const c = JSON.parse(JSON.stringify(o));
  if (c && typeof c.details === 'string') c.details = c.details.replace("of 'getBody(...)'", "of 'req.body'");
  return c;
};

function expectSameJson({ e, w }, { mask = (x) => x } = {}) {
  expect(w.status).toBe(e.status);
  expect(w.type).toBe(e.type);
  expect(maskDestructure(mask(w.body))).toEqual(maskDestructure(mask(e.body)));
}

// =============================================================================================
describe('parity: routes/resume.js (Express original vs Worker)', () => {
  describe('POST /api/resume/upload', () => {
    it('PDF upload: same analysis, same persisted row, same response', async () => {
      const pdf = await makeBigPdf(RESUME_TEXT_LONG.split('\n'));
      const r = await both({ path: '/api/resume/upload', build: form([['resume', file(pdf, PDF, 'jane.pdf')]]) });
      expectSameJson(r);
      expect(r.e.status).toBe(200);
      expect(r.w.body.data.file_name).toBe('jane.pdf');
      expect(r.w.body.data.file_size).toBe(pdf.length);
      expect(dbState().w).toEqual(dbState().e);
    });

    it.each([
      ['DOCX (no DOCX branch: scores an empty text)', () => makeDocx(), DOCX, 'jane.docx'],
      ['application/msword', () => Buffer.from('legacy doc bytes'), 'application/msword', 'old.doc'],
      ['a corrupt PDF (falls back to the raw bytes as text)', () => Buffer.from('%PDF-1.4 SUMMARY EXPERIENCE python sql not really a pdf'), PDF, 'bad.pdf'],
    ])('%s', async (_l, make, type, name) => {
      const r = await both({ path: '/api/resume/upload', build: form([['resume', file(await make(), type, name)]]) });
      expectSameJson(r);
      expect(r.w.status).toBe(200);
      expect(dbState().w).toEqual(dbState().e);
    });

    it('no file: file name from a JSON body, from a multipart text field, or the default', async () => {
      for (const build of [json({ fileName: 'from-json.pdf' }), json({}), form([['fileName', 'from-field.pdf']]), form([['x', 'y']]), () => ({ method: 'POST' })]) {
        const r = await both({ path: '/api/resume/upload', build });
        expectSameJson(r);
      }
      expect(dbState().w).toEqual(dbState().e);
      expect(dbState().w.resumes.map((x) => x.file_name)).toEqual(['from-json.pdf', 'resume.pdf', 'from-field.pdf', 'resume.pdf', 'resume.pdf']);
    });

    it('rejected uploads are the same masked 500 and persist nothing: wrong type, over 10 MB, unexpected field', async () => {
      const cases = [
        form([['resume', file('x', 'text/plain', 'a.txt')]]),
        form([['resume', file(new Uint8Array(10 * 1024 * 1024 + 1), PDF, 'big.pdf')]]),
        form([['other', file('x', PDF, 'a.pdf')]]),
      ];
      for (const build of cases) {
        const r = await both({ path: '/api/resume/upload', build });
        expectSameJson(r);
        expect(r.w.status).toBe(500);
        expect(r.w.body).toEqual({ error: 'Internal Server Error' });
      }
      expect(dbState().w.resumes).toEqual([]);
      expect(dbState().e.resumes).toEqual([]);
    });

    it('the 10 MB limit is exclusive on both sides: 10 MB - 1 is accepted, exactly 10 MB is a masked 500', async () => {
      const limit = 10 * 1024 * 1024;
      const under = await both({ path: '/api/resume/upload', build: form([['resume', file(new Uint8Array(limit - 1).fill(0x20), PDF, 'under.pdf')]]) });
      expectSameJson(under);
      expect(under.w.status).toBe(200);
      const exact = await both({ path: '/api/resume/upload', build: form([['resume', file(new Uint8Array(limit).fill(0x20), PDF, 'exact.pdf')]]) });
      expectSameJson(exact);
      expect(exact.w.status).toBe(500);
    });

    it('non-ASCII file names are stored / echoed identically (multer latin1 mojibake preserved)', async () => {
      const r = await both({ path: '/api/resume/upload', build: form([['resume', file('hello', PDF, 'résumé 日本.pdf')]]) });
      expectSameJson(r);
      expect(r.w.body.data.file_name).toBe(r.e.body.data.file_name);
      expect(r.e.body.data.file_name).not.toBe('résumé 日本.pdf');
    });
  });

  describe('GET /list, GET /scores, GET /:id, DELETE /:id', () => {
    const seeded = (db) => {
      seedResume()(db);
      seedResume({ id: 42, user_id: 1, file_name: 'newer.pdf', created_at: new Date('2026-03-01T00:00:00Z'), scores: '{"ats":91}' })(db);
      seedResume({ id: 43, user_id: 2, file_name: 'other-user.pdf' })(db);
      db.state.resume_embeddings.push(
        { resume_id: 41, user_id: 1, chunk_index: 1, chunk_text: 'second chunk' },
        { resume_id: 41, user_id: 1, chunk_index: 0, chunk_text: 'first chunk' }
      );
    };

    it('list, scores', async () => {
      expectSameJson(await both({ path: '/api/resume/list', build: get(), seed: seeded }));
      expectSameJson(await both({ path: '/api/resume/scores', build: get() }));
      const empty = await both({ path: '/api/resume/scores', build: get(), user: 9 });
      expectSameJson(empty);
      expect(empty.w.body).toEqual({ success: true, data: null });
    });

    it('get by id: with chunks, without chunks, not found, someone else\'s', async () => {
      const withChunks = await both({ path: '/api/resume/41', build: get(), seed: seeded });
      expectSameJson(withChunks);
      expect(withChunks.w.body.data.content).toBe('first chunk\nsecond chunk');
      const noChunks = await both({ path: '/api/resume/42', build: get() });
      expectSameJson(noChunks);
      expect(noChunks.w.body.data.content).toBe('');
      expect(noChunks.w.body.data.scores).toEqual({ ats: 91 }); // JSON string column parsed
      for (const id of ['999', '43']) {
        const nf = await both({ path: `/api/resume/${id}`, build: get() });
        expectSameJson(nf);
        expect(nf.w.status).toBe(404);
      }
    });

    it('delete: owner, repeat, someone else\'s', async () => {
      const first = await both({ path: '/api/resume/41', build: del(), seed: seeded });
      expectSameJson(first);
      expect(first.w.body).toEqual({ success: true, message: 'Resume deleted successfully.' });
      for (const spec of [{ path: '/api/resume/41', build: del() }, { path: '/api/resume/43', build: del() }]) {
        const r = await both(spec);
        expectSameJson(r);
        expect(r.w.status).toBe(404);
      }
      expect(dbState().w).toEqual(dbState().e);
    });
  });

  describe('POST /tune', () => {
    const fileBase64Text = async (r, side) => {
      const buf = Buffer.from(r[side].body.fileBase64, 'base64');
      if (r[side].body.outputFormat === 'pdf') return (await pdfParseRef(new Uint8Array(buf))).text;
      const xml = await (await JSZip.loadAsync(buf)).file('word/document.xml').async('string');
      return xml.replace(/<w:t[^>]*>([^<]*)<\/w:t>/g, '[$1]').match(/\[[^\]]*\]/g).join('');
    };
    const sameWithoutFile = (r) => {
      const strip = ({ fileBase64, ...rest }) => rest;
      expect(r.w.status).toBe(r.e.status);
      expect(strip(r.w.body)).toEqual(strip(r.e.body));
    };

    it('DOCX output (default) and PDF output, JD in multipart fields', async () => {
      const pdf = await makeBigPdf(RESUME_TEXT_LONG.split('\n'));
      for (const fmt of [undefined, 'docx', 'pdf', 'PDF', 'unknown']) {
        const parts = [['resume', file(pdf, PDF, 'jane.resume.pdf')], ['jobDescription', JD]];
        if (fmt !== undefined) parts.push(['outputFormat', fmt]);
        const r = await both({ path: '/api/resume/tune', build: form(parts) });
        sameWithoutFile(r);
        expect(r.w.status).toBe(200);
        expect(r.w.body.fileName).toBe(fmt && fmt.toLowerCase() === 'pdf' ? 'jane.resume_optimized.pdf' : 'jane.resume_optimized.docx');
        expect(r.w.body.atsScore).toBeGreaterThanOrEqual(90);
        expect(await fileBase64Text(r, 'w')).toBe(await fileBase64Text(r, 'e'));
      }
    });

    it('validation: no file, no / blank job description, multipart without fields, JSON body (multer skipped)', async () => {
      const pdf = await makeBigPdf(RESUME_TEXT_LONG.split('\n'));
      const cases = [
        form([['jobDescription', JD]]),
        form([['resume', file(pdf, PDF, 'a.pdf')]]),
        form([['resume', file(pdf, PDF, 'a.pdf')], ['jobDescription', '   ']]),
        json({ jobDescription: JD }),
        () => ({ method: 'POST' }),
      ];
      const seen = [];
      for (const build of cases) {
        const r = await both({ path: '/api/resume/tune', build });
        expectSameJson(r);
        seen.push(r.w.status);
      }
      expect(seen).toEqual([400, 400, 400, 400, 400]);
    });

    it('DOCX input: 422 "Could not extract text"; blank PDF: 422; invalid type: masked 500', async () => {
      const blank = await makePdf([' ']);
      const docx = await makeDocx();
      const cases = [
        [form([['resume', file(docx, DOCX, 'a.docx')], ['jobDescription', JD]]), 422],
        [form([['resume', file(blank, PDF, 'blank.pdf')], ['jobDescription', JD]]), 422],
        [form([['resume', file('x', 'text/plain', 'a.txt')], ['jobDescription', JD]]), 500],
      ];
      for (const [build, status] of cases) {
        const r = await both({ path: '/api/resume/tune', build });
        expectSameJson(r);
        expect(r.w.status).toBe(status);
      }
    });
  });

  describe('POST /ai-edit', () => {
    it('validation, success (same prompt / options), AI failure, missing body', async () => {
      const payloads = [
        {},
        { instruction: '   ' },
        { instruction: 42 },
        { instruction: 'Tighten this', resumeText: 'R'.repeat(5000) },
        { instruction: 'Write a summary', context: 'for a data role' },
      ];
      for (const body of payloads) {
        const r = await both({ path: '/api/resume/ai-edit', build: json(body) });
        expectSameJson(r);
      }
      // the model option: process.env.LM_STUDIO_MODEL_RESUME on Express, config.vars on the Worker (unset here -> both undefined)
      const callsE = aiClient.callAI.mock.calls.filter((_c, i) => i % 2 === 0).map(([a]) => a);
      const callsW = aiClient.callAI.mock.calls.filter((_c, i) => i % 2 === 1).map(([a]) => a);
      expect(callsW).toEqual(callsE);
      expect(callsW[0].userPrompt).toContain('R'.repeat(4000));
      expect(callsW[0].userPrompt).not.toContain('R'.repeat(4001));
      expect(callsW[1]).toMatchObject({ maxTokens: 512, temperature: 0.2 });

      aiClient.callAI.mockResolvedValue({ ok: false, error: 'model offline' });
      const failed = await both({ path: '/api/resume/ai-edit', build: json({ instruction: 'x' }) });
      expectSameJson(failed);
      expect(failed.w.status).toBe(502);
      aiClient.callAI.mockResolvedValue({ ok: false });
      const generic = await both({ path: '/api/resume/ai-edit', build: json({ instruction: 'x' }) });
      expectSameJson(generic);
      expect(generic.w.body).toEqual({ error: 'AI service unavailable. Please try again later.' });

      const nobody = await both({ path: '/api/resume/ai-edit', build: () => ({ method: 'POST' }) });
      expectSameJson(nobody);
      expect(nobody.w.status).toBe(500);
    });
  });

  describe('POST /build', () => {
    const full = {
      fullName: 'Jane Example', email: 'jane@example.test', phone: '555 0100', linkedin: 'in/jane', github: 'gh/jane',
      targetJobTitle: 'Backend Engineer', targetJobDescription: JD, summary: 'Ships things.',
      skills: 'Node.js, SQL; Docker', experience: 'Built APIs\nLed a team; shipped v2', education: 'B.Sc. CS', projects: 'Tool one\nTool two',
    };
    const text = async (r, side) => {
      const buf = Buffer.from(r[side].body.fileBase64, 'base64');
      if (r[side].body.outputFormat === 'pdf') return (await pdfParseRef(new Uint8Array(buf))).text;
      return (await (await JSZip.loadAsync(buf)).file('word/document.xml').async('string')).replace(/<w:t[^>]*>([^<]*)<\/w:t>/g, '[$1]');
    };

    it('docx and pdf: same JSON (except the file bytes, compared by text)', async () => {
      for (const outputFormat of [undefined, 'docx', 'pdf', 'PDF', 'other']) {
        const r = await both({ path: '/api/resume/build', build: json({ ...full, ...(outputFormat ? { outputFormat } : {}) }) });
        const strip = ({ fileBase64, ...rest }) => rest;
        expect(r.w.status).toBe(200);
        expect(strip(r.w.body)).toEqual(strip(r.e.body));
        expect(await text(r, 'w')).toBe(await text(r, 'e'));
      }
    });

    it('minimal payload with defaults, validation errors, missing body, non-string field', async () => {
      const cases = [
        { fullName: 'A B', targetJobDescription: 'Python' },
        { fullName: 'A B' },
        { targetJobDescription: 'x' },
        { fullName: '  ', targetJobDescription: 'x' },
        { fullName: 5, targetJobDescription: 'x' },
      ];
      for (const body of cases) {
        const r = await both({ path: '/api/resume/build', build: json(body) });
        const strip = ({ fileBase64, ...rest } = {}) => rest;
        expect(r.w.status).toBe(r.e.status);
        expect(strip(r.w.body)).toEqual(strip(r.e.body));
      }
      const nobody = await both({ path: '/api/resume/build', build: () => ({ method: 'POST' }) });
      expectSameJson(nobody);
      expect(nobody.w.status).toBe(500);
    });
  });
});

// =============================================================================================
describe('parity: routes/resumeV2.js (Express original vs Worker)', () => {
  const V2 = '/api/resume/v2';

  describe('POST /v2/analyze', () => {
    it('JSON resumeText: same analysis, same persisted row', async () => {
      const r = await both({ path: `${V2}/analyze`, build: json({ resumeText: RESUME_TEXT_LONG }) });
      expectSameJson(r, { mask: maskTiming });
      expect(r.w.status).toBe(200);
      // preserved bug: the persist step reads analysis.analysis.keywords, which the engine never returns, so the
      // TypeError is swallowed by the route's inner catch and NOTHING is ever saved: resumeId is always null
      expect(r.w.body.resumeId).toBeNull();
      expect(dbState().w).toEqual(dbState().e);
      expect(dbState().w.resumes).toEqual([]);
    });

    it('PDF, DOCX and text uploads', async () => {
      const uploads = [
        [file(await makeBigPdf(RESUME_TEXT_LONG.split('\n')), PDF, 'a.pdf')],
        [file(await makeDocx(RESUME_TEXT_LONG.split('\n')), DOCX, 'a.docx')],
        [file(RESUME_TEXT_LONG, 'text/plain', 'a.txt')],
      ];
      for (const [f] of uploads) {
        const r = await both({ path: `${V2}/analyze`, build: form([['resume', f]]) });
        expectSameJson(r, { mask: maskTiming });
        expect(r.w.status).toBe(200);
      }
      expect(dbState().w).toEqual(dbState().e);
    });

    it('multipart with a resumeText field but no file', async () => {
      const r = await both({ path: `${V2}/analyze`, build: form([['resumeText', RESUME_TEXT_LONG]]) });
      expectSameJson(r, { mask: maskTiming });
      expect(r.w.status).toBe(200);
    });

    it('error contract: 400 empty / unreadable, 400 parse failure, masked 500 for upload errors, 500 without a body', async () => {
      const cases = [
        [json({}), 400],
        [json({ resumeText: '   ' }), 400],
        [json({ resumeText: 42 }), 400],
        [form([['resume', file('', 'text/plain', 'e.txt')]]), 400],
        [form([['resume', file('%PDF-1.4 broken', PDF, 'bad.pdf')]]), 400],
        [form([['resume', file('not a zip', DOCX, 'bad.docx')]]), 400],
        [form([['resume', file('x', 'image/png', 'a.png')]]), 500],
        [form([['resume', file(new Uint8Array(5 * 1024 * 1024 + 1), 'text/plain', 'big.txt')]]), 500],
        [() => ({ method: 'POST' }), 500],
      ];
      for (const [build, status] of cases) {
        const r = await both({ path: `${V2}/analyze`, build });
        expect(r.w.status).toBe(status);
        expectSameJson(r, { mask: maskTiming });
      }
    });

    it('a failing persist still returns the analysis with resumeId null', async () => {
      const boom = new Error('insert failed');
      current.dbE.failWhenDocs((sql) => /INSERT INTO resumes/.test(sql), boom);
      current.H.db.failWhenDocs((sql) => /INSERT INTO resumes/.test(sql), boom);
      const r = await both({ path: `${V2}/analyze`, build: json({ resumeText: RESUME_TEXT_LONG }) });
      expectSameJson(r, { mask: maskTiming });
      expect(r.w.body.resumeId).toBeNull();
    });
  });

  describe('POST /v2/feedback', () => {
    it('feedback, missing text, non-string text, missing body', async () => {
      for (const build of [json({ resumeText: RESUME_TEXT_LONG }), json({}), json({ resumeText: 7 }), () => ({ method: 'POST' })]) {
        expectSameJson(await both({ path: `${V2}/feedback`, build }));
      }
    });
  });

  describe('POST /v2/export', () => {
    const ex = (body) => both({ path: `${V2}/export`, build: json(body) });
    const norm = (r) => ({ status: r.status, type: r.type, disposition: maskName(r.disposition), length: r.length });

    it('txt: identical headers and bytes (Content-Type gets a charset)', async () => {
      const r = await ex({ resumeText: RESUME_TEXT_LONG, format: 'txt' });
      expect(norm(r.w)).toEqual(norm(r.e));
      expect(r.w.type).toBe('text/plain; charset=utf-8');
      expect(r.w.disposition).toMatch(/^attachment; filename="resume-\d+\.txt"$/);
      expect(r.w.bytes.equals(r.e.bytes)).toBe(true);
      expect(r.w.bytes.toString('utf8')).toBe(RESUME_TEXT_LONG);
      // default format is txt
      const dflt = await ex({ resumeText: RESUME_TEXT_LONG });
      expect(norm(dflt.w)).toEqual(norm(dflt.e));
    });

    it('docx (plain text under the DOCX mime type, a preserved quirk): identical headers and bytes', async () => {
      const r = await ex({ resumeText: RESUME_TEXT_LONG, format: 'DOCX' });
      expect(norm(r.w)).toEqual(norm(r.e));
      expect(r.w.type).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document; charset=utf-8');
      expect(r.w.bytes.equals(r.e.bytes)).toBe(true);
    });

    it('pdf: same type / disposition pattern and the same extracted text (bytes differ by /ID and dates)', async () => {
      for (const format of ['pdf', 'PDF']) {
        const r = await ex({ resumeText: RESUME_TEXT_LONG, format });
        expect(r.w.status).toBe(200);
        expect(r.w.type).toBe('application/pdf');
        expect({ ...norm(r.w), length: 'x' }).toEqual({ ...norm(r.e), length: 'x' });
        expect(r.w.bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');
        expect(r.w.length).toBe(String(r.w.bytes.length)); // Content-Length matches the body
        expect((await pdfParseRef(new Uint8Array(r.w.bytes))).text).toBe((await pdfParseRef(new Uint8Array(r.e.bytes))).text);
      }
    });

    it('errors: missing / non-string text, invalid format, too-short content (validation 500), null format, missing body', async () => {
      const cases = [
        { format: 'pdf' },
        { resumeText: 5 },
        { resumeText: RESUME_TEXT_LONG, format: 'rtf' },
        { resumeText: 'too short', format: 'txt' },
        { resumeText: 'too short', format: 'pdf' },
        { resumeText: RESUME_TEXT_LONG, format: null },
      ];
      for (const body of cases) {
        const r = await ex(body);
        expectSameJson(r);
      }
      const nobody = await both({ path: `${V2}/export`, build: () => ({ method: 'POST' }) });
      expectSameJson(nobody);
      expect(nobody.w.status).toBe(500);
    });
  });

  describe('GET /v2/history and /v2/:resumeId', () => {
    it('history (limits) and lookup by id', async () => {
      const seed = (db) => {
        for (let i = 0; i < 12; i++) seedResume({ id: 200 + i, created_at: new Date(2026, 0, 1 + i), original_score: i })(db);
        seedResume({ id: 300, user_id: 2 })(db);
        db.state.resume_exports.push({ id: 1, resume_id: 205, export_format: 'txt', file_path: 'p' });
      };
      for (const q of ['', '?limit=3', '?limit=abc', '?limit=0']) {
        expectSameJson(await both({ path: `${V2}/history${q}`, build: get(), seed: q === '' ? seed : undefined }));
      }
      const hit = await both({ path: `${V2}/205`, build: get() });
      expectSameJson(hit);
      expect(hit.w.status).toBe(200);
      for (const id of ['999', '300']) {
        const miss = await both({ path: `${V2}/${id}`, build: get() });
        expectSameJson(miss);
        expect(miss.w.status).toBe(404);
      }
    });

    it('/v2/history is not shadowed by /:resumeId', async () => {
      const r = await both({ path: `${V2}/history`, build: get() });
      expect(r.w.body.status).toBe('success');
      expect(r.w.body.history).toEqual([]);
    });
  });
});

// =============================================================================================
describe('parity: routes/atsCheckerV2.js and routes/atsExport.js (Express original vs Worker)', () => {
  describe('POST /api/ats/v2/parse', () => {
    it('PDF, DOCX, text: same JSON', async () => {
      const uploads = [
        file(await makeBigPdf(), PDF, 'jane.pdf'),
        file(await makeDocx(), DOCX, 'jane.docx'),
        file('  plain text resume  ', 'text/plain', 'jane.txt'),
      ];
      for (const f of uploads) {
        const r = await both({ path: '/api/ats/v2/parse', build: form([['resume', f]]) });
        expectSameJson(r);
        expect(r.w.status).toBe(200);
      }
    });

    it('error contract: no file, empty file, blank pdf, corrupt files, bad type, oversize, unexpected field', async () => {
      const cases = [
        [form([['x', 'y']]), 400],
        [json({}), 400],
        [() => ({ method: 'POST' }), 400],
        [form([['resume', file('', 'text/plain', 'e.txt')]]), 400],
        [form([['resume', file(await makePdf([' ']), PDF, 'blank.pdf')]]), 400],
        [form([['resume', file('%PDF-1.4 broken', PDF, 'bad.pdf')]]), 500],
        [form([['resume', file('nope', DOCX, 'bad.docx')]]), 500],
        [form([['resume', file('x', 'application/msword', 'a.doc')]]), 500],
        [form([['resume', file(new Uint8Array(5 * 1024 * 1024 + 1), 'text/plain', 'big.txt')]]), 500],
        [form([['document', file('x', 'text/plain', 'a.txt')]]), 500],
      ];
      for (const [build, status] of cases) {
        const r = await both({ path: '/api/ats/v2/parse', build });
        expect(r.w.status).toBe(status);
        expectSameJson(r);
      }
    });

    it('non-ASCII file names come back identical (mojibake preserved)', async () => {
      const r = await both({ path: '/api/ats/v2/parse', build: form([['resume', file('hello', 'text/plain', 'résumé.txt')]]) });
      expectSameJson(r);
    });
  });

  describe('exports and history', () => {
    const docxText = async (bytes) => {
      const xml = await (await JSZip.loadAsync(bytes)).file('word/document.xml').async('string');
      return xml.replace(/<w:t[^>]*>([^<]*)<\/w:t>/g, '[$1]').match(/\[[^\]]*\]/g).join('');
    };
    const RES = 'SUMMARY\nAlpha bravo\nEXPERIENCE\nDelta | Echo\n• Foxtrot golf\nSKILLS\nHotel, India';

    it('export/docx: same headers, same document text, same export record', async () => {
      const r = await both({ path: '/api/ats/export/docx', build: json({ resumeId: 41 }), seed: seedResume({ original_resume: RES }) });
      expect(r.w.status).toBe(200);
      expect({ type: r.w.type, disposition: r.w.disposition }).toEqual({ type: r.e.type, disposition: r.e.disposition });
      expect(r.w.type).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      expect(r.w.length).toBe(String(r.w.bytes.length));
      expect(await docxText(r.w.bytes)).toBe(await docxText(r.e.bytes));
      expect(dbState().w.exports).toEqual(dbState().e.exports);
      expect(dbState().w.exportPaths).toEqual(dbState().e.exportPaths);
    });

    it('export/txt: same headers and bytes, optimized_resume preferred', async () => {
      const r = await both({ path: '/api/ats/export/txt', build: json({ resumeId: 41 }), seed: seedResume({ original_resume: 'orig é', optimized_resume: 'optimized ü' }) });
      expect(r.w.status).toBe(200);
      expect({ type: r.w.type, disposition: r.w.disposition, length: r.w.length }).toEqual({ type: r.e.type, disposition: r.e.disposition, length: r.e.length });
      expect(r.w.type).toBe('text/plain');
      expect(r.w.bytes.equals(r.e.bytes)).toBe(true);
      expect(r.w.bytes.toString('utf8')).toBe('optimized ü');
      expect(dbState().w.exports).toEqual(dbState().e.exports);
    });

    it('errors: missing id, not found, other user\'s resume, no body', async () => {
      for (const path of ['/api/ats/export/docx', '/api/ats/export/txt']) {
        for (const spec of [
          { build: json({}) },
          { build: json({ resumeId: 999 }) },
          { build: json({ resumeId: 41 }), user: 2 },
          { build: () => ({ method: 'POST' }) },
        ]) {
          const r = await both({ path, seed: seedResume(), ...spec });
          expectSameJson(r);
        }
      }
      expect(dbState().w.exports).toEqual([]);
    });

    it('history: shape, ordering and limits', async () => {
      const seed = (db) => {
        for (let i = 0; i < 12; i++) seedResume({ id: 200 + i, created_at: new Date(2026, 0, 1 + i), original_score: i })(db);
        db.state.resume_exports.push({ id: 1, resume_id: 205, export_format: 'txt', file_path: 'p' });
      };
      for (const q of ['', '?limit=4', '?limit=junk']) {
        const r = await both({ path: `/api/ats/history${q}`, build: get(), seed: q === '' ? seed : undefined });
        expectSameJson(r);
        expect(r.w.body.data.count).toBe(r.e.body.data.count);
      }
    });
  });
});

// =============================================================================================
describe('documented deviation: pdf.js given a Node Buffer (Render) versus a Uint8Array (Worker)', () => {
  it('a PDF that real pdf-parse cannot read from a Buffer is read by the Worker route (spike finding 6)', async () => {
    const pdf = await makeBigPdf(RESUME_LINES);
    // What Render did: pdf-parse(req.file.buffer), a Node Buffer
    const viaBuffer = await pdfParseRef(Buffer.from(pdf)).then(
      (r) => ({ ok: true, text: r.text }),
      (e) => ({ ok: false, error: e.message })
    );
    // What the Worker does: a private plain Uint8Array
    const res = await current.H.request('/api/ats/v2/parse', current.H.authed(multipart([['resume', file(pdf, PDF, 'a.pdf')]])));
    expect(res.status).toBe(200);
    const text = (await res.json()).resumeText;
    expect(text).toContain('Software engineer with 5 years of experience');
    // With a Buffer this pdfkit-made document throws in pdf.js v1.10.100 (root cause not established); on Render
    // /api/ats/v2/parse then answered 500 and /api/resume/upload scored the raw bytes. The Worker never fails here.
    if (!viaBuffer.ok) expect(viaBuffer.error).toBe('bad XRef entry');
    else expect(text).toBe(viaBuffer.text.trim());
  });
});
