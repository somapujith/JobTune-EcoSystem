'use strict';

/**
 * PII redaction routes. Worker port of backend/src/routes/piiRedaction.js (git HEAD 38d8130a).
 * Mounted at /api/pii.
 *
 * POST /api/pii/redact    authenticateToken
 * POST /api/pii/restore   authenticateToken
 *
 * Preserved on purpose (ADR 4.3): the request body is destructured INSIDE the try block, so a
 * request without a JSON body (body undefined) is a caught TypeError and yields the route's own
 * 500 {"error":"Internal server error"} rather than a 400, exactly as on Render.
 */
const { createRouter } = require('../lib/routes');
const { authenticateToken } = require('../middleware/auth');
const { getServices } = require('../lib/context');
const { getDb } = require('../db');
const { getBody } = require('../lib/http');

const router = createRouter();

const VALID_CONTEXT_TYPES = ['resume', 'cover_letter'];

// POST /api/pii/redact
router.post('/redact', authenticateToken, async (c) => {
  try {
    const { text, contextType, contextId } = getBody(c);

    if (!text || typeof text !== 'string') {
      return c.json({ error: 'text is required and must be a string' }, 400);
    }
    if (!contextType || !VALID_CONTEXT_TYPES.includes(contextType)) {
      return c.json({ error: `contextType must be one of: ${VALID_CONTEXT_TYPES.join(', ')}` }, 400);
    }

    const { redact } = getServices(c).piiRedactor;
    const { redacted, map } = redact(text);

    const result = await getDb(c).query(
      `INSERT INTO pii_redactions (user_id, context_type, context_id, redaction_map)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [c.get('user').id, contextType, contextId ?? null, JSON.stringify(map)]
    );

    return c.json({ redacted, map, savedId: result.rows[0].id });
  } catch (err) {
    console.error('PII redact error:', err.message);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// POST /api/pii/restore
router.post('/restore', authenticateToken, async (c) => {
  try {
    const { text, redactionId } = getBody(c);

    if (!text || typeof text !== 'string' || redactionId == null) {
      return c.json({ error: 'text and redactionId are required' }, 400);
    }

    const result = await getDb(c).query(
      'SELECT id, user_id, redaction_map FROM pii_redactions WHERE id = $1',
      [redactionId]
    );

    if (result.rows.length === 0) {
      return c.json({ error: 'Redaction record not found' }, 404);
    }

    const record = result.rows[0];

    if (record.user_id !== c.get('user').id) {
      return c.json({ error: 'Forbidden' }, 403);
    }

    const { restore } = getServices(c).piiRedactor;
    const restored = restore(text, record.redaction_map);
    return c.json({ restored });
  } catch (err) {
    console.error('PII restore error:', err.message);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

module.exports = router;
