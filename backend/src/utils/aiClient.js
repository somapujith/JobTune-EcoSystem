/**
 * LM Studio AI Client
 * Uses OpenAI-compatible API (http://172.19.80.1:1234/v1)
 * Designed for local LLMs running in LM Studio — no cloud dependencies
 */

const REASONING_MODEL_PATTERN = /reasoning|qwq|deepseek-r1|r1-distill/i;

function isReasoningModel(model) {
  return REASONING_MODEL_PATTERN.test(model || '');
}

/** Prefer a fast instruct model for structured JSON — reasoning models blow the context window. */
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

async function callAI({ systemPrompt, userPrompt, maxTokens = 1024, temperature = 0.4, model, structuredJson = false }) {
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

  const isMock = process.env.MOCK_AI === 'true';
  if (isMock) {
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
    let response = await fetch(`${baseURL}/chat/completions`, {
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
        max_tokens: effectiveMaxTokens,
        temperature: temperature,
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

      // Self-healing: if "system" role is rejected, retry by merging prompts into a single user message
      if (response.status === 400 && (errText.toLowerCase().includes('role') || errText.toLowerCase().includes('system') || errText.toLowerCase().includes('template'))) {
        console.log(`⚠️ LM Studio system role rejected. Retrying with merged user prompt...`);
        const mergedPrompt = `[System Instructions]\n${systemPrompt}\n\n[User Input]\n${userPrompt}`;
        response = await fetch(`${baseURL}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: selectedModel,
            messages: [
              { role: 'user', content: mergedPrompt }
            ],
            max_tokens: effectiveMaxTokens,
            temperature: temperature,
            stream: false
          }),
          signal: AbortSignal.timeout(120000)
        });

        if (!response.ok) {
          const retryErrText = await response.text();
          console.warn(`LM Studio retry error: ${response.status}`, retryErrText);
          return {
            ok: false,
            error: `LM Studio API retry error ${response.status}.`,
            data: null
          };
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

module.exports = { callAI, extractJSON, isReasoningModel, modelForStructuredJson };
