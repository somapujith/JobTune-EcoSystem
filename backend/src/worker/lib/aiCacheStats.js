'use strict';

/**
 * Real AI-cache statistics for the health endpoint (replaces the T1 placeholder).
 * Mirrors utils/aiClient.js getAICacheStats(): { size, hits, misses, hitRate } with hitRate a whole-number percent.
 *
 * getAICacheStats(c) reads the cache the request's services use (`getServices(c).aiCache`, which a test
 * may override), and falls back to the isolate-level cache when the container has no aiCache entry, so the
 * health endpoint cannot fail because of a partial container. The numbers are PER ISOLATE (ADR-001 section 4.5):
 * they describe the isolate that answered this request, not the whole deployment, and start at zero on a cold isolate.
 */
const { getIsolateAiCache } = require('../services/aiCache');

function getAICacheStats(c) {
  const services = c && typeof c.get === 'function' ? c.get('services') : undefined;
  const cache = (services && services.aiCache) || getIsolateAiCache();
  return cache.getStats();
}

module.exports = { getAICacheStats };
