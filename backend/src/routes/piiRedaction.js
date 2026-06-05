'use strict';

const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { redact, restore } = require('../services/pii/piiRedactor');
const { pool } = require('../config/database');

const VALID_CONTEXT_TYPES = ['resume', 'cover_letter'];

// POST /api/pii/redact
router.post('/redact', authenticateToken, async (req, res) => {
  try {
    const { text, contextType, contextId } = req.body;

    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'text is required and must be a string' });
    }
    if (!contextType || !VALID_CONTEXT_TYPES.includes(contextType)) {
      return res.status(400).json({ error: `contextType must be one of: ${VALID_CONTEXT_TYPES.join(', ')}` });
    }

    const { redacted, map } = redact(text);

    const result = await pool.query(
      `INSERT INTO pii_redactions (user_id, context_type, context_id, redaction_map)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [req.user.id, contextType, contextId ?? null, JSON.stringify(map)]
    );

    return res.json({ redacted, map, savedId: result.rows[0].id });
  } catch (err) {
    console.error('PII redact error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/pii/restore
router.post('/restore', authenticateToken, async (req, res) => {
  try {
    const { text, redactionId } = req.body;

    if (!text || typeof text !== 'string' || redactionId == null) {
      return res.status(400).json({ error: 'text and redactionId are required' });
    }

    const result = await pool.query(
      'SELECT id, user_id, redaction_map FROM pii_redactions WHERE id = $1',
      [redactionId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Redaction record not found' });
    }

    const record = result.rows[0];

    if (record.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const restored = restore(text, record.redaction_map);
    return res.json({ restored });
  } catch (err) {
    console.error('PII restore error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
