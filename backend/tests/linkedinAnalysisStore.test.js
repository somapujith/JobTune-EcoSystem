const mockQuery = jest.fn();

jest.mock('../src/config/database', () => ({
  pool: { query: mockQuery },
}));

const {
  saveLinkedInAnalysis,
  getLinkedInAnalysisHistory,
  getLinkedInAnalysisById,
} = require('../src/services/linkedinAnalysisStore');

describe('linkedinAnalysisStore', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('saves a LinkedIn analysis with summary fields and full report JSON', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 101, created_at: '2026-06-18T00:00:00.000Z' }],
    });

    const report = {
      score: 74,
      scoreLabel: 'Strong',
      aiPowered: true,
      profile: {
        profileUrl: 'https://www.linkedin.com/in/janedoe',
        targetRoles: ['Frontend Engineer'],
      },
    };

    const saved = await saveLinkedInAnalysis(42, report);

    expect(saved.id).toBe(101);
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO linkedin_analyses'),
      [
        42,
        'https://www.linkedin.com/in/janedoe',
        ['Frontend Engineer'],
        74,
        'Strong',
        true,
        JSON.stringify(report),
      ]
    );
  });

  it('returns capped history summaries ordered by newest first', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        id: 101,
        profile_url: 'https://www.linkedin.com/in/janedoe',
        target_roles: ['Frontend Engineer'],
        overall_score: 74,
        grade: 'Strong',
        ai_powered: true,
        created_at: '2026-06-18T00:00:00.000Z',
      }],
    });

    const history = await getLinkedInAnalysisHistory(42, 100);

    expect(history).toHaveLength(1);
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('ORDER BY created_at DESC'),
      [42, 25]
    );
  });

  it('returns a saved report by id for the owning user', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 101, report: { score: 74 }, created_at: '2026-06-18T00:00:00.000Z' }],
    });

    const analysis = await getLinkedInAnalysisById(42, 101);

    expect(analysis.report.score).toBe(74);
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('WHERE id = $1 AND user_id = $2'),
      [101, 42]
    );
  });
});
