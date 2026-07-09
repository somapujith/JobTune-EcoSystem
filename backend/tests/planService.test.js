const mockQuery = jest.fn();
jest.mock('../src/config/database', () => ({
  pool: { query: mockQuery },
}));

const planService = require('../src/services/planService');

describe('PlanService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Both caches are process-lifetime by design — reset between tests
    planService.clearOnboardingCompletedCache();
    planService.clearUserPlanCache();
  });

  describe('getAllPlans()', () => {
    it('returns all plans ordered by tier_level', async () => {
      const plans = [
        { id: 1, name: 'Learn & Build', tier_level: 1 },
        { id: 2, name: 'Tune & Polish', tier_level: 2 },
      ];
      mockQuery.mockResolvedValueOnce({ rows: plans });

      const result = await planService.getAllPlans();

      expect(result).toEqual(plans);
      expect(mockQuery.mock.calls[0][0]).toContain('ORDER BY tier_level');
    });
  });

  describe('getPlanById()', () => {
    it('returns plan by id', async () => {
      const plan = { id: 1, name: 'Learn & Build' };
      mockQuery.mockResolvedValueOnce({ rows: [plan] });

      const result = await planService.getPlanById(1);

      expect(result).toEqual(plan);
      expect(mockQuery.mock.calls[0][1]).toEqual([1]);
    });

    it('returns null when plan not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await planService.getPlanById(999);

      expect(result).toBeNull();
    });
  });

  describe('getPlanByName()', () => {
    it('returns plan by name', async () => {
      const plan = { id: 2, name: 'Tune & Polish' };
      mockQuery.mockResolvedValueOnce({ rows: [plan] });

      const result = await planService.getPlanByName('Tune & Polish');

      expect(result).toEqual(plan);
    });

    it('returns null when plan not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await planService.getPlanByName('Nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('getUserPlan()', () => {
    it('returns user plan via JOIN', async () => {
      const plan = { id: 2, name: 'Tune & Polish', tier_level: 2 };
      mockQuery.mockResolvedValueOnce({ rows: [plan] });

      const result = await planService.getUserPlan(42);

      expect(result).toEqual(plan);
      expect(mockQuery.mock.calls[0][0]).toContain('JOIN user_subscriptions');
    });

    it('returns null when user has no plan', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await planService.getUserPlan(42);

      expect(result).toBeNull();
    });
  });

  describe('assignPlan()', () => {
    it('upserts user subscription', async () => {
      const sub = { user_id: 1, plan_id: 2 };
      mockQuery.mockResolvedValueOnce({ rows: [sub] });

      const result = await planService.assignPlan(1, 2);

      expect(result).toEqual(sub);
      expect(mockQuery.mock.calls[0][0]).toContain('ON CONFLICT');
    });
  });

  describe('saveOnboardingResponse()', () => {
    it('upserts onboarding response', async () => {
      const response = { user_id: 1, career_goal: 'faang', experience_level: 'intermediate' };
      mockQuery.mockResolvedValueOnce({ rows: [response] });

      const result = await planService.saveOnboardingResponse(1, {
        career_goal: 'faang',
        experience_level: 'intermediate',
        pain_points: ['interviews'],
        recommended_plan_id: 3,
      });

      expect(result).toEqual(response);
      expect(mockQuery.mock.calls[0][0]).toContain('ON CONFLICT');
    });
  });

  describe('getUserOnboardingResponse()', () => {
    it('returns onboarding response', async () => {
      const response = { career_goal: 'faang' };
      mockQuery.mockResolvedValueOnce({ rows: [response] });

      const result = await planService.getUserOnboardingResponse(1);

      expect(result).toEqual(response);
    });

    it('returns null when no response', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await planService.getUserOnboardingResponse(1);

      expect(result).toBeNull();
    });
  });

  describe('setOnboardingCompleted()', () => {
    it('sets onboarding_completed to true for the user', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await planService.setOnboardingCompleted(42);

      expect(mockQuery.mock.calls[0][0]).toContain('SET onboarding_completed = true');
      expect(mockQuery.mock.calls[0][1]).toEqual([42]);
    });
  });

  describe('getOnboardingCompleted()', () => {
    it('returns true when flag is set', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ onboarding_completed: true }] });

      const result = await planService.getOnboardingCompleted(42);

      expect(result).toBe(true);
      expect(mockQuery.mock.calls[0][1]).toEqual([42]);
    });

    it('returns false when flag is unset', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ onboarding_completed: false }] });

      const result = await planService.getOnboardingCompleted(42);

      expect(result).toBe(false);
    });

    it('returns false when user not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await planService.getOnboardingCompleted(999);

      expect(result).toBe(false);
    });
  });
});
