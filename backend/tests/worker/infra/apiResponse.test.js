'use strict';

/**
 * services/apiResponse.js: same helpers and same bodies/status codes as utils/apiResponse.js, but on a Hono
 * context. Checked two ways: through a real Hono app, and differentially against the original helpers
 * driven with a recording fake of the Express `res`.
 */
const { Hono } = require('hono');
const apiResponse = require('../../../src/worker/services/apiResponse');
const original = require('../../../src/utils/apiResponse');

/** Recording stand-in for an Express response. */
function fakeRes() {
  const res = { statusCode: 200, body: undefined };
  res.status = (n) => { res.statusCode = n; return res; };
  res.json = (b) => { res.body = b; return res; };
  return res;
}

async function viaHono(fn) {
  const app = new Hono();
  app.get('/t', (c) => fn(c));
  const res = await app.request('/t');
  return { status: res.status, body: await res.json(), contentType: res.headers.get('content-type') };
}

const cases = [
  ['ok(data)', 'ok', ['payload']],
  ['ok(data, meta)', 'ok', [{ a: 1 }, { page: 2 }]],
  ['ok(data, null meta)', 'ok', [[1, 2], null]],
  ['ok(data, falsy meta 0)', 'ok', ['x', 0]],
  ['fail string', 'fail', [418, 'teapot']],
  ['fail Error', 'fail', [422, new Error('bad shape')]],
  ['badRequest', 'badRequest', ['company is required']],
  ['badRequest Error', 'badRequest', [new Error('nope')]],
  ['unauthorized default', 'unauthorized', []],
  ['unauthorized custom', 'unauthorized', ['who are you']],
  ['forbidden default', 'forbidden', []],
  ['forbidden custom', 'forbidden', ['not yours']],
  ['notFound default', 'notFound', []],
  ['notFound custom', 'notFound', ['no such job']],
  ['serverError default', 'serverError', []],
  ['serverError Error', 'serverError', [new Error('db down')]],
];

describe('services/apiResponse', () => {
  beforeEach(() => jest.spyOn(console, 'error').mockImplementation(() => {}));
  afterEach(() => jest.restoreAllMocks());

  it('exports exactly the same helper names as the original', () => {
    expect(Object.keys(apiResponse).sort()).toEqual(Object.keys(original).sort());
  });

  it.each(cases)('%s: same status and body as the Express helper', async (_label, fn, args) => {
    const res = fakeRes();
    original[fn](res, ...args);
    const ported = await viaHono((c) => apiResponse[fn](c, ...args));
    expect(ported.status).toBe(res.statusCode);
    expect(ported.body).toEqual(JSON.parse(JSON.stringify(res.body)));
    expect(ported.contentType).toMatch(/^application\/json/);
  });

  it('shapes: ok omits meta unless truthy; fail carries success:false and the message', async () => {
    expect((await viaHono((c) => apiResponse.ok(c, { id: 1 }))).body).toEqual({ success: true, data: { id: 1 } });
    expect((await viaHono((c) => apiResponse.ok(c, [], { total: 0 }))).body).toEqual({ success: true, data: [], meta: { total: 0 } });
    const failed = await viaHono((c) => apiResponse.notFound(c));
    expect(failed).toMatchObject({ status: 404, body: { success: false, error: 'Not found' } });
  });

  it('serverError logs like the original and returns the message (no masking in this envelope)', async () => {
    const boom = new Error('secret detail');
    const out = await viaHono((c) => apiResponse.serverError(c, boom));
    expect(out).toMatchObject({ status: 500, body: { success: false, error: 'secret detail' } });
    expect(console.error).toHaveBeenCalledWith('Server error:', boom);
  });
});
