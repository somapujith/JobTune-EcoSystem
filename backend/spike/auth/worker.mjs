// Phase 0 spike worker: S7 bcryptjs, S8 joi, S9 jsonwebtoken, S10 crypto, E1 process.env/exit,
// E2 client IP, S11 neon (gated). Every library is imported lazily inside its own try/catch
// handler so one failing library cannot take the others down.
//
// NEVER put real secrets here. The only env values this worker echoes are non-secret spike vars.

// ---- E1: module-load-time snapshot (runs when the isolate loads this module) ------------------
function envSnapshot(where) {
  const s = { where, typeofProcess: typeof process };
  try {
    s.typeofProcessEnv = typeof process.env;
    const keys = Object.keys(process.env);
    s.processEnvKeyCount = keys.length;
    // Names only for anything not obviously a spike var: never echo secret values.
    s.processEnvSpikeKeys = keys.filter((k) => k.startsWith('SPIKE_'));
    s.SPIKE_VAR = process.env.SPIKE_VAR === undefined ? 'undefined' : process.env.SPIKE_VAR;
    s.SPIKE_SYNTH_SECRET_present = typeof process.env.SPIKE_SYNTH_SECRET === 'string' && process.env.SPIKE_SYNTH_SECRET.length > 0;
    s.SPIKE_SYNTH_SECRET_length = (process.env.SPIKE_SYNTH_SECRET || '').length;
    s.hasDatabaseUrlKey = keys.includes('DATABASE_URL'); // must stay false: proves no .env leaked in
    s.hasJwtSecretKey = keys.includes('JWT_SECRET');
  } catch (e) {
    s.processEnvError = `${e && e.name}: ${e && e.message}`;
  }
  try { s.typeofProcessExit = typeof process.exit; } catch (e) { s.typeofProcessExit = `threw ${e.name}`; }
  try { s.typeofProcessCwd = typeof process.cwd; } catch (e) { s.typeofProcessCwd = `threw ${e.name}`; }
  try { s.processVersions = process.versions ? Object.keys(process.versions).length : null; } catch (e) { /* ignore */ }
  try { s.processPlatform = process.platform; } catch (e) { /* ignore */ }
  return s;
}

const MODULE_LOAD_SNAPSHOT = envSnapshot('module-load');
const MODULE_LOADED_AT = Date.now();
let requestCounter = 0;
let instanceId = null; // random values are not allowed in global scope, so assign lazily

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}
function errInfo(e) {
  return { name: e && e.name, message: e && e.message, code: e && e.code };
}

// ---- S7 bcryptjs ---------------------------------------------------------------------------
async function s7(path, body) {
  const mod = await import('bcryptjs');
  const bcrypt = mod.default ?? mod;
  if (path === '/s7/hash') {
    const out = [];
    for (const password of body.passwords) {
      const t0 = Date.now();
      const salt = await bcrypt.genSalt(10);           // exactly routes/auth.js:62
      const hash = await bcrypt.hash(password, salt);  // exactly routes/auth.js:63
      out.push({ hash, workerClockMs: Date.now() - t0 });
    }
    return { hashes: out.map((o) => o.hash), workerClockMs: out.map((o) => o.workerClockMs) };
  }
  if (path === '/s7/verify') {
    const results = [];
    for (const it of body.items) {
      const t0 = Date.now();
      try {
        const r = await bcrypt.compare(it.password, it.hash);
        results.push({ threw: false, result: r, workerClockMs: Date.now() - t0 });
      } catch (e) {
        results.push({ threw: true, error: errInfo(e), workerClockMs: Date.now() - t0 });
      }
    }
    return { results };
  }
  throw new Error('unknown s7 route');
}

// ---- S8 joi --------------------------------------------------------------------------------
async function s8(body) {
  const { signupSchema, loginSchema } = await import('./generated-schemas.mjs');
  const schema = body.schema === 'signup' ? signupSchema : loginSchema;
  const results = body.inputs.map((input) => {
    const { error, value } = schema.validate(input, { stripUnknown: true }); // same options as auth.js:51 / :93
    return {
      ok: !error,
      message: error ? error.details[0].message : null,
      errorMessage: error ? error.message : null,
      types: error ? error.details.map((d) => d.type) : null,
      paths: error ? error.details.map((d) => d.path.join('.')) : null,
      valueJson: JSON.stringify(value === undefined ? null : value),
    };
  });
  const Joi = (await import('joi')).default;
  return { results, joiVersion: Joi.version };
}

// ---- S9 jsonwebtoken -----------------------------------------------------------------------
async function s9(path, body) {
  const jwtMod = await import('jsonwebtoken');
  const jwt = jwtMod.default ?? jwtMod;
  if (path === '/s9/sign') {
    const out = [];
    for (const c of body.cases) {
      try { out.push({ ok: true, token: jwt.sign(c.payload, c.secret, c.options) }); }
      catch (e) { out.push({ ok: false, error: errInfo(e) }); }
    }
    return { results: out };
  }
  if (path === '/s9/verify') {
    const out = [];
    for (const c of body.cases) {
      try { out.push({ ok: true, payload: jwt.verify(c.token, c.secret, c.options) }); }
      catch (e) { out.push({ ok: false, error: errInfo(e) }); }
    }
    return { results: out };
  }
  throw new Error('unknown s9 route');
}

// ---- S10 crypto ----------------------------------------------------------------------------
async function s10(body) {
  const crypto = (await import('crypto')).default ?? (await import('crypto'));
  // sessionService.js:10 -> crypto.createHash('sha256').update(token).digest('hex')
  const hashToken = (t) => crypto.createHash('sha256').update(t).digest('hex');
  // aiCache.js:20 -> key composition + .slice(0, 16)
  const aiKey = (sp, up, mt, temp) =>
    crypto.createHash('sha256').update(`${sp}|${up}|${mt}|${temp}`).digest('hex').slice(0, 16);
  const hashes = (body.inputs || []).map((s) => hashToken(s));
  const aiKeys = (body.aiCacheInputs || []).map((a) => aiKey(a[0], a[1], a[2], a[3]));
  const bufHash = (body.bufferHexInputs || []).map((h) =>
    crypto.createHash('sha256').update(Buffer.from(h, 'hex')).digest('hex'));
  // sessionService.js:88 -> crypto.randomBytes(48).toString('hex')
  const r1 = crypto.randomBytes(48).toString('hex');
  const r2 = crypto.randomBytes(48).toString('hex');
  const many = new Set();
  for (let i = 0; i < 500; i++) many.add(crypto.randomBytes(48).toString('hex'));
  return {
    hashes, aiKeys, bufHash,
    random: { r1len: r1.length, r2len: r2.length, differ: r1 !== r2, hexOnly: /^[0-9a-f]{96}$/.test(r1) && /^[0-9a-f]{96}$/.test(r2), unique500: many.size },
    typeofRandomBytes: typeof crypto.randomBytes,
    typeofCreateHash: typeof crypto.createHash,
  };
}

// ---- E1 / E2 -------------------------------------------------------------------------------
async function e1(path) {
  if (!instanceId) instanceId = crypto.randomUUID(); // Web Crypto global, request scope only
  if (path === '/e1') {
    return {
      instanceId, requestCounter, moduleLoadedAt: MODULE_LOADED_AT,
      moduleLoad: MODULE_LOAD_SNAPSHOT,
      requestTime: envSnapshot('request-time'),
    };
  }
  if (path === '/e1/exit') {
    const before = { instanceId, requestCounter };
    const r = { before, calledWith: 1 };
    try {
      const ret = process.exit(1);
      r.outcome = 'returned-normally (process.exit was a no-op or returned)';
      r.returnValue = ret === undefined ? 'undefined' : String(ret);
    } catch (e) {
      r.outcome = 'threw';
      r.error = { name: e && e.name, message: e && e.message, code: e && e.code, ctor: e && e.constructor && e.constructor.name };
    }
    try { r.processExitCodeAfter = process.exitCode === undefined ? 'undefined' : process.exitCode; } catch (e) { r.processExitCodeAfter = `threw ${e.name}`; }
    // Did the handler keep running after the call? (proves the isolate/handler was not killed synchronously)
    r.handlerContinuedAfterExit = true;
    return r;
  }
  throw new Error('unknown e1 route');
}

function e2(request) {
  return {
    typeofRequestIp: typeof request.ip,
    typeofRequestConnection: typeof request.connection,
    requestIpValue: request.ip === undefined ? 'undefined' : String(request.ip),
    cfConnectingIp: request.headers.get('CF-Connecting-IP'),
    xForwardedFor: request.headers.get('X-Forwarded-For'),
    xRealIp: request.headers.get('X-Real-IP'),
    typeofRequestCf: typeof request.cf,
    requestCfKeys: request.cf ? Object.keys(request.cf).slice(0, 12) : null,
    url: request.url,
  };
}

// ---- S11 (Neon) -- gated; see s11.mjs header. Never runs without env.DATABASE_URL. ----------
async function s11(request, env, ctx) {
  const s11mod = await import('./s11.mjs');
  const dbmod = await import('../../src/config/database.worker.js'); // the REAL backend module
  const getPool = dbmod.getPool ?? (dbmod.default && dbmod.default.getPool);
  return s11mod.handleS11(request, env, ctx, getPool);
}

export default {
  async fetch(request, env, ctx) {
    requestCounter++;
    const url = new URL(request.url);
    const path = url.pathname;
    try {
      if (path === '/health') return json({ ok: true, requestCounter });
      if (path === '/envkeys') return json({ envBindingNames: Object.keys(env).sort() }); // names only
      if (path.startsWith('/s7/')) return json(await s7(path, await request.json()));
      if (path === '/s8/validate') return json(await s8(await request.json()));
      if (path.startsWith('/s9/')) return json(await s9(path, await request.json()));
      if (path === '/s10') return json(await s10(await request.json()));
      if (path.startsWith('/e1')) return json(await e1(path));
      if (path === '/e2') return json(e2(request));
      if (path.startsWith('/s11')) return await s11(request, env, ctx);
      return json({ error: 'not found', path }, 404);
    } catch (e) {
      return json({ handlerError: { name: e && e.name, message: e && e.message, stack: String(e && e.stack).split('\n').slice(0, 4) } }, 500);
    }
  },
};
