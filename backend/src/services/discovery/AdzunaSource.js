const JobSource = require('./JobSource');

const MAX_RESULTS = 20;

class AdzunaSource extends JobSource {
  async search(query, location) {
    try {
      const appId = process.env.ADZUNA_APP_ID;
      const appKey = process.env.ADZUNA_APP_KEY;

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

      const response = await fetch(url.toString(), {
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
