/**
 * ADR-001 section 6.5 / checklist item 19: bundle grep. Scans synthetic bundle text only; the real
 * `wrangler deploy --dry-run` build is exercised by running the CLI by hand (see the runbook), not in Jest.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { scanBundleText, insideString, main } = require('../../scripts/migration/check-bundle');
const { makeIo } = require('./helpers/mockServer');

let tmp;
beforeAll(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bundle-')); });
afterAll(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

const bundle = (name, text) => { const d = path.join(tmp, name); fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(path.join(d, 'worker-entry.js'), text); return d; };

describe('scanBundleText', () => {
  it('finds each forbidden bootstrap name with file and line', () => {
    const r = scanBundleText('var a = 1;\nfunction initializeTables() {}\nawait runMigrations();\nsessionService.ensureTables();\nconst safe = ensureTablesAreFine;\n', 'w.js');
    expect(r.forbidden.map((f) => `${f.name}@${f.line}`)).toEqual(['initializeTables@2', 'runMigrations@3', 'ensureTables@4']); // word-boundary: ensureTablesAreFine is not a hit
    expect(r.forbidden[0].file).toBe('w.js');
  });

  it('classifies process.exit: real code = REVIEW with its function, string literal = data, semver NODE_DEBUG = allowlisted', () => {
    const text = [
      'Async.prototype.fatalError = function(e, isNode2) {',
      '  if (isNode2) {',
      '    process.exit(2);',
      '  }',
      '};',
      'question: "What is `process.exit()`? It ends the process.",',
      'var debug = typeof process === "object" && process.env && process.env.NODE_DEBUG && /\\bsemver\\b/i.test(process.env.NODE_DEBUG) ? (...args) => console.error("SEMVER", ...args) : () => {};',
      'const x = "a" + process.abort();',
    ].join('\n');
    const r = scanBundleText(text);
    const by = (c) => r.processExit.filter((p) => p.class === c);
    expect(by('REVIEW').map((p) => [p.line, p.call])).toEqual([[3, 'process.exit'], [8, 'process.abort']]);
    expect(by('REVIEW')[0].context).toBe('Async.prototype.fatalError'); // context is a best-effort nearest-function heuristic
    expect(by('data-string').map((p) => p.line)).toEqual([6]);
    expect(r.allowlistedRefs).toHaveLength(1);
    expect(r.allowlistedRefs[0]).toMatchObject({ line: 7, rule: 'jsonwebtoken-semver-debug' });
  });

  it('insideString handles escapes and mixed quotes', () => {
    expect(insideString('x = "a \\" process.exit"', 12)).toBe(true);
    expect(insideString('x = "a"; process.exit()', 10)).toBe(false);
    expect(insideString("x = 'it\\'s process.exit'", 12)).toBe(true);
  });
});

describe('check-bundle CLI (--bundle)', () => {
  it('a clean bundle passes (exit 0), REVIEW items are reported but do not fail', async () => {
    const d = bundle('clean', 'function fatal(){\n  process.exit(2);\n}\nexport default { fetch() {} };\n');
    const io = makeIo();
    expect(await main(['--bundle', d], io)).toBe(0);
    expect(io.text()).toMatch(/schema-bootstrap references.*: 0/);
    expect(io.text()).toMatch(/REVIEW worker-entry\.js:2 process\.exit\(\) in fatal/);
    expect(io.text()).toMatch(/item 19 \(no bootstrap references\): met/);
  });

  it('--strict-exit turns a REVIEW item into a failure', async () => {
    const d = bundle('strict', 'function fatal(){\n  process.exit(2);\n}\n');
    expect(await main(['--bundle', d, '--strict-exit'], makeIo())).toBe(1);
  });

  it('a forbidden reference fails (exit 1) and is listed', async () => {
    const d = bundle('dirty', 'async function boot() { await runMigrations(); }\n');
    const io = makeIo();
    expect(await main(['--bundle', d], io)).toBe(1);
    expect(io.text()).toMatch(/worker-entry\.js:1\s+runMigrations/);
    expect(io.text()).toMatch(/NOT met/);
  });

  it('--json output is machine readable; a single file path works; empty dir and missing path are usage/tool errors', async () => {
    const d = bundle('json', 'const a = ensureTables;\n');
    const io = makeIo();
    expect(await main(['--bundle', path.join(d, 'worker-entry.js'), '--json'], io)).toBe(1);
    const out = JSON.parse(io.text());
    expect(out.forbiddenReferences).toHaveLength(1);
    expect(out.exitCode).toBe(1);
    const empty = path.join(tmp, 'empty'); fs.mkdirSync(empty);
    expect(await main(['--bundle', empty], makeIo())).toBe(64);
    expect(await main(['--bundle', path.join(tmp, 'nope')], makeIo())).toBe(1);
    expect(await main(['--nope'], makeIo())).toBe(64);
  });
});
