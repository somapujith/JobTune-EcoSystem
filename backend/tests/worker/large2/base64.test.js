'use strict';

/**
 * routes/profiles.js replaces Buffer.from(content, 'base64').toString('utf8') (Node-only global) with
 * decodeBase64Utf8 (atob + TextDecoder, both available in workerd). This fuzzes the replacement against
 * Node's Buffer over valid, wrapped, junk-laden, truncated and invalid-UTF-8 inputs: they must agree exactly.
 */
const crypto = require('crypto');
const { decodeBase64Utf8 } = require('../../../src/worker/routes/profiles');

const viaBuffer = (s) => Buffer.from(s, 'base64').toString('utf8');

describe('decodeBase64Utf8 vs Buffer', () => {
  it('is exposed for tests only and is not an enumerable router property', () => {
    expect(typeof decodeBase64Utf8).toBe('function');
    expect(Object.keys(require('../../../src/worker/routes/profiles'))).not.toContain('decodeBase64Utf8');
  });

  it.each([
    ['plain', 'aGVsbG8gd29ybGQ='],
    ['GitHub-style wrapped lines', 'aGVsbG8g\nd29ybGQ=\n'],
    ['no padding', 'aGVsbG8gd29ybGQ'],
    ['junk char in the middle', 'aGVs$bG8='],
    ['padding in the middle stops decoding', 'aGVs=bG8='],
    ['url-safe alphabet', 'aGVsbG8-_w=='],
    ['a single dangling sextet', 'a'],
    ['second padded group is ignored', 'YQ==YQ=='],
    ['surrounding whitespace', '  aGVsbG8= \n'],
    ['leading BOM is kept', '77u/aGk='],
    ['empty', ''],
    ['unicode', Buffer.from('Café ✓ 中文 😀', 'utf8').toString('base64')],
    ['invalid utf-8 bytes', Buffer.from([0x41, 0xff, 0xfe, 0xc3, 0x28, 0xe2, 0x82]).toString('base64')],
  ])('%s', (_label, input) => {
    expect(decodeBase64Utf8(input)).toBe(viaBuffer(input));
  });

  it('agrees with Buffer on 20,000 random inputs (random bytes, wrapping, injected junk, truncation)', () => {
    let mismatches = 0;
    let first = null;
    for (let i = 0; i < 20000; i += 1) {
      const bytes = crypto.randomBytes(Math.floor(Math.random() * 90));
      let s = bytes.toString('base64');
      if (i % 3 === 0) s = s.replace(/(.{60})/g, '$1\n');
      if (i % 7 === 0 && s.length > 5) {
        const p = Math.floor(Math.random() * s.length);
        s = s.slice(0, p) + ['$', '!', ' ', '\n', '-', '_', '=', 'é'][i % 8] + s.slice(p);
      }
      if (i % 11 === 0) s = s.slice(0, Math.max(0, s.length - 1 - (i % 3)));
      if (decodeBase64Utf8(s) !== viaBuffer(s)) {
        mismatches += 1;
        if (!first) first = s;
      }
    }
    expect({ mismatches, first }).toEqual({ mismatches: 0, first: null });
  });

  it('non-string input throws (the caller catches it, as it caught a bad Buffer.from argument)', () => {
    expect(() => decodeBase64Utf8(12345)).toThrow(TypeError);
    expect(() => decodeBase64Utf8(undefined)).toThrow(TypeError);
    expect(() => decodeBase64Utf8(null)).toThrow(TypeError);
    expect(() => Buffer.from(12345, 'base64')).toThrow(/first argument must be/); // what Express did
  });
});
