'use strict';

/**
 * Discovery source factory.
 * (Worker port of backend/src/services/discovery/index.js; exposed as `getServices(c).discovery`.)
 *
 * Express exported `{ getSource, VALID_SOURCES }` as module-level values. Here `createDiscovery` closes
 * over the injected config (needed by AdzunaSource) and an optional `fetch` (tests), and returns the same
 * two members. `VALID_SOURCES` keeps the Express order: ['mock', 'remotive', 'adzuna'].
 */
const MockJobSource = require('./MockJobSource');
const RemotiveSource = require('./RemotiveSource');
const AdzunaSource = require('./AdzunaSource');

const SOURCES = {
  mock: MockJobSource,
  remotive: RemotiveSource,
  adzuna: AdzunaSource
};

const VALID_SOURCES = Object.keys(SOURCES);

/**
 * @param {{ config?: object, fetch?: Function }} [deps]
 */
function createDiscovery({ config, fetch: fetchImpl } = {}) {
  /**
   * Returns a JobSource instance for the given source name, or null if the source is not recognized.
   * @param {string} sourceName - 'mock' | 'remotive' | 'adzuna'
   */
  function getSource(sourceName) {
    const SourceClass = SOURCES[sourceName];
    if (!SourceClass) return null;
    return new SourceClass({ config, fetch: fetchImpl });
  }

  return { getSource, VALID_SOURCES: [...VALID_SOURCES] };
}

module.exports = { createDiscovery, VALID_SOURCES };
