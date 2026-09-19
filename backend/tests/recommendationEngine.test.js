jest.mock('../src/config/database', () => ({
  pool: { query: jest.fn() },
}));

const mockGetAllPlans = jest.fn();
jest.mock('../src/services/planService', () => ({
  getAllPlans: mockGetAllPlans,
}));

const recommendationEngine = require('../src/services/recommendationEngine');

const ALL_PLANS = [
  { id: 1, name: 'Learn & Build', tier_level: 1 },
  { id: 2, name: 'Tune & Polish', tier_level: 2 },
  { id: 3, name: 'Zero to Hero', tier_level: 3 },
];

describe('RecommendationEngine', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetAllPlans.mockResolvedValue(ALL_PLANS);
  });

  it('recommends Learn & Build for service-role + beginner', async () => {
    const result = await recommendationEngine.recommendPlan('service-role', 'beginner', []);

    expect(result.recommendedPlan.name).toBe('Learn & Build');
  });

  it('recommends Zero to Hero for faang-or-top-company + advanced', async () => {
    const result = await recommendationEngine.recommendPlan('faang-or-top-company', 'advanced', []);

    expect(result.recommendedPlan.name).toBe('Zero to Hero');
  });

  it('recommends Tune & Polish for skill-development + intermediate', async () => {
    const result = await recommendationEngine.recommendPlan('skill-development', 'intermediate', []);

    expect(result.recommendedPlan.name).toBe('Tune & Polish');
  });

  it('factors in pain points', async () => {
    const result = await recommendationEngine.recommendPlan(
      'skill-development',
      'beginner',
      ['resume-portfolio', 'networking']
    );

    expect(result.scores['Tune & Polish']).toBeGreaterThan(0);
    expect(result.allPlans).toHaveLength(3);
  });

  it('handles unknown career goal gracefully', async () => {
    const result = await recommendationEngine.recommendPlan('unknown-goal', 'beginner', []);

    expect(result.recommendedPlan).toBeDefined();
    expect(result.scores).toHaveProperty('Learn & Build');
  });

  it('handles empty pain points array', async () => {
    const result = await recommendationEngine.recommendPlan('service-role', 'beginner', []);

    expect(result.allPlans).toHaveLength(3);
  });

  it('handles null/undefined pain points', async () => {
    const result = await recommendationEngine.recommendPlan('service-role', 'beginner', null);

    expect(result.recommendedPlan).toBeDefined();
  });

  it('returns scores for all three plans', async () => {
    const result = await recommendationEngine.recommendPlan('skill-development', 'intermediate', ['interviews']);

    expect(result.scores).toHaveProperty('Learn & Build');
    expect(result.scores).toHaveProperty('Tune & Polish');
    expect(result.scores).toHaveProperty('Zero to Hero');
  });

  it('returns allPlans ranked by score descending', async () => {
    const result = await recommendationEngine.recommendPlan('faang-or-top-company', 'advanced', ['interviews']);

    expect(result.allPlans[0].name).toBe(result.recommendedPlan.name);
  });
});
