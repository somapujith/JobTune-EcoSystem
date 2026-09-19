const mockQuery = jest.fn();
jest.mock('../src/config/database', () => ({
  pool: { query: mockQuery },
}));

const progressService = require('../src/services/progressService');

describe('ProgressService', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('validateContext()', () => {
    it('returns true for allowed contexts', () => {
      expect(progressService.validateContext('zero-to-hero')).toBe(true);
      expect(progressService.validateContext('learn-and-build')).toBe(true);
      expect(progressService.validateContext('tune-and-polish')).toBe(true);
      expect(progressService.validateContext('preferences')).toBe(true);
    });

    it('returns false for disallowed contexts', () => {
      expect(progressService.validateContext('invalid')).toBe(false);
      expect(progressService.validateContext('')).toBe(false);
    });
  });

  describe('getProgress()', () => {
    it('returns progress data for existing record', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ progress_data: { step: 3 }, updated_at: '2026-06-26' }],
      });

      const result = await progressService.getProgress(1, 'zero-to-hero');

      expect(result).toEqual({ data: { step: 3 }, updatedAt: '2026-06-26' });
    });

    it('returns empty data when no record exists', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await progressService.getProgress(1, 'zero-to-hero');

      expect(result).toEqual({ data: {}, updatedAt: null });
    });

    it('handles null progress_data', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ progress_data: null, updated_at: '2026-06-26' }],
      });

      const result = await progressService.getProgress(1, 'zero-to-hero');

      expect(result.data).toEqual({});
    });
  });

  describe('getAllProgress()', () => {
    it('returns all contexts for user', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { context_key: 'learn-and-build', progress_data: { step: 1 }, updated_at: '2026-06-25' },
          { context_key: 'zero-to-hero', progress_data: { step: 5 }, updated_at: '2026-06-26' },
        ],
      });

      const result = await progressService.getAllProgress(1);

      expect(result).toHaveLength(2);
      expect(result[0].contextKey).toBe('learn-and-build');
      expect(result[1].data).toEqual({ step: 5 });
    });

    it('returns empty array when no progress', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await progressService.getAllProgress(1);

      expect(result).toEqual([]);
    });
  });

  describe('saveProgress()', () => {
    it('upserts progress and returns result', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ progress_data: { step: 3 }, updated_at: '2026-06-26' }],
      });

      const result = await progressService.saveProgress(1, 'zero-to-hero', { step: 3 });

      expect(result.data).toEqual({ step: 3 });
      expect(mockQuery.mock.calls[0][0]).toContain('ON CONFLICT');
    });

    it('defaults data to empty object when null', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ progress_data: {}, updated_at: '2026-06-26' }],
      });

      await progressService.saveProgress(1, 'preferences', null);

      expect(mockQuery.mock.calls[0][1][2]).toBe('{}');
    });
  });

  describe('mergeProgress()', () => {
    it('merges partial data with existing progress', async () => {
      // getProgress
      mockQuery.mockResolvedValueOnce({
        rows: [{ progress_data: { step: 1, name: 'test' }, updated_at: '2026-06-25' }],
      });
      // saveProgress
      mockQuery.mockResolvedValueOnce({
        rows: [{ progress_data: { step: 2, name: 'test' }, updated_at: '2026-06-26' }],
      });

      const result = await progressService.mergeProgress(1, 'zero-to-hero', { step: 2 });

      expect(result.data).toEqual({ step: 2, name: 'test' });
      const savedJson = JSON.parse(mockQuery.mock.calls[1][1][2]);
      expect(savedJson).toEqual({ step: 2, name: 'test' });
    });
  });
});
