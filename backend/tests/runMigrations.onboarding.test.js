'use strict';

/**
 * runMigrations: the onboarding_completed backfill must run ONLY in the run that adds the column.
 * onboarding_responses rows are written by /recommend before payment, so re-running the backfill on every boot
 * would mark users who answered the survey but never paid as onboarded. Mocked pool, no database.
 */
const mockQuery = jest.fn();
jest.mock('../src/config/database', () => ({ pool: { query: (...a) => mockQuery(...a) } }));

const { runMigrations } = require('../src/utils/runMigrations');

const isBackfill = (sql) => /UPDATE users SET onboarding_completed = true/.test(sql);
const isColumnProbe = (sql) => /information_schema.columns/.test(sql) && /onboarding_completed/.test(sql);

function run(columnAlreadyExists) {
  mockQuery.mockReset();
  mockQuery.mockImplementation(async (sql) =>
    isColumnProbe(sql) ? { rows: columnAlreadyExists ? [{ '?column?': 1 }] : [] } : { rows: [{ exists: true }], rowCount: 0 }
  );
  return runMigrations();
}

describe('runMigrations onboarding_completed backfill', () => {
  it('runs the backfill when this run adds the column', async () => {
    await run(false);
    const sqls = mockQuery.mock.calls.map(([sql]) => sql);
    expect(sqls.some(isBackfill)).toBe(true);
    // the probe happens BEFORE the ALTER, otherwise it would always see the column
    const probeAt = sqls.findIndex(isColumnProbe);
    const alterAt = sqls.findIndex((q) => /ADD COLUMN IF NOT EXISTS onboarding_completed/.test(q));
    expect(probeAt).toBeGreaterThanOrEqual(0);
    expect(probeAt).toBeLessThan(alterAt);
  });

  it('does NOT re-run the backfill on later boots (column already exists)', async () => {
    await run(true);
    const sqls = mockQuery.mock.calls.map(([sql]) => sql);
    expect(sqls.some(isBackfill)).toBe(false);
    expect(sqls.some((q) => /ADD COLUMN IF NOT EXISTS onboarding_completed/.test(q))).toBe(true); // still idempotent
  });
});
