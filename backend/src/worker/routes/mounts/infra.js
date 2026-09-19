'use strict';

/**
 * Route mounts owned by the "infra" porting slice (ADR-001 Phase 3).
 * Export mount(app): call mountRoutes(app, '/api/x', router) in the SAME relative order as backend/src/app.js.
 * Only the "infra" agent edits this file. Aggregated by routes/mounts/index.js.
 */
// eslint-disable-next-line no-unused-vars
function mount(app) {}

module.exports = { mount };
