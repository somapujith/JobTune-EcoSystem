'use strict';

const { createRecommendationEngine } = require('../recommendationEngine');

/**
 * Service registry entries owned by the "auth" porting slice (ADR-001 Phase 2/3).
 * Add one line per service: { name: ({ db, config, services }) => createXxx({ db, config }) }.
 * Only the "auth" agent edits this file. Aggregated by services/index.js.
 *
 * planService and sessionService are registered directly in services/index.js (foundation); the auth slice
 * only updated planService.js (onboarding methods).
 */
module.exports = {
  recommendationEngine: ({ services }) => createRecommendationEngine({ services }),
};
