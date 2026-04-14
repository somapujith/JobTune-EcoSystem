/**
 * Shared AI Client for all Gemini API calls.
 * Provides a single fetch wrapper with built-in fallback logic.
 */

async function callAI({ systemPrompt, userPrompt, maxTokens = 1024, temperature = 0.4, model: modelOverride }) {
  const apiKey = process.env.GEMINI_API_KEY;
  const model  = modelOverride || process.env.GEMINI_MODEL || 'gemini-2.0-flash';
  const isMock = process.env.MOCK_AI === 'true' || !apiKey || (apiKey && apiKey.includes('your_'));

  if (isMock) {
    console.log(`🤖 AI Client status: isMock=${isMock}, MOCK_AI_ENV="${process.env.MOCK_AI}", KeyExists=${!!apiKey}`);
    await new Promise(resolve => setTimeout(resolve, 800));
    
    const promptLower = userPrompt.toLowerCase();
    let mockResponse = "I'm currently in development mode. To enable real Gemini AI responses, please provide a valid GEMINI_API_KEY in the .env file.";
    
    if (promptLower.includes('summary')) {
      mockResponse = "### Optimized Professional Summary (Simulated Gemini)\n\nResults-driven professional with a strong foundation in software development and a passion for building scalable applications. Experienced in modern JavaScript frameworks and collaborative team environments.";
    } else if (promptLower.includes('linkedin') || promptLower.includes('about')) {
      mockResponse = "### LinkedIn About Section (Simulated Gemini)\n\n🚀 Passionate Software Engineer dedicated to building impactful digital solutions. \n\nWith a focus on performance and user experience, I leverage React and Node.js to create seamless web applications. I thrive in collaborative environments and am always eager to learn new technologies. Let's connect and build something great together!";
    }

    return { ok: true, error: null, data: mockResponse };
  }

  try {
    const url = `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${apiKey}`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [{ text: `${systemPrompt}\n\nUser Request: ${userPrompt}` }]
          }
        ],
        generationConfig: {
          maxOutputTokens: maxTokens,
          temperature: temperature,
        }
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.warn('Gemini error:', response.status, errText);
      return { ok: false, error: `Gemini API error ${response.status}`, data: null };
    }

    const json = await response.json();
    const content = json.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!content) {
      return { ok: false, error: 'Empty Gemini response', data: null };
    }

    return { ok: true, error: null, data: content };
  } catch (err) {
    console.error('Gemini Client fetch error:', err.message);
    return { ok: false, error: err.message, data: null };
  }
}

/**
 * Attempt to extract a JSON object/array from an AI text response.
 */
function extractJSON(text) {
  const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  const jsonStr = fenceMatch ? fenceMatch[1].trim() : text.trim();

  try {
    return JSON.parse(jsonStr);
  } catch {
    const start = jsonStr.search(/[{[]/);
    if (start === -1) return null;
    const end = jsonStr.lastIndexOf(jsonStr[start] === '{' ? '}' : ']');
    if (end === -1) return null;
    try {
      return JSON.parse(jsonStr.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}

module.exports = { callAI, extractJSON };
