/**
 * Simple LRU cache for AI responses.
 * Keyed by hash of (systemPrompt + userPrompt + maxTokens + temperature).
 * TTL: 1 hour. Max entries: 500.
 */
const crypto = require('crypto');

const MAX_ENTRIES = 500;
const DEFAULT_TTL_MS = 60 * 60 * 1000; // 1 hour

class AICache {
  constructor() {
    this.cache = new Map();
    this.hits = 0;
    this.misses = 0;
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
    if (this.cache.size >= MAX_ENTRIES) {
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

module.exports = new AICache();
