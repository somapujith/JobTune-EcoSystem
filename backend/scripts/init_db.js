// Provisions the full schema on an empty database without starting the server.
// Runs exactly what src/server.js runs on boot, so seed scripts can rely on the tables existing.
//
// Usage (from backend/):  node scripts/init_db.js
require('dotenv').config();
require('./lib/assertLocalDb').assertLocalDb('init_db.js');
const { pool } = require('../src/config/database');
const { initializeTables } = require('../src/utils/initializeTables');
const { runMigrations } = require('../src/utils/runMigrations');
const sessionService = require('../src/services/sessionService');

(async () => {
  try {
    await pool.query('SELECT 1');
    await initializeTables();
    await runMigrations();
    await sessionService.ensureTables();
    console.log('✅ Schema ready');
    await pool.end();
  } catch (err) {
    console.error('❌ Schema init failed:', err.message || err.code || err);
    console.error('Is the database running? From the repo root: npm run db:up');
    process.exit(1);
  }
})();
