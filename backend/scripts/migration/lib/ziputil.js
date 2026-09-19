'use strict';

/**
 * Minimal, dependency-free inspection of the two binary export formats (used by upload-roundtrip.js):
 *   - ZIP (DOCX): find the end-of-central-directory record, list entries, inflate one entry (stored or deflate).
 *   - PDF: header, trailing %%EOF, and (optionally, when backend/node_modules has pdf-parse) text extraction.
 * Read-only and pure: nothing is executed or written.
 */
const zlib = require('zlib');

const EOCD_SIG = 0x06054b50;
const CEN_SIG = 0x02014b50;
const LOC_SIG = 0x04034b50;

/** @returns {{ ok: boolean, entries: {name: string, method: number, compSize: number, size: number, offset: number}[], error?: string }} */
function listZip(buf) {
  if (!buf || buf.length < 22) return { ok: false, entries: [], error: 'too short to be a ZIP' };
  if (buf.readUInt32LE(0) !== LOC_SIG) return { ok: false, entries: [], error: 'does not start with a ZIP local file header (PK\\x03\\x04)' };
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65535); i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG) { eocd = i; break; }
  }
  if (eocd < 0) return { ok: false, entries: [], error: 'no end-of-central-directory record (truncated or corrupt ZIP)' };
  const total = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const entries = [];
  for (let n = 0; n < total; n++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== CEN_SIG) return { ok: false, entries, error: `corrupt central directory at entry ${n}` };
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const size = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const offset = buf.readUInt32LE(p + 42);
    entries.push({ name: buf.slice(p + 46, p + 46 + nameLen).toString('utf8'), method, compSize, size, offset });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return { ok: true, entries };
}

/** Contents of one entry as a Buffer, or throws. */
function readZipEntry(buf, entry) {
  const p = entry.offset;
  if (buf.readUInt32LE(p) !== LOC_SIG) throw new Error(`bad local header for ${entry.name}`);
  const nameLen = buf.readUInt16LE(p + 26);
  const extraLen = buf.readUInt16LE(p + 28);
  const start = p + 30 + nameLen + extraLen;
  const raw = buf.slice(start, start + entry.compSize);
  if (entry.method === 0) return raw;
  if (entry.method === 8) return zlib.inflateRawSync(raw);
  throw new Error(`unsupported compression method ${entry.method} for ${entry.name}`);
}

const decodeXml = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

/** Plain text of word/document.xml: <w:t> runs joined, one line per <w:p>. */
function docxText(documentXml) {
  return documentXml
    .split(/<\/w:p>/)
    .map((para) => [...para.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)].map((m) => decodeXml(m[1])).join(''))
    .join('\n')
    .trim();
}

/**
 * Validate a DOCX buffer. @returns {{ valid: boolean, problems: string[], text?: string, entries?: string[] }}
 */
function inspectDocx(buf) {
  const problems = [];
  const z = listZip(buf);
  if (!z.ok) return { valid: false, problems: [z.error] };
  const names = z.entries.map((e) => e.name);
  for (const need of ['[Content_Types].xml', 'word/document.xml']) if (!names.includes(need)) problems.push(`missing ${need}`);
  let text;
  const doc = z.entries.find((e) => e.name === 'word/document.xml');
  if (doc) {
    try {
      const xml = readZipEntry(buf, doc).toString('utf8');
      if (!/<w:document[\s>]/.test(xml)) problems.push('word/document.xml has no <w:document> root');
      text = docxText(xml);
    } catch (e) { problems.push(`word/document.xml cannot be read: ${e.message}`); }
  }
  return { valid: problems.length === 0, problems, text, entries: names };
}

/** Validate a PDF buffer: %PDF- header and %%EOF in the last 1 KiB. */
function inspectPdf(buf) {
  const problems = [];
  if (!buf || buf.length < 8) return { valid: false, problems: ['too short to be a PDF'] };
  if (buf.slice(0, 5).toString('latin1') !== '%PDF-') problems.push(`does not start with %PDF- (starts with ${JSON.stringify(buf.slice(0, 8).toString('latin1'))})`);
  const tail = buf.slice(Math.max(0, buf.length - 1024)).toString('latin1');
  if (!/%%EOF\s*$/.test(tail)) problems.push('no %%EOF marker at the end (truncated PDF)');
  return { valid: problems.length === 0, problems };
}

/** Text of a PDF via backend's pdf-parse when available; null when it is not installed or fails. */
async function pdfText(buf) {
  let parse;
  try { parse = require('pdf-parse/lib/pdf-parse.js'); } catch (e) { return null; }
  try { return (await parse(Buffer.from(buf))).text; } catch (e) { return null; }
}

module.exports = { listZip, readZipEntry, docxText, inspectDocx, inspectPdf, pdfText };
