# Phase 5: Evidence Audit — Resume Bullet Tracking

**Status**: ✅ COMPLETE  
**Tests**: 49 passing, 92.9% coverage  
**Commit**: f076c177

## What Delivered

Extract resume bullets, track reuse across applications, report on diversity.

## Key Files

- `backend/src/services/evidence/evidenceTracker.js` — extract, hash, embed, log usage
- `backend/src/routes/evidence.js` — GET /api/evidence/report, /api/evidence/bullets
- `backend/tests/evidenceTracker.test.js` — 31 unit tests
- `backend/tests/evidence.routes.test.js` — 18 integration tests
- `frontend/src/pages/EvidenceDashboard.jsx` — reuse heatmap + diversity gauge

## Schema

- `evidence_bullets` — user_id, bullet_text, bullet_hash (SHA256 dedupe), embedding, skills
- `evidence_usage` — bullet_id, application_id, context (tailored_resume|cover_letter)

## Routes

- `GET /api/evidence/report` → {overUsed, underUsed, uniqueBullets, diversity, suggestions}
- `GET /api/evidence/bullets` → list all with usage counts

## Key Logic

- **Hash dedup**: SHA256(bullet_text) forces unique bullets per user
- **Diversity score**: Coefficient of variation of usage counts → score 0-100
- **Over-used**: >2 times flagged
- **Under-used**: 0-1 times flagged
- **logUsage()** called during Phase 6 pipeline (tailor + cover-letter)

## Coverage

92.9% statements, 82.9% branches, 94.7% functions

---

**Phase 5 COMPLETE. logUsage hook ready for Phase 6 pipeline.**
