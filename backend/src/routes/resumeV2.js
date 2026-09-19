/**
 * Resume Analyzer V2 Routes
 * Fully deterministic ATS Score Checker — no AI/LLM involved anywhere in this pipeline.
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const { authenticateToken: auth } = require('../middleware/auth');
const { requirePlan } = require('../middleware/requirePlan');

// V2 Services
const ResumeAnalysisEngine = require('../services/v2/resumeAnalysisEngine');
const ResumeCriticEngine = require('../services/v2/resumeCriticEngine');
const ResumeExportEngine = require('../services/v2/resumeExportEngine');
const ResumeDatabase = require('../services/resumeDatabase');

// Upload configuration
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowed = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type'));
    }
  }
});

/**
 * POST /api/resume/v2/analyze
 * Deterministic ATS Score Checker — parse + score, no AI.
 * Accepts either a multipart file upload ("resume") or a JSON/body { resumeText }
 * (the frontend parses the file via /api/ats/v2/parse first and sends the text here).
 * Latency: <100ms
 */
router.post('/v2/analyze', auth, requirePlan(2), upload.single('resume'), async (req, res) => {
  try {
    let resumeText;
    let fileBuffer = null;

    if (req.file) {
      fileBuffer = req.file.buffer;
      try {
        if (req.file.mimetype === 'application/pdf') {
          const data = await pdfParse(req.file.buffer);
          resumeText = data.text;
        } else if (req.file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
          const result = await mammoth.extractRawText({ buffer: req.file.buffer });
          resumeText = result.value;
        } else {
          resumeText = req.file.buffer.toString('utf-8');
        }
      } catch (parseError) {
        return res.status(400).json({
          status: 'error',
          message: 'Failed to parse resume file',
          details: parseError.message
        });
      }
    } else {
      resumeText = req.body.resumeText;
    }

    if (!resumeText || typeof resumeText !== 'string' || resumeText.trim().length === 0) {
      return res.status(400).json({
        status: 'error',
        message: 'Resume file is empty or unreadable'
      });
    }

    const startTime = Date.now();
    const analysis = ResumeAnalysisEngine.analyze(resumeText, fileBuffer);
    const processingTime = Date.now() - startTime;

    let resumeId = null;
    try {
      const resumeRecord = await ResumeDatabase.saveResume(
        req.user.id,
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

    return res.json({
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
    res.status(500).json({
      status: 'error',
      message: 'Resume analysis failed',
      details: error.message
    });
  }
});

/**
 * POST /api/resume/v2/feedback
 * Rule-based detailed feedback (no AI).
 */
router.post('/v2/feedback', auth, requirePlan(2), async (req, res) => {
  try {
    const { resumeText } = req.body;

    if (!resumeText || typeof resumeText !== 'string') {
      return res.status(400).json({
        status: 'error',
        message: 'Resume text required'
      });
    }

    const analysis = ResumeAnalysisEngine.analyze(resumeText);
    const feedback = {
      source: 'rule-based',
      ...ResumeCriticEngine.generateQuickFeedback(analysis)
    };

    return res.json({
      status: 'success',
      message: 'Feedback generated successfully',
      score: analysis.overallScore,
      feedback,
      roleContext: analysis.detectedRole
    });
  } catch (error) {
    console.error('Feedback generation error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Feedback generation failed',
      details: error.message
    });
  }
});

/**
 * POST /api/resume/v2/export
 * Export resume in different formats
 * Latency: <2 seconds
 */
router.post('/v2/export', auth, requirePlan(2), async (req, res) => {
  try {
    const { resumeText, format = 'txt' } = req.body;

    if (!resumeText || typeof resumeText !== 'string') {
      return res.status(400).json({
        status: 'error',
        message: 'Resume text required'
      });
    }

    const validFormats = ['pdf', 'docx', 'txt'];
    if (!validFormats.includes(format.toLowerCase())) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid format. Use: pdf, docx, or txt'
      });
    }

    const exportStart = Date.now();
    const result = await ResumeExportEngine.export(resumeText, format);
    const exportTime = Date.now() - exportStart;

    const validation = ResumeExportEngine.validateExport(result.content, format);
    if (!validation.valid) {
      return res.status(500).json({
        status: 'error',
        message: 'Export validation failed',
        details: validation.errors
      });
    }

    res.set({
      'Content-Type': result.mimeType,
      'Content-Disposition': `attachment; filename="${result.filename}"`,
      'Content-Length': Buffer.byteLength(result.content)
    });

    if (format.toLowerCase() === 'pdf') {
      res.end(result.content);
    } else {
      res.send(result.content);
    }
  } catch (error) {
    console.error('Export error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Export failed',
      details: error.message
    });
  }
});

/**
 * GET /api/resume/v2/history
 * Get user's resume analysis history
 */
router.get('/v2/history', auth, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const history = await ResumeDatabase.getUserResumes(req.user.id, limit);

    return res.json({
      status: 'success',
      history
    });
  } catch (error) {
    console.error('History retrieval error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to retrieve history'
    });
  }
});

/**
 * GET /api/resume/v2/:resumeId
 * Get specific resume analysis
 */
router.get('/v2/:resumeId', auth, async (req, res) => {
  try {
    const resume = await ResumeDatabase.getResume(req.params.resumeId, req.user.id);

    if (!resume) {
      return res.status(404).json({
        status: 'error',
        message: 'Resume not found'
      });
    }

    return res.json({
      status: 'success',
      resume
    });
  } catch (error) {
    console.error('Resume retrieval error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to retrieve resume'
    });
  }
});

module.exports = router;
