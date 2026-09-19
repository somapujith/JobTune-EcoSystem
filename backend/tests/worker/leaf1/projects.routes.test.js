'use strict';

/** GET /api/projects/ideas: authenticateToken -> requirePlan(1). */
const { build } = require('./helpers');
const { signToken } = require('../helpers/harness');

const EXPECTED = [
  { id: 1, title: 'E-Commerce Dashboard', diff: 'Intermediate', time: '10 hrs', tech: ['React', 'Chart.js', 'Tailwind'], category: 'Frontend' },
  { id: 2, title: 'Real-time Chat App', diff: 'Advanced', time: '15 hrs', tech: ['Node.js', 'Socket.io', 'Express'], category: 'Full Stack' },
];

describe('GET /api/projects/ideas', () => {
  beforeEach(() => jest.spyOn(console, 'error').mockImplementation(() => {}));
  afterEach(() => jest.restoreAllMocks());

  it('401 without a token, and the handler never runs', async () => {
    const H = build({ plan: 3 });
    const res = await H.request('/api/projects/ideas');
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
  });

  it('401 with a token signed by the wrong secret', async () => {
    const H = build({ plan: 3 });
    const bad = signToken({ id: 1 }, { secret: 'x'.repeat(40) });
    const res = await H.request('/api/projects/ideas', { headers: { Authorization: `Bearer ${bad}` } });
    expect(res.status).toBe(401);
  });

  it('403 PLAN_UPGRADE_REQUIRED (requiredPlan "Learn & Build") for a user with no subscription', async () => {
    const H = build();
    const res = await H.authed('/api/projects/ideas');
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({
      error: 'This feature requires a higher subscription plan.',
      code: 'PLAN_UPGRADE_REQUIRED',
      requiredPlan: 'Learn & Build',
      currentPlan: null,
    });
  });

  it.each([1, 2, 3])('200 with the two literal ideas at tier %i (threshold is tier 1)', async (plan) => {
    const H = build({ plan });
    const res = await H.authed('/api/projects/ideas');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(EXPECTED);
  });

  it('500 (fail closed, handler not reached) when the plan lookup fails', async () => {
    const H = build({ plan: 3 });
    H.db.failWhen((sql) => /FROM subscription_plans sp JOIN user_subscriptions/.test(sql), new Error('db down'));
    const res = await H.authed('/api/projects/ideas');
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Failed to verify subscription plan' });
  });

  it('is GET-only: POST falls through to the 404 default', async () => {
    const H = build({ plan: 3 });
    const res = await H.authed('/api/projects/ideas', { method: 'POST' });
    expect(res.status).toBe(404);
  });
});
