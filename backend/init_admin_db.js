const { pool } = require('./src/config/database');

async function initAdminDB() {
  try {
    // Check if role column exists in users
    try {
      await pool.query(`ALTER TABLE users ADD COLUMN role ENUM('user', 'admin') DEFAULT 'user'`);
      console.log('Added role column to users table');
    } catch (e) {
      if (e.code === 'ER_DUP_FIELDNAME') {
        console.log('role column already exists');
      } else {
        console.log('Error altering users table:', e.message);
      }
    }

    // Create audit_logs table
    const createAuditLogs = `
      CREATE TABLE IF NOT EXISTS audit_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT,
        action VARCHAR(255) NOT NULL,
        resource VARCHAR(255),
        details JSON,
        ip_address VARCHAR(45),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
      )
    `;
    await pool.query(createAuditLogs);
    console.log('audit_logs table created or already exists');

  } catch (err) {
    console.error('Error initializing admin DB:', err);
  } finally {
    process.exit(0);
  }
}

initAdminDB();
