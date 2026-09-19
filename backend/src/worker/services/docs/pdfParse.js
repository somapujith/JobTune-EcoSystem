'use strict';

/**
 * Local wrapper that replaces the pdf-parse package entry on the Worker (ADR-001 spike S1).
 *
 * `pdf-parse@1.1.4`'s index does `require(`./pdf.js/${version}/build/pdf.js`)`, which esbuild answers by
 * bundling all four bundled pdf.js versions (8 MB raw of dead weight). This file is a verbatim port of
 * pdf-parse/lib/pdf-parse.js (render_page, the text accumulation, the result shape) that loads ONLY the
 * v1.10.100 build (pdf-parse's own default version), so the extracted text is byte-identical to what
 * `pdfParse(buffer).text` returned on Render (spike: 9/9 fixtures equal, also 18/18 under parallel load).
 *
 * Differences from pdf-parse, all deliberate:
 *   - input must be a plain Uint8Array (a Node Buffer is copied into one). Handed a Node Buffer, pdf.js
 *     v1.10.100 throws "bad XRef entry" on some documents (data-dependent: in a session probe pdfkit PDFs of
 *     about 3.5, 5.4 and 9.2 KB failed through multer's Buffer while 1.5 and 16.8 KB parsed; the spike saw it
 *     intermittently), while the same bytes as a plain Uint8Array always parse. Root cause not established.
 *     Render passed multer's Buffer, so a PDF that failed there parses here.
 *     Passing a private copy also keeps the caller's bytes usable afterwards.
 *   - the `version` option is not supported (the version is pinned); `pagerender` and `max` are.
 *   - pdf.js is loaded lazily on first call through docLibs.loadPdfJs().
 * Result shape: { numpages, numrender, info, metadata, text, version }.
 */
const docLibs = require('./docLibs');

let PDFJS = null;

function renderPage(pageData) {
  const renderOptions = {
    // replaces all occurrences of whitespace with standard spaces (0x20); pdf-parse default: false
    normalizeWhitespace: false,
    // do not attempt to combine same line TextItem's; pdf-parse default: false
    disableCombineTextItems: false,
  };

  return pageData.getTextContent(renderOptions).then((textContent) => {
    let lastY;
    let text = '';
    for (const item of textContent.items) {
      if (lastY == item.transform[5] || !lastY) {
        text += item.str;
      } else {
        text += '\n' + item.str;
      }
      lastY = item.transform[5];
    }
    return text;
  });
}

/** A plain, private, offset-0 Uint8Array holding exactly the given bytes. */
function toPlainUint8Array(data) {
  if (data instanceof ArrayBuffer) return new Uint8Array(data.slice(0));
  if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));
  throw new TypeError('pdfParse: expected a Uint8Array, ArrayBuffer or Buffer');
}

async function pdfParse(dataBuffer, options = {}) {
  const pagerender = typeof options.pagerender === 'function' ? options.pagerender : renderPage;
  const max = typeof options.max === 'number' ? options.max : 0;

  const ret = {
    numpages: 0,
    numrender: 0,
    info: null,
    metadata: null,
    text: '',
    version: null,
  };

  PDFJS = PDFJS || (await docLibs.loadPdfJs());
  ret.version = PDFJS.version;

  // Disable workers: there is no worker URL to load on the edge (same as pdf-parse).
  PDFJS.disableWorker = true;
  const doc = await PDFJS.getDocument(toPlainUint8Array(dataBuffer));
  ret.numpages = doc.numPages;

  const metaData = await doc.getMetadata().catch(() => null);

  ret.info = metaData ? metaData.info : null;
  ret.metadata = metaData ? metaData.metadata : null;

  let counter = max <= 0 ? doc.numPages : max;
  counter = counter > doc.numPages ? doc.numPages : counter;

  ret.text = '';

  for (let i = 1; i <= counter; i++) {
    const pageText = await doc
      .getPage(i)
      .then((pageData) => pagerender(pageData))
      .catch(() => '');

    ret.text = `${ret.text}\n\n${pageText}`;
  }

  ret.numrender = counter;
  doc.destroy();

  return ret;
}

module.exports = { pdfParse, renderPage, toPlainUint8Array };
