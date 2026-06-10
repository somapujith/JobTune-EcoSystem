/**
 * Resume Analyzer V2 Routes
 * Implements 10-stage resume analysis pipeline
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const auth = require('../middleware/auth');

// V2 Services
const ResumeAnalysisEngine = require('../services/v2/resumeAnalysisEngine');
const ResumeOptimizationEngine = require('../services/v2/resumeOptimizationEngine');
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
 * Stage 1-6: Upload, parse, and analyze resume
 * Latency: <100ms for analysis
 */
router.post('/v2/analyze', auth, upload.single('resume'), async (req, res) => {
  try {
    // Stage 1: File validation (already done by multer)
    if (!req.file) {
      return res.status(400).json({
        status: 'error',
        message: 'No file uploaded'
      });
    }

    // Stage 2: Resume parsing
    let resumeText;
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

    if (!resumeText || resumeText.trim().length === 0) {
      return res.status(400).json({
        status: 'error',
        message: 'Resume file is empty or unreadable'
      });
    }

    // Stage 3-6: Rule-based analysis (instant)
    const startTime = Date.now();
    const analysis = ResumeAnalysisEngine.analyze(resumeText, req.file.buffer);
    const processingTime = Date.now() - startTime;

    // Save to database (async, don't block response)
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

    // Return analysis results
    return res.json({
      status: 'success',
      message: 'Resume analyzed successfully',
      resumeId: resumeRecord.id,
      analysis: {
        overallScore: analysis.overallScore,
        detectedRole: analysis.detectedRole,
        scores: analysis.scores,
        summary: analysis.summary,
        quality: analysis.quality,
        recommendations: analysis.recommendations,
        processingTimeMs: processingTime
      },
      atsCompatible: analysis.atsCompatible,
      readyForOptimization: analysis.quality.readyForOptimization,
      next: 'Use /v2/optimize to generate improved version'
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
 * POST /api/resume/v2/optimize
 * Stage 7-9: AI optimization and re-scoring
 * Latency: 8-15 seconds
 */
router.post('/v2/optimize', auth, async (req, res) => {
  try {
    const { resumeId, resumeText } = req.body;

    if (!resumeText || typeof resumeText !== 'string') {
      return res.status(400).json({
        status: 'error',
        message: 'Resume text required'
      });
    }

    // Get initial analysis
    const initialAnalysis = ResumeAnalysisEngine.analyze(resumeText);

    // Stage 7: AI Optimization
    const optimizationStart = Date.now();
    const optimization = await ResumeOptimizationEngine.optimize(
      resumeText,
      initialAnalysis.detectedRole.role,
      initialAnalysis
    );
    const optimizationTime = Date.now() - optimizationStart;

    if (optimization.status !== 'success') {
      return res.status(500).json({
        status: 'error',
        message: 'Optimization failed',
        details: optimization.message
      });
    }

    // Stage 8: Re-score optimized resume
    const optimizedAnalysis = ResumeAnalysisEngine.analyze(optimization.optimizedResume);

    // Stage 9: Save optimized resume
    if (resumeId) {
      await ResumeDatabase.updateOptimizedResume(
        resumeId,
        optimization.optimizedResume,
        optimizedAnalysis.overallScore,
        optimizedAnalysis
      );
    }

    // Return optimization results
    return res.json({
      status: 'success',
      message: 'Resume optimized successfully',
      optimization: {
        originalScore: initialAnalysis.overallScore,
        optimizedScore: optimizedAnalysis.overallScore,
        improvement: optimizedAnalysis.overallScore - initialAnalysis.overallScore,
        processingTimeMs: optimizationTime,
        optimizationNotes: optimization.optimizationNotes
      },
      optimizedResume: optimization.optimizedResume,
      optimizedAnalysis: {
        scores: optimizedAnalysis.scores,
        summary: optimizedAnalysis.summary,
        quality: optimizedAnalysis.quality
      },
      next: 'Use /v2/feedback to get detailed analysis, or /v2/export to download'
    });
  } catch (error) {
    console.error('Resume optimization error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Optimization failed',
      details: error.message
    });
  }
});

/**
 * POST /api/resume/v2/feedback
 * Stage 9: Generate detailed feedback using AI
 * Latency: 8-15 seconds
 */
router.post('/v2/feedback', auth, async (req, res) => {
  try {
    const { resumeText } = req.body;

    if (!resumeText || typeof resumeText !== 'string') {
      return res.status(400).json({
        status: 'error',
        message: 'Resume text required'
      });
    }

    // Get analysis
    const analysis = ResumeAnalysisEngine.analyze(resumeText);

    // Try to get AI feedback, fall back to rule-based if LLM unavailable
    let feedback;
    try {
      const aiStart = Date.now();
      const aiFeedback = await ResumeCriticEngine.generateFeedback(
        resumeText,
        analysis.detectedRole.role,
        analysis
      );
      const aiTime = Date.now() - aiStart;

      feedback = {
        source: 'ai',
        processingTimeMs: aiTime,
        ...aiFeedback.feedback
      };
    } catch (error) {
      console.warn('AI feedback unavailable, using rule-based feedback');
      feedback = {
        source: 'rule-based',
        ...ResumeCriticEngine.generateQuickFeedback(analysis)
      };
    }

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
 * Stage 10: Export resume in different formats
 * Latency: <2 seconds
 */
router.post('/v2/export', auth, async (req, res) => {
  try {
    const { resumeText, format = 'txt' } = req.body;

    if (!resumeText || typeof resumeText !== 'string') {
      return res.status(400).json({
        status: 'error',
        message: 'Resume text required'
      });
    }

    // Validate format
    const validFormats = ['pdf', 'docx', 'txt'];
    if (!validFormats.includes(format.toLowerCase())) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid format. Use: pdf, docx, or txt'
      });
    }

    // Export
    const exportStart = Date.now();
    const result = await ResumeExportEngine.export(resumeText, format);
    const exportTime = Date.now() - exportStart;

    // Validate
    const validation = ResumeExportEngine.validateExport(result.content, format);
    if (!validation.valid) {
      return res.status(500).json({
        status: 'error',
        message: 'Export validation failed',
        details: validation.errors
      });
    }

    // Set response headers
    res.set({
      'Content-Type': result.mimeType,
      'Content-Disposition': `attachment; filename="${result.filename}"`,
      'Content-Length': Buffer.byteLength(result.content)
    });

    // Send file
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
