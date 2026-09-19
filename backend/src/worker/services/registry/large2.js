'use strict';

/**
 * Service registry entries owned by the "large2" porting slice (ADR-001 Phase 2/3).
 * Add one line per service: { name: ({ db, config, services }) => createXxx({ db, config }) }.
 * Only the "large2" agent edits this file. Aggregated by services/index.js.
 *
 * linkedinOptimizerService reaches the LLM through `services.aiClient` (infra slice), read lazily at call
 * time (and by routes/profiles.js and routes/aiCoach.js through getServices(c).aiClient), so this file has no
 * load-time dependency on it.
 */
const { createLinkedinAnalysisStore } = require('../linkedinAnalysisStore');
const { createLinkedinOptimizerService } = require('../linkedinOptimizerService');

module.exports = {
  linkedinAnalysisStore: ({ db }) => createLinkedinAnalysisStore({ db }),
  linkedinOptimizerService: ({ config, services }) => createLinkedinOptimizerService({ config, services }),
};
