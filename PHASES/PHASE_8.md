# Phase 8: Guides + Benchmarking — Interview Prep & Scorer Eval

**Status**: ✅ COMPLETE  
**Tests**: 45 passing, 80%+ coverage  
**Commit**: f076c177

## What Delivered

Interview guides (questions + talking points + research) + scorer quality benchmarking.

## Key Files

- `backend/src/services/guides/jobGuideGenerator.js` — generateJobGuide() + fallback
- `backend/src/services/benchmarks/scorerBenchmark.js` — computeMetrics() + runBenchmark()
- `backend/src/routes/guides.js` — POST /api/guides/generate, GET /api/guides/:id
- `backend/src/routes/benchmarks.js` — GET /api/benchmarks/run (admin-only)
- `backend/tests/jobGuideGenerator.test.js` — 20 unit tests
- `backend/tests/scorerBenchmark.test.js` — 15 unit tests
- `frontend/src/pages/JobGuide.jsx` — dual-mode (from appId or manual JD)

## Guides Service

- **generateJobGuide(jobDesc, role)** → {questions[], talkingPoints[], companyResearch}
- LLM prompt: interview questions, impact talking points, company research tips
- **Fallback**: template-based when LLM fails
- Stores to job_guides table with user_id

## Benchmarking Service

- **FIXTURE_DATASET** — 7 labeled resume/job pairs with human scores
- **runBenchmark()** — score all via ATS + HR + fit strategies, compute metrics
- **Metrics**: MAE (mean absolute error), Pearson correlation, precision@0.8
- Admin-only route (403 for non-admin)

## Routes

- `POST /api/guides/generate` — {applicationId|jobDescription, role} → {questions, talkingPoints, research, savedId}
- `GET /api/guides/:id` — fetch saved guide
- `GET /api/benchmarks/run` (admin) → run eval, return {metrics, sample_size}

## Coverage

- jobGuideGenerator.js: 97.91%
- scorerBenchmark.js: 98.52%
- routes: 92-95%

---

**Phase 8 COMPLETE. Scoring quality measurable.**
