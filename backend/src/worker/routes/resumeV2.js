'use strict';

/**
 * /api/resume (part 2 of 2): Worker port of backend/src/routes/resumeV2.js (HEAD).  (docs slice)
 * Resume Analyzer V2 Routes. Fully deterministic ATS Score Checker, no AI/LLM involved anywhere in this pipeline.
 * Mounted AFTER routes/resume.js on the same prefix, like Express (see routes/mounts/docs.js).
 *
 * 5 endpoints, in the Express registration order (authenticateToken on all, requirePlan(2) on the first three):
 *   POST /v2/analyze    auth + requirePlan(2) + multipart `resume` (5 MB; pdf, docx, text) or JSON { resumeText }
 *   POST /v2/feedback   auth + requirePlan(2)
 *   POST /v2/export     auth + requirePlan(2)   binary download (pdf / docx / txt)
 *   GET  /v2/history    auth
 *   GET  /v2/:resumeId  auth
 *
 * Services: `resumeAnalysisEngine` and `resumeCriticEngine` (pure analyzers, infra slice) come from
 * getServices(c) exposing the original static methods (`analyze`, `generateQuickFeedback`);
 * `resumeExportEngine` and `resumeDatabase` are this slice's ports.
 *
 * Platform-forced difference: Date.now() is frozen inside workerd while a request is CPU-bound (Spectre
 * mitigation), so `analysis.processingTimeMs` and the route's own timing are ~0 instead of real milliseconds.
 * Cosmetic; no client logic depends on it.
 *
 * Response headers for POST /v2/export replicate Express exactly (verified against Express 5.2.1):
 *   pdf : Content-Type application/pdf                 (sent with end(buffer): no charset, no ETag)
 *   txt : Content-Type text/plain; charset=utf-8       (res.set adds the charset for text/*)
 *   docx: Content-Type <docx mime>; charset=utf-8      (send(string) appends the charset to ANY type)
 *   all : Content-Disposition attachment; filename="<result.filename>", Content-Length = byte length
 * (Express also added a weak ETag on the two send() branches; Hono does not, see README section 4.)
 *
 * Preserved quirks (ADR 4.3, not fixed):
 *   - format "docx" is NOT a DOCX: resumeExportEngine returns the plain text under the DOCX mime type.
 *   - a missing / non-object JSON body makes `const { resumeText } = body` throw; the route's own catch
 *     answers 500 { status:'error', message:..., details: <V8 TypeError text> }. The text of that TypeError
 *     names the destructured expression, so it reads "... of 'getBody(...)' ..." where Express said
 *     "... of 'req' + '.body' ..." (the request object's body); status and shape match (documented deviation, only reachable by a request with no JSON body).
 *   - multipart upload errors (wrong type, > 5 MB, unexpected field) are masked 500 through onError, because
 *     in Express multer ran before the handler and its errors bypassed the route's catch block.
 */
const { createRouter } = require('../lib/routes');
const { authenticateToken: auth } = require('../middleware/auth');
const { requirePlan } = require('../middleware/requirePlan');
const { getServices } = require('../lib/context');
const { getBody, getQuery } = require('../lib/http');
const { readMultipart } = require('../services/docs/multipart');
const { parsePdf, extractDocxRawText, decodeUtf8 } = require('../services/docs/docText');

const router = createRouter();

// multer({ limits: { fileSize: 5MB }, fileFilter: pdf | docx | text/plain })
const UPLOAD = {
  field: 'resume',
  maxBytes: 5 * 1024 * 1024, // 5MB
  allowedMimeTypes: ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain'],
};

/**
 * POST /api/resume/v2/analyze
 * Deterministic ATS Score Checker — parse + score, no AI.
 * Accepts either a multipart file upload ("resume") or a JSON/body { resumeText }
 * (the frontend parses the file via /api/ats/v2/parse first and sends the text here).
 * Latency: <100ms
 */
router.post('/v2/analyze', auth, requirePlan(2), async (c) => {
  // multer ran before the handler: its errors are NOT caught by the route's try/catch
  const { file, fields } = await readMultipart(c, UPLOAD);

  try {
    const { resumeAnalysisEngine: ResumeAnalysisEngine, resumeDatabase: ResumeDatabase } = getServices(c);
    let resumeText;
    let fileBuffer = null;

    if (file) {
      fileBuffer = file.buffer;
      try {
        if (file.mimetype === 'application/pdf') {
          const data = await parsePdf(file.buffer);
          resumeText = data.text;
        } else if (file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
          const result = await extractDocxRawText(file.buffer);
          resumeText = result.value;
        } else {
          resumeText = decodeUtf8(file.buffer);
        }
      } catch (parseError) {
        return c.json({
          status: 'error',
          message: 'Failed to parse resume file',
          details: parseError.message
        }, 400);
      }
    } else {
      const body = fields !== undefined ? fields : getBody(c);
      resumeText = body.resumeText;
    }

    if (!resumeText || typeof resumeText !== 'string' || resumeText.trim().length === 0) {
      return c.json({
        status: 'error',
        message: 'Resume file is empty or unreadable'
      }, 400);
    }

    const startTime = Date.now();
    const analysis = ResumeAnalysisEngine.analyze(resumeText, fileBuffer);
    const processingTime = Date.now() - startTime;

    let resumeId = null;
    try {
      const resumeRecord = await ResumeDatabase.saveResume(
        c.get('user').id,
        resumeText,
        {
          total: analysis.overallScore,
          role: analysis.detectedRole.role,
          keywordCoverage: {
            found: analysis.analysis.keywords.keywords.found.length,
            total: analysis.analysis.keywords.keywords.total
          },
          missingInfo: analysis.analysis.missingInfo.missing
        }
      );
      resumeId = resumeRecord?.id ?? null;
    } catch (dbError) {
      console.error('Resume analysis saved locally but DB persist failed:', dbError.message);
    }

    return c.json({
      status: 'success',
      message: 'Resume analyzed successfully',
      resumeId,
      resumeText: resumeText.trim(),
      analysis: {
        overallScore: analysis.overallScore,
        detectedRole: analysis.detectedRole,
        scores: analysis.scores,
        maxScores: analysis.maxScores,
        contactInfo: analysis.contactInfo,
        summary: analysis.summary,
        quality: analysis.quality,
        issues: analysis.issues,
        recommendations: analysis.recommendations,
        processingTimeMs: processingTime
      },
      atsCompatible: analysis.atsCompatible
    });
  } catch (error) {
    console.error('Resume analysis error:', error);
    return c.json({
      status: 'error',
      message: 'Resume analysis failed',
      details: error.message
    }, 500);
  }
});

/**
 * POST /api/resume/v2/feedback
 * Rule-based detailed feedback (no AI).
 */
router.post('/v2/feedback', auth, requirePlan(2), async (c) => {
  try {
    const { resumeAnalysisEngine: ResumeAnalysisEngine, resumeCriticEngine: ResumeCriticEngine } = getServices(c);
    const { resumeText } = getBody(c);

    if (!resumeText || typeof resumeText !== 'string') {
      return c.json({
        status: 'error',
        message: 'Resume text required'
      }, 400);
    }

    const analysis = ResumeAnalysisEngine.analyze(resumeText);
    const feedback = {
      source: 'rule-based',
      ...ResumeCriticEngine.generateQuickFeedback(analysis)
    };

    return c.json({
      status: 'success',
      message: 'Feedback generated successfully',
      score: analysis.overallScore,
      feedback,
      roleContext: analysis.detectedRole
    });
  } catch (error) {
    console.error('Feedback generation error:', error);
    return c.json({
      status: 'error',
      message: 'Feedback generation failed',
      details: error.message
    }, 500);
  }
});

/**
 * POST /api/resume/v2/export
 * Export resume in different formats
 * Latency: <2 seconds
 */
router.post('/v2/export', auth, requirePlan(2), async (c) => {
  try {
    const { resumeExportEngine: ResumeExportEngine } = getServices(c);
    const { resumeText, format = 'txt' } = getBody(c);

    if (!resumeText || typeof resumeText !== 'string') {
      return c.json({
        status: 'error',
        message: 'Resume text required'
      }, 400);
    }

    const validFormats = ['pdf', 'docx', 'txt'];
    if (!validFormats.includes(format.toLowerCase())) {
      return c.json({
        status: 'error',
        message: 'Invalid format. Use: pdf, docx, or txt'
      }, 400);
    }

    const exportStart = Date.now();
    const result = await ResumeExportEngine.export(resumeText, format);
    const exportTime = Date.now() - exportStart; // eslint-disable-line no-unused-vars

    const validation = ResumeExportEngine.validateExport(result.content, format);
    if (!validation.valid) {
      return c.json({
        status: 'error',
        message: 'Export validation failed',
        details: validation.errors
      }, 500);
    }

    const isPdf = format.toLowerCase() === 'pdf';
    return new Response(result.content, {
      status: 200,
      headers: {
        // pdf is sent as a raw buffer; txt / docx are sent as a string, and Express then appends the charset to the type
        'Content-Type': isPdf ? result.mimeType : `${result.mimeType}; charset=utf-8`,
        'Content-Disposition': `attachment; filename="${result.filename}"`,
        'Content-Length': String(Buffer.byteLength(result.content))
      }
    });
  } catch (error) {
    console.error('Export error:', error);
    return c.json({
      status: 'error',
      message: 'Export failed',
      details: error.message
    }, 500);
  }
});

/**
 * GET /api/resume/v2/history
 * Get user's resume analysis history
 */
router.get('/v2/history', auth, async (c) => {
  try {
    const { resumeDatabase: ResumeDatabase } = getServices(c);
    const limit = parseInt(getQuery(c).limit) || 10;
    const history = await ResumeDatabase.getUserResumes(c.get('user').id, limit);

    return c.json({
      status: 'success',
      history
    });
  } catch (error) {
    console.error('History retrieval error:', error);
    return c.json({
      status: 'error',
      message: 'Failed to retrieve history'
    }, 500);
  }
});

/**
 * GET /api/resume/v2/:resumeId
 * Get specific resume analysis
 */
router.get('/v2/:resumeId', auth, async (c) => {
  try {
    const { resumeDatabase: ResumeDatabase } = getServices(c);
    const resume = await ResumeDatabase.getResume(c.req.param('resumeId'), c.get('user').id);

    if (!resume) {
      return c.json({
        status: 'error',
        message: 'Resume not found'
      }, 404);
    }

    return c.json({
      status: 'success',
      resume
    });
  } catch (error) {
    console.error('Resume retrieval error:', error);
    return c.json({
      status: 'error',
      message: 'Failed to retrieve resume'
    }, 500);
  }
});

module.exports = router;
