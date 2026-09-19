'use strict';

/**
 * routes/atsCheckerV2.js  (POST /api/ats/v2/parse: auth + requirePlan(2) + multipart `resume`, 5 MB, pdf / docx / text).
 * Express reference: backend/src/routes/atsCheckerV2.js. Real PDF / DOCX documents are generated in memory; the
 * expected text comes from the real `pdf-parse` / `mammoth` run under Node on the same bytes.
 */
jest.mock('../../../src/worker/services/docs/docLibs', () => require('./helpers/realDocLibs'));

const pdfParseRef = require('pdf-parse');
const mammothRef = require('mammoth');
const { makeDocsHarness } = require('./helpers/docsHarness');
const { PDF, DOCX, RESUME_LINES, makePdf, makeDocx, file, multipart } = require('./helpers/fixtures');

const URL_PARSE = '/api/ats/v2/parse';
const MASKED = { error: 'Internal Server Error' };

describe('POST /api/ats/v2/parse', () => {
  let H;
  const upload = (parts, t) => H.request(URL_PARSE, H.authed(multipart(parts), t));
  beforeEach(() => {
    H = makeDocsHarness({ plan: 2 });
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  describe('auth and plan gate', () => {
    it('401 without a token, before anything is read', async () => {
      const res = await H.request(URL_PARSE, multipart([['resume', file('x', 'text/plain', 'a.txt')]]));
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: 'Unauthorized' });
    });

    it.each([
      ['no plan at all', null, null],
      ['tier 1', 1, 'Learn & Build'],
    ])('403 PLAN_UPGRADE_REQUIRED for %s (and the upload is not even parsed)', async (_l, plan, current) => {
      H = makeDocsHarness({ plan });
      // an invalid type would be a 500 if the body were read before the gate
      const res = await upload([['resume', file('x', 'application/x-msdownload', 'a.exe')]]);
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({
        error: 'This feature requires a higher subscription plan.',
        code: 'PLAN_UPGRADE_REQUIRED',
        requiredPlan: 'Tune & Polish',
        currentPlan: current,
      });
    });

    it.each([2, 3])('allowed at tier %i', async (plan) => {
      H = makeDocsHarness({ plan });
      const res = await upload([['resume', file('hello', 'text/plain', 'a.txt')]]);
      expect(res.status).toBe(200);
    });
  });

  describe('extraction', () => {
    it('PDF: resumeText equals the pdf-parse reference text (trimmed), with file name and size', async () => {
      const pdf = await makePdf();
      const ref = (await pdfParseRef(new Uint8Array(pdf))).text;
      const res = await upload([['resume', file(pdf, PDF, 'jane.pdf')]]);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ status: 'success', resumeText: ref.trim(), fileName: 'jane.pdf', fileSize: pdf.length });
      expect(body.resumeText).toContain('Software engineer with 5 years of experience');
      expect(Object.keys(body)).toEqual(['status', 'resumeText', 'fileName', 'fileSize']);
    });

    it('DOCX: resumeText equals the mammoth reference text (trimmed)', async () => {
      const docx = await makeDocx();
      const ref = (await mammothRef.extractRawText({ buffer: docx })).value;
      const res = await upload([['resume', file(docx, DOCX, 'jane.docx')]]);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ status: 'success', resumeText: ref.trim(), fileName: 'jane.docx', fileSize: docx.length });
    });

    it('text/plain is decoded as UTF-8 and trimmed', async () => {
      const raw = '  héllo wörld \n\n';
      const res = await upload([['resume', file(raw, 'text/plain', 'a.txt')]]);
      expect(await res.json()).toEqual({ status: 'success', resumeText: 'héllo wörld', fileName: 'a.txt', fileSize: Buffer.byteLength(raw) });
    });

    it('a UTF-8 BOM in a text file does not survive the trim (same as Express)', async () => {
      const res = await upload([['resume', file(new Uint8Array([0xef, 0xbb, 0xbf, 0x68, 0x69]), 'text/plain', 'a.txt')]]);
      expect((await res.json()).resumeText).toBe('hi');
    });

    it('an empty / whitespace-only file is 400 "Could not extract text from file"', async () => {
      for (const content of ['', '   \n\t ']) {
        const res = await upload([['resume', file(content, 'text/plain', 'a.txt')]]);
        expect(res.status).toBe(400);
        expect(await res.json()).toEqual({ status: 'error', message: 'Could not extract text from file' });
      }
    });

    it('a PDF with no extractable text (blank page) is 400 "Could not extract text from file"', async () => {
      const blank = await makePdf([' ']);
      const res = await upload([['resume', file(blank, PDF, 'blank.pdf')]]);
      expect(res.status).toBe(400);
      expect((await res.json()).message).toBe('Could not extract text from file');
    });
  });

  describe('validation', () => {
    it('400 "No file uploaded" for a multipart request without the file', async () => {
      const res = await upload([['notes', 'text only']]);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ status: 'error', message: 'No file uploaded' });
    });

    it('400 "No file uploaded" for a JSON request (multer skipped it)', async () => {
      const res = await H.request(URL_PARSE, H.json({ resume: 'text' }));
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ status: 'error', message: 'No file uploaded' });
    });

    it('400 "No file uploaded" for a request with no body at all', async () => {
      const res = await H.request(URL_PARSE, H.authed({ method: 'POST' }));
      expect(res.status).toBe(400);
    });

    it('disallowed mimetype: masked 500 (multer error reached errorHandler without a status)', async () => {
      for (const type of ['application/msword', 'image/png', 'application/zip', '']) {
        const res = await upload([['resume', file('x', type, 'a.bin')]]);
        expect(res.status).toBe(500);
        expect(await res.json()).toEqual(MASKED);
      }
      expect(console.error.mock.calls.flat().join(' ')).toContain('Invalid file type');
    });

    it('at or over the 5 MB cap: masked 500 (the limit is exclusive, like multer); one byte under is accepted', async () => {
      const limit = 5 * 1024 * 1024;
      for (const size of [limit + 1, limit]) {
        const over = await upload([['resume', file(new Uint8Array(size).fill(0x61), 'text/plain', 'big.txt')]]);
        expect(over.status).toBe(500);
        expect(await over.json()).toEqual(MASKED);
      }
      expect(console.error.mock.calls.flat().join(' ')).toContain('File too large');

      const ok = await upload([['resume', file(new Uint8Array(limit - 1).fill(0x61), 'text/plain', 'ok.txt')]]);
      expect(ok.status).toBe(200);
      expect((await ok.json()).fileSize).toBe(limit - 1);
    });

    it('a Content-Length far above the cap is rejected before the body is read', async () => {
      const init = H.authed(multipart([['resume', file('x', 'text/plain', 'a.txt')]], { headers: { 'Content-Length': String(6 * 1024 * 1024) } }));
      const res = await H.request(URL_PARSE, init);
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual(MASKED);
    });

    it('a file under another field name is a masked 500 (multer LIMIT_UNEXPECTED_FILE), not 400', async () => {
      const res = await upload([['document', file('x', 'text/plain', 'a.txt')]]);
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual(MASKED);
    });
  });

  describe('failures inside the handler', () => {
    it('a corrupt PDF: 500 {status, message, details} with the parser message, logged', async () => {
      const res = await upload([['resume', file('%PDF-1.4 this is not really a pdf', PDF, 'bad.pdf')]]);
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body).toEqual({ status: 'error', message: 'Failed to parse resume file', details: expect.any(String) });
      expect(body.details.length).toBeGreaterThan(0);
      expect(console.error).toHaveBeenCalledWith('Resume parse error:', expect.any(Error));
    });

    it('a DOCX that is not a zip: 500 with the mammoth message', async () => {
      const res = await upload([['resume', file('not a zip', DOCX, 'bad.docx')]]);
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ status: 'error', message: 'Failed to parse resume file', details: expect.stringContaining('zip') });
    });
  });

  it('non-ASCII file names come back latin1-mangled like multer on Render (preserved bug)', async () => {
    const res = await upload([['resume', file('hello', 'text/plain', 'résumé.txt')]]);
    expect((await res.json()).fileName).toBe('rÃ©sumÃ©.txt');
  });

  it('works for every line of the fixture resume (round trip through generated PDF)', async () => {
    const pdf = await makePdf(RESUME_LINES);
    const res = await upload([['resume', file(pdf, PDF, 'a.pdf')]]);
    const text = (await res.json()).resumeText.replace(/\s+/g, ' ');
    for (const line of RESUME_LINES) expect(text).toContain(line);
  });
});
