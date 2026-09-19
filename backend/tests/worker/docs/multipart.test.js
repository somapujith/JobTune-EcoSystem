'use strict';

/**
 * services/docs/multipart.js: readMultipart = lib/upload.js readUpload + multer's text fields (`req.body` of a
 * multipart request) + the two multer behaviours readUpload does not model. The Express reference behaviour was
 * observed against the real multer 2.1.1 (memoryStorage, single('resume')) in the same session.
 */
const { createRouter, mountRoutes } = require('../../../src/worker/lib/routes');
const { readMultipart, MULTER_LATIN1_FILENAMES } = require('../../../src/worker/services/docs/multipart');
const { makeHarness } = require('../helpers/harness');
const { file, multipart } = require('./helpers/fixtures');

const OPTS = { field: 'resume', maxBytes: 100, allowedMimeTypes: ['text/plain', 'application/pdf'] };

function build() {
  const router = createRouter();
  router.post('/up', async (c) => {
    const { file: f, fields } = await readMultipart(c, OPTS);
    return c.json({
      file: f && { name: f.originalname, type: f.mimetype, size: f.size, bytes: Array.from(f.buffer) },
      fields: fields === undefined ? '__undefined__' : { ...fields },
      nullProto: fields === undefined ? null : Object.getPrototypeOf(fields) === null,
    });
  });
  return makeHarness({ configureApp: (app) => mountRoutes(app, '/api/up', router) });
}

describe('readMultipart', () => {
  let H;
  const post = (init) => H.request('/api/up/up', init);
  beforeEach(() => {
    H = build();
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  it('returns the file (Uint8Array bytes) and the text fields, fields as a null-prototype object', async () => {
    const res = await post(multipart([['resume', file('abc', 'text/plain', 'cv.txt')], ['jobDescription', 'JD text'], ['outputFormat', 'pdf']]));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      file: { name: 'cv.txt', type: 'text/plain', size: 3, bytes: [97, 98, 99] },
      fields: { jobDescription: 'JD text', outputFormat: 'pdf' },
      nullProto: true,
    });
  });

  it('repeated text fields become arrays, like multer', async () => {
    const res = await post(multipart([['x', '1'], ['x', '2'], ['x', '3'], ['y', 'only']]));
    expect((await res.json()).fields).toEqual({ x: ['1', '2', '3'], y: 'only' });
  });

  it('multipart without a file: file undefined, fields still delivered (multer left them in the body)', async () => {
    const res = await post(multipart([['resumeText', 'from a form field']]));
    expect(await res.json()).toEqual({ fields: { resumeText: 'from a form field' }, nullProto: true });
  });

  it('a text part named like the file field is a field, not a file', async () => {
    const res = await post(multipart([['resume', 'just text']]));
    expect(await res.json()).toEqual({ fields: { resume: 'just text' }, nullProto: true });
  });

  it('not multipart: file undefined and fields undefined (caller falls back to the JSON body)', async () => {
    const res = await post({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"a":1}' });
    expect(await res.json()).toEqual({ fields: '__undefined__', nullProto: null });
  });

  it('a file under another field name is multer LIMIT_UNEXPECTED_FILE (masked 500), not "no file"', async () => {
    const res = await post(multipart([['other', file('abc', 'text/plain', 'a.txt')]]));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal Server Error' });
    expect(console.error.mock.calls.flat().join(' ')).toContain('Unexpected field');
  });

  it('two files under the field is also an unexpected field (multer .single accepts one)', async () => {
    const res = await post(multipart([['resume', file('a', 'text/plain', 'a.txt')], ['resume', file('b', 'text/plain', 'b.txt')]]));
    expect(res.status).toBe(500);
  });

  it('keeps readUpload\'s checks: disallowed type and oversize are masked 500s with multer-like messages', async () => {
    const bad = await post(multipart([['resume', file('x', 'application/x-msdownload', 'a.exe')]]));
    expect(bad.status).toBe(500);
    expect(console.error.mock.calls.flat().join(' ')).toContain('Invalid file type');

    const big = await post(multipart([['resume', file('x'.repeat(101), 'text/plain', 'a.txt')]]));
    expect(big.status).toBe(500);
    expect(console.error.mock.calls.flat().join(' ')).toContain('File too large');
  });

  it('the size limit is exclusive like multer/busboy: 99 bytes pass, exactly 100 (the cap) is rejected', async () => {
    const ok = await post(multipart([['resume', file('x'.repeat(99), 'text/plain', 'a.txt')]]));
    expect(ok.status).toBe(200);
    expect((await ok.json()).file.size).toBe(99);
    const atCap = await post(multipart([['resume', file('x'.repeat(100), 'text/plain', 'a.txt')]]));
    expect(atCap.status).toBe(500);
    expect(console.error.mock.calls.flat().join(' ')).toContain('File too large');
  });

  it('non-ASCII filenames are latin1-decoded UTF-8 bytes, exactly what multer produced on Render', async () => {
    expect(MULTER_LATIN1_FILENAMES).toBe(true);
    const name = 'résumé 日本.txt';
    const res = await post(multipart([['resume', file('abc', 'text/plain', name)]]));
    const got = (await res.json()).file.name;
    expect(got).toBe(Buffer.from(name, 'utf8').toString('latin1')); // 'rÃ©sumÃ© æ¥æ¬.txt' as observed from multer
    expect(got).toBe('rÃ©sumÃ© æ\u0097¥æ\u009c¬.txt');
    // plain ASCII names are untouched
    const ascii = await post(multipart([['resume', file('abc', 'text/plain', 'plain name.txt')]]));
    expect((await ascii.json()).file.name).toBe('plain name.txt');
  });
});
