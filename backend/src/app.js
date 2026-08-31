const express = require('express');
const cors = require('cors');
const authRoutes = require('./routes/auth');
const subscriptionsRoutes = require('./routes/subscriptions');
const skillsRoutes = require('./routes/skills');
const resumeRoutes = require('./routes/resume');
const dashboardRoutes = require('./routes/dashboard');
const projectsRoutes = require('./routes/projects');
const profilesRoutes = require('./routes/profiles');
const learningRoutes = require('./routes/learning');
const adminRoutes = require('./routes/admin');
const interviewRoutes = require('./routes/interview');
const resumeChatRoutes = require('./routes/resumeChat');
const careerRoadmapRoutes = require('./routes/careerRoadmap');
const jobTrackerRoutes = require('./routes/jobTracker');
const atsExportRoutes = require('./routes/atsExport');
const jobAnalyzerRoutes = require('./routes/jobAnalyzer');
const coverLetterRoutes = require('./routes/coverLetter');
const guidesRoutes = require('./routes/guides');
const benchmarksRoutes = require('./routes/benchmarks');
const evidenceRoutes = require('./routes/evidence');
const piiRedactionRoutes = require('./routes/piiRedaction');
const jobDiscoveryRoutes = require('./routes/jobDiscovery');
const jobFitRoutes = require('./routes/jobFit');
const jobPreparationRoutes = require('./routes/jobPreparation');
const progressRoutes = require('./routes/progress');
const resumeV2Routes = require('./routes/resumeV2');
const atsCheckerV2Routes = require('./routes/atsCheckerV2');
const recruiterVisibilityRoutes = require('./routes/recruiterVisibility');
const resumeConsistencyRoutes = require('./routes/resumeConsistency');
const achievementEnhancerRoutes = require('./routes/achievementEnhancer');
const learningPathRoutes = require('./routes/learningPath');
const { errorHandler } = require('./middleware/errorHandler');
const { auditLogger } = require('./middleware/auditLogger');
const path = require('path');

const app = express();

// Middleware
const serverPort = process.env.PORT || 5000;
let frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');
if (frontendUrl && !/^https?:\/\//.test(frontendUrl)) {
  frontendUrl = `https://${frontendUrl}`;
}
app.use(cors({
  origin: [
    frontendUrl,
    'http://localhost:5173',
    'http://localhost:3000',
    `http://localhost:${serverPort}`,
  ],
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));
app.use(express.json());

// Global Audit Logger for API
app.use('/api', auditLogger('API_REQUEST', 'system'));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/subscriptions', subscriptionsRoutes);
app.use('/api/skills', skillsRoutes);
app.use('/api/resume', resumeRoutes);
app.use('/api/resume', resumeV2Routes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/projects', projectsRoutes);
app.use('/api/profiles', profilesRoutes);
app.use('/api/learning', learningRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/interview', interviewRoutes);
app.use('/api/resume-chat', resumeChatRoutes);
app.use('/api/career', careerRoadmapRoutes);
app.use('/api/jobs', jobTrackerRoutes);
app.use('/api/ats', atsExportRoutes);
app.use('/api/ats', atsCheckerV2Routes);
app.use('/api/jobs', jobAnalyzerRoutes);
app.use('/api/jobs', coverLetterRoutes);
app.use('/api/guides', guidesRoutes);
app.use('/api/benchmarks', benchmarksRoutes);
app.use('/api/evidence', evidenceRoutes);
app.use('/api/pii', piiRedactionRoutes);
app.use('/api/jobs', jobDiscoveryRoutes);
app.use('/api/jobs', jobFitRoutes);
app.use('/api/job-prep', jobPreparationRoutes);
app.use('/api/progress', progressRoutes);
app.use('/api/recruiter-visibility', recruiterVisibilityRoutes);
app.use('/api/resume-consistency', resumeConsistencyRoutes);
app.use('/api/jobs/achievement-enhancer', achievementEnhancerRoutes);
app.use('/api/learning-path', learningPathRoutes);

// Admin UI Route
app.use('/admin', express.static(path.join(__dirname, 'public/admin')));

// Status route
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// Frontend: SSR for public routes, CSR shell for the authenticated app
const { setupFrontend } = require('./ssr/setupFrontend');
try {
  setupFrontend(app);
} catch (err) {
  console.error('[SSR] Failed to initialize frontend serving:', err.message);
}

// Global error handler
app.use(errorHandler);

module.exports = app;
