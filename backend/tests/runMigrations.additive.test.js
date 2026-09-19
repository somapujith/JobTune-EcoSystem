'use strict';

/**
 * runMigrations: the additive columns found by validating every SQL statement against a real Postgres.
 * They must be strictly additive and nullable (no NOT NULL, no UNIQUE, no DROP), tolerate missing tables, and a
 * failure in one must never abort the others or make runMigrations throw (boot must continue).
 */
const mockQuery = jest.fn();
jest.mock('../src/config/database', () => ({ pool: { query: (...a) => mockQuery(...a) } }));

const { runMigrations } = require('../src/utils/runMigrations');

const EXPECTED = [
  /ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS name VARCHAR\(255\)$/,
  /ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS full_name VARCHAR\(255\)$/,
  /ALTER TABLE IF EXISTS mock_interviews ADD COLUMN IF NOT EXISTS feedback JSONB$/,
  /ALTER TABLE IF EXISTS resumes ADD COLUMN IF NOT EXISTS scores JSONB$/,
  /ALTER TABLE IF EXISTS resumes ADD COLUMN IF NOT EXISTS sections JSONB$/,
];
const isOptional = (sql) => /^ALTER TABLE IF EXISTS (users|mock_interviews|resumes) ADD COLUMN IF NOT EXISTS (name|full_name|feedback|scores|sections)\b/.test(String(sql).trim());

beforeEach(() => {
  mockQuery.mockReset();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

const okImpl = async () => ({ rows: [{ exists: true }], rowCount: 0 });

describe('runMigrations additive columns', () => {
  it('issues exactly the five additive, nullable ALTERs', async () => {
    mockQuery.mockImplementation(okImpl);
    await runMigrations();
    const issued = mockQuery.mock.calls.map(([sql]) => String(sql).trim()).filter(isOptional);
    expect(issued).toHaveLength(EXPECTED.length);
    EXPECTED.forEach((re, i) => expect(issued[i]).toMatch(re));
  });

  it('is strictly additive: no NOT NULL, UNIQUE, DEFAULT-rewrite, DROP or index in those statements', async () => {
    mockQuery.mockImplementation(okImpl);
    await runMigrations();
    for (const [sql] of mockQuery.mock.calls) {
      if (!isOptional(sql)) continue;
      expect(sql).not.toMatch(/NOT NULL|UNIQUE|DROP|DEFAULT|INDEX|TYPE/i);
    }
  });

  it('a failing optional migration does not stop the others and runMigrations does not throw', async () => {
    mockQuery.mockImplementation(async (sql) => {
      if (isOptional(sql) && /users ADD COLUMN IF NOT EXISTS name/.test(sql)) throw new Error('lock timeout');
      return okImpl();
    });
    await expect(runMigrations()).resolves.toBeUndefined();
    const issued = mockQuery.mock.calls.map(([sql]) => String(sql).trim()).filter(isOptional);
    expect(issued).toHaveLength(EXPECTED.length); // all five attempted despite the first failing
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Optional migration failed'), expect.any(String), '-', 'lock timeout');
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('completed successfully'));
  });
});
