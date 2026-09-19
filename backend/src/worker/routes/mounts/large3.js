'use strict';

/**
 * Route mounts owned by the "large3" porting slice (ADR-001 Phase 3).
 * Export mount(app): call mountRoutes(app, '/api/x', router) in the SAME relative order as backend/src/app.js.
 * Only the "large3" agent edits this file. Aggregated by routes/mounts/index.js.
 *
 * Express (backend/src/app.js line 148):  app.use('/api/practice', practiceRoutes);
 */
const { mountRoutes } = require('../../lib/routes');
const practiceRoutes = require('../practice');

function mount(app) {
  mountRoutes(app, '/api/practice', practiceRoutes); // 10 endpoints, all authenticateToken -> requirePlan(1)
}

module.exports = { mount };
