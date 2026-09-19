'use strict';

/**
 * Route mounts owned by the "mid2" porting slice (ADR-001 Phase 3).
 * Export mount(app): call mountRoutes(app, '/api/x', router) in the SAME relative order as backend/src/app.js
 * (skills #3, dashboard #6, ai-tutor #30, study-tools #32, learning-modules #40).
 * Only the "mid2" agent edits this file. Aggregated by routes/mounts/index.js.
 */
const { mountRoutes } = require('../../lib/routes');
const skillsRoutes = require('../skills');
const dashboardRoutes = require('../dashboard');
const aiTutorRoutes = require('../aiTutor');
const studyToolsRoutes = require('../studyTools');
const learningModulesRoutes = require('../learningModules');

function mount(app) {
  mountRoutes(app, '/api/skills', skillsRoutes);
  mountRoutes(app, '/api/dashboard', dashboardRoutes);
  mountRoutes(app, '/api/ai-tutor', aiTutorRoutes);
  mountRoutes(app, '/api/study-tools', studyToolsRoutes);
  mountRoutes(app, '/api/learning-modules', learningModulesRoutes);
}

module.exports = { mount };
