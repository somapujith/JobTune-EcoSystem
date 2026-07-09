const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { requirePlan } = require('../middleware/requirePlan');
const apiResponse = require('../utils/apiResponse');
const { getSource, VALID_SOURCES } = require('../services/discovery/index');
const MockJobSource = require('../services/discovery/MockJobSource');

/**
 * Upsert a batch of normalized jobs into discovered_jobs.
 * Uses ON CONFLICT (source, external_id) DO NOTHING for deduplication.
 * Errors are swallowed — caching failures must not break the response.
 *
 * @param {number} userId
 * @param {Array}  jobs
 */
async function cacheJobs(userId, jobs) {
  if (!Array.isArray(jobs) || jobs.length === 0) return;

  // Single multi-row parameterized insert instead of one round-trip per job
  const placeholders = [];
  const params = [];
  for (const job of jobs) {
    const base = params.length;
    placeholders.push(
      `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9})`
    );
    params.push(
      userId,
      job.externalId,
      job.source,
      job.title,
      job.company,
      job.location,
      job.description,
      job.url,
      JSON.stringify(job.tags || [])
    );
  }

  try {
    await pool.query(
      `INSERT INTO discovered_jobs
         (user_id, external_id, source, title, company, location, description, url, tags)
       VALUES ${placeholders.join(', ')}
       ON CONFLICT (source, external_id) DO NOTHING`,
      params
    );
  } catch (_err) {
    // Cache write failure is non-fatal
  }
}

/**
 * GET /api/jobs/discover
 * Query params:
 *   - query    {string}  search keyword (default: '')
 *   - location {string}  location filter (default: '')
 *   - source   {string}  'mock' | 'remotive' (default: 'mock')
 */
router.get('/discover', authenticateToken, requirePlan(2), async (req, res) => {
  const userId = req.user.id;
  const query = (req.query.query || '').trim();
  const location = (req.query.location || '').trim();
  const sourceName = (req.query.source || 'mock').toLowerCase();

  if (!VALID_SOURCES.includes(sourceName)) {
    return apiResponse.badRequest(res, `Invalid source. Valid options: ${VALID_SOURCES.join(', ')}`);
  }

  let source = getSource(sourceName);
  let usedSource = sourceName;
  let jobs = [];

  try {
    jobs = await source.search(query, location);

    // No fallback on 0 results, only on error
    if (!Array.isArray(jobs)) {
      jobs = [];
    }
  } catch (err) {
    console.error(`Error searching jobs with ${sourceName}:`, err);
    // Fallback to mock on any error
    source = new MockJobSource();
    jobs = await source.search(query, location);
    usedSource = 'mock';
  }

  // Cache results — non-blocking, errors are swallowed inside cacheJobs
  await cacheJobs(userId, jobs);

  return apiResponse.ok(res, {
    jobs,
    count: jobs.length,
    source: usedSource,
    cached: true
  });
});

module.exports = router;
