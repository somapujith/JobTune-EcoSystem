'use strict';

/**
 * Text extraction / byte helpers shared by the four document routes (docs slice).
 * All input is a Uint8Array (what lib/upload.js readUpload returns as `file.buffer`).
 *
 *   parsePdf(bytes)        pdf-parse equivalent (pinned pdf.js v1.10.100), resolves { text, numpages, ... }
 *   extractDocxRawText     mammoth.extractRawText({ arrayBuffer }), resolves { value, messages }
 *                          (NOT { buffer }: that form fails under the bundler, spike S5)
 *   decodeUtf8(bytes)      what `buffer.toString('utf-8')` did on Render: lossy UTF-8, BOM kept
 *   toBase64(bytes)        `buffer.toString('base64')` (a plain Uint8Array.toString would not encode)
 */
const docLibs = require('./docLibs');
const { pdfParse } = require('./pdfParse');

function parsePdf(bytes) {
  return pdfParse(bytes);
}

/** An ArrayBuffer holding exactly the bytes of the view (no offset, no extra length). */
function toArrayBuffer(bytes) {
  if (bytes instanceof ArrayBuffer) return bytes;
  if (bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength) return bytes.buffer;
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

async function extractDocxRawText(bytes) {
  const mammoth = await docLibs.loadMammoth();
  return mammoth.extractRawText({ arrayBuffer: toArrayBuffer(bytes) });
}

/**
 * Node's Buffer#toString('utf-8') keeps a leading U+FEFF and replaces invalid sequences with
 * U+FFFD. TextDecoder needs ignoreBOM: true to keep the BOM the same way.
 */
function decodeUtf8(bytes) {
  return new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes);
}

function toBase64(bytes) {
  const view = bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes;
  return Buffer.from(view.buffer, view.byteOffset, view.byteLength).toString('base64');
}

module.exports = { parsePdf, extractDocxRawText, decodeUtf8, toBase64, toArrayBuffer };
