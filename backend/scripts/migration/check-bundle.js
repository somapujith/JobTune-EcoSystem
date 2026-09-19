#!/usr/bin/env node
'use strict';

/**
 * check-bundle.js  (ADR-001 section 6.5, checklist item 19; also reports the process.exit surface of ADR 4.1)
 *
 * Builds the Worker exactly as `wrangler deploy` would, but WITHOUT deploying (`wrangler deploy --dry-run --outdir <tmp>`),
 * then greps the emitted JavaScript:
 *
 *   1. FORBIDDEN (checklist item 19, exit 1): any reference to  initializeTables | runMigrations | ensureTables.
 *      The boot-time schema bootstrap of the Express server must not exist in the Worker bundle at all.
 *   2. process.exit / process.abort occurrences (informational, exit 0 unless --strict-exit): each is classified
 *        allowlisted    a known, explained line (ALLOWLIST below: the jsonwebtoken -> semver `process.env.NODE_DEBUG` debug line, which
 *                       is listed even though it is not an exit call, so that its presence is visible and explained)
 *        data-string    the text sits inside a string literal (e.g. course content that talks about process.exit())
 *        REVIEW         real code: a human must decide it is unreachable on Workers (with the enclosing function shown)
 *      ADR 4.1's blocker was a process-exit call at MODULE LOAD in middleware/auth.js; that one is gone from the port, and the
 *      Worker's Jest tests grep src/worker for it. What remains here is third-party code that ends up in the bundle.
 *
 *   node scripts/migration/check-bundle.js                 build (dry run) into a temp dir, scan, remove the temp dir
 *   node scripts/migration/check-bundle.js --keep          keep the build output and print its path
 *   node scripts/migration/check-bundle.js --bundle <file|dir>   scan an existing bundle, do not build
 *   OPTIONS  --config <wrangler.toml> (default backend/wrangler.toml) | --strict-exit | --json | --timeout-ms <n> (170000)
 *
 * Nothing is deployed, no network or Cloudflare API call is needed for --dry-run, no secret is read. WRANGLER_SEND_METRICS=false
 * is set for the child process. Exit codes: 0 clean (REVIEW items may exist) | 1 forbidden reference found, build failed, or
 * --strict-exit and a REVIEW item exists | 64 usage.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const {
  EXIT, UsageError, parseArgv, toInt, runMain, defaultIo, helpText,
} = require('./lib/common');

const BACKEND_DIR = path.resolve(__dirname, '..', '..');
const FORBIDDEN_RE = /\b(initializeTables|runMigrations|ensureTables)\b/g;
const PROCESS_EXIT_RE = /\bprocess\s*\.\s*(exit|abort)\b/g;

/** Known, explained occurrences. `match(line)` is tested against the full source line. */
const ALLOWLIST = [
  {
    id: 'jsonwebtoken-semver-debug',
    reason: 'jsonwebtoken -> semver internal/debug.js: reads process.env.NODE_DEBUG once for an optional debug logger; no exit call',
    match: (line) => /NODE_DEBUG/.test(line) && /semver/i.test(line),
  },
];

const SPEC = {
  flags: { '--keep': 'keep', '--strict-exit': 'strictExit', '--json': 'json' },
  values: { '--bundle': 'bundle', '--config': 'config', '--timeout-ms': 'timeoutMs' },
  lists: {},
};

/** Is the character at index i of `line` inside a double-, single- or backtick-quoted string? (heuristic, line-local) */
function insideString(line, i) {
  let quote = null;
  for (let k = 0; k < i; k++) {
    const ch = line[k];
    if (quote) { if (ch === '\\') k++; else if (ch === quote) quote = null; } else if (ch === '"' || ch === "'" || ch === '`') quote = ch;
  }
  return quote !== null;
}

/** Nearest preceding line that declares a function / prototype method, for REVIEW context. */
function enclosing(lines, idx) {
  for (let k = idx; k >= Math.max(0, idx - 60); k--) {
    const m = /(function\s+([A-Za-z0-9_$]+)|([A-Za-z0-9_$.]+)\s*=\s*(?:async\s+)?function|([A-Za-z0-9_$]+)\s*\([^)]*\)\s*\{$)/.exec(lines[k]);
    const name = m && (m[2] || m[3] || m[4] || '').trim();
    if (name && !/^(if|for|while|switch|catch|else|return|with)$/.test(name)) return name;
  }
  return null;
}

/** Pure scan of one bundle's text. */
function scanBundleText(text, file = 'bundle.js') {
  const lines = text.split('\n');
  const forbidden = [];
  const processExit = [];
  const allowlistedRefs = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.length < 8) continue;
    const known = ALLOWLIST.find((a) => a.match(line));
    if (known) allowlistedRefs.push({ file, line: i + 1, rule: known.id, reason: known.reason, snippet: line.trim().slice(0, 160) });
    let m;
    FORBIDDEN_RE.lastIndex = 0;
    while ((m = FORBIDDEN_RE.exec(line))) forbidden.push({ file, line: i + 1, name: m[1], snippet: line.trim().slice(0, 200) });
    PROCESS_EXIT_RE.lastIndex = 0;
    while ((m = PROCESS_EXIT_RE.exec(line))) {
      const rule = ALLOWLIST.find((a) => a.match(line));
      let cls; let reason;
      if (rule) { cls = 'allowlisted'; reason = `${rule.id}: ${rule.reason}`; } else if (insideString(line, m.index)) { cls = 'data-string'; reason = 'inside a string literal (data, not code)'; } else { cls = 'REVIEW'; reason = 'real code path: confirm it is unreachable on Workers'; }
      processExit.push({ file, line: i + 1, call: `process.${m[1]}`, class: cls, reason, context: cls === 'REVIEW' ? enclosing(lines, i) : null, snippet: line.trim().slice(0, 160) });
    }
  }
  return { forbidden, processExit, allowlistedRefs };
}

function listBundleFiles(target) {
  const st = fs.statSync(target);
  if (st.isFile()) return [target];
  return fs.readdirSync(target).filter((f) => /\.(m?js|cjs)$/.test(f)).map((f) => path.join(target, f));
}

function scanBundle(target) {
  const files = listBundleFiles(target);
  if (!files.length) throw new UsageError(`no .js files found in ${target}`);
  const all = { forbidden: [], processExit: [], allowlistedRefs: [], files: [] };
  for (const f of files) {
    const text = fs.readFileSync(f, 'utf8');
    const r = scanBundleText(text, path.basename(f));
    all.forbidden.push(...r.forbidden);
    all.processExit.push(...r.processExit);
    all.allowlistedRefs.push(...r.allowlistedRefs);
    all.files.push({ file: path.basename(f), bytes: Buffer.byteLength(text), lines: text.split('\n').length });
  }
  return all;
}

function buildDryRun({ config, outdir, timeoutMs }) {
  const wrangler = path.join(BACKEND_DIR, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
  if (!fs.existsSync(wrangler)) throw new Error(`wrangler is not installed at ${wrangler} (run npm ci in backend/; this script never installs anything)`);
  const args = [wrangler, 'deploy', '--dry-run', '--outdir', outdir];
  if (config) args.push('--config', config);
  const r = spawnSync(process.execPath, args, {
    cwd: BACKEND_DIR, encoding: 'utf8', timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, WRANGLER_SEND_METRICS: 'false', CI: 'true', NO_COLOR: '1' },
  });
  if (r.error) throw new Error(`wrangler did not run: ${r.error.message}`);
  if (r.status !== 0) throw new Error(`wrangler deploy --dry-run failed (exit ${r.status}):\n${String(r.stdout || '').slice(-1500)}\n${String(r.stderr || '').slice(-1500)}`);
  return String(r.stdout || '').split('\n').filter((l) => /Total Upload|dry-run/i.test(l)).join(' | ');
}

async function main(argv, ioIn) {
  const io = defaultIo(ioIn);
  return runMain(async () => {
    const a = parseArgv(argv, SPEC);
    if (a.help) { io.log(helpText(__filename)); return EXIT.OK; }
    const timeoutMs = toInt('--timeout-ms', a.timeoutMs, 170000, { min: 1000 });
    let target = a.bundle;
    let tmp = null;
    let buildNote = null;
    if (!target) {
      tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jobtune-bundle-'));
      try {
        buildNote = buildDryRun({ config: a.config, outdir: tmp, timeoutMs });
      } catch (e) {
        fs.rmSync(tmp, { recursive: true, force: true });
        io.err(`build failed: ${e.message}`);
        return EXIT.FAIL;
      }
      target = tmp;
    }
    let scan;
    try { scan = scanBundle(path.resolve(target)); } finally { if (tmp && !a.keep) fs.rmSync(tmp, { recursive: true, force: true }); }

    const review = scan.processExit.filter((p) => p.class === 'REVIEW');
    const out = {
      target: a.bundle ? path.resolve(target) : (a.keep ? tmp : '(temporary dry-run build, removed)'),
      files: scan.files, forbiddenReferences: scan.forbidden, allowlistedReferences: scan.allowlistedRefs,
      processExit: { total: scan.processExit.length, allowlisted: scan.processExit.filter((p) => p.class === 'allowlisted').length, dataStrings: scan.processExit.filter((p) => p.class === 'data-string').length, review },
      exitCode: scan.forbidden.length || (a.strictExit && review.length) ? EXIT.FAIL : EXIT.OK,
    };
    if (a.json) { io.log(JSON.stringify(out, null, 2)); return out.exitCode; }
    io.log(`Bundle check${buildNote ? ` (wrangler dry run: ${buildNote})` : ''}`);
    scan.files.forEach((f) => io.log(`  scanned ${f.file}: ${(f.bytes / 1024 / 1024).toFixed(2)} MiB, ${f.lines} lines`));
    if (a.keep && tmp) io.log(`  build output kept at ${tmp}`);
    io.log('');
    io.log(`1. schema-bootstrap references (initializeTables | runMigrations | ensureTables): ${scan.forbidden.length}`);
    scan.forbidden.slice(0, 20).forEach((f) => io.log(`     ${f.file}:${f.line}  ${f.name}  ${f.snippet}`));
    io.log(`2. process.exit / process.abort occurrences: ${out.processExit.total} (allowlisted ${out.processExit.allowlisted}, inside string literals ${out.processExit.dataStrings}, REVIEW ${review.length})`);
    review.forEach((p) => io.log(`     REVIEW ${p.file}:${p.line} ${p.call}() in ${p.context || '(unknown function)'}: ${p.snippet}`));
    scan.allowlistedRefs.forEach((p) => io.log(`     allowlisted ${p.file}:${p.line} [${p.rule}]: ${p.reason}`));
    io.log('');
    io.log(`RESULT: ${out.exitCode === 0 ? 'PASS' : 'FAIL'}  item 19 (no bootstrap references): ${scan.forbidden.length === 0 ? 'met' : 'NOT met'}${review.length ? `; ${review.length} process.exit call(s) need a human decision (third-party code; a REVIEW item is not a failure unless --strict-exit)` : ''}`);
    return out.exitCode;
  }, io);
}

module.exports = { main, scanBundleText, scanBundle, insideString, ALLOWLIST };

if (require.main === module) main(process.argv.slice(2)).then((c) => { process.exitCode = c; });
