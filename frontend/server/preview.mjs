/**
 * Local SSR preview — mirrors production Express behavior without rebuilding the backend.
 * Usage: npm run build && npm run preview:ssr
 */
import fs from 'fs';
import path from 'path';
import express from 'express';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CLIENT_DIR = path.join(ROOT, 'dist/client');
const SERVER_ENTRY = path.join(ROOT, 'dist/server/entry-server.js');
const API_PROXY = process.env.VITE_API_PROXY || 'http://localhost:5000';

let template = fs.readFileSync(path.join(CLIENT_DIR, 'index.html'), 'utf-8');
const { render, getRenderStrategy, buildHeadTags } = await import(pathToFileURL(SERVER_ENTRY).href);

function injectHead(html, head) {
  if (html.includes('<!--ssr-head-->')) return html.replace('<!--ssr-head-->', head);
  return html.replace('</head>', `${head}\n  </head>`);
}

function injectRoot(html, content, ssr) {
  const root = `<div id="root" data-ssr="${ssr ? 'true' : 'false'}">${content}</div>`;
  if (html.includes('<!--ssr-outlet-->')) {
    return html.replace(/<div id="root"[^>]*><!--ssr-outlet--><\/div>/, root);
  }
  return html.replace(/<div id="root"[^>]*>[\s\S]*?<\/div>/, root);
}

const app = express();
app.use(express.static(CLIENT_DIR, { index: false }));

app.use('/api', async (req, res) => {
  const url = `${API_PROXY}${req.originalUrl}`;
  const response = await fetch(url, {
    method: req.method,
    headers: { ...req.headers, host: new URL(API_PROXY).host },
    body: req.method !== 'GET' && req.method !== 'HEAD' ? req : undefined,
  });
  res.status(response.status);
  response.headers.forEach((v, k) => res.setHeader(k, v));
  res.send(Buffer.from(await response.arrayBuffer()));
});

app.use(async (req, res) => {
  const strategy = getRenderStrategy(req.path);
  if (strategy === 'ssr') {
    const { html, head } = render(req.originalUrl);
    let doc = injectHead(template, head);
    doc = injectRoot(doc, html, true);
    res.type('html').send(doc);
    return;
  }
  let doc = injectHead(template, buildHeadTags(req.path));
  doc = injectRoot(doc, '', false);
  res.type('html').send(doc);
});

const PORT = process.env.PORT || 4173;
app.listen(PORT, () => {
  console.log(`SSR preview at http://localhost:${PORT}`);
  console.log(`API proxied to ${API_PROXY}`);
});
