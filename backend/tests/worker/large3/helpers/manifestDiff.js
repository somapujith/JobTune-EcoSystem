'use strict';

/**
 * The manifest referee shared by the large3 tests: loads docs/migration/manifest.render.json, introspects a
 * mini Worker app that mounts ONLY the router(s) under test, and returns every difference as a readable string.
 */
const fs = require('fs');
const path = require('path');
const { createApp } = require('../../../../src/worker/app');
const { mountRoutes, listRoutes } = require('../../../../src/worker/lib/routes');

const PREFIX = '/api/practice';
const MANIFEST_PATH = path.resolve(__dirname, '../../../../../docs/migration/manifest.render.json');

// Keying rule from manifest.render.md: METHOD + lower-cased path, trailing slash stripped, every :param -> ':'
const key = (method, p) =>
  `${method.toUpperCase()} ${p.toLowerCase().replace(/\/+$/, '').replace(/:[A-Za-z0-9_]+(\([^)]*\)|\{[^}]*\})?/g, ':')}`;

const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
const expected = manifest.endpoints.filter((e) => e.path === PREFIX || e.path.startsWith(`${PREFIX}/`));

const inPrefix = (r) => r.path === PREFIX || r.path.startsWith(`${PREFIX}/`);

/** Mini app: only what `mountFn(app)` mounts, on a fresh createApp() (nothing from other slices). */
function introspectWith(mountFn) {
  const app = createApp();
  mountFn(app);
  return listRoutes(app).filter(inPrefix);
}

/** Mini app: only the router under test, mounted where backend/src/app.js mounts it. */
function introspect(router) {
  return introspectWith((app) => mountRoutes(app, PREFIX, router));
}

const guardNames = (r) =>
  r.middleware.filter((m) => ['auth', 'plan', 'admin', 'role'].includes(m.kind)).map((m) => m.name);

/** Every difference between the Worker's introspected routes and the manifest. Empty array = parity. */
function diffAgainstManifest(actualRoutes, expectedEndpoints = expected) {
  const diffs = [];
  const act = new Map(actualRoutes.map((r) => [key(r.method, r.path), r]));
  const exp = new Set(expectedEndpoints.map((e) => key(e.method, e.path)));

  for (const e of expectedEndpoints) {
    const r = act.get(key(e.method, e.path));
    if (!r) {
      diffs.push(`MISSING ${e.id}`);
      continue;
    }
    if (r.auth !== e.auth) diffs.push(`AUTH ${e.id}: worker=${r.auth} manifest=${e.auth}`);
    const wantTier = e.minTier === undefined ? null : e.minTier;
    if (r.minTier !== wantTier) diffs.push(`MINTIER ${e.id}: worker=${r.minTier} manifest=${wantTier}`);
    const guards = guardNames(r);
    if (JSON.stringify(guards) !== JSON.stringify(e.guards || [])) {
      diffs.push(`GUARDS ${e.id}: worker=${JSON.stringify(guards)} manifest=${JSON.stringify(e.guards)}`);
    }
  }
  for (const r of actualRoutes) {
    if (!exp.has(key(r.method, r.path))) diffs.push(`EXTRA ${r.method} ${r.path}`);
  }

  const expOrder = [...expectedEndpoints]
    .sort((a, b) => a.order - b.order)
    .map((e) => key(e.method, e.path))
    .filter((k) => act.has(k));
  const actOrder = actualRoutes.map((r) => key(r.method, r.path)).filter((k) => exp.has(k));
  if (JSON.stringify(expOrder) !== JSON.stringify(actOrder)) diffs.push('ORDER differs from Express registration order');
  return diffs;
}

module.exports = { PREFIX, MANIFEST_PATH, manifest, expected, key, introspect, introspectWith, guardNames, diffAgainstManifest };
