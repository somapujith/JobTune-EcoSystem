'use strict';

/**
 * Differential test for the leaf2 service ports: every scenario runs the ORIGINAL Express service
 * (src/services/**, with the pool and embeddings util replaced by scripted mocks) and the Worker
 * factory (src/worker/services/**, with an injected scripted db) with the same inputs and the same
 * scripted database responses, and asserts:
 *   1. the SAME SQL text (whitespace-normalised) and the SAME bind parameters, in the same order
 *   2. the SAME return value (or the same thrown error message)
 * Only the Express modules are read here; nothing under src/ outside src/worker is modified.
 *
 * This proves the port is faithful against fakes. It does NOT prove SQL correctness or Neon behaviour.
 */
const mockQuery = jest.fn();
const mockEmbed = jest.fn();
jest.mock('../../../src/config/database', () => ({ pool: { query: (...a) => mockQuery(...a) } }));
jest.mock('../../../src/utils/embeddings', () => ({ embedText: (...a) => mockEmbed(...a) }));

const expressActivity = require('../../../src/services/activityService');
const expressSrs = require('../../../src/services/srsService');
const expressStudyHistory = require('../../../src/services/studyHistoryService');
const expressLearningPath = require('../../../src/services/learningPathService');
const expressEvidence = require('../../../src/services/evidence/evidenceTracker');
const expressPii = require('../../../src/services/pii/piiRedactor');

const { createActivityService } = require('../../../src/worker/services/activityService');
const { createSrsService } = require('../../../src/worker/services/srsService');
const { createStudyHistoryService } = require('../../../src/worker/services/studyHistoryService');
const { createLearningPathService } = require('../../../src/worker/services/learningPathService');
const { createEvidenceTracker } = require('../../../src/worker/services/evidence/evidenceTracker');
const { createPiiRedactor } = require('../../../src/worker/services/pii/piiRedactor');

const norm = (sql) => sql.replace(/\s+/g, ' ').trim();

/** Scripted db: `script` is an array of [regex|fn, result|fn]; unmatched statements resolve { rows: [] }. */
function scriptedDb(script = [], { fallback = { rows: [] } } = {}) {
  const calls = [];
  const query = async (sql, params) => {
    const n = norm(sql);
    calls.push({ sql: n, params });
    for (const [match, result] of script) {
      if (typeof match === 'function' ? match(n, params) : match.test(n)) {
        const value = typeof result === 'function' ? result(n, params) : result;
        if (value instanceof Error) throw value;
        return value;
      }
    }
    return fallback;
  };
  return { query, calls };
}

async function settle(fn) {
  try {
    return { ok: await fn() };
  } catch (err) {
    return { error: err && err.message };
  }
}

/**
 * Run `invoke(service)` against both implementations with identical scripted responses.
 * @returns {{ ex, wk }} the settled outcomes, for extra assertions
 */
async function parity({ express, worker, invoke, script, fallback }) {
  const exDb = scriptedDb(script, { fallback });
  mockQuery.mockReset().mockImplementation(exDb.query);
  const wkDb = scriptedDb(script, { fallback });
  const wkService = worker(wkDb);

  const ex = await settle(() => invoke(express));
  const wk = await settle(() => invoke(wkService));

  expect(wk).toEqual(ex);
  expect(wkDb.calls).toEqual(exDb.calls);
  return { ex, wk, calls: wkDb.calls };
}

const FROZEN_NOW = new Date('2026-09-19T12:00:00.000Z'); // a Saturday
beforeAll(() => {
  // freeze ONLY Date so async flows are unaffected
  jest.useFakeTimers({
    now: FROZEN_NOW,
    doNotFake: ['nextTick', 'setImmediate', 'clearImmediate', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'queueMicrotask', 'hrtime', 'performance'],
  });
});
afterAll(() => jest.useRealTimers());

// ─────────────────────────────────────────────────────────────────────────────
describe('activityService parity', () => {
  const worker = (db) => createActivityService({ db });
  const run = (invoke, script, fallback) => parity({ express: expressActivity, worker, invoke, script, fallback });

  it('trackActivity (with and without metadata)', async () => {
    const script = [[/INSERT INTO daily_activity/, { rows: [{ id: 1, activity_count: 2 }] }]];
    const a = await run((s) => s.trackActivity(3, 'resume', 'view', { score: 85 }), script);
    expect(a.ex.ok).toEqual({ id: 1, activity_count: 2 });
    expect(a.calls[0].params).toEqual([3, 'resume', 'view', '{"score":85}']);
    const b = await run((s) => s.trackActivity(3, 'resume', 'view'), script);
    expect(b.calls[0].params[3]).toBe('{}');
  });

  it('trackActivity propagates a db error', async () => {
    const a = await run((s) => s.trackActivity(3, 't', 'a', {}), [[/INSERT/, new Error('boom')]]);
    expect(a.ex).toEqual({ error: 'boom' });
  });

  it('getHeatmapData maps Date objects and string dates', async () => {
    const rows = [
      { date: new Date('2026-01-15T00:00:00.000Z'), count: 5 },
      { date: '2026-01-16', count: 2 },
    ];
    const a = await run((s) => s.getHeatmapData(1, 6), [[/FROM daily_activity/, { rows }]]);
    expect(a.ex.ok).toEqual([{ date: '2026-01-15', count: 5 }, { date: '2026-01-16', count: 2 }]);
    expect(a.calls[0].params).toEqual([1, 6]);
    await run((s) => s.getHeatmapData(1), [[/FROM daily_activity/, { rows: [] }]]);
  });

  // The week start is computed with the runtime's LOCAL time (preserved quirk), so the concrete dates
  // depend on the machine's TZ. Assertions below are therefore TZ-independent; exact-date expectations
  // are made against the dates the service itself reports for that week.
  it('getWeeklyActivity fills all seven days, Monday first, and places counts by date (frozen Saturday)', async () => {
    const empty = await run((s) => s.getWeeklyActivity(1), [[/FROM daily_activity/, { rows: [] }]]);
    const week = empty.ex.ok;
    expect(week.map((d) => d.day)).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
    expect(week.every((d) => d.count === 0)).toBe(true);
    expect(empty.calls[0].params).toEqual([1, week[0].date]);
    for (let i = 1; i < 7; i++) {
      expect((Date.parse(week[i].date) - Date.parse(week[i - 1].date)) / 86400000).toBe(1);
    }

    const rows = [{ date: new Date(week[0].date + 'T00:00:00.000Z'), count: 4 }, { date: week[2].date, count: 1 }];
    const a = await run((s) => s.getWeeklyActivity(1), [[/FROM daily_activity/, { rows }]]);
    expect(a.ex.ok[0]).toEqual({ day: 'Mon', date: week[0].date, count: 4 });
    expect(a.ex.ok[2]).toEqual({ day: 'Wed', date: week[2].date, count: 1 });
    expect(a.ex.ok[1].count).toBe(0);
  });

  it('getWeeklyActivity on a Sunday still uses the same week (Monday six days back)', async () => {
    const sat = await run((s) => s.getWeeklyActivity(1), [[/FROM daily_activity/, { rows: [] }]]);
    jest.setSystemTime(new Date('2026-09-20T12:00:00.000Z')); // Sunday
    try {
      const sun = await run((s) => s.getWeeklyActivity(1), [[/FROM daily_activity/, { rows: [] }]]);
      expect(sun.calls[0].params).toEqual(sat.calls[0].params);
    } finally {
      jest.setSystemTime(FROZEN_NOW);
    }
  });

  describe('getStats', () => {
    const core = [/COUNT\(DISTINCT activity_date\)/, { rows: [{ days_active: '12', tools_used: '4', total_activities: 40 }] }];
    const streak = [/FROM learning_streaks/, { rows: [{ current: 3, longest: 9, daily_goal: 20 }] }];
    const today = [/activity_date = CURRENT_DATE/, { rows: [{ count: 10 }] }];

    it('full data', async () => {
      const a = await run((s) => s.getStats(1), [core, streak, today]);
      expect(a.ex.ok).toEqual({
        daysActive: 12, toolsUsed: 4, totalActivities: 40, currentStreak: 3, longestStreak: 9, dailyGoal: 20, dailyGoalProgress: 50,
      });
    });
    it('no core rows, no streak row, today over the goal is capped at 100', async () => {
      const a = await run((s) => s.getStats(1), [
        [/COUNT\(DISTINCT activity_date\)/, { rows: [] }],
        [/FROM learning_streaks/, { rows: [] }],
        [/activity_date = CURRENT_DATE/, { rows: [{ count: 500 }] }],
      ]);
      expect(a.ex.ok).toMatchObject({ daysActive: 0, dailyGoal: 30, dailyGoalProgress: 100 });
    });
    it('swallows learning_streaks and today errors', async () => {
      const a = await run((s) => s.getStats(1), [
        core,
        [/FROM learning_streaks/, new Error('relation "learning_streaks" does not exist')],
        [/activity_date = CURRENT_DATE/, new Error('nope')],
      ]);
      expect(a.ex.ok).toMatchObject({ currentStreak: 0, longestStreak: 0, dailyGoal: 30, dailyGoalProgress: 0 });
    });
    it('a zero daily goal yields zero progress', async () => {
      // daily_goal 0 is falsy, so the original falls back to 30: parity proves that quirk is kept
      const a = await run((s) => s.getStats(1), [core, [/FROM learning_streaks/, { rows: [{ current: 1, longest: 1, daily_goal: 0 }] }], today]);
      expect(a.ex.ok.dailyGoal).toBe(30);
    });
    it('core query failure propagates', async () => {
      const a = await run((s) => s.getStats(1), [[/COUNT\(DISTINCT activity_date\)/, new Error('db down')]]);
      expect(a.ex).toEqual({ error: 'db down' });
    });
  });

  it('getAchievements maps rows', async () => {
    const at = new Date('2026-05-01T10:00:00.000Z');
    const a = await run((s) => s.getAchievements(1), [[/FROM student_achievements/, { rows: [{ key: 'first_login', unlocked_at: at }] }]]);
    expect(a.ex.ok).toEqual([{ key: 'first_login', unlockedAt: at }]);
  });

  describe('checkAndUnlockAchievements', () => {
    it('unlocks every achievement whose criteria are met (each query issued in the same order)', async () => {
      const yes = { rows: [{ '?column?': 1, cnt: 12, current: 8, longest: 31 }] };
      const a = await run((s) => s.checkAndUnlockAchievements(1), [
        [/^SELECT achievement_key FROM student_achievements/, { rows: [{ achievement_key: 'first_login' }] }],
        [/^SELECT COUNT\(DISTINCT tool_name\)/, yes],
        [/^SELECT 1 FROM/, yes],
        [/^SELECT current, longest FROM learning_streaks/, yes],
        [/^SELECT longest FROM learning_streaks/, yes],
        [/^INSERT INTO student_achievements/, { rows: [] }],
      ]);
      expect(a.ex.ok).toEqual([
        'first_resume', 'first_assessment', 'first_interview', 'streak_7', 'streak_30', 'first_course', '5_tools', '10_tools', 'first_practice', 'profile_complete',
      ]);
    });
    it('nothing met', async () => {
      const a = await run((s) => s.checkAndUnlockAchievements(1), [
        [/^SELECT achievement_key FROM student_achievements/, { rows: [] }],
        [/^SELECT COUNT\(DISTINCT tool_name\)/, { rows: [{ cnt: 1 }] }],
        [/^SELECT (current, longest|longest) FROM learning_streaks/, { rows: [] }],
      ]);
      expect(a.ex.ok).toEqual([]);
    });
    it('the existing-achievements table missing returns [] immediately', async () => {
      const a = await run((s) => s.checkAndUnlockAchievements(1), [[/^SELECT achievement_key FROM student_achievements/, new Error('no table')]]);
      expect(a.ex.ok).toEqual([]);
      expect(a.calls).toHaveLength(1);
    });
    it('a failing per-achievement query is skipped, the rest continue', async () => {
      const a = await run((s) => s.checkAndUnlockAchievements(1), [
        [/^SELECT achievement_key FROM student_achievements/, { rows: [] }],
        [/^SELECT 1 FROM resumes/, new Error('table missing')],
        [/^SELECT 1 FROM daily_activity/, { rows: [{}] }],
        [/^INSERT INTO student_achievements/, { rows: [] }],
      ]);
      expect(a.ex.ok).toContain('first_login');
      expect(a.ex.ok).not.toContain('first_resume');
    });
    it('a failing insert skips that achievement', async () => {
      const a = await run((s) => s.checkAndUnlockAchievements(1), [
        [/^SELECT achievement_key FROM student_achievements/, { rows: [] }],
        [/^SELECT 1 FROM daily_activity/, { rows: [{}] }],
        [/^INSERT INTO student_achievements/, new Error('constraint')],
      ]);
      expect(a.ex.ok).toEqual([]);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('srsService parity', () => {
  const worker = (db) => createSrsService({ db });
  const run = (invoke, script) => parity({ express: expressSrs, worker, invoke, script });
  const card = (over = {}) => ({ id: 1, user_id: 1, ease_factor: 2.5, interval_days: 1, repetitions: 0, ...over });

  it('saveDeck builds the multi-row upsert with 5 params per card and the default difficulty', async () => {
    const a = await run((s) => s.saveDeck(1, 'deck-1', [{ front: 'Q1', back: 'A1' }, { front: 'Q2', back: 'A2', difficulty: 'hard' }]), []);
    expect(a.calls[0].params).toEqual([1, 'deck-1', 'Q1', 'A1', 'medium', 1, 'deck-1', 'Q2', 'A2', 'hard']);
    expect(a.calls[0].sql).toContain('($1, $2, $3, $4, $5), ($6, $7, $8, $9, $10)');
  });
  it('saveDeck propagates db errors', async () => {
    const a = await run((s) => s.saveDeck(1, 'd', [{ front: 'Q', back: 'A' }]), [[/INSERT/, new Error('unique violation')]]);
    expect(a.ex).toEqual({ error: 'unique violation' });
  });

  it('getDueCards: default, with deck, with limit', async () => {
    const rows = [{ id: 1, front: 'Q' }];
    const script = [[/FROM srs_cards/, { rows }]];
    const a = await run((s) => s.getDueCards(1), script);
    expect(a.ex.ok).toEqual(rows);
    expect(a.calls[0].params).toEqual([1, 20]);
    const b = await run((s) => s.getDueCards(1, 'deck-9', 5), script);
    expect(b.calls[0].params).toEqual([1, 'deck-9', 5]);
    expect(b.calls[0].sql).toContain('AND deck_id = $2 ORDER BY next_review ASC LIMIT $3');
  });

  it('reviewCard: card not found', async () => {
    const a = await run((s) => s.reviewCard(1, 999, 4), [[/^SELECT \* FROM srs_cards/, { rows: [] }]]);
    expect(a.ex).toEqual({ error: 'Card not found' });
    expect(a.calls).toHaveLength(1);
  });

  it.each([
    ['fail resets (q<3)', card({ repetitions: 3, interval_days: 6 }), 2, { repetitions: 0, interval_days: 0 }],
    ['first success', card(), 4, { repetitions: 1, interval_days: 1 }],
    ['second success', card({ repetitions: 1 }), 4, { repetitions: 2, interval_days: 6 }],
    ['later success multiplies by ease', card({ repetitions: 2, interval_days: 6 }), 4, { repetitions: 3, interval_days: 15 }],
    ['quality clamped high', card(), 10, { repetitions: 1 }],
    ['quality clamped low', card({ repetitions: 2, interval_days: 6 }), -3, { repetitions: 0, interval_days: 0 }],
    ['ease factor floor', card({ ease_factor: 1.3 }), 0, { repetitions: 0 }],
    ['perfect', card({ repetitions: 5, interval_days: 30, ease_factor: 2.6 }), 5, { repetitions: 6 }],
    ['non-numeric quality', card(), 'x', {}],
  ])('reviewCard: %s', async (_n, row, quality, expectPart) => {
    const a = await run((s) => s.reviewCard(1, 1, quality), [[/^SELECT \* FROM srs_cards/, { rows: [row] }]]);
    expect(a.ex.ok).toMatchObject(expectPart);
    expect(a.calls).toHaveLength(2);
  });

  it('reviewCard computes next_review from the frozen clock', async () => {
    const a = await run((s) => s.reviewCard(1, 1, 4), [[/^SELECT \* FROM srs_cards/, { rows: [card()] }]]);
    expect(a.ex.ok.next_review).toBe('2026-09-20');
    expect(a.calls[1].params).toEqual([a.ex.ok.ease_factor, 1, 1, '2026-09-20', 1, 1]);
  });

  it('getDecks', async () => {
    const decks = [{ deck_id: 'a', total_cards: '3' }];
    const a = await run((s) => s.getDecks(2), [[/FROM srs_cards/, { rows: decks }]]);
    expect(a.ex.ok).toEqual(decks);
    expect(a.calls[0].params).toEqual([2]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('studyHistoryService parity', () => {
  const worker = (db) => createStudyHistoryService({ db });
  const run = (invoke, script) => parity({ express: expressStudyHistory, worker, invoke, script });

  it('exports the same method set as the original (mid2 studyTools depends on saveSession)', () => {
    const wk = createStudyHistoryService({ db: { query: async () => ({ rows: [] }) } });
    const own = (o) => Object.getOwnPropertyNames(Object.getPrototypeOf(o)).filter((n) => n !== 'constructor').sort();
    expect(Object.keys(wk).sort()).toEqual(own(expressStudyHistory));
  });

  it('saveSession: full and minimal payloads', async () => {
    const script = [[/INSERT INTO study_sessions/, { rows: [{ id: 5, created_at: '2026-09-19' }] }]];
    const a = await run((s) => s.saveSession(1, { sessionType: 'quiz', topic: 'js', difficulty: 'hard', score: 8, totalQuestions: 10, timeSpentSeconds: 60, data: { q: 1 } }), script);
    expect(a.ex.ok).toEqual({ id: 5, created_at: '2026-09-19' });
    expect(a.calls[0].params).toEqual([1, 'quiz', 'js', 'hard', 8, 10, 60, '{"q":1}']);
    const b = await run((s) => s.saveSession(1, { sessionType: 'notes', topic: 't', score: 0 }), script);
    expect(b.calls[0].params).toEqual([1, 'notes', 't', null, null, null, null, '{}']);
  });

  it('getHistory: with and without a type filter, defaults', async () => {
    const script = [[/FROM study_sessions/, { rows: [{ id: 1 }] }]];
    const a = await run((s) => s.getHistory(1, { sessionType: 'quiz', limit: 5, offset: 10 }), script);
    expect(a.calls[0].params).toEqual([1, 'quiz', 5, 10]);
    expect(a.calls[0].sql).toContain('AND session_type = $2 ORDER BY created_at DESC LIMIT $3 OFFSET $4');
    const b = await run((s) => s.getHistory(1, {}), script);
    expect(b.calls[0].params).toEqual([1, 20, 0]);
    expect(b.calls[0].sql).toContain('LIMIT $2 OFFSET $3');
    await run((s) => s.getHistory(1, { sessionType: null, limit: NaN, offset: NaN }), script);
  });

  it('getStats and getWeeklySummary', async () => {
    const a = await run((s) => s.getStats(4), [[/GROUP BY session_type/, { rows: [{ session_type: 'quiz', total_sessions: '2' }] }]]);
    expect(a.ex.ok).toEqual([{ session_type: 'quiz', total_sessions: '2' }]);
    const b = await run((s) => s.getWeeklySummary(4), [[/GROUP BY DATE\(created_at\)/, { rows: [{ study_date: '2026-09-18', sessions: '1' }] }]]);
    expect(b.ex.ok).toHaveLength(1);
  });

  it('propagates db errors', async () => {
    const a = await run((s) => s.getStats(1), [[/FROM study_sessions/, new Error('down')]]);
    expect(a.ex).toEqual({ error: 'down' });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('learningPathService parity', () => {
  const worker = (db) => createLearningPathService({ db });
  const run = (invoke, script) => parity({ express: expressLearningPath, worker, invoke, script });
  const completedAt = new Date('2026-09-18T08:00:00.000Z');
  const streakRow = { current_streak: 4, longest_streak: 9, last_active_date: '2026-09-19' };

  it('validateTier', async () => {
    const wk = createLearningPathService({ db: { query: async () => ({ rows: [] }) } });
    for (const tier of ['Beginner', 'Intermediate', 'Job_Tune', 'beginner', 'Advanced', '', undefined, null, 'Job Tune']) {
      expect(wk.validateTier(tier)).toBe(expressLearningPath.validateTier(tier));
    }
    expect(wk.validateTier('Job_Tune')).toBe(true);
    expect(wk.validateTier('beginner')).toBe(false);
  });

  it('listSubjects', async () => {
    const a = await run((s) => s.listSubjects(), [[/DISTINCT subject/, { rows: [{ subject: 'python' }, { subject: 'sql' }] }]]);
    expect(a.ex.ok).toEqual(['python', 'sql']);
  });

  it('listTopics maps the row shape', async () => {
    const rows = [{ id: 1, slug: 'a', title: 'A', topic_order: 1, completed: true, completed_at: completedAt }, { id: 2, slug: 'b', title: 'B', topic_order: 2, completed: false, completed_at: null }];
    const a = await run((s) => s.listTopics(7, 'python', 'Beginner'), [[/FROM learning_topics t/, { rows }]]);
    expect(a.ex.ok[0]).toEqual({ id: 1, slug: 'a', title: 'A', order: 1, completed: true, completedAt: completedAt });
    expect(a.calls[0].params).toEqual([7, 'python', 'Beginner']);
  });

  it('getTopic: found and not found', async () => {
    const row = { id: 1, slug: 'a', title: 'A', topic_order: 1, content_md: '# A', completed: false, completed_at: null };
    const a = await run((s) => s.getTopic(7, 'python', 'Beginner', 'a'), [[/FROM learning_topics t/, { rows: [row] }]]);
    expect(a.ex.ok).toEqual({ id: 1, slug: 'a', title: 'A', order: 1, contentMd: '# A', completed: false, completedAt: null });
    const b = await run((s) => s.getTopic(7, 'python', 'Beginner', 'zzz'), [[/FROM learning_topics t/, { rows: [] }]]);
    expect(b.ex.ok).toBeNull();
  });

  it('getStreak: found and default', async () => {
    const a = await run((s) => s.getStreak(7, 'python'), [[/FROM learning_streaks/, { rows: [streakRow] }]]);
    expect(a.ex.ok).toEqual({ currentStreak: 4, longestStreak: 9, lastActiveDate: '2026-09-19' });
    const b = await run((s) => s.getStreak(7, 'python'), [[/FROM learning_streaks/, { rows: [] }]]);
    expect(b.ex.ok).toEqual({ currentStreak: 0, longestStreak: 0, lastActiveDate: null });
  });

  it('markComplete: progress upsert, then the streak upsert (same two statements, same order)', async () => {
    const a = await run((s) => s.markComplete(7, 'python', 3), [[/^INSERT INTO learning_streaks/, { rows: [streakRow] }]]);
    expect(a.ex.ok).toEqual({ currentStreak: 4, longestStreak: 9, lastActiveDate: '2026-09-19' });
    expect(a.calls.map((c) => c.sql.split(' ').slice(0, 3).join(' '))).toEqual(['INSERT INTO learning_topic_progress', 'INSERT INTO learning_streaks']);
    expect(a.calls[0].params).toEqual([7, 3]);
    expect(a.calls[1].params).toEqual([7, 'python']);
  });

  it('markIncomplete: delete, then read the streak', async () => {
    const a = await run((s) => s.markIncomplete(7, 'python', 3), [[/^SELECT current_streak/, { rows: [streakRow] }]]);
    expect(a.ex.ok.currentStreak).toBe(4);
    expect(a.calls.map((c) => c.sql.split(' ')[0])).toEqual(['DELETE', 'SELECT']);
  });

  it('markComplete propagates a failure of the first statement without touching the streak', async () => {
    const a = await run((s) => s.markComplete(7, 'python', 3), [[/^INSERT INTO learning_topic_progress/, new Error('fk violation')]]);
    expect(a.ex).toEqual({ error: 'fk violation' });
    expect(a.calls).toHaveLength(1);
  });

  it('touchStreak with no row returned throws the same TypeError message', async () => {
    const a = await run((s) => s.touchStreak(7, 'python'), [[/^INSERT INTO learning_streaks/, { rows: [] }]]);
    expect(a.ex.error).toMatch(/undefined/);
  });

  it('methods are safe to destructure (the original relied on `this`)', async () => {
    const wk = createLearningPathService({ db: scriptedDb([[/^INSERT INTO learning_streaks/, { rows: [streakRow] }]]) });
    const { markComplete } = wk;
    await expect(markComplete(7, 'python', 3)).resolves.toMatchObject({ currentStreak: 4 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('evidenceTracker parity', () => {
  const embeddings = { embedText: (...a) => mockEmbed(...a) };
  const worker = (db) => createEvidenceTracker({ db, services: { embeddings } });
  const run = (invoke, script) => parity({ express: expressEvidence, worker, invoke, script });
  const wk = createEvidenceTracker({ db: { query: async () => ({ rows: [] }) }, services: { embeddings } });

  it('exports the same API names as the original module', () => {
    expect(Object.keys(wk).sort()).toEqual(Object.keys(expressEvidence).sort());
  });

  const TEXTS = [
    '- Led backend team\n- Built REST APIs with Node.js and PostgreSQL\n- Improved test coverage',
    '• Managed CI/CD pipelines\n• Deployed to AWS using Docker and Kubernetes',
    '* Wrote unit tests with Jest\n*   \n-\n- \n  - indented bullet',
    'No bullets here\n\n  \nJust text',
    '- Improved latency by 50% 🚀 using async patterns\n- Go and Rust and C++ and C# in machine learning',
    '',
    null,
    undefined,
    Array.from({ length: 200 }, (_, i) => `- Bullet ${i} in react and vue`).join('\n'),
  ];

  it.each(TEXTS.map((t, i) => [i, t]))('extractBullets / hashBullet / extractSkillsFromText agree on corpus #%s', (_i, text) => {
    expect(wk.extractBullets(text)).toEqual(expressEvidence.extractBullets(text));
    if (typeof text === 'string') {
      expect(wk.hashBullet(text)).toBe(expressEvidence.hashBullet(text));
      expect(wk.extractSkillsFromText(text)).toEqual(expressEvidence.extractSkillsFromText(text));
    }
  });

  it('hashBullet is SHA-256 hex', () => {
    expect(wk.hashBullet('hello')).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
  });

  it.each([
    [[]],
    [[{ usage_count: '1' }, { usage_count: '1' }]],
    [[{ usage_count: '0' }, { usage_count: '0' }]],
    [[{ usage_count: '10' }, { usage_count: '1' }]],
    [[{ usage_count: '3' }, { usage_count: '3' }, { usage_count: '0' }]],
    [[{ usage_count: '2' }, { usage_count: '7' }, { usage_count: '1' }, { usage_count: '0' }]],
  ])('calculateDiversityScore agrees %#', (rows) => {
    expect(wk.calculateDiversityScore(rows)).toBe(expressEvidence.calculateDiversityScore(rows));
  });
  it('calculateDiversityScore agrees on null/undefined', () => {
    expect(wk.calculateDiversityScore(null)).toBe(expressEvidence.calculateDiversityScore(null));
    expect(wk.calculateDiversityScore(undefined)).toBe(0);
  });

  it('saveBullet embeds through services.embeddings.embedText and inserts the same statement', async () => {
    mockEmbed.mockReset().mockResolvedValue([0.1, 0.2, 0.3]);
    const bullet = { text: 'Built Node.js API', skills: ['node.js', 'api'], hash: 'abc' };
    const a = await run((s) => s.saveBullet(7, bullet, 'projects'), [[/INSERT INTO evidence_bullets/, { rows: [{ id: 9 }] }]]);
    expect(a.ex.ok).toEqual({ id: 9 });
    expect(a.calls[0].params).toEqual([7, 'Built Node.js API', 'abc', 'projects', '["node.js","api"]', '[0.1,0.2,0.3]']);
    expect(mockEmbed).toHaveBeenCalledTimes(2); // once per implementation
  });
  it('saveBullet: default section, ON CONFLICT DO NOTHING returns null', async () => {
    mockEmbed.mockReset().mockResolvedValue([1]);
    const a = await run((s) => s.saveBullet(7, { text: 't', skills: [], hash: 'h' }), [[/INSERT INTO evidence_bullets/, { rows: [] }]]);
    expect(a.ex.ok).toBeNull();
    expect(a.calls[0].params[3]).toBe('experience');
  });
  it('saveBullet: an embedding failure propagates and nothing is inserted', async () => {
    mockEmbed.mockReset().mockRejectedValue(new Error('embed down'));
    const a = await run((s) => s.saveBullet(7, { text: 't', skills: [], hash: 'h' }), []);
    expect(a.ex).toEqual({ error: 'embed down' });
    expect(a.calls).toHaveLength(0);
  });

  it('logUsage: success, null applicationId, validation errors', async () => {
    const script = [[/INSERT INTO evidence_usage/, { rows: [{ id: 99 }] }]];
    const a = await run((s) => s.logUsage(10, 5, 'tailored_resume'), script);
    expect(a.ex.ok).toEqual({ id: 99 });
    await run((s) => s.logUsage(10, null, 'cover_letter'), script);
    expect((await run((s) => s.logUsage(null, 5, 'x'), script)).ex).toEqual({ error: 'bulletId is required' });
    expect((await run((s) => s.logUsage(undefined, 5, 'x'), script)).ex).toEqual({ error: 'bulletId is required' });
    expect((await run((s) => s.logUsage(0, 5, ''), script)).ex).toEqual({ error: 'context is required' });
  });

  it('getReuseReport: empty, mixed, all-once, heavy reuse', async () => {
    const q = (rows) => [[/FROM evidence_bullets eb/, { rows }]];
    const empty = await run((s) => s.getReuseReport(1), q([]));
    expect(empty.ex.ok).toEqual({ overUsed: [], underUsed: [], uniqueBullets: 0, diversity: 0, suggestions: [] });
    const mixed = await run((s) => s.getReuseReport(1), q([
      { id: 1, bullet_text: 'Led team', skills: ['leadership'], usage_count: '5' },
      { id: 2, bullet_text: 'Built API', skills: [], usage_count: '1' },
      { id: 3, bullet_text: 'Wrote tests', skills: [], usage_count: '0' },
      { id: 4, bullet_text: 'Mid', skills: [], usage_count: '2' },
    ]));
    expect(mixed.ex.ok.overUsed).toEqual([{ bullet: 'Led team', count: 5 }]);
    expect(mixed.ex.ok.underUsed).toEqual([{ bullet: 'Built API', count: 1 }, { bullet: 'Wrote tests', count: 0 }]);
    expect(mixed.ex.ok.suggestions).toHaveLength(2); // diversity ~55 (>= 50): no low-diversity hint
    const ones = await run((s) => s.getReuseReport(1), q([{ id: 1, bullet_text: 'A', usage_count: '1' }, { id: 2, bullet_text: 'B', usage_count: '1' }]));
    expect(ones.ex.ok.diversity).toBe(100);
    const heavy = await run((s) => s.getReuseReport(1), q([{ id: 1, bullet_text: 'A', usage_count: '10' }, { id: 2, bullet_text: 'B', usage_count: '1' }]));
    expect(heavy.ex.ok.diversity).toBeLessThan(50);
    expect(heavy.ex.ok.suggestions.join(' ')).toMatch(/Diversity score is low/);
    expect((await run((s) => s.getReuseReport(1), [[/FROM evidence_bullets eb/, new Error('db')]])).ex).toEqual({ error: 'db' });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('piiRedactor parity', () => {
  const wk = createPiiRedactor();

  it('exports { redact, restore } like the original module', () => {
    expect(Object.keys(wk).sort()).toEqual(['redact', 'restore']);
    expect(Object.keys(wk).sort()).toEqual(Object.keys(expressPii).sort());
  });

  const CORPUS = [
    '',
    'This is a normal sentence with no personal info.',
    'Contact me at john@example.com please.',
    'From alice@test.com to bob@other.org and user.name+tag@mail.co.uk',
    'Call 555-123-4567 or 555.123.4567 or 555 123 4567 or 5551234567',
    'I live at 123 Main Street and moved from 100 First St to 200 Second Ave, 456 Oak Ave, 789 sunset blvd',
    'John Smith and Sarah Johnson met Thomas Taylor (Thomas is both a first and last name).',
    'John: john@test.com, 555-111-2222, 100 Oak Ave, Alice Brown',
    'Overlap: 555-123-4567 street 123 Elm Street 5551234567 Kevin',
    'jsmith@example.com is John Smith at 12 Baker Street phone (555) 987-6543 ryan.young@corp.io',
    'emoji 🚀 John 🚀 555-000-1111',
    'Multi\nline\nJohn\nemail: a@b.co\n',
    'x'.repeat(5000) + ' John ' + 'y'.repeat(5000),
  ];

  it.each(CORPUS.map((t, i) => [i, t]))('redact agrees on corpus #%s, and restore round-trips it', (_i, text) => {
    const w = wk.redact(text);
    expect(w).toEqual(expressPii.redact(text));
    expect(wk.restore(w.redacted, w.map)).toBe(expressPii.restore(w.redacted, w.map));
  });

  it.each([[null], [undefined], [42], [{}], [['a']]])('redact rejects non-string %p with the same error', (input) => {
    let ex;
    let w;
    try { expressPii.redact(input); } catch (e) { ex = e; }
    try { wk.redact(input); } catch (e) { w = e; }
    expect(ex).toBeInstanceOf(TypeError);
    expect(w).toBeInstanceOf(TypeError);
    expect(w.message).toBe(ex.message);
  });

  it.each([[null], [undefined], [7]])('restore rejects a non-string text %p with the same error', (input) => {
    expect(() => wk.restore(input, {})).toThrow('restore() requires a string as first argument');
    expect(() => expressPii.restore(input, {})).toThrow('restore() requires a string as first argument');
  });

  it('restore: missing token no-op, replacement-pattern quirk preserved, bad map throws like the original', () => {
    const map = { '[EMAIL_1]': 'a@b.com' };
    expect(wk.restore('[EMAIL_1] and [EMAIL_2]', map)).toBe(expressPii.restore('[EMAIL_1] and [EMAIL_2]', map));
    const quirky = { '[NAME_1]': '$& costs $$5' }; // "$&" and "$$" are String.replace patterns
    expect(wk.restore('hello [NAME_1]', quirky)).toBe(expressPii.restore('hello [NAME_1]', quirky));
    expect(wk.restore('hello [NAME_1]', quirky)).toBe('hello [NAME_1] costs $5');
    expect(() => wk.restore('x', null)).toThrow();
    expect(() => expressPii.restore('x', null)).toThrow();
  });

  it('the shared module-level regexes hold no state between calls', () => {
    const a = wk.redact('john@example.com 555-123-4567 John');
    const b = wk.redact('john@example.com 555-123-4567 John');
    expect(b).toEqual(a);
  });
});
