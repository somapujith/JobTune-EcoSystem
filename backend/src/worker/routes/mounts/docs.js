'use strict';

/**
 * Route mounts owned by the "docs" porting slice (ADR-001 Phase 3).
 * Export mount(app): call mountRoutes(app, '/api/x', router) in the SAME relative order as backend/src/app.js.
 * Only the "docs" agent edits this file. Aggregated by routes/mounts/index.js.
 *
 * Express order (backend/src/app.js): /api/resume <- resume.js, resumeV2.js  (mounts 4, 5)
 *                                     /api/ats    <- atsExport.js, atsCheckerV2.js  (mounts 15, 16)
 * Within a shared prefix the registration order is behaviour, so each pair is mounted in that exact order.
 */
const { mountRoutes } = require('../../lib/routes');
const resumeRoutes = require('../resume');
const resumeV2Routes = require('../resumeV2');
const atsExportRoutes = require('../atsExport');
const atsCheckerV2Routes = require('../atsCheckerV2');

function mount(app) {
  mountRoutes(app, '/api/resume', resumeRoutes);
  mountRoutes(app, '/api/resume', resumeV2Routes);
  mountRoutes(app, '/api/ats', atsExportRoutes);
  mountRoutes(app, '/api/ats', atsCheckerV2Routes);
}

module.exports = { mount };
