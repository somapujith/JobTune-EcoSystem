const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { requirePlan } = require('../middleware/requirePlan');
const { callAI } = require('../utils/aiClient');

function generateFallbackLetter(companyName, position, experience, tone) {
  const toneMap = {
    formal: 'professionally',
    friendly: 'enthusiastically',
    confident: 'confidently'
  };

  const toneWord = toneMap[tone] || 'professionally';

  return `Dear Hiring Manager,

I am writing to express my strong interest in the ${position} position at ${companyName}. With my ${experience}, I am confident in my ability to contribute meaningfully to your team and drive success in this role.

Throughout my career, I have developed a deep expertise in solving complex problems, collaborating across teams, and delivering high-impact results. I am particularly drawn to ${companyName}'s mission and culture, and I am excited about the opportunity to bring my skills and passion to your organization.

I would welcome the opportunity to discuss how my background, skills, and enthusiasm can contribute to your team. Thank you for considering my application.

Sincerely,
[Your Name]`;
}

router.post('/generate-cover-letter', authenticateToken, requirePlan(2), async (req, res) => {
  try {
    const {
      jobDescription,
      companyName,
      position,
      yourName,
      experience,
      tone = 'professional'
    } = req.body;

    if (!jobDescription || !companyName || !position || !yourName) {
      return res.status(400).json({
        error: 'Company name, position, job description, and your name are required'
      });
    }

    const systemPrompt = `You are an expert career coach writing personalized cover letters.
Write professional, compelling cover letters that are 3-4 paragraphs long.
Match the tone requested. Be specific and personalized to the job description.`;

    const userPrompt = `Write a ${tone} cover letter for:
- Candidate name: ${yourName}
- Company: ${companyName}
- Position: ${position}
- My background: ${experience}
- Job requirements: ${jobDescription.substring(0, 500)}

Write the cover letter directly (no formatting, no markdown, just the letter text).
Make it personalized, compelling, and 3-4 paragraphs.`;

    const aiResult = await callAI({
      systemPrompt,
      userPrompt,
      maxTokens: 800,
      temperature: 0.7,
      model: process.env.LM_STUDIO_MODEL_JOB || process.env.LM_STUDIO_MODEL_RESUME
    });

    let letterText;
    if (aiResult.ok && aiResult.data) {
      letterText = aiResult.data.trim();
    } else {
      letterText = generateFallbackLetter(companyName, position, experience, tone);
    }

    res.json({
      success: true,
      data: {
        letterText,
        generatedAt: new Date().toISOString()
      }
    });
  } catch (err) {
    console.error('Cover letter generation error:', err);
    res.status(500).json({
      error: 'Failed to generate cover letter'
    });
  }
});

module.exports = router;
