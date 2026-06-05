const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const multer = require('multer');
const pdfParse = require('pdf-parse');
const { callAI } = require('../utils/aiClient');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

async function extractTextFromFile(file) {
  if (!file) throw new Error('No file provided');

  try {
    if (file.mimetype === 'application/pdf') {
      const pdfData = await pdfParse(file.buffer);
      return pdfData.text;
    } else if (file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      const JSZip = require('jszip');
      const zip = new JSZip();
      await zip.loadAsync(file.buffer);
      const xmlFile = zip.file('word/document.xml');
      if (!xmlFile) throw new Error('Invalid DOCX file');
      const xmlContent = await xmlFile.async('text');
      return xmlContent.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    } else {
      throw new Error('Unsupported file type');
    }
  } catch (err) {
    console.error('File extraction error:', err);
    throw new Error('Failed to extract text from file: ' + err.message);
  }
}

async function analyzeResumeWithAI(resumeText, fileName) {
  const systemPrompt = `You are an expert ATS (Applicant Tracking System) specialist. Analyze this resume for ATS-friendliness and overall quality.

Return ONLY valid JSON:
{
  "atsScore": number (0-100, overall ATS optimization score),
  "scoreLabel": "Excellent|Good|Fair|Poor",
  "sections": {
    "formatting": { score: number, feedback: string },
    "structure": { score: number, feedback: string },
    "keywords": { score: number, feedback: string },
    "length": { score: number, feedback: string },
    "clarity": { score: number, feedback: string }
  },
  "strengths": [string array, 3-4 items],
  "improvements": [string array, 3-5 actionable items],
  "atsIssues": [string array of critical ATS parsing issues if any, empty array if none]
}`;

  const userPrompt = `Analyze this resume for ATS optimization. Check: formatting (no tables/images/columns), structure (clear sections), keyword density, length (1-2 pages), clarity, and common ATS blocking issues.

RESUME:
${resumeText}

Score each section 0-100. Overall ATS score is weighted: formatting 25%, structure 25%, keywords 30%, length 10%, clarity 10%.`;

  const aiResult = await callAI({
    systemPrompt,
    userPrompt,
    maxTokens: 1000,
    temperature: 0.3,
    model: process.env.LM_STUDIO_MODEL_INTERVIEW
  });

  if (!aiResult.ok || !aiResult.data) {
    throw new Error('AI analysis failed');
  }

  try {
    return JSON.parse(aiResult.data);
  } catch (e) {
    console.warn('Failed to parse AI response');
    throw e;
  }
}

function calculateFallbackScore(resumeText) {
  const wordCount = resumeText.split(/\s+/).length;
  const hasMultipleColumns = /\s{2,}/.test(resumeText);
  const hasTables = /\||\+\-/.test(resumeText);
  const hasImages = /image|photo|figure/.test(resumeText.toLowerCase());
  const hasContact = /email|phone|linkedin|github/.test(resumeText.toLowerCase());
  const hasExperience = /experience|worked|developed/.test(resumeText.toLowerCase());
  const hasEducation = /bachelor|master|degree|university|college/.test(resumeText.toLowerCase());

  let formattingScore = 100;
  if (hasMultipleColumns) formattingScore -= 25;
  if (hasTables) formattingScore -= 20;
  if (hasImages) formattingScore -= 30;

  let structureScore = 100;
  if (!hasContact) structureScore -= 20;
  if (!hasExperience) structureScore -= 25;
  if (!hasEducation) structureScore -= 15;

  const keywordsScore = Math.min((wordCount / 500) * 100, 100);
  const lengthScore = wordCount > 250 && wordCount < 1000 ? 100 : wordCount > 1500 ? 60 : 80;
  const clarityScore = resumeText.length > 500 ? 75 : 60;

  const atsScore = Math.round(
    (formattingScore * 0.25) +
    (structureScore * 0.25) +
    (keywordsScore * 0.3) +
    (lengthScore * 0.1) +
    (clarityScore * 0.1)
  );

  const scoreLabel = atsScore >= 80 ? 'Excellent' : atsScore >= 60 ? 'Good' : atsScore >= 40 ? 'Fair' : 'Poor';

  return {
    atsScore,
    scoreLabel,
    sections: {
      formatting: { score: Math.min(formattingScore, 100), feedback: 'Resume formatting' },
      structure: { score: Math.min(structureScore, 100), feedback: 'Section structure' },
      keywords: { score: Math.min(keywordsScore, 100), feedback: 'Keyword optimization' },
      length: { score: lengthScore, feedback: 'Resume length' },
      clarity: { score: clarityScore, feedback: 'Content clarity' }
    },
    strengths: ['Resume exists', 'Parseable format'],
    improvements: ['Ensure ATS-friendly formatting', 'Add more specific achievements'],
    atsIssues: [],
    aiPowered: false
  };
}

router.post('/check-ats-score', authenticateToken, upload.single('resume'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        error: 'Resume file is required'
      });
    }

    let resumeText;
    try {
      resumeText = await extractTextFromFile(req.file);
    } catch (err) {
      return res.status(400).json({
        error: 'Failed to process resume file: ' + err.message
      });
    }

    if (!resumeText || resumeText.length < 50) {
      return res.status(400).json({
        error: 'Resume file appears to be empty or too short'
      });
    }

    let result;
    try {
      const aiAnalysis = await analyzeResumeWithAI(resumeText, req.file.originalname);
      result = { ...aiAnalysis, aiPowered: true };
    } catch (err) {
      console.warn('AI analysis failed, using fallback:', err.message);
      result = calculateFallbackScore(resumeText);
    }

    res.json({
      success: true,
      data: result
    });
  } catch (err) {
    console.error('ATS check error:', err);
    res.status(500).json({
      error: 'Failed to check ATS score: ' + err.message
    });
  }
});

module.exports = router;
