const { pool } = require('../config/database');

const auditLogger = (action, resource) => {
  return async (req, res, next) => {
    res.on('finish', async () => {
      const userId = req.user ? req.user.id : null;
      const details = {
        method: req.method,
        url: req.originalUrl,
        statusCode: res.statusCode,
        query: req.query || {},
        body: (req.body && typeof req.body === 'object' && Object.keys(req.body).length > 0) ? '[REDACTED]' : {}
      };

      try {
        await pool.query(
          `INSERT INTO audit_logs (user_id, action, resource, details, ip_address) VALUES ($1, $2, $3, $4, $5)`,
          [userId, action, resource, JSON.stringify(details), req.ip || req.connection.remoteAddress]
        );
      } catch (err) {
        console.error('Audit Log Error:', err.message);
      }
    });
    
    next();
  };
};

module.exports = { auditLogger };
