'use strict';

/**
 * Multipart upload helper: the Worker replacement for
 *   multer({ storage: memoryStorage(), limits: { fileSize }, fileFilter }).single(field)
 * (ADR-001 section 6.6; the three multer users are atsCheckerV2, resume, resumeV2).
 *
 * readUpload(c, { field, maxBytes, allowedMimeTypes }) -> Promise<file | undefined>
 *   file = { fieldname, originalname, mimetype, size, buffer: Uint8Array }
 *   (the same property names multer put on req.file; `buffer` is a Uint8Array, not a
 *   Node Buffer. Use Buffer.from(file.buffer) under nodejs_compat when a library
 *   needs one.)
 *
 * Semantics preserved from multer:
 *   - a request that is not multipart, or has no file under `field`, resolves to
 *     undefined (multer left req.file unset), so the route can return its own
 *     "No file uploaded" 400 exactly as before
 *   - the mimetype allowlist is checked against the part's own Content-Type
 *     (multer's file.mimetype); a disallowed type throws Error('Invalid file type')
 *   - a file over maxBytes throws an error with code 'LIMIT_FILE_SIZE' and message
 *     'File too large' (multer's MulterError)
 *   - BOTH errors have no `status`, so onError renders them as 500
 *     {"error":"Internal Server Error"}, which is what Express did (multer errors
 *     reached errorHandler without a status). Preserved deliberately; changing it to
 *     400/413 is a post-cutover PR (ADR 4.3), not part of the port.
 *   - order: the type check happens before the size check, like multer's fileFilter.
 *
 * Do NOT drop the allowlist or the size cap when porting a route: they are the
 * upload validation boundary (ADR 6.6, checklist item 25).
 *
 * Memory guard (Workers-specific, no multer equivalent): when Content-Length is
 * present and already larger than maxBytes + MULTIPART_SLACK_BYTES the body is
 * rejected without being read, with the same LIMIT_FILE_SIZE error.
 *
 * The size cap is also enforced WHILE READING (boundedFormData): a chunked upload with no Content-Length (or a lying
 * one) is cancelled as soon as it exceeds maxBytes + MULTIPART_SLACK_BYTES, like multer aborting mid-stream, so an
 * authenticated client cannot make the isolate buffer an arbitrarily large body.
 */
const MULTIPART_SLACK_BYTES = 64 * 1024; // boundaries, headers and small text fields

function fileTooLarge() {
  const err = new Error('File too large');
  err.name = 'MulterError';
  err.code = 'LIMIT_FILE_SIZE';
  return err;
}

/**
 * request.formData() with a hard byte cap applied while the body streams in. Rejects with the same LIMIT_FILE_SIZE
 * error (and cancels the upload) the moment more than `limit` bytes arrive.
 */
async function boundedFormData(request, limit) {
  const body = request.body;
  if (!body) return request.formData();
  const reader = body.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      try { await reader.cancel(); } catch { /* the client is being rejected anyway */ }
      throw fileTooLarge();
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new Response(bytes, { headers: { 'content-type': request.headers.get('content-type') || '' } }).formData();
}

/** Same checks as readUpload, but also returns the parsed FormData (text fields) so callers need not parse twice. */
async function readUploadWithForm(c, { field, maxBytes, allowedMimeTypes }) {
  if (!field || !Number.isInteger(maxBytes) || !Array.isArray(allowedMimeTypes)) {
    throw new TypeError('readUpload requires { field, maxBytes (integer), allowedMimeTypes (array) }');
  }

  const contentType = (c.req.header('content-type') || '').toLowerCase();
  if (!contentType.startsWith('multipart/form-data')) return { file: undefined, form: undefined };

  const declared = Number(c.req.header('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes + MULTIPART_SLACK_BYTES) {
    throw fileTooLarge();
  }

  const form = await boundedFormData(c.req.raw, maxBytes + MULTIPART_SLACK_BYTES);
  const entry = form.get(field);
  if (!entry || typeof entry === 'string') return { file: undefined, form };

  if (!allowedMimeTypes.includes(entry.type)) {
    throw new Error('Invalid file type');
  }
  if (entry.size > maxBytes) {
    throw fileTooLarge();
  }

  return {
    file: {
      fieldname: field,
      originalname: entry.name,
      mimetype: entry.type,
      size: entry.size,
      buffer: new Uint8Array(await entry.arrayBuffer()),
    },
    form,
  };
}

async function readUpload(c, options) {
  return (await readUploadWithForm(c, options)).file;
}

module.exports = { readUpload, readUploadWithForm, boundedFormData, MULTIPART_SLACK_BYTES };
