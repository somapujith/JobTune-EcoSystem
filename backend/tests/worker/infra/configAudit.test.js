'use strict';

/**
 * Config audit (infra slice): every environment variable name the Express backend reads anywhere under
 * backend/src/** must be accounted for in worker/config.js: a dedicated field, a PASSTHROUGH_VARS entry
 * (config.vars.NAME), or deliberately not needed (the DB_* node-postgres fallback). The names are re-derived
 * from the Express sources at test time, so a variable added there later fails this test until it is handled.
 * Also pins the CORS allowlist to the working-tree app.js.
 */
const fs = require('fs');
const path = require('path');
const { createConfig, PASSTHROUGH_VARS } = require('../../../src/worker/config');
const { makeEnv } = require('../helpers/harness');

const SRC = path.resolve(__dirname, '../../../src');
const WORKER = path.join(SRC, 'worker') + path.sep;

const walk = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : [p];
  });

const expressFiles = walk(SRC).filter((f) => f.endsWith('.js') && !f.startsWith(WORKER) && !f.endsWith('worker-entry.js'));

// dedicated config fields and the config property that carries each
const DEDICATED = {
  ACCESS_TOKEN_TTL: 'accessTokenTtl',
  DATABASE_URL: 'databaseUrl',
  FRONTEND_URL: 'frontendUrl',
  JWT_SECRET: 'jwtSecret',
  NODE_ENV: 'nodeEnv',
  PORT: 'serverPort',
  REFRESH_TOKEN_DAYS: 'refreshTokenDays',
};
// the node-postgres fallback in config/database.js; the Worker uses DATABASE_URL only (ADR 4.1)
const NOT_NEEDED_ON_WORKERS = ['DB_HOST', 'DB_NAME', 'DB_PASSWORD', 'DB_PORT', 'DB_SSL', 'DB_USER'];

const ENV_ACCESS = 'process' + '.env'; // built by concatenation only so this file is never itself grep-hit

function namesRead() {
  const names = new Map(); // name -> Set(files)
  const add = (n, f) => names.set(n, (names.get(n) || new Set()).add(path.relative(SRC, f)));
  for (const f of expressFiles) {
    const text = fs.readFileSync(f, 'utf8');
    for (const m of text.matchAll(new RegExp(`${ENV_ACCESS.replace('.', '\\.')}\\.([A-Z][A-Z0-9_]*)`, 'g'))) add(m[1], f);
  }
  return names;
}

describe('config.js environment-variable audit', () => {
  const names = namesRead();

  it('finds the Express sources and their variables (guard against scanning nothing)', () => {
    expect(expressFiles.length).toBeGreaterThan(30);
    expect(names.size).toBeGreaterThanOrEqual(34);
    expect(names.has('JWT_SECRET')).toBe(true);
    expect(names.has('LM_STUDIO_MODEL_TUTOR')).toBe(true);
  });

  it('accounts for every name read in backend/src/** (dedicated field, pass-through, or deliberately unneeded)', () => {
    const covered = new Set([...Object.keys(DEDICATED), ...PASSTHROUGH_VARS, ...NOT_NEEDED_ON_WORKERS]);
    const uncovered = [...names.keys()].filter((n) => !covered.has(n)).map((n) => `${n} (read in ${[...names.get(n)].join(', ')})`);
    expect(uncovered).toEqual([]);
  });

  it('the deliberately-unneeded DB_* names are only read by the pg fallback in config/database.js', () => {
    for (const n of NOT_NEEDED_ON_WORKERS) expect([...names.get(n)]).toEqual([path.join('config', 'database.js')]);
  });

  it('every pass-through name is actually used somewhere in the Express code (no dead entries), and is exposed on config.vars', () => {
    const config = createConfig(makeEnv(Object.fromEntries(PASSTHROUGH_VARS.map((n) => [n, `value-of-${n}`]))));
    for (const n of PASSTHROUGH_VARS) {
      expect([n, names.has(n)]).toEqual([n, true]);
      expect(config.vars[n]).toBe(`value-of-${n}`);
    }
  });

  it('every dedicated name maps to a config field', () => {
    const config = createConfig(makeEnv({ ACCESS_TOKEN_TTL: '5m', NODE_ENV: 'production', PORT: '9000', REFRESH_TOKEN_DAYS: '3' }));
    for (const field of Object.values(DEDICATED)) expect(config).toHaveProperty(field);
    expect(config.accessTokenTtl).toBe('5m');
    expect(config.refreshTokenDays).toBe(3);
    expect(config.serverPort).toBe('9000');
  });

  it('every per-purpose model variable aiClient and the routes use (LM_STUDIO_MODEL_*) is pass-through', () => {
    const lm = [...names.keys()].filter((n) => /^LM_STUDIO_MODEL/.test(n));
    expect(lm.length).toBe(12);
    for (const n of lm) expect(PASSTHROUGH_VARS).toContain(n);
  });

  it('variables outside the inventory are not exposed', () => {
    const config = createConfig(makeEnv({ SOMETHING_ELSE: 'x', DB_HOST: 'db.example.test' }));
    expect(config.vars.SOMETHING_ELSE).toBeUndefined();
    expect(config.vars.DB_HOST).toBeUndefined();
  });
});

describe('CORS allowlist parity with the working-tree Express app.js', () => {
  const appSource = fs.readFileSync(path.join(SRC, 'app.js'), 'utf8');

  it('the development origins in config.js are exactly the ones app.js lists, in the same order', () => {
    const block = appSource.match(/NODE_ENV === 'development' \? \[([\s\S]*?)\] : \[\]/);
    expect(block).not.toBeNull();
    const expressDev = [...block[1].matchAll(/'([^']+)'|`([^`]+)`/g)].map((m) => (m[1] !== undefined ? m[1] : m[2].replace('${serverPort}', '5000')));
    const config = createConfig(makeEnv({ NODE_ENV: 'development', FRONTEND_URL: 'https://app.example.test' }));
    expect(config.allowedOrigins).toEqual(['https://app.example.test', ...expressDev]);
  });

  it('includes the working-tree dev origin http://127.0.0.1:5173 only in development', () => {
    expect(createConfig(makeEnv({ NODE_ENV: 'development' })).allowedOrigins).toContain('http://127.0.0.1:5173');
    expect(createConfig(makeEnv({ NODE_ENV: 'production' })).allowedOrigins).not.toContain('http://127.0.0.1:5173');
    expect(createConfig(makeEnv()).allowedOrigins).not.toContain('http://127.0.0.1:5173');
  });

  it('FRONTEND_URL normalisation is unchanged (trailing slash stripped, scheme added)', () => {
    expect(createConfig(makeEnv({ FRONTEND_URL: 'https://x.example.test/' })).allowedOrigins[0]).toBe('https://x.example.test');
    expect(createConfig(makeEnv({ FRONTEND_URL: 'x.example.test' })).allowedOrigins[0]).toBe('https://x.example.test');
  });
});
