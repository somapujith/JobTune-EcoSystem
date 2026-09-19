'use strict';

/**
 * The slice's mount file (routes/mounts/large1.js) must produce exactly the routes the manifest-driven
 * mini-app in helpers.js mounts, and must be usable through the real aggregator.
 */
const { createApp } = require('../../../src/worker/app');
const { listRoutes, listMounts } = require('../../../src/worker/lib/routes');
const { mount } = require('../../../src/worker/routes/mounts/large1');
const { mountAll } = require('../../../src/worker/routes/mounts');
const { large1Mounts, large1Endpoints, mountLarge1, makeLarge1 } = require('./helpers');

const summarize = (app) =>
  listRoutes(app)
    .filter((r) => /^\/api\/(community|project-builder|courses)(\/|$)/.test(r.path))
    .map((r) => ({ method: r.method, path: r.path, auth: r.auth, minTier: r.minTier, mw: r.middleware.map((m) => m.name) }));

describe('routes/mounts/large1.js', () => {
  it('mounts the same 26 routes, in the same order, as the manifest-driven mini-app', () => {
    const viaFile = createApp();
    mount(viaFile);
    const viaManifest = createApp();
    mountLarge1(viaManifest);
    expect(summarize(viaFile)).toHaveLength(26);
    expect(summarize(viaFile)).toEqual(summarize(viaManifest));
    expect(listMounts(viaFile).map((m) => m.prefix)).toEqual(['/api', ...large1Mounts().map((m) => m.prefix)]);
  });

  it('is what the aggregator applies: mountAll adds these endpoints (and nothing under their prefixes is missing)', () => {
    const app = createApp();
    mountAll(app);
    const have = new Set(summarize(app).map((r) => `${r.method} ${r.path}`));
    for (const e of large1Endpoints()) expect(have).toContain(`${e.method} ${e.path}`);
  });

  it('a mounted route answers end to end through the file-mounted app (auth + plan + handler)', async () => {
    const H = makeLarge1({ plan: 1, script: () => [] });
    const res = await H.authed('/api/project-builder/templates');
    expect(res.status).toBe(200);
  });
});
