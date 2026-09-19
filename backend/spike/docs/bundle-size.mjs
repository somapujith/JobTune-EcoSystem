// Bundle-size measurement via `wrangler deploy --dry-run` (no network deploy) + per-module attribution.
// Workers limits (compressed): 3 MB gzip on Free, 10 MB gzip on Paid.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const backend = path.resolve(here, '..', '..');
const wranglerBin = path.join(backend, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
const OUT = path.join(here, 'out');
const ANSI = new RegExp(String.fromCharCode(27) + '\\[[0-9;]*m', 'g');

// NOTE: pass an ABSOLUTE outdir. wrangler resolves a relative --outdir against the config
// file's directory (not the cwd), which silently lands the bundle in spike/docs/spike/docs/...
export function dryRunBuild(configRel, outdirAbs) {
  fs.rmSync(outdirAbs, { recursive: true, force: true });
  const r = spawnSync(process.execPath, [wranglerBin, 'deploy', '--dry-run', '--outdir', outdirAbs, '-c', configRel], {
    cwd: backend,
    env: { ...process.env, NO_COLOR: '1', WRANGLER_SEND_METRICS: 'false' },
    encoding: 'utf8',
    timeout: 240000,
  });
  const text = ((r.stdout || '') + (r.stderr || '')).replace(ANSI, '');
  const m = text.match(/Total Upload:\s*([\d.]+) KiB \/ gzip:\s*([\d.]+) KiB/);
  const errs = [...text.matchAll(/ERROR\]\s*([^\n]*)/g)].map((x) => x[1].trim()).filter((x) => x && !/^Build failed/.test(x));
  const ctx = text.match(/(\.\.\/[^\s]*:\d+:\d+):/);
  return {
    ok: !!m && r.status === 0,
    rawKiB: m ? +m[1] : null,
    gzipKiB: m ? +m[2] : null,
    error: m ? null : (errs.join(' | ') + (ctx ? ' @ ' + ctx[1] : '')) || text.slice(-400),
    outdir: outdirAbs,
  };
}

// ---- attribution: esbuild emits a "// <path>" comment before every module ----------------
export function attribute(bundleDir) {
  const js = fs.readFileSync(path.join(bundleDir, 'worker.js'), 'utf8').split('\n');
  const pkgOf = (s) => {
    const i = s.lastIndexOf('node_modules/');
    if (i >= 0) {
      const rest = s.slice(i + 13).split('/');
      return rest[0].startsWith('@') ? rest[0] + '/' + rest[1] : rest[0];
    }
    if (/\/src\//.test('/' + s)) return '(backend src/)';
    if (/wrangler\/templates/.test(s)) return '(wrangler shims)';
    return '(spike code / stubs)';
  };
  const perFile = {};
  let cur = '(preamble/helpers)';
  let total = 0;
  for (const line of js) {
    const m = line.match(/^\/\/ (\.\.?\/\S+)$/);
    if (m) cur = m[1];
    const b = Buffer.byteLength(line) + 1;
    perFile[cur] = (perFile[cur] || 0) + b;
    total += b;
  }
  const pkg = {};
  const pdfjs = {};
  for (const [f, b] of Object.entries(perFile)) {
    const p = f.startsWith('(') ? f : pkgOf(f);
    pkg[p] = (pkg[p] || 0) + b;
    const m = f.match(/pdf-parse\/lib\/pdf\.js\/(v[\d.]+)\/build\/(pdf(?:\.worker)?\.js)$/);
    if (m) pdfjs[m[1] + '/' + m[2]] = +(b / 1024).toFixed(0);
  }
  const rows = Object.entries(pkg)
    .sort((a, b) => b[1] - a[1])
    .map(([name, bytes]) => ({ name, KiB: +(bytes / 1024).toFixed(0) }));
  return { totalKiB: +(total / 1024).toFixed(0), top: rows.slice(0, 14), pdfjsFiles: pdfjs };
}

// ---- per-lib probes ------------------------------------------------------------
const PDFKIT_STANDALONE_ALIAS = '../../../../node_modules/pdfkit/js/pdfkit.standalone.js';
const S = '../../../../src/';
const probes = [
  ['baseline (empty worker)', [], false],
  ['pdf-parse 1.1.4 (default entry; esbuild glob-bundles ALL pdf.js versions)', ['pdf-parse'], false],
  ['pdf-parse pinned: only pdf.js v1.10.100 build', ['pdf-parse/lib/pdf.js/v1.10.100/build/pdf.js'], false],
  ['unpdf 1.8.1 (S1 fallback)', ['unpdf'], false],
  ['unzipper 0.12.3', ['unzipper'], false],
  ['pdfkit 0.16 default (module field -> pdfkit.es.js; BROKEN at runtime)', ['pdfkit'], false],
  ['pdfkit 0.16 standalone (fonts inlined)', ['pdfkit/js/pdfkit.standalone.js'], false],
  ['docx 9.7.1', ['docx'], false],
  ['mammoth 1.12.0', ['mammoth'], false],
  ['xml2js 0.6.2', ['xml2js'], false],
  ['COMBO as-is: real src fileParser+resumeExport+resumeExportEngine + mammoth (pdfkit->standalone alias)', [S + 'utils/fileParser.js', S + 'services/resumeExport.js', S + 'services/v2/resumeExportEngine.js', 'mammoth'], true],
  ['COMBO pinned: pdf-parse pinned build + unzipper + xml2js + docx + mammoth + pdfkit standalone', ['pdf-parse/lib/pdf.js/v1.10.100/build/pdf.js', 'unzipper', 'xml2js', 'docx', 'mammoth', 'pdfkit'], true],
  ['COMBO modern: unpdf + mammoth + docx + pdfkit standalone (no pdf-parse/unzipper/xml2js)', ['unpdf', 'mammoth', 'docx', 'pdfkit'], true],
];

export function measureProbes() {
  const dir = path.join(OUT, 'probe');
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const results = [];
  probes.forEach(([label, specs, pdfkitAlias], i) => {
    const name = `p${String(i).padStart(2, '0')}`;
    const body = `export default { async fetch() { const ms = [];\n${specs.map((s) => `  ms.push(await import(${JSON.stringify(s)}));`).join('\n')}\n  return new Response(String(ms.length)); } };\n`;
    fs.writeFileSync(path.join(dir, name + '.mjs'), body);
    const toml = [
      `name = "probe-${name}"`,
      `main = "${name}.mjs"`,
      `compatibility_date = "2026-09-14"`,
      `compatibility_flags = ["nodejs_compat"]`,
      `[alias]`,
      `"@aws-sdk/client-s3" = "../../stubs/aws-sdk-client-s3.mjs"`,
      `"node-ensure" = "../../stubs/node-ensure.cjs"`,
      pdfkitAlias ? `"pdfkit" = "${PDFKIT_STANDALONE_ALIAS}"` : '',
    ].join('\n');
    fs.writeFileSync(path.join(dir, name + '.toml'), toml);
    const outdir = path.join(OUT, 'bundle-probe', name);
    const r = dryRunBuild(path.relative(backend, path.join(dir, name + '.toml')), outdir);
    let gzipL9 = null;
    try {
      const b = fs.readFileSync(path.join(outdir, name + '.js'));
      gzipL9 = +(zlib.gzipSync(b, { level: 9 }).length / 1024).toFixed(1);
    } catch {}
    results.push({ label, rawKiB: r.rawKiB, gzipKiB: r.gzipKiB, gzipL9KiB: gzipL9, error: r.error });
    fs.rmSync(outdir, { recursive: true, force: true }); // keep out/ small
  });
  fs.rmSync(path.join(OUT, 'bundle-probe'), { recursive: true, force: true });
  return results;
}

export function measureAll() {
  fs.mkdirSync(OUT, { recursive: true });
  const out = {};
  for (const [key, label, cfg] of [
    ['A', 'A: spike worker, wrangler.toml (aws-sdk + node-ensure stubs)', 'spike/docs/wrangler.toml'],
    ['B', 'B: spike worker, wrangler.fixed.toml (+ pdfkit standalone alias)', 'spike/docs/wrangler.fixed.toml'],
  ]) {
    const dir = path.join(OUT, 'bundle', key);
    const r = dryRunBuild(cfg, dir);
    if (r.ok) {
      const b = fs.readFileSync(path.join(dir, 'worker.js'));
      r.rawBytes = b.length;
      r.gzipL9KiB = +(zlib.gzipSync(b, { level: 9 }).length / 1024).toFixed(1);
      r.attribution = attribute(dir);
    }
    out[label] = r;
  }
  out.noalias = dryRunBuild('spike/docs/wrangler.noalias.toml', path.join(OUT, 'bundle', 'noalias'));
  out.probes = measureProbes();
  return out;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const r = measureAll();
  fs.writeFileSync(path.join(OUT, 'bundle-size.json'), JSON.stringify(r, null, 2));
  console.log(JSON.stringify(r, null, 2));
}
