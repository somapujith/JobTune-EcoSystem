'use strict';

/**
 * /api/projects: Worker port (leaf1 slice) of backend/src/routes/projects.js.
 * One static, plan-gated endpoint; the payload is a literal and is copied verbatim.
 *
 *   GET /ideas   authenticateToken -> requirePlan(1)
 */
const { createRouter } = require('../lib/routes');
const { authenticateToken } = require('../middleware/auth');
const { requirePlan } = require('../middleware/requirePlan');

const router = createRouter();

router.get('/ideas', authenticateToken, requirePlan(1), (c) => {
  return c.json([
    { id: 1, title: 'E-Commerce Dashboard', diff: 'Intermediate', time: '10 hrs', tech: ['React', 'Chart.js', 'Tailwind'], category: 'Frontend' },
    { id: 2, title: 'Real-time Chat App', diff: 'Advanced', time: '15 hrs', tech: ['Node.js', 'Socket.io', 'Express'], category: 'Full Stack' },
  ]);
});

module.exports = router;
