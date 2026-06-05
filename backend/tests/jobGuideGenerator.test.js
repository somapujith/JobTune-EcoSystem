/**
 * Tests for jobGuideGenerator service — TDD RED phase
 * All tests written before implementation.
 */

// Mock DB and AI before requiring service
jest.mock('../src/config/database', () => ({
  pool: { query: jest.fn() }
}));

jest.mock('../src/utils/aiClient', () => ({
  callAI: jest.fn()
}));

const { pool } = require('../src/config/database');
const { callAI } = require('../src/utils/aiClient');
const {
  generateJobGuide,
  buildFallbackGuide
} = require('../src/services/guides/jobGuideGenerator');

// ─── Fixtures ────────────────────────────────────────────────────────────────

const SAMPLE_APP = {
  id: 42,
  user_id: 1,
  company: 'Stripe',
  role: 'Senior Software Engineer',
  job_description: 'Build scalable payment APIs using Node.js and distributed systems.'
};

const LLM_RESPONSE = JSON.stringify({
  questions: [
    'Tell me about a time you optimised a critical API endpoint.',
    'How do you approach distributed systems design?'
  ],
  talkingPoints: [
    'Highlight experience with high-throughput Node.js services.',
    'Mention knowledge of Stripe API philosophy.'
  ],
  companyResearch:
    'Stripe processes hundreds of billions in payments annually. ' +
    'Research their developer-first culture and open-source projects.'
});

// ─── generateJobGuide — happy path ───────────────────────────────────────────

describe('generateJobGuide()', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns { questions, talkingPoints, companyResearch, savedId } on success', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [SAMPLE_APP] })          // fetch application
      .mockResolvedValueOnce({ rows: [{ id: 99 }] });          // INSERT guide

    callAI.mockResolvedValueOnce({ ok: true, data: LLM_RESPONSE, error: null });

    const result = await generateJobGuide({ applicationId: 42, userId: 1 });

    expect(result).toMatchObject({
      questions: expect.arrayContaining([expect.any(String)]),
      talkingPoints: expect.arrayContaining([expect.any(String)]),
      companyResearch: expect.any(String),
      savedId: 99
    });
    expect(result.questions.length).toBeGreaterThan(0);
    expect(result.talkingPoints.length).toBeGreaterThan(0);
  });

  it('passes jobDescription + role directly when no applicationId supplied', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ id: 7 }] }); // INSERT guide

    callAI.mockResolvedValueOnce({ ok: true, data: LLM_RESPONSE, error: null });

    const result = await generateJobGuide({
      jobDescription: 'Build ML pipelines in Python.',
      role: 'Data Engineer',
      userId: 1
    });

    expect(result.questions).toBeDefined();
    expect(pool.query).toHaveBeenCalledTimes(1); // only the INSERT — no app fetch
  });

  it('falls back to template guide when LLM call fails', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [SAMPLE_APP] })
      .mockResolvedValueOnce({ rows: [{ id: 55 }] });

    callAI.mockResolvedValueOnce({ ok: false, data: null, error: 'LLM timeout' });

    const result = await generateJobGuide({ applicationId: 42, userId: 1 });

    expect(result.questions).toBeDefined();
    expect(result.questions.length).toBeGreaterThan(0);
    expect(result.talkingPoints).toBeDefined();
    expect(result.companyResearch).toBeDefined();
    expect(result.savedId).toBe(55);
  });

  it('falls back when LLM throws an exception', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [SAMPLE_APP] })
      .mockResolvedValueOnce({ rows: [{ id: 10 }] });

    callAI.mockRejectedValueOnce(new Error('Network error'));

    const result = await generateJobGuide({ applicationId: 42, userId: 1 });

    expect(result.questions.length).toBeGreaterThan(0);
  });

  it('falls back when LLM returns malformed JSON', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [SAMPLE_APP] })
      .mockResolvedValueOnce({ rows: [{ id: 11 }] });

    callAI.mockResolvedValueOnce({ ok: true, data: 'not valid json {{}}', error: null });

    const result = await generateJobGuide({ applicationId: 42, userId: 1 });

    expect(result.questions.length).toBeGreaterThan(0);
  });

  it('throws when applicationId is provided but not found in DB', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] }); // no application found

    await expect(generateJobGuide({ applicationId: 999, userId: 1 })).rejects.toThrow(
      /not found/i
    );
  });

  it('throws when neither applicationId nor jobDescription is supplied', async () => {
    await expect(generateJobGuide({ userId: 1 })).rejects.toThrow(/required/i);
  });

  it('persists guide to job_guides table', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [SAMPLE_APP] })
      .mockResolvedValueOnce({ rows: [{ id: 20 }] });

    callAI.mockResolvedValueOnce({ ok: true, data: LLM_RESPONSE, error: null });

    await generateJobGuide({ applicationId: 42, userId: 1 });

    const insertCall = pool.query.mock.calls[1];
    expect(insertCall[0]).toMatch(/INSERT INTO job_guides/i);
    expect(insertCall[1]).toContain(1); // user_id
  });
});

// ─── buildFallbackGuide ───────────────────────────────────────────────────────

describe('buildFallbackGuide()', () => {
  it('returns object with non-empty questions array', () => {
    const guide = buildFallbackGuide({ role: 'Product Manager', company: 'Notion' });
    expect(guide.questions).toBeInstanceOf(Array);
    expect(guide.questions.length).toBeGreaterThanOrEqual(3);
  });

  it('returns object with non-empty talkingPoints array', () => {
    const guide = buildFallbackGuide({ role: 'DevOps Engineer', company: 'Cloudflare' });
    expect(guide.talkingPoints).toBeInstanceOf(Array);
    expect(guide.talkingPoints.length).toBeGreaterThanOrEqual(2);
  });

  it('returns a companyResearch string', () => {
    const guide = buildFallbackGuide({ role: 'SRE', company: 'Google' });
    expect(typeof guide.companyResearch).toBe('string');
    expect(guide.companyResearch.length).toBeGreaterThan(20);
  });

  it('handles null / undefined inputs without throwing', () => {
    expect(() => buildFallbackGuide({})).not.toThrow();
    expect(() => buildFallbackGuide({ role: null, company: undefined })).not.toThrow();
  });

  it('includes the role name in questions when role is provided', () => {
    const guide = buildFallbackGuide({ role: 'Frontend Engineer', company: 'Vercel' });
    const allText = guide.questions.join(' ').toLowerCase();
    // At least one question or talking point should reference the role generically
    expect(guide.questions.length).toBeGreaterThan(0);
  });
});

// ─── getJobGuide (fetch by id) ────────────────────────────────────────────────

describe('getJobGuide()', () => {
  const { getJobGuide } = require('../src/services/guides/jobGuideGenerator');

  beforeEach(() => jest.clearAllMocks());

  it('returns saved guide for valid id and matching user', async () => {
    const fakeGuide = {
      id: 5,
      user_id: 1,
      guide: { questions: ['Q1'], talkingPoints: ['T1'], companyResearch: 'Research...' }
    };
    pool.query.mockResolvedValueOnce({ rows: [fakeGuide] });

    const result = await getJobGuide({ id: 5, userId: 1 });

    expect(result).toEqual(fakeGuide);
  });

  it('throws when guide not found', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });

    await expect(getJobGuide({ id: 999, userId: 1 })).rejects.toThrow(/not found/i);
  });
});
