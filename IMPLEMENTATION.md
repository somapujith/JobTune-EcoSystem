# ResumeHQ Feature Parity Implementation Plan

**Status**: In Progress  
**Started**: 2026-06-06  
**Phases**: 9 total (~18.5 days)  
**Current Phase**: 0 (Complete) → 1 (Next)

## Overview

Complete port of all 18 ResumeHQ Python features into JobTube Eco System (Node.js/React/Supabase).

## Feature Checklist

- [x] Phase 0: Foundation & Test Harness
- [ ] Phase 1: Job Tracking CRUD (Fix JobTracker)
- [ ] Phase 2: Job Discovery
- [ ] Phase 3: PII Redaction
- [ ] Phase 4: ONET Taxonomy + Job Fit Scoring
- [ ] Phase 5: Evidence Audit
- [ ] Phase 6: Scorer Registry + State Machine
- [ ] Phase 7: Batch Operations
- [ ] Phase 8: Job Guides + Benchmarking
- [ ] Phase 9: Integration & Hardening

## Architecture Decisions

1. **Scorer Registry** - Single in-process registry replacing Python's multi-server approach
2. **State Machine** - Persisted in DB (immutable transitions)
3. **Job Source Adapters** - Repository pattern with Mock + free APIs (no scraping)
4. **Concurrency Control** - p-limit bounded parallelism to protect single LM Studio
5. **AI with Fallback** - Every scorer has deterministic fallback (LLM failure graceful)

## Key Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| LM Studio bottleneck | p-limit concurrency cap (~3), per-step timeouts |
| ATS endpoint refactor | Characterization tests FIRST (TDD), keep route signature |
| Route collisions | Register specific paths before `/:id` parametric |
| External job feeds | Adapter pattern + Mock fallback, try/catch wrapper |
| 80% coverage | Test fallback paths, mock AI, deterministic logic |

## Database Schema Changes

- `job_applications` - Track applications
- `discovered_jobs` - Cache job postings
- `pii_redactions` - Audit PII stripping
- `onet_occupations` - ONET taxonomy
- `evidence_bullets` - Resume bullet tracking
- `evidence_usage` - Bullet reuse audit
- `pipeline_runs` - Orchestration state
- `pipeline_steps` - State transition history
- `batch_jobs` - Batch operation tracking
- `scorer_benchmarks` - Scorer quality metrics
- `job_guides` - Interview guides

## Timeline

| Phase | Work | Days | Status |
|-------|------|------|--------|
| 0 | Test harness + skeleton | 1 | ✅ Done |
| 1 | JobTracker CRUD | 1.5 | ⏳ Next |
| 2 | Job discovery | 2 | 📋 Queued |
| 3 | PII redaction | 1 | 📋 Queued |
| 4 | ONET + Job fit | 2.5 | 📋 Queued |
| 5 | Evidence audit | 2 | 📋 Queued |
| 6 | Registry + State machine | 3 | 📋 Queued |
| 7 | Batch operations | 2 | 📋 Queued |
| 8 | Guides + Benchmarking | 2 | 📋 Queued |
| 9 | Integration + hardening | 1.5 | 📋 Queued |
| **TOTAL** | **100% ResumeHQ parity** | **~18.5** | |

## Phase Documentation

Each phase has its own detailed MD file:
- [Phase 0: Foundation](./PHASES/PHASE_0.md) ✅
- [Phase 1: JobTracker](./PHASES/PHASE_1.md)
- [Phase 2: Discovery](./PHASES/PHASE_2.md)
- [Phase 3: PII](./PHASES/PHASE_3.md)
- [Phase 4: ONET](./PHASES/PHASE_4.md)
- [Phase 5: Evidence](./PHASES/PHASE_5.md)
- [Phase 6: Registry](./PHASES/PHASE_6.md)
- [Phase 7: Batch](./PHASES/PHASE_7.md)
- [Phase 8: Guides](./PHASES/PHASE_8.md)
- [Phase 9: Hardening](./PHASES/PHASE_9.md)

## Running Context

See [CONTEXT.md](./CONTEXT.md) for continuously updated status of:
- Completed features
- Tests passing
- Commits pushed
- Current blockers

## How to Use This Document

1. Read phase MD files sequentially as they're implemented
2. Check CONTEXT.md for real-time progress
3. Each phase has: goal, files touched, tests, risks, next steps
4. Tests must pass and coverage ≥80% before marking phase complete
