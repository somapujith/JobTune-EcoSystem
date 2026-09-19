/**
 * AI Client — Gemini Flash 2.5 + LM Studio (fallback)
 *
 * When AI_PROVIDER=gemini and GEMINI_API_KEY is set, all callAI() requests
 * go through the Google Gemini REST API. Otherwise falls back to LM Studio.
 *
 * Features:
 * - In-memory LRU cache (1h TTL, 500 entries) to avoid duplicate API calls
 * - Retry with exponential backoff (up to 2 retries) for transient failures
 */

const aiCache = require('./aiCache');

const REASONING_MODEL_PATTERN = /reasoning|qwq|deepseek-r1|r1-distill/i;

function isReasoningModel(model) {
  return REASONING_MODEL_PATTERN.test(model || '');
}

function getProvider() {
  const provider = (process.env.AI_PROVIDER || '').toLowerCase();
  if (provider === 'anthropic' && process.env.ANTHROPIC_API_KEY) return 'anthropic';
  if (provider === 'gemini' && process.env.GEMINI_API_KEY) return 'gemini';
  return 'lmstudio';
}

function modelForStructuredJson(preferredModel) {
  if (preferredModel && !isReasoningModel(preferredModel)) {
    return preferredModel;
  }
  return (
    process.env.LM_STUDIO_MODEL_RESUME
    || process.env.LM_STUDIO_MODEL_JOB
    || process.env.LM_STUDIO_MODEL
    || 'mistralai/mistral-7b-instruct-v0.3'
  );
}

// ── Gemini provider ──

async function callGemini({ systemPrompt, userPrompt, maxTokens = 1024, temperature = 0.4 }) {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const body = {
    contents: [
      { role: 'user', parts: [{ text: userPrompt }] }
    ],
    systemInstruction: {
      parts: [{ text: systemPrompt }]
    },
    generationConfig: {
      temperature,
      maxOutputTokens: maxTokens,
      // gemini-2.5-flash "thinks" by default and thinking tokens count against maxOutputTokens: at this app's small
      // budgets (e.g. 1000) the visible answer was cut off mid-JSON (finishReason MAX_TOKENS), every JSON-returning
      // route then fell back to its canned response, and nothing was logged. Disable thinking for the flash models
      // (the Pro model cannot disable it). Kept identical in src/worker/services/aiClient.js.
      ...(/^gemini-2\.5-flash/.test(model) ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
    }
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60000)
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`❌ Gemini API error ${response.status}:`, errText);
      return { ok: false, error: `Gemini API error ${response.status}: ${errText}`, data: null };
    }

    const json = await response.json();
    const content = json.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!content) {
      return { ok: false, error: 'Empty Gemini response', data: null };
    }

    return { ok: true, error: null, data: content };
  } catch (err) {
    const message = err.message || String(err);
    console.error(`❌ Gemini connection error: ${message}`);
    return { ok: false, error: `Gemini error: ${message}`, data: null };
  }
}

// ── Anthropic Claude provider ──

async function callAnthropic({ systemPrompt, userPrompt, maxTokens = 1024, temperature = 0.4 }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';
  const url = 'https://api.anthropic.com/v1/messages';

  const body = {
    model,
    max_tokens: maxTokens,
    temperature,
    system: systemPrompt,
    messages: [
      { role: 'user', content: userPrompt }
    ],
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(90000),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`❌ Anthropic API error ${response.status}:`, errText);
      return { ok: false, error: `Anthropic API error ${response.status}: ${errText}`, data: null };
    }

    const json = await response.json();
    const content = json.content?.[0]?.text;

    if (!content) {
      return { ok: false, error: 'Empty Anthropic response', data: null };
    }

    return { ok: true, error: null, data: content };
  } catch (err) {
    const message = err.message || String(err);
    console.error(`❌ Anthropic connection error: ${message}`);
    return { ok: false, error: `Anthropic error: ${message}`, data: null };
  }
}

// ── LM Studio provider ──

async function callLMStudio({ systemPrompt, userPrompt, maxTokens = 1024, temperature = 0.4, model, structuredJson = false }) {
  const baseURL = process.env.LM_STUDIO_URL || 'http://172.19.80.1:1234/v1';
  let selectedModel = model || process.env.LM_STUDIO_MODEL || 'mistral-7b-instruct-v0.3';

  if (structuredJson && isReasoningModel(selectedModel)) {
    const fallback = modelForStructuredJson(null);
    console.warn(`⚠️ Reasoning model "${selectedModel}" is a poor fit for JSON output. Using "${fallback}" instead.`);
    selectedModel = fallback;
  }

  const effectiveMaxTokens = structuredJson
    ? Math.min(maxTokens, 1200)
    : maxTokens;

  try {
    let response = await fetch(`${baseURL}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: selectedModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        max_tokens: effectiveMaxTokens,
        temperature,
        stream: false
      }),
      signal: AbortSignal.timeout(120000)
    });

    if (!response.ok) {
      const errText = await response.text();
      console.warn(`LM Studio error: ${response.status}`, errText);

      if (/context size|context length|token limit|channel error/i.test(errText)) {
        return {
          ok: false,
          error: 'LM Studio context limit exceeded. Try a smaller prompt or use a non-reasoning model.',
          data: null
        };
      }

      if (response.status === 400 && (errText.toLowerCase().includes('role') || errText.toLowerCase().includes('system') || errText.toLowerCase().includes('template'))) {
        console.log(`⚠️ LM Studio system role rejected. Retrying with merged user prompt...`);
        const mergedPrompt = `[System Instructions]\n${systemPrompt}\n\n[User Input]\n${userPrompt}`;
        response = await fetch(`${baseURL}/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: selectedModel,
            messages: [{ role: 'user', content: mergedPrompt }],
            max_tokens: effectiveMaxTokens,
            temperature,
            stream: false
          }),
          signal: AbortSignal.timeout(120000)
        });

        if (!response.ok) {
          const retryErrText = await response.text();
          console.warn(`LM Studio retry error: ${response.status}`, retryErrText);
          return { ok: false, error: `LM Studio API retry error ${response.status}.`, data: null };
        }
      } else {
        return {
          ok: false,
          error: `LM Studio API error ${response.status}. Check server is running at ${baseURL}`,
          data: null
        };
      }
    }

    const json = await response.json();
    const content = json.choices?.[0]?.message?.content;

    if (!content) {
      return { ok: false, error: 'Empty LM Studio response', data: null };
    }

    return { ok: true, error: null, data: content };
  } catch (err) {
    const message = err.message || String(err);
    console.error(`❌ LM Studio connection error: ${message}`);
    const contextExceeded = /context size|context length|token limit|channel error/i.test(message);
    return {
      ok: false,
      error: contextExceeded
        ? 'LM Studio context limit exceeded. Try a smaller prompt or use a non-reasoning model.'
        : `Cannot connect to LM Studio at ${baseURL}. Ensure LM Studio is running and accessible.`,
      data: null
    };
  }
}

// ── Main dispatcher ──

async function callAI({ systemPrompt, userPrompt, maxTokens = 1024, temperature = 0.4, model, structuredJson = false, cache = true }) {
  const isMock = process.env.MOCK_AI === 'true';
  if (isMock) {
    await new Promise(resolve => setTimeout(resolve, 800));

    const promptLower = userPrompt.toLowerCase();
    let mockResponse = "I'm currently in mock mode. Switch MOCK_AI=false in .env to use real AI models.";

    if (promptLower.includes('summary')) {
      mockResponse = "### Optimized Professional Summary (Mock)\n\nResults-driven professional with a strong foundation in software development and a passion for building scalable applications. Experienced in modern JavaScript frameworks and collaborative team environments.";
    } else if (promptLower.includes('linkedin') || promptLower.includes('about')) {
      mockResponse = "### LinkedIn About Section (Mock)\n\n🚀 Passionate Software Engineer dedicated to building impactful digital solutions. \n\nWith a focus on performance and user experience, I leverage React and Node.js to create seamless web applications. I thrive in collaborative environments and am always eager to learn new technologies.";
    }

    return { ok: true, error: null, data: mockResponse };
  }

  // Check cache first (skip for non-cacheable calls)
  if (cache) {
    const cached = aiCache.get(systemPrompt, userPrompt, maxTokens, temperature);
    if (cached) {
      return { ok: true, error: null, data: cached, cached: true };
    }
  }

  const provider = getProvider();
  let result;
  let lastError;

  // Retry with exponential backoff (max 2 retries)
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) {
      const delay = Math.min(1000 * Math.pow(2, attempt - 1), 4000);
      await new Promise(r => setTimeout(r, delay));
    }

    if (provider === 'anthropic') {
      result = await callAnthropic({ systemPrompt, userPrompt, maxTokens, temperature });
    } else if (provider === 'gemini') {
      result = await callGemini({ systemPrompt, userPrompt, maxTokens, temperature });
    } else {
      result = await callLMStudio({ systemPrompt, userPrompt, maxTokens, temperature, model, structuredJson });
    }

    if (result.ok) {
      // Cache successful response
      if (cache && result.data) {
        aiCache.set(systemPrompt, userPrompt, maxTokens, temperature, result.data);
      }
      return result;
    }

    lastError = result.error;
    // Don't retry on 4xx errors (bad request, not transient)
    if (result.error && /400|401|403|422/.test(result.error)) break;
  }

  return { ok: false, error: lastError || 'AI call failed after retries', data: null };
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

module.exports = { callAI, extractJSON, isReasoningModel, modelForStructuredJson, getAICacheStats: () => aiCache.getStats() };
