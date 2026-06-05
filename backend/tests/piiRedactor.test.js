/**
 * Unit tests for piiRedactor service — TDD RED phase
 * Tests written BEFORE implementation.
 */

const { redact, restore } = require('../src/services/pii/piiRedactor');

// ─── redact() ────────────────────────────────────────────────────────────────

describe('redact()', () => {
  describe('emails', () => {
    it('replaces a single email with [EMAIL_1]', () => {
      const { redacted, map } = redact('Contact me at john@example.com please.');
      expect(redacted).toBe('Contact me at [EMAIL_1] please.');
      expect(map['[EMAIL_1]']).toBe('john@example.com');
    });

    it('replaces multiple emails with unique tokens', () => {
      const { redacted, map } = redact('From alice@test.com to bob@other.org');
      expect(redacted).toContain('[EMAIL_1]');
      expect(redacted).toContain('[EMAIL_2]');
      expect(Object.keys(map).filter(k => k.startsWith('[EMAIL_'))).toHaveLength(2);
      expect(Object.values(map)).toContain('alice@test.com');
      expect(Object.values(map)).toContain('bob@other.org');
    });

    it('handles email with subdomains and dots', () => {
      const { map } = redact('user.name+tag@mail.co.uk');
      expect(Object.values(map)).toContain('user.name+tag@mail.co.uk');
    });
  });

  describe('phones', () => {
    it('replaces a US phone (dash format) with [PHONE_1]', () => {
      const { redacted, map } = redact('Call me at 555-123-4567 anytime.');
      expect(redacted).toBe('Call me at [PHONE_1] anytime.');
      expect(map['[PHONE_1]']).toBe('555-123-4567');
    });

    it('replaces a US phone (dot format)', () => {
      const { map } = redact('555.123.4567');
      expect(Object.values(map)).toContain('555.123.4567');
    });

    it('replaces a US phone (space format)', () => {
      const { map } = redact('555 123 4567');
      expect(Object.values(map)).toContain('555 123 4567');
    });

    it('replaces a US phone (no separator)', () => {
      const { map } = redact('Phone: 5551234567');
      expect(Object.values(map)).toContain('5551234567');
    });

    it('replaces multiple phones with unique tokens', () => {
      const { redacted } = redact('Home: 555-111-2222, Work: 555-333-4444');
      expect(redacted).toContain('[PHONE_1]');
      expect(redacted).toContain('[PHONE_2]');
    });
  });

  describe('addresses', () => {
    it('replaces a street address with [ADDRESS_1]', () => {
      const { redacted, map } = redact('I live at 123 Main Street today.');
      expect(redacted).toContain('[ADDRESS_1]');
      expect(Object.values(map).some(v => v.includes('123') && /street/i.test(v))).toBe(true);
    });

    it('recognizes ave, blvd, rd, ln, ct keywords', () => {
      const texts = [
        '456 Oak Ave',
        '789 Sunset Blvd',
        '321 River Rd',
        '654 Maple Ln',
        '987 Birch Ct'
      ];
      for (const text of texts) {
        const { map } = redact(text);
        expect(Object.keys(map).length).toBeGreaterThan(0);
      }
    });

    it('replaces multiple addresses with unique tokens', () => {
      const { redacted } = redact('From 100 First St to 200 Second Ave');
      expect(redacted).toContain('[ADDRESS_1]');
      expect(redacted).toContain('[ADDRESS_2]');
    });
  });

  describe('names', () => {
    it('replaces a known first name with [NAME_1]', () => {
      const { redacted, map } = redact('My name is John and I work here.');
      expect(redacted).toContain('[NAME_1]');
      expect(Object.values(map)).toContain('John');
    });

    it('replaces multiple names with unique tokens', () => {
      const { redacted } = redact('John and Sarah are colleagues.');
      const nameTokens = Object.keys(
        (() => { const { map } = redact('John and Sarah are colleagues.'); return map; })()
      ).filter(k => k.startsWith('[NAME_'));
      expect(nameTokens.length).toBeGreaterThanOrEqual(2);
    });

    it('replaces a known last name', () => {
      const { map } = redact('Contact Smith for details.');
      expect(Object.values(map)).toContain('Smith');
    });
  });

  describe('multiple PII types', () => {
    it('redacts email and phone in the same text', () => {
      const text = 'Email: alice@test.com Phone: 555-111-2222';
      const { redacted, map } = redact(text);
      expect(redacted).not.toContain('alice@test.com');
      expect(redacted).not.toContain('555-111-2222');
      expect(Object.keys(map).some(k => k.startsWith('[EMAIL_'))).toBe(true);
      expect(Object.keys(map).some(k => k.startsWith('[PHONE_'))).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('returns empty map for empty string', () => {
      const { redacted, map } = redact('');
      expect(redacted).toBe('');
      expect(map).toEqual({});
    });

    it('returns empty map when no PII present', () => {
      const { redacted, map } = redact('This is a normal sentence with no personal info.');
      expect(redacted).toBe('This is a normal sentence with no personal info.');
      expect(map).toEqual({});
    });

    it('handles null input gracefully', () => {
      expect(() => redact(null)).toThrow();
    });

    it('handles undefined input gracefully', () => {
      expect(() => redact(undefined)).toThrow();
    });

    it('handles non-string input', () => {
      expect(() => redact(42)).toThrow();
    });

    it('generates unique tokens for same-type PII (not reuse)', () => {
      const text = 'a@x.com b@y.com c@z.com';
      const { map } = redact(text);
      const tokens = Object.keys(map).filter(k => k.startsWith('[EMAIL_'));
      expect(tokens).toHaveLength(3);
      expect(new Set(tokens).size).toBe(3);
      expect(tokens).toContain('[EMAIL_1]');
      expect(tokens).toContain('[EMAIL_2]');
      expect(tokens).toContain('[EMAIL_3]');
    });

    it('handles text with special characters', () => {
      const { redacted, map } = redact('Reach out at test+special@domain.co');
      expect(Object.values(map)).toContain('test+special@domain.co');
    });
  });
});

// ─── restore() ───────────────────────────────────────────────────────────────

describe('restore()', () => {
  it('restores a single token', () => {
    const map = { '[EMAIL_1]': 'john@example.com' };
    const restored = restore('Contact [EMAIL_1] please.', map);
    expect(restored).toBe('Contact john@example.com please.');
  });

  it('restores multiple tokens of different types', () => {
    const map = { '[EMAIL_1]': 'a@b.com', '[PHONE_1]': '555-123-4567' };
    const restored = restore('[EMAIL_1] or [PHONE_1]', map);
    expect(restored).toBe('a@b.com or 555-123-4567');
  });

  it('handles missing key gracefully (no-op)', () => {
    const map = { '[EMAIL_1]': 'a@b.com' };
    const restored = restore('[EMAIL_1] and [EMAIL_2]', map);
    expect(restored).toContain('a@b.com');
    expect(restored).toContain('[EMAIL_2]');
  });

  it('round-trip: restore(redact(text).redacted, map) === original text (email)', () => {
    const original = 'Send invoice to billing@company.com';
    const { redacted, map } = redact(original);
    expect(restore(redacted, map)).toBe(original);
  });

  it('round-trip: restore(redact(text).redacted, map) === original text (phone)', () => {
    const original = 'Call us at 555-987-6543';
    const { redacted, map } = redact(original);
    expect(restore(redacted, map)).toBe(original);
  });

  it('round-trip with multiple PII types', () => {
    const original = 'John: john@test.com, 555-111-2222, 100 Oak Ave';
    const { redacted, map } = redact(original);
    const restored = restore(redacted, map);
    expect(restored).toBe(original);
  });

  it('handles empty text', () => {
    expect(restore('', {})).toBe('');
  });

  it('handles empty map', () => {
    expect(restore('No tokens here', {})).toBe('No tokens here');
  });

  it('handles null text gracefully', () => {
    expect(() => restore(null, {})).toThrow();
  });
});
