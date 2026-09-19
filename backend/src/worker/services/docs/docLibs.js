'use strict';

/**
 * Lazy loaders for the heavy document libraries (docs slice, ADR-001 6.6 / spike S1-S5).
 *
 * This is the ONE place that names the doc libraries. Everything else in the slice gets them
 * through these functions, called from inside a handler / service method, never at module scope,
 * so a cold start that does not touch a document route never evaluates pdf.js, pdfkit, docx or
 * mammoth. (Wrangler still bundles them; laziness saves isolate start-up CPU, not bundle bytes.)
 *
 * Build-time requirements, all in backend/wrangler.toml [alias] (proven by the spike):
 *   - "pdfkit"      -> pdfkit/js/pdfkit.standalone.js  (the default entry needs __dirname)
 *   - "node-ensure" -> src/worker/stubs/node-ensure.cjs (pdf.js recursion under the browser field)
 *   - "@aws-sdk/client-s3" -> src/worker/stubs/aws-sdk-client-s3.mjs (only needed if unzipper is bundled)
 *
 * Why not `require`: the spike ran every library through `await import()`; keeping that exact
 * form keeps us on the proven resolution path (conditions differ between import and require).
 *
 * Why a seam: Jest cannot run dynamic import() (needs --experimental-vm-modules), so tests replace
 * this module with jest.mock() and hand back the same libraries through require(). The real import()
 * path is exercised by the local `wrangler dev` run documented in docs/migration/wave/docs.md.
 */

/** import() of a CJS module yields { default: module.exports, ...named }; unwrap it. */
function interopDefault(mod) {
  return mod && mod.default !== undefined ? mod.default : mod;
}

/**
 * pdf.js v1.10.100 build only (pdf-parse's default version). Importing the pinned file directly
 * stops esbuild from glob-bundling all four pdf.js versions that pdf-parse's
 * require(`./pdf.js/${version}/build/pdf.js`) would pull in (about 8 MB raw of dead weight).
 */
async function loadPdfJs() {
  return interopDefault(await import('pdf-parse/lib/pdf.js/v1.10.100/build/pdf.js'));
}

/** mammoth: call extractRawText({ arrayBuffer }); the { buffer } form fails under the bundler (spike S5). */
async function loadMammoth() {
  return interopDefault(await import('mammoth'));
}

/** pdfkit: the class. Resolves to the standalone build through the wrangler alias. */
async function loadPdfKit() {
  return interopDefault(await import('pdfkit'));
}

/** docx: the namespace ({ Document, Paragraph, TextRun, HeadingLevel, AlignmentType, Packer, ... }). */
async function loadDocx() {
  const mod = await import('docx');
  return mod.Document ? mod : interopDefault(mod);
}

module.exports = { loadPdfJs, loadMammoth, loadPdfKit, loadDocx, interopDefault };
