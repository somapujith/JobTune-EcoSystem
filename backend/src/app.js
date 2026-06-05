const express = require('express');
const cors = require('cors');
const authRoutes = require('./routes/auth');
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
const atsCheckerRoutes = require('./routes/atsChecker');
const jobAnalyzerRoutes = require('./routes/jobAnalyzer');
const coverLetterRoutes = require('./routes/coverLetter');
const { errorHandler } = require('./middleware/errorHandler');
const { auditLogger } = require('./middleware/auditLogger');
const path = require('path');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Global Audit Logger for API
app.use('/api', auditLogger('API_REQUEST', 'system'));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/skills', skillsRoutes);
app.use('/api/resume', resumeRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/projects', projectsRoutes);
app.use('/api/profiles', profilesRoutes);
app.use('/api/learning', learningRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/interview', interviewRoutes);
app.use('/api/resume-chat', resumeChatRoutes);
app.use('/api/career', careerRoadmapRoutes);
app.use('/api/jobs', atsCheckerRoutes);
app.use('/api/jobs', jobAnalyzerRoutes);
app.use('/api/jobs', coverLetterRoutes);

// Admin UI Route
app.use('/admin', express.static(path.join(__dirname, 'public/admin')));

// Status route
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// Global error handler
app.use(errorHandler);

module.exports = app;
