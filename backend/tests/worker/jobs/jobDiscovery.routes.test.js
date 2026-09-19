'use strict';

/** routes/jobDiscovery.js (Worker): GET /api/jobs/discover, tier 2. */
const { makeJobsHarness } = require('./jobsHarness');
const MockJobSource = require('../../../src/worker/services/discovery/MockJobSource');

const INSERT_SQL = 'INSERT INTO discovered_jobs (user_id, external_id, source, title, company, location, description, url, tags) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) ON CONFLICT (source, external_id) DO NOTHING';

const okJson = (body) => async () => ({ ok: true, status: 200, statusText: 'OK', json: async () => body });

describe('GET /api/jobs/discover (worker)', () => {
  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  describe('auth and plan gate (manifest: auth + requirePlan(2))', () => {
    it('401 without a token', async () => {
      const H = makeJobsHarness();
      expect((await H.call('GET', '/api/jobs/discover', undefined, { auth: false })).status).toBe(401);
      expect(H.appCalls).toEqual([]);
    });

    it('tier 1 -> 403 PLAN_UPGRADE_REQUIRED requiring "Tune & Polish"; nothing cached', async () => {
      const H = makeJobsHarness({ tier: 1 });
      const res = await H.call('GET', '/api/jobs/discover');
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({
        error: 'This feature requires a higher subscription plan.',
        code: 'PLAN_UPGRADE_REQUIRED',
        requiredPlan: 'Tune & Polish',
        currentPlan: 'Learn & Build',
      });
      expect(H.appCalls).toEqual([]);
    });

    it.each([[2], [3]])('tier %i is allowed', async (tier) => {
      const H = makeJobsHarness({ tier });
      expect((await H.call('GET', '/api/jobs/discover')).status).toBe(200);
    });
  });

  describe('mock source (default)', () => {
    it('returns the five mock jobs in the {success,data:{jobs,count,source,cached}} envelope', async () => {
      const H = makeJobsHarness();
      const res = await H.call('GET', '/api/jobs/discover');
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(Object.keys(json.data)).toEqual(['jobs', 'count', 'source', 'cached']);
      expect(json.data).toMatchObject({ count: 5, source: 'mock', cached: true });
      expect(json.data.jobs.map((j) => j.externalId)).toEqual(['mock_0', 'mock_1', 'mock_2', 'mock_3', 'mock_4']);
      expect(json.data.jobs[0]).toEqual({
        externalId: 'mock_0',
        source: 'mock',
        title: 'Software Engineer',
        company: 'Acme Technologies',
        location: 'San Francisco, CA (Remote OK)',
        description: expect.stringContaining('passionate Software Engineer'),
        url: 'https://example.com/jobs/software-engineer',
        tags: ['javascript', 'node.js', 'react', 'full-stack'],
      });
    });

    it('caches every job with one parameterised upsert each, in order, tagged with the user id', async () => {
      const H = makeJobsHarness({ userId: 42 });
      await H.call('GET', '/api/jobs/discover');
      expect(H.appCalls).toHaveLength(5);
      expect(H.appCalls.every((c) => c.sql === INSERT_SQL)).toBe(true);
      expect(H.appCalls[0].params).toEqual([
        42, 'mock_0', 'mock', 'Software Engineer', 'Acme Technologies', 'San Francisco, CA (Remote OK)',
        expect.any(String), 'https://example.com/jobs/software-engineer',
        JSON.stringify(['javascript', 'node.js', 'react', 'full-stack']),
      ]);
      expect(H.appCalls.map((c) => c.params[1])).toEqual(['mock_0', 'mock_1', 'mock_2', 'mock_3', 'mock_4']);
    });

    it('a failing cache write is swallowed: response is still 200 with all jobs', async () => {
      const H = makeJobsHarness({ script: () => { throw new Error('relation "discovered_jobs" does not exist'); } });
      const res = await H.call('GET', '/api/jobs/discover');
      expect(res.status).toBe(200);
      expect((await res.json()).data.count).toBe(5);
      expect(H.appCalls).toHaveLength(5); // every insert was still attempted
    });

    it('source name is case-insensitive and reported lower-cased', async () => {
      const H = makeJobsHarness();
      const res = await H.call('GET', '/api/jobs/discover?source=MOCK');
      expect((await res.json()).data.source).toBe('mock');
    });

    it('query and location are trimmed before reaching the source', async () => {
      const search = jest.fn(async () => []);
      const H = makeJobsHarness({ fakes: { discovery: { getSource: () => ({ search }), VALID_SOURCES: ['mock', 'remotive', 'adzuna'] } } });
      await H.call('GET', '/api/jobs/discover?query=%20react%20dev%20&location=%20Remote%20');
      expect(search).toHaveBeenCalledWith('react dev', 'Remote');
    });
  });

  describe('source validation', () => {
    it('unknown source -> 400 with the ordered list of valid sources; nothing searched or cached', async () => {
      const fetch = jest.fn();
      const H = makeJobsHarness({ fakes: { fetch } });
      const res = await H.call('GET', '/api/jobs/discover?source=indeed');
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ success: false, error: 'Invalid source. Valid options: mock, remotive, adzuna' });
      expect(fetch).not.toHaveBeenCalled();
      expect(H.appCalls).toEqual([]);
    });

    it('inherited names such as "constructor" are not sources', async () => {
      const H = makeJobsHarness();
      expect((await H.call('GET', '/api/jobs/discover?source=constructor')).status).toBe(400);
    });

    it('a repeated query key becomes an array and fails at trim() -> masked 500 (as on Express)', async () => {
      const H = makeJobsHarness();
      const res = await H.call('GET', '/api/jobs/discover?query=a&query=b');
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: 'Internal Server Error' });
    });
  });

  describe('remotive source (injected fetch)', () => {
    it('maps the API payload, encodes the trimmed query, reports source "remotive"', async () => {
      const fetch = jest.fn(okJson({
        jobs: [{ id: 11, title: 'Dev', company_name: 'Co', candidate_required_location: 'EU', description: 'd', url: 'https://r/11', tags: ['js'] }],
      }));
      const H = makeJobsHarness({ fakes: { fetch } });
      const res = await H.call('GET', '/api/jobs/discover?source=remotive&query=%20react%20dev%20');
      expect(fetch).toHaveBeenCalledWith('https://remotive.com/api/remote-jobs?search=react%20dev');
      expect((await res.json()).data).toEqual({
        jobs: [{ externalId: '11', source: 'remotive', title: 'Dev', company: 'Co', location: 'EU', description: 'd', url: 'https://r/11', tags: ['js'] }],
        count: 1,
        source: 'remotive',
        cached: true,
      });
      expect(H.appCalls[0].params.slice(0, 3)).toEqual([7, '11', 'remotive']);
    });

    it('API failure -> empty list, NO fallback to mock (fallback is only for thrown errors)', async () => {
      const H = makeJobsHarness({ fakes: { fetch: async () => ({ ok: false, status: 503 }) } });
      const res = await H.call('GET', '/api/jobs/discover?source=remotive');
      expect((await res.json()).data).toEqual({ jobs: [], count: 0, source: 'remotive', cached: true });
      expect(H.appCalls).toEqual([]);
    });
  });

  describe('adzuna source (credentials from config vars)', () => {
    it('without credentials -> empty list and a console warning', async () => {
      const fetch = jest.fn();
      const H = makeJobsHarness({ fakes: { fetch } });
      const res = await H.call('GET', '/api/jobs/discover?source=adzuna&query=x');
      expect((await res.json()).data).toEqual({ jobs: [], count: 0, source: 'adzuna', cached: true });
      expect(console.warn).toHaveBeenCalledWith('Adzuna credentials not configured');
      expect(fetch).not.toHaveBeenCalled();
    });

    it('with ADZUNA_APP_ID/KEY in the env binding it calls the API and maps results', async () => {
      const fetch = jest.fn(okJson({
        results: [{ id: 5, title: 'T', company: { display_name: 'C' }, location: { display_name: 'L' }, description: 'D', redirect_url: 'https://a/5', category: { label: 'IT Jobs' } }],
      }));
      const H = makeJobsHarness({ envOverrides: { ADZUNA_APP_ID: 'id-1', ADZUNA_APP_KEY: 'key-1' }, fakes: { fetch } });
      const res = await H.call('GET', '/api/jobs/discover?source=adzuna&query=dev&location=London');
      const [url, init] = fetch.mock.calls[0];
      expect(url).toBe('https://api.adzuna.com/v1/api/jobs/gb/search/1?app_id=id-1&app_key=key-1&results_per_page=20&what=dev&where=London');
      expect(init).toEqual({ headers: { Accept: 'application/json' } });
      expect((await res.json()).data.jobs).toEqual([
        { externalId: '5', source: 'adzuna', title: 'T', company: 'C', location: 'L', description: 'D', url: 'https://a/5', tags: ['IT Jobs'] },
      ]);
    });
  });

  describe('fallback to the mock source', () => {
    it('a source that THROWS falls back to mock: source reported as "mock", the error is logged', async () => {
      const boom = new Error('upstream exploded');
      const H = makeJobsHarness({ fakes: { discovery: { getSource: () => ({ search: async () => { throw boom; } }), VALID_SOURCES: ['mock', 'remotive', 'adzuna'] } } });
      const res = await H.call('GET', '/api/jobs/discover?source=remotive&query=x');
      expect(res.status).toBe(200);
      const { data } = await res.json();
      expect(data).toMatchObject({ count: 5, source: 'mock', cached: true });
      expect(data.jobs[0].source).toBe('mock');
      expect(console.error).toHaveBeenCalledWith('Error searching jobs with remotive:', boom);
    });

    it('a source returning a non-array is treated as an empty list (no fallback)', async () => {
      const H = makeJobsHarness({ fakes: { discovery: { getSource: () => ({ search: async () => ({ nope: true }) }), VALID_SOURCES: ['mock'] } } });
      const { data } = await (await H.call('GET', '/api/jobs/discover')).json();
      expect(data).toEqual({ jobs: [], count: 0, source: 'mock', cached: true });
    });

    it('if the fallback itself fails the error is uncaught -> masked 500', async () => {
      const spy = jest.spyOn(MockJobSource.prototype, 'search').mockRejectedValue(new Error('mock broke'));
      const H = makeJobsHarness({ fakes: { discovery: { getSource: () => ({ search: async () => { throw new Error('first'); } }), VALID_SOURCES: ['mock'] } } });
      const res = await H.call('GET', '/api/jobs/discover');
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: 'Internal Server Error' });
      spy.mockRestore();
    });
  });
});
