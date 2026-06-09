const axios = require('axios');

const LM_STUDIO_URL = process.env.LM_STUDIO_URL || 'http://172.19.80.1:1234/v1';
const MODEL = 'deepseek-r1-0528-qwen3-8b';

const ANALYSIS_PROMPT = `Analyze this resume and provide:
1. Current ATS compatibility score (0-100)
2. Missing critical sections for ATS (e.g., professional summary, skills, experience dates)
3. Keyword optimization opportunities
4. Formatting issues that hurt ATS parsing
5. Specific improvements needed to reach 90+ score

Format as JSON:
{
  "currentScore": number,
  "missingSections": [list of missing elements],
  "keywordGaps": [list of missing high-value keywords],
  "formattingIssues": [list of issues],
  "improvementSteps": [list of specific actions]
}`;

const MISSING_FIELDS_PROMPT = `Based on this resume, identify missing information needed for optimal ATS and professional presentation.
Ask for:
- Professional summary (if missing)
- Technical skills (if vague)
- Certifications
- Years of experience
- Career goals
- Any other critical gaps

Format as JSON:
{
  "missingFields": [
    { "field": "fieldName", "description": "why it's important", "type": "text|textarea|select" }
  ]
}`;

const OPTIMIZE_RESUME_PROMPT = `Rewrite this resume for maximum ATS compatibility while keeping it professional and truthful.

Guidelines:
1. Use standard ATS-friendly section headers (PROFESSIONAL SUMMARY, EXPERIENCE, SKILLS, EDUCATION, CERTIFICATIONS)
2. Include relevant keywords throughout
3. Use action verbs for impact (Led, Implemented, Achieved, etc.)
4. Format dates consistently (MM/YYYY - MM/YYYY)
5. Keep bullet points clear and scannable
6. Ensure proper spacing and no special characters that confuse ATS
7. Highlight measurable achievements with numbers
8. Organize skills by category when possible

IMPORTANT: Only rewrite, do not invent or fabricate information.

If additional information is provided, incorporate it naturally.

Return the optimized resume in plain text format, ready to be converted to DOCX.`;

async function analyzeResume(resumeText) {
  try {
    const response = await axios.post(`${LM_STUDIO_URL}/chat/completions`, {
      model: MODEL,
      messages: [
        {
          role: "user",
          content: `${ANALYSIS_PROMPT}\n\nResume:\n${resumeText}`
        }
      ],
      temperature: 0.7,
      max_tokens: 2000
    });

    const content = response.data.choices[0].message.content;
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    return jsonMatch ? JSON.parse(jsonMatch[0]) : { currentScore: 45, error: "Could not parse analysis" };
  } catch (err) {
    console.error("Resume analysis error:", err.message);
    throw err;
  }
}

async function detectMissingFields(resumeText) {
  try {
    const response = await axios.post(`${LM_STUDIO_URL}/chat/completions`, {
      model: MODEL,
      messages: [
        {
          role: "user",
          content: `${MISSING_FIELDS_PROMPT}\n\nResume:\n${resumeText}`
        }
      ],
      temperature: 0.7,
      max_tokens: 1500
    });

    const content = response.data.choices[0].message.content;
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    return jsonMatch ? JSON.parse(jsonMatch[0]) : { missingFields: [] };
  } catch (err) {
    console.error("Missing fields detection error:", err.message);
    throw err;
  }
}

async function optimizeResume(resumeText, additionalInfo = {}) {
  try {
    let prompt = OPTIMIZE_RESUME_PROMPT;

    if (Object.keys(additionalInfo).length > 0) {
      prompt += `\n\nAdditional information to incorporate:\n`;
      Object.entries(additionalInfo).forEach(([key, value]) => {
        prompt += `${key}: ${value}\n`;
      });
    }

    const response = await axios.post(`${LM_STUDIO_URL}/chat/completions`, {
      model: MODEL,
      messages: [
        {
          role: "user",
          content: `${prompt}\n\nResume:\n${resumeText}`
        }
      ],
      temperature: 0.7,
      max_tokens: 3000
    });

    return response.data.choices[0].message.content;
  } catch (err) {
    console.error("Resume optimization error:", err.message);
    throw err;
  }
}

function calculateATSScore(optimizedResume) {
  let score = 50; // base score

  // Check for standard sections
  const sections = ['PROFESSIONAL SUMMARY', 'EXPERIENCE', 'SKILLS', 'EDUCATION'];
  sections.forEach(section => {
    if (optimizedResume.includes(section)) score += 5;
  });

  // Check for good formatting
  if (optimizedResume.includes('\n\n')) score += 5;
  if (/\d{1,2}\/\d{4}/.test(optimizedResume)) score += 5; // Date format

  // Check for action verbs
  const actionVerbs = ['Led', 'Implemented', 'Achieved', 'Managed', 'Developed', 'Designed', 'Created', 'Improved', 'Increased', 'Reduced', 'Optimized', 'Delivered'];
  const verbCount = actionVerbs.filter(verb => optimizedResume.includes(verb)).length;
  score += Math.min(verbCount * 2, 15);

  // Check for quantifiable results
  const numbers = (optimizedResume.match(/\d+%|\$\d+|[0-9]+ [a-z]+/gi) || []).length;
  score += Math.min(numbers * 1.5, 10);

  // Check for keyword density
  const keywords = ['software', 'development', 'management', 'leadership', 'technical', 'data', 'analysis', 'python', 'javascript', 'sql', 'aws', 'cloud'];
  const keywordMatches = keywords.filter(kw => optimizedResume.toLowerCase().includes(kw)).length;
  score += Math.min(keywordMatches * 1.5, 10);

  return Math.min(Math.round(score), 100);
}

module.exports = {
  analyzeResume,
  detectMissingFields,
  optimizeResume,
  calculateATSScore
};
