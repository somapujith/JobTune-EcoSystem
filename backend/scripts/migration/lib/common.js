'use strict';

/**
 * Shared helpers for the ADR-001 Phase 4 verification scripts (differential, auth-matrix, plan-gating-matrix,
 * upload-roundtrip, load-test, ratelimit-probe). Node built-ins only; uses the global fetch (Node 18+).
 *
 * Conventions shared by every script:
 *   - two base URLs are always explicit (--render <url> --workers <url>); never defaulted, never read from .env
 *   - secrets (tokens, passwords) come from environment variables at run time and are never printed or stored
 *   - `--dry-run` prints the planned requests and sends nothing
 *   - exit codes: 0 pass | 1 failures found | 2 CRITICAL finding (entitlement leak) | 64 usage error / safety refusal
 */

const fs = require('fs');
const path = require('path');
const { canonicalizePath } = require('../compare-manifests');

const EXIT = { OK: 0, FAIL: 1, CRITICAL: 2, USAGE: 64 };
const REPO_DIR = path.resolve(__dirname, '..', '..', '..', '..');
const DEFAULT_REFERENCE = path.join(REPO_DIR, 'docs', 'migration', 'manifest.render.json');

class UsageError extends Error {}

/** Tiny argv parser. spec = { flags: {'--x': 'key'}, values: {'--y': 'key'}, lists: {'--z': 'key'} }. */
function parseArgv(argv, { flags = {}, values = {}, lists = {} } = {}) {
  const out = {};
  for (const k of Object.values(lists)) out[k] = [];
  for (let i = 0; i < argv.length; i++) {
    let a = argv[i];
    let inline;
    const eq = a.indexOf('=');
    if (a.startsWith('--') && eq > 0) { inline = a.slice(eq + 1); a = a.slice(0, eq); }
    if (a === '-h' || a === '--help') { out.help = true; continue; }
    if (flags[a]) {
      if (inline !== undefined) throw new UsageError(`${a} does not take a value`);
      out[flags[a]] = true;
    } else if (values[a] || lists[a]) {
      const v = inline !== undefined ? inline : argv[++i];
      if (v === undefined || (typeof v === 'string' && v.startsWith('--') && inline === undefined)) throw new UsageError(`${a} needs a value`);
      if (values[a]) out[values[a]] = v; else out[lists[a]].push(v);
    } else {
      throw new UsageError(`Unknown option ${a}`);
    }
  }
  return out;
}

function toInt(name, value, dflt, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (value === undefined || value === null || value === '') return dflt;
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) throw new UsageError(`${name} must be an integer between ${min} and ${max}`);
  return n;
}

/** Validate and normalise a base URL (origin + optional path prefix, no trailing slash). */
function normalizeBase(name, url) {
  if (!url) throw new UsageError(`${name} is required (explicit base URL, e.g. https://host.example)`);
  let u;
  try { u = new URL(url); } catch (e) { throw new UsageError(`${name} is not a valid URL: ${url}`); }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new UsageError(`${name} must be http(s)`);
  if (u.search || u.hash) throw new UsageError(`${name} must not carry a query string or fragment`);
  return (u.origin + u.pathname).replace(/\/+$/, '');
}

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]', '0.0.0.0']);

/** True when two base URLs would hit the same server (incl. localhost vs 127.0.0.1 on the same port). */
function sameTarget(a, b) {
  const ua = new URL(a);
  const ub = new URL(b);
  if (ua.origin + ua.pathname.replace(/\/+$/, '') === ub.origin + ub.pathname.replace(/\/+$/, '')) return true;
  if (LOOPBACK.has(ua.hostname) && LOOPBACK.has(ub.hostname) && ua.port === ub.port && ua.protocol === ub.protocol
    && ua.pathname.replace(/\/+$/, '') === ub.pathname.replace(/\/+$/, '')) return true;
  return false;
}

/** Refuses when the two targets are the same (a "differential" of a server with itself proves nothing). */
function assertTwoDistinctTargets(renderUrl, workersUrl) {
  const r = normalizeBase('--render', renderUrl);
  const w = normalizeBase('--workers', workersUrl);
  if (sameTarget(r, w)) throw new UsageError(`refusing to run: --render and --workers point at the same server (${r}); a comparison of a server with itself proves nothing`);
  return { render: r, workers: w };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * One HTTP call. Never throws: network failures come back as { status: 0, error }.
 * Redirects are NOT followed (a redirect is a result); no cookies are ever sent.
 */
async function httpCall({ url, method = 'GET', headers = {}, body, timeoutMs = 20000, fetchImpl = globalThis.fetch }) {
  const started = Date.now();
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const init = { method, headers: { Accept: 'application/json, */*;q=0.5', ...headers }, redirect: 'manual', signal: ctl.signal };
    if (body !== undefined) {
      if (typeof body === 'string' || body instanceof Uint8Array || body instanceof ArrayBuffer || (typeof FormData !== 'undefined' && body instanceof FormData)) init.body = body;
      else { init.body = JSON.stringify(body); if (!init.headers['Content-Type'] && !init.headers['content-type']) init.headers['Content-Type'] = 'application/json'; }
    }
    const res = await fetchImpl(url, init);
    const buf = new Uint8Array(await res.arrayBuffer());
    const contentType = res.headers.get('content-type') || '';
    let text = null;
    let json;
    if (!/^(application\/pdf|application\/octet-stream|application\/vnd\.|image\/)/i.test(contentType)) {
      text = Buffer.from(buf).toString('utf8');
      if (/json/i.test(contentType) || /^\s*[[{]/.test(text)) {
        try { json = JSON.parse(text); } catch (e) { json = undefined; }
      }
    }
    return {
      status: res.status, contentType, headers: res.headers, bytes: buf, text, json, ms: Date.now() - started,
      retryAfter: res.headers.get('retry-after'),
    };
  } catch (e) {
    return { status: 0, error: e && e.name === 'AbortError' ? `timeout after ${timeoutMs}ms` : String((e && e.cause && e.cause.code) || (e && e.message) || e), ms: Date.now() - started };
  } finally {
    clearTimeout(timer);
  }
}

/* ------------------------------------------------------------------------- */
/* JSON shape comparison                                                      */
/* ------------------------------------------------------------------------- */

function typeOf(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  return typeof v; // object | string | number | boolean
}

/**
 * Compare the SHAPE of two parsed JSON values (keys and types, recursively; primitive values are never compared).
 * `ignore` = keys skipped entirely (presence and type), for volatile fields. Arrays: the union of the element
 * shapes is compared; an empty array on one side only is reported as a note, not a difference (no evidence either way).
 * @returns {{ diffs: {path: string, kind: string, detail: string}[], notes: string[] }}
 */
function compareShapes(a, b, ignore = new Set()) {
  const diffs = [];
  const notes = [];
  const walk = (x, y, p) => {
    const tx = typeOf(x);
    const ty = typeOf(y);
    if (tx !== ty) { diffs.push({ path: p, kind: 'type', detail: `${tx} vs ${ty}` }); return; }
    if (tx === 'object') {
      const kx = Object.keys(x);
      const ky = Object.keys(y);
      for (const k of kx) if (!ignore.has(k) && !(k in y)) diffs.push({ path: `${p}.${k}`, kind: 'missing', detail: 'key present on Render, missing on Workers' });
      for (const k of ky) if (!ignore.has(k) && !(k in x)) diffs.push({ path: `${p}.${k}`, kind: 'extra', detail: 'key present on Workers, missing on Render' });
      for (const k of kx) if (!ignore.has(k) && k in y) walk(x[k], y[k], `${p}.${k}`);
    } else if (tx === 'array') {
      if (x.length === 0 && y.length === 0) return;
      if (x.length === 0 || y.length === 0) { notes.push(`${p}: empty array on ${x.length === 0 ? 'Render' : 'Workers'} only (element shape unverified)`); return; }
      const mx = mergeElements(x, ignore);
      const my = mergeElements(y, ignore);
      compareMerged(mx, my, `${p}[]`);
    }
  };
  // Array elements are merged into one "shape tree": { types:Set, keys:Map<key, tree>, item: tree|null }.
  const mergeElements = (arr, ign) => {
    const tree = { types: new Set(), keys: new Map(), item: null, count: arr.length };
    for (const el of arr) mergeInto(tree, el, ign);
    return tree;
  };
  const mergeInto = (tree, v, ign) => {
    const t = typeOf(v);
    tree.types.add(t);
    if (t === 'object') {
      for (const [k, val] of Object.entries(v)) {
        if (ign.has(k)) continue;
        if (!tree.keys.has(k)) tree.keys.set(k, { types: new Set(), keys: new Map(), item: null, seen: 0 });
        const sub = tree.keys.get(k);
        sub.seen++;
        mergeInto(sub, val, ign);
      }
      tree.objects = (tree.objects || 0) + 1;
    } else if (t === 'array') {
      if (!tree.item) tree.item = { types: new Set(), keys: new Map(), item: null };
      for (const el of v) mergeInto(tree.item, el, ign);
    }
  };
  const compareMerged = (x, y, p) => {
    const nullable = (t) => new Set([...t].filter((n) => n !== 'null'));
    const tx = [...x.types].sort().join('|');
    const ty = [...y.types].sort().join('|');
    if (tx !== ty) {
      // null is allowed to differ when both sides otherwise agree (a nullable column that happens to be set on one side)
      const nx = [...nullable(x.types)].sort().join('|');
      const ny = [...nullable(y.types)].sort().join('|');
      if (nx !== ny || nx === '') { diffs.push({ path: p, kind: 'type', detail: `${tx} vs ${ty}` }); return; }
    }
    for (const [k, sx] of x.keys) {
      if (!y.keys.has(k)) { diffs.push({ path: `${p}.${k}`, kind: 'missing', detail: 'key present on Render, missing on Workers' }); continue; }
      compareMerged(sx, y.keys.get(k), `${p}.${k}`);
    }
    for (const k of y.keys.keys()) if (!x.keys.has(k)) diffs.push({ path: `${p}.${k}`, kind: 'extra', detail: 'key present on Workers, missing on Render' });
    if (x.item && y.item) compareMerged(x.item, y.item, `${p}[]`);
  };
  walk(a, b, '$');
  return { diffs, notes };
}

/* ------------------------------------------------------------------------- */
/* Manifest helpers                                                           */
/* ------------------------------------------------------------------------- */

function loadManifest(file) {
  let m;
  try { m = JSON.parse(fs.readFileSync(path.resolve(file || DEFAULT_REFERENCE), 'utf8')); } catch (e) {
    throw new UsageError(`cannot read manifest ${file || DEFAULT_REFERENCE}: ${e.message}`);
  }
  if (!m || !Array.isArray(m.endpoints)) throw new UsageError('manifest has no endpoints array');
  return m;
}

function inPrefixes(p, prefixes) {
  if (!prefixes || !prefixes.length) return true;
  const c = canonicalizePath(p);
  return prefixes.some((x) => { const cp = canonicalizePath(x); return cp === '/' || c === cp || c.startsWith(cp + '/'); });
}

/** Replace :params (and Hono/Express regex constraints) with sample values. */
function fillPath(p, params = {}) {
  return p
    .replace(/:([A-Za-z0-9_]+)(?:\{[^}]*\}|\([^)]*\))?[?+*]?/g, (_m, name) => encodeURIComponent(params[name] !== undefined ? params[name] : (/id$/i.test(name) ? '1' : 'sample')))
    .replace(/\*/g, 'sample');
}

function parseParamPairs(list) {
  const out = {};
  for (const s of list || []) {
    const i = s.indexOf('=');
    if (i <= 0) throw new UsageError(`--param expects name=value, got "${s}"`);
    out[s.slice(0, i)] = s.slice(i + 1);
  }
  return out;
}

const endpointKey = (e) => `${String(e.method).toUpperCase()} ${e.path}`;
const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** Endpoints whose execution is destructive or account-affecting even for a test account. */
const DANGEROUS_RE = [
  /^\/api\/auth(\/|$)/i,
  /^\/api\/subscriptions(\/|$)/i,
  /^\/api\/admin(-panels)?(\/|$)/i,
];
const isDangerous = (e) => (MUTATING.has(String(e.method).toUpperCase()) && DANGEROUS_RE.some((re) => re.test(e.path))) || String(e.method).toUpperCase() === 'DELETE';

/* ------------------------------------------------------------------------- */
/* Pacing (Render's express-rate-limit is 100 requests / 15 min / IP on /api)  */
/* ------------------------------------------------------------------------- */

class Pacer {
  constructor({ delayMs = 300, budget = 0, windowMs = 15 * 60 * 1000, sleepImpl = sleep, now = () => Date.now(), log = () => {} } = {}) {
    Object.assign(this, { delayMs, budget, windowMs, sleepImpl, now, log });
    this.stamps = [];
  }
  async wait() {
    if (this.budget > 0) {
      const t = this.now();
      this.stamps = this.stamps.filter((s) => t - s < this.windowMs);
      if (this.stamps.length >= this.budget) {
        const waitMs = this.windowMs - (t - this.stamps[0]) + 250;
        this.log(`  (pacing: ${this.stamps.length} requests in the last ${Math.round(this.windowMs / 60000)} min, waiting ${Math.ceil(waitMs / 1000)}s to stay under the rate limit)`);
        await this.sleepImpl(waitMs);
        this.stamps = this.stamps.filter((s) => this.now() - s < this.windowMs);
      }
      this.stamps.push(this.now());
    }
    if (this.delayMs > 0) await this.sleepImpl(this.delayMs);
  }
}

function pct(sorted, p) {
  if (!sorted.length) return null;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[i];
}

/** Wrap a script's async main: usage errors -> exit 64 with a message, anything else -> exit 1 with the message. */
async function runMain(fn, io) {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof UsageError) { io.err(e.message); return EXIT.USAGE; }
    io.err(`unexpected error: ${(e && e.stack) || e}`);
    return EXIT.FAIL;
  }
}

function defaultIo(overrides = {}) {
  return { env: process.env, log: console.log, err: console.error, fetchImpl: globalThis.fetch, sleepImpl: sleep, ...overrides };
}


/* ------------------------------------------------------------------------- */
/* Test-account login + env credentials (never printed, never stored)          */
/* ------------------------------------------------------------------------- */

/**
 * POST <base>/api/auth/login. Returns { ok, status, token, refreshToken, body }.
 * `headers` lets callers add e.g. X-Forwarded-For; `replaceDevice` is sent only when true.
 * The password is passed in the request body only and is never logged.
 */
async function login({ base, email, password, replaceDevice = false, headers = {}, deviceName, fetchImpl, timeoutMs }) {
  const body = { email, password };
  if (replaceDevice) body.replaceDevice = true;
  if (deviceName) body.deviceName = deviceName;
  const r = await httpCall({ url: base + '/api/auth/login', method: 'POST', body, headers, fetchImpl, timeoutMs });
  const j = r.json && typeof r.json === 'object' ? r.json : {};
  return { ok: r.status === 200 && typeof j.token === 'string', status: r.status, token: j.token, refreshToken: j.refreshToken, body: j, error: r.error };
}

/** The env var names used by the verification scripts (documented in docs/migration/verification-runbook.md). */
const ENV = {
  EMAIL: 'JT_TEST_EMAIL', PASSWORD: 'JT_TEST_PASSWORD', TOKEN: 'JT_TEST_TOKEN', JWT_SECRET: 'JT_JWT_SECRET',
  tier: (name) => ({ token: `JT_TOKEN_${name}`, email: `JT_EMAIL_${name}`, password: `JT_PASSWORD_${name}` }),
};

/**
 * The single-token credential rule shared by differential / upload-roundtrip / load-test:
 * JT_TEST_TOKEN wins; else JT_TEST_EMAIL + JT_TEST_PASSWORD log in ONCE on Render and need --test-account-only; else anonymous.
 */
async function resolveTestToken({ env, renderBase, testAccountOnly, dryRun, io, timeoutMs }) {
  if (env[ENV.TOKEN]) return { token: env[ENV.TOKEN], source: `env ${ENV.TOKEN}` };
  if (env[ENV.EMAIL] || env[ENV.PASSWORD]) {
    if (!env[ENV.EMAIL] || !env[ENV.PASSWORD]) throw new UsageError(`${ENV.EMAIL} and ${ENV.PASSWORD} must both be set`);
    if (!testAccountOnly) {
      throw new UsageError(`refusing to log in: ${ENV.EMAIL} is set but --test-account-only was not given. Logging in replaces the account's active session; pass --test-account-only to confirm this is a dedicated test account.`);
    }
    if (dryRun) return { token: null, source: `would log in as the env test account on Render (${ENV.EMAIL})`, pendingLogin: true };
    const r = await login({ base: renderBase, email: env[ENV.EMAIL], password: env[ENV.PASSWORD], replaceDevice: true, fetchImpl: io.fetchImpl, timeoutMs });
    if (!r.ok) throw new UsageError(`login on Render failed (HTTP ${r.status}${r.error ? `, ${r.error}` : ''}); nothing was compared`);
    return { token: r.token, source: `logged in on Render as the env test account (${ENV.EMAIL})` };
  }
  return { token: null, source: 'anonymous (no JT_TEST_TOKEN / JT_TEST_EMAIL); protected endpoints are compared on their 401 responses' };
}


/* ------------------------------------------------------------------------- */
/* Information-leak scan for response bodies (checklist item 22)              */
/* ------------------------------------------------------------------------- */

const LEAK_PATTERNS = [
  ['stack trace', /^\s+at\s+.+:\d+:\d+\)?\s*$/m],
  ['internal file path', /(?:[A-Za-z]:\\|\/)[^\s"']*(?:node_modules|[\\/]src[\\/](?:routes|services|middleware|utils|worker))[^\s"']*\.(?:js|mjs|cjs|ts)\b/],
  ['database connection string', /postgres(?:ql)?:\/\/[^\s"']+/i],
  ['secret / credential name', /\b(?:JWT_SECRET|DATABASE_URL|password_hash|ANTHROPIC_API_KEY|GEMINI_API_KEY)\b/],
];

/** @returns {string[]} labels of leak patterns found in a response body (text) */
function findLeaks(text) {
  if (typeof text !== 'string' || !text) return [];
  // JSON bodies carry stack traces as escaped \n sequences; test the raw text and the unescaped text
  const unescaped = text.replace(/(?:\\r)?\\n/g, '\n');
  return LEAK_PATTERNS.filter(([, re]) => re.test(text) || re.test(unescaped)).map(([label]) => label);
}

const helpText = (file) => fs.readFileSync(file, 'utf8').split('*/')[0];

module.exports = {
  EXIT, REPO_DIR, DEFAULT_REFERENCE, UsageError, parseArgv, toInt, normalizeBase, sameTarget, assertTwoDistinctTargets,
  sleep, httpCall, typeOf, compareShapes, loadManifest, inPrefixes, fillPath, parseParamPairs, endpointKey, MUTATING,
  isDangerous, DANGEROUS_RE, findLeaks, login, ENV, resolveTestToken, Pacer, pct, runMain, defaultIo, helpText,
};
