'use strict';

/**
 * ROUTING PARITY for the whole /api/jobs group (ADR-001 section 7, Phase 3, wave 3E: "highest ordering risk").
 *
 * Express side: the REAL Express route files (jobTracker, jobAnalyzer, coverLetter, jobDiscovery, jobFit,
 * achievementEnhancer) mounted in the exact order of backend/src/app.js on a bare express() app, with the
 * database, auth, plan gate and AI client replaced by mocks (nothing touches a real database, secret or
 * environment file: the database module is mocked before it can load, so its env-file loader never runs).
 * Worker side: the six Worker routers mounted through the same helper the shipped mount file uses.
 *
 * The same requests go to both and must produce the same status, the same body text (byte for byte, timestamps
 * masked), the same SQL + parameters and the same AI client calls. Auth/plan behaviour is proven in the per-route
 * tests and in jobs.manifest.test.js (the Express side here has auth stubbed out on purpose).
 */
jest.mock('../../../src/config/database', () => ({ pool: { query: jest.fn() } }));
jest.mock('../../../src/middleware/auth', () => ({
  authenticateToken: (req, _res, next) => {
    req.user = { id: 7 };
    next();
  },
}));
jest.mock('../../../src/middleware/requirePlan', () => ({ requirePlan: () => (_req, _res, next) => next() }));
jest.mock('../../../src/utils/aiClient', () => ({
  ...jest.requireActual('../../../src/utils/aiClient'),
  callAI: jest.fn(),
}));
jest.mock('node-fetch', () => jest.fn(), { virtual: true }); // RemotiveSource's lazy require on Express

const express = require('express');
const supertest = require('supertest');
const { pool } = require('../../../src/config/database');
const expressAi = require('../../../src/utils/aiClient');
const nodeFetch = require('node-fetch');
const { errorHandler } = require('../../../src/middleware/errorHandler');
const { makeJobsHarness, JOBS_MOUNTS, norm } = require('./jobsHarness');
const { patternToRegExp, listRoutes } = require('../../../src/worker/lib/routes');
const onetLoader = require('../../../src/services/taxonomy/onetLoader'); // Express original = the infra contract for services.onetLoader

// ---- Express reference app (mount order copied from backend/src/app.js lines 126, 129, 130, 135, 136, 141) --------
const EXPRESS_ROUTES = {
  jobTracker: '../../../src/routes/jobTracker',
  jobAnalyzer: '../../../src/routes/jobAnalyzer',
  coverLetter: '../../../src/routes/coverLetter',
  jobDiscovery: '../../../src/routes/jobDiscovery',
  jobFit: '../../../src/routes/jobFit',
  achievementEnhancer: '../../../src/routes/achievementEnhancer',
};
function buildExpressApp() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false, limit: '1mb' }));
  for (const [prefix, name] of JOBS_MOUNTS) app.use(prefix, require(EXPRESS_ROUTES[name]));
  app.use(errorHandler);
  return app;
}

// ---- shared scripted database ------------------------------------------------------------------------------
function script(sql, params) {
  if (sql.startsWith('SELECT ja.*')) {
    return { rows: [
      { id: 1, user_id: 7, company: 'Acme', status: 'applied', total: '3', interviews: '1', offers: '1' },
      { id: 2, user_id: 7, company: 'Beta', status: 'interview', total: '3', interviews: '1', offers: '1' },
    ] };
  }
  if (sql.startsWith('INSERT INTO job_applications')) return { rows: [{ id: 99, user_id: params[0], company: params[1], role: params[2], status: params[5] }] };
  if (sql.startsWith('UPDATE job_applications')) {
    if (Number.isNaN(params[2])) throw new Error('invalid input syntax for type integer: "NaN"');
    return params[2] === 404 ? { rows: [] } : { rows: [{ id: params[2], status: params[0], notes: params[1] }] };
  }
  if (sql.startsWith('DELETE FROM job_applications')) {
    if (Number.isNaN(params[0])) throw new Error('invalid input syntax for type integer: "NaN"');
    return params[0] === 404 ? { rows: [] } : { rows: [{ id: params[0] }] };
  }
  if (sql.startsWith('INSERT INTO discovered_jobs')) return { rows: [], rowCount: 1 };
  throw new Error(`unexpected SQL in routing test: ${sql}`);
}

const ENV_VARS = { LM_STUDIO_MODEL_JOB: 'job-m', LM_STUDIO_MODEL_SKILLS: 'skills-m', LM_STUDIO_MODEL_RESUME: 'resume-m', LM_STUDIO_MODEL_FIT: 'fit-m' };
const json = (body) => async () => ({ ok: true, status: 200, statusText: 'OK', json: async () => body });
const LONG_JD = 'We are hiring a Senior React and Node.js engineer with 5 years of experience. - Build APIs - Mentor juniors';
const CL_BODY = { jobDescription: 'Build things. '.repeat(20), companyName: 'Acme', position: 'Engineer', yourName: 'Sam', experience: '5 years' };
const REMOTIVE = { jobs: [{ id: 1, title: 'Dev', company_name: 'Co', candidate_required_location: 'EU', description: 'd', url: 'https://r/1', tags: ['js'] }] };

/** [name, method, path, body?, extras?]   extras: { ai, fetchImpl, adzunaCreds } */
const CASES = [
  // --- jobTracker (first router) -------------------------------------------------------------------------------
  ['tracker: list', 'GET', '/api/jobs'],
  ['tracker: list with trailing slash', 'GET', '/api/jobs/'],
  ['tracker: create', 'POST', '/api/jobs', { company: 'Acme', role: 'Dev', notes: 'n' }],
  ['tracker: create missing company', 'POST', '/api/jobs', { role: 'Dev' }],
  ['tracker: create missing role', 'POST', '/api/jobs', { company: 'Acme' }],
  ['tracker: create without a body', 'POST', '/api/jobs'],
  ['tracker: patch', 'PATCH', '/api/jobs/5', { status: 'offer', notes: 'x' }],
  ['tracker: patch invalid status', 'PATCH', '/api/jobs/5', { status: 'nope' }],
  ['tracker: patch not found', 'PATCH', '/api/jobs/404', { status: 'offer' }],
  ['tracker: patch without a body', 'PATCH', '/api/jobs/5'],
  ['tracker: patch non-numeric id', 'PATCH', '/api/jobs/abc', { notes: 'x' }],
  ['tracker: patch percent-encoded id', 'PATCH', '/api/jobs/a%20b', { notes: 'x' }],
  ['tracker: patch encoded slash in id', 'PATCH', '/api/jobs/a%2Fb', { notes: 'x' }],
  ['tracker: delete', 'DELETE', '/api/jobs/5'],
  ['tracker: delete not found', 'DELETE', '/api/jobs/404'],
  ['tracker: delete non-numeric id', 'DELETE', '/api/jobs/abc'],

  // --- the other four /api/jobs routers -------------------------------------------------------------------------
  ['analyzer: short description', 'POST', '/api/jobs/analyze-description', { jobDescription: 'short' }],
  ['analyzer: fallback analysis', 'POST', '/api/jobs/analyze-description', { jobDescription: LONG_JD }],
  ['analyzer: AI json', 'POST', '/api/jobs/analyze-description', { jobDescription: LONG_JD }, { ai: { ok: true, data: '{"requiredSkills":["React"],"seniority":"Senior"}' } }],
  ['analyzer: no body', 'POST', '/api/jobs/analyze-description'],
  ['analyzer: trailing slash', 'POST', '/api/jobs/analyze-description/', { jobDescription: LONG_JD }],
  ['cover letter: fallback letter', 'POST', '/api/jobs/generate-cover-letter', CL_BODY],
  ['cover letter: AI text', 'POST', '/api/jobs/generate-cover-letter', { ...CL_BODY, tone: 'friendly' }, { ai: { ok: true, data: ' Hello there. ' } }],
  ['cover letter: missing field', 'POST', '/api/jobs/generate-cover-letter', { companyName: 'Acme' }],
  ['discover: default mock source', 'GET', '/api/jobs/discover'],
  ['discover: trailing slash', 'GET', '/api/jobs/discover/'],
  ['discover: upper-case source value', 'GET', '/api/jobs/discover?source=MOCK&query=%20dev%20'],
  ['discover: invalid source', 'GET', '/api/jobs/discover?source=bogus'],
  ['discover: repeated query key', 'GET', '/api/jobs/discover?query=a&query=b'],
  ['discover: remotive (same payload on both sides)', 'GET', '/api/jobs/discover?source=remotive&query=react', undefined, { fetchImpl: json(REMOTIVE) }],
  ['discover: adzuna without credentials', 'GET', '/api/jobs/discover?source=adzuna&query=dev'],
  ['discover: adzuna with credentials', 'GET', '/api/jobs/discover?source=adzuna&query=dev&location=London', undefined,
    { adzunaCreds: true, fetchImpl: json({ results: [{ id: 5, title: 'T', company: { display_name: 'C' }, location: { display_name: 'L' }, description: 'D', redirect_url: 'https://a/5', category: { label: 'IT' } }] }) }],
  ['fit: rule-based', 'POST', '/api/jobs/fit', { resumeText: 'Senior Python and React developer', jobDescription: 'Senior Python engineer, React' }],
  ['fit: AI scores', 'POST', '/api/jobs/fit', { resumeText: 'Senior Python developer', jobDescription: 'Python engineer' }, { ai: { ok: true, data: '{"domainScore":70,"seniorityScore":55}' } }],
  ['fit: missing field', 'POST', '/api/jobs/fit', { resumeText: 'x' }],
  ['fit: no body', 'POST', '/api/jobs/fit'],
  ['fit: trailing slash', 'POST', '/api/jobs/fit/', { resumeText: 'a', jobDescription: 'b' }],

  // --- sibling mount /api/jobs/achievement-enhancer (registered after all five) --------------------------------
  ['enhancer: enhance', 'POST', '/api/jobs/achievement-enhancer/enhance', { achievements: ['Created Attendance System', 'made reports faster'], role: 'SWE' }],
  ['enhancer: enhance with AI bullets', 'POST', '/api/jobs/achievement-enhancer/enhance', { achievement: 'made an app' }, { ai: { ok: true, data: '- Built an app.' } }],
  ['enhancer: nothing to enhance', 'POST', '/api/jobs/achievement-enhancer/enhance', {}],
  ['enhancer: no body', 'POST', '/api/jobs/achievement-enhancer/enhance'],
  ['enhancer: trailing slash', 'POST', '/api/jobs/achievement-enhancer/enhance/', { achievement: 'made an app' }],

  // --- SHADOWING / OVERLAP: param routes vs static routes (jobTracker's PATCH|DELETE /:id is registered FIRST) ---
  // The tracker's /:id captures ANY single segment for PATCH and DELETE, including the static route names.
  ['shadow: PATCH /discover -> tracker :id', 'PATCH', '/api/jobs/discover', { notes: 'x' }],
  ['shadow: PATCH /fit -> tracker :id', 'PATCH', '/api/jobs/fit', { notes: 'x' }],
  ['shadow: PATCH /analyze-description -> tracker :id', 'PATCH', '/api/jobs/analyze-description', { notes: 'x' }],
  ['shadow: PATCH /generate-cover-letter -> tracker :id', 'PATCH', '/api/jobs/generate-cover-letter', { notes: 'x' }],
  ['shadow: PATCH /achievement-enhancer -> tracker :id', 'PATCH', '/api/jobs/achievement-enhancer', { notes: 'x' }],
  ['shadow: DELETE /discover -> tracker :id', 'DELETE', '/api/jobs/discover'],
  ['shadow: DELETE /achievement-enhancer -> tracker :id', 'DELETE', '/api/jobs/achievement-enhancer'],
  // ...but :id never captures two segments, so the nested mount is not swallowed:
  ['no shadow: PATCH /achievement-enhancer/enhance is 404', 'PATCH', '/api/jobs/achievement-enhancer/enhance', { notes: 'x' }],
  ['no shadow: DELETE /achievement-enhancer/enhance is 404', 'DELETE', '/api/jobs/achievement-enhancer/enhance'],
  // no GET/PUT/POST param route exists, so static routes are only reachable by their own method:
  ['404: GET /api/jobs/5 (no GET /:id exists)', 'GET', '/api/jobs/5'],
  ['404: PUT /api/jobs/5', 'PUT', '/api/jobs/5', { notes: 'x' }],
  ['404: GET /fit (route is POST only)', 'GET', '/api/jobs/fit'],
  ['404: GET /analyze-description', 'GET', '/api/jobs/analyze-description'],
  ['404: GET /generate-cover-letter', 'GET', '/api/jobs/generate-cover-letter'],
  ['404: POST /discover (route is GET only)', 'POST', '/api/jobs/discover', {}],
  ['404: POST /achievement-enhancer (needs /enhance)', 'POST', '/api/jobs/achievement-enhancer', { achievement: 'x' }],
  ['404: GET /achievement-enhancer/enhance (route is POST only)', 'GET', '/api/jobs/achievement-enhancer/enhance'],
  ['404: GET /achievement-enhancer', 'GET', '/api/jobs/achievement-enhancer'],
  ['404: POST /api/jobs/nope', 'POST', '/api/jobs/nope', {}],
  ['404: POST /api/jobs/5/extra', 'POST', '/api/jobs/5/extra', {}],
  ['404: PATCH /api/jobs (collection has no PATCH)', 'PATCH', '/api/jobs', { notes: 'x' }],
  ['404: DELETE /api/jobs (collection has no DELETE)', 'DELETE', '/api/jobs'],
];

const TS = /\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d+Z/g;
const mask = (t) => t.replace(TS, '<ts>');

let expressApp;
const savedEnv = {};

beforeAll(() => {
  for (const [k, v] of Object.entries(ENV_VARS)) {
    savedEnv[k] = process.env[k];
    process.env[k] = v;
  }
  expressApp = buildExpressApp();
});
afterAll(() => {
  for (const k of Object.keys(ENV_VARS)) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
});

beforeEach(() => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  jest.restoreAllMocks();
  delete process.env.ADZUNA_APP_ID;
  delete process.env.ADZUNA_APP_KEY;
});

async function runBoth([, method, path, body, extras = {}]) {
  const aiReply = extras.ai || { ok: false, error: 'down', data: null };
  const originalFetch = globalThis.fetch;

  // ---- Express ----
  pool.query.mockReset();
  pool.query.mockImplementation(async (sql, params) => script(norm(sql), params));
  expressAi.callAI.mockReset();
  expressAi.callAI.mockImplementation(async () => aiReply);
  nodeFetch.mockReset();
  nodeFetch.mockImplementation(extras.fetchImpl || (async () => { throw new Error('unexpected fetch'); }));
  if (extras.adzunaCreds) {
    process.env.ADZUNA_APP_ID = 'id-1';
    process.env.ADZUNA_APP_KEY = 'key-1';
  }
  const adzunaFetch = jest.fn(extras.fetchImpl || (async () => { throw new Error('unexpected fetch'); }));
  globalThis.fetch = adzunaFetch;
  let ex;
  try {
    let req = supertest(expressApp)[method.toLowerCase()](path);
    if (body !== undefined) req = req.set('Content-Type', 'application/json').send(JSON.stringify(body));
    const res = await req;
    ex = { status: res.status, text: mask(res.text) };
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.ADZUNA_APP_ID;
    delete process.env.ADZUNA_APP_KEY;
  }
  const exDb = pool.query.mock.calls.map(([sql, params]) => ({ sql: norm(sql), params }));
  const exAi = expressAi.callAI.mock.calls.map(([opts]) => opts);
  const exAdzunaCalls = adzunaFetch.mock.calls;

  // ---- Worker ----
  const wkFetch = jest.fn(extras.fetchImpl || (async () => { throw new Error('unexpected fetch'); }));
  const H = makeJobsHarness({
    script,
    envOverrides: { ...ENV_VARS, ...(extras.adzunaCreds ? { ADZUNA_APP_ID: 'id-1', ADZUNA_APP_KEY: 'key-1' } : {}) },
    fakes: { fetch: wkFetch, onetLoader },
  });
  H.fakes.aiClient.reply = aiReply;
  const res = await H.call(method, path, body);
  const wk = { status: res.status, text: mask(await res.text()) };

  return { ex, wk, exDb, wkDb: H.appCalls, exAi, wkAi: H.fakes.aiClient.calls, exAdzunaCalls, wkFetchCalls: wkFetch.mock.calls, exRemotiveCalls: nodeFetch.mock.calls };
}

describe('/api/jobs group: Worker routing == Express routing (representative requests across all six routers)', () => {
  it.each(CASES.map((c) => [c[0], c]))('%s', async (_name, def) => {
    const r = await runBoth(def);
    expect({ status: r.wk.status, text: r.wk.text }).toEqual({ status: r.ex.status, text: r.ex.text });
    expect(r.wkDb).toEqual(r.exDb);
    expect(r.wkAi).toEqual(r.exAi);
  });

  it('the requests really exercised every one of the six route files (guards against a vacuous table)', async () => {
    const seen = new Set();
    for (const def of CASES) {
      const r = await runBoth(def);
      const t = r.ex.text;
      if (r.exDb.some((c) => c.sql.startsWith('SELECT ja.*') || c.sql.startsWith('INSERT INTO job_applications') || c.sql.startsWith('UPDATE job_applications') || c.sql.startsWith('DELETE FROM job_applications'))) seen.add('jobTracker');
      if (def[2].includes('analyze-description') && def[1] === 'POST' && r.ex.status === 200) seen.add('jobAnalyzer');
      if (def[2].includes('generate-cover-letter') && r.ex.status === 200) seen.add('coverLetter');
      if (r.exDb.some((c) => c.sql.startsWith('INSERT INTO discovered_jobs'))) seen.add('jobDiscovery');
      if (t.includes('"breakdown"')) seen.add('jobFit');
      if (t.includes('"roleHint"')) seen.add('achievementEnhancer');
    }
    expect([...seen].sort()).toEqual(['achievementEnhancer', 'coverLetter', 'jobAnalyzer', 'jobDiscovery', 'jobFit', 'jobTracker']);
  });

  it('outbound calls for the remotive / adzuna cases are equivalent on both sides', async () => {
    const remotive = CASES.find((c) => c[0].startsWith('discover: remotive'));
    const r1 = await runBoth(remotive);
    expect(r1.wkFetchCalls).toEqual(r1.exRemotiveCalls);

    const adzuna = CASES.find((c) => c[0] === 'discover: adzuna with credentials');
    const r2 = await runBoth(adzuna);
    expect(r2.wkFetchCalls).toEqual(r2.exAdzunaCalls);
    expect(r2.wkFetchCalls[0][0]).toContain('https://api.adzuna.com/v1/api/jobs/gb/search/1?');
  });

  describe('explicit shadowing assertions on the Worker app', () => {
    // listRoutes = one entry per terminal endpoint, in registration order (app.routes has one entry per handler)
    const workerRoutes = () => listRoutes(makeJobsHarness().app);

    it('registration order is the Express order: tracker, analyzer, cover letter, discovery, fit, achievement-enhancer', () => {
      const routes = workerRoutes().filter((r) => r.path.startsWith('/api/jobs'));
      expect(routes.map((r) => `${r.method} ${r.path}`)).toEqual([
        'GET /api/jobs',
        'POST /api/jobs',
        'PATCH /api/jobs/:id',
        'DELETE /api/jobs/:id',
        'POST /api/jobs/analyze-description',
        'POST /api/jobs/generate-cover-letter',
        'GET /api/jobs/discover',
        'POST /api/jobs/fit',
        'POST /api/jobs/achievement-enhancer/enhance',
      ]);
    });

    it('for every endpoint, the FIRST registered route matching its own concrete path and method is itself (nothing earlier shadows it)', () => {
      const routes = workerRoutes().filter((r) => r.path.startsWith('/api/jobs'));
      for (const target of routes) {
        const concrete = target.path.replace(/:[A-Za-z0-9_]+/g, '123');
        const first = routes.find((r) => r.method === target.method && patternToRegExp(r.path).test(concrete));
        expect({ target: `${target.method} ${target.path}`, first: `${first.method} ${first.path}` }).toEqual({
          target: `${target.method} ${target.path}`,
          first: `${target.method} ${target.path}`,
        });
      }
    });

    it('specifically: no route registered before POST /api/jobs/achievement-enhancer/enhance can match that method+path', () => {
      const routes = workerRoutes().filter((r) => r.path.startsWith('/api/jobs'));
      const idx = routes.findIndex((r) => r.method === 'POST' && r.path === '/api/jobs/achievement-enhancer/enhance');
      expect(idx).toBe(routes.length - 1);
      const shadows = routes.slice(0, idx).filter((r) => r.method === 'POST' && patternToRegExp(r.path).test('/api/jobs/achievement-enhancer/enhance'));
      expect(shadows).toEqual([]);
    });

    it('the param routes are exactly PATCH and DELETE /api/jobs/:id, which is why /discover, /fit etc. are captured for those two methods only', () => {
      const params = workerRoutes().filter((r) => r.path.includes(':'));
      expect(params.map((r) => `${r.method} ${r.path}`)).toEqual(['PATCH /api/jobs/:id', 'DELETE /api/jobs/:id']);
    });
  });

  describe('known, documented differences (not parity failures)', () => {
    it('malformed percent-encoding in a :param: Express answers 400 "Failed to decode param" itself; Hono hands the raw text to the handler (NaN id -> database error)', async () => {
      const r = await runBoth(['malformed', 'PATCH', '/api/jobs/%E0%A4%A', { notes: 'x' }]);
      expect(r.ex.status).toBe(400);
      expect(r.ex.text).toBe(`{"error":"Failed to decode param '%E0%A4%A'"}`);
      expect([400, 500]).toContain(r.wk.status); // an error either way; today 500 via the NaN id (generic router difference, not jobs-specific)
    });

    it('path case: Express routing is case-insensitive, Hono is case-sensitive (frontend uses lower-case paths)', async () => {
      const def = ['case', 'GET', '/api/jobs/DISCOVER'];
      const r = await runBoth(def);
      expect(r.ex.status).toBe(200);
      expect(r.wk.status).toBe(404);
    });
  });
});
