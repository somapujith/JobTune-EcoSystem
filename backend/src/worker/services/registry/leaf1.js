'use strict';

/**
 * Service registry entries owned by the "leaf1" porting slice (ADR-001 Phase 2/3).
 * Add one line per service: { name: ({ db, config, services }) => createXxx({ db, config }) }.
 * Only the "leaf1" agent edits this file. Aggregated by services/index.js.
 *
 * jobGuideGenerator reaches the LLM through `services.aiClient` (infra slice), read lazily at call
 * time, so this file has no load-time dependency on it.
 */
const { createScorerBenchmark } = require('../benchmarks/scorerBenchmark');
const { createResumeConsistencyService } = require('../resumeConsistencyService');
const { createRecruiterVisibilityService } = require('../recruiterVisibilityService');
const { createJobGuideGenerator } = require('../guides/jobGuideGenerator');
const { createProgressService } = require('../progressService');

module.exports = {
  scorerBenchmark: ({ db }) => createScorerBenchmark({ db }),
  resumeConsistencyService: () => createResumeConsistencyService(),
  recruiterVisibilityService: () => createRecruiterVisibilityService(),
  jobGuideGenerator: ({ db, services }) => createJobGuideGenerator({ db, services }),
  progressService: ({ db }) => createProgressService({ db }),
};
