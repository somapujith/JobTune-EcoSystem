'use strict';

/**
 * The /admin UI page.   (wave 3H, ADR-001 section 7)
 *
 * Express: `app.use('/admin', express.static(path.join(__dirname, 'public/admin')))` served the single
 * file src/public/admin/index.html. A Worker cannot read files, so the page is inlined as a string
 * (routes/adminPageHtml.js, byte-for-byte equal to that file, asserted by a test) and served here:
 *
 *   GET  /admin             -> 301 to /admin/ (what serve-static does for a directory without the slash;
 *                              same redirect body and headers; a query string is kept)
 *   GET  /admin/            -> 200 text/html, the page
 *   GET  /admin/index.html  -> 200 text/html, the page
 *   any other /admin/<x>    -> unmatched: the default Express-style 404 (only one file existed)
 *   HEAD works for all of the above (Hono answers HEAD from the GET handler without a body).
 *
 * No authentication, exactly like Express: the page is a static shell, the data calls it makes go to
 * the admin-guarded /api/admin endpoints. Mounted at '/admin' by routes/mounts/auth.js.
 *
 * Not replicated (headers only, no client-visible behaviour): serve-static's ETag, Last-Modified and
 * Accept-Ranges, and 304 conditional responses. The response carries Cache-Control: public, max-age=0
 * and Content-Type: text/html; charset=utf-8 like serve-static (its redirect page uses charset=UTF-8). The global securityHeaders middleware
 * still applies helmet's header set (including its CSP) exactly as helmet did in front of express.static.
 */
const { createRouter } = require('../lib/routes');
const { ADMIN_INDEX_HTML } = require('./adminPageHtml');

const router = createRouter();

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function page() {
  return new Response(ADMIN_INDEX_HTML, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=0',
    },
  });
}

// serve-static's directory redirect: /admin -> /admin/ (301, text/html, CSP default-src 'none', nosniff)
function redirectToSlash(c) {
  const url = new URL(c.req.url);
  const location = `${url.pathname}/${url.search}`;
  const body =
    '<!DOCTYPE html>\n' +
    '<html lang="en">\n' +
    '<head>\n' +
    '<meta charset="utf-8">\n' +
    '<title>Redirecting</title>\n' +
    '</head>\n' +
    '<body>\n' +
    '<pre>Redirecting to ' + escapeHtml(location) + '</pre>\n' +
    '</body>\n' +
    '</html>\n';

  c.set('finalHandlerResponse', true); // securityHeaders re-applies CSP default-src 'none' + nosniff
  return new Response(body, {
    status: 301,
    headers: {
      'Content-Type': 'text/html; charset=UTF-8',
      'Content-Security-Policy': "default-src 'none'",
      'X-Content-Type-Options': 'nosniff',
      Location: location,
    },
  });
}

// '/' matches both /admin and /admin/ (non-strict routing); the URL tells them apart.
router.get('/', (c) => (new URL(c.req.url).pathname.endsWith('/') ? page() : redirectToSlash(c)));
router.get('/index.html', () => page());

module.exports = router;
