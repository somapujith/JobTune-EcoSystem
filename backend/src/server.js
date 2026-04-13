require('dotenv').config();
const app = require('./app');
const { pool } = require('./config/database');

const PORT = process.env.PORT || 5000;

// Test DB Connection
pool.connect(async (err, client, release) => {
  if (err) {
    return console.error('Error acquiring client', err.stack);
  }
  console.log('Successfully connected to database');
  release();
  
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
});
