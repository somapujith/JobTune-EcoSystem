'use strict';

/**
 * Built-in SYNTHETIC upload fixtures (one PDF, one DOCX, one TXT) for scripts/migration/upload-roundtrip.js.
 * The richer spike fixtures (backend/spike/docs/fixtures) are gitignored and generated on demand, so a fresh clone has
 * none; without a fallback the script (and its tests) would fail with "cannot read --fixtures". These are tiny, valid,
 * deterministic files written to the OS temp dir. They are NOT real resumes: checklist item 23 needs --fixtures pointing
 * at real ones.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const JSZip = require('jszip');

/** A minimal, structurally valid one-page PDF (correct xref offsets, Helvetica, ASCII text only). */
function minimalPdf(lines) {
  const esc = (s) => String(s).replace(/[\()]/g, '\$&').replace(/[^\x20-\x7e]/g, '?');
  const content = `BT /F1 11 Tf 14 TL 56 740 Td ${lines.map((l) => `(${esc(l)}) Tj T*`).join(' ')} ET`;
  const objs = [
    '<</Type/Catalog/Pages 2 0 R>>',
    '<</Type/Pages/Kids[3 0 R]/Count 1>>',
    '<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>',
    `<</Length ${content.length}>>\nstream\n${content}\nendstream`,
    '<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>',
  ];
  let out = '%PDF-1.4\n';
  const offsets = [];
  objs.forEach((o, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  out += offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
  out += `trailer\n<</Size ${objs.length + 1}/Root 1 0 R>>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

/** A minimal DOCX (content types + rels + one document part) that Word, mammoth and the Worker's parsers accept. */
async function minimalDocx(lines) {
  const xmlEsc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const zip = new JSZip();
  zip.file(
    '[Content_Types].xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'
  );
  zip.file(
    '_rels/.rels',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'
  );
  const paras = lines.map((l) => `<w:p><w:r><w:t xml:space="preserve">${xmlEsc(l)}</w:t></w:r></w:p>`).join('');
  zip.file(
    'word/document.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paras}</w:body></w:document>`
  );
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

/**
 * Write (or reuse) the built-in fixture set and return its directory.
 * @param {string} resumeText multi-line synthetic resume text
 */
async function writeFallbackFixtures(resumeText) {
  const dir = path.join(os.tmpdir(), 'jobtune-upload-roundtrip-fixtures');
  fs.mkdirSync(dir, { recursive: true });
  const lines = String(resumeText).split(/\r?\n/);
  fs.writeFileSync(path.join(dir, 'builtin-resume.pdf'), minimalPdf(lines));
  fs.writeFileSync(path.join(dir, 'builtin-resume.docx'), await minimalDocx(lines));
  fs.writeFileSync(path.join(dir, 'builtin-resume.txt'), lines.join('\n'));
  return dir;
}

module.exports = { writeFallbackFixtures, minimalPdf, minimalDocx };
