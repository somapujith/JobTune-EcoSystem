const mockQuery = jest.fn();
jest.mock('../src/config/database', () => ({
  pool: { query: mockQuery },
}));

const ResumeDatabase = require('../src/services/resumeDatabase');

describe('ResumeDatabase', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('saveResume()', () => {
    it('inserts resume and returns id', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 1, created_at: '2026-06-26' }] });

      const result = await ResumeDatabase.saveResume(42, 'resume text', {
        total: 78,
        role: 'Software Engineer',
        keywordCoverage: { react: true },
        missingInfo: { phone: true },
      });

      expect(result.id).toBe(1);
      expect(mockQuery.mock.calls[0][0]).toContain('INSERT INTO resumes');
      expect(mockQuery.mock.calls[0][1][0]).toBe(42);
    });

    it('propagates database errors', async () => {
      mockQuery.mockRejectedValueOnce(new Error('DB error'));

      await expect(
        ResumeDatabase.saveResume(1, 'text', { total: 50 })
      ).rejects.toThrow('DB error');
    });
  });

  describe('updateOptimizedResume()', () => {
    it('updates optimized resume and saves analysis', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 1 }] }); // UPDATE
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 1 }] }); // saveAnalysis INSERT

      const result = await ResumeDatabase.updateOptimizedResume(1, 'optimized text', 92, {
        breakdown: { 'Section Completeness (30)': 28 },
        details: { actionVerbs: { count: 15 }, metrics: { count: 5 }, missingSections: [] },
        recommendations: ['Add more metrics'],
      });

      expect(result.id).toBe(1);
      expect(mockQuery).toHaveBeenCalledTimes(2);
    });

    it('skips saveAnalysis when analysis is null', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 1 }] });

      await ResumeDatabase.updateOptimizedResume(1, 'text', 90, null);

      expect(mockQuery).toHaveBeenCalledTimes(1);
    });
  });

  describe('saveAnalysis()', () => {
    it('upserts analysis with correct parameters', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 1 }] });

      await ResumeDatabase.saveAnalysis(1, {
        breakdown: {
          'Section Completeness (30)': 25,
          'Keyword Relevance (25)': 20,
          'Formatting (15)': 12,
        },
        details: {
          actionVerbs: { count: 10 },
          metrics: { count: 3 },
          missingSections: ['Education'],
        },
        recommendations: ['Add education section'],
      });

      expect(mockQuery.mock.calls[0][0]).toContain('ON CONFLICT (resume_id)');
    });

    it('handles missing breakdown/details gracefully', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 1 }] });

      await ResumeDatabase.saveAnalysis(1, {});

      const params = mockQuery.mock.calls[0][1];
      expect(params[1]).toBe(0); // section_completeness
      expect(params[5]).toBe(0); // metrics_count
    });
  });

  describe('getUserResumes()', () => {
    it('returns user resume history', async () => {
      const rows = [
        { id: 1, original_score: 78, created_at: '2026-06-26', export_count: '2' },
      ];
      mockQuery.mockResolvedValueOnce({ rows });

      const result = await ResumeDatabase.getUserResumes(42, 5);

      expect(result).toEqual(rows);
      expect(mockQuery.mock.calls[0][1]).toEqual([42, 5]);
    });

    it('defaults limit to 10', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await ResumeDatabase.getUserResumes(1);

      expect(mockQuery.mock.calls[0][1][1]).toBe(10);
    });
  });

  describe('getResume()', () => {
    it('returns resume by id and userId', async () => {
      const resume = { id: 1, original_resume: 'text' };
      mockQuery.mockResolvedValueOnce({ rows: [resume] });

      const result = await ResumeDatabase.getResume(1, 42);

      expect(result).toEqual(resume);
      expect(mockQuery.mock.calls[0][1]).toEqual([1, 42]);
    });

    it('returns undefined when not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await ResumeDatabase.getResume(999, 42);

      expect(result).toBeUndefined();
    });
  });

  describe('saveExport()', () => {
    it('inserts export record', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 1 }] });

      const result = await ResumeDatabase.saveExport(1, 'pdf', '/path/to/file.pdf');

      expect(result.id).toBe(1);
      expect(mockQuery.mock.calls[0][1]).toEqual([1, 'pdf', '/path/to/file.pdf']);
    });
  });

  describe('deleteResume()', () => {
    it('deletes resume by id and userId', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 1 }] });

      const result = await ResumeDatabase.deleteResume(1, 42);

      expect(result.id).toBe(1);
      expect(mockQuery.mock.calls[0][0]).toContain('DELETE FROM resumes');
    });

    it('returns undefined when resume not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await ResumeDatabase.deleteResume(999, 42);

      expect(result).toBeUndefined();
    });
  });
});
