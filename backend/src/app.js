const express = require('express');
const cors = require('cors');
const authRoutes = require('./routes/auth');
const skillsRoutes = require('./routes/skills');
const resumeRoutes = require('./routes/resume');
const dashboardRoutes = require('./routes/dashboard');
const projectsRoutes = require('./routes/projects');
const profilesRoutes = require('./routes/profiles');
const learningRoutes = require('./routes/learning');
const { errorHandler } = require('./middleware/errorHandler');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/skills', skillsRoutes);
app.use('/api/resume', resumeRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/projects', projectsRoutes);
app.use('/api/profiles', profilesRoutes);
app.use('/api/learning', learningRoutes);

// Status route
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// Global error handler
app.use(errorHandler);

module.exports = app;
