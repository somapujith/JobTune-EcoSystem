import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { render, getRenderStrategy, buildHeadTags } from '../dist/server/entry-server.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const template = fs.readFileSync(path.join(ROOT, 'dist/client/index.html'), 'utf-8');

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

export default function handler(req, res) {
  const strategy = getRenderStrategy(req.url);
  if (strategy === 'ssr') {
    const { html, head } = render(req.url);
    let doc = injectHead(template, head);
    doc = injectRoot(doc, html, true);
    res.setHeader('Content-Type', 'text/html');
    res.status(200).send(doc);
    return;
  }
  let doc = injectHead(template, buildHeadTags(req.url));
  doc = injectRoot(doc, '', false);
  res.setHeader('Content-Type', 'text/html');
  res.status(200).send(doc);
}
