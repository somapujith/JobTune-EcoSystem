/**
 * Shared AI Client for all OpenRouter API calls.
 * Provides a single fetch wrapper with built-in fallback logic.
 */

async function callAI({ systemPrompt, userPrompt, maxTokens = 1024, temperature = 0.4 }) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const model  = process.env.OPENROUTER_MODEL || 'google/gemma-3-4b-it:free';

  if (!apiKey) {
    return { ok: false, error: 'AI not configured', data: null };
  }

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type':  'application/json',
        'HTTP-Referer':  'http://localhost:3000',
        'X-Title':       'JobTube Eco System',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user',   content: userPrompt },
        ],
        max_tokens: maxTokens,
        temperature,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.warn('OpenRouter error:', response.status, errText);
      return { ok: false, error: `API error ${response.status}`, data: null };
    }

    const json = await response.json();
    const content = json.choices?.[0]?.message?.content;

    if (!content) {
      return { ok: false, error: 'Empty AI response', data: null };
    }

    return { ok: true, error: null, data: content };
  } catch (err) {
    console.error('AI Client fetch error:', err.message);
    return { ok: false, error: err.message, data: null };
  }
}

/**
 * Attempt to extract a JSON object/array from an AI text response.
 * The AI often wraps JSON in markdown code fences.
 */
function extractJSON(text) {
  // Try to find ```json ... ``` blocks first
  const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  const jsonStr = fenceMatch ? fenceMatch[1].trim() : text.trim();

  try {
    return JSON.parse(jsonStr);
  } catch {
    // Last resort: find first { or [ and parse from there
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
