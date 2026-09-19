'use strict';

const { createConfig, PASSTHROUGH_VARS } = require('../../src/worker/config');
const { ConfigError } = require('../../src/worker/lib/errors');
const { makeEnv, makeHarness, TEST_JWT_SECRET } = require('./helpers/harness');

describe('createConfig(env)', () => {
  let exitSpy;
  beforeEach(() => {
    exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit must never be called by worker code');
    });
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  it('returns a deeply frozen config for a valid env', () => {
    const config = createConfig(makeEnv());
    expect(Object.isFrozen(config)).toBe(true);
    expect(Object.isFrozen(config.allowedOrigins)).toBe(true);
    expect(Object.isFrozen(config.vars)).toBe(true);
    expect(config.jwtSecret).toBe(TEST_JWT_SECRET);
    expect(() => { 'use strict'; config.jwtSecret = 'x'; }).toThrow(TypeError);
  });

  it('memoizes per env object identity, and recomputes for a different object', () => {
    const env = makeEnv();
    expect(createConfig(env)).toBe(createConfig(env));
    expect(createConfig(makeEnv())).not.toBe(createConfig(env));
  });

  it.each([
    ['missing', undefined],
    ['empty string', ''],
    ['31 characters', 'a'.repeat(31)],
    ['a number', 12345678901234567890123456789012345],
    ['an object', { length: 64 }],
  ])('throws ConfigError when JWT_SECRET is %s (and never exits)', (_label, value) => {
    const env = makeEnv({ JWT_SECRET: value });
    expect(() => createConfig(env)).toThrow(ConfigError);
    try {
      createConfig(env);
    } catch (err) {
      expect(err.name).toBe('ConfigError');
      expect(err.code).toBe('CONFIG_ERROR');
      expect(err.missing).toBe('JWT_SECRET');
      expect(err.message).toMatch(/JWT_SECRET must be set and at least 32 characters/);
    }
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('accepts exactly 32 characters', () => {
    expect(() => createConfig(makeEnv({ JWT_SECRET: 'a'.repeat(32) }))).not.toThrow();
  });

  it('does not put the secret value in the error message', () => {
    const short = 'shortsecretvalue-should-not-leak';
    try {
      createConfig(makeEnv({ JWT_SECRET: short.slice(0, 20) }));
    } catch (err) {
      expect(err.message).not.toContain(short.slice(0, 20));
    }
  });

  it('throws ConfigError when env itself is missing', () => {
    expect(() => createConfig(undefined)).toThrow(ConfigError);
    expect(() => createConfig(null)).toThrow(ConfigError);
    expect(() => createConfig('nope')).toThrow(ConfigError);
  });

  it('does not cache a failed validation', () => {
    const env = { FRONTEND_URL: 'https://a.example' };
    expect(() => createConfig(env)).toThrow(ConfigError);
    env.JWT_SECRET = TEST_JWT_SECRET;
    expect(createConfig(env).jwtSecret).toBe(TEST_JWT_SECRET);
  });

  it('redacts itself when serialized', () => {
    const config = createConfig(makeEnv());
    expect(JSON.stringify(config)).not.toContain(TEST_JWT_SECRET);
    expect(JSON.stringify(config)).not.toContain('synthetic-pass');
  });

  describe('token settings (from services/sessionService.js)', () => {
    it('defaults to 15m access tokens and 7 day refresh tokens', () => {
      const config = createConfig(makeEnv());
      expect(config.accessTokenTtl).toBe('15m');
      expect(config.refreshTokenDays).toBe(7);
    });
    it('honours overrides and clamps refresh days to 30', () => {
      const config = createConfig(makeEnv({ ACCESS_TOKEN_TTL: '1h', REFRESH_TOKEN_DAYS: '90' }));
      expect(config.accessTokenTtl).toBe('1h');
      expect(config.refreshTokenDays).toBe(30);
      expect(createConfig(makeEnv({ REFRESH_TOKEN_DAYS: '14' })).refreshTokenDays).toBe(14);
    });
    it('preserves the Express quirk: non-numeric REFRESH_TOKEN_DAYS yields NaN', () => {
      expect(createConfig(makeEnv({ REFRESH_TOKEN_DAYS: 'abc' })).refreshTokenDays).toBeNaN();
    });
  });

  describe('CORS allowlist (from app.js, working tree)', () => {
    it('uses FRONTEND_URL, stripped of a trailing slash', () => {
      expect(createConfig(makeEnv({ FRONTEND_URL: 'https://app.example.test/' })).allowedOrigins).toEqual([
        'https://app.example.test',
      ]);
    });
    it('prefixes https:// when the scheme is missing (not the literal "https://undefined")', () => {
      expect(createConfig(makeEnv({ FRONTEND_URL: 'app.example.test' })).allowedOrigins).toEqual([
        'https://app.example.test',
      ]);
    });
    it('defaults to the local Vite origin when FRONTEND_URL is unset', () => {
      const env = makeEnv();
      delete env.FRONTEND_URL;
      expect(createConfig(env).allowedOrigins).toEqual(['http://localhost:5173']);
    });
    it('adds the dev ports only when NODE_ENV=development', () => {
      const dev = createConfig(makeEnv({ NODE_ENV: 'development', PORT: '8123' }));
      expect(dev.isDevelopment).toBe(true);
      expect(dev.allowedOrigins).toEqual([
        'https://app.example.test',
        'http://localhost:5173',
        'http://localhost:5174',
        'http://localhost:5175',
        'http://127.0.0.1:5173', // added by the working-tree Express app.js (infra slice)
        'http://localhost:3000',
        'http://localhost:8123',
      ]);
      const prod = createConfig(makeEnv({ NODE_ENV: 'production' }));
      expect(prod.isDevelopment).toBe(false);
      expect(prod.allowedOrigins).toEqual(['https://app.example.test']);
    });
    it('defaults the dev server port to 5000', () => {
      expect(createConfig(makeEnv({ NODE_ENV: 'development' })).allowedOrigins).toContain('http://localhost:5000');
    });
  });

  it('exposes pass-through vars from the ADR 4.1 inventory, undefined when absent', () => {
    const config = createConfig(makeEnv({ AI_PROVIDER: 'gemini', LM_STUDIO_URL: 'http://x', UNLISTED: 'no' }));
    expect(config.vars.AI_PROVIDER).toBe('gemini');
    expect(config.vars.LM_STUDIO_URL).toBe('http://x');
    expect(config.vars.MOCK_AI).toBeUndefined();
    expect(config.vars.UNLISTED).toBeUndefined();
    expect(PASSTHROUGH_VARS).not.toContain('JWT_SECRET');
    expect(PASSTHROUGH_VARS.some((n) => n.startsWith('DB_'))).toBe(false);
  });
});

describe('config failure through the app', () => {
  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit must never be called');
    });
  });
  afterEach(() => jest.restoreAllMocks());

  it.each([
    ['short', 'tooshort'],
    ['missing', undefined],
  ])('a %s JWT_SECRET yields a masked 500 on every route, with security headers, and no exit', async (_l, secret) => {
    const H = makeHarness({ env: makeEnv({ JWT_SECRET: secret }) });
    for (const path of ['/api/health', '/api/_t/open', '/api/_t/protected', '/api/does-not-exist']) {
      const res = await H.request(path);
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: 'Internal Server Error' });
      expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    }
    // the detail is logged (operators need it) but never sent to the client
    expect(console.error.mock.calls.flat().join(' ')).toMatch(/JWT_SECRET must be set/);
    expect(process.exit).not.toHaveBeenCalled();
  });
});
