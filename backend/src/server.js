require('dotenv').config();
const app = require('./app');
const { pool } = require('./config/database');

const PORT = process.env.PORT || 5000;

// Test DB Connection
const startServer = async () => {
  try {
    const connection = await pool.getConnection();
    console.log('✅ Successfully connected to MySQL database');
    connection.release();
  } catch (err) {
    console.warn('⚠️ WARNING: Could not connect to the database. The server will start, but API endpoints relying on DB will fail.');
    console.warn('Please ensure MySQL is running, user/pass is correct, and the database "fresher_ecosystem" exists.');
    console.warn('Error details:', err.message);
  }
  
  app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
  });
};

startServer();
