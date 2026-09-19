#!/usr/bin/env node
'use strict';

/**
 * upload-roundtrip.js  (ADR-001 T4.5, section 6.6, checklist items 23, 24, 25)
 *
 * Document round trips, Render vs Workers, with the same inputs sent to both:
 *
 *   U:<file>  UPLOAD -> TEXT. POST /api/ats/v2/parse (multipart field "resume", tier 2, no database write, no AI call) for each
 *             fixture (PDF, DOCX, TXT). Same status on both; on 200 the extracted `resumeText` must be EQUAL (exact; a
 *             difference only in whitespace is reported as a warning and still fails unless --allow-whitespace-diff).
 *   L:*       LIMITS AND ALLOWLIST (item 25). No file -> 400 on both; a PNG (not on the allowlist) and a 5 MB + 1 byte file
 *             must be rejected the same way on both (on Express multer errors surface as a masked 500). --include-10mb adds the
 *             10 MB limit of POST /api/resume/upload (an oversize application/pdf; rejected before any database write).
 *   E:<fmt>   EXPORT (item 24). POST /api/resume/v2/export {resumeText, format} for pdf, docx, txt (tier 2; renders only, no
 *             database write). Each server's answer must be a VALID file: PDF starts with %PDF- and ends with %%EOF; DOCX is a
 *             ZIP whose central directory lists [Content_Types].xml and word/document.xml (inflated and checked for the
 *             <w:document> root); Content-Type must be the format's type, Content-Disposition `attachment; filename="*.<ext>"`,
 *             Content-Length (when sent) must equal the byte length. Then the two servers are compared: same media type, same
 *             extension, same extracted text (DOCX: document.xml text; PDF: via pdf-parse when installed; TXT: identical bytes).
 *   E:ats-*   (only with --resume-id <id> and --allow-writes) POST /api/ats/export/docx and /txt for that saved resume. These
 *             write an export record in the database (both servers share it, so it is written twice).
 *
 * Byte equality of PDF/DOCX is NOT expected (timestamps, ids inside the container): equality is on extracted text.
 * "Browser download works end to end" (item 24) is a manual step; this script proves the bytes and headers are right.
 *
 *   node scripts/migration/upload-roundtrip.js --render <url> --workers <url> [--test-account-only] [options]
 *
 * CREDENTIALS (environment only): JT_TEST_TOKEN, or JT_TEST_EMAIL + JT_TEST_PASSWORD with --test-account-only (one login on
 * Render, token reused on both). The account must be tier 2 or higher (a 403 PLAN_UPGRADE_REQUIRED makes the run INCONCLUSIVE).
 *
 * OPTIONS  --fixtures <dir> (default backend/spike/docs/fixtures: SYNTHETIC files; point this at >= 5 real resumes you own for
 *          checklist item 23) | --limit <n> (12; fixtures are picked round-robin across pdf/docx/txt) | --include-10mb
 *          | --no-limits | --resume-id <id> | --allow-writes | --allow-whitespace-diff | --budget <n> (80) | --delay-ms <n> (300)
 *          | --timeout-ms <n> (60000) | --dry-run | --json
 *
 * Exit codes: 0 all checks pass | 1 a check failed or was inconclusive | 64 usage / refusal.
 */

const fs = require('fs');
const path = require('path');
const {
  EXIT, REPO_DIR, UsageError, parseArgv, toInt, assertTwoDistinctTargets, httpCall, compareShapes, resolveTestToken, Pacer, runMain,
  defaultIo, helpText,
} = require('./lib/common');
const { inspectDocx, inspectPdf, pdfText } = require('./lib/ziputil');
const { writeFallbackFixtures } = require('./lib/fallbackFixtures');

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const MIME_BY_EXT = { '.pdf': 'application/pdf', '.docx': DOCX_MIME, '.txt': 'text/plain' };
const DEFAULT_FIXTURES = path.join(REPO_DIR, 'backend', 'spike', 'docs', 'fixtures');

const SAMPLE_RESUME = [
  'Jane Example',
  'jane.example@example.test | +1 555 0100 | Example City',
  '',
  'SUMMARY',
  'Synthetic resume used only for export verification. Software engineer with five years of experience.',
  '',
  'EXPERIENCE',
  'Senior Engineer, Example Corp (2021 - 2025)',
  '- Reduced API latency by 40% across 12 services',
  '- Led a team of 4 engineers shipping a billing platform',
  '',
  'SKILLS',
  'JavaScript, Node.js, PostgreSQL, Cloudflare Workers',
].join('\n');

const SPEC = {
  flags: { '--test-account-only': 'testAccountOnly', '--include-10mb': 'include10mb', '--no-limits': 'noLimits', '--allow-writes': 'allowWrites', '--allow-whitespace-diff': 'allowWhitespaceDiff', '--dry-run': 'dryRun', '--json': 'json' },
  values: {
    '--render': 'render', '--workers': 'workers', '--fixtures': 'fixtures', '--limit': 'limit', '--resume-id': 'resumeId', '--budget': 'budget',
    '--delay-ms': 'delayMs', '--timeout-ms': 'timeoutMs',
  },
  lists: {},
};

const norm = (s) => String(s).replace(/\s+/g, ' ').trim();
const mediaType = (ct) => String(ct || '').split(';')[0].trim().toLowerCase();

/** Pick up to `limit` fixture files round-robin across pdf / docx / txt. */
function pickFixtures(dir, limit) {
  let names;
  try { names = fs.readdirSync(dir).sort(); } catch (e) { throw new UsageError(`cannot read --fixtures ${dir}: ${e.message}`); }
  const groups = { '.pdf': [], '.docx': [], '.txt': [] };
  for (const n of names) { const ext = path.extname(n).toLowerCase(); if (groups[ext]) groups[ext].push(n); }
  const out = [];
  for (let i = 0; out.length < limit; i++) {
    let any = false;
    for (const ext of Object.keys(groups)) {
      if (groups[ext][i] && out.length < limit) { out.push(groups[ext][i]); any = true; }
    }
    if (!any) break;
  }
  if (!out.length) throw new UsageError(`no .pdf/.docx/.txt fixtures in ${dir}`);
  return out.map((n) => ({ name: n, file: path.join(dir, n), mime: MIME_BY_EXT[path.extname(n).toLowerCase()] }));
}

function multipartFile(name, bytes, mime, field = 'resume') {
  const fd = new FormData();
  fd.append(field, new Blob([bytes], { type: mime }), name);
  return fd;
}

/** Validate one server's export response against the format contract. @returns string[] problems */
async function exportProblems(res, format) {
  const problems = [];
  const expectType = { pdf: 'application/pdf', docx: DOCX_MIME, txt: 'text/plain' }[format];
  if (res.status !== 200) return [`HTTP ${res.status}${res.json && res.json.message ? ` ${res.json.message}` : ''}`];
  if (mediaType(res.contentType) !== expectType) problems.push(`Content-Type ${mediaType(res.contentType) || '(none)'} (expected ${expectType})`);
  const cd = res.headers.get('content-disposition') || '';
  const m = /^attachment;\s*filename="?([^";]+)"?/i.exec(cd);
  if (!m) problems.push(`Content-Disposition ${JSON.stringify(cd)} (expected attachment; filename="...")`);
  else if (!m[1].toLowerCase().endsWith(`.${format}`)) problems.push(`Content-Disposition filename "${m[1]}" does not end in .${format}`);
  const cl = res.headers.get('content-length');
  if (cl !== null && Number(cl) !== res.bytes.length) problems.push(`Content-Length ${cl} != body length ${res.bytes.length}`);
  const buf = Buffer.from(res.bytes);
  if (format === 'pdf') problems.push(...inspectPdf(buf).problems.map((p) => `PDF: ${p}`));
  else if (format === 'docx') problems.push(...inspectDocx(buf).problems.map((p) => `DOCX: ${p}`));
  else if (buf.length === 0) problems.push('empty body');
  return problems;
}

async function runUploadRoundtrip(opts, io) {
  const { render, workers } = assertTwoDistinctTargets(opts.render, opts.workers);
  // Default: the spike fixtures if present; on a fresh clone (they are gitignored) a tiny built-in synthetic set.
  const builtIn = !opts.fixtures && !fs.existsSync(DEFAULT_FIXTURES);
  const fixturesDir = opts.fixtures ? path.resolve(opts.fixtures) : builtIn ? await writeFallbackFixtures(SAMPLE_RESUME) : DEFAULT_FIXTURES;
  const fixtures = pickFixtures(fixturesDir, opts.limit);
  const cred = await resolveTestToken({ env: io.env, renderBase: render, testAccountOnly: opts.testAccountOnly, dryRun: opts.dryRun, io, timeoutMs: opts.timeoutMs });
  if (!opts.dryRun && !cred.token) throw new UsageError('this script needs an authenticated tier-2+ test account: set JT_TEST_TOKEN, or JT_TEST_EMAIL + JT_TEST_PASSWORD with --test-account-only');
  if (opts.resumeId && !opts.allowWrites) throw new UsageError('--resume-id runs POST /api/ats/export/*, which writes an export record on both servers: add --allow-writes');
  const headers = cred.token ? { Authorization: `Bearer ${cred.token}` } : {};
  const pacer = new Pacer({ delayMs: opts.delayMs, budget: opts.budget, sleepImpl: io.sleepImpl, log: io.log });

  io.log(`Upload/export round trip: Render=${render}  Workers=${workers}`);
  io.log(`credentials: ${cred.source}`);
  io.log(`fixtures: ${fixtures.length} from ${fixturesDir}${opts.fixtures ? '' : builtIn ? ' (built-in synthetic set; use --fixtures with real resumes for checklist item 23)' : ' (synthetic; use --fixtures with real resumes for checklist item 23)'}`);

  const checks = [];
  const record = (id, title, status, details = []) => {
    checks.push({ id, title, status, details });
    io.log(`  ${status.toUpperCase().padEnd(12)} ${id.padEnd(14)} ${title}${details.length ? `\n      - ${details.join('\n      - ')}` : ''}`);
  };
  const both = async (req) => {
    await pacer.wait();
    const mk = (base) => httpCall({ url: base + req.path, method: req.method || 'POST', headers: { ...headers, ...(req.headers || {}) }, body: req.body && req.body(), timeoutMs: opts.timeoutMs, fetchImpl: io.fetchImpl });
    const R = await mk(render);
    const W = await mk(workers);
    return { R, W };
  };
  const tierProblem = ({ R, W }) => [R, W].some((x) => x.status === 403 && x.json && x.json.code === 'PLAN_UPGRADE_REQUIRED');
  const authProblem = ({ R, W }) => R.status === 401 || W.status === 401;
  const inconclusive = (id, title, x) => {
    const why = tierProblem(x) ? 'the test account is below tier 2 (403 PLAN_UPGRADE_REQUIRED)' : authProblem(x) ? 'the token was rejected (401; expired?)' : (x.R.status === 429 || x.W.status === 429) ? 'rate limited (429)' : null;
    if (why) record(id, title, 'inconclusive', [why]);
    return !!why;
  };

  if (opts.dryRun) {
    fixtures.forEach((f) => io.log(`  would POST /api/ats/v2/parse  fixture ${f.name} (${f.mime}) to both`));
    if (!opts.noLimits) ['no file -> 400', 'image/png -> rejected', '5 MB + 1 byte text/plain -> rejected'].forEach((l) => io.log(`  would POST /api/ats/v2/parse  limits check: ${l}`));
    if (opts.include10mb) io.log('  would POST /api/resume/upload  10 MB + 1 byte application/pdf -> rejected');
    ['pdf', 'docx', 'txt'].forEach((f) => io.log(`  would POST /api/resume/v2/export  format ${f}`));
    if (opts.resumeId) io.log(`  would POST /api/ats/export/docx and /txt  resumeId ${opts.resumeId}`);
    return { checks: [], exitCode: EXIT.OK, dryRun: true };
  }

  // ---- U: uploads ------------------------------------------------------------------------------
  for (const f of fixtures) {
    const bytes = fs.readFileSync(f.file);
    const x = await both({ path: '/api/ats/v2/parse', body: () => multipartFile(f.name, bytes, f.mime) });
    const id = `U:${f.name}`;
    const title = `upload ${f.name} (${bytes.length} bytes) -> extracted text`;
    if (inconclusive(id, title, x)) continue;
    const { R, W } = x;
    if (R.status === 0 || W.status === 0) { record(id, title, 'fail', [`network error: Render=${R.error || R.status} Workers=${W.error || W.status}`]); continue; }
    const problems = [];
    if (R.status !== W.status) problems.push(`status ${R.status} (Render) vs ${W.status} (Workers)`);
    else if (R.status === 200) {
      const a = R.json && R.json.resumeText;
      const b = W.json && W.json.resumeText;
      if (typeof a !== 'string' || typeof b !== 'string') problems.push('resumeText missing on one side');
      else if (a !== b) {
        if (norm(a) === norm(b)) { if (!opts.allowWhitespaceDiff) problems.push('resumeText equal except for whitespace (use --allow-whitespace-diff to accept)'); }
        else problems.push(`resumeText differs (Render ${a.length} chars, Workers ${b.length} chars; first difference at index ${[...a].findIndex((ch, i) => ch !== b[i])})`);
      }
      if (R.json && W.json) compareShapes(R.json, W.json, new Set(['fileSize'])).diffs.forEach((d) => problems.push(`body ${d.path}: ${d.kind} (${d.detail})`));
      if (R.json && W.json && R.json.fileSize !== W.json.fileSize) problems.push(`fileSize ${R.json.fileSize} vs ${W.json.fileSize}`);
    } else if (R.json !== undefined && W.json !== undefined) {
      compareShapes(R.json, W.json).diffs.forEach((d) => problems.push(`body ${d.path}: ${d.kind} (${d.detail})`));
    }
    record(id, title, problems.length ? 'fail' : 'pass', problems.length ? problems : [`HTTP ${R.status}${R.status === 200 ? `, ${R.json.resumeText.length} chars identical` : ' on both'}`]);
  }

  // ---- L: limits / allowlist -------------------------------------------------------------------
  if (!opts.noLimits) {
    const sameAnswer = (x) => {
      const { R, W } = x;
      const problems = [];
      if (R.status === 0 || W.status === 0) return [`network error: Render=${R.error || R.status} Workers=${W.error || W.status}`];
      if (R.status !== W.status) problems.push(`status ${R.status} (Render) vs ${W.status} (Workers)`);
      else if (R.json !== undefined && W.json !== undefined) compareShapes(R.json, W.json).diffs.forEach((d) => problems.push(`body ${d.path}: ${d.kind} (${d.detail})`));
      return problems;
    };
    const limitCheck = async (id, title, req, expectStatus) => {
      const x = await both(req);
      if (inconclusive(id, title, x)) return;
      const problems = sameAnswer(x);
      if (!problems.length && expectStatus && !expectStatus.includes(x.R.status)) problems.push(`both answered ${x.R.status}, expected one of ${expectStatus.join('/')}: the file was not rejected as required`);
      record(id, title, problems.length ? 'fail' : 'pass', problems.length ? problems : [`same answer on both: HTTP ${x.R.status}${x.R.json && (x.R.json.message || x.R.json.error) ? ` ${JSON.stringify(x.R.json.message || x.R.json.error)}` : ''}`]);
    };
    const fdNoFile = () => { const fd = new FormData(); fd.append('note', 'no file here'); return fd; };
    await limitCheck('L:no-file', 'multipart without a file -> the route\'s own 400', { path: '/api/ats/v2/parse', body: fdNoFile }, [400]);
    await limitCheck('L:bad-mimetype', 'image/png is not on the allowlist -> rejected', { path: '/api/ats/v2/parse', body: () => multipartFile('x.png', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), 'image/png') }, [400, 415, 500]);
    await limitCheck('L:over-5mb', '5 MB + 1 byte -> rejected (limit is 5 MB)', { path: '/api/ats/v2/parse', body: () => multipartFile('big.txt', Buffer.alloc(5 * 1024 * 1024 + 1, 0x61), 'text/plain') }, [400, 413, 500]);
    if (opts.include10mb) {
      await limitCheck('L:over-10mb', '10 MB + 1 byte to /api/resume/upload -> rejected (limit is 10 MB)', { path: '/api/resume/upload', body: () => multipartFile('big.pdf', Buffer.alloc(10 * 1024 * 1024 + 1, 0x61), 'application/pdf') }, [400, 413, 500]);
    }
  }

  // ---- E: exports ------------------------------------------------------------------------------
  const compareExports = async (id, title, format, x) => {
    const { R, W } = x;
    if (inconclusive(id, title, x)) return;
    const problems = [];
    const pr = await exportProblems(R, format);
    const pw = await exportProblems(W, format);
    pr.forEach((p) => problems.push(`Render: ${p}`));
    pw.forEach((p) => problems.push(`Workers: ${p}`));
    const notes = [];
    if (!pr.length && !pw.length) {
      const dispExt = (r) => (/filename="?([^";]+)/i.exec(r.headers.get('content-disposition') || '') || [])[1];
      if (mediaType(R.contentType) !== mediaType(W.contentType)) problems.push('media types differ');
      const bufR = Buffer.from(R.bytes);
      const bufW = Buffer.from(W.bytes);
      let tR;
      let tW;
      if (format === 'docx') { tR = inspectDocx(bufR).text; tW = inspectDocx(bufW).text; } else if (format === 'txt') { tR = bufR.toString('utf8'); tW = bufW.toString('utf8'); } else { tR = await pdfText(bufR); tW = await pdfText(bufW); }
      if (tR === null || tR === undefined) notes.push('text comparison not available for PDF (pdf-parse not installed): only structure was verified');
      else if (tR !== tW) problems.push(format === 'txt' ? 'TXT bytes differ' : `extracted text differs (${norm(tR) === norm(tW) ? 'whitespace only' : 'content'}): Render ${tR.length} chars vs Workers ${tW.length} chars`);
      notes.push(`Render file ${dispExt(R)} ${bufR.length} bytes; Workers file ${dispExt(W)} ${bufW.length} bytes`);
    }
    record(id, title, problems.length ? 'fail' : 'pass', problems.length ? problems : notes);
  };
  for (const format of ['pdf', 'docx', 'txt']) {
    const x = await both({ path: '/api/resume/v2/export', body: () => ({ resumeText: SAMPLE_RESUME, format }) });
    await compareExports(`E:${format}`, `POST /api/resume/v2/export ${format}: valid file, right headers, same content on both`, format, x);
  }
  if (opts.resumeId) {
    for (const format of ['docx', 'txt']) {
      const x = await both({ path: `/api/ats/export/${format}`, body: () => ({ resumeId: Number(opts.resumeId) }) });
      await compareExports(`E:ats-${format}`, `POST /api/ats/export/${format} (resume ${opts.resumeId}): valid file, right headers, same content on both`, format, x);
    }
  }

  const n = (s) => checks.filter((c) => c.status === s).length;
  const summary = { pass: n('pass'), fail: n('fail'), inconclusive: n('inconclusive'), total: checks.length };
  return { checks, summary, exitCode: summary.fail || summary.inconclusive ? EXIT.FAIL : EXIT.OK };
}

async function main(argv, ioIn) {
  const io = defaultIo(ioIn);
  return runMain(async () => {
    const a = parseArgv(argv, SPEC);
    if (a.help) { io.log(helpText(__filename)); return EXIT.OK; }
    const opts = {
      ...a,
      limit: toInt('--limit', a.limit, 12, { min: 1 }),
      budget: toInt('--budget', a.budget, 80, { min: 0 }),
      delayMs: toInt('--delay-ms', a.delayMs, 300, { min: 0 }),
      timeoutMs: toInt('--timeout-ms', a.timeoutMs, 60000, { min: 100 }),
    };
    const out = await runUploadRoundtrip(opts, io);
    if (out.dryRun) return out.exitCode;
    const s = out.summary;
    io.log('');
    io.log(`RESULT: ${out.exitCode === 0 ? 'PASS' : 'FAIL'}  pass ${s.pass} | fail ${s.fail} | inconclusive ${s.inconclusive} (of ${s.total})`);
    io.log('NOTE: "browser download works end to end" (checklist item 24) and real-resume extraction (item 23) need a human with real files.');
    if (a.json) io.log(JSON.stringify(out, null, 2));
    return out.exitCode;
  }, io);
}

module.exports = { main, runUploadRoundtrip, pickFixtures, exportProblems, SAMPLE_RESUME };

if (require.main === module) main(process.argv.slice(2)).then((c) => { process.exitCode = c; });
