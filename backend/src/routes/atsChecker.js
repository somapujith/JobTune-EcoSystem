const express = require('express');
const router = express.Router();
const multer = require('multer');
const { extractTextFromFile } = require('../utils/fileParser');
const { analyzeResume, detectMissingFields, optimizeResume, calculateATSScore } = require('../services/resumeOptimizer');
const { authenticateToken } = require('../middleware/auth');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// Analyze resume
router.post('/analyze', authenticateToken, upload.single('resume'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Resume file required' });
    }

    console.log(`[ATS] Analyzing resume: ${req.file.originalname}`);

    // Extract text from file
    const resumeText = await extractTextFromFile(req.file);

    // Analyze with AI
    const analysis = await analyzeResume(resumeText);

    // Detect missing fields
    const missingFields = await detectMissingFields(resumeText);

    res.json({
      data: {
        resumeText,
        analysis,
        missingFields: missingFields.missingFields || [],
        hasAllRequired: (missingFields.missingFields || []).length === 0
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

    const resumeText = await extractTextFromFile(req.file);
    const additionalInfo = req.body.additionalInfo ? JSON.parse(req.body.additionalInfo) : {};

    console.log(`[ATS] Optimizing resume with AI...`);

    // Optimize with AI
    const optimizedResume = await optimizeResume(resumeText, additionalInfo);

    // Calculate improved score
    const improvedScore = calculateATSScore(optimizedResume);

    // Analyze optimized resume
    const analysis = await analyzeResume(optimizedResume);

    res.json({
      data: {
        originalText: resumeText,
        optimizedResume,
        improvedScore,
        analysis: {
          ...analysis,
          improvement: improvedScore - (analysis.currentScore || 42)
        }
      }
    });
  } catch (err) {
    console.error('Resume optimization error:', err);
    next(err);
  }
});

module.exports = router;
