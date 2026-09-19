'use strict';

/**
 * services/embeddings.js against a stubbed global fetch, plus differential checks against the original
 * utils/embeddings.js for the pure functions and for the outbound request.
 */
const { createEmbeddings, cosineSimilarity, chunkText } = require('../../../src/worker/services/embeddings');
const { createConfig } = require('../../../src/worker/config');
const { makeEnv } = require('../helpers/harness');
const { fakeResponse, stubFetch, describeCall, withProcessEnv } = require('./helpers');

const LM_DEFAULT = 'http://172.19.80.1:1234/v1';
const make = (vars = {}) => createEmbeddings({ config: createConfig(makeEnv(vars)) });
const embeddingOk = (vec) => fakeResponse({ json: { data: [{ embedding: vec }] } });

function loadOriginal(envVars) {
  // The original reads LM_STUDIO_URL / LM_STUDIO_MODEL_EMBED at MODULE scope, so load it with env in place.
  let mod;
  const saved = {};
  for (const k of Object.keys(envVars)) {
    saved[k] = process.env[k];
    if (envVars[k] === undefined) delete process.env[k];
    else process.env[k] = envVars[k];
  }
  jest.isolateModules(() => { mod = require('../../../src/utils/embeddings'); });
  for (const k of Object.keys(envVars)) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  return mod;
}

describe('services/embeddings (port of utils/embeddings.js)', () => {
  let fetchMock;
  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    if (fetchMock) fetchMock.restore();
    fetchMock = undefined;
    jest.restoreAllMocks();
  });

  it('exposes the same names as the original', () => {
    const original = loadOriginal({});
    expect(Object.keys(make()).sort()).toEqual(Object.keys(original).sort());
  });

  describe('embedText', () => {
    it('returns null for empty / whitespace / nullish text without calling fetch', async () => {
      fetchMock = stubFetch([embeddingOk([1])]);
      const { embedText } = make();
      for (const t of ['', '   \n', null, undefined]) expect(await embedText(t)).toBeNull();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('posts to LM_STUDIO_URL from config (not module scope) with the configured model', async () => {
      fetchMock = stubFetch([embeddingOk([0.1, 0.2])]);
      const { embedText } = make({ LM_STUDIO_URL: 'http://lm.test/v1', LM_STUDIO_MODEL_EMBED: 'embed-x' });
      expect(await embedText('hello')).toEqual([0.1, 0.2]);
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('http://lm.test/v1/embeddings');
      expect(init.method).toBe('POST');
      expect(init.headers).toEqual({ 'Content-Type': 'application/json' });
      expect(JSON.parse(init.body)).toEqual({ model: 'embed-x', input: 'hello' });
    });

    it('falls back to the Express defaults', async () => {
      fetchMock = stubFetch([embeddingOk([1])]);
      await make().embedText('hello');
      expect(fetchMock.mock.calls[0][0]).toBe(`${LM_DEFAULT}/embeddings`);
      expect(JSON.parse(fetchMock.mock.calls[0][1].body).model).toBe('nomic-embed-text-v1.5');
    });

    it('reads config at call time, not import time, and never the ambient environment', async () => {
      await withProcessEnv({ LM_STUDIO_URL: 'http://ambient.invalid/v1' }, async () => {
        fetchMock = stubFetch([embeddingOk([1])]);
        await make().embedText('hello');
        expect(fetchMock.mock.calls[0][0]).toBe(`${LM_DEFAULT}/embeddings`);
      });
    });

    it('returns null and warns on a non-ok response', async () => {
      fetchMock = stubFetch([fakeResponse({ status: 500, text: 'x' })]);
      expect(await make().embedText('hi')).toBeNull();
      expect(console.warn).toHaveBeenCalledWith('Embeddings API error: 500');
    });

    it('returns null when the response has no embedding array', async () => {
      fetchMock = stubFetch([fakeResponse({ json: { data: [{ embedding: 'nope' }] } }), fakeResponse({ json: {} })]);
      const { embedText } = make();
      expect(await embedText('a')).toBeNull();
      expect(await embedText('b')).toBeNull();
      expect(console.warn).toHaveBeenCalledWith('No embedding in response');
    });

    it('returns null and logs when fetch throws', async () => {
      fetchMock = stubFetch([new Error('ECONNREFUSED')]);
      expect(await make().embedText('hi')).toBeNull();
      expect(console.error).toHaveBeenCalledWith('Embedding error:', 'ECONNREFUSED');
    });

    it('sends exactly the same request as the original (including its inert `timeout` option)', async () => {
      const env = { LM_STUDIO_URL: 'http://lm.test/v1', LM_STUDIO_MODEL_EMBED: 'embed-x' };
      const original = loadOriginal(env);
      fetchMock = stubFetch([embeddingOk([1, 2, 3])]);
      const a = await original.embedText('same text');
      const b = await make(env).embedText('same text');
      expect(b).toEqual(a);
      expect(describeCall(fetchMock.mock.calls[1])).toEqual(describeCall(fetchMock.mock.calls[0]));
      expect(describeCall(fetchMock.mock.calls[1]).extraKeys).toEqual(['body', 'headers', 'method', 'timeout']);
    });
  });

  describe('findTopSimilarChunks', () => {
    const chunks = [
      { text: 'north', embedding: [0, 1], chunkIndex: 2 },
      { text: 'east', embedding: JSON.stringify([1, 0]) }, // string embeddings are parsed
      { text: 'northeast', embedding: [1, 1], chunkIndex: 5 },
      { text: 'broken', embedding: null }, // neither array nor string -> [] -> similarity 0
    ];

    it('scores, sorts descending, slices to k and defaults chunkIndex to 0', async () => {
      fetchMock = stubFetch([embeddingOk([1, 0])]);
      const top = await make().findTopSimilarChunks('query', chunks, 2);
      expect(top.map((t) => t.text)).toEqual(['east', 'northeast']);
      expect(top[0]).toEqual({ text: 'east', similarity: 1, chunkIndex: 0 });
      expect(top[1].chunkIndex).toBe(5);
    });

    it('defaults k to 3', async () => {
      fetchMock = stubFetch([embeddingOk([1, 0])]);
      expect(await make().findTopSimilarChunks('query', chunks)).toHaveLength(3);
    });

    it('returns [] for no chunks (no fetch) and when the query cannot be embedded', async () => {
      fetchMock = stubFetch([fakeResponse({ status: 500, text: 'x' })]);
      const { findTopSimilarChunks } = make();
      expect(await findTopSimilarChunks('q', [])).toEqual([]);
      expect(await findTopSimilarChunks('q', null)).toEqual([]);
      expect(fetchMock).not.toHaveBeenCalled();
      expect(await findTopSimilarChunks('q', chunks)).toEqual([]);
      expect(console.warn).toHaveBeenCalledWith('Could not embed query');
    });

    it('matches the original result for the same stubbed embeddings', async () => {
      const original = loadOriginal({});
      fetchMock = stubFetch([embeddingOk([0.3, 0.9])]);
      const a = await original.findTopSimilarChunks('q', chunks, 3);
      const b = await make().findTopSimilarChunks('q', chunks, 3);
      expect(b).toEqual(a);
    });
  });

  describe('pure helpers match the original', () => {
    const original = loadOriginal({});

    it('cosineSimilarity', () => {
      const cases = [
        [[1, 2, 3], [1, 2, 3]], [[1, 0], [0, 1]], [[1, 2], [-1, -2]], [[0, 0], [1, 1]], [[1], [1, 2]],
        [null, [1]], [[1], undefined], [[0.1, 0.25, 0.9], [0.3, -0.2, 0.5]],
      ];
      for (const [a, b] of cases) expect(cosineSimilarity(a, b)).toBe(original.cosineSimilarity(a, b));
      expect(cosineSimilarity([1, 0], [1, 0])).toBe(1);
      expect(make().cosineSimilarity([1, 0], [0, 1])).toBe(0);
    });

    it('chunkText', () => {
      const long = Array.from({ length: 60 }, (_, i) => `Sentence number ${i} talks about resumes and careers in detail.`).join(' ');
      const paragraphs = 'First paragraph has several words in it. It ends here.\n\nSecond paragraph follows! And more? Yes.\n\n\nThird one.';
      for (const [text, tokens] of [[long, 50], [long, undefined], [paragraphs, 10], [paragraphs, 500], ['', 5], [null, 5], ['tiny', 5]]) {
        expect(chunkText(text, tokens)).toEqual(original.chunkText(text, tokens));
      }
      expect(chunkText(long, 50).length).toBeGreaterThan(1);
      expect(make().chunkText(paragraphs, 10)).toEqual(original.chunkText(paragraphs, 10));
    });
  });
});
