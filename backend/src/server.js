require('dotenv').config();
const app = require('./app');
const { pool } = require('./config/database');
const { initializeTables } = require('./utils/initializeTables');
const { runMigrations } = require('./utils/runMigrations');
const sessionService = require('./services/sessionService');

const PORT = process.env.PORT || 5000;

// Test DB Connection & Initialize Tables
const startServer = async () => {
  try {
    await pool.query('SELECT 1');
    console.log('✅ Successfully connected to PostgreSQL database');

    // Initialize all tables
    await initializeTables();

    // Run subscription migrations
    await runMigrations();

    // User sessions + cross-device progress tables
    await sessionService.ensureTables();
  } catch (err) {
    console.warn('⚠️ WARNING: Could not connect to the database. The server will start, but API endpoints relying on DB will fail.');
    console.warn('Check DATABASE_URL in backend/.env. For the local dev DB run `npm run db:up` from the repo root.');
    console.warn('Error details:', err.message || err.code || err);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on port ${PORT} (0.0.0.0)`);
  });
};

startServer();
