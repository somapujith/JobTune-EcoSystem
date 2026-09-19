'use strict';

/**
 * Worker ports of services/resumeDatabase.js, services/resumeExport.js and services/v2/resumeExportEngine.js.
 * Doc libraries come from the require()-based stand-in for the lazy-loader seam (Jest has no dynamic import());
 * the Node builds of pdfkit / docx are used, the workerd builds are proven by the wrangler dev run.
 * Each test compares against the ORIGINAL Express class where it is pure (parseResume, engine formats).
 */
jest.mock('../../../src/worker/services/docs/docLibs', () => require('./helpers/realDocLibs'));

const JSZip = require('jszip');
const { createResumeDatabase } = require('../../../src/worker/services/resumeDatabase');
const { createResumeExport } = require('../../../src/worker/services/resumeExport');
const { createResumeExportEngine } = require('../../../src/worker/services/v2/resumeExportEngine');
const { parsePdf } = require('../../../src/worker/services/docs/docText');
const { createDocsDb } = require('./helpers/docsHarness');

// The Express originals, for parity checks of the pure parts
const OriginalExport = require('../../../src/services/resumeExport');
const OriginalEngine = require('../../../src/services/v2/resumeExportEngine');

const SAMPLE = [
  'Jane Example',
  'jane@example.test',
  'PROFESSIONAL SUMMARY',
  'Engineer who ships.',
  'EXPERIENCE',
  'Senior Engineer | Example Corp | 2021 - Present',
  '• Built a REST API serving 50K users',
  'Plain experience line',
  'SKILLS',
  'JavaScript, SQL',
  'EDUCATION',
  'B.Sc. Computer Science',
  'PROJECTS',
  '• Side project one',
  'Side project two',
  'CERTIFICATIONS',
  'AWS Cloud Practitioner',
].join('\n');

const docXml = async (buf) => (await JSZip.loadAsync(buf)).file('word/document.xml').async('string');

describe('resumeDatabase (factory over the request db)', () => {
  let db;
  let svc;
  beforeEach(() => {
    db = createDocsDb();
    svc = createResumeDatabase({ db });
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  it('requires a db with query()', () => {
    expect(() => createResumeDatabase({})).toThrow(TypeError);
    expect(() => createResumeDatabase({ db: {} })).toThrow(TypeError);
  });

  it('saveResume inserts with JSON-stringified coverage / missing info and returns { id, created_at }', async () => {
    const row = await svc.saveResume(7, 'resume text', { total: 81, role: 'backend', keywordCoverage: { found: 3, total: 9 }, missingInfo: ['phone'] });
    expect(row).toEqual({ id: expect.any(Number), created_at: expect.any(Date) });
    const call = db.docCalls.at(-1);
    expect(call.params).toEqual([7, 'resume text', 81, 'backend', '{"found":3,"total":9}', '["phone"]']);
    expect(db.state.resumes[0]).toMatchObject({ user_id: 7, original_resume: 'resume text', original_score: 81, role_detected: 'backend' });
  });

  it('saveResume defaults: role null, coverage / missing info {}', async () => {
    await svc.saveResume(7, 't', { total: 1 });
    expect(db.docCalls.at(-1).params).toEqual([7, 't', 1, null, '{}', '{}']);
  });

  it('getResume is scoped by user; getUserResumes limits, orders and reports export_count', async () => {
    const a = await svc.saveResume(1, 'a', { total: 1 });
    await svc.saveResume(2, 'b', { total: 2 });
    const c = await svc.saveResume(1, 'c', { total: 3 });
    await svc.saveExport(a.id, 'docx', 'f.docx');
    expect((await svc.getResume(a.id, 1)).original_resume).toBe('a');
    expect(await svc.getResume(a.id, 2)).toBeUndefined();
    const list = await svc.getUserResumes(1, 10);
    expect(list.map((r) => r.id)).toEqual([c.id, a.id]);
    expect(list.find((r) => r.id === a.id).export_count).toBe('1');
    expect(await svc.getUserResumes(1, 1)).toHaveLength(1);
    expect(await svc.getUserResumes(1)).toHaveLength(2); // default limit 10
  });

  it('saveExport, updateOptimizedResume and deleteResume', async () => {
    const r = await svc.saveResume(1, 'orig', { total: 5 });
    expect(await svc.saveExport(r.id, 'txt', 'x.txt')).toEqual({ id: expect.any(Number) });
    expect(await svc.updateOptimizedResume(r.id, 'opt', 90)).toEqual({ id: r.id });
    expect(db.state.resumes[0]).toMatchObject({ optimized_resume: 'opt', optimized_score: 90 });
    expect(await svc.deleteResume(r.id, 2)).toBeUndefined();
    expect(await svc.deleteResume(r.id, 1)).toEqual({ id: r.id });
  });

  it('logs and rethrows the original error (same message text as Express)', async () => {
    const boom = new Error('connection reset');
    db.failWhenDocs((sql) => /INSERT INTO resumes/.test(sql), boom);
    await expect(svc.saveResume(1, 't', { total: 1 })).rejects.toBe(boom);
    expect(console.error).toHaveBeenCalledWith('Database save error:', boom);
    db.failWhenDocs((sql) => /SELECT \* FROM resumes/.test(sql), boom);
    await expect(svc.getResume(1, 1)).rejects.toBe(boom);
    expect(console.error).toHaveBeenCalledWith('Database query error:', boom);
    db.failWhenDocs((sql) => /INSERT INTO resume_exports/.test(sql), boom);
    await expect(svc.saveExport(1, 'txt', 'p')).rejects.toBe(boom);
    expect(console.error).toHaveBeenCalledWith('Export save error:', boom);
  });

  it('saveAnalysis builds the analyses upsert parameters with the original defaults', async () => {
    const calls = [];
    const fake = { query: async (sql, params) => { calls.push({ sql, params }); return { rows: [{ id: 9 }] }; } };
    const s = createResumeDatabase({ db: fake });
    expect(await s.saveAnalysis(4, {
      breakdown: { 'Section Completeness (30)': 25, 'Keyword Relevance (25)': 20, 'Formatting (15)': 12 },
      details: { actionVerbs: { count: 6 }, metrics: { count: 4 }, missingSections: ['skills'] },
      recommendations: ['add skills'],
    })).toEqual({ id: 9 });
    expect(calls[0].sql).toContain('ON CONFLICT (resume_id) DO UPDATE');
    expect(calls[0].params).toEqual([4, 25, 20, 12, 6, 4, '["skills"]', '["add skills"]']);
    await s.saveAnalysis(4, {});
    expect(calls[1].params).toEqual([4, 0, 0, 0, 0, 0, '[]', '[]']);
    // updateOptimizedResume chains saveAnalysis only when an analysis is given
    await s.updateOptimizedResume(4, 'o', 1);
    expect(calls).toHaveLength(3);
    await s.updateOptimizedResume(4, 'o', 1, {});
    expect(calls).toHaveLength(5);
  });
});

describe('resumeExport (DOCX / TXT)', () => {
  const svc = createResumeExport();
  beforeEach(() => jest.spyOn(console, 'error').mockImplementation(() => {}));
  afterEach(() => jest.restoreAllMocks());

  it('parseResume equals the Express class for the sample and for edge inputs', () => {
    for (const text of [SAMPLE, '', 'no headers here\njust lines', 'skills\nA\n\nexperience\nB | C', 'Header\r\nSUMMARY\r\nx\r\n']) {
      expect(svc.parseResume(text)).toEqual(OriginalExport.parseResume(text));
    }
    const p = svc.parseResume(SAMPLE);
    expect(p.experience).toEqual(['Senior Engineer | Example Corp | 2021 - Present', '• Built a REST API serving 50K users']);
    // preserved quirk: the patterns are un-anchored, so the body line "Plain experience line" is taken as a header
    // (it matches /EXPERIENCE/i), starts a new experience section and is itself dropped
    expect(JSON.stringify(p)).not.toContain('Plain experience line');
    // preserved quirk: everything before the first recognised header is dropped
    expect(JSON.stringify(p)).not.toContain('Jane Example');
  });

  it('toDOCX produces a valid DOCX zip with the same document.xml text as the Express export', async () => {
    const mine = await svc.toDOCX(SAMPLE, 'modern');
    const original = await OriginalExport.toDOCX(SAMPLE, 'modern');
    expect(Buffer.from(mine.subarray(0, 2)).toString()).toBe('PK');
    const zip = await JSZip.loadAsync(mine);
    expect(Object.keys(zip.files)).toEqual(expect.arrayContaining(['[Content_Types].xml', 'word/document.xml']));
    const strip = (xml) => xml.replace(/<w:t[^>]*>([^<]*)<\/w:t>/g, '[$1]').match(/\[[^\]]*\]/g).join('');
    const xml = await docXml(mine);
    expect(strip(xml)).toBe(strip(await docXml(original)));
    expect(xml).toContain('RESUME');
    expect(xml).toContain('PROFESSIONAL SUMMARY');
    expect(xml).toContain('Senior Engineer | Example Corp | 2021 - Present');
    expect(xml).toContain('Side project two');
    expect(xml).not.toContain('Jane Example'); // dropped by parseResume (preserved quirk)
    // whole document.xml equal too (the docx library is deterministic apart from core.xml dates)
    expect(xml).toBe(await docXml(original));
  });

  it('toDOCX with no recognised sections still yields a document (just the RESUME title)', async () => {
    const buf = await svc.toDOCX('nothing recognisable');
    expect(await docXml(buf)).toContain('RESUME');
  });

  it('toDOCX failure surfaces the original masked message and logs the cause', async () => {
    await expect(svc.toDOCX(undefined)).rejects.toThrow('Failed to export resume as DOCX');
    await expect(svc.toDOCX(42)).rejects.toThrow('Failed to export resume as DOCX');
    expect(console.error).toHaveBeenCalledWith('DOCX export error:', expect.any(Error));
  });

  it('toTXT returns a Buffer of the UTF-8 text and throws for a non-string (Buffer.from(undefined))', () => {
    const buf = svc.toTXT('héllo');
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.equals(OriginalExport.toTXT('héllo'))).toBe(true);
    // (Node core errors come from the outer realm under Jest, so match the message rather than the class)
    expect(() => svc.toTXT(undefined)).toThrow(/first argument must be/);
    expect(() => OriginalExport.toTXT(undefined)).toThrow(/first argument must be/);
  });

  it('generateFilename matches the original pattern', () => {
    expect(svc.generateFilename(5)).toMatch(/^resume_5_\d+\.docx$/);
    expect(svc.generateFilename(5, 'txt')).toMatch(/^resume_5_\d+\.txt$/);
  });

  it('buildDocumentParagraphs / createSectionHeader are async but return docx paragraphs', async () => {
    const paras = await svc.buildDocumentParagraphs(svc.parseResume(SAMPLE), 'modern');
    // title + 5 sections x (header + lines + spacer) minus the trailing spacer of the last section
    expect(paras.length).toBeGreaterThan(10);
    expect(await svc.createSectionHeader('X')).toBeDefined();
  });
});

describe('resumeExportEngine', () => {
  const engine = createResumeExportEngine();
  const LONG = SAMPLE + '\n' + 'x'.repeat(120);
  beforeEach(() => jest.spyOn(console, 'error').mockImplementation(() => {}));
  afterEach(() => jest.restoreAllMocks());

  it('txt: same result object as Express (content is the input string)', async () => {
    const mine = await engine.export(LONG, 'txt');
    const orig = await OriginalEngine.export(LONG, 'txt');
    expect({ ...mine, filename: 'F' }).toEqual({ ...orig, filename: 'F' });
    expect(mine.filename).toMatch(/^resume-\d+\.txt$/);
    expect(mine.content).toBe(LONG);
    // default format and unknown format fall through to txt
    expect((await engine.export(LONG)).format).toBe('txt');
    expect((await engine.export(LONG, 'weird')).format).toBe('txt');
  });

  it('docx: the preserved quirk, plain text under the DOCX mime type', async () => {
    const mine = await engine.export(LONG, 'DOCX');
    expect(mine).toMatchObject({
      format: 'docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      content: LONG,
      note: 'Import this text into Word to create DOCX',
    });
  });

  it('pdf: a valid Buffer PDF whose extracted text contains the resume lines', async () => {
    const r = await engine.export(LONG, 'pdf');
    expect(r).toMatchObject({ format: 'pdf', mimeType: 'application/pdf' });
    expect(r.filename).toMatch(/^resume-\d+\.pdf$/);
    expect(Buffer.isBuffer(r.content)).toBe(true);
    expect(r.content.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(r.content.subarray(-1024).toString('latin1')).toContain('%%EOF');
    const parsed = await parsePdf(new Uint8Array(r.content));
    for (const line of ['Jane Example', 'PROFESSIONAL SUMMARY', 'Engineer who ships.', 'Side project two']) {
      expect(parsed.text.replace(/\s+/g, ' ')).toContain(line);
    }
    // text identical to the Express engine's PDF (bytes differ by /ID and dates)
    const orig = await OriginalEngine.export(LONG, 'pdf');
    expect((await parsePdf(new Uint8Array(orig.content))).text).toBe(parsed.text);
  });

  it('rejects empty / non-string input and a null format like Express', async () => {
    await expect(engine.export('')).rejects.toThrow('Invalid resume text');
    await expect(engine.export(null)).rejects.toThrow('Invalid resume text');
    await expect(engine.export(5)).rejects.toThrow('Invalid resume text');
    await expect(engine.export('abc', null)).rejects.toThrow(TypeError);
  });

  it('validateExport: same verdicts as Express', () => {
    const cases = [
      ['x'.repeat(100), 'txt'],
      ['short', 'txt'],
      ['', 'txt'],
      [Buffer.from('x'.repeat(200)), 'pdf'],
      ['x'.repeat(200), 'pdf'], // string where a Buffer is required
      ['x'.repeat(200), 'PDF'], // upper-case format skips the buffer check (preserved quirk)
    ];
    for (const [content, format] of cases) {
      expect(engine.validateExport(content, format)).toEqual(OriginalEngine.validateExport(content, format));
    }
    expect(engine.validateExport('short', 'txt')).toEqual({ valid: false, errors: ['Content too short (minimum 100 characters)'] });
    expect(engine.validateExport('', 'txt').errors).toEqual(['Empty content', 'Content too short (minimum 100 characters)']);
    expect(engine.validateExport('x'.repeat(200), 'pdf').errors).toEqual(['PDF content must be a buffer']);
    expect(() => engine.validateExport(undefined, 'txt')).toThrow(TypeError);
  });

  it('getFileExtension / getMimeType', () => {
    for (const f of ['pdf', 'DOCX', 'txt', 'zip']) {
      expect(engine.getFileExtension(f)).toBe(OriginalEngine.getFileExtension(f));
      expect(engine.getMimeType(f)).toBe(OriginalEngine.getMimeType(f));
    }
    expect(engine.getMimeType('zip')).toBe('text/plain');
  });

  it('_formatPDFContent handles headers, bullets, blank lines and plain lines (parity with Express output)', async () => {
    const text = 'HEADER LINE\n\n- bullet one\n  * bullet two\nplain line\n' + 'y'.repeat(120);
    const mine = await engine.export(text, 'pdf');
    const orig = await OriginalEngine.export(text, 'pdf');
    expect((await parsePdf(new Uint8Array(mine.content))).text).toBe((await parsePdf(new Uint8Array(orig.content))).text);
  });
});
