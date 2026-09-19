// Generates fixtures into backend/spike/docs/fixtures/ (gitignored).
//   PDFs  : SYNTHETIC - generated with pdfkit in Node (no real resume PDFs exist in the repo).
//   DOCX  : generated with `docx` in Node + REAL Word/LibreOffice-authored files from
//           mammoth's test-data and the repo-root Syntax_Error_Correction_Tool_Report_Updated.docx.
//   MD/TXT: inputs for the document-GENERATION endpoints (/s3 /s3b /s4 /s4b).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const here = path.dirname(fileURLToPath(import.meta.url));
const backend = path.resolve(here, '..', '..');
const repoRoot = path.resolve(backend, '..');
const require = createRequire(path.join(backend, 'package.json'));
const PDFDocument = require('pdfkit');
const docx = require('docx');

export const FIX = path.join(here, 'fixtures');

// Real resume PDFs are tens of KB. pdf-parse 1.1.4 + Node Buffer input breaks for PDFs < 4 KiB (Buffer-pool
// bug, see run.mjs negative controls), so the main fixture set is padded to >= 8 KiB via a long Keywords entry in
// the Info dictionary (does not affect extracted page text). Two un-padded "tiny" PDFs exist for the bug repro.
const PAD = 'resume ats keyword padding '.repeat(320);
function pdfToBuffer(build, pad = true) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, info: { Title: 'spike fixture', ...(pad ? { Keywords: PAD } : {}) } });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    build(doc);
    doc.end();
  });
}

const LOREM = [
  'Designed and shipped a multi-tenant billing platform serving 40,000 monthly active users.',
  'Reduced p95 API latency from 820ms to 190ms by introducing read replicas and query caching.',
  'Led a team of five engineers; mentored two juniors to promotion within 18 months.',
  'Migrated a monolithic Rails codebase to services, cutting deploy time from 45 to 6 minutes.',
  'Built CI pipelines (GitHub Actions) with automated regression suites covering 92% of critical paths.',
  'Partnered with product and design to define quarterly OKRs and deliver on 11 of 12 milestones.',
];

const fixturePDFs = {
  'pdf-simple': (doc) => {
    doc.font('Helvetica-Bold').fontSize(20).text('Jane Q. Developer');
    doc.font('Helvetica').fontSize(11).text('jane@example.com | +1 555 0100 | github.com/janedev');
    doc.moveDown();
    doc.font('Helvetica-Bold').fontSize(13).text('SUMMARY');
    doc.font('Helvetica').fontSize(11).text('Full-stack engineer with 8 years of experience building web platforms in Node.js, React and PostgreSQL.');
    doc.moveDown();
    doc.font('Helvetica-Bold').fontSize(13).text('EDUCATION');
    doc.font('Helvetica').fontSize(11).text('B.Tech Computer Science, IIT Madras, 2016');
  },
  'pdf-multipage': (doc) => {
    doc.font('Helvetica-Bold').fontSize(18).text('Alexander P. Multipage');
    for (let s = 1; s <= 6; s++) {
      doc.moveDown().font('Helvetica-Bold').fontSize(13).text(`EXPERIENCE ${s} - Company ${String.fromCharCode(64 + s)} Inc.`);
      doc.font('Helvetica').fontSize(11);
      for (let i = 0; i < 12; i++) doc.text(LOREM[(i + s) % LOREM.length]);
    }
  },
  'pdf-bullets': (doc) => {
    doc.font('Helvetica-Bold').fontSize(18).text('Priya Bullets');
    doc.font('Helvetica-Bold').fontSize(13).text('PROFESSIONAL EXPERIENCE');
    doc.font('Helvetica').fontSize(11);
    for (const l of LOREM) doc.text('\u2022 ' + l, { indent: 12, paragraphGap: 3 });
    doc.moveDown().font('Helvetica-Bold').fontSize(13).text('SKILLS');
    doc.font('Helvetica').fontSize(11);
    doc.list(['JavaScript / TypeScript', 'Node.js, Express, Hono', 'PostgreSQL, Redis', 'AWS, Cloudflare Workers'], { bulletRadius: 2 });
  },
  'pdf-unicode': (doc) => {
    const arial = 'C:\\Windows\\Fonts\\arial.ttf';
    if (fs.existsSync(arial)) {
      doc.font(arial);
    } else {
      doc.font('Helvetica');
    }
    doc.fontSize(16).text('Résumé — José Müller');
    doc.fontSize(11);
    doc.text('Łódź · Zürich · São Paulo · Ελληνικά · Русский язык');
    doc.text('Salary expectation: €85,000 – €95,000 (≈ £74,000); “smart quotes” and an en–dash.');
    doc.text('\u2022 Trilingual: English, Español, Français');
    doc.text('\u2022 Wrote 3,000+ lines of C++ & Rust; ★★★★☆ rating');
  },
  'pdf-columns': (doc) => {
    // two-column layout with absolutely positioned text, like many real resumes
    doc.font('Helvetica-Bold').fontSize(18).text('Sam Columns', 50, 50);
    doc.font('Helvetica-Bold').fontSize(12).text('SKILLS', 50, 100);
    doc.font('Helvetica').fontSize(10);
    ['Python', 'SQL', 'Airflow', 'dbt', 'Snowflake', 'Docker'].forEach((s, i) => doc.text(s, 50, 120 + i * 14));
    doc.font('Helvetica-Bold').fontSize(12).text('EXPERIENCE', 250, 100);
    doc.font('Helvetica').fontSize(10);
    LOREM.forEach((l, i) => doc.text(l, 250, 120 + i * 40, { width: 300 }));
  },
  'pdf-blank': (doc) => {
    doc.addPage(); // no text at all: extractor must return '' not crash
  },
  'pdf-long-20p': (doc) => {
    doc.font('Helvetica-Bold').fontSize(18).text('Timing Fixture (20 pages)');
    doc.font('Helvetica').fontSize(11);
    for (let i = 0; i < 20 * 45; i++) doc.text(`Line ${i}: ${LOREM[i % LOREM.length]}`);
  },
};

const fixtureTinyPDFs = {
  'pdf-tiny-a': (doc) => {
    doc.font('Helvetica-Bold').fontSize(16).text('Tiny Resume A');
    doc.font('Helvetica').fontSize(11).text('Node.js engineer. PostgreSQL. Cloudflare Workers.');
  },
  'pdf-tiny-b': (doc) => {
    doc.font('Helvetica-Bold').fontSize(16).text('Tiny Resume B');
    doc.font('Helvetica').fontSize(11).text('Data analyst. Python. SQL. Airflow. Snowflake.');
  },
};

const D = docx;
const P = (t, o = {}) => new D.Paragraph({ children: [new D.TextRun(t)], ...o });
const fixtureDOCX = {
  'gen-simple': () => [
    new D.Paragraph({ text: 'Jane Q. Developer', heading: D.HeadingLevel.TITLE }),
    P('jane@example.com | +1 555 0100'),
    new D.Paragraph({ text: 'Summary', heading: D.HeadingLevel.HEADING_2 }),
    P('Full-stack engineer with 8 years of experience.'),
  ],
  'gen-bullets': () => [
    new D.Paragraph({ text: 'Experience', heading: D.HeadingLevel.HEADING_2 }),
    ...LOREM.map((l) => new D.Paragraph({ children: [new D.TextRun({ text: l.slice(0, 20), bold: true }), new D.TextRun(' ' + l.slice(20))], bullet: { level: 0 } })),
    new D.Paragraph({ children: [new D.TextRun({ text: 'nested bullet', italics: true })], bullet: { level: 1 } }),
  ],
  'gen-table': () => [
    P('Skills matrix'),
    new D.Table({
      rows: [
        ['Skill', 'Years', 'Level'],
        ['JavaScript', '9', 'Expert'],
        ['PostgreSQL', '7', 'Advanced'],
        ['Rust', '1', 'Beginner'],
      ].map((r) => new D.TableRow({ children: r.map((c) => new D.TableCell({ children: [P(c)] })) })),
    }),
    P('End of table.'),
  ],
  'gen-unicode': () => [
    P('Résumé — José Müller'),
    P('Łódź · Zürich · São Paulo · Ελληνικά · Русский язык · 日本語テキスト · العربية'),
    new D.Paragraph({ children: [new D.TextRun('col1'), new D.TextRun({ text: 'col2', break: 1 }), new D.TextRun('\tcol3')] }),
    P('€85,000 – €95,000 “quotes” ★'),
  ],
  'gen-long': () => {
    const out = [new D.Paragraph({ text: 'Long document', heading: D.HeadingLevel.HEADING_1 })];
    for (let i = 0; i < 300; i++) out.push(P(`Paragraph ${i}: ${LOREM[i % LOREM.length]}`));
    return out;
  },
};

const REAL_DOCX = [
  ['tables', 'tables.docx'],
  ['simple-list', 'simple-list.docx'],
  ['single-paragraph', 'single-paragraph.docx'],
  ['footnotes', 'footnotes.docx'],
  ['text-box', 'text-box.docx'],
  ['comments', 'comments.docx'],
  ['endnotes', 'endnotes.docx'],
  ['strikethrough', 'strikethrough.docx'],
  ['underline', 'underline.docx'],
  ['utf8-bom', 'utf8-bom.docx'],
  ['tiny-picture', 'tiny-picture.docx'],
];

const MD_RESUME = `# Jane Q. Developer
jane@example.com | +1 555 0100 | linkedin.com/in/janedev

## Professional Summary
Full-stack engineer with 8 years of experience building resilient web platforms.

## Experience
- Designed and shipped a multi-tenant billing platform for 40,000 users
- Reduced p95 latency from 820ms to 190ms using read replicas
- Mentored two junior engineers to promotion

## Skills
JavaScript, TypeScript, Node.js, PostgreSQL, Cloudflare Workers

## Education
B.Tech Computer Science, IIT Madras, 2016
`;

const MD_UNICODE = `# José Müller — Résumé
## Experience
- Trilingual: English, Español, Français
- Salary: €85,000 – €95,000 and “smart quotes”
## Skills
C++, Rust, Zürich, São Paulo
`;

const TXT_ENGINE = `JANE Q. DEVELOPER
jane@example.com | +1 555 0100

PROFESSIONAL SUMMARY
Full-stack engineer with 8 years of experience building web platforms.

PROFESSIONAL EXPERIENCE
Senior Engineer, Acme Corp (2020 - Present)
- Designed a multi-tenant billing platform for 40,000 users
* Reduced p95 latency from 820ms to 190ms
• Mentored two junior engineers

EDUCATION
B.Tech Computer Science, IIT Madras, 2016

SKILLS
JavaScript, TypeScript, Node.js, PostgreSQL
`;

const TXT_LONG = Array.from({ length: 160 }, (_, i) => (i % 9 === 0 ? `SECTION ${i}` : `- ${LOREM[i % LOREM.length]}`)).join('\n');

export async function makeFixtures() {
  fs.rmSync(FIX, { recursive: true, force: true });
  fs.mkdirSync(FIX, { recursive: true });
  const manifest = { pdf: [], tiny: [], docx: [], gen: [] };

  for (const [name, build] of Object.entries(fixturePDFs)) {
    const buf = await pdfToBuffer(build);
    fs.writeFileSync(path.join(FIX, name + '.pdf'), buf);
    manifest.pdf.push({ name, file: name + '.pdf', origin: 'synthetic (pdfkit)', bytes: buf.length });
  }
  for (const [name, build] of Object.entries(fixtureTinyPDFs)) {
    const buf = await pdfToBuffer(build, false);
    fs.writeFileSync(path.join(FIX, name + '.pdf'), buf);
    manifest.tiny.push({ name, file: name + '.pdf', origin: 'synthetic (pdfkit), un-padded', bytes: buf.length });
  }
  for (const [name, build] of Object.entries(fixtureDOCX)) {
    const doc = new D.Document({ sections: [{ children: build() }] });
    const buf = await D.Packer.toBuffer(doc);
    fs.writeFileSync(path.join(FIX, name + '.docx'), buf);
    manifest.docx.push({ name, file: name + '.docx', origin: 'generated (docx lib)', bytes: buf.length });
  }
  for (const [name, file] of REAL_DOCX) {
    const src = path.join(backend, 'node_modules', 'mammoth', 'test', 'test-data', file);
    fs.copyFileSync(src, path.join(FIX, 'word-' + file));
    manifest.docx.push({ name: 'word-' + name, file: 'word-' + file, origin: 'real Word-authored (mammoth test-data)', bytes: fs.statSync(src).size });
  }
  const rootDocx = path.join(repoRoot, 'Syntax_Error_Correction_Tool_Report_Updated.docx');
  fs.copyFileSync(rootDocx, path.join(FIX, 'repo-syntax-error-report.docx'));
  manifest.docx.push({ name: 'repo-syntax-error-report', file: 'repo-syntax-error-report.docx', origin: 'real (repo root)', bytes: fs.statSync(rootDocx).size });

  const gens = { 'md-resume.md': MD_RESUME, 'md-unicode.md': MD_UNICODE, 'txt-engine.txt': TXT_ENGINE, 'txt-long.txt': TXT_LONG };
  for (const [f, content] of Object.entries(gens)) {
    fs.writeFileSync(path.join(FIX, f), content, 'utf8');
    manifest.gen.push({ file: f, bytes: Buffer.byteLength(content) });
  }
  fs.writeFileSync(path.join(FIX, 'manifest.json'), JSON.stringify(manifest, null, 2));
  return manifest;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  makeFixtures().then((m) => console.log(`fixtures: ${m.pdf.length} pdf (+${m.tiny.length} tiny), ${m.docx.length} docx, ${m.gen.length} gen inputs -> ${FIX}`));
}
