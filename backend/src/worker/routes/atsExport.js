'use strict';

/**
 * /api/ats (part 1 of 2): Worker port of backend/src/routes/atsExport.js (HEAD).  (docs slice)
 * Mounted BEFORE routes/atsCheckerV2.js on the same prefix, like Express (see routes/mounts/docs.js).
 *
 *   POST /export/docx   authenticateToken   binary DOCX download
 *   POST /export/txt    authenticateToken   binary TXT download
 *   GET  /history       authenticateToken
 *
 * Binary responses: the Express setHeader + send(buffer) pair -> `new Response(bytes, { headers })`. Headers match
 * Express 5.2.1 (checked): docx  Content-Type application/vnd.openxmlformats-officedocument.wordprocessingml.document
 * and txt  Content-Type text/plain (both WITHOUT a charset: Express never appends one when sending a Buffer),
 * Content-Disposition attachment; filename="optimized-resume.docx|txt", Content-Length = byte length.
 * (Express also added a weak ETag; Hono does not, see README section 4.)
 *
 * Same order of effects as Express: look the resume up, build the file, save the export record, THEN answer.
 * An error at any step is logged with console.error('Export error:') and rethrown (Express: next(err)), which
 * onError renders as the masked 500. Preserved quirk (ADR 4.3, not fixed): on Express the Content-Type /
 * Content-Disposition headers had already been set when the failing step ran, so its JSON error response carried
 * a stale `Content-Disposition: attachment` header; the Worker builds the Response last, so it does not.
 * Preserved quirk: a resume row with neither optimized_resume nor original_resume makes the export throw
 * (masked 500), exactly as it did.
 */
const { createRouter } = require('../lib/routes');
const { authenticateToken } = require('../middleware/auth');
const { getServices } = require('../lib/context');
const { getBody, getQuery } = require('../lib/http');

const router = createRouter();

// Export resume as DOCX
router.post('/export/docx', authenticateToken, async (c) => {
  try {
    const { resumeDatabase: ResumeDatabase, resumeExport: ResumeExport } = getServices(c);
    const { resumeId } = getBody(c);
    const userId = c.get('user').id;

    if (!resumeId) {
      return c.json({ error: 'Resume ID required' }, 400);
    }

    // Get resume from database
    const resume = await ResumeDatabase.getResume(resumeId, userId);
    if (!resume) {
      return c.json({ error: 'Resume not found' }, 404);
    }

    const resumeText = resume.optimized_resume || resume.original_resume;

    // Generate DOCX
    const docxBuffer = await ResumeExport.toDOCX(resumeText, 'modern');

    // Save export record
    await ResumeDatabase.saveExport(resumeId, 'docx', `resume_${userId}_${Date.now()}.docx`);

    return new Response(docxBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="optimized-resume.docx"`,
        'Content-Length': String(docxBuffer.byteLength),
      },
    });
  } catch (err) {
    console.error('Export error:', err);
    throw err;
  }
});

// Export resume as TXT
router.post('/export/txt', authenticateToken, async (c) => {
  try {
    const { resumeDatabase: ResumeDatabase, resumeExport: ResumeExport } = getServices(c);
    const { resumeId } = getBody(c);
    const userId = c.get('user').id;

    if (!resumeId) {
      return c.json({ error: 'Resume ID required' }, 400);
    }

    // Get resume from database
    const resume = await ResumeDatabase.getResume(resumeId, userId);
    if (!resume) {
      return c.json({ error: 'Resume not found' }, 404);
    }

    const resumeText = resume.optimized_resume || resume.original_resume;

    // Generate TXT
    const txtBuffer = ResumeExport.toTXT(resumeText);

    // Save export record
    await ResumeDatabase.saveExport(resumeId, 'txt', `resume_${userId}_${Date.now()}.txt`);

    return new Response(txtBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain',
        'Content-Disposition': `attachment; filename="optimized-resume.txt"`,
        'Content-Length': String(txtBuffer.byteLength),
      },
    });
  } catch (err) {
    console.error('Export error:', err);
    throw err;
  }
});

// Get user's resume history
router.get('/history', authenticateToken, async (c) => {
  try {
    const { resumeDatabase: ResumeDatabase } = getServices(c);
    const userId = c.get('user').id;
    const limit = parseInt(getQuery(c).limit) || 10;

    const resumes = await ResumeDatabase.getUserResumes(userId, limit);

    return c.json({
      data: {
        resumes,
        count: resumes.length
      }
    });
  } catch (err) {
    console.error('History query error:', err);
    throw err;
  }
});

module.exports = router;
