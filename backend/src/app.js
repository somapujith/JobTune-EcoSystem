const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
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
const aiTutorRoutes = require('./routes/aiTutor');
const projectBuilderRoutes = require('./routes/projectBuilder');
const studyToolsRoutes = require('./routes/studyTools');
const coursesRoutes = require('./routes/courses');
const aiCoachRoutes = require('./routes/aiCoach');
const communityRoutes = require('./routes/community');
const practiceRoutes = require('./routes/practice');
const adminPanelsRoutes = require('./routes/adminPanels');
const activityRoutes = require('./routes/activity');
const studyHistoryRoutes = require('./routes/studyHistory');
const learningModulesRoutes = require('./routes/learningModules');
const learningPathRoutes = require('./routes/learningPath');
const { errorHandler } = require('./middleware/errorHandler');
const { auditLogger } = require('./middleware/auditLogger');
const path = require('path');

const app = express();

// Security headers
app.use(helmet());
app.disable('x-powered-by');

// Rate limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'development' ? 500 : 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts, please try again later.' },
});

// CORS
const serverPort = process.env.PORT || 5000;
let frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');
if (frontendUrl && !/^https?:\/\//.test(frontendUrl)) {
  frontendUrl = `https://${frontendUrl}`;
}

const allowedOrigins = [
  frontendUrl,
  ...(process.env.NODE_ENV === 'development' ? [
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:5175',
    'http://127.0.0.1:5173',
    'http://localhost:3000',
    `http://localhost:${serverPort}`,
  ] : []),
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));

// Global Audit Logger for API
app.use('/api', auditLogger('API_REQUEST', 'system'));

// Routes
app.use('/api', apiLimiter);
app.use('/api/auth', authLimiter, authRoutes);
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
app.use('/api/ai-tutor', aiTutorRoutes);
app.use('/api/project-builder', projectBuilderRoutes);
app.use('/api/study-tools', studyToolsRoutes);
app.use('/api/courses', coursesRoutes);
app.use('/api/ai-coach', aiCoachRoutes);
app.use('/api/community', communityRoutes);
app.use('/api/practice', practiceRoutes);
app.use('/api/admin-panels', adminPanelsRoutes);
app.use('/api/activity', activityRoutes);
app.use('/api/study-history', studyHistoryRoutes);
app.use('/api/learning-modules', learningModulesRoutes);
app.use('/api/learning-path', learningPathRoutes);

// Admin UI Route
app.use('/admin', express.static(path.join(__dirname, 'public/admin')));

// Status route
app.get('/api/health', async (req, res) => {
  const { getAICacheStats } = require('./utils/aiClient');
  const { pool } = require('./config/database');
  let db = 'connected';
  // Bounded probe: a slow or unreachable Neon must not hold this endpoint for the pool's connection timeout (10s),
  // because platform health checks may hit it. A timeout reports "unreachable" like any other probe failure.
  let timer;
  try {
    await Promise.race([
      pool.query('SELECT 1'),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('health db probe timeout')), 2000);
      }),
    ]);
  } catch {
    db = 'unreachable';
  } finally {
    clearTimeout(timer);
  }
  res.json({ status: db === 'connected' ? 'ok' : 'degraded', db, aiCache: getAICacheStats() });
});

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
