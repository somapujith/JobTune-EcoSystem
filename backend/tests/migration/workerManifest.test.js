/**
 * ADR-001 Phase 4: Worker-side manifest extractor (scripts/migration/generate-worker-manifest.js) and the
 * parity wrapper. Runs entirely offline against the built (never served) Hono app and synthetic mini apps.
 *
 * Deliberately NOT asserted: full parity with docs/migration/manifest.render.json. That is red until the port
 * is complete and is run through `npm run migration:parity`, not through the default Jest suite.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const {
  buildWorkerManifest, manifestFromApp, mountSlicesResilient, guardFor,
} = require('../../scripts/migration/generate-worker-manifest');
const { compareManifests, validateManifest } = require('../../scripts/migration/compare-manifests');
const { separateStaticExtras } = require('../../scripts/migration/parity');
const { createApp } = require('../../src/worker/app');
const { createRouter, mountRoutes } = require('../../src/worker/lib/routes');
const { tagMiddleware } = require('../../src/worker/lib/tag');
const { authenticateToken } = require('../../src/worker/middleware/auth');
const { requirePlan } = require('../../src/worker/middleware/requirePlan');

const BACKEND_DIR = path.resolve(__dirname, '..', '..');
const SCRIPT = path.join(BACKEND_DIR, 'scripts', 'migration', 'generate-worker-manifest.js');
const REFERENCE = path.join(BACKEND_DIR, '..', 'docs', 'migration', 'manifest.render.json');

const requireAdmin = () => tagMiddleware(async (c, next) => next(), 'requireAdmin', { kind: 'admin' });
const requireRole = (...roles) => tagMiddleware(async (c, next) => next(), `requireRole(${roles.join(',')})`, { kind: 'role', roles });
const handler = (c) => c.json({ ok: true });
const find = (m, id) => m.endpoints.find((e) => e.id === id);

/** A mini Worker app exercising every guard kind the extractor understands. */
function miniApp() {
  const app = createApp();
  const r = createRouter();
  r.get('/open', handler);
  r.get('/protected', authenticateToken, handler);
  r.get('/tier2', authenticateToken, requirePlan(2), handler);
  r.post('/tier3', authenticateToken, requirePlan(3), handler);
  r.get('/items/:id{[0-9]+}', authenticateToken, handler);
  r.get('/before-file-guard', handler); // registered BEFORE the use(): not guarded (Express semantics)
  r.use('*', authenticateToken, requireAdmin());
  r.get('/admin-stats', handler);
  r.put('/admin-role', requirePlan(1), handler);
  mountRoutes(app, '/api/m', r);

  const roles = createRouter();
  roles.get('/uni', authenticateToken, requireRole('admin', 'university'), handler);
  roles.get('/multi', authenticateToken, requireRole('admin'), requireRole('faculty', 'admin'), handler);
  mountRoutes(app, '/api/roles', roles);

  const bad = createRouter();
  bad.get('/plan-no-auth', requirePlan(2), handler);
  bad.get('/plan-before-auth', requirePlan(2), authenticateToken, handler);
  bad.get('/untagged', async (c, next) => next(), authenticateToken, handler); // untagged middleware
  bad.get('/weird-tier', authenticateToken, tagMiddleware(async (c, next) => next(), 'requirePlan(x)', { kind: 'plan', minTier: 'x' }), handler);
  bad.get('/two-plans', authenticateToken, requirePlan(1), requirePlan(3), handler);
  bad.get('/onboarding', authenticateToken, tagMiddleware(async (c, next) => next(), 'requireOnboarding', { kind: 'guard' }), handler);
  mountRoutes(app, '/api/bad', bad);
  return app;
}

describe('generate-worker-manifest: extraction semantics (mini app)', () => {
  let m;
  beforeAll(() => { m = manifestFromApp(miniApp()); });

  it('emits the reference schema and a manifest the comparator accepts', () => {
    expect(m.schema.name).toBe('jobtune-endpoint-manifest');
    expect(m.schema.version).toBe(1);
    expect(m.schema.requiredForComparison).toEqual(['method', 'path', 'auth']);
    expect(validateManifest(m, 'candidate')).toEqual([]);
    const ref = JSON.parse(fs.readFileSync(REFERENCE, 'utf8'));
    expect(m.schema).toEqual(ref.schema); // cannot drift from the Render manifest's schema
  });

  it('public, auth and plan-gated endpoints', () => {
    expect(find(m, 'GET /api/m/open')).toMatchObject({ auth: false, admin: false, roles: null, minTier: null, guards: [] });
    expect(find(m, 'GET /api/m/protected')).toMatchObject({ auth: true, minTier: null, guards: ['authenticateToken'] });
    expect(find(m, 'GET /api/m/tier2')).toMatchObject({ auth: true, minTier: 2, guards: ['authenticateToken', 'requirePlan(2)'] });
    expect(find(m, 'POST /api/m/tier3')).toMatchObject({ auth: true, minTier: 3 });
  });

  it('file-level router.use(...) guards are positional (only later routes are covered)', () => {
    expect(find(m, 'GET /api/m/before-file-guard')).toMatchObject({ auth: false, admin: false });
    expect(find(m, 'GET /api/m/admin-stats')).toMatchObject({ auth: true, admin: true, guards: ['authenticateToken', 'requireAdmin'] });
    const put = find(m, 'PUT /api/m/admin-role');
    expect(put).toMatchObject({ auth: true, admin: true, minTier: 1 });
    expect(put.guards).toEqual(['authenticateToken', 'requireAdmin', 'requirePlan(1)']);
  });

  it('keeps Hono param syntax in the path and pairs with Express regex syntax in the comparator', () => {
    const e = find(m, 'GET /api/m/items/:id{[0-9]+}');
    expect(e).toBeDefined();
    const ref = { schema: { version: 1 }, endpoints: [{ method: 'GET', path: '/api/m/items/:id(\\d+)', auth: true }] };
    expect(compareManifests(ref, { schema: { version: 1 }, endpoints: [e] }).exitCode).toBe(0);
  });

  it('role guards: union of roles, reference label notation', () => {
    expect(find(m, 'GET /api/roles/uni')).toMatchObject({ auth: true, roles: ['admin', 'university'], guards: ['authenticateToken', 'requireRole("admin","university")'] });
    expect(find(m, 'GET /api/roles/multi').roles).toEqual(['admin', 'faculty']);
  });

  it('flags suspicious shapes instead of hiding them', () => {
    expect(find(m, 'GET /api/bad/plan-no-auth').flags).toContain('PLAN_WITHOUT_AUTH');
    expect(find(m, 'GET /api/bad/plan-before-auth').flags).toContain('PLAN_BEFORE_AUTH');
    const untagged = find(m, 'GET /api/bad/untagged');
    expect(untagged.flags).toContain('UNTAGGED_MIDDLEWARE');
    expect(untagged.chain.some((x) => x.startsWith('<untagged:'))).toBe(true);
    expect(untagged.auth).toBe(true);
    expect(m.counts.endpointsWithUntaggedMiddleware).toBe(1);
    expect(find(m, 'GET /api/bad/two-plans')).toMatchObject({ minTier: 3, flags: ['MULTIPLE_PLAN_GUARDS'] });
    const weird = find(m, 'GET /api/bad/weird-tier');
    expect(weird.minTier).toBe('x');
    expect(weird.flags).toContain('NON_LITERAL_MINTIER');
  });

  it('other named guards are carried through (so a dropped requireOnboarding would be an ERROR)', () => {
    const e = find(m, 'GET /api/bad/onboarding');
    expect(e.guards).toEqual(['authenticateToken', 'requireOnboarding']);
    const ref = { schema: { version: 1 }, endpoints: [{ method: 'GET', path: '/api/bad/onboarding', auth: true, guards: ['authenticateToken', 'requireOnboarding'] }] };
    const cand = { schema: { version: 1 }, endpoints: [{ ...e, guards: ['authenticateToken'] }] };
    expect(compareManifests(ref, cand).findings.map((f) => f.code)).toEqual(['GUARD_MISSING_IN_CANDIDATE']);
  });

  it('records mounts and the owning prefix of each endpoint', () => {
    expect(m.mounts.map((x) => x.prefix)).toEqual(['/api', '/api/m', '/api/roles', '/api/bad']);
    expect(find(m, 'GET /api/m/open')).toMatchObject({ mountPrefix: '/api/m', mountOrder: 2 });
    expect(find(m, 'GET /api/health')).toMatchObject({ mountPrefix: '/api', auth: false });
  });

  it('is deterministic and orders endpoints by registration', () => {
    expect(JSON.stringify(manifestFromApp(miniApp()))).toBe(JSON.stringify(manifestFromApp(miniApp())));
    const orders = m.endpoints.map((e) => e.order);
    expect(orders).toEqual(orders.map((_, i) => i + 1));
  });

  it('--only-prefix scoping keeps only matching endpoints (segment-wise, case-insensitive)', () => {
    const only = manifestFromApp(miniApp(), { onlyPrefixes: ['/api/M', '/api/health'] });
    expect(only.endpoints.every((e) => e.path.startsWith('/api/m/') || e.path === '/api/health')).toBe(true);
    expect(only.endpoints.some((e) => e.path.startsWith('/api/roles'))).toBe(false);
    expect(manifestFromApp(miniApp(), { onlyPrefixes: ['/api/mm'] }).endpoints).toEqual([]);
  });

  it('guardFor maps tag kinds to reference labels', () => {
    expect(guardFor({ kind: 'auth', name: 'x' })).toEqual({ name: 'authenticateToken', label: 'authenticateToken' });
    expect(guardFor({ kind: 'plan', minTier: 2, name: 'x' }).label).toBe('requirePlan(2)');
    expect(guardFor({ kind: 'audit', name: 'auditLogger(A)' })).toBeNull();
    expect(guardFor({ kind: 'untagged', name: 'requireSomething' })).toBeNull();
    expect(guardFor({ kind: 'guard', name: 'requireOnboarding' }).name).toBe('requireOnboarding');
  });
});

describe('generate-worker-manifest: a regression on the Worker is caught by the comparator', () => {
  const ref = (endpoints) => ({ schema: { version: 1 }, endpoints });

  it('reports CRITICAL when Workers drops a plan gate, lowers a tier or drops auth/admin', () => {
    const w = manifestFromApp(miniApp());
    const reference = ref([
      { method: 'GET', path: '/api/m/tier2', auth: true, minTier: 3 }, // Render 3, Worker 2
      { method: 'GET', path: '/api/m/protected', auth: true, minTier: 1 }, // Render gated, Worker not
      { method: 'GET', path: '/api/m/open', auth: true }, // Render authenticated, Worker public
      { method: 'GET', path: '/api/m/before-file-guard', auth: true, admin: true },
    ]);
    const r = compareManifests(reference, w, { onlyPrefixes: ['/api/m'] });
    const critical = r.findings.filter((f) => f.severity === 'CRITICAL').map((f) => f.code).sort();
    expect(critical).toEqual(['ADMIN_DROPPED', 'AUTH_DROPPED', 'AUTH_DROPPED', 'MINTIER_DROPPED', 'MINTIER_LOWERED'].sort());
    expect(r.exitCode).toBe(2);
  });

  it('reports MISSING_IN_CANDIDATE for endpoints that are not ported yet (partial state)', () => {
    const w = manifestFromApp(createApp());
    const r = compareManifests(ref([
      { method: 'GET', path: '/api/health', auth: false },
      { method: 'GET', path: '/api/skills/questions', auth: true, minTier: 1 },
    ]), w);
    expect(r.findings.map((f) => f.code)).toEqual(['MISSING_IN_CANDIDATE']);
    expect(compareManifests(ref([{ method: 'GET', path: '/api/health', auth: false }, { method: 'GET', path: '/api/skills/questions', auth: true, minTier: 1 }]), w, { onlyPrefixes: ['/api/health'] }).exitCode).toBe(0);
  });
});

describe('generate-worker-manifest: the real Worker app in its current (partial) state', () => {
  it('builds without throwing and always contains the health endpoint', () => {
    const m = buildWorkerManifest();
    expect(['full', 'resilient']).toContain(m.generator.mode);
    expect(Array.isArray(m.endpoints)).toBe(true);
    expect(validateManifest(m, 'candidate')).toEqual([]);
    expect(find(m, 'GET /api/health')).toMatchObject({ auth: false, admin: false, minTier: null });
  });

  it('every endpoint it reports is well-formed, and none carries a plan gate without auth', () => {
    const m = buildWorkerManifest();
    for (const e of m.endpoints) {
      expect(e.path.startsWith('/')).toBe(true);
      expect(typeof e.auth).toBe('boolean');
      if (e.minTier !== null) {
        expect(e.auth).toBe(true);
        expect(e.flags).not.toContain('PLAN_WITHOUT_AUTH');
      }
    }
  });

  it('scoped comparison against the Render reference for the one always-present prefix is clean', () => {
    const ref = JSON.parse(fs.readFileSync(REFERENCE, 'utf8'));
    const cand = buildWorkerManifest({ onlyPrefixes: ['/api/health'] });
    const r = compareManifests(ref, cand, { onlyPrefixes: ['/api/health'] });
    expect(r.exitCode).toBe(0);
    expect(r.summary.compared).toBe(1);
  });

  it('works with no slices mounted at all (empty state)', () => {
    const m = buildWorkerManifest({ mountSlices: false });
    expect(m.endpoints.map((e) => e.id)).toEqual(['GET /api/health']);
  });
});

describe('mountSlicesResilient', () => {
  it('isolates a throwing slice, keeps the rest, and reports the error', () => {
    const app = createApp();
    const good = (prefix) => (a) => { const r = createRouter(); r.get('/x', handler); mountRoutes(a, prefix, r); };
    const errors = mountSlicesResilient(app, [
      { name: 'one', mount: good('/api/one') },
      { name: 'boom', mount: () => { throw new Error('cannot mount: half-written slice'); } },
      { name: 'two', mount: good('/api/two') },
    ]);
    expect(errors).toEqual([{ slice: 'boom', phase: 'mount', error: 'cannot mount: half-written slice' }]);
    const m = manifestFromApp(app, { generator: { mode: 'resilient', sliceErrors: errors } });
    expect(m.endpoints.map((e) => e.id)).toEqual(['GET /api/health', 'GET /api/one/x', 'GET /api/two/x']);
    expect(m.generator.sliceErrors).toHaveLength(1);
  });
});

describe('parity: static admin page is not an API endpoint', () => {
  it('drops GET /admin* extras the reference does not list, keeps everything else', () => {
    const reference = { endpoints: [{ method: 'GET', path: '/api/admin/stats', auth: true }] };
    const candidate = { endpoints: [
      { method: 'GET', path: '/admin' }, { method: 'GET', path: '/admin/*' }, { method: 'GET', path: '/api/admin/stats' },
      { method: 'POST', path: '/admin/evil' }, { method: 'GET', path: '/administrator' },
    ] };
    const { kept, ignored } = separateStaticExtras(reference, candidate);
    expect(ignored.map((e) => e.path)).toEqual(['/admin', '/admin/*']);
    expect(kept.map((e) => `${e.method} ${e.path}`)).toEqual(['GET /api/admin/stats', 'POST /admin/evil', 'GET /administrator']);
  });
});

describe('generate-worker-manifest: CLI', () => {
  const run = (args) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8', cwd: BACKEND_DIR });
  let tmp;
  beforeAll(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'worker-manifest-')); });
  afterAll(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

  it('--json prints a parseable manifest; --only-prefix scopes it', () => {
    const r = run(['--json', '--only-prefix', '/api/health']);
    expect(r.status).toBe(0);
    const m = JSON.parse(r.stdout);
    expect(m.endpoints.map((e) => e.id)).toEqual(['GET /api/health']);
    expect(m.generator.onlyPrefixes).toEqual(['/api/health']);
  });

  it('--out writes the file and prints a human summary', () => {
    const out = path.join(tmp, 'nested', 'w.json');
    const r = run(['--out', out, '--only-prefix', '/api/health']);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/Worker manifest/);
    expect(JSON.parse(fs.readFileSync(out, 'utf8')).endpoints).toHaveLength(1);
  });

  it('the written file feeds compare-manifests.js (exit 0 on the health prefix)', () => {
    const out = path.join(tmp, 'w2.json');
    expect(run(['--out', out, '--only-prefix', '/api/health']).status).toBe(0);
    const cmp = spawnSync(process.execPath, [path.join(BACKEND_DIR, 'scripts', 'migration', 'compare-manifests.js'), REFERENCE, out, '--only-prefix', '/api/health'], { encoding: 'utf8' });
    expect(cmp.status).toBe(0);
    expect(cmp.stdout).toMatch(/RESULT: PASS/);
  });

  it('rejects unknown options with exit 1', () => {
    const r = run(['--nope']);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/Unknown option/);
  });

  it('parity.js exits 0 on the health prefix and on an empty scope', () => {
    const parity = (args) => spawnSync(process.execPath, [path.join(BACKEND_DIR, 'scripts', 'migration', 'parity.js'), ...args], { encoding: 'utf8', cwd: BACKEND_DIR });
    expect(parity(['--only-prefix', '/api/health']).status).toBe(0);
    const zero = parity(['--only-prefix', '/api/definitely-not-a-prefix']);
    expect(zero.status).toBe(0); // nothing in scope on either side
    expect(zero.stdout).toMatch(/PASS/);
  });

  describe('a broken / half-written slice does not take the script down (child process, real Module hook)', () => {
    let dir;
    const abs = (rel) => JSON.stringify(path.join(BACKEND_DIR, 'src', 'worker', rel));

    beforeAll(() => {
      dir = path.join(tmp, 'fixture-worker');
      const w = (rel, text) => { fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), text); };
      w('app.js', `
        const { Hono } = require(${JSON.stringify(require.resolve('hono'))});
        const { mountAll } = require('./routes/mounts');
        function createApp(opts = {}) { const app = new Hono({ strict: false }); if (opts.mountSlices) mountAll(app); return app; }
        module.exports = { createApp };`);
      w('routes/mounts/index.js', `
        const SLICES = [require('./good'), require('./broken'), require('./missing'), require('./throwsatmount')];
        module.exports = { mountAll(app) { for (const s of SLICES) s.mount(app); } };`);
      w('routes/mounts/good.js', `
        const { createRouter, mountRoutes } = require(${abs('lib/routes')});
        const { authenticateToken } = require(${abs('middleware/auth')});
        const { requirePlan } = require(${abs('middleware/requirePlan')});
        module.exports = { mount(app) { const r = createRouter(); r.get('/g', authenticateToken, requirePlan(2), (c) => c.json({})); mountRoutes(app, '/api/good', r); } };`);
      w('routes/mounts/broken.js', `module.exports = { mount() {} }; throw new Error('syntax-ish failure while loading broken slice');`);
      w('routes/mounts/throwsatmount.js', `module.exports = { mount() { throw new Error('mount exploded'); } };`);
      w('services/registry/bad.js', `throw new Error('bad registry');`);
    });

    it('reports the failures in generator.sliceErrors and still lists the healthy slice', () => {
      const r = run(['--json', '--worker-dir', dir]);
      expect(r.status).toBe(0);
      const m = JSON.parse(r.stdout);
      expect(m.generator.mode).toBe('resilient');
      const byPhase = m.generator.sliceErrors.map((s) => `${s.slice}:${s.phase}`);
      expect(byPhase).toEqual(expect.arrayContaining(['(app):createApp', 'broken:load', 'missing:load', 'throwsatmount:mount', 'bad:load-registry']));
      expect(m.endpoints.map((e) => e.id)).toEqual(['GET /api/good/g']);
      expect(m.endpoints[0]).toMatchObject({ auth: true, minTier: 2 });
    });

    it('the human summary lists slice errors', () => {
      const r = run(['--worker-dir', dir]);
      expect(r.status).toBe(0);
      expect(r.stdout).toMatch(/SLICE ERRORS/);
      expect(r.stdout).toMatch(/broken/);
    });

    it('exits 1 with a message (no stack) when the app cannot be built even without slices', () => {
      const bad = path.join(tmp, 'no-app');
      fs.mkdirSync(bad, { recursive: true });
      fs.writeFileSync(path.join(bad, 'app.js'), 'throw new Error("app.js is broken");');
      const r = run(['--json', '--worker-dir', bad]);
      expect(r.status).toBe(1);
      expect(r.stderr).toMatch(/cannot build the Worker app/);
    });
  });
});
