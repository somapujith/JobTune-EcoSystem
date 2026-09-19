jest.mock('../src/services/planService', () => ({
  getOnboardingCompleted: jest.fn(),
}));

const { requireOnboarding } = require('../src/middleware/requireOnboarding');
const planService = require('../src/services/planService');

describe('requireOnboarding middleware', () => {
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

  it('calls next() when onboarding is completed', async () => {
    planService.getOnboardingCompleted.mockResolvedValueOnce(true);

    await requireOnboarding(req, res, next);

    expect(planService.getOnboardingCompleted).toHaveBeenCalledWith(1);
    expect(next).toHaveBeenCalled();
  });

  it('makes no res calls on success', async () => {
    planService.getOnboardingCompleted.mockResolvedValueOnce(true);

    await requireOnboarding(req, res, next);

    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });

  it('returns 403 ONBOARDING_REQUIRED when onboarding is not completed', async () => {
    planService.getOnboardingCompleted.mockResolvedValueOnce(false);

    await requireOnboarding(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Complete onboarding to access this feature.',
      code: 'ONBOARDING_REQUIRED',
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 500 when planService throws', async () => {
    planService.getOnboardingCompleted.mockRejectedValueOnce(new Error('DB error'));

    await requireOnboarding(req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Failed to verify onboarding status' });
    expect(next).not.toHaveBeenCalled();
  });
});
