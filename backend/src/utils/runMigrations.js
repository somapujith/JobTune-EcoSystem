const { pool } = require('../config/database');
const fs = require('fs');
const path = require('path');

async function runMigrations() {
  try {
    console.log('🔄 Running database migrations...');

    // Read migration file
    const migrationPath = path.join(__dirname, '../migrations/add-subscriptions.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf-8');

    // Split by semicolon and filter empty statements
    const statements = migrationSQL
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0);

    // Execute each statement
    for (const statement of statements) {
      await pool.query(statement);
    }

    console.log('✅ Database migrations completed successfully');
  } catch (err) {
    console.error('❌ Migration error:', err.message);
    // Don't exit, let server continue - tables might already exist
  }
}

module.exports = { runMigrations };
