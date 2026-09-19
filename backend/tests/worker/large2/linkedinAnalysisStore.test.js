'use strict';

/**
 * services/linkedinAnalysisStore.js: same three behaviours as tests/linkedinAnalysisStore.test.js (the Express
 * service), against an injected db instead of a mocked pool module, plus the edge cases of the defaults.
 */
const { createLinkedinAnalysisStore } = require('../../../src/worker/services/linkedinAnalysisStore');

function setup() {
  const db = { query: jest.fn() };
  return { db, store: createLinkedinAnalysisStore({ db }) };
}

describe('linkedinAnalysisStore (worker port)', () => {
  it('requires a db with query()', () => {
    expect(() => createLinkedinAnalysisStore({})).toThrow(TypeError);
    expect(() => createLinkedinAnalysisStore({ db: {} })).toThrow(TypeError);
  });

  it('saves a LinkedIn analysis with summary fields and full report JSON', async () => {
    const { db, store } = setup();
    db.query.mockResolvedValueOnce({ rows: [{ id: 101, created_at: '2026-06-18T00:00:00.000Z' }] });
    const report = {
      score: 74,
      scoreLabel: 'Strong',
      aiPowered: true,
      profile: { profileUrl: 'https://www.linkedin.com/in/janedoe', targetRoles: ['Frontend Engineer'] },
    };

    const saved = await store.saveLinkedInAnalysis(42, report);

    expect(saved).toEqual({ id: 101, created_at: '2026-06-18T00:00:00.000Z' });
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO linkedin_analyses'), [
      42, 'https://www.linkedin.com/in/janedoe', ['Frontend Engineer'], 74, 'Strong', true, JSON.stringify(report),
    ]);
  });

  it('applies the same defaults as the original for a sparse report', async () => {
    const { db, store } = setup();
    db.query.mockResolvedValueOnce({ rows: [{ id: 1, created_at: 'x' }] });
    const report = { profile: { targetRoles: 'not-an-array' } };
    await store.saveLinkedInAnalysis(7, report);
    expect(db.query.mock.calls[0][1]).toEqual([7, null, [], 0, null, false, JSON.stringify(report)]);

    db.query.mockResolvedValueOnce({ rows: [{ id: 2, created_at: 'x' }] });
    await store.saveLinkedInAnalysis(7, {}); // no profile at all
    expect(db.query.mock.calls[1][1]).toEqual([7, null, [], 0, null, false, '{}']);
  });

  it('a db failure propagates (the route turns it into persistence.saved=false)', async () => {
    const { db, store } = setup();
    db.query.mockRejectedValueOnce(new Error('connection lost'));
    await expect(store.saveLinkedInAnalysis(1, {})).rejects.toThrow('connection lost');
  });

  it('returns capped history summaries ordered by newest first', async () => {
    const { db, store } = setup();
    db.query.mockResolvedValueOnce({ rows: [{ id: 101 }] });
    const history = await store.getLinkedInAnalysisHistory(42, 100);
    expect(history).toEqual([{ id: 101 }]);
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining('ORDER BY created_at DESC'), [42, 25]);
  });

  it.each([
    [undefined, 10], [0, 10], ['abc', 10], [NaN, 10], [null, 10], [['5', '6'], 10],
    ['7', 7], [7, 7], [25, 25], [26, 25], ['-3', -3],
  ])('history limit %p -> LIMIT %p (Math.min(Number(limit) || 10, 25), unchanged)', async (limit, expected) => {
    const { db, store } = setup();
    db.query.mockResolvedValueOnce({ rows: [] });
    await store.getLinkedInAnalysisHistory(1, limit);
    expect(db.query.mock.calls[0][1]).toEqual([1, expected]);
  });

  it('history with no limit argument defaults to 10', async () => {
    const { db, store } = setup();
    db.query.mockResolvedValueOnce({ rows: [] });
    await store.getLinkedInAnalysisHistory(3);
    expect(db.query.mock.calls[0][1]).toEqual([3, 10]);
  });

  it('returns a saved report by id for the owning user (id first, user second)', async () => {
    const { db, store } = setup();
    db.query.mockResolvedValueOnce({ rows: [{ id: 101, report: { score: 74 }, created_at: 'now' }] });
    const analysis = await store.getLinkedInAnalysisById(42, 101);
    expect(analysis.report.score).toBe(74);
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining('WHERE id = $1 AND user_id = $2'), [101, 42]);
  });

  it('returns null when nothing matches', async () => {
    const { db, store } = setup();
    db.query.mockResolvedValueOnce({ rows: [] });
    await expect(store.getLinkedInAnalysisById(42, 5)).resolves.toBeNull();
  });

  it('exposes exactly the original module exports', () => {
    expect(Object.keys(setup().store).sort()).toEqual(['getLinkedInAnalysisById', 'getLinkedInAnalysisHistory', 'saveLinkedInAnalysis']);
  });
});
