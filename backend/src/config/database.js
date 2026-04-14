const mysql = require('mysql2/promise');
require('dotenv').config();

console.log('Database config:', {
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD ? '***' : 'NOT SET',
  database: process.env.DB_NAME,
  port: process.env.DB_PORT
});

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'Pujith@10',
  database: process.env.DB_NAME || 'fresher_ecosystem',
  port: process.env.DB_PORT || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

module.exports = { pool };
