'use strict';

/**
 * Route mounts owned by the "jobs" porting slice (ADR-001 Phase 3, wave 3E).
 * Export mount(app): call mountRoutes(app, '/api/x', router) in the SAME relative order as backend/src/app.js.
 * Only the "jobs" agent edits this file. Aggregated by routes/mounts/index.js.
 *
 * ORDER IS BEHAVIOUR. Six Express routers share the /api/jobs namespace and are registered in this order
 * (backend/src/app.js lines 126, 129, 130, 135, 136 and 141; the mounts between them belong to other slices
 * and share no path with these):
 *
 *   14  /api/jobs                      jobTracker     GET /, POST /, PATCH /:id, DELETE /:id
 *   17  /api/jobs                      jobAnalyzer    POST /analyze-description
 *   18  /api/jobs                      coverLetter    POST /generate-cover-letter
 *   23  /api/jobs                      jobDiscovery   GET /discover
 *   24  /api/jobs                      jobFit         POST /fit
 *   29  /api/jobs/achievement-enhancer achievementEnhancer  POST /enhance
 *
 * jobTracker registers the only parameterised routes (PATCH|DELETE /:id) FIRST, so those two methods capture any
 * single-segment path (including /discover, /fit, /achievement-enhancer) exactly as on Express. No parameterised
 * route exists for GET or POST, and :id never matches two segments, so /api/jobs/achievement-enhancer/enhance is
 * not shadowed. tests/worker/jobs/jobs.routing.test.js proves this against the real Express routers, and
 * jobs.manifest.test.js proves every endpoint's auth/minTier against docs/migration/manifest.render.json.
 * Do NOT reorder these lines, and do not split the group across mount files.
 */
const { mountRoutes } = require('../../lib/routes');
const jobTracker = require('../jobTracker');
const jobAnalyzer = require('../jobAnalyzer');
const coverLetter = require('../coverLetter');
const jobDiscovery = require('../jobDiscovery');
const jobFit = require('../jobFit');
const achievementEnhancer = require('../achievementEnhancer');

function mount(app) {
  mountRoutes(app, '/api/jobs', jobTracker);
  mountRoutes(app, '/api/jobs', jobAnalyzer);
  mountRoutes(app, '/api/jobs', coverLetter);
  mountRoutes(app, '/api/jobs', jobDiscovery);
  mountRoutes(app, '/api/jobs', jobFit);
  mountRoutes(app, '/api/jobs/achievement-enhancer', achievementEnhancer);
}

module.exports = { mount };
