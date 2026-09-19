jest.mock('../src/middleware/auth', () => ({
  authenticateToken: (req, _res, next) => {
    req.user = { id: 1, email: 'test@example.com' };
    next();
  },
}));

jest.mock('../src/services/planService', () => ({
  getPlanById: jest.fn(),
  assignPlan: jest.fn(),
  setOnboardingCompleted: jest.fn(),
  getOnboardingCompleted: jest.fn(),
}));

const request = require('supertest');
const app = require('../src/app');
const planService = require('../src/services/planService');

describe('POST /api/subscriptions/select-plan', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('sets onboarding_completed after assigning the plan', async () => {
    planService.getPlanById.mockResolvedValueOnce({ id: 2, name: 'Tune & Polish', tier_level: 2 });
    planService.assignPlan.mockResolvedValueOnce();
    planService.setOnboardingCompleted.mockResolvedValueOnce();

    const res = await request(app)
      .post('/api/subscriptions/select-plan')
      .send({ planId: 2 });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(planService.assignPlan).toHaveBeenCalledWith(1, 2);
    expect(planService.setOnboardingCompleted).toHaveBeenCalledWith(1);
  });

  it('calls assignPlan before setOnboardingCompleted', async () => {
    const order = [];
    planService.getPlanById.mockResolvedValueOnce({ id: 2, name: 'Tune & Polish' });
    planService.assignPlan.mockImplementationOnce(async () => { order.push('assignPlan'); });
    planService.setOnboardingCompleted.mockImplementationOnce(async () => { order.push('setOnboardingCompleted'); });

    await request(app).post('/api/subscriptions/select-plan').send({ planId: 2 });

    expect(order).toEqual(['assignPlan', 'setOnboardingCompleted']);
  });

  it('does not set onboarding_completed when the plan does not exist', async () => {
    planService.getPlanById.mockResolvedValueOnce(null);

    const res = await request(app)
      .post('/api/subscriptions/select-plan')
      .send({ planId: 999 });

    expect(res.status).toBe(404);
    expect(planService.assignPlan).not.toHaveBeenCalled();
    expect(planService.setOnboardingCompleted).not.toHaveBeenCalled();
  });

  it('returns 400 when planId is missing', async () => {
    const res = await request(app).post('/api/subscriptions/select-plan').send({});

    expect(res.status).toBe(400);
    expect(planService.setOnboardingCompleted).not.toHaveBeenCalled();
  });
});

describe('GET /api/subscriptions/onboarded', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns onboarded=true when the flag is set', async () => {
    planService.getOnboardingCompleted.mockResolvedValueOnce(true);

    const res = await request(app).get('/api/subscriptions/onboarded');

    expect(res.status).toBe(200);
    expect(res.body.onboarded).toBe(true);
    expect(planService.getOnboardingCompleted).toHaveBeenCalledWith(1);
  });

  it('returns onboarded=false when the flag is not set', async () => {
    planService.getOnboardingCompleted.mockResolvedValueOnce(false);

    const res = await request(app).get('/api/subscriptions/onboarded');

    expect(res.status).toBe(200);
    expect(res.body.onboarded).toBe(false);
  });
});
