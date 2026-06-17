const { Pool } = require('pg');
require('dotenv').config();

// Parse Supabase connection string if provided, otherwise fall back to individual env vars
let connectionConfig;

if (process.env.DATABASE_URL) {
  // Direct connection string (preferred for Supabase)
  connectionConfig = {
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false } // Required for Supabase
  };
  console.log('Database config: Using DATABASE_URL');
} else {
  // Individual environment variables
  const requiredEnvVars = ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME', 'DB_PORT'];
  const missingEnvVars = requiredEnvVars.filter(v => !process.env[v]);
  if (missingEnvVars.length > 0) {
    throw new Error(`Missing required environment variables: ${missingEnvVars.join(', ')}`);
  }

  connectionConfig = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: parseInt(process.env.DB_PORT),
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
  };

  console.log('Database config:', {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD ? '***' : 'NOT SET',
    database: process.env.DB_NAME,
    port: process.env.DB_PORT
  });
}

const pool = new Pool({
  ...connectionConfig,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
});

module.exports = { pool };
