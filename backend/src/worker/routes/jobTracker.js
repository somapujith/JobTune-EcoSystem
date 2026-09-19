'use strict';

/**
 * Job tracker CRUD.  Worker port of backend/src/routes/jobTracker.js.
 * Mounted at /api/jobs, FIRST of the six /api/jobs routers (order is behaviour: see routes/mounts/jobs.js).
 *
 *   GET    /api/jobs      authenticateToken
 *   POST   /api/jobs      authenticateToken, requirePlan(3)
 *   PATCH  /api/jobs/:id  authenticateToken            (no plan gate, as on Express)
 *   DELETE /api/jobs/:id  authenticateToken            (no plan gate, as on Express)
 *
 * Preserved quirks: the JSON body is destructured OUTSIDE the try block, so a request without a JSON body
 * throws a TypeError that surfaces as the masked 500 {"error":"Internal Server Error"}; database errors
 * are answered by apiResponse.serverError, which returns the raw error message in the body.
 */
const { createRouter } = require('../lib/routes');
const { authenticateToken } = require('../middleware/auth');
const { requirePlan } = require('../middleware/requirePlan');
const { getDb } = require('../db');
const { getBody } = require('../lib/http');
const apiResponse = require('../services/apiResponse');

const router = createRouter();

const VALID_STATUSES = ['applied', 'interview', 'offer', 'rejected'];

// GET /api/jobs: list all jobs for the authenticated user with stats
router.get('/', authenticateToken, async (c) => {
  const userId = c.get('user').id;

  try {
    const result = await getDb(c).query(
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

    return apiResponse.ok(c, {
      jobs,
      stats: { total, interviews, offers, replyRate }
    });
  } catch (err) {
    return apiResponse.serverError(c, err);
  }
});

// POST /api/jobs: create a new job application
router.post('/', authenticateToken, requirePlan(3), async (c) => {
  const userId = c.get('user').id;
  const {
    company,
    role,
    job_description = null,
    job_url        = null,
    status         = 'applied',
    notes          = null,
    source         = null
  } = getBody(c);

  if (!company) return apiResponse.badRequest(c, 'company is required');
  if (!role)    return apiResponse.badRequest(c, 'role is required');

  try {
    const result = await getDb(c).query(
      `INSERT INTO job_applications
         (user_id, company, role, job_description, job_url, status, notes, source)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [userId, company, role, job_description, job_url, status, notes, source]
    );

    return c.json({ success: true, data: result.rows[0] }, 201);
  } catch (err) {
    return apiResponse.serverError(c, err);
  }
});

// PATCH /api/jobs/:id: update status / notes
router.patch('/:id', authenticateToken, async (c) => {
  const userId = c.get('user').id;
  const jobId  = parseInt(c.req.param('id'), 10);
  const { status, notes } = getBody(c);

  if (status !== undefined && !VALID_STATUSES.includes(status)) {
    return apiResponse.badRequest(c, `status must be one of: ${VALID_STATUSES.join(', ')}`);
  }

  try {
    const result = await getDb(c).query(
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
      return apiResponse.notFound(c, 'Job application not found');
    }

    return apiResponse.ok(c, result.rows[0]);
  } catch (err) {
    return apiResponse.serverError(c, err);
  }
});

// DELETE /api/jobs/:id: hard delete scoped to user
router.delete('/:id', authenticateToken, async (c) => {
  const userId = c.get('user').id;
  const jobId  = parseInt(c.req.param('id'), 10);

  try {
    const result = await getDb(c).query(
      `DELETE FROM job_applications
       WHERE id = $1 AND user_id = $2
       RETURNING id`,
      [jobId, userId]
    );

    if (result.rows.length === 0) {
      return apiResponse.notFound(c, 'Job application not found');
    }

    return c.body(null, 204);
  } catch (err) {
    return apiResponse.serverError(c, err);
  }
});

module.exports = router;
