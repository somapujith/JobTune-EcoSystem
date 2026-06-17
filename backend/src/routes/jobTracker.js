const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { requirePlan } = require('../middleware/requirePlan');
const apiResponse = require('../utils/apiResponse');

const VALID_STATUSES = ['applied', 'interview', 'offer', 'rejected'];

// GET /api/jobs — list all jobs for the authenticated user with stats
router.get('/', authenticateToken, async (req, res) => {
  const userId = req.user.id;

  try {
    const result = await pool.query(
      `SELECT
         ja.*,
         COUNT(*) OVER() AS total,
         SUM(CASE WHEN status = 'interview' THEN 1 ELSE 0 END) OVER() AS interviews,
         SUM(CASE WHEN status = 'offer'     THEN 1 ELSE 0 END) OVER() AS offers
       FROM job_applications ja
       WHERE user_id = $1
       ORDER BY applied_at DESC`,
      [userId]
    );

    const rows = result.rows;

    const total     = rows.length > 0 ? parseInt(rows[0].total,     10) : 0;
    const interviews = rows.length > 0 ? parseInt(rows[0].interviews, 10) : 0;
    const offers    = rows.length > 0 ? parseInt(rows[0].offers,    10) : 0;
    const replyRate = total > 0 ? Math.round((interviews + offers) * 100 / total) : 0;

    // Strip the window-function columns from each job row
    const jobs = rows.map(({ total: _t, interviews: _i, offers: _o, ...job }) => job);

    return apiResponse.ok(res, {
      jobs,
      stats: { total, interviews, offers, replyRate }
    });
  } catch (err) {
    return apiResponse.serverError(res, err);
  }
});

// POST /api/jobs — create a new job application
router.post('/', authenticateToken, requirePlan(3), async (req, res) => {
  const userId = req.user.id;
  const {
    company,
    role,
    job_description = null,
    job_url        = null,
    status         = 'applied',
    notes          = null,
    source         = null
  } = req.body;

  if (!company) return apiResponse.badRequest(res, 'company is required');
  if (!role)    return apiResponse.badRequest(res, 'role is required');

  try {
    const result = await pool.query(
      `INSERT INTO job_applications
         (user_id, company, role, job_description, job_url, status, notes, source)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [userId, company, role, job_description, job_url, status, notes, source]
    );

    return res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    return apiResponse.serverError(res, err);
  }
});

// PATCH /api/jobs/:id — update status / notes
router.patch('/:id', authenticateToken, async (req, res) => {
  const userId = req.user.id;
  const jobId  = parseInt(req.params.id, 10);
  const { status, notes } = req.body;

  if (status !== undefined && !VALID_STATUSES.includes(status)) {
    return apiResponse.badRequest(res, `status must be one of: ${VALID_STATUSES.join(', ')}`);
  }

  try {
    const result = await pool.query(
      `UPDATE job_applications
       SET
         status     = COALESCE($1, status),
         notes      = COALESCE($2, notes),
         updated_at = CURRENT_TIMESTAMP
       WHERE id = $3 AND user_id = $4
       RETURNING *`,
      [status || null, notes !== undefined ? notes : null, jobId, userId]
    );

    if (result.rows.length === 0) {
      return apiResponse.notFound(res, 'Job application not found');
    }

    return apiResponse.ok(res, result.rows[0]);
  } catch (err) {
    return apiResponse.serverError(res, err);
  }
});

// DELETE /api/jobs/:id — hard delete scoped to user
router.delete('/:id', authenticateToken, async (req, res) => {
  const userId = req.user.id;
  const jobId  = parseInt(req.params.id, 10);

  try {
    const result = await pool.query(
      `DELETE FROM job_applications
       WHERE id = $1 AND user_id = $2
       RETURNING id`,
      [jobId, userId]
    );

    if (result.rows.length === 0) {
      return apiResponse.notFound(res, 'Job application not found');
    }

    return res.status(204).send();
  } catch (err) {
    return apiResponse.serverError(res, err);
  }
});

module.exports = router;
