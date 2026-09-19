'use strict';

/**
 * /api/study-history (routes/studyHistory.js): seven endpoints, every one authenticateToken +
 * requirePlan(1). Real studyHistoryService + srsService + route against the stateful
 * srs_cards / study_sessions model. Errors are thrown (Express called next(err)), so 5xx bodies
 * are the masked global error shape; the only mapped error is reviewCard's "Card not found" (404).
 */
const { build } = require('./helpers');
const { signToken } = require('../helpers/harness');

beforeEach(() => jest.spyOn(console, 'error').mockImplementation(() => {}));
afterEach(() => jest.restoreAllMocks());

const BASE = '/api/study-history';
const ENDPOINTS = [
  ['GET', `${BASE}/history`, undefined],
  ['GET', `${BASE}/stats`, undefined],
  ['GET', `${BASE}/weekly`, undefined],
  ['POST', `${BASE}/srs/decks`, { deckId: 'd', cards: [{ front: 'Q', back: 'A' }] }],
  ['GET', `${BASE}/srs/decks`, undefined],
  ['GET', `${BASE}/srs/due`, undefined],
  ['POST', `${BASE}/srs/review`, { cardId: 1, quality: 4 }],
];

const denied = (currentPlan) => ({
  error: 'This feature requires a higher subscription plan.',
  code: 'PLAN_UPGRADE_REQUIRED',
  requiredPlan: 'Learn & Build',
  currentPlan,
});

describe('auth and plan parity (every endpoint is requirePlan(1))', () => {
  it.each(ENDPOINTS)('401 without a token: %s %s', async (method, path, body) => {
    const H = build({ plan: 3 });
    const res = await H.call(method, path, { body, token: null });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
    expect(H.db.leafCalls).toHaveLength(0);
  });

  it.each(ENDPOINTS)('403 PLAN_UPGRADE_REQUIRED with no plan: %s %s (service never reached)', async (method, path, body) => {
    const H = build();
    const res = await H.call(method, path, { body });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual(denied(null));
    expect(H.db.leafCalls).toHaveLength(0);
  });

  it.each(ENDPOINTS)('reachable at exactly tier 1: %s %s', async (method, path, body) => {
    const H = build({ plan: 1 });
    H.db.on(/GROUP BY session_type|GROUP BY DATE\(created_at\)/, () => ({ rows: [] }));
    const res = await H.call(method, path, { body });
    // past both gates: review of a card that does not exist is the route's own 404, everything else 200
    expect(res.status).toBe(path.endsWith('/srs/review') ? 404 : 200);
  });

  it.each([2, 3])('higher tiers pass too (plan %i)', async (plan) => {
    const H = build({ plan });
    const res = await H.get(`${BASE}/srs/decks`);
    expect(res.status).toBe(200);
  });

  it('a token whose user has no subscription row is 403 with currentPlan null, not 401', async () => {
    const H = build({ plan: 1, userId: 7 });
    const res = await H.get(`${BASE}/srs/decks`, { token: signToken({ id: 999 }) });
    expect(res.status).toBe(403);
    expect((await res.json()).currentPlan).toBeNull();
  });

  it('fails CLOSED: a plan-lookup error is a 500 and the service is never reached', async () => {
    const H = build({ plan: 1 });
    H.db.failWhen((sql) => /FROM subscription_plans sp JOIN user_subscriptions/.test(sql), new Error('plans down'));
    const res = await H.get(`${BASE}/history`);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Failed to verify subscription plan' });
    expect(H.db.leafCalls).toHaveLength(0);
  });
});

describe('GET /history', () => {
  function seed(H) {
    const at = (n) => new Date(Date.parse('2026-09-19T00:00:00Z') - n * 3600e3);
    H.db.state.study_sessions.push(
      { id: 1, user_id: 7, session_type: 'quiz', topic: 'js', difficulty: 'hard', score: 8, total_questions: 10, time_spent_seconds: 60, created_at: at(3) },
      { id: 2, user_id: 7, session_type: 'notes', topic: 'sql', difficulty: null, score: null, total_questions: null, time_spent_seconds: null, created_at: at(2) },
      { id: 3, user_id: 7, session_type: 'quiz', topic: 'css', difficulty: null, score: 5, total_questions: 5, time_spent_seconds: 30, created_at: at(1) },
      { id: 4, user_id: 8, session_type: 'quiz', topic: 'someone else', difficulty: null, score: 1, total_questions: 1, time_spent_seconds: 1, created_at: at(0) }
    );
  }

  it('returns the caller\'s sessions newest first under `sessions`, defaults limit 20 / offset 0', async () => {
    const H = build({ plan: 1 });
    seed(H);
    const res = await H.get(`${BASE}/history`);
    expect(res.status).toBe(200);
    const { sessions } = await res.json();
    expect(sessions.map((s) => s.id)).toEqual([3, 2, 1]); // user 8's row is excluded
    expect(sessions[0]).toEqual({
      id: 3, session_type: 'quiz', topic: 'css', difficulty: null, score: 5, total_questions: 5, time_spent_seconds: 30, created_at: expect.any(String),
    });
    expect(H.db.leafCalls[0].params).toEqual([7, 20, 0]);
  });

  it('?type= filters by session_type', async () => {
    const H = build({ plan: 1 });
    seed(H);
    const { sessions } = await (await H.get(`${BASE}/history?type=quiz`)).json();
    expect(sessions.map((s) => s.id)).toEqual([3, 1]);
    expect(H.db.leafCalls[0].params).toEqual([7, 'quiz', 20, 0]);
  });

  it('an empty ?type= is treated as no filter', async () => {
    const H = build({ plan: 1 });
    seed(H);
    const { sessions } = await (await H.get(`${BASE}/history?type=`)).json();
    expect(sessions).toHaveLength(3);
  });

  it('?limit and ?offset paginate (parsed base 10)', async () => {
    const H = build({ plan: 1 });
    seed(H);
    const { sessions } = await (await H.get(`${BASE}/history?limit=1&offset=1`)).json();
    expect(sessions.map((s) => s.id)).toEqual([2]);
    await H.get(`${BASE}/history?limit=010&offset=0x1`);
    expect(H.db.leafCalls[1].params).toEqual([7, 10, 0]); // "010" -> 10, "0x1" -> 0 (radix 10)
  });

  it.each(['limit=abc', 'offset=abc', 'limit='])('a non-numeric %s reaches the database as NaN and fails as a masked 500 (preserved quirk)', async (qs) => {
    const H = build({ plan: 1 });
    seed(H);
    const res = await H.get(`${BASE}/history?${qs}`);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal Server Error' });
  });
});

describe('GET /stats and /weekly', () => {
  it('stats: rows under `stats`', async () => {
    const H = build({ plan: 1 });
    const rows = [{ session_type: 'quiz', total_sessions: '2', avg_score: '6.5', total_time_seconds: '90', last_session: '2026-09-18T00:00:00.000Z' }];
    H.db.on(/GROUP BY session_type/, ([userId]) => {
      expect(userId).toBe(7);
      return { rows };
    });
    const res = await H.get(`${BASE}/stats`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ stats: rows });
  });

  it('weekly: rows under `summary`', async () => {
    const H = build({ plan: 1 });
    const rows = [{ study_date: '2026-09-18', sessions: '2', total_seconds: '90', avg_score: '6.5' }];
    H.db.on(/GROUP BY DATE\(created_at\)/, () => ({ rows }));
    const res = await H.get(`${BASE}/weekly`);
    expect(await res.json()).toEqual({ summary: rows });
  });

  it.each([['stats', /GROUP BY session_type/], ['weekly', /GROUP BY DATE\(created_at\)/]])('%s: a database error is a masked 500', async (path, re) => {
    const H = build({ plan: 1 });
    H.db.failOn(re, new Error('relation "study_sessions" does not exist'));
    const res = await H.get(`${BASE}/${path}`);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal Server Error' });
  });
});

describe('SRS flow: POST /srs/decks, GET /srs/decks, GET /srs/due, POST /srs/review', () => {
  const cards = [{ front: 'Q1', back: 'A1' }, { front: 'Q2', back: 'A2', difficulty: 'hard' }];

  it('saves a deck, lists it with string counts, and reports the due cards', async () => {
    const H = build({ plan: 1 });
    const saved = await H.post(`${BASE}/srs/decks`, { deckId: 'deck-1', cards });
    expect(saved.status).toBe(200);
    expect(await saved.json()).toEqual({ success: true, deckId: 'deck-1', cardCount: 2 });
    expect(H.db.state.srs_cards.map((c) => [c.user_id, c.deck_id, c.front, c.difficulty])).toEqual([
      [7, 'deck-1', 'Q1', 'medium'],
      [7, 'deck-1', 'Q2', 'hard'],
    ]);

    const decks = await (await H.get(`${BASE}/srs/decks`)).json();
    expect(decks).toEqual({
      decks: [{ deck_id: 'deck-1', total_cards: '2', due_count: '2', reviewed_count: '0', avg_ease: '2.5', created_at: expect.any(String) }],
    });

    const due = await (await H.get(`${BASE}/srs/due`)).json();
    expect(due.cards.map((c) => c.front)).toEqual(['Q1', 'Q2']);
    expect(due.cards[0]).toEqual({
      id: 1, deck_id: 'deck-1', front: 'Q1', back: 'A1', difficulty: 'medium', ease_factor: 2.5, interval_days: 0, repetitions: 0, next_review: H.db.today,
    });
  });

  it('re-saving the same deck upserts (no duplicates), updating back/difficulty', async () => {
    const H = build({ plan: 1 });
    await H.post(`${BASE}/srs/decks`, { deckId: 'deck-1', cards });
    await H.post(`${BASE}/srs/decks`, { deckId: 'deck-1', cards: [{ front: 'Q1', back: 'A1 v2', difficulty: 'easy' }] });
    expect(H.db.state.srs_cards).toHaveLength(2);
    expect(H.db.state.srs_cards[0]).toMatchObject({ back: 'A1 v2', difficulty: 'easy' });
  });

  describe('POST /srs/decks validation', () => {
    it.each([
      ['no deckId', { cards }],
      ['empty deckId', { deckId: '', cards }],
      ['cards not an array', { deckId: 'd', cards: 'nope' }],
      ['cards missing', { deckId: 'd' }],
      ['cards empty', { deckId: 'd', cards: [] }],
    ])('400 %s', async (_n, body) => {
      const H = build({ plan: 1 });
      const res = await H.post(`${BASE}/srs/decks`, body);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'deckId and a non-empty cards array are required' });
      expect(H.db.leafCalls).toHaveLength(0);
    });

    it('no request body is a TypeError -> masked 500 (not a 400), preserved', async () => {
      const H = build({ plan: 1 });
      const res = await H.call('POST', `${BASE}/srs/decks`);
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: 'Internal Server Error' });
    });

    it('malformed JSON is a 400 from the global body parser', async () => {
      const H = build({ plan: 1 });
      const res = await H.post(`${BASE}/srs/decks`, '{"deckId":');
      expect(res.status).toBe(400);
    });

    it('a database error is a masked 500', async () => {
      const H = build({ plan: 1 });
      H.db.failOn(/^INSERT INTO srs_cards/, new Error('too many parameters'));
      const res = await H.post(`${BASE}/srs/decks`, { deckId: 'd', cards });
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: 'Internal Server Error' });
    });
  });

  describe('GET /srs/due', () => {
    async function seedDecks(H) {
      await H.post(`${BASE}/srs/decks`, { deckId: 'a', cards: [{ front: 'A1', back: '1' }, { front: 'A2', back: '2' }] });
      await H.post(`${BASE}/srs/decks`, { deckId: 'b', cards: [{ front: 'B1', back: '1' }] });
    }

    it('?deckId filters, ?limit caps', async () => {
      const H = build({ plan: 1 });
      await seedDecks(H);
      expect((await (await H.get(`${BASE}/srs/due?deckId=b`)).json()).cards.map((c) => c.front)).toEqual(['B1']);
      expect((await (await H.get(`${BASE}/srs/due?limit=2`)).json()).cards).toHaveLength(2);
      const calls = H.db.leafCallsMatching(/FROM srs_cards WHERE user_id/);
      expect(calls[0].params).toEqual([7, 'b', 20]);
      expect(calls[1].params).toEqual([7, 2]);
    });

    it('cards scheduled in the future are not due', async () => {
      const H = build({ plan: 1 });
      await seedDecks(H);
      H.db.state.srs_cards.forEach((c) => { c.next_review = '2026-12-31'; });
      expect((await (await H.get(`${BASE}/srs/due`)).json()).cards).toEqual([]);
    });

    it('only the caller\'s cards are returned', async () => {
      const H = build({ plan: 1 });
      await seedDecks(H);
      H.db.state.user_subscriptions.push({ user_id: 8, plan_id: 1 });
      const other = await (await H.get(`${BASE}/srs/due`, { token: signToken({ id: 8 }) })).json();
      expect(other.cards).toEqual([]);
    });

    it('a non-numeric ?limit is a masked 500 (NaN reaches the database, preserved quirk)', async () => {
      const H = build({ plan: 1 });
      const res = await H.get(`${BASE}/srs/due?limit=abc`);
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: 'Internal Server Error' });
    });
  });

  describe('POST /srs/review (SM-2)', () => {
    async function withCard(H) {
      await H.post(`${BASE}/srs/decks`, { deckId: 'd', cards: [{ front: 'Q', back: 'A' }] });
      return H.db.state.srs_cards[0];
    }

    it('a good review schedules the card and persists the new state', async () => {
      const H = build({ plan: 1 });
      const card = await withCard(H);
      const res = await H.post(`${BASE}/srs/review`, { cardId: card.id, quality: 4 });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ success: true, ease_factor: 2.5, interval_days: 1, repetitions: 1, next_review: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) });
      expect(H.db.state.srs_cards[0]).toMatchObject({ repetitions: 1, interval_days: 1, ease_factor: 2.5, next_review: body.next_review });
    });

    it('successive reviews follow 1 -> 6 -> round(6 * ease)', async () => {
      const H = build({ plan: 1 });
      const card = await withCard(H);
      const intervals = [];
      for (let i = 0; i < 3; i++) {
        const body = await (await H.post(`${BASE}/srs/review`, { cardId: card.id, quality: 4 })).json();
        intervals.push(body.interval_days);
      }
      expect(intervals).toEqual([1, 6, 15]);
    });

    it('a failed review (quality < 3) resets repetitions and interval', async () => {
      const H = build({ plan: 1 });
      const card = await withCard(H);
      await H.post(`${BASE}/srs/review`, { cardId: card.id, quality: 5 });
      const body = await (await H.post(`${BASE}/srs/review`, { cardId: card.id, quality: 2 })).json();
      expect(body).toMatchObject({ success: true, repetitions: 0, interval_days: 0 });
    });

    it('quality 0 is accepted (only undefined is rejected) and out-of-range values are clamped', async () => {
      const H = build({ plan: 1 });
      const card = await withCard(H);
      expect((await H.post(`${BASE}/srs/review`, { cardId: card.id, quality: 0 })).status).toBe(200);
      const high = await (await H.post(`${BASE}/srs/review`, { cardId: card.id, quality: 99 })).json();
      expect(high.repetitions).toBe(1);
    });

    it.each([
      ['cardId missing', { quality: 3 }],
      ['quality missing', { cardId: 1 }],
      ['both missing', {}],
    ])('400 %s', async (_n, body) => {
      const H = build({ plan: 1 });
      const res = await H.post(`${BASE}/srs/review`, body);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'cardId and quality (0-5) are required' });
      expect(H.db.leafCalls).toHaveLength(0);
    });

    it('null values pass the presence check (only === undefined is rejected) -> the service runs', async () => {
      const H = build({ plan: 1 });
      const res = await H.post(`${BASE}/srs/review`, { cardId: null, quality: null });
      expect(res.status).toBe(500); // Postgres cast of null id -> our model throws: masked 500, same route decision as Express
      expect(H.db.leafCallsMatching(/^SELECT \* FROM srs_cards/)).toHaveLength(1);
    });

    it('404 { error: "Card not found" } for an unknown card and for another user\'s card', async () => {
      const H = build({ plan: 1 });
      const card = await withCard(H);
      const missing = await H.post(`${BASE}/srs/review`, { cardId: 9999, quality: 4 });
      expect(missing.status).toBe(404);
      expect(await missing.json()).toEqual({ error: 'Card not found' });

      H.db.state.user_subscriptions.push({ user_id: 8, plan_id: 1 });
      const foreign = await H.post(`${BASE}/srs/review`, { cardId: card.id, quality: 4 }, { token: signToken({ id: 8 }) });
      expect(foreign.status).toBe(404);
      expect(H.db.state.srs_cards[0].repetitions).toBe(0); // untouched
    });

    it('any other error is a masked 500, not a 404', async () => {
      const H = build({ plan: 1 });
      await withCard(H);
      const res = await H.post(`${BASE}/srs/review`, { cardId: 'abc', quality: 4 });
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: 'Internal Server Error' });
    });

    it('no request body is a masked 500 (destructuring an undefined body), preserved', async () => {
      const H = build({ plan: 1 });
      const res = await H.call('POST', `${BASE}/srs/review`);
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: 'Internal Server Error' });
    });
  });
});
