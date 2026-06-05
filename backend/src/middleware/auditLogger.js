const { pool } = require('../config/database');

const auditLogger = (action, resource) => {
  return async (req, res, next) => {
    // We want to log after the request has finished to see if it was successful,
    // or log it upfront. Logging upfront is simpler, but logging after is better.
    res.on('finish', async () => {
      // Only log if successful or if we want to log failures too. Let's log all.
      // But we need the user_id if they are logged in.
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
