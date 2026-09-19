'use strict';

/**
 * Job discovery.  Worker port of backend/src/routes/jobDiscovery.js.
 * Mounted at /api/jobs, fourth of the six /api/jobs routers.
 *
 *   GET /api/jobs/discover   authenticateToken, requirePlan(2)
 *   Query: query (keyword), location, source ('mock' | 'remotive' | 'adzuna', default 'mock')
 *
 * Sources come from the injected `services.discovery` (getSource, VALID_SOURCES); the database through
 * the request-scoped `getDb(c)`. Preserved behaviour: the response is built only after every discovered job
 * has been cached (awaited, one INSERT ... ON CONFLICT DO NOTHING per job, each failure swallowed);
 * a source that THROWS falls back to the mock source, and a failure of that fallback (or a non-string
 * query parameter, e.g. a repeated ?query=a&query=b) is uncaught and becomes the masked 500.
 */
const { createRouter } = require('../lib/routes');
const { authenticateToken } = require('../middleware/auth');
const { requirePlan } = require('../middleware/requirePlan');
const { getServices } = require('../lib/context');
const { getDb } = require('../db');
const { getQuery } = require('../lib/http');
const apiResponse = require('../services/apiResponse');
const MockJobSource = require('../services/discovery/MockJobSource');

const router = createRouter();

/**
 * Upsert a batch of normalized jobs into discovered_jobs.
 * Uses ON CONFLICT (source, external_id) DO NOTHING for deduplication.
 * Errors are swallowed: caching failures must not break the response.
 *
 * @param {object} db      request-scoped db
 * @param {number} userId
 * @param {Array}  jobs
 */
async function cacheJobs(db, userId, jobs) {
  for (const job of jobs) {
    try {
      await db.query(
        `INSERT INTO discovered_jobs
           (user_id, external_id, source, title, company, location, description, url, tags)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (source, external_id) DO NOTHING`,
        [
          userId,
          job.externalId,
          job.source,
          job.title,
          job.company,
          job.location,
          job.description,
          job.url,
          JSON.stringify(job.tags || [])
        ]
      );
    } catch (_err) {
      // Cache write failure is non-fatal
    }
  }
}

/**
 * GET /api/jobs/discover
 * Query params:
 *   - query    {string}  search keyword (default: '')
 *   - location {string}  location filter (default: '')
 *   - source   {string}  'mock' | 'remotive' | 'adzuna' (default: 'mock')
 */
router.get('/discover', authenticateToken, requirePlan(2), async (c) => {
  const userId = c.get('user').id;
  const q = getQuery(c);
  const query = (q.query || '').trim();
  const location = (q.location || '').trim();
  const sourceName = (q.source || 'mock').toLowerCase();

  const { getSource, VALID_SOURCES } = getServices(c).discovery;

  if (!VALID_SOURCES.includes(sourceName)) {
    return apiResponse.badRequest(c, `Invalid source. Valid options: ${VALID_SOURCES.join(', ')}`);
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

  // Cache results: errors are swallowed inside cacheJobs
  await cacheJobs(getDb(c), userId, jobs);

  return apiResponse.ok(c, {
    jobs,
    count: jobs.length,
    source: usedSource,
    cached: true
  });
});

module.exports = router;
