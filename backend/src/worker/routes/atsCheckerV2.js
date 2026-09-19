'use strict';

/**
 * /api/ats (part 2 of 2): Worker port of backend/src/routes/atsCheckerV2.js (HEAD).  (docs slice)
 * ATS Checker V2 Routes: resume file parsing for the V2 analyze/optimize pipeline.
 * Mounted AFTER routes/atsExport.js on the same prefix, like Express (see routes/mounts/docs.js).
 *
 *   POST /v2/parse   authenticateToken + requirePlan(2) + multipart `resume` (5 MB; pdf, docx, text/plain)
 *
 * multer -> readMultipart (services/docs/multipart.js, over lib/upload.js readUpload): the 5 MB cap and the
 * three-type mimetype allowlist are unchanged (ADR 6.6, checklist item 25). Auth and the plan gate run before
 * the body is read, as multer did. `pdf-parse(buffer)` -> the pinned pdf.js wrapper with a Uint8Array;
 * `mammoth.extractRawText({ buffer })` -> `{ arrayBuffer }` (the { buffer } form fails under the bundler,
 * spike S5); text/plain is decoded with TextDecoder (a Uint8Array has no toString('utf-8')).
 *
 * Error contract (unchanged): upload errors (wrong type, > 5 MB) are masked 500 {"error":"Internal Server
 * Error"} through onError, because in Express multer ran before the handler and its errors bypassed the
 * route's catch; parse failures inside the handler are 500 { status:'error', message:'Failed to parse resume
 * file', details }.
 */
const { createRouter } = require('../lib/routes');
const { authenticateToken: auth } = require('../middleware/auth');
const { requirePlan } = require('../middleware/requirePlan');
const { readMultipart } = require('../services/docs/multipart');
const { parsePdf, extractDocxRawText, decodeUtf8 } = require('../services/docs/docText');

const router = createRouter();

// multer({ limits: { fileSize: 5MB }, fileFilter: pdf | docx | text/plain })
const UPLOAD = {
  field: 'resume',
  maxBytes: 5 * 1024 * 1024,
  allowedMimeTypes: ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain'],
};

/**
 * POST /api/ats/v2/parse
 * Parse resume file (PDF/DOCX/TXT) and extract text
 */
router.post('/v2/parse', auth, requirePlan(2), async (c) => {
  // multer ran before the handler: its errors are NOT caught by the route's try/catch
  const { file } = await readMultipart(c, UPLOAD);

  try {
    if (!file) {
      return c.json({
        status: 'error',
        message: 'No file uploaded'
      }, 400);
    }

    let resumeText = '';

    if (file.mimetype === 'application/pdf') {
      // Parse PDF
      const pdf = await parsePdf(file.buffer);
      resumeText = pdf.text;
    } else if (file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      // Parse DOCX
      const result = await extractDocxRawText(file.buffer);
      resumeText = result.value;
    } else if (file.mimetype === 'text/plain') {
      // Plain text
      resumeText = decodeUtf8(file.buffer);
    }

    if (!resumeText || resumeText.trim().length === 0) {
      return c.json({
        status: 'error',
        message: 'Could not extract text from file'
      }, 400);
    }

    return c.json({
      status: 'success',
      resumeText: resumeText.trim(),
      fileName: file.originalname,
      fileSize: file.size
    });
  } catch (error) {
    console.error('Resume parse error:', error);
    return c.json({
      status: 'error',
      message: 'Failed to parse resume file',
      details: error.message
    }, 500);
  }
});

module.exports = router;
