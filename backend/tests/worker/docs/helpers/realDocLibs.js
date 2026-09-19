'use strict';

/**
 * Jest stand-in for src/worker/services/docs/docLibs.js. Jest cannot run dynamic import(), so tests
 * replace the lazy-loader seam with require() of the SAME libraries (`jest.mock(<docLibs path>,
 * () => require('./helpers/realDocLibs'))`). The real import() path is exercised by the local
 * `wrangler dev` run described in docs/migration/wave/docs.md, not by Jest.
 */
module.exports = {
  loadPdfJs: async () => require('pdf-parse/lib/pdf.js/v1.10.100/build/pdf.js'),
  // Node's mammoth build only reads { buffer | path }; the bundler's browser build (what workerd runs) reads
  // { arrayBuffer }. The production code calls { arrayBuffer }, so adapt it onto the Node build here. The real
  // arrayBuffer path is proven under workerd (docs/migration/wave/docs.md), not by Jest.
  loadMammoth: async () => {
    const mammoth = require('mammoth');
    return {
      extractRawText: ({ arrayBuffer }) => mammoth.extractRawText({ buffer: Buffer.from(arrayBuffer) }),
    };
  },
  loadPdfKit: async () => require('pdfkit'),
  loadDocx: async () => require('docx'),
  interopDefault: (m) => m,
};
