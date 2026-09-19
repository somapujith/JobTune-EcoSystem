'use strict';

/**
 * Header parity against the REAL helmet package that backend/src/app.js uses.
 * helmet's own middleware is executed against a fake response, so the expected
 * values are whatever the installed helmet actually emits, not a hand-copied list.
 * If helmet is upgraded and its defaults change, this test shows the exact diff.
 *
 * This proves the security-header set matches helmet's defaults. It does not prove
 * the Worker and Render responses are otherwise identical (ADR checklist item 21
 * still needs a real side-by-side comparison).
 */
const helmet = require('helmet');
const { makeHarness } = require('./helpers/harness');

async function helmetHeaders() {
  const headers = new Map([['x-powered-by', 'Express']]); // Express sets this before helmet runs
  const res = {
    setHeader: (k, v) => headers.set(k.toLowerCase(), String(v)),
    removeHeader: (k) => headers.delete(k.toLowerCase()),
    getHeader: (k) => headers.get(k.toLowerCase()),
  };
  await new Promise((resolve, reject) => {
    helmet()({ method: 'GET', headers: {} }, res, (err) => (err ? reject(err) : resolve()));
  });
  return Object.fromEntries(headers);
}

// The only header names the Worker adds beyond helmet's set. content-type is the
// body type; vary / access-control-allow-credentials come from CORS (cors.js), which
// Express also applied before responding.
const NON_SECURITY_EXTRAS = ['content-type', 'vary', 'access-control-allow-credentials'];

const csp = (v) => v.split(/;\s*/).filter(Boolean);

describe('security headers vs helmet 8 defaults', () => {
  let helmetSet;
  let workerSet;

  beforeAll(async () => {
    helmetSet = await helmetHeaders();
    const H = makeHarness();
    const res = await H.request('/api/_t/open');
    workerSet = Object.fromEntries([...res.headers].map(([k, v]) => [k, v]));
  });

  it('helmet emits the header set we expect to reproduce (guards the fixture itself)', () => {
    expect(Object.keys(helmetSet).sort()).toEqual(
      [
        'content-security-policy',
        'cross-origin-opener-policy',
        'cross-origin-resource-policy',
        'origin-agent-cluster',
        'referrer-policy',
        'strict-transport-security',
        'x-content-type-options',
        'x-dns-prefetch-control',
        'x-download-options',
        'x-frame-options',
        'x-permitted-cross-domain-policies',
        'x-xss-protection',
      ].sort()
    );
  });

  it('sends every header helmet sends, with an identical value (CSP compared by directive list)', () => {
    for (const [name, value] of Object.entries(helmetSet)) {
      expect(workerSet).toHaveProperty([name]);
      if (name === 'content-security-policy') {
        expect(csp(workerSet[name])).toEqual(csp(value)); // intended difference 1: "; " vs ";"
      } else {
        expect([name, workerSet[name]]).toEqual([name, value]);
      }
    }
  });

  it('documents the one byte-level difference: CSP directive separator', () => {
    expect(helmetSet['content-security-policy']).not.toContain('; ');
    expect(workerSet['content-security-policy']).toContain('; ');
  });

  it('sends no security header that helmet does not send', () => {
    const extras = Object.keys(workerSet).filter((n) => !(n in helmetSet));
    expect(extras.sort()).toEqual(NON_SECURITY_EXTRAS.filter((n) => extras.includes(n)).sort());
  });

  it('matches helmet on HSTS (Hono defaults to 15552000, we override to 31536000)', () => {
    expect(workerSet['strict-transport-security']).toBe('max-age=31536000; includeSubDomains');
    expect(workerSet['strict-transport-security']).toBe(helmetSet['strict-transport-security']);
  });

  it('does not send COEP or X-Powered-By (helmet default off / removed)', () => {
    expect(workerSet).not.toHaveProperty(['cross-origin-embedder-policy']);
    expect(workerSet).not.toHaveProperty(['x-powered-by']);
    expect(helmetSet).not.toHaveProperty(['cross-origin-embedder-policy']);
    expect(helmetSet).not.toHaveProperty(['x-powered-by']);
  });

  it('applies the headers to error, 404 and preflight responses too', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const H = makeHarness();
    const error = await H.request('/api/_t/boom');
    const notFound = await H.request('/api/nope');
    const preflight = await H.request('/api/_t/open', {
      method: 'OPTIONS',
      headers: { Origin: 'https://app.example.test', 'Access-Control-Request-Method': 'GET' },
    });
    for (const res of [error, notFound, preflight]) {
      expect(res.headers.get('x-frame-options')).toBe('SAMEORIGIN');
      expect(res.headers.get('strict-transport-security')).toBe('max-age=31536000; includeSubDomains');
    }
    console.error.mockRestore();
  });

  it('matches Express finalhandler on the default 404 page: CSP default-src none', async () => {
    const H = makeHarness();
    const res = await H.request('/api/nope');
    expect(res.headers.get('content-security-policy')).toBe("default-src 'none'");
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    // but the rest of helmet's set is still present, as on Express
    expect(res.headers.get('x-frame-options')).toBe('SAMEORIGIN');
  });
});
