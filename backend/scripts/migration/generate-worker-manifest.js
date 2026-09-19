#!/usr/bin/env node
'use strict';

/**
 * generate-worker-manifest.js  (ADR-001 Phase 4 / T4.1 counterpart, sections 6.3, 8 items 5 and 6)
 *
 * Builds the Worker (Hono) app exactly as production does, createApp({ mountSlices: true }) from
 * src/worker/app.js, enumerates its endpoints with lib/routes.js listRoutes()/listMounts() and the tagged
 * middleware metadata (src/worker/README.md section 6), and emits a manifest in the SAME schema as
 * docs/migration/manifest.render.json so compare-manifests.js can diff the two.
 *
 *   node scripts/migration/generate-worker-manifest.js                 summary on stdout, writes nothing
 *   node scripts/migration/generate-worker-manifest.js --out w.json    write the manifest (summary still printed)
 *   node scripts/migration/generate-worker-manifest.js --json          print the manifest JSON on stdout (nothing else)
 *   node scripts/migration/generate-worker-manifest.js --only-prefix /api/auth --only-prefix /api/health
 *
 * It works on whatever is mounted: an empty / partial port yields a smaller manifest, never a crash.
 * If a porting slice's mount file (routes/mounts/<slice>.js) or registry file (services/registry/<slice>.js)
 * is broken (syntax error, missing require, throws while mounting), that slice is isolated and reported in
 * manifest.generator.sliceErrors instead of taking the whole script down; every other slice is still listed.
 *
 * Nothing here touches a database, the network or any secret. The app is only built, never served.
 *
 * Per endpoint the fields are the reference schema's: id, method, path, auth, admin, roles, minTier, guards,
 * chain, handler, mountPrefix, mountOrder, order, flags. A middleware counts as
 *   auth   kind 'auth'  -> guards "authenticateToken"
 *   plan   kind 'plan'  -> guards "requirePlan(n)", minTier = highest n
 *   admin  kind 'admin' -> guards "requireAdmin"
 *   role   kind 'role'  -> guards 'requireRole("a","b")', roles = union
 * Untagged middleware are listed in `chain` as "<untagged:name>" and flagged UNTAGGED_MIDDLEWARE (review flag).
 *
 * Exit codes: 0 ok | 1 usage error or the Worker app could not be built at all.
 */

const fs = require('fs');
const path = require('path');
const Module = require('module');

const BACKEND_DIR = path.resolve(__dirname, '..', '..');
const DEFAULT_WORKER_DIR = path.join(BACKEND_DIR, 'src', 'worker');
const SCRIPT_REL = 'backend/scripts/migration/generate-worker-manifest.js';

const { canonicalizePath } = require('./compare-manifests');
const { listRoutes, listMounts } = require(path.join(DEFAULT_WORKER_DIR, 'lib', 'routes'));

/**
 * The schema object is taken from generate-manifest.js so the two generators cannot drift. That module needs
 * @babel/parser (installed transitively by jest); when it is unavailable fall back to the identifying fields.
 */
function loadSchema() {
  try {
    require.resolve('@babel/parser');
    return require('./generate-manifest').SCHEMA;
  } catch (e) {
    return { name: 'jobtune-endpoint-manifest', version: 1, note: 'fallback: full schema text lives in docs/migration/manifest.render.json' };
  }
}

/* ------------------------------------------------------------------------- */
/* Middleware -> guard semantics                                              */
/* ------------------------------------------------------------------------- */

const GUARD_NAME_RE = /^(authenticateToken|optionalAuth|(authenticate|require)[A-Z]\w*)(\(.*\))?$/;

function tierOf(m) {
  return Number.isInteger(m.minTier) ? m.minTier : null;
}

/** @returns {{ label: string, name: string }|null} canonical guard label in the reference notation */
function guardFor(m) {
  switch (m.kind) {
    case 'auth': return { name: 'authenticateToken', label: 'authenticateToken' };
    case 'plan': return { name: 'requirePlan', label: `requirePlan(${m.minTier === undefined ? '' : m.minTier})` };
    case 'admin': return { name: 'requireAdmin', label: 'requireAdmin' };
    case 'role': return {
      name: 'requireRole',
      label: `requireRole(${(Array.isArray(m.roles) ? m.roles : []).map((r) => JSON.stringify(r)).join(',')})`,
    };
    default:
      if (m.kind !== 'untagged' && typeof m.name === 'string' && GUARD_NAME_RE.test(m.name)) {
        return { name: m.name.split('(')[0], label: m.name };
      }
      return null;
  }
}

function describeEndpoint(route, order, mounts) {
  const flags = [];
  const chain = [];
  const guardEntries = [];
  let untagged = 0;

  for (const m of route.middleware) {
    if (m.kind === 'untagged') {
      untagged++;
      chain.push(`<untagged:${m.name}>`);
      continue;
    }
    chain.push(m.name);
    const g = guardFor(m);
    if (g) guardEntries.push({ ...g, mw: m });
  }
  if (untagged) flags.push('UNTAGGED_MIDDLEWARE');

  const idx = (name) => guardEntries.findIndex((g) => g.name === name);
  const auth = idx('authenticateToken') >= 0;
  const admin = idx('requireAdmin') >= 0;

  const roleGuards = guardEntries.filter((g) => g.name === 'requireRole');
  let roles = null;
  if (roleGuards.length) {
    roles = [];
    for (const g of roleGuards) for (const r of (Array.isArray(g.mw.roles) ? g.mw.roles : [])) if (!roles.includes(String(r))) roles.push(String(r));
    if (roleGuards.some((g) => !Array.isArray(g.mw.roles))) flags.push('NON_LITERAL_ROLES');
  }

  let minTier = null;
  const planGuards = guardEntries.filter((g) => g.name === 'requirePlan');
  if (planGuards.length) {
    const vals = planGuards.map((g) => {
      const t = tierOf(g.mw);
      if (t === null) { flags.push('NON_LITERAL_MINTIER'); return String(g.mw.minTier); }
      return t;
    });
    const nums = vals.filter((v) => typeof v === 'number');
    minTier = nums.length === vals.length ? Math.max(...nums) : vals.find((v) => typeof v === 'string');
    if (planGuards.length > 1) flags.push('MULTIPLE_PLAN_GUARDS');
  }

  const authIdx = idx('authenticateToken');
  const planIdx = idx('requirePlan');
  if (planIdx >= 0 && authIdx < 0) flags.push('PLAN_WITHOUT_AUTH');
  else if (planIdx >= 0 && planIdx < authIdx) flags.push('PLAN_BEFORE_AUTH');
  const adminIdx = idx('requireAdmin');
  if (adminIdx >= 0 && authIdx < 0) flags.push('ADMIN_WITHOUT_AUTH');
  else if (adminIdx >= 0 && adminIdx < authIdx) flags.push('ADMIN_BEFORE_AUTH');

  const p = normalisePath(route.path);
  const mount = mounts
    .map((m, i) => ({ ...m, order: i + 1 }))
    .filter((m) => m.prefix === '/' || p === m.prefix || p.startsWith(m.prefix + '/'))
    .sort((a, b) => b.prefix.length - a.prefix.length)[0];

  return {
    id: `${route.method} ${p}`,
    method: route.method,
    path: p,
    auth, admin, roles, minTier,
    guards: guardEntries.map((g) => g.label),
    chain,
    handler: route.handler,
    mountPrefix: mount ? mount.prefix : null,
    mountOrder: mount ? mount.order : null,
    order,
    flags: Array.from(new Set(flags)),
  };
}

function normalisePath(p) {
  const s = String(p);
  return s.length > 1 ? s.replace(/\/+$/, '') || '/' : s;
}

function inPrefixes(pathname, prefixes) {
  if (!prefixes || !prefixes.length) return true;
  const c = canonicalizePath(pathname);
  return prefixes.some((pre) => {
    const cp = canonicalizePath(pre);
    return cp === '/' || c === cp || c.startsWith(cp + '/');
  });
}

/** Build the manifest object from a live Hono app. Pure; no I/O. */
function manifestFromApp(app, opts = {}) {
  const { onlyPrefixes = [], generator = {} } = opts;
  const mounts = listMounts(app);
  const routes = listRoutes(app);
  let endpoints = routes.map((r, i) => describeEndpoint(r, i + 1, mounts));
  if (onlyPrefixes.length) {
    endpoints = endpoints.filter((e) => inPrefixes(e.path, onlyPrefixes)).map((e, i) => ({ ...e, order: i + 1 }));
  }

  const byTier = {};
  endpoints.filter((e) => e.minTier !== null).forEach((e) => { byTier[String(e.minTier)] = (byTier[String(e.minTier)] || 0) + 1; });
  const untaggedEndpoints = endpoints.filter((e) => e.flags.includes('UNTAGGED_MIDDLEWARE')).length;

  return {
    schema: loadSchema(),
    generator: {
      script: SCRIPT_REL,
      source: 'live Hono app (src/worker/app.js createApp({ mountSlices: true })) + lib/routes.js listRoutes()/listMounts()',
      note: 'Derived from the built Worker app; no server started, no database/network access. Deterministic for a given source tree.',
      mode: 'full',
      sliceErrors: [],
      ...generator,
      onlyPrefixes,
    },
    counts: {
      endpointsTotal: endpoints.length,
      authenticated: endpoints.filter((e) => e.auth).length,
      public: endpoints.filter((e) => !e.auth).length,
      adminGuarded: endpoints.filter((e) => e.admin).length,
      roleGuarded: endpoints.filter((e) => e.roles).length,
      planGated: endpoints.filter((e) => e.minTier !== null).length,
      planGatedByTier: byTier,
      endpointsWithUntaggedMiddleware: untaggedEndpoints,
      mountPoints: mounts.length,
    },
    mounts: mounts.map((m, i) => ({ order: i + 1, prefix: m.prefix, routes: m.routes })),
    endpoints,
  };
}

/* ------------------------------------------------------------------------- */
/* Loading the Worker app, tolerating broken / half-written slices            */
/* ------------------------------------------------------------------------- */

const msg = (e) => String((e && e.message) || e).split('\n')[0];

/**
 * Mount each slice separately so one throwing mount() cannot hide the others.
 * (Routes a throwing mount() registered before it threw stay in the app; they are real and are reported.)
 * @returns {{slice: string, phase: string, error: string}[]}
 */
function mountSlicesResilient(app, slices) {
  const errors = [];
  for (const s of slices) {
    try {
      s.mount(app);
    } catch (e) {
      errors.push({ slice: s.name, phase: 'mount', error: msg(e) });
    }
  }
  return errors;
}

function listJsFiles(dir) {
  try {
    return fs.readdirSync(dir).filter((f) => f.endsWith('.js') && f !== 'index.js').sort().map((f) => path.join(dir, f));
  } catch (e) {
    return [];
  }
}

/**
 * Attempt 1: createApp({ mountSlices: true }) exactly like worker-entry.js.
 * Attempt 2 (only if that throws): require every routes/mounts/<slice>.js and services/registry/<slice>.js on its
 * own, stub the ones that fail to load (Module._load hook, active only while app.js is being required), and mount
 * the healthy slices one by one. Note: the Module._load hook affects plain Node only (the CLI); Jest's own module
 * system bypasses it, so tests cover the mount-time path through mountSlicesResilient and the load-time path
 * through the CLI in a child process.
 */
function loadWorkerApp(opts = {}) {
  const workerDir = path.resolve(opts.workerDir || DEFAULT_WORKER_DIR);
  const mountSlices = opts.mountSlices !== false;
  const appPath = path.join(workerDir, 'app.js');

  let firstError;
  try {
    const { createApp } = require(appPath);
    return { app: createApp({ mountSlices }), mode: 'full', sliceErrors: [] };
  } catch (e) {
    firstError = e;
  }

  const mountsDir = path.join(workerDir, 'routes', 'mounts');
  const registryDir = path.join(workerDir, 'services', 'registry');
  const sliceErrors = [];
  const stubs = new Map(); // absolute file -> stub export
  const healthy = [];

  for (const abs of listJsFiles(mountsDir)) {
    const slice = path.basename(abs, '.js');
    try {
      const m = require(abs);
      if (!m || typeof m.mount !== 'function') throw new Error('does not export mount(app)');
      healthy.push({ name: slice, mount: m.mount });
    } catch (e) {
      sliceErrors.push({ slice, phase: 'load', file: path.relative(BACKEND_DIR, abs).split(path.sep).join('/'), error: msg(e) });
      stubs.set(abs, { mount() {} });
    }
  }
  for (const abs of listJsFiles(registryDir)) {
    try {
      const r = require(abs);
      if (!r || typeof r !== 'object') throw new Error('does not export an object of service factories');
    } catch (e) {
      sliceErrors.push({ slice: path.basename(abs, '.js'), phase: 'load-registry', file: path.relative(BACKEND_DIR, abs).split(path.sep).join('/'), error: msg(e) });
      stubs.set(abs, {});
    }
  }

  const origLoad = Module._load;
  Module._load = function patchedLoad(request, parent, isMain) {
    let resolved = null;
    try { resolved = Module._resolveFilename(request, parent, isMain); } catch (e) { /* handled below */ }
    if (resolved && stubs.has(resolved)) return stubs.get(resolved);
    if (!resolved && typeof request === 'string' && request.startsWith('.') && parent && parent.filename) {
      const dir = path.dirname(parent.filename);
      if (dir === mountsDir) {
        sliceErrors.push({ slice: request.replace(/^\.\//, ''), phase: 'load', error: 'mount file missing (referenced from routes/mounts/index.js)' });
        return { mount() {} };
      }
      if (dir === path.join(workerDir, 'services') && /registry\//.test(request)) {
        sliceErrors.push({ slice: path.basename(request), phase: 'load-registry', error: 'registry file missing (referenced from services/index.js)' });
        return {};
      }
    }
    return origLoad.apply(this, arguments);
  };

  let app;
  try {
    const { createApp } = require(appPath);
    app = createApp({ mountSlices: false });
  } catch (e) {
    const err = new Error(`cannot build the Worker app even without slices: ${msg(e)} (first failure: ${msg(firstError)})`);
    err.cause = e;
    throw err;
  } finally {
    Module._load = origLoad;
  }

  if (mountSlices) sliceErrors.push(...mountSlicesResilient(app, healthy));
  sliceErrors.unshift({ slice: '(app)', phase: 'createApp', error: `createApp({ mountSlices: true }) failed: ${msg(firstError)}; fell back to per-slice mounting` });
  return { app, mode: 'resilient', sliceErrors };
}

function buildWorkerManifest(opts = {}) {
  const { app, mode, sliceErrors } = loadWorkerApp(opts);
  return manifestFromApp(app, { onlyPrefixes: opts.onlyPrefixes || [], generator: { mode, sliceErrors } });
}

/* ------------------------------------------------------------------------- */
/* CLI                                                                        */
/* ------------------------------------------------------------------------- */

function parseArgs(argv) {
  const o = { onlyPrefixes: [], json: false, out: null, help: false, mountSlices: true, workerDir: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') o.json = true;
    else if (a === '--out') { o.out = argv[++i]; if (!o.out) throw new Error('--out needs a file'); }
    else if (a.startsWith('--out=')) o.out = a.slice(6);
    else if (a === '--only-prefix') { const v = argv[++i]; if (!v) throw new Error('--only-prefix needs a value'); o.onlyPrefixes.push(v); }
    else if (a.startsWith('--only-prefix=')) o.onlyPrefixes.push(a.slice('--only-prefix='.length));
    else if (a === '--no-slices') o.mountSlices = false;
    else if (a === '--worker-dir') o.workerDir = argv[++i];
    else if (a === '-h' || a === '--help') o.help = true;
    else throw new Error(`Unknown option ${a}`);
  }
  return o;
}

function summary(m) {
  const c = m.counts;
  const L = [];
  L.push('== Worker manifest ==');
  L.push(`build mode: ${m.generator.mode}${m.generator.onlyPrefixes.length ? `  |  only-prefix: ${m.generator.onlyPrefixes.join(', ')}` : ''}`);
  L.push(`endpoints: ${c.endpointsTotal} | auth ${c.authenticated} | public ${c.public} | admin ${c.adminGuarded} | role ${c.roleGuarded} | plan-gated ${c.planGated} ${JSON.stringify(c.planGatedByTier)} | mounts ${c.mountPoints}`);
  if (c.endpointsWithUntaggedMiddleware) L.push(`REVIEW: ${c.endpointsWithUntaggedMiddleware} endpoint(s) carry untagged middleware (guards may be invisible to this manifest)`);
  const perPrefix = new Map();
  m.endpoints.forEach((e) => { const k = e.mountPrefix || '(app)'; perPrefix.set(k, (perPrefix.get(k) || 0) + 1); });
  if (perPrefix.size) {
    L.push('per mount prefix:');
    [...perPrefix.entries()].forEach(([k, n]) => L.push(`  ${k.padEnd(34)} ${n}`));
  }
  if (m.generator.sliceErrors.length) {
    L.push('SLICE ERRORS (isolated, not fatal):');
    m.generator.sliceErrors.forEach((s) => L.push(`  [${s.slice}] ${s.phase}: ${s.error}`));
  }
  const flagged = m.endpoints.filter((e) => e.flags.length);
  if (flagged.length) {
    L.push('flagged endpoints:');
    flagged.slice(0, 20).forEach((e) => L.push(`  ${e.id}: ${e.flags.join(', ')}`));
    if (flagged.length > 20) L.push(`  ... (+${flagged.length - 20})`);
  }
  return L.join('\n');
}

function main(argv) {
  let o;
  try { o = parseArgs(argv); } catch (e) { console.error(e.message); return 1; }
  if (o.help) {
    console.log(fs.readFileSync(__filename, 'utf8').split('*/')[0]);
    return 0;
  }
  let manifest;
  try {
    manifest = buildWorkerManifest({ onlyPrefixes: o.onlyPrefixes, mountSlices: o.mountSlices, workerDir: o.workerDir || undefined });
  } catch (e) {
    console.error(`generate-worker-manifest: ${msg(e)}`);
    return 1;
  }
  const text = JSON.stringify(manifest, null, 2) + '\n';
  if (o.out) {
    fs.mkdirSync(path.dirname(path.resolve(o.out)), { recursive: true });
    fs.writeFileSync(path.resolve(o.out), text);
  }
  if (o.json) process.stdout.write(text);
  else {
    console.log(summary(manifest));
    if (o.out) console.log(`\nwrote ${path.resolve(o.out)}`);
  }
  return 0;
}

module.exports = { buildWorkerManifest, manifestFromApp, loadWorkerApp, mountSlicesResilient, guardFor, describeEndpoint, summary };

if (require.main === module) process.exitCode = main(process.argv.slice(2));
