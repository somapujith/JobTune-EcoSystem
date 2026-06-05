const MockJobSource = require('./MockJobSource');
const RemotiveSource = require('./RemotiveSource');
const AdzunaSource = require('./AdzunaSource');

const SOURCES = {
  mock: MockJobSource,
  remotive: RemotiveSource,
  adzuna: AdzunaSource
};

/**
 * Factory: returns a JobSource instance for the given source name,
 * or null if the source is not recognized.
 *
 * @param {string} sourceName - 'mock' | 'remotive'
 * @returns {import('./JobSource')|null}
 */
function getSource(sourceName) {
  const SourceClass = SOURCES[sourceName];
  if (!SourceClass) return null;
  return new SourceClass();
}

module.exports = { getSource, VALID_SOURCES: Object.keys(SOURCES) };
