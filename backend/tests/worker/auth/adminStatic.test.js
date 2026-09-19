'use strict';

/**
 * The /admin static page: the inlined string must equal src/public/admin/index.html, and the routes
 * must answer like Express's `app.use('/admin', express.static(...))` (compared against a real
 * express + serve-static instance for status, key headers, redirect body and page body).
 */
const fs = require('fs');
const path = require('path');
const express = require('express');
const request = require('supertest');
const { buildApp } = require('./helpers/authHarness');
const { ADMIN_INDEX_HTML } = require('../../../src/worker/routes/adminPageHtml');
const { listRoutes } = require('../../../src/worker/lib/routes');

const ADMIN_DIR = path.resolve(__dirname, '../../../src/public/admin');
// the working tree may check the file out with CRLF (autocrlf); git and Render hold LF
const lf = (s) => s.replace(/\r\n/g, '\n');

let H;
beforeEach(() => {
  H = buildApp();
});

describe('inlined page', () => {
  it('is byte-identical (LF) to src/public/admin/index.html', () => {
    const onDisk = lf(fs.readFileSync(path.join(ADMIN_DIR, 'index.html'), 'utf8'));
    expect(ADMIN_INDEX_HTML).toBe(onDisk);
    expect(ADMIN_INDEX_HTML.length).toBeGreaterThan(10000);
    expect(ADMIN_INDEX_HTML.startsWith('<!DOCTYPE html>')).toBe(true);
  });

  it('is the only file in the Express static directory (nothing else to serve)', () => {
    expect(fs.readdirSync(ADMIN_DIR)).toEqual(['index.html']);
  });
});

describe('Worker /admin routes', () => {
  it('GET /admin/ -> 200 text/html with the page, no auth required', async () => {
    const res = await H.request('/admin/');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/html; charset=utf-8');
    expect(res.headers.get('cache-control')).toBe('public, max-age=0');
    expect(await res.text()).toBe(ADMIN_INDEX_HTML);
  });

  it('GET /admin/index.html -> the same page', async () => {
    const res = await H.request('/admin/index.html');
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(ADMIN_INDEX_HTML);
  });

  it('GET /admin -> 301 to /admin/ (query string kept), with the serve-static redirect body and headers', async () => {
    const res = await H.request('/admin?tab=users');
    expect(res.status).toBe(301);
    expect(res.headers.get('location')).toBe('/admin/?tab=users');
    expect(res.headers.get('content-type')).toBe('text/html; charset=UTF-8');
    expect(res.headers.get('content-security-policy')).toBe("default-src 'none'");
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(await res.text()).toContain('<pre>Redirecting to /admin/?tab=users</pre>');
  });

  it('global security headers (helmet equivalent) are applied to the page, like helmet in front of express.static', async () => {
    const res = await H.request('/admin/');
    expect(res.headers.get('x-frame-options')).toBe('SAMEORIGIN');
    expect(res.headers.get('content-security-policy')).toContain("default-src 'self'");
  });

  it('HEAD works and has no body; other methods and other paths fall through to the default 404', async () => {
    const head = await H.request('/admin/', { method: 'HEAD' });
    expect(head.status).toBe(200);
    expect(await head.text()).toBe('');
    expect((await H.request('/admin/', { method: 'POST' })).status).toBe(404);
    const missing = await H.request('/admin/app.js');
    expect(missing.status).toBe(404);
    expect(await missing.text()).toContain('Cannot GET /admin/app.js');
  });

  it('is introspectable: two public GET routes, no auth, no plan', () => {
    const routes = listRoutes(H.app).filter((r) => r.path === '/admin' || r.path.startsWith('/admin/'));
    expect(routes.map((r) => `${r.method} ${r.path}`).sort()).toEqual(['GET /admin', 'GET /admin/index.html']);
    expect(routes.every((r) => r.auth === false && r.minTier === null && r.untagged === 0)).toBe(true);
  });
});

describe('parity with express.static (real serve-static)', () => {
  const expressApp = express();
  expressApp.use('/admin', express.static(ADMIN_DIR));

  it.each([['/admin/'], ['/admin/index.html'], ['/admin'], ['/admin?x=1'], ['/admin/nope.js']])('GET %s: same status, redirect location and content type', async (url) => {
    const ex = await request(expressApp).get(url).redirects(0);
    const wk = await H.request(url);
    expect(wk.status).toBe(ex.status);
    if (ex.headers.location) expect(wk.headers.get('location')).toBe(ex.headers.location);
    if (ex.status === 200 || ex.status === 301) {
      expect(wk.headers.get('content-type')).toBe(ex.headers['content-type']);
    }
    if (ex.status === 200) {
      expect(lf(await wk.text())).toBe(lf(ex.text));
    }
    if (ex.status === 301) {
      expect(await wk.text()).toBe(ex.text);
      expect(wk.headers.get('content-security-policy')).toBe(ex.headers['content-security-policy']);
      expect(wk.headers.get('x-content-type-options')).toBe(ex.headers['x-content-type-options']);
    }
  });
});
