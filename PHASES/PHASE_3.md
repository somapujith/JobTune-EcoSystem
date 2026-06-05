# Phase 3: PII Redaction — Email/Phone/Address Masking

**Status**: ✅ COMPLETE  
**Tests**: 46 passing, 100% coverage  
**Commit**: f076c177

## What Delivered

Redact personal info before external systems. Round-trip safe restore.

## Key Files

- `backend/src/services/pii/piiRedactor.js` — redact() + restore()
- `backend/src/routes/piiRedaction.js` — POST /api/pii/redact, /api/pii/restore
- `backend/tests/piiRedactor.test.js` — 31 unit tests
- `backend/tests/pii.routes.test.js` — 15 integration tests

## Patterns Redacted

- Email: `[EMAIL_1]`, `[EMAIL_2]`, ...
- Phone: `[PHONE_1]`, ...
- Address: `[ADDRESS_1]`, ...
- Names: `[NAME_1]`, ...

**Unique tokens per instance** — multiple emails get separate tokens.

## Routes

- `POST /api/pii/redact` — {text, contextType} → {redacted, map, savedId}
- `POST /api/pii/restore` — {text, redactionId} → {restored}

## Coverage

100% on all metrics. Round-trip guarantee tested.

---

**Phase 3 COMPLETE. Guards Phase 6+ scorers.**
