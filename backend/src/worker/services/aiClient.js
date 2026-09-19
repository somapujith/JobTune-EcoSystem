'use strict';

/**
 * AI client: Anthropic / Gemini / LM Studio behind one dispatcher   (port of utils/aiClient.js, T2.3)
 *
 * Public API, identical names and signatures to the Express module's exports, exposed as
 * `getServices(c).aiClient.<fn>` (23 route/service files depend on it):
 *   callAI({ systemPrompt, userPrompt, maxTokens = 1024, temperature = 0.4, model, structuredJson = false, cache = true })
 *       -> Promise<{ ok, error, data, cached? }>      (never throws for provider failures)
 *   extractJSON(text) -> object | array | null
 *   isReasoningModel(model) -> boolean
 *   modelForStructuredJson(preferredModel) -> string
 *   getAICacheStats() -> { size, hits, misses, hitRate }
 * Methods are closures, so destructuring them is safe.
 *
 * What is preserved exactly (no behaviour change, ADR 4.3):
 *   - provider selection: AI_PROVIDER=anthropic + ANTHROPIC_API_KEY, or =gemini + GEMINI_API_KEY, else LM Studio
 *   - the three provider request/response shapes, timeouts (Gemini 60 s, Anthropic 90 s, LM Studio 120 s),
 *     error strings and console logging
 *   - MOCK_AI === 'true': 800 ms delay, canned responses keyed on the prompt, provider and cache never touched
 *   - cache lookup before, and cache store after, a successful call; the cache key is the aiCache key
 *     (system, user, maxTokens, temperature; NOT model or provider), success stores only a truthy `data`
 *   - up to 3 attempts, delay min(1000 * 2^(attempt - 1), 4000) ms before a retry, and the quirk that an
 *     error text containing 400, 401, 403 or 422 anywhere stops retrying
 *   - LM Studio: reasoning-model swap for structuredJson, 1200 max-token cap, merged-prompt retry when a 400
 *     mentions role/system/template, context-limit messages
 * Config comes ONLY from the injected `config` (config.vars.*); every read happens at call time.
 *
 * Platform notes:
 *   - Outbound HTTP is the platform's global `fetch`, looked up at call time (so a test can stub globalThis.fetch).
 *     It is called as a bare function on purpose: workerd throws "Illegal invocation" when fetch is invoked as a
 *     method of another object.
 *   - The Express defaults for LM Studio point at a private LAN address. That default is kept; a Worker cannot
 *     reach a private address, so without LM_STUDIO_URL (and with no provider key) calls end with the normal
 *     "Cannot connect to LM Studio" result, exactly what an unreachable server produced on Express.
 *   - The 800 ms mock delay and the retry back-off are awaited inside the request, which Workers allows
 *     (nothing here runs after the response).
 *   - The response cache is per isolate (see services/aiCache.js): expect far fewer cache hits than on Render.
 */
const { getIsolateAiCache } = require('./aiCache');

const REASONING_MODEL_PATTERN = /reasoning|qwq|deepseek-r1|r1-distill/i;

function isReasoningModel(model) {
  return REASONING_MODEL_PATTERN.test(model || '');
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

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * @param {{ config: { vars?: Record<string, string|undefined> }, aiCache?: object, sleep?: (ms: number) => Promise<void> }} deps
 *   config  the injected frozen config (only `config.vars` is read)
 *   aiCache defaults to the isolate-level cache; the registry passes services.aiCache
 *   sleep   test seam for the mock delay / retry back-off; defaults to a setTimeout promise
 */
function createAiClient({ config, aiCache = getIsolateAiCache(), sleep = defaultSleep } = {}) {
  const vars = () => (config && config.vars) || {};

  function getProvider() {
    const v = vars();
    const provider = (v.AI_PROVIDER || '').toLowerCase();
    if (provider === 'anthropic' && v.ANTHROPIC_API_KEY) return 'anthropic';
    if (provider === 'gemini' && v.GEMINI_API_KEY) return 'gemini';
    return 'lmstudio';
  }

  function modelForStructuredJson(preferredModel) {
    if (preferredModel && !isReasoningModel(preferredModel)) {
      return preferredModel;
    }
    const v = vars();
    return (
      v.LM_STUDIO_MODEL_RESUME
      || v.LM_STUDIO_MODEL_JOB
      || v.LM_STUDIO_MODEL
      || 'mistralai/mistral-7b-instruct-v0.3'
    );
  }

  // ── Gemini provider ──

  async function callGemini({ systemPrompt, userPrompt, maxTokens = 1024, temperature = 0.4 }) {
    const v = vars();
    const apiKey = v.GEMINI_API_KEY;
    const model = v.GEMINI_MODEL || 'gemini-2.5-flash';
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
    const v = vars();
    const apiKey = v.ANTHROPIC_API_KEY;
    const model = v.ANTHROPIC_MODEL || 'claude-sonnet-4-6';
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
    const v = vars();
    const baseURL = v.LM_STUDIO_URL || 'http://172.19.80.1:1234/v1';
    let selectedModel = model || v.LM_STUDIO_MODEL || 'mistral-7b-instruct-v0.3';

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
    const isMock = vars().MOCK_AI === 'true';
    if (isMock) {
      await sleep(800);

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
        await sleep(delay);
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

  return {
    callAI,
    extractJSON,
    isReasoningModel,
    modelForStructuredJson,
    getAICacheStats: () => aiCache.getStats(),
  };
}

module.exports = { createAiClient, extractJSON, isReasoningModel };
