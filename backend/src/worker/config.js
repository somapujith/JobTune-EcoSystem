'use strict';

/**
 * createConfig(env) -> frozen config   (ADR-001 sections 4.1, 10; task T1.1)
 *
 * The ONLY place in src/worker/ that interprets the Workers `env` binding.
 * Nothing under src/worker/ may read ambient process globals (enforced by
 * tests/worker/sourceTree.test.js). Everything the Express code read from the
 * process environment at module scope is derived here, once, from `env`.
 *
 * Contract:
 *   - returns a deeply frozen object, or throws ConfigError (never exits).
 *   - validates JWT_SECRET is a string of >= 32 characters (same rule as
 *     the original middleware/auth.js).
 *   - memoized per isolate, keyed on the identity of the `env` object. Workers
 *     passes the same env object for the lifetime of a deployment, so this is one
 *     computation per isolate; tests pass fresh objects and get fresh configs.
 *     A failed validation is NOT cached.
 *
 * Adding config (later waves): add the derived field below, or, for a plain
 * pass-through string, add its name to PASSTHROUGH_VARS and read it as
 * `config.vars.NAME` (string | undefined). Do NOT add module-scope reads anywhere.
 *
 * SECURITY: the config object holds secrets (jwtSecret, databaseUrl, API keys).
 * Never log it or serialize it; toJSON() returns a redacted stub as a backstop.
 */
const { ConfigError } = require('./lib/errors');

const MIN_JWT_SECRET_LENGTH = 32;

/**
 * Non-secret-shaped pass-through variables from the ADR-001 4.1 inventory that
 * later ported modules need (aiClient, embeddings, discovery, ...). JWT_SECRET,
 * DATABASE_URL, NODE_ENV, PORT, FRONTEND_URL, ACCESS_TOKEN_TTL and
 * REFRESH_TOKEN_DAYS have dedicated fields. The legacy DB_* set is not needed
 * on Workers (DATABASE_URL only).
 *
 * AUDIT (infra slice): every distinct name read from the ambient environment anywhere in the Express
 * backend/src/** (34 names) is accounted for: 7 dedicated fields above, the 21 pass-through names below,
 * and the 6 DB_* names of the node-postgres fallback in config/database.js, deliberately not needed here.
 * tests/worker/infra/configAudit.test.js re-derives that list from the Express sources and fails when a
 * new name appears that is in none of the three groups.
 */
const PASSTHROUGH_VARS = Object.freeze([
  'ADZUNA_APP_ID',
  'ADZUNA_APP_KEY',
  'AI_PROVIDER',
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_MODEL',
  'GEMINI_API_KEY',
  'GEMINI_MODEL',
  'LM_STUDIO_URL',
  'LM_STUDIO_MODEL',
  'LM_STUDIO_MODEL_EMBED',
  'LM_STUDIO_MODEL_FIT',
  'LM_STUDIO_MODEL_GITHUB',
  'LM_STUDIO_MODEL_INTERVIEW',
  'LM_STUDIO_MODEL_JOB',
  'LM_STUDIO_MODEL_LINKEDIN',
  'LM_STUDIO_MODEL_PROJECT',
  'LM_STUDIO_MODEL_RESUME',
  'LM_STUDIO_MODEL_ROADMAP',
  'LM_STUDIO_MODEL_SKILLS',
  'LM_STUDIO_MODEL_TUTOR',
  'MOCK_AI',
]);

const cache = new WeakMap();

/**
 * Ported verbatim from backend/src/app.js (working tree, which adds the dev origin
 * http://127.0.0.1:5173 after :5175 over HEAD): FRONTEND_URL normalisation and
 * the dynamic CORS allowlist, but computed from `env` instead of module scope.
 */
function buildAllowedOrigins(env) {
  const isDevelopment = env.NODE_ENV === 'development';
  const serverPort = env.PORT || 5000;
  let frontendUrl = (env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');
  if (frontendUrl && !/^https?:\/\//.test(frontendUrl)) {
    frontendUrl = `https://${frontendUrl}`;
  }
  const allowedOrigins = [
    frontendUrl,
    ...(isDevelopment
      ? [
          'http://localhost:5173',
          'http://localhost:5174',
          'http://localhost:5175',
          'http://127.0.0.1:5173',
          'http://localhost:3000',
          `http://localhost:${serverPort}`,
        ]
      : []),
  ];
  return { frontendUrl, serverPort, allowedOrigins };
}

function createConfig(env) {
  if (!env || typeof env !== 'object') {
    throw new ConfigError('Worker env binding is missing (createConfig requires the fetch handler env object)');
  }

  const cached = cache.get(env);
  if (cached) return cached;

  const jwtSecret = env.JWT_SECRET;
  if (typeof jwtSecret !== 'string' || jwtSecret.length < MIN_JWT_SECRET_LENGTH) {
    throw new ConfigError(
      `JWT_SECRET must be set and at least ${MIN_JWT_SECRET_LENGTH} characters long`,
      { missing: 'JWT_SECRET' }
    );
  }

  const { frontendUrl, serverPort, allowedOrigins } = buildAllowedOrigins(env);

  const vars = {};
  for (const name of PASSTHROUGH_VARS) vars[name] = env[name];

  const config = {
    nodeEnv: env.NODE_ENV,
    isDevelopment: env.NODE_ENV === 'development',

    jwtSecret,
    // Same defaults/clamping as services/sessionService.js (HEAD). Preserved
    // quirk: a non-numeric REFRESH_TOKEN_DAYS yields NaN, as it did on Express.
    accessTokenTtl: env.ACCESS_TOKEN_TTL || '15m',
    refreshTokenDays: Math.min(Number(env.REFRESH_TOKEN_DAYS || 7), 30),

    databaseUrl: env.DATABASE_URL, // may be undefined; only the db layer requires it

    frontendUrl,
    serverPort,
    allowedOrigins: Object.freeze(allowedOrigins),

    vars: Object.freeze(vars),
  };

  Object.defineProperty(config, 'toJSON', {
    value: () => ({ redacted: 'config contains secrets' }),
    enumerable: false,
  });

  Object.freeze(config);
  cache.set(env, config);
  return config;
}

module.exports = { createConfig, PASSTHROUGH_VARS, MIN_JWT_SECRET_LENGTH };
