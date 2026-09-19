'use strict';

/**
 * Cover letter generator.  Worker port of backend/src/routes/coverLetter.js.
 * Mounted at /api/jobs, third of the six /api/jobs routers.
 *
 *   POST /api/jobs/generate-cover-letter   authenticateToken, requirePlan(2)
 *
 * AI goes through the injected `services.aiClient`; the model names come from config.vars
 * (LM_STUDIO_MODEL_JOB, then LM_STUDIO_MODEL_RESUME) instead of the process environment.
 * Preserved quirks: the whole handler body, including reading the JSON body, is inside the try block
 * (failure answers 500 {"error":"Failed to generate cover letter"}); an omitted `experience` is
 * interpolated as the text "undefined" in the prompt and the fallback letter.
 */
const { createRouter } = require('../lib/routes');
const { authenticateToken } = require('../middleware/auth');
const { requirePlan } = require('../middleware/requirePlan');
const { getServices, getConfig } = require('../lib/context');
const { getBody } = require('../lib/http');

const router = createRouter();

// eslint-disable-next-line no-unused-vars
function generateFallbackLetter(companyName, position, experience, tone) {
  const toneMap = {
    formal: 'professionally',
    friendly: 'enthusiastically',
    confident: 'confidently'
  };

  // eslint-disable-next-line no-unused-vars
  const toneWord = toneMap[tone] || 'professionally';

  return `Dear Hiring Manager,

I am writing to express my strong interest in the ${position} position at ${companyName}. With my ${experience}, I am confident in my ability to contribute meaningfully to your team and drive success in this role.

Throughout my career, I have developed a deep expertise in solving complex problems, collaborating across teams, and delivering high-impact results. I am particularly drawn to ${companyName}'s mission and culture, and I am excited about the opportunity to bring my skills and passion to your organization.

I would welcome the opportunity to discuss how my background, skills, and enthusiasm can contribute to your team. Thank you for considering my application.

Sincerely,
[Your Name]`;
}

router.post('/generate-cover-letter', authenticateToken, requirePlan(2), async (c) => {
  try {
    const {
      jobDescription,
      companyName,
      position,
      yourName,
      experience,
      tone = 'professional'
    } = getBody(c);

    if (!jobDescription || !companyName || !position || !yourName) {
      return c.json({
        error: 'Company name, position, job description, and your name are required'
      }, 400);
    }

    const systemPrompt = `You are an elite cover letter strategist who has helped candidates land offers at Google, Amazon, McKinsey, and fast-growing startups. You write cover letters that hiring managers actually read.

COVER LETTER RULES:
- NEVER start with "I am writing to express my interest" or any generic opener — start with a compelling hook (a relevant achievement, a shared value, or a specific reason this company stands out)
- MIRROR the company's tone — if the job posting is casual and startup-y, write conversationally; if it's corporate, be polished
- MATCH each paragraph to specific requirements from the job description
- QUANTIFY achievements that directly address what the role needs ("Reduced API latency by 40%" not "improved performance")
- SHOW personality — the candidate should sound like a real human, not a template
- Keep it under 300 words — hiring managers skim, so every sentence must earn its place
- End with a confident, specific call to action (not "I look forward to hearing from you")

Write the letter directly as plain text — no markdown, no formatting, no subject line.`;

    const userPrompt = `Write a ${tone} cover letter for:
- Candidate name: ${yourName}
- Company: ${companyName}
- Position: ${position}
- My background: ${experience}
- Job requirements: ${jobDescription.substring(0, 500)}

Write the cover letter directly (no formatting, no markdown, just the letter text).
Make it personalized, compelling, and 3-4 paragraphs.`;

    const { vars } = getConfig(c);
    const aiResult = await getServices(c).aiClient.callAI({
      systemPrompt,
      userPrompt,
      maxTokens: 800,
      temperature: 0.7,
      model: vars.LM_STUDIO_MODEL_JOB || vars.LM_STUDIO_MODEL_RESUME
    });

    let letterText;
    if (aiResult.ok && aiResult.data) {
      letterText = aiResult.data.trim();
    } else {
      letterText = generateFallbackLetter(companyName, position, experience, tone);
    }

    return c.json({
      success: true,
      data: {
        letterText,
        generatedAt: new Date().toISOString()
      }
    });
  } catch (err) {
    console.error('Cover letter generation error:', err);
    return c.json({
      error: 'Failed to generate cover letter'
    }, 500);
  }
});

module.exports = router;
