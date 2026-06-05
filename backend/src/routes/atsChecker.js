const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');

function extractKeywords(text) {
  const words = text.toLowerCase().match(/\b[a-z]+(?:\+\+|#)?\b/g) || [];
  const techKeywords = [
    'react', 'vue', 'angular', 'svelte', 'nextjs', 'nuxt',
    'nodejs', 'python', 'java', 'csharp', 'golang', 'rust',
    'typescript', 'javascript', 'sql', 'mongodb', 'postgresql',
    'docker', 'kubernetes', 'aws', 'azure', 'gcp',
    'git', 'cicd', 'jenkins', 'github', 'gitlab',
    'agile', 'scrum', 'rest', 'graphql', 'api',
    'html', 'css', 'tailwind', 'bootstrap', 'sass',
    'express', 'django', 'flask', 'spring', 'fastapi',
    'redis', 'elasticsearch', 'rabbitmq', 'kafka',
    'microservices', 'devops', 'testing', 'unittest'
  ];

  const found = new Set();
  techKeywords.forEach(keyword => {
    if (text.toLowerCase().includes(keyword)) {
      found.add(keyword);
    }
  });

  return Array.from(found);
}

function calculateATSScore(resumeText, jobDescription) {
  const resumeKeywords = extractKeywords(resumeText);
  const jobKeywords = extractKeywords(jobDescription);

  // Extract key sections from job description
  const hardSkillsMatch = jobKeywords.filter(kw => resumeKeywords.includes(kw));
  const missingKeywords = jobKeywords.filter(kw => !resumeKeywords.includes(kw));

  // Experience level matching
  const experienceLevelMatch = extractExperienceMatch(resumeText, jobDescription);

  // Calculate component scores
  const hardSkillScore = jobKeywords.length > 0
    ? (hardSkillsMatch.length / jobKeywords.length) * 100
    : 50;

  const softSkillScore = calculateSoftSkillMatch(resumeText, jobDescription);
  const experienceScore = experienceLevelMatch;

  // Weighted average: 50% hard skills, 30% soft skills, 20% experience
  const overallScore = Math.round(
    (hardSkillScore * 0.5) +
    (softSkillScore * 0.3) +
    (experienceScore * 0.2)
  );

  const scoreLabel = overallScore >= 80 ? 'Excellent'
    : overallScore >= 60 ? 'Good'
    : overallScore >= 40 ? 'Fair'
    : 'Poor';

  return {
    atsScore: overallScore,
    scoreLabel,
    matchedKeywords: hardSkillsMatch,
    missingKeywords: missingKeywords.slice(0, 10),
    hardSkillMatch: Math.round(hardSkillScore),
    softSkillMatch: Math.round(softSkillScore),
    experienceMatch: Math.round(experienceScore),
    recommendations: generateRecommendations(missingKeywords, resumeText)
  };
}

function extractExperienceMatch(resumeText, jobDescription) {
  const resumeLower = resumeText.toLowerCase();
  const jobLower = jobDescription.toLowerCase();

  // Extract years of experience from job description
  const jobExpMatch = jobDescription.match(/(\d+)\s*-?\s*(\d+)?\s*years?/i);
  const requiredYears = jobExpMatch ? parseInt(jobExpMatch[1]) : 0;

  // Extract years from resume
  const resumeExpMatch = resumeText.match(/(\d+)\s*\+?\s*years?/i);
  const yourYears = resumeExpMatch ? parseInt(resumeExpMatch[1]) : 0;

  // Calculate match (full match = 100%, short by 1 year = 80%, etc)
  if (requiredYears === 0) return 75;
  const match = Math.min((yourYears / requiredYears) * 100, 100);
  return Math.max(match, 30);
}

function calculateSoftSkillMatch(resumeText, jobDescription) {
  const softSkills = [
    'leadership', 'communication', 'teamwork', 'collaboration',
    'problem solving', 'analytical', 'creative', 'adaptable',
    'detail oriented', 'organized', 'proactive', 'mentor'
  ];

  const resumeLower = resumeText.toLowerCase();
  const jobLower = jobDescription.toLowerCase();

  const requiredSoftSkills = softSkills.filter(skill => jobLower.includes(skill));
  const matchedSoftSkills = requiredSoftSkills.filter(skill => resumeLower.includes(skill));

  if (requiredSoftSkills.length === 0) return 60;
  return (matchedSoftSkills.length / requiredSoftSkills.length) * 100;
}

function generateRecommendations(missingKeywords, resumeText) {
  const recommendations = [];

  if (missingKeywords.length > 0) {
    recommendations.push(`Add these missing skills to your resume: ${missingKeywords.slice(0, 3).join(', ')}`);
  }

  if (!resumeText.toLowerCase().includes('project')) {
    recommendations.push('Highlight specific projects and achievements, not just responsibilities');
  }

  if (!resumeText.toLowerCase().includes('impact') && !resumeText.toLowerCase().includes('improved')) {
    recommendations.push('Use action verbs and quantify your impact (e.g., "improved performance by 30%")');
  }

  if (resumeText.length < 500) {
    recommendations.push('Expand your resume with more details about your experience');
  }

  return recommendations.slice(0, 4);
}

router.post('/check-ats-score', authenticateToken, (req, res) => {
  try {
    const { resume, jobDescription } = req.body;

    if (!resume || !jobDescription) {
      return res.status(400).json({
        error: 'Resume and job description are required'
      });
    }

    const result = calculateATSScore(resume, jobDescription);

    res.json({
      success: true,
      data: result
    });
  } catch (err) {
    console.error('ATS check error:', err);
    res.status(500).json({
      error: 'Failed to check ATS score'
    });
  }
});

module.exports = router;
