'use strict';

/**
 * Helpers for the infra slice tests. Everything is synthetic: fake API keys, fetch is always a stub,
 * nothing here reaches a network, a database or a real secret.
 */

/** A minimal fetch Response stand-in (the parts aiClient / embeddings read). */
function fakeResponse({ status = 200, json, text } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => {
      if (json instanceof Error) throw json;
      return json;
    },
    text: async () => (text !== undefined ? text : typeof json === 'string' ? json : JSON.stringify(json ?? '')),
  };
}

const geminiOk = (text) => fakeResponse({ json: { candidates: [{ content: { parts: [{ text }] } }] } });
const anthropicOk = (text) => fakeResponse({ json: { content: [{ text }] } });
const lmOk = (text) => fakeResponse({ json: { choices: [{ message: { content: text } }] } });

/**
 * Install a global fetch stub that answers from `queue` (functions, Errors or Response-likes, in order; the
 * last entry repeats). Returns the jest mock; call mock.restore() to put the original back.
 */
function stubFetch(queue) {
  const original = global.fetch;
  let i = 0;
  const mock = jest.fn(async () => {
    const item = queue[Math.min(i, queue.length - 1)];
    i += 1;
    if (typeof item === 'function') return item();
    if (item instanceof Error) throw item;
    return item;
  });
  global.fetch = mock;
  mock.restore = () => {
    global.fetch = original;
  };
  return mock;
}

/** Plain-data view of a fetch call, so two implementations can be compared for equality. */
function describeCall([url, init]) {
  return {
    url,
    method: init && init.method,
    headers: init && init.headers,
    body: init && init.body === undefined ? undefined : init && JSON.parse(init.body),
    hasSignal: !!(init && init.signal),
    extraKeys: init ? Object.keys(init).sort() : [],
  };
}

/** Run fn with process env keys set (test-only: the Express originals read them), then restore. */
async function withProcessEnv(vars, fn) {
  const saved = {};
  for (const k of Object.keys(vars)) {
    saved[k] = process.env[k];
    if (vars[k] === undefined) delete process.env[k];
    else process.env[k] = vars[k];
  }
  try {
    return await fn();
  } finally {
    for (const k of Object.keys(vars)) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
}

/** Make every setTimeout fire immediately, recording its delay. Returns { delays, restore }. */
function instantTimers() {
  const delays = [];
  const spy = jest.spyOn(global, 'setTimeout').mockImplementation((fn, ms) => {
    delays.push(ms);
    fn();
    return 0;
  });
  return { delays, restore: () => spy.mockRestore() };
}

module.exports = { fakeResponse, geminiOk, anthropicOk, lmOk, stubFetch, describeCall, withProcessEnv, instantTimers };
