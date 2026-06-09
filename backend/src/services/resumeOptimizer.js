const axios = require('axios');

const LM_STUDIO_URL = process.env.LM_STUDIO_URL || 'http://172.19.80.1:1234/v1';
const MODEL = 'qwen/qwen3.5-9b';

const OPTIMIZE_PROMPT = `Rewrite for ATS. Headers: SUMMARY, EXPERIENCE, SKILLS, EDUCATION. Action verbs: Led, Built, Optimized, Achieved. Metrics: %, numbers. Dates: MM/YYYY. Truthful only. Plain text.`;

async function optimizeResume(resumeText, additionalInfo = {}) {
  try {
    let userContent = OPTIMIZE_PROMPT + '\n\nResume to optimize:\n' + resumeText;

    if (Object.keys(additionalInfo).length > 0) {
      userContent += '\n\nAdd this information:\n';
      Object.entries(additionalInfo).forEach(([key, value]) => {
        if (value && value.trim()) {
          userContent += `${key}: ${value}\n`;
        }
      });
    }

    const response = await axios.post(`${LM_STUDIO_URL}/chat/completions`, {
      model: MODEL,
      messages: [
        {
          role: "user",
          content: userContent
        }
      ],
      temperature: 0.5,
      max_tokens: 1500
    });

    return response.data.choices[0].message.content;
  } catch (err) {
    console.error('Resume optimization error:', err.message);
    throw err;
  }
}

module.exports = {
  optimizeResume
};
