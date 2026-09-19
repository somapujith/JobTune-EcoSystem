'use strict';

/**
 * Route mounts owned by the "leaf2" porting slice (ADR-001 Phase 3).
 * Export mount(app): call mountRoutes(app, '/api/x', router) in the SAME relative order as backend/src/app.js.
 * Only the "leaf2" agent edits this file. Aggregated by routes/mounts/index.js.
 *
 * Express order (backend/src/app.js mount #): evidence 21, pii 22, activity 38, study-history 39,
 * learning-path 41. The prefixes are disjoint from every other slice's (note /api/learning-path is a
 * different prefix from /api/learning and /api/learning-modules, which belong to other slices).
 */
const { mountRoutes } = require('../../lib/routes');
const evidenceRoutes = require('../evidence');
const piiRedactionRoutes = require('../piiRedaction');
const activityRoutes = require('../activity');
const studyHistoryRoutes = require('../studyHistory');
const learningPathRoutes = require('../learningPath');

function mount(app) {
  mountRoutes(app, '/api/evidence', evidenceRoutes);
  mountRoutes(app, '/api/pii', piiRedactionRoutes);
  mountRoutes(app, '/api/activity', activityRoutes);
  mountRoutes(app, '/api/study-history', studyHistoryRoutes);
  mountRoutes(app, '/api/learning-path', learningPathRoutes);
}

module.exports = { mount };
