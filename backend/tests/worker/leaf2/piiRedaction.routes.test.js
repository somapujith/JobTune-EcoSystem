'use strict';

/**
 * /api/pii (routes/piiRedaction.js): POST /redact and POST /restore, both authenticateToken only.
 * Real piiRedactor service + route, the pii_redactions table modelled in the fake db (JSONB parsed).
 */
const { build } = require('./helpers');
const { signToken } = require('../helpers/harness');

beforeEach(() => jest.spyOn(console, 'error').mockImplementation(() => {}));
afterEach(() => jest.restoreAllMocks());

const ORIGINAL = 'Contact John Smith at john@example.com or 555-123-4567.';

describe('auth parity', () => {
  it.each(['/api/pii/redact', '/api/pii/restore'])('401 without a token: POST %s', async (path) => {
    const H = build();
    const res = await H.post(path, { text: 'x', contextType: 'resume', redactionId: 1 }, { token: null });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
    expect(H.db.state.pii_redactions).toHaveLength(0);
  });

  it('is not plan gated: a user with no subscription can redact', async () => {
    const H = build();
    const res = await H.post('/api/pii/redact', { text: ORIGINAL, contextType: 'resume' });
    expect(res.status).toBe(200);
  });
});

describe('POST /api/pii/redact', () => {
  it('redacts, stores the map for the caller, and returns { redacted, map, savedId }', async () => {
    const H = build();
    const res = await H.post('/api/pii/redact', { text: ORIGINAL, contextType: 'resume', contextId: 42 });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      redacted: 'Contact [NAME_1] [NAME_2] at [EMAIL_1] or [PHONE_1].',
      map: { '[NAME_1]': 'John', '[NAME_2]': 'Smith', '[EMAIL_1]': 'john@example.com', '[PHONE_1]': '555-123-4567' },
      savedId: 1,
    });
    expect(H.db.state.pii_redactions).toEqual([
      { id: 1, user_id: 7, context_type: 'resume', context_id: 42, redaction_map: body.map },
    ]);
    // the map went to the database as a JSON string parameter
    const insert = H.db.leafCalls.find((c) => /^INSERT INTO pii_redactions/.test(c.sql));
    expect(insert.params).toEqual([7, 'resume', 42, JSON.stringify(body.map)]);
  });

  it('contextId defaults to null (?? keeps 0 and empty string)', async () => {
    const H = build();
    await H.post('/api/pii/redact', { text: 'hello', contextType: 'cover_letter' });
    await H.post('/api/pii/redact', { text: 'hello', contextType: 'cover_letter', contextId: 0 });
    await H.post('/api/pii/redact', { text: 'hello', contextType: 'cover_letter', contextId: null });
    expect(H.db.state.pii_redactions.map((r) => r.context_id)).toEqual([null, 0, null]);
  });

  it('text without PII returns an empty map and is still saved', async () => {
    const H = build();
    const res = await H.post('/api/pii/redact', { text: 'Nothing personal here.', contextType: 'resume' });
    expect(await res.json()).toEqual({ redacted: 'Nothing personal here.', map: {}, savedId: 1 });
  });

  describe('validation', () => {
    it.each([
      ['missing text', { contextType: 'resume' }, 'text is required and must be a string'],
      ['empty text', { text: '', contextType: 'resume' }, 'text is required and must be a string'],
      ['non-string text', { text: 42, contextType: 'resume' }, 'text is required and must be a string'],
      ['array text', { text: ['a'], contextType: 'resume' }, 'text is required and must be a string'],
      ['missing contextType', { text: 'hi' }, 'contextType must be one of: resume, cover_letter'],
      ['unknown contextType', { text: 'hi', contextType: 'invoice' }, 'contextType must be one of: resume, cover_letter'],
      ['empty contextType', { text: 'hi', contextType: '' }, 'contextType must be one of: resume, cover_letter'],
    ])('400 %s', async (_n, body, message) => {
      const H = build();
      const res = await H.post('/api/pii/redact', body);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: message });
      expect(H.db.state.pii_redactions).toHaveLength(0);
    });

    it('text is validated before contextType', async () => {
      const H = build();
      const res = await H.post('/api/pii/redact', { contextType: 'nope' });
      expect((await res.json()).error).toBe('text is required and must be a string');
    });
  });

  it('a request with no body is a caught TypeError -> the route\'s own 500 (not a 400), preserved', async () => {
    const H = build();
    const res = await H.call('POST', '/api/pii/redact');
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal server error' });
    expect(console.error.mock.calls.flat().join(' ')).toMatch(/PII redact error:/);
  });

  it('malformed JSON is rejected by the global body parser with a 400 (before the route)', async () => {
    const H = build();
    const res = await H.post('/api/pii/redact', '{"text": ');
    expect(res.status).toBe(400);
    expect(H.db.state.pii_redactions).toHaveLength(0);
  });

  it('a database failure is a 500 {error: "Internal server error"} without leaking the cause', async () => {
    const H = build();
    H.db.failOn(/^INSERT INTO pii_redactions/, new Error('password authentication failed for user "x"'));
    const res = await H.post('/api/pii/redact', { text: ORIGINAL, contextType: 'resume' });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal server error' });
  });
});

describe('POST /api/pii/restore', () => {
  async function redactAs(H, text = ORIGINAL) {
    const res = await H.post('/api/pii/redact', { text, contextType: 'resume' });
    return res.json();
  }

  it('round trip: restore(redact(text)) returns the original text', async () => {
    const H = build();
    const { redacted, savedId } = await redactAs(H);
    const res = await H.post('/api/pii/restore', { text: `Summary: ${redacted}`, redactionId: savedId });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ restored: `Summary: ${ORIGINAL}` });
  });

  it('restores tokens an AI reply reordered and leaves unknown tokens alone', async () => {
    const H = build();
    const { savedId } = await redactAs(H);
    const res = await H.post('/api/pii/restore', { text: 'Hi [NAME_1], reach [EMAIL_1] [PHONE_9]', redactionId: savedId });
    expect(await res.json()).toEqual({ restored: 'Hi John, reach john@example.com [PHONE_9]' });
  });

  it('a numeric-string redactionId is accepted (the database casts it)', async () => {
    const H = build();
    const { savedId } = await redactAs(H);
    const res = await H.post('/api/pii/restore', { text: '[EMAIL_1]', redactionId: String(savedId) });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ restored: 'john@example.com' });
  });

  it('403 Forbidden for another user\'s record (ownership check preserved)', async () => {
    const H = build();
    const { savedId } = await redactAs(H);
    const other = signToken({ id: 8 });
    const res = await H.post('/api/pii/restore', { text: '[EMAIL_1]', redactionId: savedId }, { token: other });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Forbidden' });
  });

  it('the ownership comparison is strict: a string user id in the token does not match a numeric owner', async () => {
    const H = build();
    const { savedId } = await redactAs(H);
    const res = await H.post('/api/pii/restore', { text: '[EMAIL_1]', redactionId: savedId }, { token: signToken({ id: '7' }) });
    expect(res.status).toBe(403);
  });

  it('404 for an unknown record; redactionId 0 is accepted as "present" and simply not found', async () => {
    const H = build();
    for (const id of [999, 0]) {
      const res = await H.post('/api/pii/restore', { text: 'x', redactionId: id });
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: 'Redaction record not found' });
    }
  });

  describe('validation', () => {
    it.each([
      ['missing text', { redactionId: 1 }],
      ['empty text', { text: '', redactionId: 1 }],
      ['non-string text', { text: 5, redactionId: 1 }],
      ['missing redactionId', { text: 'x' }],
      ['null redactionId', { text: 'x', redactionId: null }],
    ])('400 %s', async (_n, body) => {
      const H = build();
      const res = await H.post('/api/pii/restore', body);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'text and redactionId are required' });
      expect(H.db.leafCallsMatching(/FROM pii_redactions/)).toHaveLength(0);
    });
  });

  it('a non-integer redactionId is a database error -> 500 {error: "Internal server error"}', async () => {
    const H = build();
    const res = await H.post('/api/pii/restore', { text: 'x', redactionId: 'abc' });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal server error' });
  });

  it('no body -> the route\'s own 500 (preserved)', async () => {
    const H = build();
    const res = await H.call('POST', '/api/pii/restore');
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal server error' });
    expect(console.error.mock.calls.flat().join(' ')).toMatch(/PII restore error:/);
  });
});
