'use strict';

/**
 * JobSource: abstract base class for job source adapters.
 * (Worker port of backend/src/services/discovery/JobSource.js, unchanged: pure, no dependencies.)
 *
 * All concrete implementations must override search() and return
 * an array of normalized job objects:
 * [{ externalId, source, title, company, location, description, url, tags }, ...]
 */
class JobSource {
  /**
   * Search for jobs matching the given query and location.
   *
   * @param {string} query   - Search keyword (e.g. "react developer")
   * @param {string} location - Location filter (e.g. "remote", "New York")
   * @returns {Promise<Array>} Normalized job objects
   */
  // eslint-disable-next-line no-unused-vars
  async search(query, location) {
    throw new Error('Not implemented');
  }
}

module.exports = JobSource;
