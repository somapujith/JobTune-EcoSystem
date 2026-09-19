'use strict';

/**
 * AdzunaSource: Adzuna jobs API adapter.
 * (Worker port of backend/src/services/discovery/AdzunaSource.js)
 *
 * The Express class read the Adzuna app id and key from the process environment inside search().
 * Here they come from the injected config (`config.vars.ADZUNA_APP_ID` / `config.vars.ADZUNA_APP_KEY`),
 * read at call time. `fetch` is injectable for tests and defaults to the platform's global `fetch`, looked
 * up at call time and called as a bare function (workerd throws "Illegal invocation" otherwise).
 * Everything else (country mapping, URL, result mapping, "any failure -> []") is unchanged.
 */
const JobSource = require('./JobSource');

const MAX_RESULTS = 20;

class AdzunaSource extends JobSource {
  /** @param {{ config?: { vars?: object }, fetch?: Function }} [deps] */
  constructor({ config, fetch: fetchImpl } = {}) {
    super();
    this._config = config;
    this._fetch = fetchImpl || ((...args) => fetch(...args));
  }

  async search(query, location) {
    try {
      const vars = (this._config && this._config.vars) || {};
      const appId = vars.ADZUNA_APP_ID;
      const appKey = vars.ADZUNA_APP_KEY;

      if (!appId || !appKey) {
        console.warn('Adzuna credentials not configured');
        return [];
      }

      let country = 'us';
      const locLower = (location || '').toLowerCase();
      if (locLower.includes('india') || locLower.includes('hyderabad') || locLower.includes('bangalore') || locLower.includes('chennai') || locLower.includes('mumbai') || locLower.includes('delhi') || locLower.includes('pune')) {
        country = 'in';
      } else if (locLower.includes('uk') || locLower.includes('london') || locLower.includes('england')) {
        country = 'gb';
      } else if (locLower.includes('canada') || locLower.includes('toronto') || locLower.includes('vancouver')) {
        country = 'ca';
      } else if (locLower.includes('australia') || locLower.includes('sydney') || locLower.includes('melbourne')) {
        country = 'au';
      }

      const url = new URL(`https://api.adzuna.com/v1/api/jobs/${country}/search/1`);
      url.searchParams.append('app_id', appId);
      url.searchParams.append('app_key', appKey);
      url.searchParams.append('results_per_page', MAX_RESULTS);

      if (query) url.searchParams.append('what', query);
      if (location) url.searchParams.append('where', location);

      const response = await this._fetch(url.toString(), {
        headers: {
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        console.error('Adzuna API Error:', response.status, response.statusText);
        return [];
      }

      const data = await response.json();
      const rawJobs = Array.isArray(data.results) ? data.results : [];

      return rawJobs.map(job => ({
        externalId: String(job.id),
        source: 'adzuna',
        title: job.title || '',
        company: job.company?.display_name || '',
        location: job.location?.display_name || 'Remote',
        description: job.description || '',
        url: job.redirect_url || '',
        tags: job.category?.label ? [job.category.label] : []
      }));
    } catch (err) {
      console.error('Adzuna search failed:', err);
      return [];
    }
  }
}

module.exports = AdzunaSource;
