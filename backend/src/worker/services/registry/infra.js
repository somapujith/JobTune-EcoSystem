'use strict';

/**
 * Service registry entries owned by the "infra" porting slice (ADR-001 Phase 2/3).
 * Add one line per service: { name: ({ db, config, services }) => createXxx({ db, config }) }.
 * Only the "infra" agent edits this file. Aggregated by services/index.js.
 *
 * Contract for other slices: `getServices(c).<name>` exposes the same public functions as the Express module's
 * exports (utils/aiClient.js, utils/embeddings.js, utils/apiResponse.js, services/taxonomy/onetLoader.js,
 * utils/aiCache.js), and the same static API as each services/v2 class. Differences: apiResponse helpers take the
 * Hono context `c` instead of `res` (see services/apiResponse.js).
 */
const { createAiCache } = require('../aiCache');
const { createAiClient } = require('../aiClient');
const { createEmbeddings } = require('../embeddings');
const apiResponse = require('../apiResponse');
const { createOnetLoader } = require('../taxonomy/onetLoader');

// Pure analyzers: stateless classes with static methods, exposed as the class itself (no db, no config).
const ActionVerbAnalyzer = require('../v2/actionVerbAnalyzer');
const CertificationAnalyzer = require('../v2/certificationAnalyzer');
const ContactValidator = require('../v2/contactValidator');
const EducationAnalyzer = require('../v2/educationAnalyzer');
const ExperienceAnalyzer = require('../v2/experienceAnalyzer');
const FormattingAnalyzer = require('../v2/formattingAnalyzer');
const MetricsAnalyzer = require('../v2/metricsAnalyzer');
const MissingInfoEngine = require('../v2/missingInfoEngine');
const ProjectAnalyzer = require('../v2/projectAnalyzer');
const ReadabilityAnalyzer = require('../v2/readabilityAnalyzer');
const ResumeAnalysisEngine = require('../v2/resumeAnalysisEngine');
const ResumeCriticEngine = require('../v2/resumeCriticEngine');
const RoleDetectionEngine = require('../v2/roleDetectionEngine');
const SectionAnalyzer = require('../v2/sectionAnalyzer');
const SkillsAnalyzer = require('../v2/skillsAnalyzer');

module.exports = {
  // per-isolate cache shared by every request on the isolate (ADR 4.5: lower hit rate than Render, by design)
  aiCache: () => createAiCache(),
  aiClient: ({ config, services }) => createAiClient({ config, aiCache: services.aiCache }),
  embeddings: ({ config }) => createEmbeddings({ config }),
  apiResponse: () => apiResponse,
  onetLoader: ({ db }) => createOnetLoader({ db }),

  actionVerbAnalyzer: () => ActionVerbAnalyzer,
  certificationAnalyzer: () => CertificationAnalyzer,
  contactValidator: () => ContactValidator,
  educationAnalyzer: () => EducationAnalyzer,
  experienceAnalyzer: () => ExperienceAnalyzer,
  formattingAnalyzer: () => FormattingAnalyzer,
  metricsAnalyzer: () => MetricsAnalyzer,
  missingInfoEngine: () => MissingInfoEngine,
  projectAnalyzer: () => ProjectAnalyzer,
  readabilityAnalyzer: () => ReadabilityAnalyzer,
  resumeAnalysisEngine: () => ResumeAnalysisEngine,
  resumeCriticEngine: () => ResumeCriticEngine,
  roleDetectionEngine: () => RoleDetectionEngine,
  sectionAnalyzer: () => SectionAnalyzer,
  skillsAnalyzer: () => SkillsAnalyzer,
};
