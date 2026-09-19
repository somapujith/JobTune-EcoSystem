'use strict';

/**
 * The docs slice's mount + registry files, checked against the generated Express manifest
 * (docs/migration/manifest.render.json, ADR-001 6.3): same endpoints, same auth, same minTier, same order.
 */
const fs = require('fs');
const path = require('path');
const { createApp } = require('../../../src/worker/app');
const { createServices, REGISTRY } = require('../../../src/worker/services');
const { listRoutes, listMounts } = require('../../../src/worker/lib/routes');
const { mount } = require('../../../src/worker/routes/mounts/docs');
const registry = require('../../../src/worker/services/registry/docs');
const { createFakeDb, makeEnv } = require('../helpers/harness');
const { createConfig } = require('../../../src/worker/config');

const MANIFEST = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../../../docs/migration/manifest.render.json'), 'utf8'));
const isDocs = (p) => p.startsWith('/api/resume/') || p === '/api/resume' || p.startsWith('/api/ats/');
const isMine = (e) => isDocs(e.path) && !e.path.startsWith('/api/resume-');
const canon = (p) => p.replace(/:[A-Za-z0-9_]+(\{[^}]*\})?/g, ':');

describe('routes/mounts/docs.js', () => {
  const app = createApp();
  mount(app);

  it('mounts the four routers in the Express order (resume, resumeV2, atsExport, atsCheckerV2)', () => {
    expect(listMounts(app).filter((m) => m.prefix !== '/api')).toEqual([
      { prefix: '/api/resume', routes: expect.any(Number) },
      { prefix: '/api/resume', routes: expect.any(Number) },
      { prefix: '/api/ats', routes: expect.any(Number) },
      { prefix: '/api/ats', routes: expect.any(Number) },
    ]);
    const counts = listMounts(app).filter((m) => m.prefix !== '/api').map((m) => m.routes);
    // route entries per router (each handler registered counts once): resume 8 endpoints, resumeV2 5, atsExport 3, atsCheckerV2 1
    expect(counts.length).toBe(4);
  });

  it('introspection matches the Express manifest for these prefixes: endpoints, auth, minTier and order', () => {
    const expected = MANIFEST.endpoints.filter(isMine).sort((a, b) => a.order - b.order);
    const actual = listRoutes(app).filter((r) => isDocs(r.path));

    expect(expected).toHaveLength(17); // 8 + 5 + 3 + 1
    expect(actual).toHaveLength(17);
    expect(actual.every((r) => r.untagged === 0)).toBe(true);

    // registration order == Express order (listRoutes returns terminals in registration order)
    expect(actual.map((r) => `${r.method} ${canon(r.path)}`)).toEqual(expected.map((e) => `${e.method} ${canon(e.path)}`));

    for (const e of expected) {
      const a = actual.find((r) => r.method === e.method && canon(r.path) === canon(e.path));
      expect(a).toBeDefined();
      expect({ id: `${a.method} ${canon(a.path)}`, auth: a.auth, minTier: a.minTier }).toEqual({
        id: `${e.method} ${canon(e.path)}`,
        auth: e.auth,
        minTier: e.minTier === undefined || e.minTier === '' ? null : e.minTier,
      });
    }
  });

  it('exactly the four manifest plan-gated endpoints of this slice are gated, all at tier 2', () => {
    const gated = listRoutes(app).filter((r) => isDocs(r.path) && r.minTier !== null).map((r) => `${r.method} ${r.path} T${r.minTier}`);
    expect(gated.sort()).toEqual([
      'POST /api/ats/v2/parse T2',
      'POST /api/resume/v2/analyze T2',
      'POST /api/resume/v2/export T2',
      'POST /api/resume/v2/feedback T2',
    ]);
    // and none of the routes is public
    expect(listRoutes(app).filter((r) => isDocs(r.path)).every((r) => r.auth)).toBe(true);
  });

  it('is what the aggregate mounts (routes/mounts/index.js) picks up', () => {
    const full = createApp({ mountSlices: true });
    const mine = listRoutes(full).filter((r) => isDocs(r.path));
    expect(mine.length).toBe(17);
  });
});

describe('services/registry/docs.js', () => {
  it('registers exactly the three docs services and they reach the container', () => {
    expect(Object.keys(registry).sort()).toEqual(['resumeDatabase', 'resumeExport', 'resumeExportEngine']);
    for (const name of Object.keys(registry)) expect(REGISTRY[name]).toBe(registry[name]);
  });

  it('builds real services lazily with the request db, once per request', () => {
    const db = createFakeDb();
    const config = createConfig(makeEnv());
    const services = createServices({ db, config });
    expect(services.resumeDatabase).toBe(services.resumeDatabase);
    expect(Object.keys(services.resumeDatabase).sort()).toEqual(
      ['deleteResume', 'getResume', 'getUserResumes', 'saveAnalysis', 'saveExport', 'saveResume', 'updateOptimizedResume']
    );
    expect(Object.keys(services.resumeExport).sort()).toEqual(
      ['buildDocumentParagraphs', 'createSectionHeader', 'generateFilename', 'parseResume', 'toDOCX', 'toTXT']
    );
    expect(Object.keys(services.resumeExportEngine).sort()).toEqual(
      ['_formatPDFContent', 'export', 'exportAsDOCX', 'exportAsPDF', 'exportAsText', 'getFileExtension', 'getMimeType', 'validateExport']
    );
  });

  it('does not construct (or import) anything heavy at load: docLibs is the only path to the doc libraries', () => {
    const src = (f) => fs.readFileSync(path.resolve(__dirname, '../../../src/worker', f), 'utf8');
    for (const f of ['routes/resume.js', 'routes/resumeV2.js', 'routes/atsCheckerV2.js', 'routes/atsExport.js', 'services/resumeExport.js', 'services/v2/resumeExportEngine.js', 'services/docs/pdfParse.js', 'services/docs/docText.js']) {
      expect(src(f)).not.toMatch(/require\(\s*['"](pdfkit|docx|mammoth|pdf-parse|unzipper|xml2js|jszip)['"]\s*\)/);
      expect(src(f)).not.toMatch(/\bimport\(/);
    }
    // the four lazy loaders (comments in that file also mention import(); only `await import(` is code)
    const code = src('services/docs/docLibs.js').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(code.match(/await import\(/g)).toHaveLength(4);
  });
});
