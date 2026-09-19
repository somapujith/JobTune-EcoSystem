'use strict';

/**
 * services/scoring/strategies/jobFit.js (Worker) vs the Express original, over a corpus of inputs, in every
 * AI mode. The Express module loads taxonomy/onetLoader, which imports the database module, so that module is
 * mocked here (nothing reads the real database or any environment file).
 */
jest.mock('../../../src/config/database', () => ({ pool: { query: jest.fn() } }));
jest.mock('../../../src/utils/aiClient', () => ({
  ...jest.requireActual('../../../src/utils/aiClient'),
  callAI: jest.fn(),
}));

const expressAi = require('../../../src/utils/aiClient');
const { score: expressScore } = require('../../../src/services/scoring/strategies/jobFit');
const onetLoader = require('../../../src/services/taxonomy/onetLoader'); // Express original: the infra contract exposes its exports
const { createJobFitScorer } = require('../../../src/worker/services/scoring/strategies/jobFit');
const { createServices } = require('../../../src/worker/services');

const CORPUS = [
  ['', ''],
  ['   ', null],
  [null, 'Senior Python engineer'],
  ['Senior Python developer with React, AWS and Docker.', 'We need a senior Python engineer with React, AWS and Kubernetes experience.'],
  ['Junior designer skilled in Figma and Sketch, recent graduate.', 'Lead product designer, Figma, prototyping, 8 years of experience.'],
  ['Data analyst: SQL, Tableau, Excel, 2 years experience', 'Data Analyst role, SQL and Tableau required, 1-3 years'],
  ['Registered nurse with ICU experience', 'Software engineer, Node and TypeScript'],
  ['Cybersecurity analyst, penetration testing, networking, IAM', 'Security engineer, VPC, IAM, Linux, 10 years'],
  ['Principal engineer, kubernetes, terraform, aws, gcp', 'Staff platform engineer, kubernetes, terraform, ci/cd, sre'],
  ['fresh entry level bootcamp graduate, html css', 'entry-level web developer, html, css, javascript'],
  ['x'.repeat(500) + ' python', 'y'.repeat(500) + ' java'],
  ['Finance manager, forecasting, audit', 'Accountant, budgets and audit'],
];

const AI_MODES = {
  'AI down': () => ({ ok: false, data: null, error: 'down' }),
  'AI returns fenced JSON': () => ({ ok: true, data: '```json\n{"domainScore": 88, "seniorityScore": 44}\n```' }),
  'AI returns out-of-range scores': () => ({ ok: true, data: '{"domainScore": 900, "seniorityScore": -5}' }),
  'AI returns non-numeric scores': () => ({ ok: true, data: '{"domainScore": "high", "seniorityScore": null}' }),
  'AI returns unparseable text': () => ({ ok: true, data: 'no json here' }),
  'AI returns empty data': () => ({ ok: true, data: '' }),
  'AI throws': () => { throw new Error('socket hang up'); },
};

function makeWorkerScorer({ reply, vars = {} }) {
  const calls = [];
  const services = {
    aiClient: {
      callAI: async (opts) => { calls.push(opts); return reply(opts); },
      extractJSON: expressAi.extractJSON,
    },
    onetLoader,
  };
  return { scorer: createJobFitScorer({ config: { vars }, services }), calls };
}

describe('jobFit scorer (worker) vs Express', () => {
  beforeEach(() => {
    process.env.LM_STUDIO_MODEL_FIT = 'fit-model-x';
  });
  afterEach(() => {
    delete process.env.LM_STUDIO_MODEL_FIT;
    jest.clearAllMocks();
  });

  describe.each(Object.entries(AI_MODES))('%s', (_mode, reply) => {
    it.each(CORPUS.map((pair, i) => [i, ...pair]))('corpus #%i gives identical score, breakdown, method and AI call options', async (_i, resumeText, jobDescription) => {
      expressAi.callAI.mockImplementation(async (opts) => reply(opts));
      const { scorer, calls } = makeWorkerScorer({ reply, vars: { LM_STUDIO_MODEL_FIT: 'fit-model-x' } });

      const expected = await expressScore({ resumeText, jobDescription });
      const actual = await scorer.score({ resumeText, jobDescription });

      expect(actual).toEqual(expected);
      expect(calls).toEqual(expressAi.callAI.mock.calls.map(([opts]) => opts));
    });
  });

  it('both-empty input never calls the AI and scores zero (rule)', async () => {
    const { scorer, calls } = makeWorkerScorer({ reply: AI_MODES['AI down'] });
    expect(await scorer.score({ resumeText: '', jobDescription: '  ' })).toEqual({
      score: 0,
      breakdown: { domain: 0, seniority: 0, skills: 0 },
      method: 'rule',
    });
    expect(calls).toHaveLength(0);
  });

  it('model: config.vars.LM_STUDIO_MODEL_FIT, else the "qwen2.5-7b" default', async () => {
    const withVar = makeWorkerScorer({ reply: AI_MODES['AI down'], vars: { LM_STUDIO_MODEL_FIT: 'custom' } });
    await withVar.scorer.score({ resumeText: 'a', jobDescription: 'b' });
    expect(withVar.calls[0].model).toBe('custom');

    const without = makeWorkerScorer({ reply: AI_MODES['AI down'] });
    await without.scorer.score({ resumeText: 'a', jobDescription: 'b' });
    expect(without.calls[0].model).toBe('qwen2.5-7b');
  });

  it('does not touch process env: with the process value set and the config value absent the default is used', async () => {
    const { scorer, calls } = makeWorkerScorer({ reply: AI_MODES['AI down'], vars: {} });
    await scorer.score({ resumeText: 'a', jobDescription: 'b' });
    expect(process.env.LM_STUDIO_MODEL_FIT).toBe('fit-model-x');
    expect(calls[0].model).toBe('qwen2.5-7b');
  });

  it('a missing aiClient service throws instead of silently falling back to rules', async () => {
    const scorer = createJobFitScorer({ config: { vars: {} }, services: { onetLoader } });
    await expect(scorer.score({ resumeText: 'a', jobDescription: 'b' })).rejects.toThrow('services.aiClient is not available');
  });

  it('exposes exactly the Express public surface: { score }', () => {
    expect(Object.keys(createJobFitScorer({ config: { vars: {} }, services: {} }))).toEqual(['score']);
  });

  describe('through the real registry, with the REAL infra services (only the AI provider is faked)', () => {
    // services.jobFit comes from services/registry/jobs.js; services.onetLoader is infra's port of the taxonomy loader
    it.each(['AI down', 'AI returns fenced JSON'])('%s: identical to Express over the whole corpus', async (mode) => {
      const reply = AI_MODES[mode];
      const calls = [];
      const aiClient = { callAI: async (opts) => { calls.push(opts); return reply(opts); }, extractJSON: expressAi.extractJSON };
      const services = createServices({ db: {}, config: { vars: { LM_STUDIO_MODEL_FIT: 'fit-model-x' } }, overrides: { aiClient } });
      expect(typeof services.onetLoader.findOccupation).toBe('function');
      expect(typeof services.onetLoader.getDomain).toBe('function');

      expressAi.callAI.mockImplementation(async (opts) => reply(opts));
      for (const [resumeText, jobDescription] of CORPUS) {
        expect(await services.jobFit.score({ resumeText, jobDescription })).toEqual(await expressScore({ resumeText, jobDescription }));
      }
      expect(calls).toEqual(expressAi.callAI.mock.calls.map(([opts]) => opts));
    });
  });
});
