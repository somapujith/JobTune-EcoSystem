'use strict';

/**
 * readMultipart(c, { field, maxBytes, allowedMimeTypes }) -> { file, fields }
 *
 * `multer(...).single(field)` did two things, and lib/upload.js readUpload only covers the first:
 *   1. req.file  : the one file part, with the size cap and mimetype allowlist  (readUpload)
 *   2. the body : the multipart TEXT fields (e.g. /api/resume/tune reads `jobDescription` and
 *                  `outputFormat`; /api/resume/v2/analyze reads `resumeText` when no file is sent)
 *
 * This wrapper calls readUploadWithForm (readUpload's checks, error types, Content-Length guard and bounded streaming
 * read stay the single source of truth) and uses the FormData it parsed, so the fields are available without
 * parsing the body twice. Resolves:
 *   file    same value readUpload gives (undefined when not multipart / no file under `field`)
 *   fields  multer's parsed-body equivalent: a null-prototype object of the text fields (repeated names
 *           become arrays), or `undefined` when the request was not multipart (then the caller falls
 *           back to the JSON/urlencoded body from getBody(c), exactly as Express left the body alone).
 *
 * Three multer behaviours readUpload deliberately does not model are restored here because the Express
 * responses differ observably (all surface as masked 500s, like every multer error):
 *   - the size limit is EXCLUSIVE: busboy truncates a file when its size reaches `limits.fileSize`, so a file of
 *     exactly 5 MB / 10 MB was rejected with LIMIT_FILE_SIZE on Render (observed with multer 2.1.1: limit 100
 *     accepts 99 bytes and rejects 100). readUpload accepts a file of exactly maxBytes; this wrapper rejects it.
 *     (If lib/upload.js is later changed to reject size >= maxBytes, this check becomes a harmless no-op.)
 *   - a file part under a DIFFERENT field name throws MulterError LIMIT_UNEXPECTED_FILE ("Unexpected field"),
 *     where readUpload alone would return undefined and the route would answer 400 "No file uploaded".
 *   - multer decodes multipart filenames as latin1 (multer's defParamCharset default), so a non-ASCII
 *     original name ("resume.pdf" written with accents) reached `req.file.originalname` as mojibake and was
 *     stored / echoed that way. Workers decode it as UTF-8. MULTER_LATIN1_FILENAMES keeps the Render
 *     behaviour (existing rows in `resumes.file_name` are mojibake; a consistent port does not mix). Flip
 *     it to false in a post-cutover PR to fix the bug (ADR 4.3).
 *
 * Call it BEFORE any try/catch that wraps the handler body: in Express the multer middleware ran ahead of
 * the handler, so its errors reached errorHandler (masked 500) rather than the route's own catch block.
 */
const { readUploadWithForm } = require('../../lib/upload');

const MULTER_LATIN1_FILENAMES = true;

function multerError(message, code) {
  const err = new Error(message);
  err.name = 'MulterError';
  err.code = code;
  return err;
}

/** UTF-8 -> what busboy's latin1 header decoding produced from the same raw bytes. */
function asMulterFilename(name) {
  if (!MULTER_LATIN1_FILENAMES || typeof name !== 'string') return name;
  return Buffer.from(name, 'utf8').toString('latin1');
}

async function readMultipart(c, options) {
  // readUploadWithForm applies readUpload's checks (Content-Length guard, bounded streaming read, mimetype allowlist,
  // size) and hands back the FormData it parsed, so the text fields need no second parse.
  const { file, form } = await readUploadWithForm(c, options);
  if (file && file.size >= options.maxBytes) throw multerError('File too large', 'LIMIT_FILE_SIZE');
  if (!form) return { file, fields: undefined };

  const fields = Object.create(null);
  let filesUnderField = 0;
  for (const [name, value] of form.entries()) {
    if (typeof value !== 'string') {
      // .single(field) accepts exactly one file, under `field`
      if (name !== options.field || ++filesUnderField > 1) {
        throw multerError('Unexpected field', 'LIMIT_UNEXPECTED_FILE');
      }
      continue;
    }
    if (name in fields) {
      fields[name] = Array.isArray(fields[name]) ? [...fields[name], value] : [fields[name], value];
    } else {
      fields[name] = value;
    }
  }

  if (file) file.originalname = asMulterFilename(file.originalname);
  return { file, fields };
}

module.exports = { readMultipart, MULTER_LATIN1_FILENAMES };
