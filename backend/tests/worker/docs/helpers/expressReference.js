'use strict';

/**
 * The ORIGINAL Express routers (backend/src/routes/{resume,resumeV2,atsCheckerV2,atsExport}.js and the services they
 * use) running in-process behind a real `express()` + the real multer / body parsers / errorHandler, as the
 * differential reference for the Worker port (tests/worker/docs/parity.test.js).
 *
 * How it stays safe and read-only:
 *   - the Express source files are only READ; each is evaluated with `new Function` and a custom `require`, so nothing
 *     is written and the Express modules are never loaded through the normal require cache.
 *   - modules that touch the outside world are replaced by stubs, keyed by their path under src/:
 *       config/database.js       -> the in-memory fake pool (the real one would read backend/.env and open a pool)
 *       middleware/auth.js       -> a trivial "Bearer express-user-<id>" check that sets req.user
 *       middleware/requirePlan.js-> pass-through (plan gating is asserted separately on the Worker routes)
 *       utils/aiClient.js        -> the shared jest fake
 *     and the loader REFUSES to load anything else under src/config/.
 *   - pdf-parse is the real library but fed a Uint8Array (see pdfParseWithUint8Array below)
 *   - everything else (multer, pdfkit, docx, mammoth, the v2 analyzers, resumeExport, resumeDatabase,
 *     errorHandler) is the real code.
 */
const fs = require('fs');
const path = require('path');
const { createRequire } = require('module');

const SRC = path.resolve(__dirname, '../../../../src');
const nodeRequire = createRequire(path.join(SRC, '..', 'package.json'));

/**
 * pdf-parse@1.1.4 called with a Node Buffer (which is what multer's req.file.buffer is) throws "bad XRef entry" on
 * many pdfkit-generated PDFs in this suite (data-dependent), while the same bytes as a plain Uint8Array parse fine (spike finding 6 of
 * docs/CLOUDFLARE_MIGRATION.md; root cause not established). The Worker must pass a Uint8Array (spike S1), so the
 * Express REFERENCE here does too: it keeps this differential about the route logic, not about that pdf.js defect.
 * The defect itself is pinned separately in parity.test.js ("documented deviation").
 */
const pdfParseWithUint8Array = (data, options) => {
  const realPdfParse = nodeRequire('pdf-parse');
  return realPdfParse(new Uint8Array(data), options);
};

function createLoader(stubs) {
  const cache = new Map();

  function makeRequire(fromFile) {
    return (id) => {
      if (id === 'pdf-parse') return pdfParseWithUint8Array;
      if (!id.startsWith('.')) return nodeRequire(id);
      let resolved = path.resolve(path.dirname(fromFile), id);
      if (fs.existsSync(resolved + '.js')) resolved += '.js';
      else if (fs.existsSync(path.join(resolved, 'index.js'))) resolved = path.join(resolved, 'index.js');
      const key = path.relative(SRC, resolved).replace(/\\/g, '/');
      if (Object.prototype.hasOwnProperty.call(stubs, key)) return stubs[key];
      if (key.startsWith('config/')) throw new Error(`expressReference refuses to load an Express config module: ${key}`);
      return load(resolved);
    };
  }

  function load(file) {
    if (cache.has(file)) return cache.get(file).exports;
    const module = { exports: {} };
    cache.set(file, module);
    const source = fs.readFileSync(file, 'utf8');
    // eslint-disable-next-line no-new-func
    const fn = new Function('exports', 'require', 'module', '__filename', '__dirname', source);
    fn.call(module.exports, module.exports, makeRequire(file), module, file, path.dirname(file));
    return module.exports;
  }

  return { load: (rel) => load(path.join(SRC, rel)) };
}

/**
 * @param {{ pool: {query: Function}, aiClient: object }} deps
 * @returns {Promise<{ base: string, close: () => Promise<void> }>}
 */
async function startExpress({ pool, aiClient }) {
  const stubs = {
    'config/database.js': { pool },
    'middleware/auth.js': {
      authenticateToken: (req, res, next) => {
        const m = /^Bearer express-user-(\d+)$/.exec(req.headers.authorization || '');
        if (!m) return res.status(401).json({ error: 'Unauthorized' });
        req.user = { id: Number(m[1]) };
        return next();
      },
    },
    'middleware/requirePlan.js': { requirePlan: () => (req, res, next) => next() },
    'utils/aiClient.js': aiClient,
  };
  const { load } = createLoader(stubs);
  const express = nodeRequire('express');

  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false, limit: '1mb' }));
  // Express order from app.js: resume, resumeV2, ... atsExport, atsCheckerV2
  app.use('/api/resume', load('routes/resume.js'));
  app.use('/api/resume', load('routes/resumeV2.js'));
  app.use('/api/ats', load('routes/atsExport.js'));
  app.use('/api/ats', load('routes/atsCheckerV2.js'));
  app.use(load('middleware/errorHandler.js').errorHandler);

  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  return {
    base: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

module.exports = { startExpress };
