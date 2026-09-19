'use strict';

/**
 * The ADR-001 source-tree invariants of tests/worker/sourceTree.test.js (no ambient env, no process exit,
 * no fs, no Express idioms, no schema bootstrap, no pool/express/bcrypt imports), applied to the mid2 files
 * only, so this slice can be checked on its own. Same patterns, same raw-text scan (comments included).
 *
 * Same import rule as the shared lint: nothing outside src/worker except literal requires of static
 * src/data/*.json files (routes/learningModules.js bundles src/data/modules.json and questions.json; data, not
 * Express modules). Here that rule is additionally pinned to exactly those two files.
 */
const fs = require('fs');
const path = require('path');

const SRC = path.resolve(__dirname, '../../../src');
const WORKER_DIR = path.join(SRC, 'worker');
const DATA_DIR = path.join(SRC, 'data');

const FILES = [
  'worker/routes/skills.js',
  'worker/routes/dashboard.js',
  'worker/routes/learningModules.js',
  'worker/routes/aiTutor.js',
  'worker/routes/studyTools.js',
  'worker/services/tutorHistoryService.js',
  'worker/services/registry/mid2.js',
  'worker/routes/mounts/mid2.js',
].map((f) => path.join(SRC, f));

const rel = (f) => path.relative(SRC, f).replace(/\\/g, '/');

const FORBIDDEN = [
  ['ambient env access', /process\.env/],
  ['process exit', /process\.exit/],
  ['fs require', /require\(\s*['"](?:node:)?fs(?:\/promises)?['"]\s*\)/],
  ['fs import', /from\s+['"](?:node:)?fs(?:\/promises)?['"]/],
  ['path require', /require\(\s*['"](?:node:)?path['"]\s*\)/],
  ['request ip property', /\breq\.ip\b/],
  ['request connection property', /\breq\.connection\b/],
  ['express-style req/res', /(?<![.\w])(?:req|res)\.(?:status|json|send|setHeader|headers|body|params|query)\b/],
  ['schema bootstrap', /ensureTables|initializeTables|runMigrations/],
  ['express', /require\(\s*['"]express['"]\s*\)/],
  ['express-rate-limit', /express-rate-limit/],
  ['native bcrypt', /require\(\s*['"]bcrypt['"]\s*\)/],
  ['node-postgres pool', /require\(\s*['"]pg['"]\s*\)/],
  ['express-era db module', /config\/database['"]/],
  ['dotenv', /dotenv/],
  ['module-scope timers', /\bset(?:Timeout|Interval)\s*\(/],
  ['dynamic require (non-literal argument)', /\brequire\(\s*(?!['"])/],
  ['dynamic import()', /\bimport\s*\(/],
];

describe('mid2 source-tree invariants', () => {
  it('finds all of the slice\'s files', () => {
    for (const f of FILES) expect(fs.existsSync(f)).toBe(true);
  });

  it.each(FORBIDDEN)('contains no %s', (label, pattern) => {
    const offenders = FILES.flatMap((f) =>
      fs
        .readFileSync(f, 'utf8')
        .split('\n')
        .map((line, i) => (pattern.test(line) ? `${rel(f)}:${i + 1}: ${line.trim().slice(0, 140)}` : null))
        .filter(Boolean)
    );
    expect(offenders).toEqual([]);
  });

  it('imports only worker modules, plus literal requires of src/data/*.json', () => {
    const offenders = [];
    const dataImports = [];
    for (const f of FILES) {
      const text = fs.readFileSync(f, 'utf8');
      for (const m of text.matchAll(/(?:require\(\s*|from\s+|import\s+)['"](\.{1,2}\/[^'"]*)['"]/g)) {
        const target = path.resolve(path.dirname(f), m[1]);
        const inWorker = target.startsWith(WORKER_DIR + path.sep);
        const isData = target.startsWith(DATA_DIR + path.sep) && target.endsWith('.json') && fs.existsSync(target);
        if (isData) dataImports.push(`${rel(f)} -> ${m[1]}`);
        else if (!inWorker) offenders.push(`${rel(f)} -> ${m[1]}`);
      }
    }
    expect(offenders).toEqual([]);
    expect(dataImports.sort()).toEqual([
      'worker/routes/learningModules.js -> ../../data/modules.json',
      'worker/routes/learningModules.js -> ../../data/questions.json',
    ]);
  });

  it('every route file starts "use strict" and exports a Hono router; no other exports', () => {
    for (const f of FILES.filter((x) => /worker\/routes\/(skills|dashboard|learningModules|aiTutor|studyTools)\.js$/.test(x.replace(/\\/g, '/')))) {
      const text = fs.readFileSync(f, 'utf8');
      expect(text.startsWith("'use strict';")).toBe(true);
      expect(text.trimEnd().endsWith('module.exports = router;')).toBe(true);
      expect(text).not.toMatch(/^module\.exports\s*=\s*\{/m);
    }
  });
});
