const JobSource = require('./JobSource');

const REMOTIVE_API_BASE = 'https://remotive.com/api/remote-jobs';
const MAX_RESULTS = 20;

class RemotiveSource extends JobSource {
  async search(query, _location) {
    try {
      // Lazy-load node-fetch to allow easy mocking in tests
      const fetch = require('node-fetch');
      const url = `${REMOTIVE_API_BASE}?search=${encodeURIComponent(query || '')}`;
      const response = await fetch(url);

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
      // Graceful degradation — return empty array on any failure
      return [];
    }
  }
}

module.exports = RemotiveSource;
