'use strict';

/**
 * Job description analyzer.  Worker port of backend/src/routes/jobAnalyzer.js.
 * Mounted at /api/jobs, second of the six /api/jobs routers.
 *
 *   POST /api/jobs/analyze-description   authenticateToken, requirePlan(3)
 *
 * AI goes through the injected `services.aiClient`; the model names come from config.vars
 * (LM_STUDIO_MODEL_JOB, then LM_STUDIO_MODEL_SKILLS) instead of the process environment.
 * Preserved quirk: the whole handler body, including reading the JSON body, is inside the try block, so any
 * failure (missing body, non-string description, malformed AI JSON that parses to null) answers
 * 500 {"error":"Failed to analyze job description"}.
 */
const { createRouter } = require('../lib/routes');
const { authenticateToken } = require('../middleware/auth');
const { requirePlan } = require('../middleware/requirePlan');
const { getServices, getConfig } = require('../lib/context');
const { getBody } = require('../lib/http');

const router = createRouter();

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

router.post('/analyze-description', authenticateToken, requirePlan(3), async (c) => {
  try {
    const { jobDescription } = getBody(c);

    if (!jobDescription || jobDescription.trim().length < 50) {
      return c.json({
        error: 'Job description must be at least 50 characters'
      }, 400);
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

    const { vars } = getConfig(c);
    const aiResult = await getServices(c).aiClient.callAI({
      systemPrompt,
      userPrompt,
      maxTokens: 500,
      temperature: 0.3,
      model: vars.LM_STUDIO_MODEL_JOB || vars.LM_STUDIO_MODEL_SKILLS
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

    return c.json({
      success: true,
      data: analysis
    });
  } catch (err) {
    console.error('Job analysis error:', err);
    return c.json({
      error: 'Failed to analyze job description'
    }, 500);
  }
});

module.exports = router;
