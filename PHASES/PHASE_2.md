# Phase 2: Job Discovery — Find & Cache Jobs

**Status**: ✅ COMPLETE  
**Tests**: 34 passing, 80%+ coverage  
**Commit**: f076c177

## What Delivered

JobSource adapter pattern: MockSource + RemotiveSource. Discovery route queries free APIs, caches results.

## Key Files

- `backend/src/services/discovery/` — JobSource interface + implementations
- `backend/src/routes/jobDiscovery.js` — GET /api/jobs/discover?query=&source=
- `backend/tests/jobDiscovery.test.js` — 34 tests
- `frontend/src/pages/JobDiscovery.jsx` — search form + cards

## Schema

`discovered_jobs` table: source, external_id, title, company, location, description, url, fetched_at

## Routes

- `GET /api/jobs/discover?query=&location=&source=mock|remotive`
  - Returns: {jobs, count, source, cached}
  - Falls back to mock on API error
  - Caches to discovered_jobs (dedupes on source+external_id)

## Coverage

- MockJobSource: 100%
- RemotiveSource: 100% (graceful API error handling)
- jobDiscovery.js: 90.9%
- All routes parameterized + auth-scoped

---

**Phase 2 COMPLETE. Ready for Phase 4 (uses discovered_jobs).**
