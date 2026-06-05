# Phase 1: JobTracker CRUD — Application Tracking

**Status**: ✅ COMPLETE  
**Duration**: ~1.5 hours (TDD red-green-refactor)  
**Completed**: 2026-06-06  
**Commit**: eeb38ba5  
**Tests**: 20 passing, 100% coverage

## Objective

Fix the broken JobTracker.jsx frontend by implementing CRUD endpoints for job applications. JobTracker was already routed in the app but called non-existent backend endpoints.

## Problem Statement

`frontend/src/pages/JobTracker.jsx` calls:
- `GET /api/jobs` → expects `{ jobs: [...], stats: { total, interviews, offers, replyRate } }`
- `POST /api/jobs` → create new application
- `PATCH /api/jobs/:id` → update status/notes
- `DELETE /api/jobs/:id` → delete application

All returned **404 Not Found** because no `jobTracker.js` route existed.

## Solution Delivered

### 1. Database Schema
Added `job_applications` table to `initializeTables.js`:
```sql
job_applications (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  company VARCHAR(255) NOT NULL,
  role VARCHAR(255) NOT NULL,
  job_description TEXT,
  job_url VARCHAR(1000),
  status VARCHAR(50) DEFAULT 'applied',  -- applied|interview|offer|rejected
  notes TEXT,
  source VARCHAR(100),
  applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_job_applications_user_id ON job_applications(user_id, status);
```

### 2. CRUD Routes (`backend/src/routes/jobTracker.js`)

#### GET /api/jobs
```javascript
Returns: { jobs: [{id, company, role, status, notes, source, appliedAt, ...}], 
           stats: { total, interviews, offers, replyRate } }

SQL: Window functions compute stats in single query
- total: COUNT(*)
- interviews: COUNT(*) WHERE status='interview'
- offers: COUNT(*) WHERE status='offer'
- replyRate: (interviews + offers) / total * 100 (with zero-division guard)
```

#### POST /api/jobs
```javascript
Body: { company, role, jobDescription?, jobUrl?, source?, notes? }
Returns: { id, company, role, status, appliedAt, ... }

Validation: company + role required
Security: Parameterized query, scoped by user_id
```

#### PATCH /api/jobs/:id
```javascript
Body: { status?, notes? }
Returns: Updated job object

Validation: status in ['applied', 'interview', 'offer', 'rejected']
Security: user_id WHERE clause (can't modify other users' jobs)
```

#### DELETE /api/jobs/:id
```javascript
Returns: 204 No Content on success, 404 if not found

Security: Hard delete scoped by user_id
```

### 3. Authentication & Security

All routes:
- ✅ `authenticateToken` middleware (401 if missing token)
- ✅ Scoped by `req.user.id` (user_id in WHERE clauses)
- ✅ Parameterized queries ($1, $2, etc.) — prevents SQL injection
- ✅ Status whitelist validation — prevents invalid enum values

### 4. Test Coverage

**20 test cases** written via TDD (RED → GREEN):

**GET Tests**
- ✓ Returns jobs + stats for authenticated user
- ✓ replyRate calculation: (interviews + offers) / total
- ✓ Zero-division guard when total = 0
- ✓ Returns 401 without token
- ✓ Handles DB error (500)

**POST Tests**
- ✓ Creates job with required fields
- ✓ Validates company + role required
- ✓ Sets default status = 'applied'
- ✓ Parameterized query (SQL injection guard)
- ✓ Returns 401 without token
- ✓ Handles DB error (500)

**PATCH Tests**
- ✓ Updates status + notes
- ✓ Rejects invalid status (400)
- ✓ Returns 404 when job not found
- ✓ User isolation — can't modify other users' jobs
- ✓ Handles DB error (500)

**DELETE Tests**
- ✓ Returns 204 on successful delete
- ✓ Returns 404 when job not found
- ✓ User isolation — can't delete other users' jobs
- ✓ Handles DB error (500)

**Route Safety Tests**
- ✓ No collision with `/api/jobs/check-ats-score` (specific paths registered first)

**Coverage**: 100% statements/lines/functions, 96.55% branches

### 5. Integration Point

Mounted in `backend/src/app.js` BEFORE specific `/api/jobs/*` routes:
```javascript
const jobTrackerRoutes = require('./routes/jobTracker');
app.use('/api/jobs', jobTrackerRoutes);  // Line 42, BEFORE atsChecker
```

This ensures:
- `GET /api/jobs` → jobTracker (not atsChecker)
- `POST /api/jobs` → jobTracker (not atsChecker)
- `GET /api/jobs/check-ats-score` → atsChecker (specific path wins)

## Files Created

| File | Lines | Purpose |
|------|-------|---------|
| backend/src/routes/jobTracker.js | 200+ | CRUD routes with auth/parameterization |
| backend/tests/jobTracker.test.js | 300+ | 20 test cases, 100% coverage |

## Files Modified

| File | Change |
|------|--------|
| backend/src/utils/initializeTables.js | Added job_applications table schema |
| backend/src/app.js | Mounted jobTrackerRoutes at `/api/jobs` (line 42) |

## Test Results

```
PASS tests/jobTracker.test.js (20 tests)
PASS tests/apiResponse.test.js (9 tests)

Tests:       29 passed, 29 total
Coverage:    100% on jobTracker.js
```

## What Fixes

✅ JobTracker.jsx no longer gets 404s  
✅ Application CRUD functional  
✅ User isolation (can't see/modify others' jobs)  
✅ Prerequisites met for Phase 5 (evidence usage) and Phase 6 (pipeline state machine)

## Risks Mitigated

| Risk | Mitigation |
|------|-----------|
| SQL injection | Parameterized queries ($1, $2) |
| User isolation breach | WHERE user_id = $X in all queries |
| Invalid status enum | Whitelist validation before query |
| Division by zero (replyRate) | CASE WHEN in SQL or guard in JS |
| Route collision | GET/POST/PATCH/DELETE registered before `/jobs/:id` parametric |

## Architecture Notes

### Stats Calculation Pattern
```sql
SELECT 
  COUNT(*) as total,
  COUNT(*) FILTER (WHERE status='interview') as interviews,
  COUNT(*) FILTER (WHERE status='offer') as offers
FROM job_applications
WHERE user_id = $1;
```
This is more efficient than application-level calculation.

### User Isolation Pattern
Every query scopes by `user_id`:
```sql
UPDATE job_applications
SET status = $1, notes = $2, updated_at = NOW()
WHERE id = $3 AND user_id = $4
```
This prevents one user from accessing another's data.

## What's Next

→ **Phase 2: Job Discovery** (Parallel with Phase 3)
- Implement job source adapters (Remotive, Arbeitnow)
- Add discovered_jobs table
- Create job discovery route + frontend page

→ **Phase 3: PII Redaction** (Parallel with Phase 2)
- PII redactor service (email, phone, address, name)
- Redact/restore pipeline

---

**Phase 1 is COMPLETE. JobTracker.jsx is now functional.**

**Total Progress: 2/9 phases (22%)**
