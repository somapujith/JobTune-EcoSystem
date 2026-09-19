'use strict';

/**
 * Route mounts owned by the "auth" porting slice (ADR-001 Phase 3).
 * Export mount(app): call mountRoutes(app, '/api/x', router) in the SAME relative order as backend/src/app.js.
 * Only the "auth" agent edits this file. Aggregated by routes/mounts/index.js.
 *
 * Express (app.js) for this slice:
 *   app.use('/api/auth', authLimiter, authRoutes);      // mount #1
 *   app.use('/api/subscriptions', subscriptionsRoutes); // mount #2
 *   app.use('/api/admin', adminRoutes);                 // mount #10
 *   app.use('/api/admin-panels', adminPanelsRoutes);    // mount #37
 *   app.use('/admin', express.static('public/admin'));  // after every /api mount
 *
 * authRateLimit() is the documented INERT seam (middleware/rateLimit.js, docs/migration/rate-limiting.md):
 * it enforces only if an AUTH_LIMITER Workers Rate Limiting binding exists. It is mounted before the auth
 * router, after the global apiRateLimit, as authLimiter was after apiLimiter. The auth endpoints are
 * therefore NOT brute-force protected until the binding is provisioned and throttling is verified
 * (ADR checklist item 18).
 */
const { mountRoutes } = require('../../lib/routes');
const { authRateLimit } = require('../../middleware/rateLimit');
const authRoutes = require('../auth');
const subscriptionsRoutes = require('../subscriptions');
const adminRoutes = require('../admin');
const adminPanelsRoutes = require('../adminPanels');
const adminStaticRoutes = require('../adminStatic');

function mount(app) {
  app.use('/api/auth/*', authRateLimit());
  mountRoutes(app, '/api/auth', authRoutes);
  mountRoutes(app, '/api/subscriptions', subscriptionsRoutes);
  mountRoutes(app, '/api/admin', adminRoutes);
  mountRoutes(app, '/api/admin-panels', adminPanelsRoutes);
  mountRoutes(app, '/admin', adminStaticRoutes);
}

module.exports = { mount };
