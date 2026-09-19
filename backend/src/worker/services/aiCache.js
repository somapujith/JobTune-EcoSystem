'use strict';

/**
 * AI response cache   (port of utils/aiCache.js; ADR-001 section 4.5, task T2.3)
 *
 * Same behaviour and public API as the Express singleton (`module.exports = new AICache()`):
 *   get(systemPrompt, userPrompt, maxTokens, temperature) -> string | null
 *   set(systemPrompt, userPrompt, maxTokens, temperature, value, ttlMs = 1h)
 *   getStats() -> { size, hits, misses, hitRate }      (hitRate is a whole-number percent)
 *   clear()
 * Keyed by the first 16 hex chars of sha256(`${system}|${user}|${maxTokens}|${temperature}`),
 * 500-entry LRU (Map insertion order, evict-oldest), 1 hour TTL. The key derivation,
 * the eviction rule and the hit/miss accounting are unchanged. The cache is shared by
 * every user (the key has no user component), exactly as on Express.
 *
 * PER-ISOLATE, NOT PER-REQUEST   *** hit-rate regression, ADR-001 section 4.5 ***
 * On Render one Node process owned one cache, so a repeated prompt hit it for as long as the
 * process lived. On Workers the cache lives in ONE ISOLATE'S memory:
 *   - it is shared by every request that lands on that isolate (that is why the store is kept in a
 *     lazily created isolate-level variable rather than being rebuilt by the per-request service factory), but
 *   - each isolate warms its own copy, an isolate can be evicted at any time, and requests are spread
 *     over many isolates in many locations, so the same prompt will often miss where Express hit.
 * Consequences an operator should expect and NOT mistake for a bug: a much lower `aiCache.hitRate`
 * on /api/health, more provider calls, and therefore a higher AI bill and higher latency than Render.
 * Correctness is unaffected: callAI falls through to the provider on a miss. Stats are per isolate too,
 * so /api/health shows the answering isolate's numbers only. If the hit rate matters after cutover, the
 * follow-up is a shared store (Workers KV or the Cache API); it is deliberately not done here (no behaviour
 * change during the port).
 *
 * Nothing runs at module load: the isolate cache is created on first use.
 */
const crypto = require('node:crypto');

const MAX_ENTRIES = 500;
const DEFAULT_TTL_MS = 60 * 60 * 1000; // 1 hour

class AICache {
  /** @param {{ maxEntries?: number }} [options] maxEntries is a test seam; production uses 500. */
  constructor({ maxEntries = MAX_ENTRIES } = {}) {
    this.cache = new Map();
    this.hits = 0;
    this.misses = 0;
    this.maxEntries = maxEntries;
  }

  _hash(systemPrompt, userPrompt, maxTokens, temperature) {
    const key = `${systemPrompt}|${userPrompt}|${maxTokens}|${temperature}`;
    return crypto.createHash('sha256').update(key).digest('hex').slice(0, 16);
  }

  get(systemPrompt, userPrompt, maxTokens, temperature) {
    const hash = this._hash(systemPrompt, userPrompt, maxTokens, temperature);
    const entry = this.cache.get(hash);
    if (!entry) {
      this.misses++;
      return null;
    }
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(hash);
      this.misses++;
      return null;
    }
    this.hits++;
    // Move to end (LRU)
    this.cache.delete(hash);
    this.cache.set(hash, entry);
    return entry.value;
  }

  set(systemPrompt, userPrompt, maxTokens, temperature, value, ttlMs = DEFAULT_TTL_MS) {
    const hash = this._hash(systemPrompt, userPrompt, maxTokens, temperature);
    // Evict oldest if at capacity
    if (this.cache.size >= this.maxEntries) {
      const oldest = this.cache.keys().next().value;
      this.cache.delete(oldest);
    }
    this.cache.set(hash, { value, expiresAt: Date.now() + ttlMs });
  }

  getStats() {
    return {
      size: this.cache.size,
      hits: this.hits,
      misses: this.misses,
      hitRate: this.hits + this.misses > 0
        ? Math.round((this.hits / (this.hits + this.misses)) * 100)
        : 0,
    };
  }

  clear() {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
  }
}

// The one cache of this isolate, created on first use (never at module load).
let isolateCache = null;

/** The cache shared by every request served by this isolate. */
function getIsolateAiCache() {
  if (!isolateCache) isolateCache = new AICache();
  return isolateCache;
}

/**
 * Registry factory: `getServices(c).aiCache`. Returns the isolate-level cache so hits survive across
 * requests on the same isolate. Pass `{ store }` (a fresh `new AICache()`) to isolate a test.
 * @param {{ store?: AICache }} [deps]
 */
function createAiCache({ store } = {}) {
  return store || getIsolateAiCache();
}

module.exports = { AICache, createAiCache, getIsolateAiCache, MAX_ENTRIES, DEFAULT_TTL_MS };
