/**
 * ONET Loader Tests — TDD First (RED → GREEN → REFACTOR)
 *
 * Tests cover:
 * - loadONET() reads occupations.json and upserts to DB
 * - findOccupation() returns the closest match for a job title
 * - findOccupation() handles empty/null input
 * - findOccupation() handles titles with no close match
 * - getDomain() extracts domain from occupation object
 * - getDomain() handles null/missing occupation
 * - 80%+ coverage on all code paths
 */

jest.mock('../src/config/database', () => ({
  pool: { query: jest.fn() }
}));

const { pool } = require('../src/config/database');

// ─── Unit: onetLoader ────────────────────────────────────────────────────────

describe('onetLoader', () => {
  let loadONET, findOccupation, getDomain;

  beforeAll(() => {
    ({ loadONET, findOccupation, getDomain } =
      require('../src/services/taxonomy/onetLoader'));
  });

  beforeEach(() => {
    jest.clearAllMocks();
    pool.query.mockResolvedValue({ rows: [] });
  });

  // ── loadONET ────────────────────────────────────────────────────────────────

  describe('loadONET()', () => {
    it('calls pool.query at least once per occupation entry', async () => {
      await loadONET();
      expect(pool.query).toHaveBeenCalled();
    });

    it('upserts with the correct SQL verb (INSERT … ON CONFLICT)', async () => {
      await loadONET();
      const firstCall = pool.query.mock.calls[0][0];
      expect(firstCall).toMatch(/INSERT/i);
      expect(firstCall).toMatch(/ON CONFLICT/i);
    });

    it('passes occupation code as first parameter', async () => {
      await loadONET();
      const firstParams = pool.query.mock.calls[0][1];
      // code should look like ##-####.##
      expect(firstParams[0]).toMatch(/\d{2}-\d{4}\.\d{2}/);
    });

    it('resolves without throwing when DB succeeds', async () => {
      await expect(loadONET()).resolves.not.toThrow();
    });

    it('throws (or rejects) when DB fails', async () => {
      pool.query.mockRejectedValueOnce(new Error('DB down'));
      await expect(loadONET()).rejects.toThrow('DB down');
    });
  });

  // ── findOccupation ──────────────────────────────────────────────────────────

  describe('findOccupation()', () => {
    it('returns an occupation object with code/title/domain for exact match', () => {
      const result = findOccupation('Software Developer');
      expect(result).not.toBeNull();
      expect(result).toHaveProperty('code');
      expect(result).toHaveProperty('title');
      expect(result).toHaveProperty('domain');
    });

    it('returns an occupation for partial / fuzzy match', () => {
      const result = findOccupation('software dev');
      expect(result).not.toBeNull();
    });

    it('returns an occupation for "Data Scientist"', () => {
      const result = findOccupation('Data Scientist');
      expect(result).not.toBeNull();
      expect(result.title.toLowerCase()).toMatch(/data/i);
    });

    it('returns null for empty string', () => {
      const result = findOccupation('');
      expect(result).toBeNull();
    });

    it('returns null for null input', () => {
      const result = findOccupation(null);
      expect(result).toBeNull();
    });

    it('returns null for undefined input', () => {
      const result = findOccupation(undefined);
      expect(result).toBeNull();
    });

    it('returns the best match for an ambiguous title', () => {
      // "engineer" should still find something in the dataset
      const result = findOccupation('engineer');
      expect(result).not.toBeNull();
    });

    it('handles titles with special characters without throwing', () => {
      expect(() => findOccupation('C++ / Rust Engineer')).not.toThrow();
    });
  });

  // ── getDomain ───────────────────────────────────────────────────────────────

  describe('getDomain()', () => {
    it('returns a non-empty string domain for a known occupation', () => {
      const occ = findOccupation('Software Developer');
      const domain = getDomain(occ);
      expect(typeof domain).toBe('string');
      expect(domain.length).toBeGreaterThan(0);
    });

    it('returns "Unknown" for null input', () => {
      expect(getDomain(null)).toBe('Unknown');
    });

    it('returns "Unknown" for undefined input', () => {
      expect(getDomain(undefined)).toBe('Unknown');
    });

    it('returns "Unknown" when occupation has no domain property', () => {
      expect(getDomain({ code: '15-1252.00', title: 'Test' })).toBe('Unknown');
    });

    it('returns the domain field when it exists', () => {
      const occ = { code: '15-1252.00', title: 'SWE', domain: 'IT' };
      expect(getDomain(occ)).toBe('IT');
    });
  });
});
