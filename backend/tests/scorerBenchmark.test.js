/**
 * Tests for scorerBenchmark service — TDD RED phase
 * All tests written before implementation.
 */

jest.mock('../src/config/database', () => ({
  pool: { query: jest.fn() }
}));

const { pool } = require('../src/config/database');
const {
  runBenchmark,
  computeMetrics,
  FIXTURE_DATASET
} = require('../src/services/benchmarks/scorerBenchmark');

// ─── Fixtures ────────────────────────────────────────────────────────────────

const HUMAN_SCORES = [85, 72, 60, 90, 55];
const MODEL_SCORES = [80, 75, 65, 88, 50];

// ─── computeMetrics() ────────────────────────────────────────────────────────

describe('computeMetrics()', () => {
  it('returns mae, correlation, and precisionAtThreshold', () => {
    const metrics = computeMetrics(HUMAN_SCORES, MODEL_SCORES);

    expect(metrics).toHaveProperty('mae');
    expect(metrics).toHaveProperty('correlation');
    expect(metrics).toHaveProperty('precisionAtThreshold');
  });

  it('computes correct MAE', () => {
    // |85-80|+|72-75|+|60-65|+|90-88|+|55-50| = 5+3+5+2+5 = 20 / 5 = 4.0
    const { mae } = computeMetrics(HUMAN_SCORES, MODEL_SCORES);
    expect(mae).toBeCloseTo(4.0, 1);
  });

  it('computes MAE of 0 for identical arrays', () => {
    const { mae } = computeMetrics([70, 80], [70, 80]);
    expect(mae).toBe(0);
  });

  it('returns correlation between -1 and 1', () => {
    const { correlation } = computeMetrics(HUMAN_SCORES, MODEL_SCORES);
    expect(correlation).toBeGreaterThanOrEqual(-1);
    expect(correlation).toBeLessThanOrEqual(1);
  });

  it('returns high correlation for near-identical arrays', () => {
    const h = [60, 70, 80, 90];
    const m = [61, 71, 79, 91];
    const { correlation } = computeMetrics(h, m);
    expect(correlation).toBeGreaterThan(0.98);
  });

  it('returns precisionAtThreshold as a number between 0 and 1', () => {
    const { precisionAtThreshold } = computeMetrics(HUMAN_SCORES, MODEL_SCORES);
    expect(precisionAtThreshold).toBeGreaterThanOrEqual(0);
    expect(precisionAtThreshold).toBeLessThanOrEqual(1);
  });

  it('throws when arrays have mismatched length', () => {
    expect(() => computeMetrics([1, 2, 3], [1, 2])).toThrow(/length/i);
  });

  it('throws when arrays are empty', () => {
    expect(() => computeMetrics([], [])).toThrow(/empty/i);
  });
});

// ─── FIXTURE_DATASET ─────────────────────────────────────────────────────────

describe('FIXTURE_DATASET', () => {
  it('is an array of at least 5 items', () => {
    expect(Array.isArray(FIXTURE_DATASET)).toBe(true);
    expect(FIXTURE_DATASET.length).toBeGreaterThanOrEqual(5);
  });

  it('each item has resumeText, jobDescription, humanScore, role', () => {
    for (const item of FIXTURE_DATASET) {
      expect(item).toHaveProperty('resumeText');
      expect(item).toHaveProperty('jobDescription');
      expect(item).toHaveProperty('humanScore');
      expect(item).toHaveProperty('role');
      expect(typeof item.humanScore).toBe('number');
    }
  });
});

// ─── runBenchmark() ──────────────────────────────────────────────────────────

describe('runBenchmark()', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns metrics object with mae, correlation, precisionAtThreshold', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ id: 1 }] }); // INSERT

    const result = await runBenchmark({ datasetName: 'default', scorerName: 'ats' });

    expect(result).toHaveProperty('mae');
    expect(result).toHaveProperty('correlation');
    expect(result).toHaveProperty('precisionAtThreshold');
    expect(result).toHaveProperty('sampleSize');
  });

  it('persists benchmark results to scorer_benchmarks table', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ id: 2 }] });

    await runBenchmark({ datasetName: 'default', scorerName: 'hr' });

    expect(pool.query).toHaveBeenCalledTimes(1);
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toMatch(/INSERT INTO scorer_benchmarks/i);
    expect(params).toContain('hr');
    expect(params).toContain('default');
  });

  it('stores sampleSize equal to fixture dataset length', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ id: 3 }] });

    const result = await runBenchmark({ datasetName: 'default', scorerName: 'fit' });

    expect(result.sampleSize).toBe(FIXTURE_DATASET.length);
  });

  it('throws when scorerName is missing', async () => {
    await expect(runBenchmark({ datasetName: 'default' })).rejects.toThrow(/scorerName/i);
  });

  it('throws when datasetName is missing', async () => {
    await expect(runBenchmark({ scorerName: 'ats' })).rejects.toThrow(/datasetName/i);
  });

  it('propagates DB error', async () => {
    pool.query.mockRejectedValueOnce(new Error('DB connection lost'));

    await expect(runBenchmark({ datasetName: 'default', scorerName: 'ats' })).rejects.toThrow(
      'DB connection lost'
    );
  });
});
