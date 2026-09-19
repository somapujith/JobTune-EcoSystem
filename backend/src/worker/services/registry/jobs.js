'use strict';

/**
 * Service registry entries owned by the "jobs" porting slice (ADR-001 Phase 2/3).
 * Add one line per service: { name: ({ db, config, services }) => createXxx({ db, config }) }.
 * Only the "jobs" agent edits this file. Aggregated by services/index.js.
 *
 * Keys are the camelCase base name of the Express module (`discovery` for services/discovery/index.js).
 *
 * Contract dependencies on other slices (looked up lazily through `services`, never imported):
 *   - infra: `aiClient` (callAI, extractJSON), `onetLoader` (findOccupation, getDomain),
 *            `actionVerbAnalyzer` (analyze, STRONG_VERBS), `metricsAnalyzer` (analyze)
 *   - foundation: `planService` (through the requirePlan middleware)
 */
const { createAchievementEnhancerService } = require('../achievementEnhancerService');
const { createDiscovery } = require('../discovery');
const { createJobFitScorer } = require('../scoring/strategies/jobFit');

module.exports = {
  achievementEnhancerService: ({ services }) => createAchievementEnhancerService({ services }),
  discovery: ({ config }) => createDiscovery({ config }),
  jobFit: ({ config, services }) => createJobFitScorer({ config, services }),
};
