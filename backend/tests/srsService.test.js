const mockQuery = jest.fn();
jest.mock('../src/config/database', () => ({
  pool: { query: mockQuery },
}));

const srsService = require('../src/services/srsService');

describe('SRSService', () => {
  beforeEach(() => jest.clearAllMocks());

  // ─── saveDeck ──────────────────────────────────────────────────────────────

  describe('saveDeck()', () => {
    it('inserts cards with correct parameterized query', async () => {
      mockQuery.mockResolvedValueOnce({});

      await srsService.saveDeck(1, 'deck-1', [
        { front: 'Q1', back: 'A1' },
        { front: 'Q2', back: 'A2', difficulty: 'hard' },
      ]);

      expect(mockQuery).toHaveBeenCalledTimes(1);
      const [sql, params] = mockQuery.mock.calls[0];
      expect(sql).toContain('INSERT INTO srs_cards');
      expect(sql).toContain('ON CONFLICT');
      expect(params).toEqual([1, 'deck-1', 'Q1', 'A1', 'medium', 1, 'deck-1', 'Q2', 'A2', 'hard']);
    });

    it('defaults difficulty to medium', async () => {
      mockQuery.mockResolvedValueOnce({});

      await srsService.saveDeck(1, 'deck-1', [{ front: 'Q', back: 'A' }]);

      const params = mockQuery.mock.calls[0][1];
      expect(params[4]).toBe('medium');
    });
  });

  // ─── getDueCards ───────────────────────────────────────────────────────────

  describe('getDueCards()', () => {
    it('returns due cards for user', async () => {
      const cards = [{ id: 1, front: 'Q1', back: 'A1' }];
      mockQuery.mockResolvedValueOnce({ rows: cards });

      const result = await srsService.getDueCards(1);

      expect(result).toEqual(cards);
      expect(mockQuery.mock.calls[0][1][0]).toBe(1);
    });

    it('filters by deckId when provided', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await srsService.getDueCards(1, 'deck-1', 10);

      const [sql, params] = mockQuery.mock.calls[0];
      expect(sql).toContain('deck_id');
      expect(params).toContain('deck-1');
    });

    it('defaults limit to 20', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await srsService.getDueCards(1);

      const params = mockQuery.mock.calls[0][1];
      expect(params[params.length - 1]).toBe(20);
    });
  });

  // ─── reviewCard ────────────────────────────────────────────────────────────

  describe('reviewCard()', () => {
    const baseCard = {
      id: 1,
      user_id: 1,
      ease_factor: 2.5,
      interval_days: 1,
      repetitions: 0,
    };

    it('throws when card not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(srsService.reviewCard(1, 999, 4)).rejects.toThrow('Card not found');
    });

    it('resets repetitions and interval on quality < 3', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ ...baseCard, repetitions: 3, interval_days: 6 }] });
      mockQuery.mockResolvedValueOnce({});

      const result = await srsService.reviewCard(1, 1, 2);

      expect(result.repetitions).toBe(0);
      expect(result.interval_days).toBe(0);
    });

    it('sets interval to 1 on first successful review', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [baseCard] });
      mockQuery.mockResolvedValueOnce({});

      const result = await srsService.reviewCard(1, 1, 4);

      expect(result.interval_days).toBe(1);
      expect(result.repetitions).toBe(1);
    });

    it('sets interval to 6 on second successful review', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ ...baseCard, repetitions: 1, interval_days: 1 }] });
      mockQuery.mockResolvedValueOnce({});

      const result = await srsService.reviewCard(1, 1, 4);

      expect(result.interval_days).toBe(6);
      expect(result.repetitions).toBe(2);
    });

    it('multiplies interval by ease_factor on subsequent reviews', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ ...baseCard, repetitions: 2, interval_days: 6, ease_factor: 2.5 }] });
      mockQuery.mockResolvedValueOnce({});

      const result = await srsService.reviewCard(1, 1, 4);

      expect(result.interval_days).toBe(15); // Math.round(6 * 2.5)
    });

    it('clamps quality to 0-5 range', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [baseCard] });
      mockQuery.mockResolvedValueOnce({});

      const result = await srsService.reviewCard(1, 1, 10);

      expect(result.repetitions).toBe(1);
    });

    it('ease_factor never drops below 1.3', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ ...baseCard, ease_factor: 1.3 }] });
      mockQuery.mockResolvedValueOnce({});

      const result = await srsService.reviewCard(1, 1, 0);

      expect(result.ease_factor).toBeGreaterThanOrEqual(1.3);
    });
  });

  // ─── getDecks ──────────────────────────────────────────────────────────────

  describe('getDecks()', () => {
    it('returns deck stats for user', async () => {
      const decks = [
        { deck_id: 'deck-1', total_cards: 10, due_count: 3, reviewed_count: 7 },
      ];
      mockQuery.mockResolvedValueOnce({ rows: decks });

      const result = await srsService.getDecks(1);

      expect(result).toEqual(decks);
      expect(mockQuery.mock.calls[0][1]).toEqual([1]);
    });
  });
});
