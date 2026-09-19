'use strict';

/**
 * Route mounts owned by the "leaf1" porting slice (ADR-001 Phase 3).
 * Export mount(app): call mountRoutes(app, '/api/x', router) in the SAME relative order as backend/src/app.js.
 * Only the "leaf1" agent edits this file. Aggregated by routes/mounts/index.js.
 *
 * Express order (backend/src/app.js mount #): projects 7, guides 19, benchmarks 20, progress 26,
 * recruiter-visibility 27, resume-consistency 28. The prefixes are disjoint from every other slice's.
 */
const { mountRoutes } = require('../../lib/routes');
const projectsRoutes = require('../projects');
const guidesRoutes = require('../guides');
const benchmarksRoutes = require('../benchmarks');
const progressRoutes = require('../progress');
const recruiterVisibilityRoutes = require('../recruiterVisibility');
const resumeConsistencyRoutes = require('../resumeConsistency');

function mount(app) {
  mountRoutes(app, '/api/projects', projectsRoutes);
  mountRoutes(app, '/api/guides', guidesRoutes);
  mountRoutes(app, '/api/benchmarks', benchmarksRoutes);
  mountRoutes(app, '/api/progress', progressRoutes);
  mountRoutes(app, '/api/recruiter-visibility', recruiterVisibilityRoutes);
  mountRoutes(app, '/api/resume-consistency', resumeConsistencyRoutes);
}

module.exports = { mount };
