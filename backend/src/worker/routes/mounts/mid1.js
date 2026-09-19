'use strict';

/**
 * Route mounts owned by the "mid1" porting slice (ADR-001 Phase 3).
 * Export mount(app): call mountRoutes(app, '/api/x', router) in the SAME relative order as backend/src/app.js.
 * Only the "mid1" agent edits this file. Aggregated by routes/mounts/index.js.
 *
 * backend/src/app.js order (lines 121-137), restricted to this slice:
 *   /api/learning, /api/interview, /api/resume-chat, /api/career, /api/job-prep
 * These prefixes are unique to their files (no shared-prefix ordering hazard within this slice).
 */
const { mountRoutes } = require('../../lib/routes');
const learningRoutes = require('../learning');
const interviewRoutes = require('../interview');
const resumeChatRoutes = require('../resumeChat');
const careerRoadmapRoutes = require('../careerRoadmap');
const jobPreparationRoutes = require('../jobPreparation');

function mount(app) {
  mountRoutes(app, '/api/learning', learningRoutes);
  mountRoutes(app, '/api/interview', interviewRoutes);
  mountRoutes(app, '/api/resume-chat', resumeChatRoutes);
  mountRoutes(app, '/api/career', careerRoadmapRoutes);
  mountRoutes(app, '/api/job-prep', jobPreparationRoutes);
}

module.exports = { mount };
