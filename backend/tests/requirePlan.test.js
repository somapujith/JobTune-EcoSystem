jest.mock('../src/services/planService', () => ({
  getUserPlan: jest.fn(),
}));

const { requirePlan, TIER_NAMES } = require('../src/middleware/requirePlan');
const planService = require('../src/services/planService');

describe('requirePlan middleware', () => {
  let req, res, next;

  beforeEach(() => {
    jest.clearAllMocks();
    req = { user: { id: 1 } };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    next = jest.fn();
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    console.error.mockRestore();
  });

  it('calls next() when user plan meets min tier', async () => {
    planService.getUserPlan.mockResolvedValueOnce({ tier_level: 2, name: 'Tune & Polish' });

    const middleware = requirePlan(2);
    await middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('attaches userPlan to req on success', async () => {
    const plan = { tier_level: 3, name: 'Zero to Hero' };
    planService.getUserPlan.mockResolvedValueOnce(plan);

    const middleware = requirePlan(1);
    await middleware(req, res, next);

    expect(req.userPlan).toEqual(plan);
  });

  it('allows when user tier exceeds min tier', async () => {
    planService.getUserPlan.mockResolvedValueOnce({ tier_level: 3, name: 'Zero to Hero' });

    const middleware = requirePlan(1);
    await middleware(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it('returns 403 when user plan is below min tier', async () => {
    planService.getUserPlan.mockResolvedValueOnce({ tier_level: 1, name: 'Learn & Build' });

    const middleware = requirePlan(2);
    await middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      error: 'This feature requires a higher subscription plan.',
      code: 'PLAN_UPGRADE_REQUIRED',
      requiredPlan: 'Tune & Polish',
      currentPlan: 'Learn & Build',
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 403 when user has no plan', async () => {
    planService.getUserPlan.mockResolvedValueOnce(null);

    const middleware = requirePlan(1);
    await middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'PLAN_UPGRADE_REQUIRED',
        currentPlan: null,
      })
    );
  });

  it('returns 500 when planService throws', async () => {
    planService.getUserPlan.mockRejectedValueOnce(new Error('DB error'));

    const middleware = requirePlan(1);
    await middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Failed to verify subscription plan' });
  });

  it('exports TIER_NAMES correctly', () => {
    expect(TIER_NAMES).toEqual({
      1: 'Learn & Build',
      2: 'Tune & Polish',
      3: 'Zero to Hero',
    });
  });
});
