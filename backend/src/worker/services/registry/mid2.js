'use strict';

/**
 * Service registry entries owned by the "mid2" porting slice (ADR-001 Phase 2/3).
 * Add one line per service: { name: ({ db, config, services }) => createXxx({ db, config }) }.
 * Only the "mid2" agent edits this file. Aggregated by services/index.js.
 *
 * (studyHistoryService, used by routes/studyTools.js, and aiClient, used by four of the five routers, are
 * owned by the leaf2 and infra slices and are consumed through getServices(c), not registered here.)
 */
const { createTutorHistoryService } = require('../tutorHistoryService');

module.exports = {
  tutorHistoryService: ({ db }) => createTutorHistoryService({ db }),
};
