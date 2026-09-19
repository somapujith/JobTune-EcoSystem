'use strict';

/**
 * Reads the EXPRESS source of routes/practice.js (read-only reference; Render stays authoritative) so tests
 * can compare the Worker port against it without retyping the 600-line data block:
 *   - dataBlock(): the verbatim text between the "Fallback Problems" and "Routes" banners
 *   - data():      that block evaluated (FALLBACK_PROBLEMS, FALLBACK_ASSESSMENTS, prompts, generateFallbackHint)
 *   - sqlList(src): every SQL text passed as the first argument of a .query( call, whitespace-normalised, in source order
 * Tests only; nothing under src/ reads files.
 */
const fs = require('fs');
const path = require('path');

const EXPRESS_FILE = path.resolve(__dirname, '../../../../src/routes/practice.js');
const WORKER_FILE = path.resolve(__dirname, '../../../../src/worker/routes/practice.js');

const read = (f) => fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n');

function dataBlock(src) {
  const from = src.indexOf('// ── Fallback Problems');
  const to = src.indexOf('// ── Routes');
  if (from === -1 || to === -1 || to <= from) throw new Error('practice.js banners not found');
  return src.slice(from, to);
}

let cachedData;
function data() {
  if (!cachedData) {
    // eslint-disable-next-line no-new-func
    cachedData = new Function(
      `${dataBlock(read(EXPRESS_FILE))}
       return { FALLBACK_PROBLEMS, FALLBACK_ASSESSMENTS, SYSTEM_PROMPT_RUN, SYSTEM_PROMPT_SUBMIT, SYSTEM_PROMPT_HINT, generateFallbackHint };`
    )();
  }
  return cachedData;
}

/** first argument (string or template literal) of every `.query(` call, whitespace-normalised */
function sqlList(src) {
  const out = [];
  const re = /\.query\(\s*(`[^`]*`|'(?:[^'\\]|\\.)*')/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    out.push(m[1].slice(1, -1).replace(/\s+/g, ' ').trim());
  }
  return out;
}

module.exports = { EXPRESS_FILE, WORKER_FILE, read, dataBlock, data, sqlList };
