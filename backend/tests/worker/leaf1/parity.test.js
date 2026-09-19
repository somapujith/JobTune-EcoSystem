'use strict';

/**
 * Differential test: the Worker service ports against the Express originals they were copied
 * from, on the same inputs. The Express modules are loaded with their side-effect imports
 * mocked (shared pool, aiClient), so nothing connects anywhere. Compared: return values,
 * thrown error messages, SQL text + bound parameters, and the callAI arguments.
 *
 * This catches transcription drift (a changed prompt, SQL string, threshold or message).
 * It proves nothing about Neon or the Workers runtime.
 */
jest.mock('../../../src/config/database', () => ({ pool: { query: jest.fn() } }));
jest.mock('../../../src/utils/aiClient', () => ({ callAI: jest.fn() }));

const { pool } = require('../../../src/config/database');
const expressAi = require('../../../src/utils/aiClient');

const expressProgress = require('../../../src/services/progressService');
const expressBench = require('../../../src/services/benchmarks/scorerBenchmark');
const expressGuides = require('../../../src/services/guides/jobGuideGenerator');
const expressConsistency = require('../../../src/services/resumeConsistencyService');
const expressVisibility = require('../../../src/services/recruiterVisibilityService');

const { createProgressService } = require('../../../src/worker/services/progressService');
const { createScorerBenchmark } = require('../../../src/worker/services/benchmarks/scorerBenchmark');
const { createJobGuideGenerator, buildFallbackGuide } = require('../../../src/worker/services/guides/jobGuideGenerator');
const { createResumeConsistencyService } = require('../../../src/worker/services/resumeConsistencyService');
const { createRecruiterVisibilityService } = require('../../../src/worker/services/recruiterVisibilityService');

// Tiny deterministic PRNG so the generated batteries are reproducible.
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
const sample = (r, arr, n) => Array.from({ length: n }, () => pick(r, arr));

/** Run fn, returning { value } or { error: {message, statusCode} } so throws compare too. */
async function outcome(fn) {
  try {
    return { value: await fn() };
  } catch (e) {
    return { error: { message: e.message, statusCode: e.statusCode } };
  }
}
const stripTime = (o) => JSON.parse(JSON.stringify(o, (k, v) => (k === 'generatedAt' ? undefined : v)));

/**
 * Run `scenario(api)` once against the Express module (pool mocked) and once against the Worker
 * port (db mocked) with the same scripted query results; return both traces.
 */
async function runBoth({ queue = [], ai = [], express, worker }) {
  const script = (fn) => {
    queue.forEach((q) => (q instanceof Error ? fn.mockRejectedValueOnce(q) : fn.mockResolvedValueOnce(q)));
  };

  pool.query.mockReset();
  expressAi.callAI.mockReset();
  script(pool.query);
  ai.forEach((a) => (a instanceof Error ? expressAi.callAI.mockRejectedValueOnce(a) : expressAi.callAI.mockResolvedValueOnce(a)));
  const e = await outcome(() => express());
  const eTrace = { sql: pool.query.mock.calls.map((c) => [c[0], c[1]]), ai: expressAi.callAI.mock.calls.map((c) => c[0]) };

  const db = { query: jest.fn() };
  const workerAi = { callAI: jest.fn() };
  script(db.query);
  ai.forEach((a) => (a instanceof Error ? workerAi.callAI.mockRejectedValueOnce(a) : workerAi.callAI.mockResolvedValueOnce(a)));
  const w = await outcome(() => worker({ db, aiClient: workerAi }));
  const wTrace = { sql: db.query.mock.calls.map((c) => [c[0], c[1]]), ai: workerAi.callAI.mock.calls.map((c) => c[0]) };

  return { e, w, eTrace, wTrace };
}

describe('progressService parity', () => {
  const rows = [{ progress_data: { a: 1 }, updated_at: '2026-01-01' }];
  const scenarios = [
    ['getProgress hit', [{ rows }], (s) => s.getProgress(3, 'zero-to-hero')],
    ['getProgress miss', [{ rows: [] }], (s) => s.getProgress(3, 'preferences')],
    ['getProgress null data', [{ rows: [{ progress_data: null, updated_at: 'x' }] }], (s) => s.getProgress(3, 'preferences')],
    ['getAllProgress', [{ rows: [{ context_key: 'a', progress_data: null, updated_at: 't' }, { context_key: 'b', progress_data: { z: 1 }, updated_at: 'u' }] }], (s) => s.getAllProgress(3)],
    ['saveProgress', [{ rows }], (s) => s.saveProgress(3, 'zero-to-hero', { a: 1, n: { m: [1, 2] } })],
    ['saveProgress null', [{ rows }], (s) => s.saveProgress(3, 'zero-to-hero', null)],
    ['mergeProgress', [{ rows }, { rows: [{ progress_data: { a: 1, b: 2 }, updated_at: 't' }] }], (s) => s.mergeProgress(3, 'zero-to-hero', { b: 2 })],
    ['mergeProgress null partial', [{ rows: [] }, { rows }], (s) => s.mergeProgress(3, 'zero-to-hero', null)],
    ['db error', [new Error('boom')], (s) => s.getProgress(3, 'zero-to-hero')],
  ];

  it.each(scenarios)('%s', async (_name, queue, call) => {
    const { e, w, eTrace, wTrace } = await runBoth({
      queue,
      express: () => call(expressProgress),
      worker: ({ db }) => call(createProgressService({ db })),
    });
    expect(w).toEqual(e);
    expect(wTrace).toEqual(eTrace);
  });

  it('validateContext agrees on a battery of keys', () => {
    const svc = createProgressService({ db: { query: jest.fn() } });
    for (const k of ['zero-to-hero', 'learn-and-build', 'tune-and-polish', 'preferences', '', 'x', 'constructor', '__proto__', 'ZERO-TO-HERO', undefined, null, 1]) {
      expect(svc.validateContext(k)).toBe(expressProgress.validateContext(k));
    }
  });
});

describe('scorerBenchmark parity', () => {
  it('FIXTURE_DATASET is identical', () => {
    expect(createScorerBenchmark({ db: {} }).FIXTURE_DATASET).toEqual(expressBench.FIXTURE_DATASET);
  });

  it('computeMetrics agrees on random score arrays (incl. thresholds)', () => {
    const r = rng(7);
    const worker = createScorerBenchmark({ db: {} });
    for (let i = 0; i < 200; i++) {
      const n = 1 + Math.floor(r() * 9);
      const h = Array.from({ length: n }, () => Math.round(r() * 100));
      const m = Array.from({ length: n }, () => Math.round(r() * 100));
      const opts = i % 3 === 0 ? { threshold: Math.round(r() * 100) } : undefined;
      expect(worker.computeMetrics(h, m, opts)).toEqual(expressBench.computeMetrics(h, m, opts));
    }
    for (const bad of [[[], []], [[1], []], [[1, 2], [1]]]) {
      expect(() => worker.computeMetrics(...bad)).toThrow(
        (() => { try { expressBench.computeMetrics(...bad); } catch (e) { return e.message; } })()
      );
    }
  });

  it.each(['ats', 'hr', 'fit', 'unknown-scorer', 'constructor', 'toString', ['hr', 'fit']])(
    'runBenchmark(%p): same result and same INSERT',
    async (scorerName) => {
      const { e, w, eTrace, wTrace } = await runBoth({
        queue: [{ rows: [] }],
        express: () => expressBench.runBenchmark({ scorerName, datasetName: 'ds' }),
        worker: ({ db }) => createScorerBenchmark({ db }).runBenchmark({ scorerName, datasetName: 'ds' }),
      });
      expect(w).toEqual(e);
      expect(wTrace).toEqual(eTrace);
    }
  );

  it('argument validation and db errors agree', async () => {
    for (const args of [{}, { scorerName: 'ats' }, { datasetName: 'd' }]) {
      const { e, w, wTrace } = await runBoth({
        express: () => expressBench.runBenchmark(args),
        worker: ({ db }) => createScorerBenchmark({ db }).runBenchmark(args),
      });
      expect(w).toEqual(e);
      expect(wTrace.sql).toEqual([]);
    }
    const { e, w } = await runBoth({
      queue: [new Error('DB connection lost')],
      express: () => expressBench.runBenchmark({ scorerName: 'ats', datasetName: 'd' }),
      worker: ({ db }) => createScorerBenchmark({ db }).runBenchmark({ scorerName: 'ats', datasetName: 'd' }),
    });
    expect(w).toEqual(e);
  });
});

describe('jobGuideGenerator parity', () => {
  const APP = { id: 42, user_id: 1, company: 'Stripe', role: 'Senior Software Engineer', job_description: 'Build scalable payment APIs.' };
  const GOOD = { questions: ['Q1', 'Q2'], talkingPoints: ['T1'], companyResearch: 'R' };
  const ok = (payload) => ({ ok: true, data: typeof payload === 'string' ? payload : JSON.stringify(payload), error: null });

  const scenarios = [
    ['application + good LLM', { applicationId: 42, userId: 1 }, [{ rows: [APP] }, { rows: [{ id: 9 }] }], [ok(GOOD)]],
    ['application + fenced LLM JSON', { applicationId: 42, userId: 1 }, [{ rows: [APP] }, { rows: [{ id: 9 }] }], [ok('```json\n' + JSON.stringify(GOOD) + '\n```')]],
    ['application, llm ok:false', { applicationId: 42, userId: 1 }, [{ rows: [APP] }, { rows: [{ id: 9 }] }], [{ ok: false, data: null, error: 'x' }]],
    ['application, llm throws', { applicationId: 42, userId: 1 }, [{ rows: [APP] }, { rows: [{ id: 9 }] }], [new Error('net')]],
    ['application, llm wrong shape', { applicationId: 42, userId: 1 }, [{ rows: [APP] }, { rows: [{ id: 9 }] }], [ok({ questions: [] })]],
    ['application with null fields', { applicationId: 42, role: 'Fallback Role', jobDescription: 'Fallback JD', userId: 1 }, [{ rows: [{ id: 42, company: null, role: null, job_description: null }] }, { rows: [{ id: 3 }] }], [{ ok: false }]],
    ['description + role only', { jobDescription: 'Build things', role: 'SRE', userId: 5 }, [{ rows: [{ id: 2 }] }], [ok(GOOD)]],
    ['description only, no role', { jobDescription: 'Build things', userId: 5 }, [{ rows: [{ id: 2 }] }], [{ ok: false }]],
    ['application not found', { applicationId: 999, userId: 1 }, [{ rows: [] }], []],
    ['nothing supplied', { userId: 1 }, [], []],
    ['insert fails', { jobDescription: 'x', userId: 1 }, [new Error('insert failed')], [ok(GOOD)]],
  ];

  it.each(scenarios)('generateJobGuide: %s', async (_n, args, queue, ai) => {
    const { e, w, eTrace, wTrace } = await runBoth({
      queue,
      ai,
      express: () => expressGuides.generateJobGuide(args),
      worker: ({ db, aiClient }) => createJobGuideGenerator({ db, services: { aiClient } }).generateJobGuide(args),
    });
    expect(w).toEqual(e);
    expect(wTrace).toEqual(eTrace); // identical SQL, params, and callAI arguments (prompts)
  });

  it.each([
    ['found', [{ rows: [{ id: 5, user_id: 1, guide: GOOD }] }]],
    ['not found', [{ rows: [] }]],
    ['db error', [new Error('boom')]],
  ])('getJobGuide: %s', async (_n, queue) => {
    const { e, w, eTrace, wTrace } = await runBoth({
      queue,
      express: () => expressGuides.getJobGuide({ id: 5, userId: 1 }),
      worker: ({ db, aiClient }) => createJobGuideGenerator({ db, services: { aiClient } }).getJobGuide({ id: 5, userId: 1 }),
    });
    expect(w).toEqual(e);
    expect(wTrace).toEqual(eTrace);
  });

  it('buildFallbackGuide agrees', () => {
    for (const args of [undefined, {}, { role: 'SRE' }, { company: 'Acme' }, { role: 'PM', company: 'Notion' }, { role: null, company: null }]) {
      expect(buildFallbackGuide(args)).toEqual(expressGuides.buildFallbackGuide(args));
    }
  });
});

describe('resumeConsistencyService parity', () => {
  const NAMES = ['React', 'react', 'Node.js', 'Python', 'Go', 'Rust', 'SQL', 'Docker', 'AWS', ' Kubernetes ', 'C++', 'C#', 'TypeScript'];
  const COMPANIES = ['Acme', 'acme inc', 'Globex', 'Initech', 'Umbrella', ''];
  const TITLES = ['Engineer', 'Senior Engineer', 'Manager', 'Intern', 'Data Analyst'];
  const DATES = ['2018', '2019-05', 'Mar 2020', 'Present', '', null, '2021', 2022];

  function profile(r, kind) {
    const p = {};
    if (r() < 0.8) p.name = pick(r, ['Ada Lovelace', 'Ada L', 'A. Lovelace', 'Grace Hopper']);
    if (r() < 0.6) p.headline = pick(r, ['Software Engineer', 'Senior Software Engineer', 'Data Scientist']);
    if (kind !== 'github' && r() < 0.8) p.skills = sample(r, NAMES, Math.floor(r() * 6));
    if (kind === 'github') {
      p.repos = sample(r, NAMES, Math.floor(r() * 5)).map((n, i) => (r() < 0.5 ? { name: `repo-${n}-${i % 2}`, language: pick(r, NAMES) } : `repo-${n}`));
      if (r() < 0.4) p.languages = sample(r, NAMES, 3);
    } else {
      p.projects = sample(r, NAMES, Math.floor(r() * 4)).map((n) => (r() < 0.5 ? { name: `repo-${n}-0` } : `repo-${n}`));
      p.experience = Array.from({ length: Math.floor(r() * 4) }, () => ({
        title: pick(r, TITLES), company: pick(r, COMPANIES), startDate: pick(r, DATES), endDate: pick(r, DATES),
      }));
    }
    return p;
  }

  it('checkConsistency agrees on 300 generated resume/linkedin/github combinations', async () => {
    const r = rng(11);
    const worker = createResumeConsistencyService();
    for (let i = 0; i < 300; i++) {
      const input = {};
      if (r() < 0.85) input.resume = profile(r, 'resume');
      if (r() < 0.75) input.linkedin = profile(r, 'linkedin');
      if (r() < 0.6) input.github = profile(r, 'github');
      const e = await outcome(() => expressConsistency.checkConsistency(input));
      const w = await outcome(() => worker.checkConsistency(input));
      expect(stripTime(w)).toEqual(stripTime(e));
    }
  });

  it('agrees on degenerate inputs (undefined, null members, wrong types, throwing cases)', async () => {
    const worker = createResumeConsistencyService();
    const inputs = [
      undefined, {}, { resume: {} }, { resume: 'str', linkedin: 5 }, { resume: { experience: [null] }, linkedin: {} },
      { resume: { skills: 'React' }, linkedin: { skills: 'react' } }, { github: { repos: [null, 'x', { language: null }] }, resume: {} },
      { resume: { experience: 'oops' }, linkedin: { experience: {} } },
    ];
    for (const input of inputs) {
      const e = await outcome(() => expressConsistency.checkConsistency(input));
      const w = await outcome(() => worker.checkConsistency(input));
      expect(stripTime(w)).toEqual(stripTime(e));
    }
  });
});

describe('recruiterVisibilityService parity', () => {
  const VOCAB = expressVisibility.RECRUITER_VOCABULARY;
  const FILLER = ['built', 'led', 'team', 'project', 'improved', 'reduced', '40%', '12', 'github.com/ada', 'linkedin.com/in/ada', 'ada@example.com', 'the', 'and', 'of'];

  function resumeText(r) {
    const n = Math.floor(r() * 500);
    return Array.from({ length: n }, () => (r() < 0.25 ? pick(r, VOCAB) : pick(r, FILLER))).join(r() < 0.5 ? ' ' : '\n');
  }
  function linkedin(r) {
    const c = r();
    if (c < 0.2) return undefined;
    if (c < 0.4) return { score: Math.round(r() * 130) - 10, metrics: [{ label: pick(r, VOCAB) }], suggestions: sample(r, ['a', 'b', 'c', 'd'], 4) };
    if (c < 0.5) return {};
    return {
      headline: 'h'.repeat(Math.floor(r() * 60)), about: sample(r, FILLER, Math.floor(r() * 150)).join(' '),
      skills: r() < 0.5 ? sample(r, VOCAB, Math.floor(r() * 14)) : sample(r, VOCAB, Math.floor(r() * 14)).join(', '),
      hasPhoto: r() < 0.5, hasFeatured: r() < 0.5,
    };
  }
  function github(r) {
    const c = r();
    if (c < 0.2) return undefined;
    if (c < 0.4) return { score: Math.round(r() * 130) - 10, languages: sample(r, VOCAB, 3), repoCount: 4, stars: 2, followers: 1, issues: ['i1', 'i2', 'i3', 'i4'] };
    if (c < 0.5) return {};
    return { publicRepos: Math.floor(r() * 30), totalStars: Math.floor(r() * 40), followers: Math.floor(r() * 50), languages: sample(r, VOCAB, Math.floor(r() * 6)), bio: pick(r, VOCAB) };
  }
  function keywords(r) {
    const c = r();
    if (c < 0.5) return undefined;
    if (c < 0.75) return sample(r, VOCAB, 1 + Math.floor(r() * 5)).map((k) => k.toUpperCase());
    return sample(r, VOCAB, 1 + Math.floor(r() * 5)).join(r() < 0.5 ? ', ' : '\n');
  }

  it('computeVisibility agrees on 300 generated inputs (values, 400 errors and other throws)', async () => {
    const r = rng(23);
    const worker = createRecruiterVisibilityService();
    for (let i = 0; i < 300; i++) {
      const input = { resumeText: r() < 0.8 ? resumeText(r) : undefined, linkedin: linkedin(r), github: github(r), targetKeywords: keywords(r) };
      const e = await outcome(() => expressVisibility.computeVisibility(input));
      const w = await outcome(() => worker.computeVisibility(input));
      expect(stripTime(w)).toEqual(stripTime(e));
    }
  });

  it('agrees on degenerate inputs', async () => {
    const worker = createRecruiterVisibilityService();
    const inputs = [undefined, {}, { resumeText: '   ' }, { linkedin: {}, github: {} }, { resumeText: 'react', targetKeywords: [123] }, { linkedin: { score: 'x' } }, { github: 'str' }];
    for (const input of inputs) {
      const e = await outcome(() => expressVisibility.computeVisibility(input));
      const w = await outcome(() => worker.computeVisibility(input));
      expect(stripTime(w)).toEqual(stripTime(e));
    }
  });

  it('the exported vocabulary is identical', () => {
    expect(createRecruiterVisibilityService().RECRUITER_VOCABULARY).toEqual(expressVisibility.RECRUITER_VOCABULARY);
  });
});
