'use strict';

/** Synthetic documents for the docs-slice tests (generated in memory; nothing here is real user data). */
const PDFDocument = require('pdfkit');
const docx = require('docx');

const PDF = 'application/pdf';
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const RESUME_LINES = [
  'Jane Example',
  'jane.example@example.test | +1 555 0100',
  'PROFESSIONAL SUMMARY',
  'Software engineer with 5 years of experience building APIs in Node.js and Python.',
  'EXPERIENCE',
  'Senior Engineer | Example Corp | 2021 - Present',
  'Built a REST API serving 50K users and reduced latency by 30%.',
  'EDUCATION',
  'B.Sc. Computer Science, Example University, 2019',
  'SKILLS',
  'JavaScript, TypeScript, Python, SQL, Docker, AWS',
];

/** A real PDF via pdfkit (Node build). Returns a Buffer. */
function makePdf(lines = RESUME_LINES, { extraPages = 0 } = {}) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 48 });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    for (const line of lines) doc.fontSize(11).font('Helvetica').text(line);
    for (let i = 0; i < extraPages; i++) {
      doc.addPage();
      doc.text(`Extra page ${i + 1} with some words to extract`);
    }
    doc.end();
  });
}

/**
 * A real multi-page PDF above 6000 bytes, closer to the size of a real resume than the ~1.5 KB single-page one.
 * (Size does not matter for the Buffer / Uint8Array pdf.js defect, see parity.test.js "documented deviation";
 * it only keeps the parity documents realistic.)
 */
async function makeBigPdf(lines = RESUME_LINES) {
  for (let extraPages = 0; extraPages < 40; extraPages++) {
    const pdf = await makePdf(lines, { extraPages });
    if (pdf.length > 6000) return pdf;
  }
  throw new Error('could not build a PDF above the pool threshold');
}

/** A real DOCX via docx (Node build). Returns a Buffer. */
async function makeDocx(lines = RESUME_LINES) {
  const { Document, Paragraph, TextRun, Packer } = docx;
  const doc = new Document({
    sections: [{ children: lines.map((l) => new Paragraph({ children: [new TextRun(l)] })) }],
  });
  return Packer.toBuffer(doc);
}

const file = (content, type, name = 'resume.pdf') => new File([content], name, { type });

function multipart(parts, { headers = {} } = {}) {
  const form = new FormData();
  for (const [name, value] of parts) form.append(name, value);
  return { method: 'POST', body: form, headers };
}

module.exports = { PDF, DOCX, RESUME_LINES, makePdf, makeBigPdf, makeDocx, file, multipart };
