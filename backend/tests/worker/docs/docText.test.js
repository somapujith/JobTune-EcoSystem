'use strict';

/**
 * services/docs/{pdfParse,docText}.js: the pdf-parse wrapper (pinned pdf.js v1.10.100) and the mammoth /
 * UTF-8 / base64 helpers. The lazy-loader seam is replaced by require() of the same libraries (Jest has no
 * dynamic import()); what these prove is the wrapper's logic and equality with real `pdf-parse` / `mammoth`
 * on the same bytes, under Node. The workerd runtime is proven separately (docs/migration/wave/docs.md).
 */
jest.mock('../../../src/worker/services/docs/docLibs', () => require('./helpers/realDocLibs'));

const pdfParseRef = require('pdf-parse');
const mammothRef = require('mammoth');
const { parsePdf, extractDocxRawText, decodeUtf8, toBase64, toArrayBuffer } = require('../../../src/worker/services/docs/docText');
const { pdfParse, toPlainUint8Array } = require('../../../src/worker/services/docs/pdfParse');
const { makePdf, makeDocx, RESUME_LINES } = require('./helpers/fixtures');

describe('pdfParse wrapper (pinned pdf.js v1.10.100)', () => {
  it('extracts exactly the text real pdf-parse extracts (single page, multi page, unicode)', async () => {
    const pdfs = [
      await makePdf(),
      await makePdf(RESUME_LINES, { extraPages: 3 }),
      await makePdf(['Café résumé – naïve coopération', 'Zoë Ünal test line']),
    ];
    for (const pdf of pdfs) {
      const ref = await pdfParseRef(new Uint8Array(pdf)); // reference: same pdf.js, plain Uint8Array input
      const got = await parsePdf(new Uint8Array(pdf));
      expect(got.text).toBe(ref.text);
      expect(got.numpages).toBe(ref.numpages);
      expect(got.numrender).toBe(ref.numrender);
      expect(got.version).toBe(ref.version);
    }
    expect((await parsePdf(pdfs[0])).text).toContain('Software engineer with 5 years');
  });

  it('reports pdf.js v1.10.100 and the pdf-parse result shape', async () => {
    const got = await parsePdf(await makePdf());
    expect(got).toEqual(expect.objectContaining({ numpages: 1, numrender: 1, text: expect.any(String), version: expect.stringMatching(/^1\.10\.100/) }));
    expect(Object.keys(got).sort()).toEqual(['info', 'metadata', 'numpages', 'numrender', 'text', 'version']);
  });

  it('accepts a Node Buffer view with a non-zero byteOffset (pooled slice) and does not touch the caller bytes', async () => {
    const pdf = await makePdf();
    const backing = Buffer.concat([Buffer.alloc(37, 0x20), pdf, Buffer.alloc(11, 0x20)]);
    const view = backing.subarray(37, 37 + pdf.length);
    expect(view.byteOffset).not.toBe(0);
    const before = Buffer.from(view);
    const got = await parsePdf(view);
    expect(got.text).toBe((await pdfParseRef(new Uint8Array(pdf))).text);
    expect(Buffer.from(view).equals(before)).toBe(true);
    expect(view.byteLength).toBe(pdf.length); // not detached
  });

  it('accepts an ArrayBuffer', async () => {
    const pdf = await makePdf();
    const ab = pdf.buffer.slice(pdf.byteOffset, pdf.byteOffset + pdf.byteLength);
    expect((await parsePdf(ab)).text).toContain('Software engineer');
  });

  it('honours the max option and a custom pagerender (pdf-parse options)', async () => {
    const pdf = await makePdf(RESUME_LINES, { extraPages: 2 });
    const first = await pdfParse(new Uint8Array(pdf), { max: 1 });
    expect(first.numpages).toBe(3);
    expect(first.numrender).toBe(1);
    const custom = await pdfParse(new Uint8Array(pdf), { pagerender: async () => 'X' });
    expect(custom.text).toBe('\n\nX\n\nX\n\nX');
  });

  it('rejects garbage and non-binary input like pdf-parse does (the caller decides the fallback)', async () => {
    await expect(parsePdf(new Uint8Array(Buffer.from('this is not a pdf at all')))).rejects.toBeTruthy();
    await expect(parsePdf('a string')).rejects.toThrow(TypeError);
  });

  it('toPlainUint8Array always returns a private, offset-0 plain Uint8Array', () => {
    const backing = Buffer.from('0123456789');
    const view = backing.subarray(2, 6);
    const copy = toPlainUint8Array(view);
    expect(copy.constructor).toBe(Uint8Array);
    expect(copy.byteOffset).toBe(0);
    expect(Buffer.from(copy).toString()).toBe('2345');
    copy[0] = 0;
    expect(Buffer.from(view).toString()).toBe('2345');
  });
});

describe('docx / utf-8 / base64 helpers', () => {
  it('extractDocxRawText({arrayBuffer}) equals mammoth({buffer}) on a real DOCX', async () => {
    const docx = await makeDocx();
    const ref = await mammothRef.extractRawText({ buffer: docx });
    const got = await extractDocxRawText(new Uint8Array(docx));
    expect(got.value).toBe(ref.value);
    expect(got.value).toContain('Senior Engineer | Example Corp');
    expect(got.messages).toEqual(ref.messages);
  });

  it('works on a Uint8Array that is a window into a larger buffer', async () => {
    const docx = await makeDocx();
    const backing = Buffer.concat([Buffer.alloc(13), docx, Buffer.alloc(7)]);
    const view = new Uint8Array(backing.buffer, backing.byteOffset + 13, docx.length);
    expect((await extractDocxRawText(view)).value).toBe((await mammothRef.extractRawText({ buffer: docx })).value);
  });

  it('rejects a non-zip file with the same error mammoth gives for a Buffer', async () => {
    const junk = Buffer.from('definitely not a zip file');
    const refErr = await mammothRef.extractRawText({ buffer: junk }).catch((e) => e.message);
    await expect(extractDocxRawText(new Uint8Array(junk))).rejects.toThrow(refErr);
  });

  it('toArrayBuffer returns the exact bytes without an offset', () => {
    const ab = new Uint8Array([1, 2, 3, 4, 5]).buffer;
    expect(toArrayBuffer(ab)).toBe(ab);
    const whole = new Uint8Array(ab);
    expect(toArrayBuffer(whole)).toBe(ab); // no copy when the view spans the buffer
    const win = new Uint8Array(ab, 1, 3);
    expect([...new Uint8Array(toArrayBuffer(win))]).toEqual([2, 3, 4]);
  });

  it('decodeUtf8 behaves like Buffer#toString("utf-8"): keeps a BOM, replaces bad bytes', () => {
    const cases = [
      Buffer.from('plain ascii'),
      Buffer.from('héllo 日本 🚀'),
      Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('bom text')]),
      Buffer.from([0x61, 0xff, 0xfe, 0x62, 0xc3]), // invalid sequences
      Buffer.alloc(0),
    ];
    for (const buf of cases) {
      expect(decodeUtf8(new Uint8Array(buf))).toBe(buf.toString('utf-8'));
    }
    expect(decodeUtf8(new Uint8Array(cases[2])).charCodeAt(0)).toBe(0xfeff);
  });

  it('toBase64 equals Buffer#toString("base64") for full arrays, sub-views and ArrayBuffers', () => {
    const buf = Buffer.from(Array.from({ length: 300 }, (_, i) => i % 256));
    expect(toBase64(new Uint8Array(buf))).toBe(buf.toString('base64'));
    expect(toBase64(buf)).toBe(buf.toString('base64'));
    const window = new Uint8Array(new Uint8Array(buf).buffer, 5, 20);
    expect(toBase64(window)).toBe(Buffer.from(window).toString('base64'));
    expect(toBase64(new Uint8Array(buf).buffer)).toBe(buf.toString('base64'));
    // the trap this guards against: Uint8Array#toString does not encode
    expect(new Uint8Array([1, 2, 3]).toString('base64')).toBe('1,2,3');
    expect(toBase64(new Uint8Array([1, 2, 3]))).toBe('AQID');
  });
});
