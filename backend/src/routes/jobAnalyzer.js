const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { requirePlan } = require('../middleware/requirePlan');
const { callAI } = require('../utils/aiClient');

function generateFallbackAnalysis(jobDescription) {
  const keywords = [];
  const skills = [];
  const responsibilities = [];

  const techStack = [
    'React', 'Vue', 'Angular', 'Node.js', 'Python', 'Java',
    'TypeScript', 'SQL', 'MongoDB', 'Docker', 'Kubernetes',
    'AWS', 'Azure', 'REST', 'GraphQL', 'Git'
  ];

  techStack.forEach(tech => {
    if (jobDescription.toLowerCase().includes(tech.toLowerCase())) {
      skills.push(tech);
    }
  });

  const seniority = jobDescription.match(/senior|lead|principal/i) ? 'Senior'
    : jobDescription.match(/mid|intermediate/i) ? 'Mid'
    : 'Junior';

  const expMatch = jobDescription.match(/(\d+)\s*-?\s*(\d+)?\s*years?/i);
  const experienceLevel = expMatch ? `${expMatch[0]}` : '3-5 years';

  const respItems = jobDescription.match(/[•-]\s*([^•\n]+)/g);
  if (respItems) {
    respItems.slice(0, 5).forEach(item => {
      responsibilities.push(item.replace(/[•-]\s*/, '').trim());
    });
  }

  return {
    requiredSkills: skills.slice(0, 8),
    niceToHaveSkills: skills.slice(8, 12),
    experienceLevel,
    seniority,
    keywords: [...new Set([...skills, seniority, 'Problem Solving'])],
    responsibilities: responsibilities.length > 0 ? responsibilities : ['Lead technical projects', 'Collaborate with team', 'Mentor junior developers'],
    salaryRange: 'Not specified'
  };
}

router.post('/analyze-description', authenticateToken, requirePlan(3), async (req, res) => {
  try {
    const { jobDescription } = req.body;

    if (!jobDescription || jobDescription.trim().length < 50) {
      return res.status(400).json({
        error: 'Job description must be at least 50 characters'
      });
    }

    const systemPrompt = `You are a job analysis expert. Extract structured information from job postings.
Return ONLY valid JSON, no markdown, no extra text.`;

    const userPrompt = `Analyze this job posting and extract key information:

${jobDescription}

Return ONLY this JSON structure (valid JSON only, no markdown):
{
  "requiredSkills": ["Skill1", "Skill2"],
  "niceToHaveSkills": ["Skill3"],
  "experienceLevel": "3-5 years",
  "seniority": "Mid",
  "keywords": ["keyword1", "keyword2"],
  "responsibilities": ["Responsibility 1", "Responsibility 2"],
  "salaryRange": "salary or 'Not specified'"
}`;

    const aiResult = await callAI({
      systemPrompt,
      userPrompt,
      maxTokens: 500,
      temperature: 0.3,
      model: process.env.LM_STUDIO_MODEL_JOB || process.env.LM_STUDIO_MODEL_SKILLS
    });

    let analysis;
    if (aiResult.ok && aiResult.data) {
      try {
        analysis = JSON.parse(aiResult.data);
      } catch (e) {
        console.warn('Failed to parse LLM response, using fallback');
        analysis = generateFallbackAnalysis(jobDescription);
      }
    } else {
      analysis = generateFallbackAnalysis(jobDescription);
    }

    // Ensure all required fields exist
    analysis = {
      requiredSkills: analysis.requiredSkills || [],
      niceToHaveSkills: analysis.niceToHaveSkills || [],
      experienceLevel: analysis.experienceLevel || '3-5 years',
      seniority: analysis.seniority || 'Mid',
      keywords: analysis.keywords || [],
      responsibilities: analysis.responsibilities || [],
      salaryRange: analysis.salaryRange || 'Not specified'
    };

    res.json({
      success: true,
      data: analysis
    });
  } catch (err) {
    console.error('Job analysis error:', err);
    res.status(500).json({
      error: 'Failed to analyze job description'
    });
  }
});

module.exports = router;
