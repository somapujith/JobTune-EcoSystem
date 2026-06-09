const express = require('express');
const router = express.Router();
const multer = require('multer');
const { extractTextFromFile } = require('../utils/fileParser');
const { optimizeResume } = require('../services/resumeOptimizer');
const ATSScoring = require('../services/atsScoring');
const ResumeStructure = require('../services/resumeStructure');
const MissingInfoEngine = require('../services/missingInfoEngine');
const KeywordIntelligence = require('../services/keywordIntelligence');
const { authenticateToken } = require('../middleware/auth');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// Analyze resume - Rule-based (no AI)
router.post('/analyze', authenticateToken, upload.single('resume'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Resume file required' });
    }

    console.log(`[ATS] Analyzing resume: ${req.file.originalname}`);
    const start = Date.now();

    // Extract text from file
    const resumeText = await extractTextFromFile(req.file);

    // Rule-based analysis (fast, no AI needed)
    const atsAnalysis = ATSScoring.calculateScore(resumeText);
    const detectedRole = KeywordIntelligence.detectRole(resumeText);
    const keywordCoverage = KeywordIntelligence.analyzeKeywordCoverage(resumeText, detectedRole);
    const missingInfo = MissingInfoEngine.analyzeMissingInfo(resumeText);
    const gapScore = MissingInfoEngine.scoreGaps(missingInfo);
    const recommendations = ATSScoring.generateRecommendations(atsAnalysis);

    const duration = Date.now() - start;
    console.log(`[ATS] Analysis complete in ${duration}ms`);

    res.json({
      data: {
        resumeText,
        score: atsAnalysis.total,
        breakdown: atsAnalysis.breakdown,
        role: detectedRole,
        keywordCoverage,
        missingInfo: {
          count: missingInfo.count,
          fields: missingInfo.fields,
          severity: gapScore.severity,
          hasCriticalGaps: missingInfo.hasCriticalGaps
        },
        recommendations,
        timing: `${duration}ms`
      }
    });
  } catch (err) {
    console.error('Resume analysis error:', err);
    next(err);
  }
});

// Optimize resume with AI
router.post('/optimize', authenticateToken, upload.single('resume'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Resume file required' });
    }

    console.log(`[ATS] Optimizing resume with AI...`);
    const start = Date.now();

    const resumeText = await extractTextFromFile(req.file);
    const additionalInfo = req.body.additionalInfo ? JSON.parse(req.body.additionalInfo) : {};

    // Get before score
    const beforeScore = ATSScoring.calculateScore(resumeText);
    const detectedRole = KeywordIntelligence.detectRole(resumeText);

    // AI rewriting
    const optimizedResume = await optimizeResume(resumeText, additionalInfo);

    // Quick scoring (skip expensive re-analysis)
    const afterScore = ATSScoring.calculateScore(optimizedResume);

    const duration = Date.now() - start;
    console.log(`[ATS] Optimization complete in ${duration}ms`);

    res.json({
      data: {
        originalResume: resumeText,
        optimizedResume,
        improvedScore: afterScore.total,
        scores: {
          before: beforeScore.total,
          after: afterScore.total,
          improvement: afterScore.total - beforeScore.total
        },
        timing: `${duration}ms`
      }
    });
  } catch (err) {
    console.error('Resume optimization error:', err);
    next(err);
  }
});

module.exports = router;
