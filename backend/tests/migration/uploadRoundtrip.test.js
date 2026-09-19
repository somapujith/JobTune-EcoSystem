/**
 * ADR-001 T4.5: upload / export round trip. Two mock servers imitate atsCheckerV2 (multipart parse, 5 MB limit, mimetype
 * allowlist with masked 500s) and resumeV2 export; quirks make one of them wrong in a specific way.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const JSZip = require('jszip');

const { main, pickFixtures, exportProblems, SAMPLE_RESUME } = require('../../scripts/migration/upload-roundtrip');
const { listZip, readZipEntry, inspectDocx, inspectPdf, docxText } = require('../../scripts/migration/lib/ziputil');
const { startMock, json, makeIo } = require('./helpers/mockServer');

const FIXTURES = path.resolve(__dirname, '..', '..', 'spike', 'docs', 'fixtures');
const HAVE_FIXTURES = fs.existsSync(path.join(FIXTURES, 'pdf-simple.pdf'));
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/** Minimal multipart/form-data parser: [{ name, filename, type, data }] */
function parseMultipart(body, contentType) {
  const m = /boundary=(?:"([^"]+)"|([^;]+))/.exec(contentType || '');
  if (!m) return [];
  const boundary = Buffer.from(`--${m[1] || m[2]}`);
  const parts = [];
  let pos = body.indexOf(boundary);
  while (pos !== -1) {
    const next = body.indexOf(boundary, pos + boundary.length);
    if (next === -1) break;
    const raw = body.slice(pos + boundary.length + 2, next - 2); // strip CRLF after boundary and before the next
    const sep = raw.indexOf('\r\n\r\n');
    if (sep !== -1) {
      const head = raw.slice(0, sep).toString('utf8');
      const name = /name="([^"]*)"/.exec(head);
      const filename = /filename="([^"]*)"/.exec(head);
      const type = /Content-Type:\s*([^\r\n]+)/i.exec(head);
      parts.push({ name: name && name[1], filename: filename && filename[1], type: type && type[1].trim(), data: raw.slice(sep + 4) });
    }
    pos = next;
  }
  return parts;
}

async function makeDocx(text) {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>');
  const paras = text.split('\n').map((l) => `<w:p><w:r><w:t>${l.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</w:t></w:r></w:p>`).join('');
  zip.file('word/document.xml', `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paras}</w:body></w:document>`);
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

const ALLOWED = ['application/pdf', DOCX_MIME, 'text/plain'];
const SIMPLE_PDF = HAVE_FIXTURES ? fs.readFileSync(path.join(FIXTURES, 'pdf-simple.pdf')) : Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');

function docServer(q = {}) {
  return startMock((rec, body, res) => {
    const auth = (rec.headers.authorization || '').replace('Bearer ', '');
    const isApi = rec.path === '/api/ats/v2/parse' || rec.path === '/api/resume/v2/export' || rec.path === '/api/resume/upload';
    if (!isApi) return false;
    if (auth !== 'tok2' && auth !== 'tok1') return json(res, 401, { error: 'Unauthorized' });
    if (rec.path !== '/api/resume/upload' && auth === 'tok1') return json(res, 403, { error: 'This feature requires a higher subscription plan.', code: 'PLAN_UPGRADE_REQUIRED', requiredPlan: 'Tune & Polish', currentPlan: 'Learn & Build' });

    if (rec.path === '/api/ats/v2/parse' || rec.path === '/api/resume/upload') {
      const parts = parseMultipart(body, rec.headers['content-type']);
      const file = parts.find((p) => p.name === 'resume' && p.filename !== null && p.filename !== undefined);
      if (!file) return json(res, 400, { status: 'error', message: 'No file uploaded' });
      const limit = rec.path === '/api/resume/upload' ? 10 * 1024 * 1024 : 5 * 1024 * 1024;
      if (!q.noAllowlist && !ALLOWED.includes(file.type)) return json(res, 500, { error: 'Internal Server Error' });
      if (!q.noLimit && file.data.length > limit) return json(res, 500, { error: 'Internal Server Error' });
      let text;
      if (file.type === 'text/plain') text = file.data.toString('utf8');
      else if (file.type === DOCX_MIME) { const d = inspectDocx(file.data); text = d.text || ''; if (q.docxUpper) text = text.toUpperCase(); } else text = file.data.toString('latin1').replace(/[^\x20-\x7e\n]/g, '').slice(0, 200);
      if (q.whitespaceOnly) text = `${text}\n\n`.replace(/ /g, '  ');
      if (!text.trim()) return json(res, 400, { status: 'error', message: 'Could not extract text from file' });
      return json(res, 200, { status: 'success', resumeText: text.trim(), fileName: file.filename, fileSize: file.data.length });
    }

    // export
    const { resumeText, format } = rec.json || {};
    const send = (bytes, type, disp, extra = {}) => { res.writeHead(200, { 'Content-Type': type, ...(disp ? { 'Content-Disposition': disp } : {}), 'Content-Length': bytes.length, ...extra }); res.end(bytes); };
    (async () => {
      if (format === 'pdf') {
        const bytes = q.pdfNoEof ? Buffer.from(SIMPLE_PDF.subarray(0, SIMPLE_PDF.lastIndexOf('%%EOF'))) : SIMPLE_PDF;
        return send(bytes, q.wrongType ? 'text/plain' : 'application/pdf', q.noDisposition ? null : 'attachment; filename="resume.pdf"');
      }
      if (format === 'docx') {
        let bytes = await makeDocx(q.docxTextChange ? `${resumeText}\nEXTRA` : resumeText);
        if (q.docxBroken) bytes = Buffer.from('PK\x03\x04 this is not really a zip');
        if (q.docxNoDocument) { const z = new JSZip(); z.file('[Content_Types].xml', '<x/>'); bytes = await z.generateAsync({ type: 'nodebuffer' }); }
        return send(bytes, DOCX_MIME, 'attachment; filename="resume.docx"');
      }
      return send(Buffer.from(q.txtChange ? `${resumeText}!` : resumeText), 'text/plain; charset=utf-8', 'attachment; filename="resume.txt"');
    })();
    return true;
  });
}

let tmp;
let render;
let workers;
beforeAll(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'upload-')); });
afterAll(() => { fs.rmSync(tmp, { recursive: true, force: true }); });
afterEach(async () => { if (render) await render.close(); if (workers) await workers.close(); render = undefined; workers = undefined; });

async function setup(rq, wq) { if (render) await render.close(); if (workers) await workers.close(); render = await docServer(rq); workers = await docServer(wq); }
const argv = (extra = []) => ['--render', render.url, '--workers', workers.url, '--delay-ms', '0', '--budget', '0', '--timeout-ms', '20000', ...extra];
const status = (io, id) => ((io.text().split('\n').find((l) => l.includes(` ${id} `)) || '').trim().split(/\s+/)[0] || '').toLowerCase();

describe('zip / pdf inspection helpers', () => {
  it('lists and reads a DOCX built with jszip, extracts text', async () => {
    const buf = await makeDocx('Hello & goodbye\nsecond line');
    const z = listZip(buf);
    expect(z.ok).toBe(true);
    expect(z.entries.map((e) => e.name)).toEqual(expect.arrayContaining(['[Content_Types].xml', 'word/document.xml']));
    expect(readZipEntry(buf, z.entries.find((e) => e.name === 'word/document.xml')).toString()).toMatch(/<w:document/);
    const d = inspectDocx(buf);
    expect(d.valid).toBe(true);
    expect(d.text).toBe('Hello & goodbye\nsecond line');
    expect(docxText('<w:p><w:r><w:t xml:space="preserve">a</w:t></w:r><w:r><w:t>b</w:t></w:r></w:p>')).toBe('ab');
  });
  it('rejects non-zip, truncated and incomplete DOCX', async () => {
    expect(inspectDocx(Buffer.from('not a zip at all, definitely')).valid).toBe(false);
    const buf = await makeDocx('x');
    expect(inspectDocx(buf.slice(0, buf.length - 10)).valid).toBe(false);
    const z = new JSZip(); z.file('[Content_Types].xml', '<x/>');
    expect(inspectDocx(await z.generateAsync({ type: 'nodebuffer' })).problems).toContain('missing word/document.xml');
  });
  it('PDF: header and trailing %%EOF', () => {
    expect(inspectPdf(Buffer.from('%PDF-1.7\nbody\n%%EOF\n')).valid).toBe(true);
    expect(inspectPdf(Buffer.from('%PDF-1.7\nbody')).problems.join()).toMatch(/%%EOF/);
    expect(inspectPdf(Buffer.from('<html>not a pdf</html>')).problems.join()).toMatch(/%PDF-/);
  });
  (HAVE_FIXTURES ? it : it.skip)('the spike PDF fixture is structurally valid', () => {
    expect(inspectPdf(fs.readFileSync(path.join(FIXTURES, 'pdf-simple.pdf'))).valid).toBe(true);
  });
  it('exportProblems flags wrong type, missing disposition and length mismatch', async () => {
    const mk = (over = {}) => {
      const { headers, ...rest } = over;
      return { status: 200, contentType: 'application/pdf', bytes: Buffer.from('%PDF-1.4\n%%EOF\n'), ...rest, headers: new Headers({ 'content-disposition': 'attachment; filename="a.pdf"', 'content-length': '15', ...(headers || {}) }) };
    };
    expect(await exportProblems(mk(), 'pdf')).toEqual([]);
    expect((await exportProblems(mk({ contentType: 'text/html' }), 'pdf')).join()).toMatch(/Content-Type/);
    expect((await exportProblems(mk({ headers: { 'content-disposition': 'inline' } }), 'pdf')).join()).toMatch(/Content-Disposition/);
    expect((await exportProblems(mk({ headers: { 'content-length': '999' } }), 'pdf')).join()).toMatch(/Content-Length/);
  });
});

describe('pickFixtures', () => {
  it('round-robins across pdf / docx / txt and honours the limit', () => {
    const d = path.join(tmp, 'fx'); fs.mkdirSync(d);
    ['a.pdf', 'b.pdf', 'c.pdf', 'a.docx', 'b.docx', 'a.txt', 'ignored.md'].forEach((n) => fs.writeFileSync(path.join(d, n), 'x'));
    expect(pickFixtures(d, 5).map((f) => f.name)).toEqual(['a.pdf', 'a.docx', 'a.txt', 'b.pdf', 'b.docx']);
    expect(pickFixtures(d, 99).map((f) => f.name)).toHaveLength(6);
    expect(() => pickFixtures(path.join(tmp, 'missing'), 3)).toThrow(/cannot read/);
  });
});

describe('upload-roundtrip against two mock servers', () => {
  (HAVE_FIXTURES ? it : it.skip)('correct pair: uploads, limits and exports all pass; the synthetic fixtures are used by default', async () => {
    await setup();
    const io = makeIo({ JT_TEST_TOKEN: 'tok2' });
    const code = await main(argv(['--limit', '6']), io);
    expect(io.text()).toMatch(/RESULT: PASS/);
    expect(code).toBe(0);
    for (const id of ['L:no-file', 'L:bad-mimetype', 'L:over-5mb', 'E:pdf', 'E:docx', 'E:txt']) expect([id, status(io, id)]).toEqual([id, 'pass']);
    expect(io.text()).toMatch(/U:pdf-[a-z0-9-]+\.pdf/);
    expect(io.text()).toMatch(/SYNTHETIC|synthetic/);
    expect(render.requests.length).toBe(workers.requests.length);
    // the oversize and export requests really carried what they claim
    expect(render.requests.some((r) => r.body.length > 5 * 1024 * 1024)).toBe(true);
    expect(render.requests.find((r) => r.path === '/api/resume/v2/export').json).toMatchObject({ format: 'pdf', resumeText: SAMPLE_RESUME });
  });

  it('a custom --fixtures dir with txt/docx files works and ignores unsupported extensions', async () => {
    const d = path.join(tmp, 'mine'); fs.mkdirSync(d);
    fs.writeFileSync(path.join(d, 'r1.txt'), 'Plain text resume\nSkills: JS');
    fs.writeFileSync(path.join(d, 'r2.docx'), await makeDocx('Docx resume\nSkills: SQL'));
    fs.writeFileSync(path.join(d, 'notes.md'), '# ignored');
    await setup();
    const io = makeIo({ JT_TEST_TOKEN: 'tok2' });
    expect(await main(argv(['--fixtures', d, '--no-limits']), io)).toBe(0);
    expect(status(io, 'U:r1.txt')).toBe('pass');
    expect(status(io, 'U:r2.docx')).toBe('pass');
    expect(io.text()).not.toMatch(/notes\.md/);
    expect(io.text()).not.toMatch(/synthetic; use --fixtures/);
  });

  describe('failures on Workers', () => {
    let fx;
    beforeAll(async () => {
      fx = path.join(tmp, 'fx2'); fs.mkdirSync(fx);
      fs.writeFileSync(path.join(fx, 'r.txt'), 'Plain text resume\nSkills: JS');
      fs.writeFileSync(path.join(fx, 'r.docx'), await makeDocx('Docx resume\nSkills: SQL'));
    });
    const run = async (wq, extra = []) => { await setup({}, wq); const io = makeIo({ JT_TEST_TOKEN: 'tok2' }); const code = await main(argv(['--fixtures', fx, ...extra]), io); return { io, code }; };

    it('different extracted DOCX text: U:docx fails', async () => {
      const { io, code } = await run({ docxUpper: true });
      expect(code).toBe(1);
      expect(status(io, 'U:r.docx')).toBe('fail');
      expect(io.text()).toMatch(/resumeText differs/);
      expect(status(io, 'U:r.txt')).toBe('pass');
    });
    it('whitespace-only difference fails unless --allow-whitespace-diff', async () => {
      const a = await run({ whitespaceOnly: true });
      expect(status(a.io, 'U:r.txt')).toBe('fail');
      expect(a.io.text()).toMatch(/except for whitespace/);
      const b = await run({ whitespaceOnly: true }, ['--allow-whitespace-diff']);
      expect(status(b.io, 'U:r.txt')).toBe('pass');
    });
    it('missing mimetype allowlist (item 25): the PNG is accepted on Workers, so L:bad-mimetype fails', async () => {
      const { io } = await run({ noAllowlist: true });
      expect(status(io, 'L:bad-mimetype')).toBe('fail');
      expect(io.text()).toMatch(/status 500 \(Render\) vs 200 \(Workers\)/);
    });
    it('missing 5 MB cap (item 25): L:over-5mb fails', async () => {
      const { io } = await run({ noLimit: true });
      expect(status(io, 'L:over-5mb')).toBe('fail');
    });
    it('PDF export without %%EOF, wrong content type, missing disposition: E:pdf fails with each problem', async () => {
      const { io } = await run({ pdfNoEof: true, wrongType: true, noDisposition: true }, ['--no-limits']);
      expect(status(io, 'E:pdf')).toBe('fail');
      expect(io.text()).toMatch(/Workers: PDF: no %%EOF/);
      expect(io.text()).toMatch(/Workers: Content-Type text\/plain/);
      expect(io.text()).toMatch(/Workers: Content-Disposition/);
    });
    it('corrupt / incomplete DOCX export fails', async () => {
      const a = await run({ docxBroken: true }, ['--no-limits']);
      expect(status(a.io, 'E:docx')).toBe('fail');
      expect(a.io.text()).toMatch(/Workers: DOCX:/);
      const b = await run({ docxNoDocument: true }, ['--no-limits']);
      expect(b.io.text()).toMatch(/missing word\/document\.xml/);
    });
    it('valid but different exported text fails (DOCX text, TXT bytes)', async () => {
      const { io } = await run({ docxTextChange: true, txtChange: true }, ['--no-limits']);
      expect(io.text()).toMatch(/extracted text differs/);
      expect(status(io, 'E:txt')).toBe('fail');
      expect(io.text()).toMatch(/TXT bytes differ/);
    });
  });

  it('a tier-1 token is INCONCLUSIVE (not a pass) and fails the run', async () => {
    await setup();
    const io = makeIo({ JT_TEST_TOKEN: 'tok1' });
    const d = path.join(tmp, 'fx3'); fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(path.join(d, 'r.txt'), 'x y z');
    expect(await main(argv(['--fixtures', d, '--no-limits']), io)).toBe(1);
    expect(io.text()).toMatch(/INCONCLUSIVE[\s\S]*below tier 2/);
  });

  it('login credentials need --test-account-only; without any credentials it refuses', async () => {
    await setup();
    expect(await main(argv(), makeIo({ JT_TEST_EMAIL: 'a@b.test', JT_TEST_PASSWORD: 'x' }))).toBe(64);
    const io = makeIo({});
    expect(await main(argv(), io)).toBe(64);
    expect(io.errText()).toMatch(/authenticated tier-2\+ test account/);
    expect(render.requests).toHaveLength(0);
  });

  it('--resume-id needs --allow-writes; with it the ATS exports run and are validated', async () => {
    await setup();
    expect(await main(argv(['--resume-id', '5']), makeIo({ JT_TEST_TOKEN: 'tok2' }))).toBe(64);
    for (const s of [render, workers]) s.setHandler((rec, body, res) => {
      if (rec.path.startsWith('/api/ats/export/')) {
        const fmt = rec.path.split('/').pop();
        if (fmt === 'txt') { res.writeHead(200, { 'Content-Type': 'text/plain', 'Content-Disposition': 'attachment; filename="optimized-resume.txt"', 'Content-Length': 5 }); res.end('hello'); return true; }
        makeDocx('saved resume').then((b) => { res.writeHead(200, { 'Content-Type': DOCX_MIME, 'Content-Disposition': 'attachment; filename="optimized-resume.docx"', 'Content-Length': b.length }); res.end(b); });
        return true;
      }
      return false;
    });
    const d = path.join(tmp, 'fx4'); fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(path.join(d, 'r.txt'), 'x y z');
    const io = makeIo({ JT_TEST_TOKEN: 'tok2' });
    await main(argv(['--fixtures', d, '--no-limits', '--resume-id', '5', '--allow-writes']), io);
    expect(status(io, 'E:ats-docx')).toBe('pass');
    expect(status(io, 'E:ats-txt')).toBe('pass');
    expect(render.requests.find((r) => r.path === '/api/ats/export/docx').json).toEqual({ resumeId: 5 });
  });

  it('refuses identical URLs and --dry-run sends nothing', async () => {
    await setup();
    expect(await main(['--render', render.url, '--workers', render.url], makeIo({ JT_TEST_TOKEN: 'tok2' }))).toBe(64);
    const io = makeIo({});
    expect(await main(argv(['--dry-run', '--include-10mb']), io)).toBe(0);
    expect(io.text()).toMatch(/would POST \/api\/resume\/upload/);
    expect(io.text()).toMatch(/would POST \/api\/resume\/v2\/export\s+format pdf/);
    expect(render.requests).toHaveLength(0);
    expect(workers.requests).toHaveLength(0);
  });
});
