/**
 * LM Studio AI Client
 * Uses OpenAI-compatible API (http://172.19.80.1:1234/v1)
 * Designed for local LLMs running in LM Studio — no cloud dependencies
 */

async function callAI({ systemPrompt, userPrompt, maxTokens = 1024, temperature = 0.4, model }) {
  const baseURL = process.env.LM_STUDIO_URL || 'http://172.19.80.1:1234/v1';
  const selectedModel = model || process.env.LM_STUDIO_MODEL || 'mistral-7b-instruct-v0.3';

  // Fallback to mock if explicitly enabled
  const isMock = process.env.MOCK_AI === 'true';
  if (isMock) {
    console.log(`🤖 AI Client: Mock mode enabled`);
    await new Promise(resolve => setTimeout(resolve, 800));

    const promptLower = userPrompt.toLowerCase();
    let mockResponse = "I'm currently in mock mode. Switch MOCK_AI=false in .env to use real LM Studio models.";

    if (promptLower.includes('summary')) {
      mockResponse = "### Optimized Professional Summary (Mock)\n\nResults-driven professional with a strong foundation in software development and a passion for building scalable applications. Experienced in modern JavaScript frameworks and collaborative team environments.";
    } else if (promptLower.includes('linkedin') || promptLower.includes('about')) {
      mockResponse = "### LinkedIn About Section (Mock)\n\n🚀 Passionate Software Engineer dedicated to building impactful digital solutions. \n\nWith a focus on performance and user experience, I leverage React and Node.js to create seamless web applications. I thrive in collaborative environments and am always eager to learn new technologies.";
    }

    return { ok: true, error: null, data: mockResponse };
  }

  try {
    console.log(`📡 Calling LM Studio: ${selectedModel} at ${baseURL}`);

    const response = await fetch(`${baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: selectedModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        max_tokens: maxTokens,
        temperature: temperature,
        stream: false
      }),
      timeout: 60000 // 60 second timeout for inference
    });

    if (!response.ok) {
      const errText = await response.text();
      console.warn(`LM Studio error: ${response.status}`, errText);
      return {
        ok: false,
        error: `LM Studio API error ${response.status}. Check server is running at ${baseURL}`,
        data: null
      };
    }

    const json = await response.json();
    const content = json.choices?.[0]?.message?.content;

    if (!content) {
      return { ok: false, error: 'Empty LM Studio response', data: null };
    }

    console.log(`✅ LM Studio response received (${content.length} chars)`);
    return { ok: true, error: null, data: content };
  } catch (err) {
    console.error(`❌ LM Studio connection error: ${err.message}`);
    return {
      ok: false,
      error: `Cannot connect to LM Studio at ${baseURL}. Ensure LM Studio is running and accessible.`,
      data: null
    };
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
