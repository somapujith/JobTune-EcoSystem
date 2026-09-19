'use strict';

/**
 * Service registry entries owned by the "docs" porting slice (ADR-001 Phase 2/3).
 * Add one line per service: { name: ({ db, config, services }) => createXxx({ db, config }) }.
 * Only the "docs" agent edits this file. Aggregated by services/index.js.
 *
 * Nothing heavy is loaded here: pdfkit / docx / pdf.js / mammoth are imported lazily inside the service methods
 * (services/docs/docLibs.js). `resumeAnalysisEngine` and `resumeCriticEngine`, used by routes/resumeV2.js, are owned
 * by the infra slice and are read from the container as getServices(c).resumeAnalysisEngine / .resumeCriticEngine.
 */
const { createResumeDatabase } = require('../resumeDatabase');
const { createResumeExport } = require('../resumeExport');
const { createResumeExportEngine } = require('../v2/resumeExportEngine');

module.exports = {
  resumeDatabase: ({ db }) => createResumeDatabase({ db }),
  resumeExport: () => createResumeExport(),
  resumeExportEngine: () => createResumeExportEngine(),
};
