# Implementation Context & Progress

**Last Updated**: 2026-06-06 03:30 UTC  
**Current Phase**: 2 (Job Discovery) + 3 (PII Redaction) — PARALLEL  
**Overall Progress**: 2/9 phases complete (22%)

## Completed Features

### Phase 0: Foundation & Test Harness ✅
- [x] Jest + supertest + p-limit installed
- [x] jest.config.js with 80% coverage threshold
- [x] Service directory skeleton (9 modules)
- [x] Shared apiResponse.js utility
- [x] Sample test + harness verification
- [x] Commit: `deee3319` - Phase 0 complete

**Tests**: apiResponse.test.js (9 passing, 100% coverage)  
**Status**: Ready for Phase 1

## Current Work: Phase 1 (JobTracker CRUD)

### Objective
Fix broken JobTracker.jsx by implementing CRUD endpoints for job_applications table.

### Files to Touch
- `backend/src/utils/initializeTables.js` - Add table schema
- `backend/src/routes/jobTracker.js` - NEW: CRUD route
- `backend/src/app.js` - Mount route
- `backend/tests/jobTracker.test.js` - NEW: CRUD tests

### Timeline
- Duration: 1.5 days (parallel: DB + route implementation)
- Status: Not started
- Blocker: None

## Upcoming Phases (Queued)

### Phase 2: Job Discovery (2 days)
- Remotive/Arbeitnow adapters
- Discovery route + caching
- Frontend JobDiscovery page

### Phase 3: PII Redaction (1 day)
- PII redactor service
- Redact/restore pipeline

### Phase 4: ONET + Job Fit (2.5 days)
- ONET dataset bundling
- Job fit scorer strategy
- Fit analysis page

### Phase 5: Evidence Audit (2 days)
- Bullet extraction + embedding
- Reuse tracking
- Evidence dashboard

### Phase 6: Scorer Registry (3 days) ⚠️ RISKY
- Refactor existing ATS (keep signature)
- HR scorer strategy
- State machine orchestration

### Phase 7: Batch Operations (2 days)
- Batch runner + concurrency
- Batch apply page
- Progress tracking

### Phase 8: Guides + Benchmarking (2 days)
- Job guide generator
- Scorer benchmarking
- Admin bench routes

### Phase 9: Integration & Hardening (1.5 days)
- E2E tests (Playwright)
- Coverage audit
- Navigation wiring

## Known Issues & Risks

| Issue | Status | Notes |
|-------|--------|-------|
| LM Studio single instance | Mitigated | p-limit concurrency cap planned for Phase 7 |
| Route `/jobs/:id` collision | Mitigated | Specific paths register before parametric routes |
| ATS refactor (Phase 6) | Mitigated | TDD characterization tests written first |
| External job API instability | Mitigated | Adapter pattern + Mock fallback |

## Test Coverage

| Phase | Target | Current | Status |
|-------|--------|---------|--------|
| Phase 0 | 80% | 100% (apiResponse) | ✅ |
| Phase 1 | 80% | 0% (pending) | ⏳ |
| Phase 2-9 | 80% | 0% (pending) | 📋 |
| **Total** | **80%** | **~0.9%** | ⏳ |

## Commits

| Hash | Phase | Message | Date |
|------|-------|---------|------|
| deee3319 | 0 | Phase 0 - Foundation & Test Harness | 2026-06-06 |

## Next Immediate Steps

1. Create `job_applications` table in initializeTables.js
2. Implement jobTracker.js CRUD route with auth
3. Mount in app.js (verify no route collision)
4. Write + pass 80% coverage tests
5. Commit Phase 1
6. Proceed to Phase 2

**Estimated completion of Phase 1**: ~2 hours  
**Estimated completion of all phases**: ~18.5 days (if 8 hours/day)
