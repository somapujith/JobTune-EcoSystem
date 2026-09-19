'use strict';

/**
 * Route mounts owned by the "large2" porting slice (ADR-001 Phase 3).
 * Export mount(app): call mountRoutes(app, '/api/x', router) in the SAME relative order as backend/src/app.js
 * (profiles is mount #8, ai-coach is mount #34). Neither prefix is shared with another router.
 * Only the "large2" agent edits this file. Aggregated by routes/mounts/index.js.
 */
const { mountRoutes } = require('../../lib/routes');
const profilesRoutes = require('../profiles');
const aiCoachRoutes = require('../aiCoach');

function mount(app) {
  mountRoutes(app, '/api/profiles', profilesRoutes);
  mountRoutes(app, '/api/ai-coach', aiCoachRoutes);
}

module.exports = { mount };
