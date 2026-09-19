# Implementation Context & Progress

**Last Updated**: 2026-06-06 04:45 UTC  
**Current Phase**: 6 (Scorer Registry + State Machine) — Next to implement  
**Overall Progress**: 7/9 phases complete (78%)

---

## ✅ COMPLETED PHASES

### Phase 0: Foundation & Test Harness ✅
- Jest + supertest + p-limit installed
- jest.config.js with 80% coverage threshold
- Service directory skeleton created
- Shared apiResponse.js utility
- Commit: `deee3319`

### Phase 1: JobTracker CRUD ✅
- job_applications table + CRUD endpoints
- GET /api/jobs (stats: total, interviews, offers, replyRate)
- POST/PATCH/DELETE /api/jobs
- 20 tests, 100% coverage
- Commit: `eeb38ba5`

### Phase 2: Job Discovery ✅
- JobSource adapters: MockJobSource + RemotiveSource
- GET /api/jobs/discover?query=&source=
- discovered_jobs table + caching
- Graceful API error fallback
- 34 tests, 80%+ coverage
- Commit: `f076c177`

### Phase 3: PII Redaction ✅
- Redact: email, phone, address, names
- Unique tokens per PII instance
- Round-trip restore guarantee
- POST /api/pii/redact, /api/pii/restore
- 46 tests, 100% coverage
- Commit: `f076c177`

### Phase 5: Evidence Audit ✅
- Extract + hash + embed resume bullets
- SHA256 deduplication
- Track reuse per application
- Diversity score calculation
- GET /api/evidence/report, /api/evidence/bullets
- 49 tests, 92.9% coverage
- Commit: `f076c177`

### Phase 8: Guides + Benchmarking ✅
- Job guide generator (questions, talking points, research)
- Scorer benchmarking: MAE, correlation vs human
- POST /api/guides/generate, GET /api/guides/:id
- Admin-only GET /api/benchmarks/run
- 45 tests, 80%+ coverage
- Commit: `f076c177`

### Phase 4: ONET Taxonomy + Job Fit Scoring ✅
- Bundle trimmed ONET dataset (20 occupations)
- Job fit scorer strategy (domain + seniority + skills)
- Refactored to use local LM Studio (callAI)
- POST /api/jobs/fit route registered
- Frontend JobFitAnalysis radar chart page built
- 47 tests, 97.7% coverage

---

## 📋 REMAINING PHASES


### Phase 6: Scorer Registry + State Machine (3 days) ⚠️ CRITICAL
**Status**: Blocked until Phase 4 done  
**Depends on**: Phase 4 (all scorers: ATS, HR, fit, embed)

**What to build**:
- Scorer registry: `scorerRegistry.score('ats'|'hr'|'fit'|'embed', input)`
- Refactor existing ATS route to use registry (keep signature!)
- HR scorer strategy (LLM recruiter evaluation)
- State machine: persist transitions (DISCOVERED → FIT_SCORED → TAILORED → ATS_SCORED → HR_SCORED → EXPORT → TRACKED)
- Pipeline runs: orchestrate parallel ATS+HR+fit via Promise.all
- Handle partial failures (one scorer fails ≠ whole pipeline fails)

**AI Requirements**:
- ✅ **LM Studio LOCAL** — ATS, HR, fit scorers all local
- ✅ **NO external APIs** — deterministic fallbacks for all
- ✅ **TDD first** — characterization tests on existing ATS before refactor

**Files**:
- backend/src/services/scoring/scorerRegistry.js
- backend/src/services/scoring/strategies/{ats,hr,fit,embed}.js
- backend/src/services/orchestration/stateMachine.js
- backend/src/services/orchestration/pipelineRunner.js
- backend/tests/{scorerRegistry,stateMachine}.test.js
- Refactor atsChecker.js to use registry (keep /api/jobs/check-ats-score unchanged)

**Tests**: 80%+ coverage, characterization tests for ATS

---

### Phase 7: Batch Operations (2 days)
**Status**: Blocked until Phase 6 done  
**Depends on**: Phase 6 (pipeline works)

**What to build**:
- Batch orchestrator: apply pipeline to 10+ jobs in parallel
- p-limit concurrency cap (~3) to protect single LM Studio instance
- POST /api/batch/apply {jobIds[]} → returns batchId
- GET /api/batch/:id → poll progress {completed, failed, results[]}
- batch_jobs table: track per-job progress

**AI Requirements**:
- ✅ **LM Studio LOCAL** — all scoring via Phase 6 pipeline
- ✅ **p-limit bounded** — don't overload single LLM instance

**Files**:
- backend/src/services/batch/batchRunner.js
- backend/src/routes/batch.js
- backend/tests/batchRunner.test.js
- frontend/src/pages/BatchApply.jsx

---

### Phase 9: Integration & Hardening (1.5 days)
**Status**: Blocked until Phase 8 done (all pieces built)  
**Depends on**: All phases 0-8

**What to build**:
- E2E tests (Playwright): discover → fit-score → track → pipeline → export flow
- Batch apply E2E: select jobs → run → download tailored resumes
- Coverage audit: verify all modules 80%+
- Navigation wiring: add routes to Layout.jsx + App.jsx
- Error handling + retry logic
- Performance testing

**Files**:
- frontend/e2e/*.spec.js (Playwright E2E)
- Coverage report verification
- Navigation updates

---

## 🔑 CRITICAL CONSTRAINT

### **NO EXTERNAL AI APIS**
All AI work uses **LM Studio Local LLMs ONLY**:
- ✅ ATS scoring: Mistral 7B (phase 6)
- ✅ HR scoring: Llama 3.1 8B (phase 6)
- ✅ Job fit: Qwen2.5 7B (phase 4)
- ✅ Guides: Phi-4 (phase 8)
- ✅ Embeddings: nomic-embed-text (local)

**FORBIDDEN**:
- ❌ Gemini API
- ❌ OpenAI API
- ❌ Any cloud LLM services
- ❌ External API calls for AI

All scorers have **deterministic rule-based fallbacks** for when LM Studio is offline.

---

## 📊 Test Coverage Status

| Phase | Target | Current | Status |
|-------|--------|---------|--------|
| 0 | 80% | 100% | ✅ |
| 1 | 80% | 100% | ✅ |
| 2 | 80% | 80%+ | ✅ |
| 3 | 80% | 100% | ✅ |
| 4 | 80% | 97.7% | ✅ |
| 5 | 80% | 92.9% | ✅ |
| 6 | 80% | 0% | ⏳ Next |
| 7 | 80% | 0% | 📋 Queued |
| 8 | 80% | 80%+ | ✅ |
| 9 | 80% | 0% | 📋 Queued |
| **TOTAL** | **80%** | **~55%** | ⏳ |

---

## 🚀 NEXT IMMEDIATE STEPS

**Phase 6 (Scorer Registry + State Machine): 3 day sprint**

1. Write tests FIRST (TDD Red phase)
   - scorerRegistry.test.js: register & score ATS/HR/fit/embed
   - stateMachine.test.js: transitions & pipeline orchestrator

2. Implement services
   - Scorer registry wrapper
   - Refactor existing ATS checker strategy
   - HR strategy with LLM evaluator
   - State machine model + pipeline runner

3. Test + commit
   - Verify 80%+ coverage

---

## 🔗 Related Docs

- [IMPLEMENTATION.md](./IMPLEMENTATION.md) — master plan overview
- [PHASES/PHASE_0.md](./PHASES/PHASE_0.md) — completed
- [PHASES/PHASE_1.md](./PHASES/PHASE_1.md) — completed
- [PHASES/PHASE_2.md](./PHASES/PHASE_2.md) — completed
- [PHASES/PHASE_3.md](./PHASES/PHASE_3.md) — completed
- [PHASES/PHASE_5.md](./PHASES/PHASE_5.md) — completed
- [PHASES/PHASE_8.md](./PHASES/PHASE_8.md) — completed

---

**All progress tracked here. Update after each phase commit.**
