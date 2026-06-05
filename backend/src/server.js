require('dotenv').config();
const app = require('./app');
const { pool } = require('./config/database');

const PORT = process.env.PORT || 5000;

// Test DB Connection
const startServer = async () => {
  try {
    await pool.query('SELECT 1');
    console.log('✅ Successfully connected to PostgreSQL database');
  } catch (err) {
    console.warn('⚠️ WARNING: Could not connect to the database. The server will start, but API endpoints relying on DB will fail.');
    console.warn('Please ensure PostgreSQL is running, user/pass is correct, and the database "fresher_ecosystem" exists.');
    console.warn('Error details:', err.message);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on port ${PORT} (0.0.0.0)`);
  });
};

startServer();
