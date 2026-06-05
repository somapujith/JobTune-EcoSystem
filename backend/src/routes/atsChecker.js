const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const multer = require('multer');
const pdfParse = require('pdf-parse');
const { Packer, Document } = require('docx');
const fs = require('fs');
const path = require('path');
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
      const text = xmlContent.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
      return text;
    } else {
      throw new Error('Unsupported file type');
    }
  } catch (err) {
    console.error('File extraction error:', err);
    throw new Error('Failed to extract text from file: ' + err.message);
  }
}

async function calculateATSScoreWithAI(resumeText, jobDescription) {
  const systemPrompt = `You are an expert ATS (Applicant Tracking System) analyzer. Analyze the resume against the job description and provide a detailed ATS score analysis.

Return ONLY valid JSON (no markdown, no code blocks):
{
  "atsScore": number (0-100),
  "scoreLabel": "Excellent|Good|Fair|Poor",
  "analysis": {
    "hardSkillMatch": number (0-100, % of required skills found),
    "softSkillMatch": number (0-100, behavioral/soft skills),
    "experienceMatch": number (0-100, relevant experience level),
    "matchedSkills": [string array of skills that match],
    "missingSkills": [string array of critical missing skills],
    "strengths": [string array of resume strengths relevant to job],
    "gaps": [string array of skill gaps to address]
  },
  "recommendations": [string array of 3-4 actionable improvements]
}`;

  const userPrompt = `RESUME:
${resumeText}

JOB DESCRIPTION:
${jobDescription}

Analyze this resume against the job description. Be strict but fair. Weight hard skills 50%, soft skills 30%, experience 20%.`;

  const aiResult = await callAI({
    systemPrompt,
    userPrompt,
    maxTokens: 800,
    temperature: 0.3,
    model: process.env.LM_STUDIO_MODEL_INTERVIEW
  });

  if (!aiResult.ok || !aiResult.data) {
    throw new Error('AI analysis failed');
  }

  try {
    const parsed = JSON.parse(aiResult.data);
    return {
      atsScore: parsed.atsScore,
      scoreLabel: parsed.scoreLabel,
      hardSkillMatch: parsed.analysis.hardSkillMatch,
      softSkillMatch: parsed.analysis.softSkillMatch,
      experienceMatch: parsed.analysis.experienceMatch,
      matchedKeywords: parsed.analysis.matchedSkills,
      missingKeywords: parsed.analysis.missingSkills,
      strengths: parsed.analysis.strengths,
      gaps: parsed.analysis.gaps,
      recommendations: parsed.recommendations,
      aiPowered: true
    };
  } catch (e) {
    console.warn('Failed to parse AI response, using fallback');
    return calculateFallbackScore(resumeText, jobDescription);
  }
}

function calculateFallbackScore(resumeText, jobDescription) {
  const techKeywords = [
    'react', 'vue', 'angular', 'svelte', 'nextjs', 'nuxt',
    'nodejs', 'python', 'java', 'csharp', 'golang', 'rust',
    'typescript', 'javascript', 'sql', 'mongodb', 'postgresql',
    'docker', 'kubernetes', 'aws', 'azure', 'gcp',
    'git', 'cicd', 'jenkins', 'github', 'gitlab',
    'agile', 'scrum', 'rest', 'graphql', 'api',
    'html', 'css', 'tailwind', 'bootstrap', 'sass',
    'express', 'django', 'flask', 'spring', 'fastapi',
    'redis', 'elasticsearch', 'rabbitmq', 'kafka'
  ];

  const resumeLower = resumeText.toLowerCase();
  const jobLower = jobDescription.toLowerCase();

  const resumeKeywords = techKeywords.filter(kw => resumeLower.includes(kw));
  const jobKeywords = techKeywords.filter(kw => jobLower.includes(kw));

  const matchedKeywords = jobKeywords.filter(kw => resumeKeywords.includes(kw));
  const missingKeywords = jobKeywords.filter(kw => !resumeKeywords.includes(kw));

  const hardSkillScore = jobKeywords.length > 0 ? (matchedKeywords.length / jobKeywords.length) * 100 : 50;
  const softSkillScore = 50;
  const experienceScore = resumeLower.includes('experience') || resumeLower.includes('project') ? 60 : 30;

  const atsScore = Math.round((hardSkillScore * 0.5) + (softSkillScore * 0.3) + (experienceScore * 0.2));
  const scoreLabel = atsScore >= 80 ? 'Excellent' : atsScore >= 60 ? 'Good' : atsScore >= 40 ? 'Fair' : 'Poor';

  return {
    atsScore,
    scoreLabel,
    hardSkillMatch: Math.round(hardSkillScore),
    softSkillMatch: Math.round(softSkillScore),
    experienceMatch: Math.round(experienceScore),
    recommendations: generateRecommendations(missingKeywords, resumeText)
  };
}

router.post('/check-ats-score', authenticateToken, upload.single('resume'), async (req, res) => {
  try {
    const { jobDescription } = req.body;

    if (!req.file || !jobDescription) {
      return res.status(400).json({
        error: 'Resume file and job description are required'
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

    // Use AI-powered analysis, fallback to basic calculation if AI fails
    let result;
    try {
      result = await calculateATSScoreWithAI(resumeText, jobDescription);
    } catch (err) {
      console.warn('AI analysis failed, using fallback:', err.message);
      result = calculateFallbackScore(resumeText, jobDescription);
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
