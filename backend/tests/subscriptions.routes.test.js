jest.mock('../src/middleware/auth', () => ({
  authenticateToken: (req, _res, next) => {
    req.user = { id: 1, email: 'test@example.com' };
    next();
  },
}));

jest.mock('../src/services/planService', () => ({
  getPlanById: jest.fn(),
  createOrder: jest.fn(),
  getOrderByRef: jest.fn(),
  markOrderPaid: jest.fn(),
  assignPlan: jest.fn(),
  setOnboardingCompleted: jest.fn(),
  getOnboardingCompleted: jest.fn(),
}));

const request = require('supertest');
const app = require('../src/app');
const planService = require('../src/services/planService');

describe('POST /api/subscriptions/create-order', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates a pending order without assigning a plan or completing onboarding', async () => {
    planService.createOrder.mockResolvedValueOnce({
      order: { order_ref: 'ord_1', status: 'pending' },
      plan: { id: 2, name: 'Tune & Polish' },
    });

    const res = await request(app)
      .post('/api/subscriptions/create-order')
      .send({ planId: 2 });

    expect(res.status).toBe(200);
    expect(res.body.order.order_ref).toBe('ord_1');
    expect(planService.createOrder).toHaveBeenCalledWith(1, 2);
    expect(planService.assignPlan).not.toHaveBeenCalled();
    expect(planService.setOnboardingCompleted).not.toHaveBeenCalled();
  });

  it('returns 400 when planId is missing', async () => {
    const res = await request(app).post('/api/subscriptions/create-order').send({});

    expect(res.status).toBe(400);
    expect(planService.createOrder).not.toHaveBeenCalled();
  });

  it('returns 404 when the plan does not exist', async () => {
    planService.createOrder.mockRejectedValueOnce(new Error('Plan not found'));

    const res = await request(app)
      .post('/api/subscriptions/create-order')
      .send({ planId: 999 });

    expect(res.status).toBe(404);
    expect(planService.setOnboardingCompleted).not.toHaveBeenCalled();
  });
});

describe('POST /api/subscriptions/verify-payment', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('marks the order paid, assigns the plan, then sets onboarding_completed (in that order)', async () => {
    const order = [];
    planService.getOrderByRef.mockResolvedValueOnce({ order_ref: 'ord_1', user_id: 1, plan_id: 2, status: 'pending' });
    planService.markOrderPaid.mockImplementationOnce(async () => { order.push('markOrderPaid'); return { order_ref: 'ord_1' }; });
    planService.assignPlan.mockImplementationOnce(async () => { order.push('assignPlan'); });
    planService.setOnboardingCompleted.mockImplementationOnce(async () => { order.push('setOnboardingCompleted'); });
    planService.getPlanById.mockResolvedValueOnce({ id: 2, name: 'Tune & Polish' });

    const res = await request(app)
      .post('/api/subscriptions/verify-payment')
      .send({ orderRef: 'ord_1' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.plan.id).toBe(2);
    expect(planService.assignPlan).toHaveBeenCalledWith(1, 2);
    expect(planService.setOnboardingCompleted).toHaveBeenCalledWith(1);
    expect(order).toEqual(['markOrderPaid', 'assignPlan', 'setOnboardingCompleted']);
  });

  it('is idempotent for an already-paid order: re-asserts onboarding, does not re-assign', async () => {
    planService.getOrderByRef.mockResolvedValueOnce({ order_ref: 'ord_1', user_id: 1, plan_id: 2, status: 'paid' });
    planService.getPlanById.mockResolvedValueOnce({ id: 2, name: 'Tune & Polish' });

    const res = await request(app)
      .post('/api/subscriptions/verify-payment')
      .send({ orderRef: 'ord_1' });

    expect(res.status).toBe(200);
    expect(res.body.alreadyPaid).toBe(true);
    expect(planService.setOnboardingCompleted).toHaveBeenCalledWith(1);
    expect(planService.markOrderPaid).not.toHaveBeenCalled();
    expect(planService.assignPlan).not.toHaveBeenCalled();
  });

  it('returns 400 when orderRef is missing', async () => {
    const res = await request(app).post('/api/subscriptions/verify-payment').send({});

    expect(res.status).toBe(400);
    expect(planService.setOnboardingCompleted).not.toHaveBeenCalled();
  });

  it('returns 404 and grants nothing for an order owned by another user', async () => {
    planService.getOrderByRef.mockResolvedValueOnce({ order_ref: 'ord_9', user_id: 2, plan_id: 2, status: 'pending' });

    const res = await request(app)
      .post('/api/subscriptions/verify-payment')
      .send({ orderRef: 'ord_9' });

    expect(res.status).toBe(404);
    expect(planService.assignPlan).not.toHaveBeenCalled();
    expect(planService.setOnboardingCompleted).not.toHaveBeenCalled();
  });

  it('returns 409 and grants nothing when the order cannot be marked paid', async () => {
    planService.getOrderByRef.mockResolvedValueOnce({ order_ref: 'ord_1', user_id: 1, plan_id: 2, status: 'pending' });
    planService.markOrderPaid.mockResolvedValueOnce(null);

    const res = await request(app)
      .post('/api/subscriptions/verify-payment')
      .send({ orderRef: 'ord_1' });

    expect(res.status).toBe(409);
    expect(planService.assignPlan).not.toHaveBeenCalled();
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
