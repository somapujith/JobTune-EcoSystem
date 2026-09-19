// Phase 0 spike S1-S6 + S12 harness (ADR-001 s5).
//   node spike/docs/run.mjs            (from backend/)
// (a) fixtures  (b) Node REFERENCE outputs from the real src code  (c) spawn `wrangler dev --local`
// (d) call every endpoint per fixture + compare  (e) validate generated PDF/DOCX  (f) results.json + table
// (g) always kill wrangler.  Bundle sizes come from bundle-size.mjs (wrangler deploy --dry-run only).
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { makeFixtures, FIX } from './make-fixtures.mjs';
import { startDev, stopDev } from './devserver.mjs';
import { measureAll } from './bundle-size.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const backend = path.resolve(here, '..', '..');
const OUT = path.join(here, 'out');
const req = createRequire(path.join(backend, 'package.json'));
const PORT = Number(process.env.SPIKE_DOCS_PORT || 8871);
const SKIP_BUNDLE = process.argv.includes('--skip-bundle');
const MIME_PDF = 'application/pdf';
const MIME_DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

// ---------- Node reference implementations (REAL code) ----------------------------------------
const pdfParse = req('pdf-parse');
const mammoth = req('mammoth');
const unzipper = req('unzipper');
const xml2js = req('xml2js');
const JSZip = req('jszip');
const PDFDocument = req('pdfkit');
const docxLib = req('docx');
const { extractTextFromFile } = req('./src/utils/fileParser.js'); // real src
const ResumeExport = req('./src/services/resumeExport.js'); // real src (CJS class)
const ResumeExportEngine = req('./src/services/v2/resumeExportEngine.js'); // real src (CJS class)

// verbatim replicas of routes/resume.js markdownToPdfBuffer / markdownToDocxBuffer (not exported; the
// route module needs the DB pool so it is not imported)
function markdownToPdfBuffer(markdownText) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 48 });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    for (const rawLine of String(markdownText || '').split(/\r?\n/)) {
      const line = rawLine || ' ';
      if (line.startsWith('# ')) doc.fontSize(18).font('Helvetica-Bold').text(line.replace(/^#\s*/, ''), { paragraphGap: 8 });
      else if (line.startsWith('## ')) {
        doc.moveDown(0.4);
        doc.fontSize(13).font('Helvetica-Bold').text(line.replace(/^##\s*/, ''), { paragraphGap: 6 });
      } else if (line.startsWith('- ')) doc.fontSize(11).font('Helvetica').text(`• ${line.replace(/^-\s*/, '')}`, { paragraphGap: 4 });
      else doc.fontSize(11).font('Helvetica').text(line, { paragraphGap: 5 });
    }
    doc.end();
  });
}
async function markdownToDocxBuffer(md) {
  const { Document, Paragraph, TextRun, HeadingLevel, Packer } = docxLib;
  const ps = [];
  for (const line of String(md || '').split(/\r?\n/)) {
    if (!line.trim()) ps.push(new Paragraph({ text: '' }));
    else if (line.startsWith('# ')) ps.push(new Paragraph({ text: line.replace(/^#\s*/, ''), heading: HeadingLevel.TITLE }));
    else if (line.startsWith('## ')) ps.push(new Paragraph({ text: line.replace(/^##\s*/, ''), heading: HeadingLevel.HEADING_2 }));
    else if (line.startsWith('- ')) ps.push(new Paragraph({ children: [new TextRun(line.replace(/^-\s*/, ''))], bullet: { level: 0 } }));
    else ps.push(new Paragraph({ children: [new TextRun(line)] }));
  }
  return Packer.toBuffer(new Document({ sections: [{ properties: {}, children: ps }] }));
}

// ---------- helpers -------------------------------------------------------------------------------
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const norm = (s) => String(s).replace(/\s+/g, ' ').trim();
const median = (a) => (a.length ? [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)] : null);
const r1 = (x) => (x == null ? null : Math.round(x * 10) / 10);
// IMPORTANT: fs.readFileSync() on files < 4 KiB returns a slice of Node's shared Buffer pool (byteOffset != 0).
// pdf-parse 1.1.4 (pdf.js v1.10.100) mis-parses such buffers ("bad XRef entry"); see negative control below.
// All fixtures are therefore copied into an exact, offset-0 Buffer (which is what Buffer.from(arrayBuffer) gives in a Worker).
const exact = (b) => {
  const o = Buffer.from(new ArrayBuffer(b.length));
  b.copy(o);
  return o;
};
const rd = (f) => exact(fs.readFileSync(path.join(FIX, f)));

async function call(base, ep, body, headers = {}, timeoutMs = 90000) {
  const t = performance.now();
  try {
    const r = await fetch(base + ep, { method: 'POST', body, headers, signal: AbortSignal.timeout(timeoutMs) });
    const buf = Buffer.from(await r.arrayBuffer());
    const wall = performance.now() - t;
    const ct = r.headers.get('content-type') || '';
    if (ct.includes('json')) {
      let j;
      try {
        j = JSON.parse(buf.toString('utf8'));
      } catch {
        j = { ok: false, stage: 'transport', error: 'bad json: ' + buf.toString('utf8').slice(0, 200) };
      }
      return { status: r.status, ok: !!j.ok, json: j, wall };
    }
    return { status: r.status, ok: r.headers.get('x-spike-ok') === '1', bytes: buf, wall, hdr: r.headers };
  } catch (e) {
    return { status: 0, ok: false, json: { ok: false, stage: 'transport', error: (e && e.message) || String(e) }, wall: performance.now() - t };
  }
}
const errOf = (r) => (r.json && !r.json.ok ? `[${r.json.stage}] ${String(r.json.error).split('\n')[0]}` : r.ok ? null : `HTTP ${r.status}`);

// ---------- PDF / DOCX validation ------------------------------------------------------------------
function tokensOf(src) {
  const out = new Set();
  for (const t of src.replace(/^#+\s*/gm, '').split(/\s+/)) {
    const w = t.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
    if (w.length >= 3) out.add(w.normalize('NFC'));
  }
  return [...out];
}
function coverage(text, src) {
  const hay = text.normalize('NFC').replace(/\s+/g, '');
  const toks = tokensOf(src);
  const missing = toks.filter((t) => !hay.includes(t.replace(/\s+/g, '')));
  return { total: toks.length, found: toks.length - missing.length, missing: missing.slice(0, 8) };
}
async function validatePdf(bytes, src) {
  const head = bytes.subarray(0, 5).toString('latin1');
  const tail = bytes.subarray(Math.max(0, bytes.length - 1024)).toString('latin1');
  const v = { size: bytes.length, header: head === '%PDF-', eof: tail.includes('%%EOF') };
  try {
    const p = await pdfParse(new Uint8Array(bytes));
    v.parseOk = true;
    v.pages = p.numpages;
    v.cov = coverage(p.text, src);
    v.text = p.text;
  } catch (e) {
    v.parseOk = false;
    v.parseError = e.message;
  }
  v.valid = v.header && v.eof && v.parseOk;
  return v;
}
function pdfStreams(buf) {
  const s = buf.toString('latin1');
  const out = [];
  const re = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let m;
  while ((m = re.exec(s))) {
    const raw = Buffer.from(m[1], 'latin1');
    try {
      out.push(zlib.inflateSync(raw).toString('latin1'));
    } catch {
      out.push('RAW:' + m[1]);
    }
  }
  return out;
}
const maskPdf = (b) =>
  b
    .toString('latin1')
    .replace(/\/(CreationDate|ModDate) \(D:[^)]*\)/g, '/$1 (MASK)')
    .replace(/\/ID \[[^\]]*\]/g, '/ID [MASK]');
function comparePdfs(a, b) {
  const sa = pdfStreams(a),
    sb = pdfStreams(b);
  return {
    byteEqual: a.equals(b),
    maskedByteEqual: maskPdf(a) === maskPdf(b),
    streamsEqual: sa.length === sb.length && sa.every((x, i) => x === sb[i]),
    sizeA: a.length,
    sizeB: b.length,
  };
}
async function zipEntries(buf) {
  const z = await JSZip.loadAsync(buf);
  const m = new Map();
  for (const name of Object.keys(z.files)) {
    if (z.files[name].dir) continue;
    const data = await z.files[name].async('nodebuffer');
    const txt = /\.(xml|rels)$/.test(name) ? data.toString('utf8').replace(/<dcterms:(created|modified)([^>]*)>[^<]*<\/dcterms:\1>/g, '<dcterms:$1$2>MASK</dcterms:$1>') : data.toString('base64');
    m.set(name, txt);
  }
  return m;
}
async function validateDocx(bytes, src) {
  const v = { size: bytes.length };
  try {
    const entries = await zipEntries(bytes);
    v.zipOk = true;
    v.hasDocXml = entries.has('word/document.xml');
    v.hasContentTypes = entries.has('[Content_Types].xml');
    let xmlOk = true;
    for (const [n, x] of entries) if (/\.(xml|rels)$/.test(n)) {
      try {
        await new xml2js.Parser().parseStringPromise(x);
      } catch {
        xmlOk = false;
        v.badXml = n;
      }
    }
    v.allXmlWellFormed = xmlOk;
    const t = (await mammoth.extractRawText({ buffer: Buffer.from(bytes) })).value;
    v.cov = coverage(t, src);
    v.mammothTextLen = t.length;
  } catch (e) {
    v.zipOk = false;
    v.error = e.message;
  }
  v.valid = !!(v.zipOk && v.hasDocXml && v.hasContentTypes && v.allXmlWellFormed && v.mammothTextLen > 0);
  return v;
}
async function compareDocx(a, b) {
  const ea = await zipEntries(a),
    eb = await zipEntries(b);
  const names = new Set([...ea.keys(), ...eb.keys()]);
  const diff = [...names].filter((n) => ea.get(n) !== eb.get(n));
  return { byteEqual: a.equals(b), entriesEqual: diff.length === 0, differingEntries: diff.slice(0, 6), entryCount: [ea.size, eb.size] };
}

// ---------- result recording -----------------------------------------------------------------------
const rows = []; // one per (config, test, variant, fixture)
function rec(o) {
  rows.push(o);
}
function summarize() {
  const g = {};
  for (const r of rows) {
    const k = `${r.config}|${r.test}|${r.variant}`;
    (g[k] ||= []).push(r);
  }
  return Object.entries(g).map(([k, rs]) => {
    const [config, test, variant] = k.split('|');
    const n = rs.length;
    const workerOk = rs.filter((r) => r.workerOk).length;
    const good = rs.filter((r) => r.good).length; // per-test success criterion (see each test)
    const errs = {};
    for (const r of rs) if (r.error) errs[r.error] = (errs[r.error] || 0) + 1;
    const walls = rs.map((r) => r.wall).filter((x) => x != null);
    return {
      config,
      test,
      variant,
      n,
      workerOk,
      good,
      verdict: good === n ? 'PASS' : workerOk === 0 ? 'FAIL' : good === 0 ? 'FAIL' : 'PARTIAL',
      firstErrors: Object.entries(errs).slice(0, 3).map(([e, c]) => `${e} (x${c})`),
      notes: [...new Set(rs.map((r) => r.note).filter(Boolean))].slice(0, 4),
      coldMs: r1(walls[0]),
      warmMedianMs: r1(median(walls.slice(1))),
    };
  });
}

// ---------- reference data --------------------------------------------------------------------------
async function buildReferences(man) {
  const refs = { pdf: {}, docx: {} };
  const origErr = console.error;
  console.error = () => {};
  for (const f of [...man.pdf, ...man.tiny]) {
    const buf = rd(f.file);
    const t0 = performance.now();
    // REFERENCE uses a plain Uint8Array: pdf-parse 1.1.4 given a Node Buffer intermittently fails in Node itself
    // (see negative controls); the Uint8Array path is deterministic and correct.
    const p = await pdfParse(new Uint8Array(buf));
    const nodeMs = performance.now() - t0;
    let fp;
    try {
      fp = { text: await extractTextFromFile({ mimetype: MIME_PDF, buffer: buf }) };
    } catch (e) {
      fp = { error: e.message };
    }
    refs.pdf[f.file] = { text: p.text, pages: p.numpages, fp, nodeMs };
  }
  for (const f of man.docx) {
    const buf = rd(f.file);
    const zip = await JSZip.loadAsync(buf);
    const xml = await zip.file('word/document.xml').async('nodebuffer');
    const dir = await unzipper.Open.buffer(buf);
    const unzXml = await dir.files.find((x) => x.path === 'word/document.xml').buffer();
    let fp;
    try {
      fp = { text: await extractTextFromFile({ mimetype: MIME_DOCX, buffer: buf }) };
    } catch (e) {
      fp = { error: e.message };
    }
    refs.docx[f.file] = {
      xml,
      xmlSha: sha(xml),
      unzipperSha: sha(unzXml),
      mammoth: (await mammoth.extractRawText({ buffer: buf })).value,
      xml2js: await new xml2js.Parser().parseStringPromise(xml.toString('utf8')),
      fp,
    };
  }
  console.error = origErr;
  return refs;
}

// ---------- the matrix ---------------------------------------------------------------------------------
async function runMatrix(base, config, man, refs, { skipStandalone = false, only = null } = {}) {
  const want = (t) => !only || only.includes(t);
  // S1 ------------------------------------------------------------------------------------------------
  if (want('S1'))
    for (const [variant, qs] of [
      ['pdf-parse default entry, Buffer input (as fileParser.js)', 'v=default'],
      ['pdf-parse default entry, Uint8Array input', 'v=default&input=u8'],
      ['pdf.js v1.10.100 build imported directly, Buffer input', 'v=direct'],
      ['pdf.js v1.10.100 build imported directly, Uint8Array input', 'v=direct&input=u8'],
      ['unpdf 1.8.1 (fallback)', 'v=unpdf'],
    ]) {
      for (const f of [...man.pdf, ...man.tiny]) {
        const ref = refs.pdf[f.file];
        const r = await call(base, `/s1?${qs}`, rd(f.file));
        const exact = r.ok && r.json.text === ref.text;
        const normEq = r.ok && norm(r.json.text) === norm(ref.text);
        rec({
          config, test: 'S1', variant, fixture: f.file, workerOk: r.ok, wall: r.wall, error: errOf(r),
          good: variant.startsWith('unpdf') ? normEq : exact, exact, normEq,
          note: variant.startsWith('unpdf') ? 'good = whitespace-normalised equality with pdf-parse (exact equality not expected)' : null,
        });
      }
    }
  // S1/S12 concurrency: an isolate serves concurrent requests; pdf-parse keeps module-level state (PDFJS) --------
  if (want('S1')) {
    const fx = [...man.pdf, ...man.tiny];
    for (const [test, ep, hdr, label] of [
      ['S1', '/s1?v=default', {}, 'pdf-parse default entry, Buffer, 9 PDFs in PARALLEL x2 rounds'],
      ['S12', '/s12', { 'x-mime': MIME_PDF }, 'fileParser (PDF), 9 PDFs in PARALLEL x2 rounds'],
    ]) {
      for (let round = 0; round < 2; round++) {
        const rs = await Promise.all(fx.map((f) => call(base, ep, rd(f.file), hdr)));
        rs.forEach((r, i) => rec({ config, test, variant: label, fixture: fx[i].file + ' (round ' + (round + 1) + ')', workerOk: r.ok, wall: r.wall, error: errOf(r), good: r.ok && r.json.text === refs.pdf[fx[i].file].text }));
      }
    }
  }
  // S2 ------------------------------------------------------------------------------------------------
  if (want('S2'))
    for (const f of man.docx) {
      const ref = refs.docx[f.file];
      const r = await call(base, '/s2', rd(f.file));
      const same = r.ok && r.json.docXmlSha256 === ref.xmlSha && r.json.docXmlSha256 === ref.unzipperSha && r.json.docXmlLen === ref.xml.length;
      rec({ config, test: 'S2', variant: 'unzipper.Open.buffer', fixture: f.file, workerOk: r.ok, wall: r.wall, error: errOf(r), good: same });
    }
  // S3 / S3b (PDF generation) ---------------------------------------------------------------------------
  const pdfGen = async (test, ep, variant, inputs, nodeGen) => {
    for (const inp of inputs) {
      const src = rd(inp).toString('utf8');
      const r = await call(base, ep, src, { 'content-type': 'text/plain; charset=utf-8' });
      const row = { config, test, variant, fixture: inp, workerOk: r.ok, wall: r.wall, error: errOf(r), good: false };
      if (r.ok) {
        const v = await validatePdf(r.bytes, src);
        const nodePdf = await nodeGen(src);
        const nv = await validatePdf(nodePdf, src);
        const c = comparePdfs(r.bytes, nodePdf);
        const textEq = v.parseOk && nv.parseOk && v.text === nv.text;
        row.valid = v.valid;
        row.cov = `${v.cov?.found}/${v.cov?.total}`;
        row.nodeCov = `${nv.cov?.found}/${nv.cov?.total}`;
        row.cmp = { ...c, textEq };
        row.good = v.valid && textEq && v.cov?.found === nv.cov?.found;
        row.note = `masked-byte-identical=${c.maskedByteEqual} stream-identical=${c.streamsEqual}`;
        if (v.cov?.missing?.length) row.missing = v.cov.missing;
      }
      rec(row);
    }
  };
  if (want('S3')) {
    for (const variant of skipStandalone ? ['default'] : ['default', 'standalone'])
      await pdfGen('S3', `/s3?v=${variant}`, variant, ['md-resume.md', 'md-unicode.md', 'txt-long.txt'], markdownToPdfBuffer);
    await pdfGen('S3b', '/s3b', 'real resumeExportEngine.export(text,"pdf")', ['txt-engine.txt', 'md-resume.md', 'txt-long.txt'], async (t) => Buffer.from((await ResumeExportEngine.export(t, 'pdf')).content));
  }
  // S4 / S4b (DOCX generation) ----------------------------------------------------------------------------
  const docxGen = async (test, ep, variant, inputs, nodeGen) => {
    for (const inp of inputs) {
      const src = rd(inp).toString('utf8');
      const r = await call(base, ep, src, { 'content-type': 'text/plain; charset=utf-8' });
      const row = { config, test, variant, fixture: inp, workerOk: r.ok, wall: r.wall, error: errOf(r), good: false };
      if (r.ok) {
        const v = await validateDocx(r.bytes, src);
        const nodeDocx = Buffer.from(await nodeGen(src));
        const nv = await validateDocx(nodeDocx, src);
        const c = await compareDocx(r.bytes, nodeDocx);
        row.valid = v.valid;
        row.cov = `${v.cov?.found}/${v.cov?.total}`;
        row.nodeCov = `${nv.cov?.found}/${nv.cov?.total}`;
        row.cmp = c;
        row.good = v.valid && c.entriesEqual && v.cov?.found === nv.cov?.found;
        row.note = `zip-byte-identical=${c.byteEqual} entries-identical(after masking core.xml dates)=${c.entriesEqual}${c.entriesEqual ? '' : ' differ:' + c.differingEntries.join(',')}`;
        if (v.cov?.missing?.length) row.missing = v.cov.missing;
      }
      rec(row);
    }
  };
  if (want('S4')) {
    await docxGen('S4', '/s4', 'docx Packer.toBuffer (replica of resume.js)', ['md-resume.md', 'md-unicode.md', 'txt-long.txt'], markdownToDocxBuffer);
    await docxGen('S4b', '/s4b', 'real ResumeExport.toDOCX(text)', ['txt-engine.txt', 'md-resume.md', 'txt-long.txt'], (t) => ResumeExport.toDOCX(t));
  }
  // S5 --------------------------------------------------------------------------------------------------------
  if (want('S5'))
    for (const mode of ['buffer', 'arrayBuffer']) {
      for (const f of man.docx) {
        const ref = refs.docx[f.file];
        const r = await call(base, `/s5?mode=${mode}`, rd(f.file));
        rec({ config, test: 'S5', variant: `mammoth.extractRawText({${mode}})`, fixture: f.file, workerOk: r.ok, wall: r.wall, error: errOf(r), good: r.ok && r.json.text === ref.mammoth });
      }
    }
  // S6 --------------------------------------------------------------------------------------------------------
  if (want('S6')) {
    const samples = [
      ['inline-attrs', '<a x="1" y="2"><b>t</b><b>u</b><c/></a>'],
      ['cdata+entities', '<a><![CDATA[<raw & text>]]><b>&amp; &lt;x&gt; &#233;</b></a>'],
      ['malformed (error parity)', '<a><b></a>'],
    ];
    for (const f of man.docx) {
      const ref = refs.docx[f.file];
      const r = await call(base, '/s6', ref.xml);
      rec({ config, test: 'S6', variant: 'xml2js.Parser().parseStringPromise', fixture: f.file + ' (word/document.xml)', workerOk: r.ok, wall: r.wall, error: errOf(r), good: r.ok && JSON.stringify(r.json.result) === JSON.stringify(ref.xml2js) });
    }
    for (const [name, xml] of samples) {
      let expected;
      try {
        expected = { result: await new xml2js.Parser().parseStringPromise(xml) };
      } catch (e) {
        expected = { error: e.message };
      }
      const r = await call(base, '/s6', xml);
      const same = expected.error ? !r.ok && r.json.error === expected.error : r.ok && JSON.stringify(r.json.result) === JSON.stringify(expected.result);
      rec({ config, test: 'S6', variant: 'xml2js.Parser().parseStringPromise', fixture: 'sample:' + name, workerOk: expected.error ? true : r.ok, wall: r.wall, error: same ? null : errOf(r), good: same });
    }
  }
  // S12: real src/utils/fileParser.js ------------------------------------------------------------------------------
  if (want('S12')) {
    const check = async (f, mime, ref) => {
      const r = await call(base, '/s12', rd(f), { 'x-mime': mime });
      let good;
      if (ref.error) good = !r.ok && r.json.error === ref.error; // error parity
      else good = r.ok && r.json.text === ref.text;
      rec({ config, test: 'S12', variant: 'fileParser.extractTextFromFile (DOCX)', fixture: f, workerOk: ref.error ? true : r.ok, wall: r.wall, error: good ? null : errOf(r), good, note: ref.error ? 'Node also throws: parity checked' : null });
    };
    // PDF reference = correct text (Uint8Array pdf-parse). Node's own real-fileParser (Buffer) result is recorded as nodeRealOk.
    for (const f of [...man.pdf, ...man.tiny]) {
      const ref = { text: refs.pdf[f.file].text };
      const r = await call(base, '/s12', rd(f.file), { 'x-mime': MIME_PDF });
      const good = r.ok && r.json.text === ref.text;
      rec({ config, test: 'S12', variant: 'fileParser.extractTextFromFile' + (man.tiny.some((x) => x.file === f.file) ? ' (tiny PDF <2 KB)' : ' (PDF)'), fixture: f.file, workerOk: r.ok, wall: r.wall, error: good ? null : errOf(r) || 'text differs from reference', good, nodeRealOk: !refs.pdf[f.file].fp.error, note: 'nodeRealOk = real fileParser (Buffer) also succeeded in the Node reference run' });
    }
    for (const f of man.docx) await check(f.file, MIME_DOCX, refs.docx[f.file].fp);
    // unsupported mimetype: error parity
    const ref = await extractTextFromFile({ mimetype: 'text/plain', buffer: Buffer.from('x') }).then((t) => ({ text: t }), (e) => ({ error: e.message }));
    const r = await call(base, '/s12', 'x', { 'x-mime': 'text/plain' });
    rec({ config, test: 'S12', variant: 'fileParser.extractTextFromFile (DOCX)', fixture: '(unsupported mimetype text/plain)', workerOk: true, wall: r.wall, error: null, good: !r.ok && r.json.error === ref.error, note: 'error parity: ' + ref.error });
  }
}

// ---------- timing on large inputs ----------------------------------------------------------------------------
async function bench(base, ep, body, headers, n = 3) {
  await call(base, ep, body, headers); // warm
  const w = [];
  for (let i = 0; i < n; i++) w.push((await call(base, ep, body, headers)).wall);
  return r1(median(w));
}
async function nodeMedian(fn, n = 3) {
  try {
    await fn();
    const w = [];
    for (let i = 0; i < n; i++) {
      const t = performance.now();
      await fn();
      w.push(performance.now() - t);
    }
    return r1(median(w));
  } catch (e) {
    return 'ERR ' + e.message;
  }
}
async function timings(base, refs, { pdfkitOk }) {
  const out = {};
  {
    const w = [];
    for (let i = 0; i < 11; i++) w.push((await call(base, '/health', 'x')).wall);
    out['(baseline) /health round trip, no work'] = { worker: r1(median(w.slice(1))), node: null };
  }
  const long = rd('pdf-long-20p.pdf');
  const dl = rd('gen-long.docx');
  const txt = rd('txt-long.txt').toString('utf8');
  const docXml = refs.docx['gen-long.docx'].xml;
  out['S1 pdf-parse default, 20-page PDF'] = { worker: await bench(base, '/s1?v=default', long), node: await nodeMedian(() => pdfParse(new Uint8Array(long))) };
  out['S1 pdf.js direct, 20-page PDF'] = { worker: await bench(base, '/s1?v=direct', long), node: null };
  out['S1 unpdf, 20-page PDF'] = { worker: await bench(base, '/s1?v=unpdf', long), node: null };
  out['S2 unzipper Open.buffer, 300-para DOCX'] = { worker: await bench(base, '/s2', dl), node: await nodeMedian(async () => (await unzipper.Open.buffer(dl)).files.find((x) => x.path === 'word/document.xml').buffer()) };
  out['S5 mammoth arrayBuffer, 300-para DOCX'] = { worker: await bench(base, '/s5?mode=arrayBuffer', dl), node: await nodeMedian(() => mammoth.extractRawText({ buffer: dl })) };
  out['S6 xml2js, 300-para document.xml'] = { worker: await bench(base, '/s6', docXml), node: await nodeMedian(() => new xml2js.Parser().parseStringPromise(docXml.toString('utf8'))) };
  out['S12 fileParser PDF 20p'] = { worker: await bench(base, '/s12', long, { 'x-mime': MIME_PDF }), node: await nodeMedian(() => extractTextFromFile({ mimetype: MIME_PDF, buffer: long })) };
  out['S12 fileParser DOCX 300-para'] = { worker: await bench(base, '/s12', dl, { 'x-mime': MIME_DOCX }), node: await nodeMedian(() => extractTextFromFile({ mimetype: MIME_DOCX, buffer: dl })) };
  out['S4 docx Packer, 160-line md'] = { worker: await bench(base, '/s4', txt), node: await nodeMedian(() => markdownToDocxBuffer(txt)) };
  out['S4b real ResumeExport.toDOCX, 160-line'] = { worker: await bench(base, '/s4b', txt), node: await nodeMedian(() => ResumeExport.toDOCX(txt)) };
  if (pdfkitOk === 'standalone') {
    out['S3 pdfkit standalone, 160-line md'] = { worker: await bench(base, '/s3?v=standalone', txt), node: await nodeMedian(() => markdownToPdfBuffer(txt)) };
  } else if (pdfkitOk) {
    out['S3 pdfkit (aliased standalone), 160-line md'] = { worker: await bench(base, '/s3', txt), node: await nodeMedian(() => markdownToPdfBuffer(txt)) };
    out['S3b real ResumeExportEngine pdf, 160-line'] = { worker: await bench(base, '/s3b', txt), node: await nodeMedian(() => ResumeExportEngine.export(txt, 'pdf')) };
  }
  return out;
}

// ---------- main ------------------------------------------------------------------------------------------------
async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const man = await makeFixtures();
  console.log(`fixtures: ${man.pdf.length} PDF (synthetic), ${man.docx.length} DOCX (${man.docx.filter((d) => d.origin.startsWith('real')).length} real, ${man.docx.filter((d) => d.origin.startsWith('generated')).length} generated), ${man.gen.length} gen inputs`);
  const refs = await buildReferences(man);
  console.log('node references built');

  const results = { meta: { date: new Date().toISOString(), node: process.version, wrangler: req('wrangler/package.json').version, workerdLocal: true, note: 'local workerd does not enforce CPU-time limits; in-worker performance.now() is frozen during CPU work so wall time is client-side round-trip' }, fixtures: man, configs: {}, timings: {}, negative: {}, bundle: null };
  const skipCfg = {};

  // ---- config A : wrangler.toml (build stubs only) -------------------------------------------------------
  let dev;
  try {
    dev = await startDev({ config: 'spike/docs/wrangler.toml', port: PORT });
    console.log('config A ready', dev.base);
    await runMatrix(dev.base, 'A', man, refs);
    results.timings.A = await timings(dev.base, refs, { pdfkitOk: 'standalone' });
  } finally {
    stopDev();
  }
  // ---- config B : + pdfkit standalone alias --------------------------------------------------------------
  try {
    dev = await startDev({ config: 'spike/docs/wrangler.fixed.toml', port: PORT });
    console.log('config B ready', dev.base);
    await runMatrix(dev.base, 'B', man, refs, { skipStandalone: true, only: ['S3', 'S4'] });
    results.timings.B = await timings(dev.base, refs, { pdfkitOk: true });
  } finally {
    stopDev();
  }
  // ---- negative control : no node-ensure alias ------------------------------------------------------------
  try {
    dev = await startDev({ config: 'spike/docs/wrangler.noensure.toml', port: PORT });
    console.log('negative control ready', dev.base);
    for (const v of ['default', 'direct']) {
      const r = await call(dev.base, `/s1?v=${v}`, rd('pdf-simple.pdf'), {}, 20000);
      results.negative[`S1 ${v} without node-ensure alias`] = { status: r.status, error: errOf(r) };
    }
  } finally {
    stopDev();
  }

  // ---- negative control (Node only): pdf-parse called sequentially with Buffer vs Uint8Array input --------------
  {
    const seq = async (asU8) => {
      const out = [];
      for (const f of [...man.pdf, ...man.tiny, ...man.tiny]) {
        const b = rd(f.file);
        try {
          await pdfParse(asU8 ? new Uint8Array(b) : b);
          out.push('ok');
        } catch (e) {
          out.push('ERR ' + e.message);
        }
      }
      return out;
    };
    const origLog = console.log;
    console.log = () => {}; // pdf.js prints "Warning: Ignoring invalid character" on the corrupted parses
    const sb = await seq(false);
    const su = await seq(true);
    console.log = origLog;
    const tally = (a) => `${a.filter((x) => x === 'ok').length}/${a.length} ok${a.some((x) => x !== 'ok') ? '; errors: ' + [...new Set(a.filter((x) => x !== 'ok'))].join(' | ') : ''}`;
    results.negative['Node: pdf-parse(Buffer) over 7 padded + 2 tiny + 2 tiny PDFs, sequential'] = tally(sb);
    results.negative['Node: pdf-parse(new Uint8Array(buf)) same sequence'] = tally(su);
  }

  results.summary = summarize();
  results.rows = rows;

  if (!SKIP_BUNDLE) {
    console.log('measuring bundle sizes (wrangler deploy --dry-run) ...');
    results.bundle = measureAll();
  }
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2));

  // ---- print --------------------------------------------------------------------------------------------------
  const pad = (s, n) => String(s).padEnd(n).slice(0, n);
  console.log('\n' + pad('cfg', 4) + pad('test', 6) + pad('variant', 46) + pad('n', 4) + pad('wOk', 5) + pad('good', 5) + pad('verdict', 9) + pad('cold', 8) + pad('warmMed', 8) + 'first error');
  for (const s of results.summary) console.log(pad(s.config, 4) + pad(s.test, 6) + pad(s.variant, 46) + pad(s.n, 4) + pad(s.workerOk, 5) + pad(s.good, 5) + pad(s.verdict, 9) + pad(s.coldMs, 8) + pad(s.warmMedianMs, 8) + (s.firstErrors[0] || ''));
  console.log('\nnegative controls:', JSON.stringify(results.negative, null, 1));
  for (const cfg of ['A', 'B']) {
    console.log(`\ntimings (median wall ms, warm; config ${cfg}): worker vs node`);
    for (const [k, v] of Object.entries(results.timings[cfg])) console.log('  ' + pad(k, 48) + ' worker ' + pad(v.worker, 8) + ' node ' + v.node);
  }
  if (results.bundle) {
    console.log('\nbundle sizes:');
    for (const [k, v] of Object.entries(results.bundle)) {
      if (k === 'probes') for (const p of v) console.log(`  ${pad(p.label, 100)} raw ${pad(p.rawKiB, 9)} KiB  gzip ${pad(p.gzipKiB, 9)} KiB ${p.error ? 'ERR ' + p.error : ''}`);
      else console.log(`  ${pad(k, 70)} raw ${v.rawKiB} KiB gzip ${v.gzipKiB} KiB ${v.error ? 'ERR ' + v.error : ''}`);
    }
  }
  console.log('\nresults written to', path.join(OUT, 'results.json'));
}

main().then(
  () => {
    stopDev();
    process.exit(0);
  },
  (e) => {
    console.error('HARNESS FAILURE', e);
    stopDev();
    process.exit(1);
  }
);
