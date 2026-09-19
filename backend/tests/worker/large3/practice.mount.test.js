'use strict';

/**
 * The slice mount file (routes/mounts/large3.js) is what the real Worker app aggregates via
 * routes/mounts/index.js. Prove it registers exactly the manifest's /api/practice endpoints (introspected,
 * not assumed), is registered in the aggregator, and serves real requests end to end.
 * Uses a fresh createApp() (mountSlices off), so other slices' work in progress cannot affect this file.
 */
const fs = require('fs');
const path = require('path');
const { mount } = require('../../../src/worker/routes/mounts/large3');
const { listMounts } = require('../../../src/worker/lib/routes');
const { createApp } = require('../../../src/worker/app');
const { expected, introspectWith, diffAgainstManifest } = require('./helpers/manifestDiff');
const { buildPractice } = require('./helpers/practiceHarness');

describe('routes/mounts/large3.js', () => {
  it('mounts /api/practice and nothing else', () => {
    const app = createApp();
    const before = listMounts(app).map((m) => m.prefix);
    mount(app);
    const added = listMounts(app).map((m) => m.prefix).filter((p, i) => i >= before.length);
    expect(added).toEqual(['/api/practice']);
  });

  it('introspected routes have zero differences against the manifest (auth, minTier, guards, order, no extras)', () => {
    const routes = introspectWith(mount);
    expect(routes).toHaveLength(expected.length);
    expect(diffAgainstManifest(routes, expected)).toEqual([]);
  });

  it('is registered in the slice aggregator (routes/mounts/index.js)', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../../../src/worker/routes/mounts/index.js'), 'utf8');
    expect(src).toMatch(/require\('\.\/large3'\)/);
  });

  it('serves requests through the mounted router end to end (auth, plan gate, handler)', async () => {
    const H = buildPractice({ mount });
    expect((await H.request('/api/practice/stats')).status).toBe(401);
    const ok = await H.get('/api/practice/assessments');
    expect(ok.status).toBe(200);
    expect((await ok.json()).assessments.length).toBeGreaterThan(0);

    const denied = buildPractice({ mount, plan: null });
    const res = await denied.get('/api/practice/problems');
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe('PLAN_UPGRADE_REQUIRED');
  });

  it('adds no service registry entries (the route only uses shared services: aiClient, planService)', () => {
    const registry = require('../../../src/worker/services/registry/large3');
    expect(Object.keys(registry)).toEqual([]);
  });
});
