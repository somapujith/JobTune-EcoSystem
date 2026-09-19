'use strict';

/**
 * Urlencoded body / query-string parsing. Regression for a security review finding: repeated keys were appended by
 * copying the whole array each time (O(n^2)), so an anonymous 313 KB body (`a=1&a=1&...`) burned ~17 s of CPU in the
 * global body parser, before routing or auth. Also restores Express's limits: body-parser's parameterLimit (413 above
 * 1000 pairs) and querystring's maxKeys (query strings truncate at 1000 pairs).
 */
const querystring = require('querystring');
const { parseFormEncoded, MAX_FORM_PAIRS } = require('../../src/worker/lib/http');
const { makeHarness } = require('./helpers/harness');

const repeat = (pair, n) => Array.from({ length: n }, () => pair).join('&');

describe('parseFormEncoded', () => {
  it('is linear: 300,000 repeated pairs parse quickly (the old array-copy version needed > 20 s)', () => {
    const params = new URLSearchParams(repeat('a=1', 300000));
    const t0 = Date.now();
    const out = parseFormEncoded(params, Infinity);
    expect(Date.now() - t0).toBeLessThan(2000);
    expect(out.a).toHaveLength(300000);
  });

  it.each([
    'a=1',
    'a=1&a=2',
    'a=1&b=2&a=3&a=4&b=5',
    'x=&y&z=%20w&x=1',
    'a=1&a=2&a=3',
    'k=v&k=&k=v2',
    '',
  ])('matches node:querystring (Express) for %j', (qs) => {
    expect(parseFormEncoded(new URLSearchParams(qs))).toEqual(querystring.parse(qs));
  });

  it('truncates at 1000 pairs like querystring.parse (default maxKeys)', () => {
    const qs = repeat('a=1', 5000);
    const ours = parseFormEncoded(new URLSearchParams(qs));
    expect(ours.a).toHaveLength(MAX_FORM_PAIRS);
    expect(ours).toEqual(querystring.parse(qs));
    const distinct = Array.from({ length: 1500 }, (_, i) => `k${i}=v`).join('&');
    expect(Object.keys(parseFormEncoded(new URLSearchParams(distinct)))).toHaveLength(MAX_FORM_PAIRS);
  });

  it('returns a null-prototype object (a "__proto__" key cannot pollute)', () => {
    const out = parseFormEncoded(new URLSearchParams('__proto__=x&constructor=y'));
    expect(Object.getPrototypeOf(out)).toBeNull();
    expect(out.__proto__).toBe('x');
    expect({}.x).toBeUndefined();
  });
});

describe('urlencoded request bodies (global bodyParser)', () => {
  const post = (H, body) =>
    H.request('/api/_t/echo', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body });

  it('accepts exactly 1000 pairs', async () => {
    const H = makeHarness();
    const res = await post(H, repeat('a=1', 1000));
    expect(res.status).toBe(200);
    expect((await res.json()).body.a).toHaveLength(1000);
  });

  it('rejects 1001 pairs with body-parser\'s 413 "too many parameters"', async () => {
    const H = makeHarness();
    const res = await post(H, repeat('a=1', 1001));
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: 'too many parameters' });
  });

  it('a 1 MB body of repeated pairs is rejected fast (no CPU amplification), even on a path that does not exist', async () => {
    const H = makeHarness();
    const body = repeat('a=1', 262143); // ~1 MB
    const t0 = Date.now();
    const res = await H.request('/api/does-not-exist', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
    });
    expect(res.status).toBe(413);
    expect(Date.now() - t0).toBeLessThan(1500);
  });

  it('JSON bodies are unaffected by the pair limit', async () => {
    const H = makeHarness();
    const res = await H.request('/api/_t/echo', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ list: Array.from({ length: 5000 }, (_, i) => i) }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).body.list).toHaveLength(5000);
  });
});
