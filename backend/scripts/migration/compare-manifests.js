#!/usr/bin/env node
'use strict';

/**
 * compare-manifests.js  (ADR-001 task T4.1 / section 6.3 / DoD items 5 and 6)
 *
 * Diffs two endpoint manifests that share the schema documented in
 * docs/migration/manifest.render.json (top-level `schema` field):
 *   reference = the manifest generated from the Express/Render source
 *   candidate = the manifest emitted from the Workers/Hono app
 *
 * Usage:
 *   node scripts/migration/compare-manifests.js <reference.json> <candidate.json>
 *        [--allow-extra-in-candidate] [--only-prefix /api/x]... [--json]
 *
 * Severity model (a leak is anything that makes Workers MORE permissive than Render):
 *   CRITICAL  gated on reference, ungated / weaker on candidate
 *             (auth dropped, admin dropped, role guard dropped or widened,
 *              minTier dropped or lowered)                              -> exit 2
 *   ERROR     any other parity break: endpoint missing in candidate, extra endpoint in
 *             candidate (unless --allow-extra-in-candidate), method mismatch, guard
 *             added / minTier raised (over-restrictive), unverifiable minTier,
 *             missing non-standard guard, malformed manifest             -> exit 1
 *   WARN      suspicious but not a parity break (duplicate route in candidate, path case
 *             differs, extra guard on candidate)
 *   INFO      informational (param name differs, allowed extras, reference duplicates)
 * Exit code: 2 if any CRITICAL, else 1 if any ERROR, else 0.
 *
 * Endpoints are paired on `METHOD + canonical(path)` where canonical() lower-cases, strips
 * the trailing slash and replaces every `:param` (any name / regex constraint, Express
 * `:id(\\d+)` or Hono `:id{[0-9]+}` syntax) with `:`.  If a key occurs more than once in a
 * manifest, the FIRST occurrence is used (Express serves the first registered route).
 *
 * Only these endpoint fields are required by the comparator: method, path, auth (boolean).
 * Optional (defaults): admin=false, roles=null, minTier=null, guards=[].
 */

const fs = require('fs');
const path = require('path');

const SEV = { CRITICAL: 'CRITICAL', ERROR: 'ERROR', WARN: 'WARN', INFO: 'INFO' };
const SEV_ORDER = [SEV.CRITICAL, SEV.ERROR, SEV.WARN, SEV.INFO];
const STANDARD_GUARDS = new Set(['authenticateToken', 'requireAdmin', 'requireRole', 'requirePlan']);

/* ------------------------------------------------------------------------- */
/* Path helpers (shared with generate-manifest.js)                            */
/* ------------------------------------------------------------------------- */

function parseSegment(raw) {
  if (raw === '*') return { raw, type: 'wild' };
  const m = /^:([A-Za-z0-9_]+)(?:\((.+)\)|\{(.+)\})?([?+*])?$/.exec(raw);
  if (m) {
    return { raw, type: 'param', name: m[1], regex: m[2] || m[3] || null, modifier: m[4] || null };
  }
  if (/[*()?+{}\\:]/.test(raw)) return { raw, type: 'complex' };
  return { raw, type: 'literal', value: raw };
}

function parseSegments(p) {
  return String(p).split('/').filter(Boolean).map(parseSegment);
}

/** Canonical key form of a path: case-insensitive, param-name-agnostic, no trailing slash. */
function canonicalizePath(p) {
  const segs = parseSegments(p).map((s) => {
    if (s.type === 'param') return ':' + (s.modifier || '');
    if (s.type === 'wild') return '*';
    if (s.type === 'literal') return s.value.toLowerCase();
    return s.raw.toLowerCase();
  });
  return '/' + segs.join('/');
}

/** Same as canonicalizePath but keeps case (used to detect case-only differences). */
function shapePath(p) {
  const segs = parseSegments(p).map((s) => {
    if (s.type === 'param') return ':' + (s.modifier || '');
    if (s.type === 'wild') return '*';
    return s.type === 'literal' ? s.value : s.raw;
  });
  return '/' + segs.join('/');
}

/**
 * Does pattern A (segments) match EVERY url that pattern B matches?  (same segment count)
 * Returns true / false, or null when undecidable (wildcards, optional or complex segments).
 */
function segmentsCover(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const sa = a[i];
    const sb = b[i];
    if (['wild', 'complex'].includes(sa.type) || ['wild', 'complex'].includes(sb.type)) return null;
    if ((sa.type === 'param' && sa.modifier) || (sb.type === 'param' && sb.modifier)) return null;
    if (sa.type === 'literal') {
      if (sb.type !== 'literal' || sa.value.toLowerCase() !== sb.value.toLowerCase()) return false;
    } else if (sa.type === 'param') {
      if (sb.type === 'literal') {
        if (sa.regex) {
          let re;
          try { re = new RegExp('^(?:' + sa.regex + ')$'); } catch (e) { return null; }
          if (!re.test(sb.value)) return false;
        }
      } else if (sb.type === 'param') {
        if (sa.regex && sa.regex !== sb.regex) return false;
      }
    }
  }
  return true;
}

/* ------------------------------------------------------------------------- */
/* Comparison                                                                 */
/* ------------------------------------------------------------------------- */

function endpointKey(e) {
  return String(e.method).toUpperCase() + ' ' + canonicalizePath(e.path);
}

function normTier(v) {
  if (v === undefined || v === null) return null;
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && /^\d+$/.test(v.trim())) return Number(v.trim());
  return String(v); // non-literal expression recorded by the generator
}

function effective(e) {
  return {
    auth: e.auth === true,
    admin: e.admin === true,
    roles: Array.isArray(e.roles) && e.roles.length ? e.roles.map(String) : null,
    minTier: normTier(e.minTier),
    guards: Array.isArray(e.guards) ? e.guards : [],
  };
}

function validateManifest(m, label) {
  const problems = [];
  if (!m || typeof m !== 'object') return [`${label}: not a JSON object`];
  if (!Array.isArray(m.endpoints)) return [`${label}: missing "endpoints" array`];
  m.endpoints.forEach((e, i) => {
    const where = `${label}.endpoints[${i}]`;
    if (!e || typeof e !== 'object') { problems.push(`${where}: not an object`); return; }
    if (typeof e.method !== 'string' || !e.method) problems.push(`${where}: "method" must be a non-empty string`);
    if (typeof e.path !== 'string' || !e.path.startsWith('/')) problems.push(`${where}: "path" must be a string starting with "/"`);
    if (typeof e.auth !== 'boolean') problems.push(`${where} (${e.method} ${e.path}): "auth" must be a boolean`);
    if (e.admin !== undefined && typeof e.admin !== 'boolean') problems.push(`${where}: "admin" must be a boolean when present`);
    if (e.minTier !== undefined && e.minTier !== null && typeof e.minTier !== 'number' && typeof e.minTier !== 'string') {
      problems.push(`${where}: "minTier" must be number | string | null`);
    }
  });
  return problems;
}

function inScope(e, prefixes) {
  if (!prefixes || !prefixes.length) return true;
  const c = canonicalizePath(e.path);
  return prefixes.some((p) => {
    const cp = canonicalizePath(p);
    return cp === '/' || c === cp || c.startsWith(cp + '/');
  });
}

function indexByKey(endpoints, prefixes) {
  const map = new Map();
  for (const e of endpoints) {
    if (!inScope(e, prefixes)) continue;
    const k = endpointKey(e);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(e);
  }
  return map;
}

function describeEndpoint(e) {
  return { method: e.method, path: e.path, auth: e.auth, admin: !!e.admin, roles: e.roles || null, minTier: e.minTier === undefined ? null : e.minTier };
}

function compareManifests(reference, candidate, opts = {}) {
  const findings = [];
  const add = (severity, code, key, message, extra = {}) => findings.push({ severity, code, key, message, ...extra });
  const prefixes = (opts.onlyPrefixes || []).filter(Boolean);

  // --- structural validation ---------------------------------------------------
  const problems = [...validateManifest(reference, 'reference'), ...validateManifest(candidate, 'candidate')];
  if (problems.length) {
    problems.slice(0, 50).forEach((p) => add(SEV.ERROR, 'MALFORMED_MANIFEST', null, p));
    if (problems.length > 50) add(SEV.ERROR, 'MALFORMED_MANIFEST', null, `... and ${problems.length - 50} more`);
    return finish(findings, { reference: 0, candidate: 0, compared: 0 });
  }
  const refVer = reference.schema && reference.schema.version;
  const candVer = candidate.schema && candidate.schema.version;
  if (refVer !== undefined && candVer !== undefined && refVer !== candVer) {
    add(SEV.ERROR, 'SCHEMA_VERSION_MISMATCH', null, `schema.version differs: reference=${refVer} candidate=${candVer}`);
  }

  const refIdx = indexByKey(reference.endpoints, prefixes);
  const candIdx = indexByKey(candidate.endpoints, prefixes);

  for (const [k, list] of refIdx) {
    if (list.length > 1) add(SEV.INFO, 'DUPLICATE_IN_REFERENCE', k, `reference registers ${k} ${list.length} times; first registration is compared`);
  }
  for (const [k, list] of candIdx) {
    if (list.length > 1) add(SEV.WARN, 'DUPLICATE_IN_CANDIDATE', k, `candidate registers ${k} ${list.length} times; first registration is compared`);
  }

  let compared = 0;
  const missing = [];
  const extra = [];

  for (const [k, list] of refIdx) {
    const r = list[0];
    const c = candIdx.has(k) ? candIdx.get(k)[0] : null;
    if (!c) { missing.push(r); continue; }
    compared++;
    compareOne(k, r, c, add);
  }
  for (const [k, list] of candIdx) {
    if (!refIdx.has(k)) extra.push(list[0]);
  }

  // --- pair up method mismatches (same canonical path, different method) --------
  const extraByPath = new Map();
  extra.forEach((e) => {
    const p = canonicalizePath(e.path);
    if (!extraByPath.has(p)) extraByPath.set(p, []);
    extraByPath.get(p).push(e);
  });
  const consumedExtra = new Set();
  const stillMissing = [];
  for (const r of missing) {
    const p = canonicalizePath(r.path);
    const cands = (extraByPath.get(p) || []).filter((e) => !consumedExtra.has(e));
    if (cands.length) {
      cands.forEach((e) => consumedExtra.add(e));
      add(SEV.ERROR, 'METHOD_MISMATCH', endpointKey(r),
        `reference has ${r.method} ${r.path}; candidate exposes the same path only as ${cands.map((e) => e.method).join(', ')}`,
        { reference: describeEndpoint(r), candidate: cands.map(describeEndpoint) });
    } else {
      stillMissing.push(r);
    }
  }
  for (const r of stillMissing) {
    add(SEV.ERROR, 'MISSING_IN_CANDIDATE', endpointKey(r),
      `${r.method} ${r.path} exists on the reference but not on the candidate`, { reference: describeEndpoint(r) });
  }
  for (const e of extra) {
    if (consumedExtra.has(e)) continue;
    add(opts.allowExtraInCandidate ? SEV.INFO : SEV.ERROR,
      opts.allowExtraInCandidate ? 'EXTRA_IN_CANDIDATE_ALLOWED' : 'EXTRA_IN_CANDIDATE', endpointKey(e),
      `${e.method} ${e.path} exists on the candidate but not on the reference`, { candidate: describeEndpoint(e) });
  }

  return finish(findings, { reference: refIdx.size, candidate: candIdx.size, compared });
}

function compareOne(key, ref, cand, add) {
  const r = effective(ref);
  const c = effective(cand);
  const ctx = { reference: describeEndpoint(ref), candidate: describeEndpoint(cand) };

  // path spelling
  if (shapePath(ref.path) !== shapePath(cand.path)) {
    add(SEV.WARN, 'PATH_CASE_DIFFERS', key,
      `path differs only by letter case (Express matches case-insensitively, Hono does not): reference "${ref.path}" vs candidate "${cand.path}"`, ctx);
  }
  const names = (p) => parseSegments(p).filter((s) => s.type === 'param').map((s) => s.name).join(',');
  if (names(ref.path) !== names(cand.path)) {
    add(SEV.INFO, 'PARAM_NAME_DIFFERS', key, `param names differ: reference "${ref.path}" vs candidate "${cand.path}"`, ctx);
  }

  // auth
  if (r.auth && !c.auth) {
    add(SEV.CRITICAL, 'AUTH_DROPPED', key, `authenticateToken is required on the reference but NOT on the candidate (${cand.method} ${cand.path} is publicly reachable)`, ctx);
  } else if (!r.auth && c.auth) {
    add(SEV.ERROR, 'AUTH_ADDED', key, `endpoint is public on the reference but requires auth on the candidate`, ctx);
  }

  // admin
  if (r.admin && !c.admin) {
    add(SEV.CRITICAL, 'ADMIN_DROPPED', key, `requireAdmin is applied on the reference but NOT on the candidate`, ctx);
  } else if (!r.admin && c.admin) {
    add(SEV.ERROR, 'ADMIN_ADDED', key, `requireAdmin is applied on the candidate but not on the reference`, ctx);
  }

  // roles
  if (r.roles && !c.roles) {
    add(SEV.CRITICAL, 'ROLE_GUARD_DROPPED', key, `role guard [${r.roles.join(', ')}] on the reference is missing on the candidate`, ctx);
  } else if (!r.roles && c.roles) {
    add(SEV.ERROR, 'ROLE_GUARD_ADDED', key, `role guard [${c.roles.join(', ')}] exists on the candidate but not on the reference`, ctx);
  } else if (r.roles && c.roles) {
    const widened = c.roles.filter((x) => !r.roles.includes(x));
    const narrowed = r.roles.filter((x) => !c.roles.includes(x));
    if (widened.length) {
      add(SEV.CRITICAL, 'ROLES_WIDENED', key, `candidate role guard admits extra roles [${widened.join(', ')}] (reference: [${r.roles.join(', ')}])`, ctx);
    } else if (narrowed.length) {
      add(SEV.ERROR, 'ROLES_NARROWED', key, `candidate role guard omits roles [${narrowed.join(', ')}] (reference: [${r.roles.join(', ')}])`, ctx);
    }
  }

  // minTier
  const rt = r.minTier;
  const ct = c.minTier;
  const num = (x) => typeof x === 'number';
  if (rt !== ct) {
    if (num(rt) && ct === null) {
      add(SEV.CRITICAL, 'MINTIER_DROPPED', key, `requirePlan(${rt}) on the reference but the candidate has NO plan gate (free users can reach a tier-${rt} feature)`, ctx);
    } else if (num(rt) && num(ct) && ct < rt) {
      add(SEV.CRITICAL, 'MINTIER_LOWERED', key, `minTier lowered from ${rt} (reference) to ${ct} (candidate)`, ctx);
    } else if (num(rt) && num(ct) && ct > rt) {
      add(SEV.ERROR, 'MINTIER_RAISED', key, `minTier raised from ${rt} (reference) to ${ct} (candidate); over-restrictive`, ctx);
    } else if (rt === null && ct !== null) {
      add(SEV.ERROR, 'MINTIER_ADDED', key, `candidate has minTier ${JSON.stringify(ct)} but the reference has no plan gate`, ctx);
    } else {
      add(SEV.ERROR, 'MINTIER_UNVERIFIABLE', key,
        `minTier cannot be compared numerically: reference=${JSON.stringify(rt)} candidate=${JSON.stringify(ct)}`, ctx);
    }
  }

  // other guards (anything that is not one of the four standard guards)
  const baseName = (g) => String(g).split('(')[0];
  const rOther = r.guards.filter((g) => !STANDARD_GUARDS.has(baseName(g)));
  const cOther = c.guards.filter((g) => !STANDARD_GUARDS.has(baseName(g)));
  for (const g of rOther) {
    if (!cOther.includes(g)) add(SEV.ERROR, 'GUARD_MISSING_IN_CANDIDATE', key, `guard ${g} present on the reference but missing on the candidate`, ctx);
  }
  for (const g of cOther) {
    if (!rOther.includes(g)) add(SEV.WARN, 'GUARD_EXTRA_IN_CANDIDATE', key, `guard ${g} present on the candidate but not on the reference`, ctx);
  }
}

function finish(findings, counts) {
  const bySeverity = { CRITICAL: 0, ERROR: 0, WARN: 0, INFO: 0 };
  findings.forEach((f) => { bySeverity[f.severity]++; });
  findings.sort((a, b) => SEV_ORDER.indexOf(a.severity) - SEV_ORDER.indexOf(b.severity));
  const exitCode = bySeverity.CRITICAL ? 2 : bySeverity.ERROR ? 1 : 0;
  return { findings, summary: { ...counts, bySeverity }, exitCode };
}

/* ------------------------------------------------------------------------- */
/* CLI                                                                        */
/* ------------------------------------------------------------------------- */

function formatReport(result, meta = {}) {
  const lines = [];
  const s = result.summary;
  lines.push('Manifest comparison' + (meta.reference ? `: reference=${meta.reference}  candidate=${meta.candidate}` : ''));
  lines.push(`  endpoints (in scope): reference=${s.reference} candidate=${s.candidate} compared=${s.compared}`);
  for (const sev of SEV_ORDER) {
    const list = result.findings.filter((f) => f.severity === sev);
    if (!list.length) continue;
    lines.push('');
    lines.push(`${sev} (${list.length})`);
    for (const f of list) lines.push(`  [${f.code}] ${f.message}`);
  }
  lines.push('');
  lines.push(
    `RESULT: ${result.exitCode === 0 ? 'PASS' : 'FAIL'}  ` +
    `(critical=${s.bySeverity.CRITICAL} error=${s.bySeverity.ERROR} warn=${s.bySeverity.WARN} info=${s.bySeverity.INFO})  exit=${result.exitCode}`
  );
  return lines.join('\n');
}

function parseArgs(argv) {
  const opts = { allowExtraInCandidate: false, onlyPrefixes: [], json: false, files: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--allow-extra-in-candidate') opts.allowExtraInCandidate = true;
    else if (a === '--json') opts.json = true;
    else if (a === '--only-prefix') opts.onlyPrefixes.push(argv[++i]);
    else if (a.startsWith('--only-prefix=')) opts.onlyPrefixes.push(a.slice('--only-prefix='.length));
    else if (a === '-h' || a === '--help') opts.help = true;
    else if (a.startsWith('--')) throw new Error(`Unknown option ${a}`);
    else opts.files.push(a);
  }
  return opts;
}

function main(argv) {
  let opts;
  try { opts = parseArgs(argv); } catch (e) { console.error(e.message); return 1; }
  if (opts.help || opts.files.length !== 2) {
    console.error('Usage: node compare-manifests.js <reference.json> <candidate.json> [--allow-extra-in-candidate] [--only-prefix /api/x]... [--json]');
    return opts.help ? 0 : 1;
  }
  const load = (f) => JSON.parse(fs.readFileSync(path.resolve(f), 'utf8'));
  let ref;
  let cand;
  try { ref = load(opts.files[0]); cand = load(opts.files[1]); } catch (e) { console.error(`Cannot read manifests: ${e.message}`); return 1; }
  const result = compareManifests(ref, cand, opts);
  if (opts.json) console.log(JSON.stringify(result, null, 2));
  else console.log(formatReport(result, { reference: opts.files[0], candidate: opts.files[1] }));
  return result.exitCode;
}

module.exports = {
  compareManifests, formatReport, validateManifest, endpointKey,
  canonicalizePath, shapePath, parseSegments, segmentsCover, SEV,
};

if (require.main === module) process.exitCode = main(process.argv.slice(2));
