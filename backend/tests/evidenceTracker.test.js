/**
 * Unit tests for evidenceTracker service — TDD RED phase
 * Tests written BEFORE implementation.
 */

jest.mock('../src/config/database', () => ({
  pool: { query: jest.fn() }
}));

jest.mock('../src/utils/embeddings', () => ({
  generateEmbedding: jest.fn().mockResolvedValue([0.1, 0.2, 0.3])
}));

const { pool } = require('../src/config/database');
const {
  extractBullets,
  logUsage,
  getReuseReport
} = require('../src/services/evidence/evidenceTracker');

// ─── extractBullets ──────────────────────────────────────────────────────────

describe('extractBullets()', () => {
  beforeEach(() => jest.clearAllMocks());

  it('splits on hyphen bullets', () => {
    const text = '- Led backend team\n- Built REST APIs\n- Improved test coverage';
    const bullets = extractBullets(text);
    expect(bullets).toHaveLength(3);
    expect(bullets[0].text).toBe('Led backend team');
  });

  it('splits on bullet character •', () => {
    const text = '• Managed CI/CD pipelines\n• Deployed to AWS';
    const bullets = extractBullets(text);
    expect(bullets).toHaveLength(2);
    expect(bullets[0].text).toBe('Managed CI/CD pipelines');
  });

  it('splits on asterisk bullets', () => {
    const text = '* Wrote unit tests\n* Reduced latency by 40%';
    const bullets = extractBullets(text);
    expect(bullets).toHaveLength(2);
    expect(bullets[0].text).toBe('Wrote unit tests');
  });

  it('returns objects with text, skills, and hash fields', () => {
    const text = '- Built Node.js API with PostgreSQL';
    const bullets = extractBullets(text);
    expect(bullets[0]).toHaveProperty('text');
    expect(bullets[0]).toHaveProperty('skills');
    expect(bullets[0]).toHaveProperty('hash');
  });

  it('extracts skills from bullet text', () => {
    const text = '- Built Node.js REST API using PostgreSQL and Docker';
    const bullets = extractBullets(text);
    const skills = bullets[0].skills;
    expect(Array.isArray(skills)).toBe(true);
    expect(skills.some(s => /node\.?js/i.test(s))).toBe(true);
  });

  it('produces a 64-char hex hash per bullet (SHA256)', () => {
    const text = '- Some bullet';
    const bullets = extractBullets(text);
    expect(bullets[0].hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('produces the same hash for identical bullet text', () => {
    const text = '- Identical bullet\n- Identical bullet';
    const bullets = extractBullets(text);
    expect(bullets[0].hash).toBe(bullets[1].hash);
  });

  it('produces different hashes for different bullets', () => {
    const text = '- First bullet\n- Second bullet';
    const bullets = extractBullets(text);
    expect(bullets[0].hash).not.toBe(bullets[1].hash);
  });

  it('returns empty array for empty string', () => {
    expect(extractBullets('')).toEqual([]);
  });

  it('returns empty array for null input', () => {
    expect(extractBullets(null)).toEqual([]);
  });

  it('returns empty array for undefined input', () => {
    expect(extractBullets(undefined)).toEqual([]);
  });

  it('ignores blank lines and whitespace-only lines', () => {
    const text = '- Valid bullet\n\n  \n- Another bullet';
    const bullets = extractBullets(text);
    expect(bullets).toHaveLength(2);
  });

  it('trims leading/trailing whitespace from bullet text', () => {
    const text = '-   Trimmed bullet   ';
    const bullets = extractBullets(text);
    expect(bullets[0].text).toBe('Trimmed bullet');
  });

  it('handles mixed bullet types in same text', () => {
    const text = '- Hyphen bullet\n• Dot bullet\n* Star bullet';
    const bullets = extractBullets(text);
    expect(bullets).toHaveLength(3);
  });

  it('handles text with Unicode characters', () => {
    const text = '- Improved latency by 50% 🚀 using async patterns';
    const bullets = extractBullets(text);
    expect(bullets).toHaveLength(1);
    expect(bullets[0].text).toContain('Improved latency');
  });

  it('handles very large input (1000 bullets) without throwing', () => {
    const lines = Array.from({ length: 1000 }, (_, i) => `- Bullet number ${i}`);
    const text = lines.join('\n');
    expect(() => extractBullets(text)).not.toThrow();
    const bullets = extractBullets(text);
    expect(bullets).toHaveLength(1000);
  });

  it('skills is an array even when no skills are found', () => {
    const text = '- Did some work';
    const bullets = extractBullets(text);
    expect(Array.isArray(bullets[0].skills)).toBe(true);
  });
});

// ─── logUsage ────────────────────────────────────────────────────────────────

describe('logUsage()', () => {
  beforeEach(() => jest.clearAllMocks());

  it('inserts a row into evidence_usage', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ id: 1 }] });
    const result = await logUsage(10, 5, 'tailored_resume');
    expect(pool.query).toHaveBeenCalledTimes(1);
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toMatch(/INSERT INTO evidence_usage/i);
    expect(params).toContain(10); // bulletId
    expect(params).toContain(5);  // applicationId
    expect(params).toContain('tailored_resume');
  });

  it('returns the inserted row id', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ id: 99 }] });
    const result = await logUsage(10, 5, 'cover_letter');
    expect(result).toEqual({ id: 99 });
  });

  it('uses parameterized query (no string interpolation with user data)', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ id: 1 }] });
    await logUsage(1, 1, 'tailored_resume');
    const [sql] = pool.query.mock.calls[0];
    // Parameterized queries use $1, $2, etc.
    expect(sql).toMatch(/\$1/);
    expect(sql).toMatch(/\$2/);
  });

  it('throws when bulletId is missing', async () => {
    await expect(logUsage(null, 5, 'tailored_resume')).rejects.toThrow();
  });

  it('throws when context is missing', async () => {
    await expect(logUsage(10, 5, null)).rejects.toThrow();
  });

  it('accepts null applicationId (bullet used outside specific application)', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ id: 2 }] });
    await expect(logUsage(10, null, 'tailored_resume')).resolves.not.toThrow();
  });
});

// ─── getReuseReport ──────────────────────────────────────────────────────────

describe('getReuseReport()', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns overUsed, underUsed, uniqueBullets, diversity, suggestions', async () => {
    // bullets query
    pool.query.mockResolvedValueOnce({
      rows: [
        { id: 1, bullet_text: 'Led team', skills: ['leadership'], usage_count: '3' },
        { id: 2, bullet_text: 'Built API', skills: ['Node.js'], usage_count: '1' },
        { id: 3, bullet_text: 'Wrote tests', skills: ['Jest'], usage_count: '0' }
      ]
    });

    const report = await getReuseReport(1);
    expect(report).toHaveProperty('overUsed');
    expect(report).toHaveProperty('underUsed');
    expect(report).toHaveProperty('uniqueBullets');
    expect(report).toHaveProperty('diversity');
    expect(report).toHaveProperty('suggestions');
  });

  it('flags bullets used more than 2 times as overUsed', async () => {
    pool.query.mockResolvedValueOnce({
      rows: [
        { id: 1, bullet_text: 'Overused bullet', skills: [], usage_count: '3' },
        { id: 2, bullet_text: 'Normal bullet', skills: [], usage_count: '2' }
      ]
    });

    const report = await getReuseReport(1);
    expect(report.overUsed).toHaveLength(1);
    expect(report.overUsed[0].bullet).toBe('Overused bullet');
  });

  it('flags bullets used 0 or 1 times as underUsed', async () => {
    pool.query.mockResolvedValueOnce({
      rows: [
        { id: 1, bullet_text: 'Never used', skills: [], usage_count: '0' },
        { id: 2, bullet_text: 'Used once', skills: [], usage_count: '1' },
        { id: 3, bullet_text: 'Used twice', skills: [], usage_count: '2' }
      ]
    });

    const report = await getReuseReport(1);
    expect(report.underUsed).toHaveLength(2);
  });

  it('includes count on overUsed and underUsed items', async () => {
    pool.query.mockResolvedValueOnce({
      rows: [
        { id: 1, bullet_text: 'Often used', skills: [], usage_count: '5' }
      ]
    });

    const report = await getReuseReport(1);
    expect(report.overUsed[0]).toHaveProperty('count', 5);
  });

  it('uniqueBullets is total number of distinct bullets for user', async () => {
    pool.query.mockResolvedValueOnce({
      rows: [
        { id: 1, bullet_text: 'A', skills: [], usage_count: '1' },
        { id: 2, bullet_text: 'B', skills: [], usage_count: '2' },
        { id: 3, bullet_text: 'C', skills: [], usage_count: '0' }
      ]
    });

    const report = await getReuseReport(1);
    expect(report.uniqueBullets).toBe(3);
  });

  it('diversity score is a number between 0 and 100', async () => {
    pool.query.mockResolvedValueOnce({
      rows: [
        { id: 1, bullet_text: 'A', skills: [], usage_count: '1' },
        { id: 2, bullet_text: 'B', skills: [], usage_count: '3' }
      ]
    });

    const report = await getReuseReport(1);
    expect(typeof report.diversity).toBe('number');
    expect(report.diversity).toBeGreaterThanOrEqual(0);
    expect(report.diversity).toBeLessThanOrEqual(100);
  });

  it('diversity score is 100 when all bullets are used exactly once', async () => {
    pool.query.mockResolvedValueOnce({
      rows: [
        { id: 1, bullet_text: 'A', skills: [], usage_count: '1' },
        { id: 2, bullet_text: 'B', skills: [], usage_count: '1' },
        { id: 3, bullet_text: 'C', skills: [], usage_count: '1' }
      ]
    });

    const report = await getReuseReport(1);
    expect(report.diversity).toBe(100);
  });

  it('diversity score is lower when one bullet is heavily overused', async () => {
    pool.query.mockResolvedValueOnce({
      rows: [
        { id: 1, bullet_text: 'A', skills: [], usage_count: '10' },
        { id: 2, bullet_text: 'B', skills: [], usage_count: '1' }
      ]
    });

    const report = await getReuseReport(1);
    expect(report.diversity).toBeLessThan(100);
  });

  it('suggestions is an array', async () => {
    pool.query.mockResolvedValueOnce({
      rows: [
        { id: 1, bullet_text: 'A', skills: [], usage_count: '5' }
      ]
    });

    const report = await getReuseReport(1);
    expect(Array.isArray(report.suggestions)).toBe(true);
  });

  it('returns empty report when user has no bullets', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });

    const report = await getReuseReport(1);
    expect(report.overUsed).toEqual([]);
    expect(report.underUsed).toEqual([]);
    expect(report.uniqueBullets).toBe(0);
    expect(report.diversity).toBe(0);
  });

  it('uses parameterized query with userId (SQL injection safety)', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    await getReuseReport(99);
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toMatch(/\$1/);
    expect(params).toContain(99);
  });
});
