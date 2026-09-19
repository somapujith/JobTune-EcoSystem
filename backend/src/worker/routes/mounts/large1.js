'use strict';

/**
 * Route mounts owned by the "large1" porting slice (ADR-001 Phase 3, wave 3F).
 * Export mount(app): call mountRoutes(app, '/api/x', router) in the SAME relative order as backend/src/app.js.
 * Only the "large1" agent edits this file. Aggregated by routes/mounts/index.js.
 *
 * Express order (backend/src/app.js mount #): project-builder 31, courses 33, community 35.
 * The prefixes are disjoint from every other slice's, so only the relative order among these three matters
 * (and it is not observable between them, but is kept anyway).
 */
const { mountRoutes } = require('../../lib/routes');
const projectBuilderRoutes = require('../projectBuilder');
const coursesRoutes = require('../courses');
const communityRoutes = require('../community');

function mount(app) {
  mountRoutes(app, '/api/project-builder', projectBuilderRoutes);
  mountRoutes(app, '/api/courses', coursesRoutes);
  mountRoutes(app, '/api/community', communityRoutes);
}

module.exports = { mount };
