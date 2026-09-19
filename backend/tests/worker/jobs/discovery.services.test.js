'use strict';

/**
 * services/discovery/* (Worker) checked on their own and against the Express originals
 * (backend/src/services/discovery/*, which do not import the database, so they are safe to load here).
 */
jest.mock('node-fetch', () => jest.fn(), { virtual: true }); // what the Express RemotiveSource lazily requires

const JobSource = require('../../../src/worker/services/discovery/JobSource');
const MockJobSource = require('../../../src/worker/services/discovery/MockJobSource');
const RemotiveSource = require('../../../src/worker/services/discovery/RemotiveSource');
const AdzunaSource = require('../../../src/worker/services/discovery/AdzunaSource');
const { createDiscovery, VALID_SOURCES } = require('../../../src/worker/services/discovery');

const ExpressMock = require('../../../src/services/discovery/MockJobSource');
const ExpressRemotive = require('../../../src/services/discovery/RemotiveSource');
const ExpressAdzuna = require('../../../src/services/discovery/AdzunaSource');
const expressIndex = require('../../../src/services/discovery/index');

const json = (body, extra = {}) => async () => ({ ok: true, status: 200, statusText: 'OK', json: async () => body, ...extra });

describe('discovery services (worker)', () => {
  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  describe('JobSource / MockJobSource', () => {
    it('the abstract base throws "Not implemented"', async () => {
      await expect(new JobSource().search('a', 'b')).rejects.toThrow('Not implemented');
    });

    it('MockJobSource returns exactly what the Express one returns', async () => {
      expect(await new MockJobSource().search('q', 'l')).toEqual(await new ExpressMock().search('q', 'l'));
      expect(await new MockJobSource().search('q', 'l')).toHaveLength(5);
    });
  });

  describe('createDiscovery / index', () => {
    it('VALID_SOURCES keeps the Express order', () => {
      expect(VALID_SOURCES).toEqual(expressIndex.VALID_SOURCES);
      expect(VALID_SOURCES).toEqual(['mock', 'remotive', 'adzuna']);
      expect(createDiscovery({}).VALID_SOURCES).toEqual(['mock', 'remotive', 'adzuna']);
    });

    it('getSource returns the right class, null for unknown names', () => {
      const d = createDiscovery({ config: { vars: {} }, fetch: async () => ({}) });
      expect(d.getSource('mock')).toBeInstanceOf(MockJobSource);
      expect(d.getSource('remotive')).toBeInstanceOf(RemotiveSource);
      expect(d.getSource('adzuna')).toBeInstanceOf(AdzunaSource);
      expect(d.getSource('adzuna')).toBeInstanceOf(JobSource);
      expect(d.getSource('nope')).toBeNull();
      expect(expressIndex.getSource('nope')).toBeNull();
    });

    it('a fresh instance per call, wired with the injected config and fetch', async () => {
      const fetch = jest.fn(json({ results: [] }));
      const d = createDiscovery({ config: { vars: { ADZUNA_APP_ID: 'i', ADZUNA_APP_KEY: 'k' } }, fetch });
      expect(d.getSource('adzuna')).not.toBe(d.getSource('adzuna'));
      await d.getSource('adzuna').search('x', '');
      expect(fetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('RemotiveSource', () => {
    const fake = (i) => ({ id: i, title: `T${i}`, company_name: `C${i}`, candidate_required_location: 'EU', description: `D${i}`, url: `https://r/${i}`, tags: ['a'] });

    it('maps and truncates to 20, identical to Express (which is fed the same payload through node-fetch)', async () => {
      const payload = { jobs: Array.from({ length: 25 }, (_, i) => fake(i)) };
      const fetch = jest.fn(json(payload));
      const worker = await new RemotiveSource({ fetch }).search('react dev', 'x');
      require('node-fetch').mockImplementation(json(payload));
      const express = await new ExpressRemotive().search('react dev', 'x');
      expect(worker).toHaveLength(20);
      expect(worker).toEqual(express);
      expect(fetch).toHaveBeenCalledWith('https://remotive.com/api/remote-jobs?search=react%20dev');
    });

    it('defaults for missing fields, and an undefined query becomes an empty search', async () => {
      const fetch = jest.fn(json({ jobs: [{ id: 3 }] }));
      const jobs = await new RemotiveSource({ fetch }).search(undefined);
      expect(jobs).toEqual([{ externalId: '3', source: 'remotive', title: '', company: '', location: 'Remote', description: '', url: '', tags: [] }]);
      expect(fetch).toHaveBeenCalledWith('https://remotive.com/api/remote-jobs?search=');
    });

    it.each([
      ['HTTP error', async () => ({ ok: false, status: 500 })],
      ['network error', async () => { throw new Error('offline'); }],
      ['bad JSON', async () => ({ ok: true, json: async () => { throw new Error('bad json'); } })],
      ['jobs is not an array', json({ jobs: 'nope' })],
      ['payload is null', json(null)],
    ])('%s -> [] (graceful degradation)', async (_label, fetch) => {
      expect(await new RemotiveSource({ fetch }).search('x')).toEqual([]);
    });

    it('parity with Express on Render: node-fetch is not installed there, so the DEFAULT source always returns [] and never touches the network', async () => {
      const original = globalThis.fetch;
      const stub = jest.fn(json({ jobs: [fake(1)] }));
      globalThis.fetch = stub;
      try {
        expect(await new RemotiveSource().search('go')).toEqual([]);
        expect(stub).not.toHaveBeenCalled();
      } finally {
        globalThis.fetch = original;
      }
    });
  });

  describe('AdzunaSource', () => {
    const CREDS = { vars: { ADZUNA_APP_ID: 'id-1', ADZUNA_APP_KEY: 'key-1' } };
    const result = (i) => ({ id: i, title: `T${i}`, company: { display_name: `C${i}` }, location: { display_name: `L${i}` }, description: `D${i}`, redirect_url: `https://a/${i}`, category: { label: 'Cat' } });

    it.each([[undefined], [{}], [{ vars: {} }], [{ vars: { ADZUNA_APP_ID: 'only-id' } }], [{ vars: { ADZUNA_APP_KEY: 'only-key' } }]])(
      'missing credentials (%j) -> [] with a warning, no request',
      async (config) => {
        const fetch = jest.fn();
        expect(await new AdzunaSource({ config, fetch }).search('x', 'y')).toEqual([]);
        expect(console.warn).toHaveBeenCalledWith('Adzuna credentials not configured');
        expect(fetch).not.toHaveBeenCalled();
      }
    );

    it.each([
      ['Hyderabad', 'in'], ['pune, India', 'in'], ['London', 'gb'], ['UK', 'gb'], ['England', 'gb'], ['Toronto', 'ca'], ['Canada', 'ca'],
      ['Sydney', 'au'], ['Australia', 'au'], ['Berlin', 'us'], ['', 'us'], [undefined, 'us'],
    ])('location %j -> country %s (same URL and headers as Express)', async (location, country) => {
      const fetch = jest.fn(json({ results: [result(1)] }));
      const worker = await new AdzunaSource({ config: CREDS, fetch }).search('dev', location);

      // Express: process env + global fetch
      const savedFetch = globalThis.fetch;
      const expressFetch = jest.fn(json({ results: [result(1)] }));
      globalThis.fetch = expressFetch;
      process.env.ADZUNA_APP_ID = 'id-1';
      process.env.ADZUNA_APP_KEY = 'key-1';
      let express;
      try {
        express = await new ExpressAdzuna().search('dev', location);
      } finally {
        globalThis.fetch = savedFetch;
        delete process.env.ADZUNA_APP_ID;
        delete process.env.ADZUNA_APP_KEY;
      }

      expect(fetch.mock.calls[0][0]).toContain(`/jobs/${country}/search/1?`);
      expect(fetch.mock.calls[0]).toEqual(expressFetch.mock.calls[0]);
      expect(worker).toEqual(express);
    });

    it('omits what/where when empty; includes them when given', async () => {
      const fetch = jest.fn(json({ results: [] }));
      await new AdzunaSource({ config: CREDS, fetch }).search('', '');
      expect(fetch.mock.calls[0][0]).toBe('https://api.adzuna.com/v1/api/jobs/us/search/1?app_id=id-1&app_key=key-1&results_per_page=20');
      await new AdzunaSource({ config: CREDS, fetch }).search('a b', 'Remote');
      expect(fetch.mock.calls[1][0]).toBe('https://api.adzuna.com/v1/api/jobs/us/search/1?app_id=id-1&app_key=key-1&results_per_page=20&what=a+b&where=Remote');
    });

    it('maps results with the Express defaults', async () => {
      const fetch = jest.fn(json({ results: [{ id: 9 }, result(2)] }));
      expect(await new AdzunaSource({ config: CREDS, fetch }).search('x', '')).toEqual([
        { externalId: '9', source: 'adzuna', title: '', company: '', location: 'Remote', description: '', url: '', tags: [] },
        { externalId: '2', source: 'adzuna', title: 'T2', company: 'C2', location: 'L2', description: 'D2', url: 'https://a/2', tags: ['Cat'] },
      ]);
    });

    it('HTTP error -> [] and logs status; network error -> [] and logs; non-array results -> []', async () => {
      expect(await new AdzunaSource({ config: CREDS, fetch: async () => ({ ok: false, status: 401, statusText: 'Unauthorized' }) }).search('x', '')).toEqual([]);
      expect(console.error).toHaveBeenCalledWith('Adzuna API Error:', 401, 'Unauthorized');

      const boom = new Error('offline');
      expect(await new AdzunaSource({ config: CREDS, fetch: async () => { throw boom; } }).search('x', '')).toEqual([]);
      expect(console.error).toHaveBeenCalledWith('Adzuna search failed:', boom);

      expect(await new AdzunaSource({ config: CREDS, fetch: json({ results: 'nope' }) }).search('x', '')).toEqual([]);
    });

    it('credentials are read at call time from the injected config (no module-scope capture)', async () => {
      const config = { vars: {} };
      const fetch = jest.fn(json({ results: [] }));
      const source = new AdzunaSource({ config, fetch });
      expect(await source.search('x', '')).toEqual([]);
      expect(fetch).not.toHaveBeenCalled();
      config.vars = { ADZUNA_APP_ID: 'late-id', ADZUNA_APP_KEY: 'late-key' };
      await source.search('x', '');
      expect(fetch.mock.calls[0][0]).toContain('app_id=late-id');
    });
  });
});
