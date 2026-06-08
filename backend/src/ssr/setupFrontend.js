const fs = require('fs');
const path = require('path');
const express = require('express');
const { pathToFileURL } = require('url');

const CLIENT_DIR = path.resolve(__dirname, '../../../frontend/dist/client');
const SERVER_ENTRY = path.resolve(__dirname, '../../../frontend/dist/server/entry-server.js');

let cachedTemplate = null;
let serverRenderer = null;

function getTemplate() {
  if (cachedTemplate) return cachedTemplate;
  const indexPath = path.join(CLIENT_DIR, 'index.html');
  cachedTemplate = fs.readFileSync(indexPath, 'utf-8');
  return cachedTemplate;
}

async function loadServerRenderer() {
  if (serverRenderer) return serverRenderer;
  if (!fs.existsSync(SERVER_ENTRY)) {
    console.warn('[SSR] Server bundle missing. Run: cd frontend && npm run build');
    return null;
  }
  serverRenderer = await import(pathToFileURL(SERVER_ENTRY).href);
  return serverRenderer;
}

function injectHead(template, headHtml) {
  if (!headHtml) return template;

  let doc = template;
  if (doc.includes('<!--ssr-head-->')) {
    doc = doc.replace('<!--ssr-head-->', headHtml);
    const anchor = doc.indexOf(headHtml);
    if (anchor !== -1) {
      const tail = doc.slice(anchor + headHtml.length);
      const cleanedTail = tail
        .replace(/^\s*<title>[^<]*<\/title>/, '')
        .replace(/^\s*<meta name="description"[^>]*>/, '');
      doc = doc.slice(0, anchor + headHtml.length) + cleanedTail;
    }
    return doc;
  }

  return doc.replace('</head>', `${headHtml}\n  </head>`);
}

function injectRoot(template, html, ssr) {
  const rootHtml = `<div id="root" data-ssr="${ssr ? 'true' : 'false'}">${html}</div>`;

  if (template.includes('<!--ssr-outlet-->')) {
    return template.replace(/<div id="root"[^>]*><!--ssr-outlet--><\/div>/, rootHtml);
  }

  return template.replace(/<div id="root"[^>]*>[\s\S]*?<\/div>/, rootHtml);
}

function renderDocument({ html = '', head = '', ssr = false }) {
  let doc = getTemplate();
  doc = injectHead(doc, head);
  doc = injectRoot(doc, html, ssr);
  return doc;
}

function setupFrontend(app) {
  const indexPath = path.join(CLIENT_DIR, 'index.html');
  if (!fs.existsSync(indexPath)) {
    console.warn('[SSR] Frontend build not found at', CLIENT_DIR);
    console.warn('[SSR] API-only mode. Build frontend to enable SSR/CSR serving.');
    return false;
  }

  console.log('[SSR] Serving frontend from', CLIENT_DIR);

  app.use(express.static(CLIENT_DIR, { index: false }));

  app.use(async (req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    if (req.path.startsWith('/api') || req.path.startsWith('/admin')) return next();

    try {
      const renderer = await loadServerRenderer();
      const strategy = renderer?.getRenderStrategy
        ? renderer.getRenderStrategy(req.path)
        : 'csr';

      if (strategy === 'ssr' && renderer?.render) {
        const { html, head } = renderer.render(req.originalUrl);
        res
          .status(200)
          .set({ 'Content-Type': 'text/html; charset=utf-8' })
          .send(renderDocument({ html, head, ssr: true }));
        return;
      }

      // CSR: ship the SPA shell; client bundle mounts the authenticated app
      const head = renderer?.buildHeadTags ? renderer.buildHeadTags(req.path) : '';
      res
        .status(200)
        .set({ 'Content-Type': 'text/html; charset=utf-8' })
        .send(renderDocument({ html: '', head, ssr: false }));
    } catch (err) {
      console.error('[SSR] Render failed:', err);
      next(err);
    }
  });

  return true;
}

module.exports = { setupFrontend, renderDocument };
