#!/usr/bin/env node
'use strict';

/**
 * parity.js  (ADR-001 checklist items 5 and 6: manifest diff Render vs Workers)
 *
 * Builds the Worker manifest (generate-worker-manifest.js) and diffs it against the Render reference
 * (docs/migration/manifest.render.json) with compare-manifests.js. Exit codes are compare-manifests':
 *   0 parity | 1 parity break (missing / extra endpoint, guard added, ...) | 2 CRITICAL (a gate was dropped
 *   or weakened on Workers: auth, admin, role, minTier). A tooling failure (cannot build the Worker app,
 *   unreadable reference) exits 1 with a message.
 *
 * This is NOT part of the default Jest suite: it is red until the port is complete. Run it via
 *   npm run migration:parity                                   (whole surface)
 *   npm run migration:parity -- --only-prefix /api/auth        (one prefix, repeatable)
 *
 * Options: --only-prefix <p> (repeatable) | --reference <file> | --candidate-out <file> (keep the candidate)
 *          | --allow-extra-in-candidate | --json | --strict-static (do not ignore the /admin static page)
 *
 * The Worker serves the admin bundle (Express: express.static('/admin')) as a route, which is not an API
 * endpoint of the reference manifest. Unless --strict-static is given, GET/HEAD candidate paths equal to /admin
 * or under /admin/ that the reference does not contain are dropped from the candidate before the diff and listed.
 */

const fs = require('fs');
const path = require('path');
const { compareManifests, formatReport, canonicalizePath, endpointKey } = require('./compare-manifests');
const { buildWorkerManifest } = require('./generate-worker-manifest');

const REPO_DIR = path.resolve(__dirname, '..', '..', '..');
const DEFAULT_REFERENCE = path.join(REPO_DIR, 'docs', 'migration', 'manifest.render.json');
const STATIC_RE = /^\/admin(\/|$)/i;

function parseArgs(argv) {
  const o = { onlyPrefixes: [], json: false, allowExtra: false, strictStatic: false, reference: DEFAULT_REFERENCE, candidateOut: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--only-prefix') o.onlyPrefixes.push(argv[++i]);
    else if (a.startsWith('--only-prefix=')) o.onlyPrefixes.push(a.slice('--only-prefix='.length));
    else if (a === '--reference') o.reference = path.resolve(argv[++i]);
    else if (a === '--candidate-out') o.candidateOut = path.resolve(argv[++i]);
    else if (a === '--allow-extra-in-candidate') o.allowExtra = true;
    else if (a === '--strict-static') o.strictStatic = true;
    else if (a === '--json') o.json = true;
    else if (a === '-h' || a === '--help') o.help = true;
    else throw new Error(`Unknown option ${a}`);
  }
  return o;
}

/** Split candidate endpoints into { kept, ignored } (non-API static surface the reference does not list). */
function separateStaticExtras(reference, candidate) {
  const refKeys = new Set(reference.endpoints.map(endpointKey));
  const kept = [];
  const ignored = [];
  for (const e of candidate.endpoints) {
    const isStatic = ['GET', 'HEAD'].includes(String(e.method).toUpperCase()) && STATIC_RE.test(canonicalizePath(e.path));
    if (isStatic && !refKeys.has(endpointKey(e))) ignored.push(e);
    else kept.push(e);
  }
  return { kept, ignored };
}

function main(argv) {
  let o;
  try { o = parseArgs(argv); } catch (e) { console.error(e.message); return 1; }
  if (o.help) { console.log(fs.readFileSync(__filename, 'utf8').split('*/')[0]); return 0; }

  let reference;
  try { reference = JSON.parse(fs.readFileSync(o.reference, 'utf8')); } catch (e) {
    console.error(`parity: cannot read reference manifest ${o.reference}: ${e.message}`);
    return 1;
  }

  let candidate;
  try { candidate = buildWorkerManifest({ onlyPrefixes: o.onlyPrefixes }); } catch (e) {
    console.error(`parity: cannot build the Worker manifest: ${e.message}`);
    return 1;
  }

  let ignored = [];
  if (!o.strictStatic) {
    const sep = separateStaticExtras(reference, candidate);
    candidate = { ...candidate, endpoints: sep.kept };
    ignored = sep.ignored;
  }
  if (o.candidateOut) {
    fs.mkdirSync(path.dirname(o.candidateOut), { recursive: true });
    fs.writeFileSync(o.candidateOut, JSON.stringify(candidate, null, 2) + '\n');
  }

  const result = compareManifests(reference, candidate, { onlyPrefixes: o.onlyPrefixes, allowExtraInCandidate: o.allowExtra });
  const sliceErrors = candidate.generator.sliceErrors || [];

  if (o.json) {
    console.log(JSON.stringify({ ...result, sliceErrors, ignoredStaticRoutes: ignored.map((e) => `${e.method} ${e.path}`) }, null, 2));
  } else {
    if (sliceErrors.length) {
      console.log('WORKER BUILD ISSUES (slices isolated; their routes are missing from the candidate):');
      sliceErrors.forEach((s) => console.log(`  [${s.slice}] ${s.phase}: ${s.error}`));
      console.log('');
    }
    if (ignored.length) console.log(`(ignoring ${ignored.length} non-API static route(s) not in the reference: ${ignored.map((e) => `${e.method} ${e.path}`).join(', ')}; use --strict-static to include)\n`);
    console.log(formatReport(result, { reference: path.relative(process.cwd(), o.reference) || o.reference, candidate: `<worker app, mode=${candidate.generator.mode}${o.onlyPrefixes.length ? `, only ${o.onlyPrefixes.join(' ')}` : ''}>` }));
  }
  return result.exitCode;
}

module.exports = { main, parseArgs, separateStaticExtras };

if (require.main === module) process.exitCode = main(process.argv.slice(2));
