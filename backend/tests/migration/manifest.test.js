/**
 * ADR-001 T4.1 - endpoint manifest generator + comparator.
 * Fully offline: static AST analysis of backend/src (nothing is executed, no DB, no network)
 * plus synthetic manifests / a throw-away fixture app in the OS temp dir.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const { generateManifest, analyseShadowing } = require('../../scripts/migration/generate-manifest');
const {
  compareManifests, canonicalizePath, segmentsCover, parseSegments,
} = require('../../scripts/migration/compare-manifests');

const BACKEND_DIR = path.resolve(__dirname, '..', '..');
const ROUTES_DIR = path.join(BACKEND_DIR, 'src', 'routes');
const COMPARE_CLI = path.join(BACKEND_DIR, 'scripts', 'migration', 'compare-manifests.js');

/* ------------------------------------------------------------------------- */
/* Comparator (synthetic manifests)                                           */
/* ------------------------------------------------------------------------- */

const ep = (method, p, extra = {}) => ({ method, path: p, auth: true, admin: false, roles: null, minTier: null, guards: [], ...extra });
const man = (...endpoints) => ({ schema: { version: 1 }, endpoints });
const codes = (r, sev) => r.findings.filter((f) => !sev || f.severity === sev).map((f) => f.code);

describe('compare-manifests: path canonicalisation', () => {
  it('is param-name, regex-syntax, case and trailing-slash agnostic', () => {
    expect(canonicalizePath('/api/Users/:id/')).toBe('/api/users/:');
    expect(canonicalizePath('/api/x/:id(\\d+)')).toBe(canonicalizePath('/api/x/:userId{[0-9]+}'));
    expect(canonicalizePath('/')).toBe('/');
  });

  it('segmentsCover models :param shadowing', () => {
    const c = (a, b) => segmentsCover(parseSegments(a), parseSegments(b));
    expect(c('/x/:id', '/x/list')).toBe(true); // param swallows the literal
    expect(c('/x/list', '/x/:id')).toBe(false); // literal does not cover a param
    expect(c('/x/:id', '/x/:other')).toBe(true);
    expect(c('/x/:id', '/x/list/more')).toBe(false); // different depth
    expect(c('/x/:id(\\d+)', '/x/list')).toBe(false); // regex constraint excludes the literal
    expect(c('/x/:id?', '/x/list')).toBe(null); // optional -> undecidable
  });
});

describe('compare-manifests: diffing', () => {
  it('reports zero findings for identical manifests', () => {
    const m = man(ep('GET', '/api/a', { minTier: 2, guards: ['authenticateToken', 'requirePlan(2)'] }), ep('POST', '/api/b', { auth: false }));
    const r = compareManifests(m, JSON.parse(JSON.stringify(m)));
    expect(r.findings).toEqual([]);
    expect(r.exitCode).toBe(0);
    expect(r.summary.compared).toBe(2);
  });

  it('CRITICAL when an endpoint gated on the reference is ungated on the candidate', () => {
    const r = compareManifests(man(ep('GET', '/api/a')), man(ep('GET', '/api/a', { auth: false })));
    expect(codes(r, 'CRITICAL')).toEqual(['AUTH_DROPPED']);
    expect(r.exitCode).toBe(2);
  });

  it('auth added on the candidate is an ERROR (parity break) but not CRITICAL', () => {
    const r = compareManifests(man(ep('GET', '/api/a', { auth: false })), man(ep('GET', '/api/a')));
    expect(codes(r)).toEqual(['AUTH_ADDED']);
    expect(r.exitCode).toBe(1);
  });

  it('CRITICAL when minTier is lowered or dropped, ERROR when raised', () => {
    const ref = man(ep('GET', '/api/a', { minTier: 3 }), ep('GET', '/api/b', { minTier: 2 }), ep('GET', '/api/c', { minTier: 1 }));
    const cand = man(ep('GET', '/api/a', { minTier: 1 }), ep('GET', '/api/b', { minTier: null }), ep('GET', '/api/c', { minTier: 2 }));
    const r = compareManifests(ref, cand);
    expect(codes(r, 'CRITICAL').sort()).toEqual(['MINTIER_DROPPED', 'MINTIER_LOWERED']);
    expect(codes(r, 'ERROR')).toEqual(['MINTIER_RAISED']);
    expect(r.exitCode).toBe(2);
  });

  it('treats a non-numeric candidate minTier as unverifiable (ERROR) and equal strings as equal', () => {
    expect(codes(compareManifests(man(ep('GET', '/a', { minTier: 2 })), man(ep('GET', '/a', { minTier: 'level' }))))).toEqual(['MINTIER_UNVERIFIABLE']);
    expect(compareManifests(man(ep('GET', '/a', { minTier: 'level' })), man(ep('GET', '/a', { minTier: 'level' }))).findings).toEqual([]);
    expect(compareManifests(man(ep('GET', '/a', { minTier: 2 })), man(ep('GET', '/a', { minTier: '2' }))).findings).toEqual([]);
  });

  it('CRITICAL on dropped admin guard and on dropped / widened role guards', () => {
    const ref = man(
      ep('GET', '/api/adm', { admin: true }),
      ep('GET', '/api/r1', { roles: ['admin'] }),
      ep('GET', '/api/r2', { roles: ['admin', 'faculty'] }),
    );
    const cand = man(
      ep('GET', '/api/adm', { admin: false }),
      ep('GET', '/api/r1', { roles: null }),
      ep('GET', '/api/r2', { roles: ['admin', 'faculty', 'student'] }),
    );
    const r = compareManifests(ref, cand);
    expect(codes(r, 'CRITICAL').sort()).toEqual(['ADMIN_DROPPED', 'ROLES_WIDENED', 'ROLE_GUARD_DROPPED']);
    expect(r.exitCode).toBe(2);
  });

  it('reports endpoints missing from / extra in the candidate; --allow-extra downgrades extras', () => {
    const ref = man(ep('GET', '/api/a'), ep('GET', '/api/b'));
    const cand = man(ep('GET', '/api/a'), ep('GET', '/api/extra'));
    const strict = compareManifests(ref, cand);
    expect(codes(strict).sort()).toEqual(['EXTRA_IN_CANDIDATE', 'MISSING_IN_CANDIDATE']);
    expect(strict.exitCode).toBe(1);

    const lenient = compareManifests(ref, cand, { allowExtraInCandidate: true });
    expect(codes(lenient, 'ERROR')).toEqual(['MISSING_IN_CANDIDATE']);
    expect(codes(lenient, 'INFO')).toEqual(['EXTRA_IN_CANDIDATE_ALLOWED']);
    expect(lenient.exitCode).toBe(1);

    const onlyExtra = compareManifests(man(ep('GET', '/api/a')), cand, { allowExtraInCandidate: true });
    expect(onlyExtra.exitCode).toBe(0);
  });

  it('detects method mismatches instead of a bare missing + extra pair', () => {
    const r = compareManifests(man(ep('POST', '/api/a')), man(ep('PUT', '/api/a')));
    expect(codes(r)).toEqual(['METHOD_MISMATCH']);
    expect(r.exitCode).toBe(1);
  });

  it('pairs endpoints across param naming / regex syntax; flags case-only differences', () => {
    const r = compareManifests(
      man(ep('GET', '/api/x/:id(\\d+)'), ep('GET', '/api/Skills')),
      man(ep('GET', '/api/x/:userId{[0-9]+}'), ep('GET', '/api/skills')),
    );
    expect(r.summary.compared).toBe(2);
    expect(codes(r).sort()).toEqual(['PARAM_NAME_DIFFERS', 'PATH_CASE_DIFFERS']);
    expect(r.exitCode).toBe(0);
  });

  it('flags other guards missing on the candidate (e.g. requireOnboarding)', () => {
    const r = compareManifests(
      man(ep('GET', '/a', { guards: ['authenticateToken', 'requireOnboarding'] })),
      man(ep('GET', '/a', { guards: ['authenticateToken'] })),
    );
    expect(codes(r)).toEqual(['GUARD_MISSING_IN_CANDIDATE']);
  });

  it('scopes to --only-prefix (partial ports)', () => {
    const ref = man(ep('GET', '/api/health', { auth: false }), ep('GET', '/api/skills/x'), ep('GET', '/api/auth/me'));
    const cand = man(ep('GET', '/api/health', { auth: false }));
    expect(compareManifests(ref, cand).exitCode).toBe(1);
    expect(compareManifests(ref, cand, { onlyPrefixes: ['/api/health'] }).exitCode).toBe(0);
  });

  it('rejects malformed manifests (auth must be boolean) without throwing', () => {
    const r = compareManifests(man(ep('GET', '/a')), man({ method: 'GET', path: '/a' }));
    expect(codes(r)).toContain('MALFORMED_MANIFEST');
    expect(r.exitCode).toBe(1);
  });

  it('uses the first registration when a key is duplicated', () => {
    const ref = man(ep('GET', '/a', { minTier: 2 }), ep('GET', '/a', { minTier: 1 }));
    const cand = man(ep('GET', '/a', { minTier: 2 }));
    const r = compareManifests(ref, cand);
    expect(codes(r, 'CRITICAL')).toEqual([]);
    expect(codes(r)).toEqual(['DUPLICATE_IN_REFERENCE']);
  });

  it('CLI: exit codes 0 / 1 / 2 and --allow-extra-in-candidate', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'manifest-cli-'));
    try {
      const write = (name, m) => { const f = path.join(dir, name); fs.writeFileSync(f, JSON.stringify(m)); return f; };
      const ref = write('ref.json', man(ep('GET', '/api/a', { minTier: 2 })));
      const same = write('same.json', man(ep('GET', '/api/a', { minTier: 2 })));
      const extra = write('extra.json', man(ep('GET', '/api/a', { minTier: 2 }), ep('GET', '/api/new')));
      const leak = write('leak.json', man(ep('GET', '/api/a', { minTier: null })));
      const run = (...args) => spawnSync(process.execPath, [COMPARE_CLI, ...args], { encoding: 'utf8' });
      expect(run(ref, same).status).toBe(0);
      expect(run(ref, extra).status).toBe(1);
      expect(run(ref, extra, '--allow-extra-in-candidate').status).toBe(0);
      const leaked = run(ref, leak);
      expect(leaked.status).toBe(2);
      expect(leaked.stdout).toMatch(/MINTIER_DROPPED/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

/* ------------------------------------------------------------------------- */
/* Generator: synthetic fixture app (proves the Express semantics we model)   */
/* ------------------------------------------------------------------------- */

describe('generate-manifest: Express semantics on a fixture app', () => {
  let root;
  let manifest;
  const byId = (id) => manifest.endpoints.find((e) => e.id === id);

  beforeAll(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'manifest-fixture-'));
    const files = {
      'src/app.js': `
        const express = require('express');
        const { authenticateToken } = require('./middleware/auth');
        const routerA = require('./routes/a');
        const routerB = require('./routes/b');
        const routerC = require('./routes/c');
        const routerD = require('./routes/d');
        const app = express();
        app.use('/api/m', authenticateToken, routerB);
        app.use('/api', routerA);
        app.use('/api/d', routerD);
        app.use('/api/c', authenticateToken);
        app.use('/api/c', routerC);
        app.use('/api/d', authenticateToken);
        app.get('/api/health', (req, res) => res.json({}));
        module.exports = app;`,
      'src/routes/a.js': `
        const express = require('express');
        const router = express.Router();
        const { authenticateToken: auth } = require('../middleware/auth');
        const { requirePlan } = require('../middleware/requirePlan');
        const sub = require('./sub');
        router.get('/early', (req, res) => {});
        router.use(auth);
        router.get('/late', (req, res) => {});
        router.get('/items/:id', (req, res) => {});
        router.get('/items/list', (req, res) => {});
        router.route('/chain').get([auth, requirePlan(2)], (req, res) => {}).post(requirePlan(3), (req, res) => {});
        router.post('/dyn', requirePlan(level), (req, res) => {});
        router.get('/early', (req, res) => {});
        router.use('/sub', sub);
        module.exports = router;`,
      'src/routes/sub.js': `
        const express = require('express');
        const router = express.Router();
        router.get('/x', (req, res) => {});
        module.exports = router;`,
      'src/routes/b.js': `
        const express = require('express');
        const router = express.Router();
        router.get('/one', (req, res) => {});
        module.exports = router;`,
      'src/routes/c.js': `
        const express = require('express');
        const router = express.Router();
        router.get('/', (req, res) => {});
        module.exports = router;`,
      'src/routes/d.js': `
        const express = require('express');
        const router = express.Router();
        router.get('/', (req, res) => {});
        module.exports = router;`,
    };
    for (const [rel, content] of Object.entries(files)) {
      const abs = path.join(root, 'backend', rel);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, content);
    }
    manifest = generateManifest({ backendDir: path.join(root, 'backend') });
  });

  afterAll(() => { fs.rmSync(root, { recursive: true, force: true }); });

  it('router.use(guard) only covers routes registered AFTER it (file-level, positional)', () => {
    expect(byId('GET /api/early').auth).toBe(false);
    expect(byId('GET /api/late').auth).toBe(true);
    expect(byId('GET /api/late').layers.file).toEqual(['authenticateToken']); // alias `auth` resolved
    expect(byId('GET /api/late').flags).toContain('ALIASED_GUARD:auth->authenticateToken');
  });

  it('resolves import aliases, array middleware and router.route() chains', () => {
    const get = byId('GET /api/chain');
    const post = byId('POST /api/chain');
    expect(get.minTier).toBe(2);
    expect(get.guards).toContain('requirePlan(2)');
    expect(post.minTier).toBe(3);
    expect(post.auth).toBe(true); // via the earlier router.use(auth)
    expect(get.flags.some((f) => f.startsWith('ALIASED_GUARD:auth->authenticateToken'))).toBe(true);
  });

  it('records non-literal requirePlan args as strings and flags them', () => {
    const dyn = byId('POST /api/dyn');
    expect(dyn.minTier).toBe('level');
    expect(dyn.flags).toContain('NON_LITERAL_MINTIER');
  });

  it('applies mount-level guards, and app-level guards only to routers mounted after them', () => {
    expect(byId('GET /api/m/one').auth).toBe(true);
    expect(byId('GET /api/m/one').layers.mount).toEqual(['authenticateToken']);
    expect(byId('GET /api/c').auth).toBe(true); // app.use('/api/c', auth) precedes the mount
    expect(byId('GET /api/d').auth).toBe(false); // app.use('/api/d', auth) comes AFTER the mount
  });

  it('inherits file-level guards into nested routers and records nested mounts', () => {
    const x = byId('GET /api/sub/x');
    expect(x.auth).toBe(true);
    expect(x.mountPrefix).toBe('/api/sub');
    const nested = manifest.mounts.find((m) => m.prefix === '/api/sub');
    expect(nested).toMatchObject({ depth: 1, parentFile: 'backend/src/routes/a.js' });
  });

  it('keeps mount order and endpoint registration order', () => {
    expect(manifest.mounts.filter((m) => m.depth === 0).map((m) => m.prefix)).toEqual(['/api/m', '/api', '/api/d', '/api/c']);
    const orders = manifest.endpoints.map((e) => e.order);
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
    expect(byId('GET /api/health').mountOrder).toBeNull();
  });

  it('reports shadowed and duplicate routes', () => {
    const shadow = manifest.oddities.filter((o) => o.code === 'SHADOWED_ROUTE');
    expect(shadow).toHaveLength(1);
    expect(shadow[0].later.id).toBe('GET /api/items/list');
    expect(shadow[0].earlier.id).toBe('GET /api/items/:id');
    expect(shadow[0].certainty).toBe('definite');
    const dup = manifest.oddities.filter((o) => o.code === 'DUPLICATE_ROUTE');
    expect(dup).toHaveLength(1);
    expect(dup[0].later.id).toBe('GET /api/early');
    expect(dup[0].guardsDiffer).toBe(true); // 1st registration public, 2nd authenticated
  });

  it('analyseShadowing ignores different methods and downgrades to "possible" when the handler calls next()', () => {
    const mk = (id, method, p, extra = {}) => ({ id, method, path: p, flags: [], sourceFile: 'f.js', line: 1, auth: true, admin: false, minTier: null, _callsNext: false, ...extra });
    const odd = [];
    analyseShadowing([mk('a', 'GET', '/x/:id'), mk('b', 'POST', '/x/list'), mk('c', 'GET', '/x/list', { line: 2 })], odd);
    expect(odd).toHaveLength(1);
    const odd2 = [];
    analyseShadowing([mk('a', 'GET', '/x/:id', { _callsNext: true }), mk('c', 'GET', '/x/list')], odd2);
    expect(odd2[0].certainty).toBe('possible');
  });
});

/* ------------------------------------------------------------------------- */
/* Generator: real backend source                                             */
/* ------------------------------------------------------------------------- */

describe('generate-manifest: real backend source', () => {
  let m;
  const byId = (id) => m.endpoints.find((e) => e.id === id);
  const routeFiles = fs.readdirSync(ROUTES_DIR).filter((f) => f.endsWith('.js'));
  const routerLines = routeFiles.map((f) => ({ f, lines: fs.readFileSync(path.join(ROUTES_DIR, f), 'utf8').split(/\r?\n/) }));

  beforeAll(() => { m = generateManifest({ backendDir: BACKEND_DIR }); });

  it('is deterministic', () => {
    expect(JSON.stringify(generateManifest({ backendDir: BACKEND_DIR }))).toBe(JSON.stringify(m));
  });

  it('matches the ADR structural counts: 41 route files, all mounted, 41 mount points', () => {
    expect(m.counts.routeFiles).toBe(41);
    expect(m.counts.routeFilesMounted).toBe(41);
    expect(m.counts.mountPoints).toBe(41);
    expect(m.mounts.filter((x) => x.depth === 0)).toHaveLength(41);
    expect(m.counts.requirePlanFiles).toBe(26);
    const checks = Object.fromEntries(m.sanity.checks.map((c) => [c.name, c]));
    expect(checks['route files on disk (src/routes/*.js)'].match).toBe(true);
    expect(checks['mount points (app.use(prefix, router))'].match).toBe(true);
    expect(checks['route files using requirePlan'].match).toBe(true);
  });

  it('endpoint count agrees with an independent text count of router.<method>( registrations', () => {
    const textCount = routerLines.reduce((n, { lines }) => n + lines.filter((l) => /^\s*router\.(get|post|put|patch|delete)\(/.test(l)).length, 0);
    expect(m.counts.endpointsInRouteFiles).toBe(textCount);
    // ADR-001 measured 181 at commit 38d8130a; the working tree may only have grown since.
    expect(m.counts.endpointsInRouteFiles).toBeGreaterThanOrEqual(181);
    expect(m.counts.endpointsTotal).toBe(m.counts.endpointsInRouteFiles + m.counts.endpointsDirectOnApp);
    expect(m.files.reduce((n, f) => n + f.endpoints, 0)).toBe(m.counts.endpointsInRouteFiles);
  });

  it('every endpoint points at the line that registers it', () => {
    for (const e of m.endpoints) {
      const abs = path.join(BACKEND_DIR, '..', e.sourceFile);
      const line = fs.readFileSync(abs, 'utf8').split(/\r?\n/)[e.line - 1] || '';
      expect(line).toMatch(new RegExp(`\\.${e.method.toLowerCase()}\\(`));
      expect(e.path.startsWith('/')).toBe(true);
    }
  });

  it('requirePlan: AST call sites agree with text count on router lines and are attributed to exactly one endpoint each', () => {
    const textSites = routerLines.reduce((n, { lines }) => n + lines.filter((l) => /^\s*router\.[a-z]+\(.*requirePlan\(/.test(l)).length, 0);
    expect(m.counts.requirePlanCallSites).toBe(textSites);
    // ADR-001 states 100; that number is a text-line count that includes comments and the definition line
    // (see sanity.adrCountingMethodReproduction). Real call sites measured: 90 at commit 38d8130a.
    expect(m.counts.requirePlanCallSites).toBeGreaterThanOrEqual(90);
    const inChains = m.endpoints.reduce((n, e) => n + e.guards.filter((g) => g.startsWith('requirePlan(')).length, 0);
    expect(inChains).toBe(m.counts.requirePlanCallSites);
    expect(m.counts.requirePlanCallSitesLiteral).toBe(m.counts.requirePlanCallSites);
    for (const e of m.endpoints.filter((x) => x.minTier !== null)) {
      expect([1, 2, 3]).toContain(e.minTier);
      expect(e.auth).toBe(true); // requirePlan reads req.user and must be preceded by authenticateToken
      expect(e.flags).not.toContain('PLAN_WITHOUT_AUTH');
      expect(e.flags).not.toContain('PLAN_BEFORE_AUTH');
    }
  });

  it('resolves every middleware chain statically (nothing unresolved)', () => {
    expect(m.endpoints.filter((e) => e.flags.some((f) => f.startsWith('UNRESOLVED_MIDDLEWARE'))).map((e) => e.id)).toEqual([]);
    expect(m.endpoints.filter((e) => e.flags.includes('NON_LITERAL_MINTIER')).map((e) => e.id)).toEqual([]);
  });

  it('known security-relevant facts', () => {
    expect(byId('POST /api/auth/login').auth).toBe(false);
    expect(byId('POST /api/auth/login').layers.mount).toEqual(['authLimiter']);
    const adminStats = byId('GET /api/admin/stats');
    expect(adminStats).toMatchObject({ auth: true, admin: true });
    expect(adminStats.layers.file).toEqual(['authenticateToken', 'requireAdmin']); // router.use(...) at admin.js file level
    expect(byId('GET /api/resume/v2/history').auth).toBe(true); // `authenticateToken: auth` alias in resumeV2.js
    expect(byId('POST /api/ats/v2/parse')).toMatchObject({ auth: true, minTier: 2 });
    expect(byId('GET /api/projects/ideas')).toMatchObject({ auth: true, minTier: 1 });
    expect(byId('POST /api/jobs/achievement-enhancer/enhance')).toMatchObject({ auth: true, minTier: 2, mountPrefix: '/api/jobs/achievement-enhancer' });
    expect(byId('GET /api/admin-panels/university/overview').roles).toEqual(['admin', 'university']);
    expect(byId('GET /api/health')).toMatchObject({ auth: false, sourceFile: 'backend/src/app.js' });
  });

  it('prefix-sharing groups from ADR Phase 3 are detected in mount order', () => {
    const files = (prefix) => m.mounts.filter((x) => x.depth === 0 && x.prefix === prefix).map((x) => path.basename(x.routerFile));
    expect(files('/api/resume')).toEqual(['resume.js', 'resumeV2.js']);
    expect(files('/api/ats')).toEqual(['atsExport.js', 'atsCheckerV2.js']);
    expect(files('/api/jobs')).toEqual(['jobTracker.js', 'jobAnalyzer.js', 'coverLetter.js', 'jobDiscovery.js', 'jobFit.js']);
    const jobs = Math.max(...m.mounts.filter((x) => x.prefix === '/api/jobs').map((x) => x.order));
    expect(m.mounts.find((x) => x.prefix === '/api/jobs/achievement-enhancer').order).toBeGreaterThan(jobs);
  });

  it('records app-level rate limiters with their options', () => {
    const api = m.appMiddleware.find((a) => a.label === 'apiLimiter');
    expect(api).toMatchObject({ kind: 'rate-limit', path: '/api' });
    expect(api.options.windowMs).toBe('15 * 60 * 1000');
    const authMount = m.mounts.find((x) => x.prefix === '/api/auth');
    expect(authMount.middleware[0]).toMatchObject({ label: 'authLimiter', kind: 'rate-limit' });
    expect(authMount.middleware[0].options.max).toBe('20');
  });

  it('a manifest compared with itself is clean; mutating it trips CRITICAL findings', () => {
    const clone = () => JSON.parse(JSON.stringify(m));
    expect(compareManifests(m, clone()).findings.filter((f) => f.severity !== 'INFO')).toEqual([]);

    const gated = clone();
    gated.endpoints.find((e) => e.id === 'GET /api/projects/ideas').auth = false;
    expect(compareManifests(m, gated).exitCode).toBe(2);

    const lowered = clone();
    lowered.endpoints.find((e) => e.id === 'POST /api/ats/v2/parse').minTier = 1;
    const r = compareManifests(m, lowered);
    expect(codes(r, 'CRITICAL')).toEqual(['MINTIER_LOWERED']);

    const missing = clone();
    missing.endpoints = missing.endpoints.filter((e) => e.id !== 'GET /api/health');
    expect(codes(compareManifests(m, missing))).toEqual(['MISSING_IN_CANDIDATE']);
  });
});
