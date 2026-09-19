'use strict';

/**
 * Local http.createServer mock used by the Phase 4 verification-script tests. Nothing here leaves the machine:
 * servers listen on 127.0.0.1 with an OS-assigned port and are closed by the tests.
 */
const http = require('http');

/**
 * @param {(req, body: Buffer, res) => boolean|void} handler  return true when it has answered; otherwise 404 JSON
 * @returns {Promise<{url: string, port: number, requests: object[], close: () => Promise<void>, setHandler: Function}>}
 */
function startMock(handler) {
  const requests = [];
  let current = handler;
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const body = Buffer.concat(chunks);
      const rec = { method: req.method, url: req.url, path: req.url.split('?')[0], headers: req.headers, body };
      try { rec.json = body.length ? JSON.parse(body.toString('utf8')) : undefined; } catch (e) { rec.json = undefined; }
      requests.push(rec);
      let answered = false;
      try { answered = current(rec, body, res) === true; } catch (e) { res.writeHead(500); res.end(String(e)); return; }
      if (!answered && !res.writableEnded) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'mock: not found' })); }
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      resolve({
        url: `http://127.0.0.1:${port}`,
        port,
        requests,
        setHandler(h) { current = h; },
        close: () => new Promise((r) => { server.closeAllConnections && server.closeAllConnections(); server.close(() => r()); }),
      });
    });
  });
}

/** Answer with JSON. */
function json(res, status, body, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...headers });
  res.end(JSON.stringify(body));
  return true;
}

/** Route table helper: routes = { 'GET /api/x': (rec, res) => true|json(...) } */
function router(routes) {
  return (rec, _body, res) => {
    const fn = routes[`${rec.method} ${rec.path}`];
    return fn ? fn(rec, res) : false;
  };
}

/** Minimal io object for main(argv, io): captures output, fake env, no sleeping. */
function makeIo(env = {}) {
  const out = [];
  const err = [];
  return {
    env,
    log: (s = '') => out.push(String(s)),
    err: (s = '') => err.push(String(s)),
    sleepImpl: async () => {},
    out,
    errs: err,
    text: () => out.join('\n'),
    errText: () => err.join('\n'),
  };
}

module.exports = { startMock, json, router, makeIo };
