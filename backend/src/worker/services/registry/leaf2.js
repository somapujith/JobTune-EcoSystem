'use strict';

/**
 * Service registry entries owned by the "leaf2" porting slice (ADR-001 Phase 2/3).
 * Add one line per service: { name: ({ db, config, services }) => createXxx({ db, config }) }.
 * Only the "leaf2" agent edits this file. Aggregated by services/index.js.
 *
 * evidenceTracker reaches embeddings through `services.embeddings` (infra slice), read lazily at
 * call time (saveBullet), so this file has no load-time dependency on it.
 * studyHistoryService is ALSO consumed by the mid2 slice (routes/studyTools) as
 * getServices(c).studyHistoryService; its API is identical to the Express singleton's.
 */
const { createEvidenceTracker } = require('../evidence/evidenceTracker');
const { createPiiRedactor } = require('../pii/piiRedactor');
const { createActivityService } = require('../activityService');
const { createLearningPathService } = require('../learningPathService');
const { createSrsService } = require('../srsService');
const { createStudyHistoryService } = require('../studyHistoryService');

module.exports = {
  evidenceTracker: ({ db, services }) => createEvidenceTracker({ db, services }),
  piiRedactor: () => createPiiRedactor(),
  activityService: ({ db }) => createActivityService({ db }),
  learningPathService: ({ db }) => createLearningPathService({ db }),
  srsService: ({ db }) => createSrsService({ db }),
  studyHistoryService: ({ db }) => createStudyHistoryService({ db }),
};
