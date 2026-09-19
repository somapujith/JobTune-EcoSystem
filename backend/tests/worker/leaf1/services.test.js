'use strict';

/**
 * Unit tests for the five leaf1 service ports, against a mock db / mock aiClient.
 * Adapted from backend/tests/{progressService,scorerBenchmark,jobGuideGenerator}.test.js
 * (which mock the Express-side pool) plus the pure services, which had no Express test.
 */
const {
  createScorerBenchmark,
  computeMetrics,
  FIXTURE_DATASET,
} = require('../../../src/worker/services/benchmarks/scorerBenchmark');
const { createProgressService } = require('../../../src/worker/services/progressService');
const { createJobGuideGenerator, buildFallbackGuide } = require('../../../src/worker/services/guides/jobGuideGenerator');
const {
  createResumeConsistencyService,
  norm,
  skillSet,
  projectSet,
  experienceList,
} = require('../../../src/worker/services/resumeConsistencyService');
const {
  createRecruiterVisibilityService,
  scoreResume,
  scoreLinkedIn,
  scoreGitHub,
  scoreKeywords,
  RECRUITER_VOCABULARY,
} = require('../../../src/worker/services/recruiterVisibilityService');

const mockDb = () => ({ query: jest.fn() });

describe('scorerBenchmark', () => {
  const HUMAN = [85, 72, 60, 90, 55];
  const MODEL = [80, 75, 65, 88, 50];

  it('computeMetrics: mae, correlation, precision@threshold', () => {
    const m = computeMetrics(HUMAN, MODEL);
    expect(m.mae).toBe(4);
    expect(m.correlation).toBeGreaterThan(0.9);
    expect(m.correlation).toBeLessThanOrEqual(1);
    // human >= 70: 85, 72, 90 ; model >= 70 for the same: 80, 75, 88 -> 3/3
    expect(m.precisionAtThreshold).toBe(1);
    expect(computeMetrics([70, 80], [70, 80]).mae).toBe(0);
    expect(computeMetrics([1, 1, 1], [1, 2, 3]).correlation).toBe(0); // zero variance -> 0
    expect(computeMetrics([10, 20], [90, 95]).precisionAtThreshold).toBe(0); // no human positives -> 0
  });

  it('computeMetrics: threshold option and input validation', () => {
    expect(computeMetrics([60, 80], [65, 60], { threshold: 60 }).precisionAtThreshold).toBe(1);
    expect(() => computeMetrics([1, 2, 3], [1, 2])).toThrow('Score arrays must have the same length');
    expect(() => computeMetrics([], [])).toThrow('Score arrays must not be empty');
  });

  it('FIXTURE_DATASET: 7 labelled pairs', () => {
    expect(FIXTURE_DATASET).toHaveLength(7);
    for (const item of FIXTURE_DATASET) {
      expect(item).toEqual({
        role: expect.any(String),
        resumeText: expect.any(String),
        jobDescription: expect.any(String),
        humanScore: expect.any(Number),
      });
    }
  });

  it('runBenchmark inserts one row and returns metrics + sampleSize', async () => {
    const db = mockDb();
    db.query.mockResolvedValueOnce({ rows: [] });
    const { runBenchmark } = createScorerBenchmark({ db });
    const result = await runBenchmark({ scorerName: 'hr', datasetName: 'default' });
    expect(Object.keys(result)).toEqual(['mae', 'correlation', 'precisionAtThreshold', 'sampleSize']);
    expect(result.sampleSize).toBe(7);
    expect(db.query).toHaveBeenCalledTimes(1);
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toBe('INSERT INTO scorer_benchmarks (scorer_name, dataset_name, metrics, sample_size) VALUES ($1, $2, $3, $4)');
    expect(params).toEqual(['hr', 'default', JSON.stringify({ mae: result.mae, correlation: result.correlation, precisionAtThreshold: result.precisionAtThreshold }), 7]);
  });

  it('runBenchmark validates its arguments and propagates db errors', async () => {
    const db = mockDb();
    const { runBenchmark } = createScorerBenchmark({ db });
    await expect(runBenchmark({ datasetName: 'd' })).rejects.toThrow('scorerName is required');
    await expect(runBenchmark({ scorerName: 'ats' })).rejects.toThrow('datasetName is required');
    expect(db.query).not.toHaveBeenCalled();
    db.query.mockRejectedValueOnce(new Error('DB connection lost'));
    await expect(runBenchmark({ scorerName: 'ats', datasetName: 'd' })).rejects.toThrow('DB connection lost');
  });

  it('the service object exposes the same API as the Express module exports', () => {
    const s = createScorerBenchmark({ db: mockDb() });
    expect(Object.keys(s).sort()).toEqual(['FIXTURE_DATASET', 'computeMetrics', 'runBenchmark']);
  });
});

describe('progressService', () => {
  it('validateContext allows exactly the four contexts', () => {
    const s = createProgressService({ db: mockDb() });
    for (const k of ['zero-to-hero', 'learn-and-build', 'tune-and-polish', 'preferences']) expect(s.validateContext(k)).toBe(true);
    for (const k of ['invalid', '', undefined, null, 'Preferences', '__proto__']) expect(s.validateContext(k)).toBe(false);
  });

  it('getProgress: existing row, no row, null data', async () => {
    const db = mockDb();
    const s = createProgressService({ db });
    db.query.mockResolvedValueOnce({ rows: [{ progress_data: { step: 3 }, updated_at: '2026-06-26' }] });
    expect(await s.getProgress(1, 'zero-to-hero')).toEqual({ data: { step: 3 }, updatedAt: '2026-06-26' });
    expect(db.query.mock.calls[0]).toEqual([
      'SELECT progress_data, updated_at FROM user_progress WHERE user_id = $1 AND context_key = $2',
      [1, 'zero-to-hero'],
    ]);
    db.query.mockResolvedValueOnce({ rows: [] });
    expect(await s.getProgress(1, 'zero-to-hero')).toEqual({ data: {}, updatedAt: null });
    db.query.mockResolvedValueOnce({ rows: [{ progress_data: null, updated_at: 'x' }] });
    expect((await s.getProgress(1, 'zero-to-hero')).data).toEqual({});
  });

  it('getAllProgress maps rows and handles empty', async () => {
    const db = mockDb();
    const s = createProgressService({ db });
    db.query.mockResolvedValueOnce({
      rows: [
        { context_key: 'learn-and-build', progress_data: { step: 1 }, updated_at: 'a' },
        { context_key: 'zero-to-hero', progress_data: null, updated_at: 'b' },
      ],
    });
    expect(await s.getAllProgress(1)).toEqual([
      { contextKey: 'learn-and-build', data: { step: 1 }, updatedAt: 'a' },
      { contextKey: 'zero-to-hero', data: {}, updatedAt: 'b' },
    ]);
    db.query.mockResolvedValueOnce({ rows: [] });
    expect(await s.getAllProgress(1)).toEqual([]);
  });

  it('saveProgress upserts with the JSON string (null -> "{}")', async () => {
    const db = mockDb();
    const s = createProgressService({ db });
    db.query.mockResolvedValue({ rows: [{ progress_data: { step: 3 }, updated_at: 't' }] });
    expect(await s.saveProgress(1, 'zero-to-hero', { step: 3 })).toEqual({ data: { step: 3 }, updatedAt: 't' });
    expect(db.query.mock.calls[0][0]).toContain('ON CONFLICT (user_id, context_key)');
    expect(db.query.mock.calls[0][1]).toEqual([1, 'zero-to-hero', '{"step":3}']);
    await s.saveProgress(1, 'preferences', null);
    expect(db.query.mock.calls[1][1][2]).toBe('{}');
  });

  it('mergeProgress: getProgress then saveProgress with the shallow merge; methods are destructurable closures', async () => {
    const db = mockDb();
    const { mergeProgress } = createProgressService({ db }); // destructured: no `this` dependence
    db.query
      .mockResolvedValueOnce({ rows: [{ progress_data: { step: 1, name: 'test' }, updated_at: 'a' }] })
      .mockResolvedValueOnce({ rows: [{ progress_data: { step: 2, name: 'test' }, updated_at: 'b' }] });
    const out = await mergeProgress(1, 'zero-to-hero', { step: 2 });
    expect(out).toEqual({ data: { step: 2, name: 'test' }, updatedAt: 'b' });
    expect(JSON.parse(db.query.mock.calls[1][1][2])).toEqual({ step: 2, name: 'test' });
  });
});

describe('jobGuideGenerator', () => {
  const APP = { id: 42, user_id: 1, company: 'Stripe', role: 'Senior Software Engineer', job_description: 'Build scalable payment APIs.' };
  const GOOD = { questions: ['Q'], talkingPoints: ['T'], companyResearch: 'R' };
  const make = (callAI) => {
    const db = mockDb();
    const ai = { callAI: jest.fn(callAI) };
    return { db, ai, gen: createJobGuideGenerator({ db, services: { aiClient: ai } }) };
  };

  it('generates via the LLM, persists, and returns the guide + savedId', async () => {
    const { db, ai, gen } = make(async () => ({ ok: true, data: JSON.stringify(GOOD), error: null }));
    db.query.mockResolvedValueOnce({ rows: [APP] }).mockResolvedValueOnce({ rows: [{ id: 99 }] });
    expect(await gen.generateJobGuide({ applicationId: 42, userId: 1 })).toEqual({ ...GOOD, savedId: 99 });
    expect(db.query.mock.calls[0]).toEqual(['SELECT * FROM job_applications WHERE id = $1 AND user_id = $2', [42, 1]]);
    expect(db.query.mock.calls[1]).toEqual([
      'INSERT INTO job_guides (user_id, application_id, guide) VALUES ($1, $2, $3) RETURNING id',
      [1, 42, JSON.stringify(GOOD)],
    ]);
    expect(ai.callAI).toHaveBeenCalledWith({
      systemPrompt: expect.stringContaining('expert career coach'),
      userPrompt: expect.stringContaining('applying to Stripe for the role: Senior Software Engineer.'),
      maxTokens: 1024,
      temperature: 0.5,
    });
  });

  it('application fields win over passed role/description; description-only path skips the lookup', async () => {
    const { db, ai, gen } = make(async () => ({ ok: false }));
    db.query.mockResolvedValueOnce({ rows: [{ id: 1 }] });
    await gen.generateJobGuide({ jobDescription: 'Build ML pipelines in Python.', role: 'Data Engineer', userId: 1 });
    expect(db.query).toHaveBeenCalledTimes(1);
    expect(ai.callAI.mock.calls[0][0].userPrompt).toContain('applying to  for the role: Data Engineer.'); // company is '' (existing behaviour)
  });

  it.each([
    ['ok false', async () => ({ ok: false, data: null })],
    ['throws', async () => { throw new Error('Network'); }],
    ['bad json', async () => ({ ok: true, data: 'nope {{' })],
    ['wrong shape', async () => ({ ok: true, data: '{"questions":"x"}' })],
  ])('falls back to the template when the LLM %s', async (_l, impl) => {
    const { db, gen } = make(impl);
    db.query.mockResolvedValueOnce({ rows: [{ id: 5 }] });
    const out = await gen.generateJobGuide({ jobDescription: 'x', role: 'SRE', userId: 1 });
    expect(out).toEqual({ ...buildFallbackGuide({ role: 'SRE', company: '' }), savedId: 5 });
  });

  it('throws the Express error messages', async () => {
    const { db, gen } = make(async () => ({ ok: false }));
    await expect(gen.generateJobGuide({ userId: 1 })).rejects.toThrow('applicationId or jobDescription is required');
    db.query.mockResolvedValueOnce({ rows: [] });
    await expect(gen.generateJobGuide({ applicationId: 999, userId: 1 })).rejects.toThrow('Application 999 not found');
    db.query.mockResolvedValueOnce({ rows: [] });
    await expect(gen.getJobGuide({ id: 7, userId: 1 })).rejects.toThrow('Guide 7 not found');
  });

  it('getJobGuide returns the row scoped by user', async () => {
    const { db, gen } = make(async () => ({ ok: false }));
    const row = { id: 5, user_id: 1, guide: GOOD };
    db.query.mockResolvedValueOnce({ rows: [row] });
    expect(await gen.getJobGuide({ id: 5, userId: 1 })).toBe(row);
    expect(db.query.mock.calls[0]).toEqual(['SELECT * FROM job_guides WHERE id = $1 AND user_id = $2', [5, 1]]);
  });

  it('buildFallbackGuide handles missing / null inputs', () => {
    expect(() => buildFallbackGuide()).not.toThrow();
    const g = buildFallbackGuide({ role: null, company: undefined });
    expect(g.questions).toHaveLength(9);
    expect(g.questions[7]).toContain('this role');
    expect(g.companyResearch).toMatch(/^Research the company thoroughly/);
  });
});

describe('resumeConsistencyService (pure)', () => {
  const svc = createResumeConsistencyService();

  it('exposes the Express export set and holds no state', () => {
    expect(Object.keys(svc).sort()).toEqual(['checkConsistency', 'experienceList', 'norm', 'projectSet', 'skillSet']);
    expect(svc.norm).toBe(norm);
    expect(svc.skillSet).toBe(skillSet);
    expect(svc.projectSet).toBe(projectSet);
    expect(svc.experienceList).toBe(experienceList);
  });

  it('norm / skillSet / projectSet / experienceList helpers', () => {
    expect(norm('  C++ / Node.JS!! ')).toBe('c++ node.js');
    expect(norm(null)).toBe('');
    expect([...skillSet({ skills: ['React', 'react', ' React '] }).keys()]).toEqual(['react']);
    // github-style: languages + repo languages when there are no explicit skills
    expect([...skillSet({ languages: ['Go'], repos: [{ name: 'a', language: 'Rust' }, 'b'] }).keys()]).toEqual(['go', 'rust']);
    expect(skillSet(null).size).toBe(0);
    expect([...projectSet({ repos: [{ name: 'Alpha' }, 'beta'] }).keys()]).toEqual(['alpha', 'beta']);
    expect(experienceList({ experience: [{ title: 'Eng', company: 'Acme', startDate: '2019-05', endDate: 'Mar 2021' }] })).toEqual([
      { title: 'Eng', company: 'Acme', titleKey: 'eng', companyKey: 'acme', start: 2019, end: 2021 },
    ]);
  });

  it('no sources: no mismatches and a null score', () => {
    const r = svc.checkConsistency();
    expect(r.consistencyScore).toBeNull();
    expect(r.summary).toEqual({ totalMismatches: 0, sourcesProvided: [], comparable: false });
  });

  it('score is floored at 0 and weighted by severity', () => {
    const many = Array.from({ length: 40 }, (_, i) => `Skill${i}`);
    const r = svc.checkConsistency({ resume: { skills: many }, linkedin: { skills: [] } });
    expect(r.summary.totalMismatches).toBe(40);
    expect(r.consistencyScore).toBe(0); // 40 * 4 = 160 penalty
  });

  it('missing experience at LinkedIn, and unmatched-company rows are skipped when there is no company', () => {
    const r = svc.checkConsistency({
      resume: { experience: [{ title: 'Eng', company: 'Acme' }, { title: 'No company' }] },
      linkedin: { experience: [] },
    });
    expect(r.mismatches).toEqual([
      {
        category: 'Experience Missing in LinkedIn',
        severity: 'medium',
        source: 'resume',
        target: 'linkedin',
        items: ['Eng @ Acme'],
        details: 'Resume roles without a matching company on LinkedIn.',
      },
    ]);
    expect(r.consistencyScore).toBe(96);
  });
});

describe('recruiterVisibilityService (pure)', () => {
  const svc = createRecruiterVisibilityService();

  it('exposes the Express export set', () => {
    expect(Object.keys(svc).sort()).toEqual(['RECRUITER_VOCABULARY', 'computeVisibility', 'scoreGitHub', 'scoreKeywords', 'scoreLinkedIn', 'scoreResume']);
    expect(svc.scoreResume).toBe(scoreResume);
    expect(svc.RECRUITER_VOCABULARY).toBe(RECRUITER_VOCABULARY);
  });

  it('scoreResume: empty and rich text', () => {
    expect(scoreResume('  ')).toMatchObject({ score: 0, available: false });
    const rich = scoreResume('Led and built React node.js typescript aws docker postgresql redis kubernetes 10 20 30 40% github.com linkedin.com a@b.co ' + 'word '.repeat(420));
    expect(rich.available).toBe(true);
    expect(rich.score).toBeLessThanOrEqual(100);
    expect(rich.signals.wordCount).toBeGreaterThanOrEqual(400);
  });

  it('scoreLinkedIn: analyzed shape, raw shape and empty', () => {
    expect(scoreLinkedIn({}).available).toBe(false);
    expect(scoreLinkedIn({ score: 140, suggestions: ['a', 'b', 'c', 'd'] })).toMatchObject({ score: 100, suggestions: ['a', 'b', 'c'] });
    const raw = scoreLinkedIn({ headline: 'x'.repeat(45), about: 'w '.repeat(120), skills: 'a, b, c, d, e, f, g, h, i, j', hasPhoto: true, hasFeatured: true });
    expect(raw.score).toBe(100);
  });

  it('scoreGitHub: analyzed shape, raw shape and empty', () => {
    expect(scoreGitHub(null).available).toBe(false);
    expect(scoreGitHub({ score: -5, issues: ['i1'] })).toMatchObject({ score: 0, suggestions: ['i1'] });
    expect(scoreGitHub({ publicRepos: 15, totalStars: 10, followers: 20, languages: ['a', 'b', 'c', 'd'] }).score).toBe(100);
  });

  it('scoreKeywords: default vocabulary vs target keywords', () => {
    expect(scoreKeywords({ resumeText: '' }).available).toBe(false);
    const withTargets = scoreKeywords({ resumeText: 'react and node', targetKeywords: 'react, kubernetes' });
    expect(withTargets.matched).toEqual(['react']);
    expect(withTargets.missing).toEqual(['kubernetes']);
    expect(withTargets.score).toBe(50);
  });

  it('computeVisibility throws a statusCode-400 error when no source is usable', () => {
    let err;
    try {
      svc.computeVisibility({});
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(Error);
    expect(err.statusCode).toBe(400);
    expect(err.message).toBe('Provide at least one of: resume text, LinkedIn data, or GitHub data.');
    expect(() => svc.computeVisibility()).toThrow(/at least one/);
  });

  it('computeVisibility labels: Highly Visible / Visible / Limited Visibility / Low Visibility', () => {
    const label = (input) => svc.computeVisibility(input).scoreLabel;
    expect(label({ linkedin: { score: 95 }, github: { score: 95 }, resumeText: 'react node aws docker git sql redis rest api html css jest ' + 'led '.repeat(5) })).toBe('Highly Visible');
    expect(label({ linkedin: { score: 1 } })).toBe('Low Visibility');
  });
});
