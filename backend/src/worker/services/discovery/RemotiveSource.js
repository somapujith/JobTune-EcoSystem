'use strict';

/**
 * RemotiveSource: Remotive public API adapter.
 * (Worker port of backend/src/services/discovery/RemotiveSource.js)
 *
 * BEHAVIOR PARITY (orchestrator decision, ADR-001 4: no behavior changes during the port): the Express class
 * lazily required the `node-fetch` package inside search(). That package is NOT a dependency of the backend
 * (absent from package.json, the lockfile and node_modules), so on Render the require throws, the catch
 * swallows it, and `source=remotive` ALWAYS returns []. The Worker preserves exactly that: the default fetch
 * implementation fails the same way, so search() returns [] for every query. A real Remotive integration
 * (platform fetch, injected via the constructor: `new RemotiveSource({ fetch })`) is a post-cutover fix and
 * is one line: replace DEFAULT_FETCH below with `(...args) => fetch(...args)` (call fetch as a bare function,
 * workerd throws "Illegal invocation" if it is called as a method of another object).
 */
const JobSource = require('./JobSource');

const REMOTIVE_API_BASE = 'https://remotive.com/api/remote-jobs';
const MAX_RESULTS = 20;

// Mirrors `require('node-fetch')` failing with MODULE_NOT_FOUND on Render (see header). Thrown inside search()'s try.
const DEFAULT_FETCH = async () => {
  throw new Error("Cannot find module 'node-fetch'");
};

class RemotiveSource extends JobSource {
  /** @param {{ fetch?: Function }} [deps] */
  constructor({ fetch: fetchImpl } = {}) {
    super();
    this._fetch = fetchImpl || DEFAULT_FETCH;
  }

  async search(query, _location) {
    try {
      const url = `${REMOTIVE_API_BASE}?search=${encodeURIComponent(query || '')}`;
      const response = await this._fetch(url);

      if (!response.ok) {
        return [];
      }

      const data = await response.json();
      const rawJobs = Array.isArray(data.jobs) ? data.jobs : [];

      return rawJobs.slice(0, MAX_RESULTS).map(job => ({
        externalId: String(job.id),
        source: 'remotive',
        title: job.title || '',
        company: job.company_name || '',
        location: job.candidate_required_location || 'Remote',
        description: job.description || '',
        url: job.url || '',
        tags: Array.isArray(job.tags) ? job.tags : []
      }));
    } catch (_err) {
      // Graceful degradation: return empty array on any failure
      return [];
    }
  }
}

module.exports = RemotiveSource;
