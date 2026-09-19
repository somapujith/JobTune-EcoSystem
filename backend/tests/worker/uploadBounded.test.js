'use strict';

/**
 * Regression for a security review finding: a chunked multipart upload with no Content-Length (or a lying one) skipped
 * the size cap and was fully buffered by request.formData(). Express/multer aborted mid-stream at the limit; the port
 * now enforces the cap while the body streams in.
 */
const { readUpload, readUploadWithForm, boundedFormData, MULTIPART_SLACK_BYTES } = require('../../src/worker/lib/upload');

const BOUNDARY = 'testboundary123';
const enc = new TextEncoder();

function multipartBytes({ field = 'resume', filename = 'a.pdf', type = 'application/pdf', payload, fields = {} }) {
  const parts = [];
  for (const [k, v] of Object.entries(fields)) {
    parts.push(enc.encode(`--${BOUNDARY}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`));
  }
  parts.push(enc.encode(`--${BOUNDARY}\r\nContent-Disposition: form-data; name="${field}"; filename="${filename}"\r\nContent-Type: ${type}\r\n\r\n`));
  parts.push(payload);
  parts.push(enc.encode(`\r\n--${BOUNDARY}--\r\n`));
  const total = parts.reduce((n, p) => n + p.byteLength, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.byteLength; }
  return out;
}

/** A request whose body is a stream of small chunks and which carries NO Content-Length (chunked). Counts pulled chunks. */
function chunkedRequest(bytes, chunkSize = 16 * 1024, extraHeaders = {}) {
  const state = { pulled: 0, cancelled: false };
  let offset = 0;
  const body = new ReadableStream({
    pull(controller) {
      if (offset >= bytes.byteLength) return controller.close();
      state.pulled++;
      controller.enqueue(bytes.subarray(offset, offset + chunkSize));
      offset += chunkSize;
    },
    cancel() { state.cancelled = true; },
  });
  const request = new Request('http://x.test/upload', {
    method: 'POST',
    headers: { 'content-type': `multipart/form-data; boundary=${BOUNDARY}`, ...extraHeaders },
    body,
    duplex: 'half',
  });
  const c = { req: { header: (n) => request.headers.get(n), raw: request } };
  return { c, request, state };
}

const OPTS = { field: 'resume', maxBytes: 100 * 1024, allowedMimeTypes: ['application/pdf'] };

describe('bounded multipart reading', () => {
  it('rejects an over-limit CHUNKED upload (no Content-Length) and stops reading early', async () => {
    const big = multipartBytes({ payload: new Uint8Array(5 * 1024 * 1024).fill(97) }); // ~5 MB vs a 100 KB cap
    const { c, request, state } = chunkedRequest(big);
    expect(request.headers.get('content-length')).toBeNull();
    await expect(readUpload(c, OPTS)).rejects.toMatchObject({ name: 'MulterError', code: 'LIMIT_FILE_SIZE' });
    expect(state.cancelled).toBe(true);
    const totalChunks = Math.ceil(big.byteLength / (16 * 1024));
    expect(state.pulled).toBeLessThan(totalChunks / 4); // stopped long before reading the whole body
  });

  it('rejects when Content-Length LIES (declares a small size, sends a big body)', async () => {
    const big = multipartBytes({ payload: new Uint8Array(2 * 1024 * 1024).fill(97) });
    const { c } = chunkedRequest(big, 16 * 1024, { 'content-length': '1000' });
    await expect(readUpload(c, OPTS)).rejects.toMatchObject({ code: 'LIMIT_FILE_SIZE' });
  });

  it('accepts a within-limit chunked upload and returns the file bytes intact', async () => {
    const payload = new Uint8Array(50 * 1024).map((_, i) => i % 251);
    const { c } = chunkedRequest(multipartBytes({ payload, fields: { note: 'hello' } }), 4096);
    const { file, form } = await readUploadWithForm(c, OPTS);
    expect(file.size).toBe(payload.byteLength);
    expect(Buffer.from(file.buffer).equals(Buffer.from(payload))).toBe(true);
    expect(file.originalname).toBe('a.pdf');
    expect(form.get('note')).toBe('hello');
  });

  it('the mimetype allowlist still applies', async () => {
    const { c } = chunkedRequest(multipartBytes({ payload: new Uint8Array(10), type: 'text/html' }));
    await expect(readUpload(c, OPTS)).rejects.toThrow('Invalid file type');
  });

  it('the file-vs-limit check still applies within the slack (file bigger than maxBytes but under maxBytes + slack)', async () => {
    const { c } = chunkedRequest(multipartBytes({ payload: new Uint8Array(OPTS.maxBytes + 1) }));
    await expect(readUpload(c, OPTS)).rejects.toMatchObject({ code: 'LIMIT_FILE_SIZE' });
  });

  it('non-multipart requests and missing files behave as before', async () => {
    const req = new Request('http://x.test/upload', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    const c = { req: { header: (n) => req.headers.get(n), raw: req } };
    expect(await readUpload(c, OPTS)).toBeUndefined();
    const { c: c2 } = chunkedRequest(multipartBytes({ field: 'other', payload: new Uint8Array(10) }));
    expect(await readUpload(c2, OPTS)).toBeUndefined();
  });

  it('boundedFormData enforces exactly the limit it is given', async () => {
    const bytes = multipartBytes({ payload: new Uint8Array(1000) });
    const ok = chunkedRequest(bytes);
    await expect(boundedFormData(ok.request, bytes.byteLength)).resolves.toBeDefined();
    const tooSmall = chunkedRequest(bytes);
    await expect(boundedFormData(tooSmall.request, bytes.byteLength - 1)).rejects.toMatchObject({ code: 'LIMIT_FILE_SIZE' });
    expect(MULTIPART_SLACK_BYTES).toBeGreaterThan(0);
  });
});
