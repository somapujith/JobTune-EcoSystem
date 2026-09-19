'use strict';

/**
 * Static guard over the Worker source tree (src/worker/** and src/worker-entry.js).
 * These are the ADR-001 invariants ("no module reads ambient process state, no fs,
 * no req.ip, no schema bootstrap") enforced mechanically, not by review. The raw text
 * is scanned, comments included, so do not write the forbidden tokens even in comments.
 *
 * This is a source-text check. The authoritative version of the schema-bootstrap rule
 * is the grep of the BUILT bundle (ADR checklist item 19), done in the T1.7 build check.
 */
const fs = require('fs');
const path = require('path');

const SRC = path.resolve(__dirname, '../../src');
const WORKER_DIR = path.join(SRC, 'worker');

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : [p];
  });
}

const files = [...walk(WORKER_DIR).filter((f) => f.endsWith('.js')), path.join(SRC, 'worker-entry.js')];
const rel = (f) => path.relative(SRC, f).replace(/\\/g, '/');

const FORBIDDEN = [
  ['ambient env access', /process\.env/],
  ['process exit', /process\.exit/],
  ['fs require', /require\(\s*['"](?:node:)?fs(?:\/promises)?['"]\s*\)/],
  ['fs import', /from\s+['"](?:node:)?fs(?:\/promises)?['"]/],
  ['request ip property', /\breq\.ip\b/],
  ['request connection property', /\breq\.connection\b/],
  // bare Express `req.x` / `res.x`; Hono's `c.req.query()` / `c.res.status` are preceded by "." and allowed
  ['express-style req/res', /(?<![.\w])(?:req|res)\.(?:status|json|send|setHeader|headers|body|params|query)\b/],
  ['schema bootstrap', /ensureTables|initializeTables|runMigrations/],
  ['express', /require\(\s*['"]express['"]\s*\)/],
  ['express-rate-limit', /express-rate-limit/],
  ['native bcrypt', /require\(\s*['"]bcrypt['"]\s*\)/],
  ['node-postgres pool', /require\(\s*['"]pg['"]\s*\)/],
  ['express-era db module', /config\/database['"]/],
  ['dotenv', /dotenv/],
];

describe('src/worker source-tree invariants', () => {
  it('finds the worker files (guard against scanning nothing)', () => {
    expect(files.length).toBeGreaterThan(15);
    expect(files.map(rel)).toEqual(
      expect.arrayContaining([
        'worker/app.js',
        'worker/config.js',
        'worker/db.js',
        'worker/middleware/auth.js',
        'worker/middleware/requirePlan.js',
        'worker/middleware/auditLogger.js',
        'worker/services/sessionService.js',
        'worker/services/planService.js',
        'worker-entry.js',
      ])
    );
  });

  // routes/_example.js quotes the Express originals in comments on purpose (it is the porting
  // guide); it is exempt from the Express-idiom scan only, never from the process/fs/ip/bootstrap rules.
  const EXPRESS_IDIOM_EXEMPT = ['worker/routes/_example.js'];

  it.each(FORBIDDEN)('contains no %s', (label, pattern) => {
    const offenders = files
      .filter((f) => !(label === 'express-style req/res' && EXPRESS_IDIOM_EXEMPT.includes(rel(f))))
      .map((f) => ({ f, lines: fs.readFileSync(f, 'utf8').split('\n') }))
      .flatMap(({ f, lines }) =>
        lines.map((line, i) => (pattern.test(line) ? `${rel(f)}:${i + 1}: ${line.trim()}` : null)).filter(Boolean)
      );
    expect(offenders).toEqual([]);
  });

  it('keeps third-party crypto libraries behind their single seam file', () => {
    const uses = (needle) =>
      files.filter((f) => new RegExp(`require\\(\\s*['"]${needle}['"]\\s*\\)`).test(fs.readFileSync(f, 'utf8'))).map(rel);
    expect(uses('jsonwebtoken')).toEqual(['worker/lib/jwt.js']);
    expect(uses('bcryptjs')).toEqual(['worker/lib/password.js']);
  });

  it('only db.js touches the Neon driver config', () => {
    const uses = files
      .filter((f) => /config\/database\.worker/.test(fs.readFileSync(f, 'utf8')))
      .map(rel);
    expect(uses).toEqual(['worker/db.js']);
  });

  it('never imports the Express-side modules it was ported from (parallel copy, Render untouched)', () => {
    const allowedOutside = new Set([path.join(SRC, 'config', 'database.worker.js')]);
    // Static read-only data (src/data/*.json) is imported, not copied: one source of truth, no logic,
    // bundled at build time (ADR-001 2.3 prescribes exactly this for onetLoader). JSON files only.
    const DATA_DIR = path.join(SRC, 'data') + path.sep;
    const isStaticData = (p) => p.startsWith(DATA_DIR) && p.endsWith('.json');
    const offenders = [];
    for (const f of files) {
      const text = fs.readFileSync(f, 'utf8');
      for (const m of text.matchAll(/(?:require\(\s*|from\s+|import\s+)['"](\.{1,2}\/[^'"]*)['"]/g)) {
        const target = path.resolve(path.dirname(f), m[1]);
        const inWorker = target.startsWith(WORKER_DIR + path.sep) || target === WORKER_DIR;
        const resolved = fs.existsSync(target + '.js') ? target + '.js' : target;
        if (!inWorker && !allowedOutside.has(resolved) && !isStaticData(resolved)) {
          offenders.push(`${rel(f)} -> ${m[1]}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
