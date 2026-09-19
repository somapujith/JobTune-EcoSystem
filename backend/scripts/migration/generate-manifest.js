#!/usr/bin/env node
'use strict';

/**
 * generate-manifest.js  (ADR-001 task T4.1, sections 3(C), 6.3, Phase 3 + 4, section 8)
 *
 * Statically analyses the Express backend (src/app.js + src/routes/*.js) with @babel/parser
 * and emits the machine-readable REFERENCE manifest
 *      endpoint -> { auth, admin, roles, minTier, guards, chain, sourceFile, line }
 * to docs/migration/manifest.render.json (+ a human summary in manifest.render.md).
 *
 * Nothing in the manifest is hand-written: every value is derived from the AST.
 *   - No code is executed, no DB / network / .env access, nothing outside src/ is read.
 *   - Express registration semantics are modelled: registration ORDER, mount prefixes,
 *     app-level middleware, mount-level middleware (app.use(prefix, mw, router)), file-level
 *     router.use(...) guards (positional: only routes registered AFTER the use() are
 *     covered; path-scoped use() only covers matching paths), router.route(p).get().post()
 *     chains, array middleware args, nested routers, and import aliases
 *     (`const { authenticateToken: auth } = require(...)` is resolved to authenticateToken).
 *
 * Usage (from backend/):
 *   node scripts/migration/generate-manifest.js [--no-write] [--no-assert] [--check]
 *        [--json <path>] [--md <path>] [--backend-dir <dir>] [--from-head]
 *   --check       regenerate in memory and fail (exit 4) if the committed JSON is stale
 *   --from-head   analyse the committed git HEAD (files read with `git show`, working tree ignored) so the
 *                 reference is not affected by uncommitted work; output paths stay repo-relative
 *   --backend-dir analyse another checkout (e.g. `git archive HEAD backend/src` extracted to a
 *                 temp dir) instead of this one; output paths stay repo-relative
 * Exit codes: 0 ok | 3 a count differs from the ADR (outputs are still written) | 4 stale (--check)
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');
const {
  parseSegments, segmentsCover, canonicalizePath,
} = require('./compare-manifests');

let parser;
try {
  // Not a direct dependency of backend/package.json: comes with jest (babel-jest / @babel/core).
  parser = require('@babel/parser');
} catch (e) {
  console.error('generate-manifest: cannot load @babel/parser (installed transitively by jest).\n' +
    'Run this from a checkout where backend/node_modules exists (do not npm-install it ad hoc).');
  process.exit(1);
}

const SCHEMA_VERSION = 1;
const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'all'];
const GUARD_NAME_RE = /^(authenticateToken|requireAdmin|requireRole|requirePlan|requireOnboarding|optionalAuth|(authenticate|require)[A-Z]\w*)$/;

const ADR_EXPECTED = {
  routeFiles: 41,
  endpoints: 181,
  mountPoints: 41,
  requirePlanFiles: 26,
  requirePlanCallSites: 100,
  perFileRequirePlan: {
    'community.js': 14, 'aiCoach.js': 11, 'practice.js': 10, 'profiles.js': 8,
    'projectBuilder.js': 7, 'courses.js': 7, 'studyHistory.js': 7,
  },
};

const SCHEMA = {
  name: 'jobtune-endpoint-manifest',
  version: SCHEMA_VERSION,
  purpose: 'Reference (Render/Express) vs candidate (Workers/Hono) endpoint parity. Compared by scripts/migration/compare-manifests.js.',
  topLevel: {
    schema: 'this object',
    generator: 'provenance of the manifest (script, parser, git info); informational',
    counts: 'headline numbers; informational',
    sanity: 'ADR-001 measured numbers vs independently derived numbers; informational',
    appMiddleware: 'ordered app-level (non-router) app.use() layers of app.js; informational',
    mounts: 'ordered router mount table; informational',
    files: 'per route-file summary; informational',
    endpoints: 'REQUIRED. Array of endpoint objects in Express registration order (see endpointFields).',
    oddities: 'derived anomaly report (shadowed / duplicate routes, unresolved chains, ...); informational',
  },
  endpointFields: {
    id: 'string. "METHOD /full/path". Not unique if a route is registered twice.',
    method: 'REQUIRED string. Upper-case HTTP method (GET POST PUT PATCH DELETE HEAD OPTIONS ALL).',
    path: 'REQUIRED string. Full path = mount prefix + route path, starting with "/", no trailing slash (except "/"). Params as ":name" (Hono ":name{regex}" and Express ":name(regex)" accepted).',
    auth: 'REQUIRED boolean. true iff authenticateToken is in the effective chain: inline, via a preceding file-level router.use(), or mount/app-level.',
    admin: 'boolean (default false). true iff a requireAdmin guard is in the effective chain.',
    roles: 'string[] | null (default null). Union of literal args of requireRole(...) guards in the chain, else null.',
    minTier: 'number | string | null (default null). Highest numeric literal arg of requirePlan(n) in the chain; null when not plan-gated; a string (source text of the argument) when the argument is not a literal (always accompanied by flag NON_LITERAL_MINTIER).',
    guards: 'string[]. Guard middleware in effective order, canonical text, e.g. ["authenticateToken","requirePlan(2)"]. Any middleware whose name matches authenticate*/require*/optionalAuth is a guard.',
    chain: 'string[]. All effective middleware labels in order (app-level, mount-level, file-level, route-level) excluding the terminal handler; aliases resolved (auth -> authenticateToken); "<inline>" = anonymous function. Informational (Workers naming will differ).',
    layers: '{app, mount, file, route}: string[] each; chain split by where it was registered. Informational.',
    handler: 'string. Label of the terminal handler ("<inline>" for anonymous functions).',
    routePath: 'string. Path relative to its router.',
    mountPrefix: 'string|null. Absolute prefix of the router this route lives on (null for routes registered directly on app).',
    mountOrder: 'number|null. 1-based index of the top-level mount (app.use(prefix, router)) in app.js.',
    routerFile: 'string|null. Repo-relative router file.',
    order: 'number. 1-based global registration order (Express match order).',
    sourceFile: 'string. Repo-relative file containing the registration.',
    line: 'number. 1-based line of the router.<method>( call.',
    flags: 'string[]. Static-analysis notes: NON_LITERAL_MINTIER, PLAN_WITHOUT_AUTH, PLAN_BEFORE_AUTH, MULTIPLE_PLAN_GUARDS, ADMIN_WITHOUT_AUTH, UNRESOLVED_MIDDLEWARE:<label>, LOCAL_GUARD_DEFINITION:<name>, ALIASED_GUARD:<alias>, REQ_USER_WITHOUT_AUTH, DYNAMIC_PATH, COMPLEX_PATH_PATTERN, NON_TOPLEVEL_REGISTRATION, REQUIREPLAN_NOT_CALLED.',
  },
  requiredForComparison: ['method', 'path', 'auth'],
  keying: 'Endpoints are paired on METHOD + canonical(path): lower-cased, trailing slash stripped, every :param (any name / regex constraint) replaced with ":". First occurrence wins on duplicates.',
  workersExtractionHint: 'Hono exposes app.routes (method, path, handler[]); resolve each handler to a guard name (e.g. by function name or a registry) and emit the same required fields.',
};

/* ------------------------------------------------------------------------- */
/* Small helpers                                                              */
/* ------------------------------------------------------------------------- */

const NOT_LITERAL = Symbol('not-literal');

function slice(mod, node, max = 110) {
  if (!node) return '';
  const s = mod.code.slice(node.start, node.end).replace(/\s+/g, ' ').trim();
  return s.length > max ? s.slice(0, max - 3) + '...' : s;
}

function walk(node, visit, ancestors = []) {
  if (!node || typeof node.type !== 'string') return;
  visit(node, ancestors);
  ancestors.push(node);
  for (const key of Object.keys(node)) {
    if (key === 'loc' || key === 'extra' || key === 'leadingComments' || key === 'trailingComments' || key === 'innerComments') continue;
    const v = node[key];
    if (Array.isArray(v)) {
      for (const c of v) if (c && typeof c.type === 'string') walk(c, visit, ancestors);
    } else if (v && typeof v.type === 'string') {
      walk(v, visit, ancestors);
    }
  }
  ancestors.pop();
}

function literalValue(node) {
  if (!node) return NOT_LITERAL;
  switch (node.type) {
    case 'StringLiteral': return node.value;
    case 'NumericLiteral': return node.value;
    case 'BooleanLiteral': return node.value;
    case 'NullLiteral': return null;
    case 'TemplateLiteral':
      return node.expressions.length === 0 ? node.quasis.map((q) => q.value.cooked).join('') : NOT_LITERAL;
    case 'UnaryExpression':
      if (node.operator === '-' && node.argument.type === 'NumericLiteral') return -node.argument.value;
      return NOT_LITERAL;
    case 'ArrayExpression': {
      const out = [];
      for (const el of node.elements) {
        const v = literalValue(el);
        if (v === NOT_LITERAL) return NOT_LITERAL;
        out.push(v);
      }
      return out;
    }
    default: return NOT_LITERAL;
  }
}

function joinPaths(...parts) {
  const segs = parts.join('/').split('/').filter(Boolean);
  return '/' + segs.join('/');
}

/* ------------------------------------------------------------------------- */
/* Module analysis                                                            */
/* ------------------------------------------------------------------------- */

function createContext(backendDir) {
  const repoDir = path.resolve(backendDir, '..');
  const ctx = {
    backendDir,
    repoDir,
    srcDir: path.join(backendDir, 'src'),
    routesDir: path.join(backendDir, 'src', 'routes'),
    middlewareDir: path.join(backendDir, 'src', 'middleware'),
    entryFile: path.join(backendDir, 'src', 'app.js'),
    modules: new Map(),
    usedMiddleware: new Set(),
    rel(p) { return path.relative(repoDir, p).split(path.sep).join('/'); },
  };
  return ctx;
}

function resolveRelative(fromFile, source) {
  if (!source.startsWith('.')) return null;
  const base = path.resolve(path.dirname(fromFile), source);
  for (const c of [base, base + '.js', path.join(base, 'index.js')]) {
    if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
  }
  return null;
}

function requireCall(node) {
  if (!node) return null;
  if (node.type === 'CallExpression' && node.callee.type === 'Identifier' && node.callee.name === 'require'
    && node.arguments.length === 1 && node.arguments[0].type === 'StringLiteral') {
    return { source: node.arguments[0].value, member: null };
  }
  if (node.type === 'MemberExpression' && !node.computed && node.property.type === 'Identifier') {
    const inner = requireCall(node.object);
    if (inner && !inner.member) return { source: inner.source, member: node.property.name };
  }
  return null;
}

function analyzeModule(ctx, abs) {
  if (ctx.modules.has(abs)) return ctx.modules.get(abs);
  const code = fs.readFileSync(abs, 'utf8');
  const ast = parser.parse(code, { sourceType: 'script', errorRecovery: false, allowReturnOutsideFunction: true });
  const mod = {
    abs, file: ctx.rel(abs), code, ast, ctx,
    bindings: new Map(), receivers: new Map(), exportedName: null,
    entries: [], escapes: [], requirePlanSites: [], localGuards: [],
  };
  ctx.modules.set(abs, mod);
  collectBindings(mod);
  const collected = collectEntries(mod, ast.program, mod.receivers);
  mod.entries = collected.entries;
  mod.escapes = collected.escapes;
  mod.requirePlanSites = collectRequirePlanSites(mod);
  return mod;
}

function collectBindings(mod) {
  for (const stmt of mod.ast.program.body) {
    if (stmt.type === 'VariableDeclaration') {
      for (const d of stmt.declarations) bindDeclarator(mod, d, stmt.kind);
    } else if (stmt.type === 'FunctionDeclaration' && stmt.id) {
      mod.bindings.set(stmt.id.name, { kind: 'local', declKind: 'function', node: stmt, line: stmt.loc.start.line, init: null });
    } else if (stmt.type === 'ExpressionStatement' && stmt.expression.type === 'AssignmentExpression') {
      const l = stmt.expression.left;
      if (l.type === 'MemberExpression' && !l.computed && l.object.type === 'Identifier' && l.object.name === 'module'
        && l.property.type === 'Identifier' && l.property.name === 'exports' && stmt.expression.right.type === 'Identifier') {
        mod.exportedName = stmt.expression.right.name;
      }
    }
  }
}

function bindDeclarator(mod, d, declKind) {
  const init = d.init;
  const req = requireCall(init);
  if (req) {
    const resolved = resolveRelative(mod.abs, req.source);
    if (d.id.type === 'Identifier') {
      mod.bindings.set(d.id.name, { kind: 'import', source: req.source, imported: req.member || '*', resolved, line: d.loc.start.line });
    } else if (d.id.type === 'ObjectPattern') {
      for (const p of d.id.properties) {
        if (p.type !== 'ObjectProperty' || p.key.type !== 'Identifier') continue;
        let local = null;
        if (p.value.type === 'Identifier') local = p.value.name;
        else if (p.value.type === 'AssignmentPattern' && p.value.left.type === 'Identifier') local = p.value.left.name;
        if (local) mod.bindings.set(local, { kind: 'import', source: req.source, imported: p.key.name, resolved, line: d.loc.start.line });
      }
    }
    return;
  }
  if (d.id.type !== 'Identifier') return;
  mod.bindings.set(d.id.name, { kind: 'local', declKind, node: d, init, line: d.loc.start.line });
  if (init && init.type === 'CallExpression') {
    const c = init.callee;
    if (c.type === 'Identifier' && c.name === 'express') mod.receivers.set(d.id.name, 'app');
    else if (c.type === 'MemberExpression' && c.object.type === 'Identifier' && c.object.name === 'express'
      && c.property.type === 'Identifier' && c.property.name === 'Router') mod.receivers.set(d.id.name, 'router');
    else if (c.type === 'Identifier' && c.name === 'Router') mod.receivers.set(d.id.name, 'router');
  }
}

function isPathNode(node) {
  if (!node) return false;
  if (node.type === 'StringLiteral' || node.type === 'TemplateLiteral' || node.type === 'RegExpLiteral') return true;
  if (node.type === 'ArrayExpression') return node.elements.length > 0 && node.elements.every((e) => e && (e.type === 'StringLiteral' || e.type === 'TemplateLiteral'));
  return false;
}

function readPath(mod, node) {
  if (!node) return { values: ['/'], dynamic: false, text: '/' };
  const lit = literalValue(node);
  if (typeof lit === 'string') return { values: [lit], dynamic: false, text: lit };
  if (Array.isArray(lit) && lit.every((x) => typeof x === 'string')) return { values: lit, dynamic: false, text: lit.join('|') };
  return { values: null, dynamic: true, text: slice(mod, node) };
}

function resolveRouteChain(node, receivers) {
  if (!node || node.type !== 'CallExpression') return null;
  const c = node.callee;
  if (c.type !== 'MemberExpression' || c.computed || c.property.type !== 'Identifier') return null;
  if (c.property.name === 'route' && c.object.type === 'Identifier' && receivers.has(c.object.name)) {
    return { receiver: c.object.name, pathNode: node.arguments[0] };
  }
  if (HTTP_METHODS.includes(c.property.name)) return resolveRouteChain(c.object, receivers);
  return null;
}

function functionCallsNext(fn) {
  if (!fn || !/Function/.test(fn.type)) return false;
  const third = fn.params[2];
  if (!third || third.type !== 'Identifier') return false;
  let found = false;
  walk(fn.body, (n) => {
    if (n.type === 'CallExpression' && n.callee.type === 'Identifier' && n.callee.name === third.name) found = true;
  });
  return found;
}

function functionUsesReqUser(fn) {
  if (!fn || !/Function/.test(fn.type)) return false;
  let found = false;
  walk(fn.body, (n) => {
    if (n.type === 'MemberExpression' && !n.computed && n.object.type === 'Identifier' && n.object.name === 'req'
      && n.property.type === 'Identifier' && n.property.name === 'user') found = true;
  });
  return found;
}

/** Collect registration calls on the given receivers under `root`, in source order. */
function collectEntries(mod, root, receivers) {
  const entries = [];
  const escapes = [];
  walk(root, (node, ancestors) => {
    if (node.type !== 'CallExpression') return;
    const callee = node.callee;
    const nested = ancestors.some((a) => a !== root && !['Program', 'ExpressionStatement', 'BlockStatement'].includes(a.type));

    if (callee.type === 'MemberExpression' && !callee.computed && callee.property.type === 'Identifier') {
      const method = callee.property.name;
      let receiver = null;
      let pathNode = null;
      let handlers = node.arguments;
      let viaRoute = false;
      if (callee.object.type === 'Identifier' && receivers.has(callee.object.name)) {
        receiver = callee.object.name;
      } else if (HTTP_METHODS.includes(method)) {
        const ch = resolveRouteChain(callee.object, receivers);
        if (ch) { receiver = ch.receiver; pathNode = ch.pathNode; viaRoute = true; }
      }
      if (receiver) {
        const base = { mod, receiver, line: callee.property.loc.start.line, pos: callee.property.start, nested };
        if (HTTP_METHODS.includes(method)) {
          if (!viaRoute) { pathNode = node.arguments[0]; handlers = node.arguments.slice(1); }
          entries.push({ ...base, type: 'route', method: method.toUpperCase(), pathInfo: readPath(mod, pathNode), handlers, viaRouteChain: viaRoute });
        } else if (method === 'use') {
          const first = node.arguments[0];
          if (isPathNode(first)) entries.push({ ...base, type: 'use', pathInfo: readPath(mod, first), handlers: node.arguments.slice(1) });
          else entries.push({ ...base, type: 'use', pathInfo: readPath(mod, null), handlers: node.arguments });
        }
        return;
      }
    }
    // receiver escaping into another function, e.g. setupFrontend(app)
    node.arguments.forEach((arg, idx) => {
      if (arg.type === 'Identifier' && receivers.has(arg.name)) {
        const isOnReceiver = callee.type === 'MemberExpression' && callee.object.type === 'Identifier' && receivers.has(callee.object.name);
        if (!isOnReceiver) {
          escapes.push({ mod, calleeText: slice(mod, callee), calleeName: callee.type === 'Identifier' ? callee.name : null, argIndex: idx, receiver: arg.name, line: node.loc.start.line, pos: node.start, nested });
        }
      }
    });
  });
  entries.sort((a, b) => a.pos - b.pos);
  escapes.sort((a, b) => a.pos - b.pos);
  return { entries, escapes };
}

function collectRequirePlanSites(mod) {
  const sites = [];
  walk(mod.ast.program, (n) => {
    if (n.type === 'CallExpression' && n.callee.type === 'Identifier') {
      const b = mod.bindings.get(n.callee.name);
      if (b && b.kind === 'import' && b.imported === 'requirePlan') {
        const v = n.arguments.length ? literalValue(n.arguments[0]) : NOT_LITERAL;
        sites.push({ line: n.loc.start.line, arg: v === NOT_LITERAL ? slice(mod, n.arguments[0]) : v, literal: v !== NOT_LITERAL });
      }
    }
  });
  return sites;
}

/* ------------------------------------------------------------------------- */
/* Middleware description                                                     */
/* ------------------------------------------------------------------------- */

function originOf(mod, name, depth = 0) {
  const b = mod.bindings.get(name);
  if (!b || depth > 3) return null;
  if (b.kind === 'import') return b.source;
  if (b.init && b.init.type === 'CallExpression') {
    const root = rootIdentifier(b.init.callee);
    if (root) return originOf(mod, root, depth + 1);
  }
  return null;
}

function rootIdentifier(node) {
  let n = node;
  while (n) {
    if (n.type === 'Identifier') return n.name;
    if (n.type === 'MemberExpression') n = n.object;
    else if (n.type === 'CallExpression') n = n.callee;
    else return null;
  }
  return null;
}

function renderArgs(mod, args) {
  const vals = args.map((a) => literalValue(a));
  if (vals.every((v) => v !== NOT_LITERAL)) return { literal: true, values: vals, text: vals.map((v) => JSON.stringify(v)).join(',') };
  return { literal: false, values: null, text: args.length ? '...' : '' };
}

function optionsOf(mod, args) {
  const first = args[0];
  if (!first || first.type !== 'ObjectExpression') return null;
  const out = {};
  for (const p of first.properties) {
    if (p.type !== 'ObjectProperty' && p.type !== 'ObjectMethod') continue;
    const key = p.key.type === 'Identifier' ? p.key.name : p.key.type === 'StringLiteral' ? p.key.value : null;
    if (!key) continue;
    out[key] = p.type === 'ObjectProperty' ? slice(mod, p.value, 90) : '<method>';
  }
  return out;
}

function trackMiddlewareUse(mod, binding) {
  if (binding.kind === 'import' && binding.resolved && binding.resolved.startsWith(mod.ctx.middlewareDir)) {
    mod.ctx.usedMiddleware.add(mod.ctx.rel(binding.resolved) + '#' + binding.imported);
  }
}

function guardOf(name, argsInfo, isCall) {
  if (!GUARD_NAME_RE.test(name)) return null;
  const label = isCall ? `${name}(${argsInfo ? argsInfo.text : ''})` : name;
  return { name, isCall, args: argsInfo && argsInfo.literal ? argsInfo.values : null, argsLiteral: argsInfo ? argsInfo.literal : true, label };
}

function describeMiddleware(mod, node) {
  switch (node.type) {
    case 'ArrowFunctionExpression':
    case 'FunctionExpression':
      return [{ label: '<inline>', kind: 'inline', resolved: true, fn: node }];
    case 'ArrayExpression':
      return node.elements.flatMap((el) => (el ? describeMiddleware(mod, el) : []));
    case 'SpreadElement':
      return [{ label: '...' + slice(mod, node.argument, 40), kind: 'unresolved', resolved: false }];
    case 'Identifier':
      return [describeIdentifier(mod, node)];
    case 'CallExpression':
      return [describeCall(mod, node)];
    case 'MemberExpression': {
      const root = rootIdentifier(node);
      const b = root ? mod.bindings.get(root) : null;
      if (b) trackMiddlewareUse(mod, b);
      return [{ label: slice(mod, node, 60), kind: 'member', resolved: !!b, from: root ? originOf(mod, root) : null }];
    }
    default:
      return [{ label: slice(mod, node, 60), kind: 'unresolved', resolved: false }];
  }
}

function describeIdentifier(mod, node) {
  const name = node.name;
  const b = mod.bindings.get(name);
  if (!b) return { label: name, kind: 'unresolved', resolved: false };
  trackMiddlewareUse(mod, b);
  if (b.kind === 'import') {
    const canonical = b.imported === '*' ? name : b.imported;
    return {
      label: canonical, canonical, kind: 'imported', resolved: true, from: b.source,
      alias: canonical !== name ? name : undefined, guard: guardOf(canonical, null, false),
    };
  }
  // local binding
  if (b.init && b.init.type === 'CallExpression') {
    const sub = describeCall(mod, b.init);
    if (sub.guard) return { ...sub, alias: name };
    return { label: name, canonical: name, kind: 'local', resolved: sub.resolved, from: sub.from, factory: sub.canonical, options: sub.options };
  }
  const item = { label: name, canonical: name, kind: 'local', resolved: true, defLine: b.line };
  const g = guardOf(name, null, false);
  if (g) { item.guard = g; item.localGuard = true; mod.localGuards.push({ name, line: b.line }); }
  return item;
}

function describeCall(mod, node) {
  const callee = node.callee;
  const argsInfo = renderArgs(mod, node.arguments);
  const options = optionsOf(mod, node.arguments);
  if (callee.type === 'Identifier') {
    const b = mod.bindings.get(callee.name);
    if (!b) return { label: `${callee.name}(${argsInfo.text})`, kind: 'unresolved', resolved: false };
    trackMiddlewareUse(mod, b);
    const canonical = b.kind === 'import' && b.imported !== '*' ? b.imported : callee.name;
    const guard = guardOf(canonical, argsInfo, true);
    const item = {
      label: `${canonical}(${argsInfo.text})`, canonical, kind: b.kind === 'import' ? 'imported' : 'local', resolved: true,
      from: b.kind === 'import' ? b.source : undefined, options, guard,
      alias: canonical !== callee.name ? callee.name : undefined,
    };
    if (guard && b.kind === 'local') { item.localGuard = true; mod.localGuards.push({ name: canonical, line: b.line }); }
    if (guard) item.callNode = node;
    return item;
  }
  const root = rootIdentifier(callee);
  const b = root ? mod.bindings.get(root) : null;
  if (b) trackMiddlewareUse(mod, b);
  const calleeText = slice(mod, callee, 60);
  return { label: `${calleeText}(${argsInfo.text})`, canonical: calleeText, kind: 'member-call', resolved: !!b, from: root ? originOf(mod, root) : null, options };
}

function mwKind(item) {
  if (item.kind === 'inline') return 'inline-handler';
  const f = item.from || '';
  if (f === 'helmet') return 'security-headers';
  if (f === 'cors') return 'cors';
  if (f === 'express-rate-limit') return 'rate-limit';
  if (/^express\.(json|urlencoded|raw|text)\b/.test(item.label)) return 'body-parser';
  if (/^express\.static\b/.test(item.label)) return 'static';
  if (item.canonical === 'errorHandler') return 'error-handler';
  if (item.canonical === 'auditLogger') return 'audit-logger';
  if (item.guard) return 'guard';
  return 'middleware';
}

function publicItem(item) {
  const out = { label: item.label, kind: mwKind(item) };
  if (item.from) out.from = item.from;
  if (item.options) out.options = item.options;
  if (item.factory) out.factory = item.factory;
  if (item.alias) out.alias = item.alias;
  return out;
}

/* ------------------------------------------------------------------------- */
/* Router walk (flattening in registration order)                             */
/* ------------------------------------------------------------------------- */

function resolveRouterTarget(mod, node) {
  if (node.type !== 'Identifier') return null;
  const b = mod.bindings.get(node.name);
  if (!b || b.kind !== 'import' || !b.resolved || b.imported !== '*') return null;
  const tm = analyzeModule(mod.ctx, b.resolved);
  if (!tm.exportedName || !tm.receivers.has(tm.exportedName)) return null;
  if (tm.receivers.get(tm.exportedName) !== 'router') return null;
  trackMiddlewareUse(mod, b);
  return { mod: tm, receiver: tm.exportedName, bindingName: node.name };
}

/** Entries of a receiver, with `setupFrontend(app)`-style escapes expanded inline (root only). */
function expandEntries(mod, receiverName, state, isRoot) {
  const base = mod.entries.filter((e) => e.receiver === receiverName).map((e) => ({ ...e }));
  const items = base.map((e) => ({ pos: e.pos, entry: e }));
  if (isRoot) {
    for (const esc of mod.escapes.filter((x) => x.receiver === receiverName)) {
      const b = esc.calleeName ? mod.bindings.get(esc.calleeName) : null;
      let expanded = false;
      if (b && b.kind === 'import' && b.resolved) {
        const tm = analyzeModule(mod.ctx, b.resolved);
        const fnName = b.imported === '*' ? null : b.imported;
        const fn = tm.ast.program.body.find((s) => s.type === 'FunctionDeclaration' && s.id && s.id.name === fnName);
        const param = fn && fn.params[esc.argIndex];
        if (param && param.type === 'Identifier') {
          const sub = collectEntries(tm, fn.body, new Map([[param.name, 'app']]));
          for (const se of sub.entries) {
            items.push({ pos: esc.pos + se.pos / 1e9, entry: { ...se, via: `${esc.calleeName}() in ${tm.file}`, conditional: true } });
          }
          if (sub.escapes.length) state.oddities.push({ code: 'OPAQUE_REGISTRATION', severity: 'WARN', message: `${tm.file}: receiver passed on to ${sub.escapes.map((x) => x.calleeText).join(', ')}; not analysed (depth limit)` });
          expanded = true;
        }
      }
      state.oddities.push({
        code: 'OPAQUE_REGISTRATION', severity: expanded ? 'INFO' : 'WARN',
        message: `${mod.file}:${esc.line} passes the app object to ${esc.calleeText}(); ` +
          (expanded ? 'its app.use()/route registrations were expanded and are marked conditional (via)' : 'registrations made inside it are NOT visible to this analysis'),
        file: mod.file, line: esc.line,
      });
    }
  } else {
    for (const esc of mod.escapes.filter((x) => x.receiver === receiverName)) {
      state.oddities.push({ code: 'OPAQUE_REGISTRATION', severity: 'WARN', message: `${mod.file}:${esc.line} passes its router to ${esc.calleeText}(); registrations inside are not analysed`, file: mod.file, line: esc.line });
    }
  }
  items.sort((a, b) => a.pos - b.pos);
  return items.map((i) => i.entry);
}

function coversPath(usePath, fullPath) {
  // usePath is a middleware mount prefix; does it cover fullPath (segment-wise prefix)?
  const u = parseSegments(usePath);
  const f = parseSegments(fullPath);
  if (u.length > f.length) return false;
  return segmentsCover(u, f.slice(0, u.length)) === true || u.length === 0;
}

function walkRouter(state, mod, receiverName, prefix, inherited, depth, parentMountRecord) {
  if (state.stack.includes(mod.abs)) {
    state.oddities.push({ code: 'ROUTER_CYCLE', severity: 'ERROR', message: `router cycle through ${mod.file}` });
    return;
  }
  state.stack.push(mod.abs);
  const layerName = depth === 0 ? 'app' : 'file';
  const localMw = []; // { absPath, items, layer }
  const entries = expandEntries(mod, receiverName, state, depth === 0);

  for (const e of entries) {
    state.seq++;
    if (e.type === 'route') {
      const values = e.pathInfo.values || [e.pathInfo.text];
      for (const routePath of values) {
        emitEndpoint(state, mod, e, routePath, prefix, inherited, localMw, parentMountRecord, depth);
      }
      // catch-all routes
      if (values.some((v) => /^\/?(\*|\(\.\*\))$|\/\*$/.test(v) && !e.pathInfo.dynamic)) {
        state.catchAlls.push({ seq: state.seq, kind: 'route', where: `${e.mod.file}:${e.line}`, path: joinPaths(prefix, values[0]) });
      }
      continue;
    }
    // ---- use() ----
    const usePaths = e.pathInfo.values || [];
    if (e.pathInfo.dynamic) {
      state.oddities.push({ code: 'DYNAMIC_USE_PATH', severity: 'WARN', message: `${mod.file}:${e.line} use() has a non-literal path (${e.pathInfo.text}); treated as covering nothing`, file: mod.file, line: e.line });
    }
    let mountItems = [];
    let hasTarget = false;
    for (const h of e.handlers) {
      const target = resolveRouterTarget(e.mod, h);
      if (target) {
        hasTarget = true;
        for (const usePath of usePaths.length ? usePaths : ['/']) {
          const absMount = joinPaths(prefix, usePath);
          const inheritedForChild = [
            ...inherited,
            ...localMw.map((m) => ({ ...m })),
            ...mountItems.map((it) => ({ absPath: absMount, item: it, layer: 'mount', line: e.line })),
          ];
          const rec = {
            order: null, prefix: absMount, routerFile: target.mod.file, routerVar: target.bindingName, depth,
            parentFile: depth === 0 ? null : mod.file, line: e.line, sourceFile: mod.file,
            middleware: mountItems.map(publicItem), endpoints: 0, _startIdx: state.endpoints.length,
          };
          if (depth === 0) rec.order = state.mounts.filter((m) => m.depth === 0).length + 1;
          state.mounts.push(rec);
          if (depth === 0) state.topMountOrder = rec.order;
          walkRouter(state, target.mod, target.receiver, absMount, inheritedForChild, depth + 1, rec);
          if (depth === 0) state.topMountOrder = null;
          rec.endpoints = state.endpoints.length - rec._startIdx;
          delete rec._startIdx;
        }
      } else {
        mountItems = mountItems.concat(describeMiddleware(e.mod, h));
      }
    }
    if (!hasTarget) {
      for (const usePath of usePaths.length ? usePaths : ['/']) {
        const absPath = joinPaths(prefix, usePath);
        localMw.push({ absPath: e.pathInfo.dynamic ? null : absPath, items: mountItems, layer: layerName, line: e.line });
        if (depth === 0) {
          mountItems.forEach((it) => {
            const rec = { order: state.appMiddleware.length + 1, path: e.pathInfo.dynamic ? e.pathInfo.text : absPath, ...publicItem(it), line: e.line, sourceFile: e.mod.file };
            if (e.via) { rec.via = e.via; rec.conditional = true; }
            state.appMiddleware.push(rec);
            if (it.kind === 'inline' && (usePath === '/' || usePath === '') && !e.pathInfo.dynamic) {
              state.catchAlls.push({ seq: state.seq, kind: 'path-less inline app.use()', where: `${e.mod.file}:${e.line}`, path: '/', via: e.via });
            }
          });
        }
      }
    }
  }
  state.stack.pop();
}

function emitEndpoint(state, mod, e, routePath, prefix, inherited, localMw, mountRec, depth) {
  const fullPath = joinPaths(prefix, routePath);
  const flags = [];
  if (e.nested) flags.push('NON_TOPLEVEL_REGISTRATION');
  if (e.pathInfo.dynamic) flags.push('DYNAMIC_PATH');
  if (parseSegments(routePath).some((s) => s.type === 'complex' || s.type === 'wild' || (s.type === 'param' && (s.modifier || s.regex)))) {
    flags.push('COMPLEX_PATH_PATTERN');
  }

  // effective middleware, in order
  const applicable = [];
  for (const m of inherited) {
    if (m.item) { if (coversPath(m.absPath, fullPath)) applicable.push({ layer: m.layer, item: m.item }); }
    else if (m.absPath !== null && coversPath(m.absPath, fullPath)) m.items.forEach((it) => applicable.push({ layer: m.layer, item: it }));
  }
  for (const m of localMw) {
    if (m.absPath !== null && coversPath(m.absPath, fullPath)) m.items.forEach((it) => applicable.push({ layer: m.layer, item: it }));
  }
  const routeItems = e.handlers.flatMap((h) => describeMiddleware(e.mod, h));
  let handlerItem = null;
  if (routeItems.length && !routeItems[routeItems.length - 1].guard) handlerItem = routeItems[routeItems.length - 1];
  const routeMw = handlerItem ? routeItems.slice(0, -1) : routeItems;
  routeMw.forEach((it) => applicable.push({ layer: 'route', item: it }));

  const layers = { app: [], mount: [], file: [], route: [] };
  applicable.forEach(({ layer, item }) => layers[layer].push(item.label));
  const chain = applicable.map(({ item }) => item.label);

  const guardEntries = applicable.filter(({ item }) => item.guard).map(({ item }) => item);
  const guards = guardEntries.map((it) => it.guard.label);
  const idxOf = (name) => guardEntries.findIndex((it) => it.guard.name === name);
  const auth = idxOf('authenticateToken') >= 0;
  const admin = idxOf('requireAdmin') >= 0;
  const roleGuards = guardEntries.filter((it) => it.guard.name === 'requireRole');
  let roles = null;
  if (roleGuards.length) {
    roles = [];
    roleGuards.forEach((it) => { (it.guard.args || []).forEach((r) => { if (!roles.includes(r)) roles.push(r); }); });
    if (roleGuards.some((it) => !it.guard.argsLiteral)) flags.push('NON_LITERAL_ROLES');
  }
  let minTier = null;
  const planGuards = guardEntries.filter((it) => it.guard.name === 'requirePlan');
  if (planGuards.length) {
    const vals = planGuards.map((it) => {
      if (!it.guard.isCall) { flags.push('REQUIREPLAN_NOT_CALLED'); return '<not-called>'; }
      const a = it.guard.args;
      if (a && a.length && typeof a[0] === 'number') return a[0];
      flags.push('NON_LITERAL_MINTIER');
      return it.callNode && it.callNode.arguments[0] ? slice(e.mod, it.callNode.arguments[0], 60) : '<missing-arg>';
    });
    const nums = vals.filter((v) => typeof v === 'number');
    minTier = nums.length === vals.length ? Math.max(...nums) : (vals.find((v) => typeof v === 'string'));
    if (planGuards.length > 1) flags.push('MULTIPLE_PLAN_GUARDS');
  }
  const authIdx = idxOf('authenticateToken');
  const planIdx = idxOf('requirePlan');
  if (planIdx >= 0 && authIdx < 0) flags.push('PLAN_WITHOUT_AUTH');
  else if (planIdx >= 0 && planIdx < authIdx) flags.push('PLAN_BEFORE_AUTH');
  const adminIdx = idxOf('requireAdmin');
  if (adminIdx >= 0 && authIdx < 0) flags.push('ADMIN_WITHOUT_AUTH');
  else if (adminIdx >= 0 && adminIdx < authIdx) flags.push('ADMIN_BEFORE_AUTH');
  applicable.forEach(({ item }) => {
    if (!item.resolved) flags.push(`UNRESOLVED_MIDDLEWARE:${item.label}`);
    if (item.localGuard) flags.push(`LOCAL_GUARD_DEFINITION:${item.guard.name}`);
    if (item.guard && item.alias) flags.push(`ALIASED_GUARD:${item.alias}->${item.guard.name}`);
  });
  const lastArg = e.handlers[e.handlers.length - 1];
  if (!auth && lastArg && functionUsesReqUser(lastArg)) flags.push('REQ_USER_WITHOUT_AUTH');
  if (handlerItem && !handlerItem.resolved) flags.push(`UNRESOLVED_MIDDLEWARE:${handlerItem.label}`);

  state.endpoints.push({
    id: `${e.method} ${fullPath}`,
    method: e.method,
    path: fullPath,
    auth, admin, roles, minTier,
    guards,
    chain,
    layers,
    handler: handlerItem ? handlerItem.label : null,
    routePath,
    mountPrefix: mountRec ? mountRec.prefix : null,
    mountOrder: state.topMountOrder === undefined ? null : state.topMountOrder,
    routerFile: mountRec ? mountRec.routerFile : null,
    order: state.endpoints.length + 1,
    sourceFile: e.mod.file,
    line: e.line,
    flags: Array.from(new Set(flags)),
    _seq: state.seq,
    _callsNext: functionCallsNext(lastArg),
    _mountRec: mountRec,
  });
}

/* ------------------------------------------------------------------------- */
/* Analyses: shadowing, duplicates, counts                                    */
/* ------------------------------------------------------------------------- */

function analyseShadowing(endpoints, oddities) {
  for (let j = 0; j < endpoints.length; j++) {
    const b = endpoints[j];
    if (b.flags.includes('DYNAMIC_PATH')) continue;
    const bSegs = parseSegments(b.path);
    for (let i = 0; i < j; i++) {
      const a = endpoints[i];
      if (a.flags.includes('DYNAMIC_PATH')) continue;
      if (a.method !== b.method && a.method !== 'ALL') continue;
      const aSegs = parseSegments(a.path);
      const identical = canonicalizePath(a.path) === canonicalizePath(b.path);
      const covered = identical ? true : segmentsCover(aSegs, bSegs);
      if (!covered) continue;
      const certainty = a._callsNext ? 'possible' : 'definite';
      const sameFile = a.sourceFile === b.sourceFile;
      oddities.push({
        code: identical ? 'DUPLICATE_ROUTE' : 'SHADOWED_ROUTE',
        severity: certainty === 'definite' ? 'WARN' : 'INFO',
        message: identical
          ? `${b.method} ${b.path} (${b.sourceFile}:${b.line}) is registered again after ${a.sourceFile}:${a.line}` + (sameFile ? ' (same file)' : ' (different file)') + `; the later registration is unreachable unless the earlier handler calls next() [${certainty}]`
          : `${b.method} ${b.path} (${b.sourceFile}:${b.line}) is shadowed by earlier ${a.method} ${a.path} (${a.sourceFile}:${a.line}) whose :param matches it [${certainty}]`,
        earlier: { id: a.id, file: a.sourceFile, line: a.line, auth: a.auth, minTier: a.minTier },
        later: { id: b.id, file: b.sourceFile, line: b.line, auth: b.auth, minTier: b.minTier },
        crossFile: !sameFile,
        certainty,
        guardsDiffer: a.auth !== b.auth || String(a.minTier) !== String(b.minTier) || a.admin !== b.admin,
      });
    }
  }
}

/* ------------------------------------------------------------------------- */
/* Build                                                                      */
/* ------------------------------------------------------------------------- */

function generateManifest(opts = {}) {
  const backendDir = path.resolve(opts.backendDir || path.join(__dirname, '..', '..'));
  const ctx = createContext(backendDir);
  const state = {
    endpoints: [], mounts: [], appMiddleware: [], oddities: [], catchAlls: [], stack: [], seq: 0, topMountOrder: null,
  };

  const appMod = analyzeModule(ctx, ctx.entryFile);
  const rootName = [...appMod.receivers.entries()].find(([, k]) => k === 'app');
  if (!rootName) throw new Error('No express() app found in ' + appMod.file);
  walkRouter(state, appMod, rootName[0], '', [], 0, null);


  // ---- per-file summary ------------------------------------------------------
  const routeFilesOnDisk = fs.readdirSync(ctx.routesDir).filter((f) => f.endsWith('.js')).sort();
  const files = routeFilesOnDisk.map((name) => {
    const abs = path.join(ctx.routesDir, name);
    const mod = analyzeModule(ctx, abs);
    const eps = state.endpoints.filter((e) => e.sourceFile === mod.file);
    const tiers = {};
    eps.filter((e) => e.minTier !== null).forEach((e) => { tiers[String(e.minTier)] = (tiers[String(e.minTier)] || 0) + 1; });
    const lineMentions = mod.code.split(/\r?\n/).filter((l) => /requirePlan\(/.test(l)).length;
    const fileLevelUses = mod.entries.filter((x) => x.type === 'use').map((x) => `use(${x.handlers.map((h) => describeMiddleware(mod, h).map((d) => d.label).join(',')).join(',')}) @${x.line}`);
    const mountedAt = state.mounts.filter((m) => m.routerFile === mod.file).map((m) => m.prefix);
    return {
      file: mod.file,
      mountedAt,
      endpoints: eps.length,
      authenticated: eps.filter((e) => e.auth).length,
      public: eps.filter((e) => !e.auth).length,
      requirePlanCallSites: mod.requirePlanSites.length,
      requirePlanEndpoints: eps.filter((e) => e.minTier !== null).length,
      tiers,
      adminEndpoints: eps.filter((e) => e.admin).length,
      roleGuardedEndpoints: eps.filter((e) => e.roles).length,
      fileLevelUse: fileLevelUses,
      localGuardDefinitions: mod.localGuards.filter((g, i, a) => a.findIndex((x) => x.name === g.name && x.line === g.line) === i),
      _requirePlanLineMentions: lineMentions,
    };
  });

  // ---- sanity numbers vs ADR ---------------------------------------------------
  const mountedRouteFiles = new Set(state.mounts.map((m) => m.routerFile));
  const rpFiles = files.filter((f) => f.requirePlanCallSites > 0);
  const rpSites = files.reduce((n, f) => n + f.requirePlanCallSites, 0);
  const routeFileEndpoints = state.endpoints.filter((e) => e.sourceFile.startsWith(ctx.rel(ctx.routesDir) + '/')).length;
  const topMounts = state.mounts.filter((m) => m.depth === 0);
  const checks = [];
  const check = (name, expected, actual) => checks.push({ name, expected, actual, match: expected === actual });
  check('route files on disk (src/routes/*.js)', ADR_EXPECTED.routeFiles, routeFilesOnDisk.length);
  check('route files mounted from app.js', ADR_EXPECTED.routeFiles, mountedRouteFiles.size);
  check('endpoints defined in route files', ADR_EXPECTED.endpoints, routeFileEndpoints);
  check('mount points (app.use(prefix, router))', ADR_EXPECTED.mountPoints, topMounts.length);
  check('route files using requirePlan', ADR_EXPECTED.requirePlanFiles, rpFiles.length);
  check('requirePlan(...) call sites (AST)', ADR_EXPECTED.requirePlanCallSites, rpSites);
  for (const [fname, n] of Object.entries(ADR_EXPECTED.perFileRequirePlan)) {
    const f = files.find((x) => x.file.endsWith('/' + fname));
    check(`requirePlan call sites in ${fname}`, n, f ? f.requirePlanCallSites : 0);
  }
  // Reproduce how the ADR probably counted: text-search line counts of "requirePlan(" (comments included)
  // per route file, plus the definition line in src/middleware/requirePlan.js.
  const adrStyle = {};
  files.filter((f) => f._requirePlanLineMentions > 0).forEach((f) => { adrStyle[path.basename(f.file)] = f._requirePlanLineMentions; });
  let defLines = 0;
  if (fs.existsSync(ctx.middlewareDir)) {
    for (const f of fs.readdirSync(ctx.middlewareDir).filter((x) => x.endsWith('.js'))) {
      defLines += fs.readFileSync(path.join(ctx.middlewareDir, f), 'utf8').split(/\r?\n/).filter((l) => /requirePlan\(/.test(l)).length;
    }
  }
  const adrStyleTotal = Object.values(adrStyle).reduce((a, b) => a + b, 0) + defLines;
  const adrStyleMatchesPerFile = Object.entries(ADR_EXPECTED.perFileRequirePlan).every(([k, v]) => adrStyle[k] === v);

  const routeModules = [...ctx.modules.values()].filter((mm) => mm.file.startsWith(ctx.rel(ctx.routesDir) + '/'));
  const eps = state.endpoints;
  const appDirect = eps.filter((e) => !e.sourceFile.startsWith(ctx.rel(ctx.routesDir) + '/'));

  // ---- oddities ----------------------------------------------------------------
  const oddities = state.oddities.slice();
  analyseShadowing(eps, oddities);

  // routes after catch-all
  for (const ca of state.catchAlls) {
    const after = eps.filter((e) => e._seq > ca.seq);
    oddities.push({
      code: 'ROUTES_AFTER_CATCH_ALL',
      severity: after.length ? 'WARN' : 'INFO',
      message: `${ca.kind} at ${ca.where}${ca.via ? ` (registered via ${ca.via})` : ''}: ${after.length} route(s) registered after it` +
        (after.length ? `: ${after.slice(0, 8).map((e) => e.id).join(', ')}` : ''),
      catchAll: ca, routesAfter: after.map((e) => e.id),
    });
  }

  // multi-file prefixes and nested prefixes
  const byPrefix = new Map();
  topMounts.forEach((m) => { if (!byPrefix.has(m.prefix)) byPrefix.set(m.prefix, []); byPrefix.get(m.prefix).push(m); });
  const sharedPrefixGroups = [...byPrefix.entries()].filter(([, ms]) => ms.length > 1)
    .map(([prefix, ms]) => ({ prefix, files: ms.map((m) => m.routerFile), mountOrders: ms.map((m) => m.order) }));
  sharedPrefixGroups.forEach((g) => {
    g.files.forEach((f, i) => { topMounts.filter((m) => m.prefix === g.prefix && m.routerFile === f)[0].sharedPrefixWith = g.files.filter((_, k) => k !== i); });
    oddities.push({ code: 'MULTI_FILE_PREFIX', severity: 'INFO', message: `${g.prefix} is shared by ${g.files.length} route files (mount orders ${g.mountOrders.join(', ')}): ${g.files.join(', ')}`, group: g });
  });
  const nestedPrefixMounts = [];
  topMounts.forEach((m) => {
    topMounts.filter((o) => o !== m && m.prefix.startsWith(o.prefix + '/') && o.order < m.order)
      .forEach((o) => nestedPrefixMounts.push({ mount: m.prefix, insidePrefix: o.prefix, file: m.routerFile }));
  });
  [...new Map(nestedPrefixMounts.map((n) => [n.mount + '|' + n.insidePrefix, n])).values()].forEach((n) => {
    oddities.push({ code: 'NESTED_PREFIX_MOUNT', severity: 'INFO', message: `${n.mount} (${n.file}) is mounted after, and inside the namespace of, ${n.insidePrefix}; earlier ${n.insidePrefix} routes with params/wildcards are checked for shadowing`, nested: n });
  });

  // aggregate endpoint flags
  const flagAgg = {};
  eps.forEach((e) => e.flags.forEach((f) => { const code = f.split(':')[0]; (flagAgg[code] = flagAgg[code] || []).push(e.id + (f.includes(':') ? ` [${f.slice(code.length + 1)}]` : '')); }));
  Object.entries(flagAgg).forEach(([code, list]) => {
    const sev = ['PLAN_WITHOUT_AUTH', 'PLAN_BEFORE_AUTH', 'ADMIN_WITHOUT_AUTH', 'ADMIN_BEFORE_AUTH', 'NON_LITERAL_MINTIER', 'UNRESOLVED_MIDDLEWARE', 'REQUIREPLAN_NOT_CALLED', 'NON_TOPLEVEL_REGISTRATION', 'DYNAMIC_PATH'].includes(code) ? 'WARN' : 'INFO';
    oddities.push({ code: 'ENDPOINT_FLAG_' + code, severity: sev, message: `${list.length} endpoint(s) flagged ${code}`, endpoints: list });
  });

  // unused guard middleware (defined in src/middleware, never wired to a route/app)
  const mwInventory = [];
  if (fs.existsSync(ctx.middlewareDir)) {
    for (const f of fs.readdirSync(ctx.middlewareDir).filter((x) => x.endsWith('.js')).sort()) {
      const mm = analyzeModule(ctx, path.join(ctx.middlewareDir, f));
      const names = [];
      for (const stmt of mm.ast.program.body) {
        if (stmt.type === 'ExpressionStatement' && stmt.expression.type === 'AssignmentExpression'
          && stmt.expression.right.type === 'ObjectExpression') {
          const l = stmt.expression.left;
          if (l.type === 'MemberExpression' && l.object.name === 'module' && l.property.name === 'exports') {
            stmt.expression.right.properties.forEach((p) => { if (p.key && p.key.name) names.push(p.key.name); });
          }
        }
      }
      names.forEach((n) => mwInventory.push({ file: mm.file, name: n, usedByRoutesOrApp: ctx.usedMiddleware.has(mm.file + '#' + n), guardLike: GUARD_NAME_RE.test(n) }));
    }
    mwInventory.filter((m) => !m.usedByRoutesOrApp && m.guardLike).forEach((m) => {
      oddities.push({ code: 'UNUSED_GUARD_MIDDLEWARE', severity: 'WARN', message: `${m.file} exports guard "${m.name}" but no route file or app.js applies it (it protects nothing)`, middleware: m });
    });
  }

  // clean internals
  eps.forEach((e) => { delete e._seq; delete e._callsNext; delete e._mountRec; });
  const cleanFiles = files.map((f) => { const c = { ...f }; delete c._requirePlanLineMentions; return c; });

  const publicEps = eps.filter((e) => !e.auth);
  const manifest = {
    schema: SCHEMA,
    generator: {
      script: 'backend/scripts/migration/generate-manifest.js',
      parser: '@babel/parser ' + require('@babel/parser/package.json').version,
      entry: ctx.rel(ctx.entryFile),
      routeGlob: ctx.rel(ctx.routesDir) + '/*.js',
      note: 'Derived purely from static analysis of source; no code executed. Output is deterministic for a given source tree.',
    },
    counts: {
      routeFiles: routeFilesOnDisk.length,
      routeFilesMounted: mountedRouteFiles.size,
      mountPoints: topMounts.length,
      nestedMounts: state.mounts.length - topMounts.length,
      endpointsInRouteFiles: routeFileEndpoints,
      endpointsDirectOnApp: appDirect.length,
      endpointsTotal: eps.length,
      authenticated: eps.filter((e) => e.auth).length,
      public: publicEps.length,
      adminGuarded: eps.filter((e) => e.admin).length,
      roleGuarded: eps.filter((e) => e.roles).length,
      planGated: eps.filter((e) => e.minTier !== null).length,
      planGatedByTier: eps.filter((e) => e.minTier !== null).reduce((a, e) => { a[String(e.minTier)] = (a[String(e.minTier)] || 0) + 1; return a; }, {}),
      requirePlanFiles: rpFiles.length,
      requirePlanCallSites: rpSites,
      requirePlanCallSitesLiteral: routeModules.reduce((n, m) => n + m.requirePlanSites.filter((x) => x.literal).length, 0),
    },
    sanity: {
      adr: 'docs/migration/ADR-001-cloudflare-workers-port.md sections 0/6.3',
      allMatch: checks.every((c) => c.match),
      checks,
      adrCountingMethodReproduction: {
        hypothesis: 'ADR numbers = text-search line counts of "requirePlan(" (JSDoc header / section-comment mentions included) per route file, plus the 1 definition line in src/middleware/requirePlan.js; these are NOT real call sites',
        perFile: adrStyle,
        middlewareDefinitionLines: defLines,
        total: adrStyleTotal,
        matchesAdrPerFileNumbers: adrStyleMatchesPerFile,
        matchesAdrTotal: adrStyleTotal === ADR_EXPECTED.requirePlanCallSites,
      },
    },
    appMiddleware: state.appMiddleware,
    mounts: state.mounts,
    files: cleanFiles,
    middlewareInventory: mwInventory,
    endpoints: eps,
    oddities,
  };
  if (opts.gitInfo) manifest.generator.git = opts.gitInfo;
  else if (opts.git) manifest.generator.git = collectGitInfo(ctx);
  return manifest;
}

// Export the committed .js files under backend/src at HEAD into a temp dir (read-only git plumbing).
function exportHead(repoDir) {
  const git = (args, enc) => execFileSync('git', args, { cwd: repoDir, encoding: enc, maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
  const head = git(['rev-parse', 'HEAD'], 'utf8').trim();
  const names = git(['ls-tree', '-r', '--name-only', 'HEAD', '--', 'backend/src'], 'utf8').split(/\r?\n/).map((n) => n.trim()).filter((n) => n.endsWith('.js'));
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jobtune-head-'));
  for (const n of names) {
    const dest = path.join(tmp, ...n.split('/'));
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, git(['show', 'HEAD:' + n], null));
  }
  return { tmp, backendDir: path.join(tmp, 'backend'), head };
}

function collectGitInfo(ctx) {
  const info = {};
  try {
    info.head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ctx.repoDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    const st = execFileSync('git', ['status', '--porcelain', '--', 'backend/src'], { cwd: ctx.repoDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    info.uncommittedUnderBackendSrc = st.split(/\r?\n/).filter(Boolean).map((l) => l.trim());
  } catch (e) { info.unavailable = true; }
  return info;
}

/* ------------------------------------------------------------------------- */
/* Markdown                                                                   */
/* ------------------------------------------------------------------------- */

function esc(s) { return String(s).replace(/\|/g, '\\|'); }
function table(headers, rows) {
  const out = ['| ' + headers.join(' | ') + ' |', '| ' + headers.map(() => '---').join(' | ') + ' |'];
  rows.forEach((r) => out.push('| ' + r.map(esc).join(' | ') + ' |'));
  return out.join('\n');
}
const short = (f) => f.replace(/^backend\/src\//, '');

function renderMarkdown(m) {
  const L = [];
  const c = m.counts;
  L.push('# Render/Express endpoint manifest (reference)');
  L.push('');
  L.push('> GENERATED FILE - do not edit. Regenerate with `node backend/scripts/migration/generate-manifest.js` (run from `backend/`).');
  L.push('> Source of truth: static AST analysis of `backend/src/app.js` and `backend/src/routes/*.js`. Machine-readable twin: `docs/migration/manifest.render.json`.');
  L.push('> Purpose: ADR-001 T4.1 / section 6.3 - the reference artifact that the Workers manifest is diffed against (`backend/scripts/migration/compare-manifests.js`).');
  if (m.generator.git) {
    L.push('');
    const g = m.generator.git;
    const dirty = g.uncommittedUnderBackendSrc || [];
    if (g.source) {
      L.push(`Generated from git commit \`${(g.head || 'unknown').slice(0, 10)}\` only (${g.source}).`);
    } else {
      L.push(`Generated from the working tree on top of git HEAD \`${(g.head || 'unknown').slice(0, 10)}\`; uncommitted paths under \`backend/src\` at generation time: ${dirty.length ? dirty.map((x) => '`' + x + '`').join(', ') : 'none'}. ` +
        'Route/mount/guard changes among them are part of this manifest; use `--from-head` to see the committed baseline (the ADR numbers were measured at a committed state).');
    }
  }
  L.push('');
  L.push('## 1. Headline counts and ADR reconciliation');
  L.push('');
  L.push(table(['Measure', 'ADR-001', 'Derived from source', 'Result'],
    m.sanity.checks.map((k) => [k.name, k.expected, k.actual, k.match ? 'match' : '**MISMATCH**'])));
  L.push('');
  L.push(`Other counts: ${c.endpointsTotal} endpoints total (${c.endpointsInRouteFiles} in route files + ${c.endpointsDirectOnApp} registered directly on \`app\`), ` +
    `${c.authenticated} authenticated, **${c.public} public (no authenticateToken)**, ${c.adminGuarded} requireAdmin, ${c.roleGuarded} requireRole, ` +
    `${c.planGated} plan-gated endpoints (by tier: ${Object.entries(c.planGatedByTier).map(([k, v]) => `tier ${k}: ${v}`).join(', ') || 'none'}), ${c.nestedMounts} router-on-router mounts.`);
  const rep = m.sanity.adrCountingMethodReproduction;
  L.push('');
  L.push(`ADR counting-method check: the ADR's per-file requirePlan numbers (community 14, aiCoach 11, ...) ${rep.matchesAdrPerFileNumbers ? '**are exactly reproduced**' : 'are not reproduced'} by counting TEXT LINES that contain \`requirePlan(\` ` +
    `(per route file, JSDoc header and section comments included) and the ADR total is ${rep.matchesAdrTotal ? '**exactly reproduced**' : 'not reproduced'} when the ${rep.middlewareDefinitionLines} definition line in \`middleware/requirePlan.js\` is added (total ${rep.total}). ` +
    `Comment lines and the definition are not call sites, so the real, AST-counted number of \`requirePlan(...)\` call sites is **${c.requirePlanCallSites}** (all with literal arguments: ${c.requirePlanCallSitesLiteral}).`);
  L.push('');
  L.push('## 2. Schema (for the Workers-side extractor)');
  L.push('');
  L.push('The JSON has a top-level `schema` field with the same content. The comparator needs only `method`, `path`, `auth` (required) and `admin`, `roles`, `minTier`, `guards` (optional, defaults false / null / null / []). Everything else is informational.');
  L.push('');
  L.push(table(['Endpoint field', 'Meaning'], Object.entries(m.schema.endpointFields).map(([k, v]) => ['`' + k + '`', v])));
  L.push('');
  L.push('Keying: ' + m.schema.keying);
  L.push('');
  L.push('Hono note: ' + m.schema.workersExtractionHint);
  L.push('');
  L.push('Comparator severities: CRITICAL (exit 2) = auth / admin / role guard dropped or widened, minTier dropped or lowered on the candidate; ERROR (exit 1) = missing / extra endpoint (extras allowed with `--allow-extra-in-candidate`), method mismatch, guard or tier added / raised, unverifiable minTier, missing guard; WARN / INFO = advisory.');
  L.push('');
  L.push('## 3. Middleware applied at app level (in registration order)');
  L.push('');
  L.push(table(['#', 'Path', 'Kind', 'Middleware', 'Options', 'Line'],
    m.appMiddleware.map((a) => [a.order, a.path, a.kind, a.label + (a.via ? ` (via ${a.via})` : ''),
      a.options ? Object.entries(a.options).map(([k, v]) => `${k}: ${v}`).join('; ') : '', `${short(a.sourceFile)}:${a.line}`])));
  L.push('');
  L.push('`app.use(prefix, ...)` layers cover every route under the prefix that is registered after them. `app.use(express.static(...))` / the SSR handler are non-API surface; the SSR handler skips `/api` and `/admin` by an internal `req.path.startsWith` check (not statically provable, see section 7).');
  L.push('');
  L.push('## 4. Mount table (order matters: Express matches in this order)');
  L.push('');
  L.push(table(['#', 'Prefix', 'Route file', 'Mount-level middleware', 'Endpoints', 'Shares prefix with', 'app.js line'],
    m.mounts.filter((x) => x.depth === 0).map((x) => [x.order, x.prefix, short(x.routerFile), x.middleware.map((mw) => mw.label + (mw.options ? ` {${Object.entries(mw.options).map(([k, v]) => `${k}: ${v}`).join('; ')}}` : '')).join(', ') || '-',
      x.endpoints, (x.sharedPrefixWith || []).map(short).join(', ') || '-', x.line])));
  const nested = m.mounts.filter((x) => x.depth > 0);
  if (nested.length) {
    L.push('');
    L.push('Router-on-router mounts:');
    L.push('');
    L.push(table(['Prefix', 'Route file', 'Parent', 'Line'], nested.map((x) => [x.prefix, short(x.routerFile), short(x.parentFile), x.line])));
  }
  L.push('');
  const topM = m.mounts.filter((x) => x.depth === 0);
  topM.forEach((x) => {
    const outer = topM.filter((o) => o.order < x.order && x.prefix.startsWith(o.prefix + '/'));
    if (outer.length) {
      L.push('');
      const outerText = outer.map((o) => '`' + o.prefix + '` #' + o.order).join(', ');
      L.push('Nested-prefix mount: `' + x.prefix + '` (mount #' + x.order + ', ' + short(x.routerFile) + ') is registered by app.js after ' + outer.length +
        ' mount(s) whose prefix contains it (' + outerText + '); it is a sibling app.use() mount, not a router nested inside a router.');
    }
  });
  L.push('');
  L.push('## 5. Per route file');
  L.push('');
  L.push(table(['Route file', 'Mounted at', 'Endpoints', 'Auth', 'Public', 'requirePlan sites', 'Tiers (endpoints)', 'Admin', 'Role', 'File-level use()'],
    m.files.map((f) => [short(f.file), f.mountedAt.join(', ') || '(not mounted)', f.endpoints, f.authenticated, f.public, f.requirePlanCallSites,
      Object.entries(f.tiers).map(([k, v]) => `T${k}:${v}`).join(' ') || '-', f.adminEndpoints || '-', f.roleGuardedEndpoints || '-', f.fileLevelUse.join('; ') || '-'])));
  L.push('');
  L.push(`Totals: ${m.files.reduce((n, f) => n + f.endpoints, 0)} endpoints, ${m.files.reduce((n, f) => n + f.authenticated, 0)} authenticated, ${m.files.reduce((n, f) => n + f.public, 0)} public, ${m.files.reduce((n, f) => n + f.requirePlanCallSites, 0)} requirePlan call sites in ${m.files.filter((f) => f.requirePlanCallSites).length} files.`);
  L.push('');
  const pub = m.endpoints.filter((e) => !e.auth);
  L.push(`## 6. Public surface: endpoints with NO authenticateToken (${pub.length})`);
  L.push('');
  L.push('These are reachable without a JWT (subject only to the global `/api` rate limiter and, for `/api/auth`, the auth limiter). Any that read `req.user` are flagged REQ_USER_WITHOUT_AUTH.');
  L.push('');
  L.push(table(['#', 'Method', 'Path', 'Source', 'Notes'], pub.map((e, i) => [i + 1, e.method, e.path, `${short(e.sourceFile)}:${e.line}`, e.flags.filter((f) => /REQ_USER|UNRESOLVED/.test(f)).join(', ')])));
  const mixed = m.files.filter((f) => f.public > 0 && f.authenticated > 0).map((f) => `${short(f.file)} (${f.public} public / ${f.authenticated} authenticated)`);
  L.push('');
  L.push(mixed.length ? `Files that mix public and authenticated endpoints (worth a human glance for accidental omissions): ${mixed.join('; ')}.` : 'No file mixes public and authenticated endpoints.');
  L.push('');
  L.push('## 7. Oddities');
  L.push('');
  const sect = (title, items) => { L.push(`### ${title}`); L.push(''); if (!items.length) L.push('None.'); else items.forEach((i) => L.push('- ' + i)); L.push(''); };
  const od = (code) => m.oddities.filter((o) => o.code === code);
  sect('Duplicate route registrations (same method + path)', od('DUPLICATE_ROUTE').map((o) => `[${o.severity}] ${o.message}` + (o.guardsDiffer ? ' **guards differ between the two registrations**' : '')));
  sect('Routes shadowed by an earlier :param route', od('SHADOWED_ROUTE').map((o) => `[${o.severity}] ${o.message}` + (o.guardsDiffer ? ' **guards differ**' : '')));
  sect('Catch-alls and routes registered after them', od('ROUTES_AFTER_CATCH_ALL').map((o) => `[${o.severity}] ${o.message}`));
  sect('Prefixes shared by several route files / nested prefixes', [...od('MULTI_FILE_PREFIX'), ...od('NESTED_PREFIX_MOUNT')].map((o) => o.message));
  sect('Opaque registrations (not fully resolvable statically)', od('OPAQUE_REGISTRATION').map((o) => `[${o.severity}] ${o.message}`));
  sect('Guard middleware that protects nothing', od('UNUSED_GUARD_MIDDLEWARE').map((o) => o.message));
  const flagged = m.oddities.filter((o) => o.code.startsWith('ENDPOINT_FLAG_'));
  sect('Endpoint-level flags', flagged.map((o) => `[${o.severity}] ${o.message}: ${o.endpoints.slice(0, 12).join('; ')}${o.endpoints.length > 12 ? `; ... (+${o.endpoints.length - 12})` : ''}`));
  const unresolved = m.endpoints.filter((e) => e.flags.some((f) => f.startsWith('UNRESOLVED_MIDDLEWARE')));
  sect('Endpoints whose middleware chain could not be fully resolved statically', unresolved.map((e) => `${e.id} (${short(e.sourceFile)}:${e.line}): ${e.flags.filter((f) => f.startsWith('UNRESOLVED')).join(', ')}`));
  L.push('## 8. Plan-gated endpoints (minTier)');
  L.push('');
  L.push(table(['Method', 'Path', 'minTier', 'Guards', 'Source'], m.endpoints.filter((e) => e.minTier !== null).map((e) => [e.method, e.path, e.minTier, e.guards.join(' > '), `${short(e.sourceFile)}:${e.line}`])));
  L.push('');
  return L.join('\n');
}

/* ------------------------------------------------------------------------- */
/* CLI                                                                        */
/* ------------------------------------------------------------------------- */

function printSummary(m, log) {
  log('== Manifest generation summary ==');
  const c = m.counts;
  log(`route files: ${c.routeFiles} on disk, ${c.routeFilesMounted} mounted | mount points: ${c.mountPoints} (+${c.nestedMounts} nested)`);
  log(`endpoints: ${c.endpointsTotal} (${c.endpointsInRouteFiles} in route files + ${c.endpointsDirectOnApp} on app) | auth ${c.authenticated} | public ${c.public} | admin ${c.adminGuarded} | role ${c.roleGuarded} | plan-gated ${c.planGated} ${JSON.stringify(c.planGatedByTier)}`);
  log('');
  log('ADR-001 reconciliation:');
  const w = Math.max(...m.sanity.checks.map((k) => k.name.length));
  m.sanity.checks.forEach((k) => log(`  ${k.name.padEnd(w)}  ADR=${String(k.expected).padStart(4)}  found=${String(k.actual).padStart(4)}  ${k.match ? 'OK' : 'MISMATCH'}`));
  const rep = m.sanity.adrCountingMethodReproduction;
  log(`  ADR counting-method reproduction (text lines containing "requirePlan(", comments + ${rep.middlewareDefinitionLines} definition line): total=${rep.total}, per-file match=${rep.matchesAdrPerFileNumbers}, total match=${rep.matchesAdrTotal}`);
  log('');
  log('Per-file summary:');
  const rows = m.files.map((f) => [path.basename(f.file), f.mountedAt.join(','), f.endpoints, f.authenticated, f.public, f.requirePlanCallSites, Object.entries(f.tiers).map(([k, v]) => `T${k}:${v}`).join(' ')]);
  const hdr = ['file', 'mounted at', 'eps', 'auth', 'public', 'reqPlan', 'tiers'];
  const widths = hdr.map((h, i) => Math.max(h.length, ...rows.map((r) => String(r[i]).length)));
  const fmt = (r) => '  ' + r.map((v, i) => String(v).padEnd(widths[i])).join('  ');
  log(fmt(hdr));
  rows.forEach((r) => log(fmt(r)));
}

function parseArgs(argv) {
  const o = { write: true, assert: true, check: false, quiet: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--no-write') o.write = false;
    else if (a === '--no-assert') o.assert = false;
    else if (a === '--check') { o.check = true; o.write = false; }
    else if (a === '--quiet') o.quiet = true;
    else if (a === '--json') o.json = argv[++i];
    else if (a === '--md') o.md = argv[++i];
    else if (a === '--backend-dir') o.backendDir = argv[++i];
    else if (a === '--from-head') o.fromHead = true;
    else if (a === '-h' || a === '--help') o.help = true;
    else throw new Error('Unknown option ' + a);
  }
  return o;
}

function main(argv) {
  let o;
  try { o = parseArgs(argv); } catch (e) { console.error(e.message); return 1; }
  if (o.help) { console.log(fs.readFileSync(__filename, 'utf8').split('*/')[0]); return 0; }
  let backendDir = path.resolve(o.backendDir || path.join(__dirname, '..', '..'));
  const repoDir = path.resolve(backendDir, '..');
  let gitInfo = null;
  let headExport = null;
  if (o.fromHead) {
    headExport = exportHead(repoDir);
    backendDir = headExport.backendDir;
    gitInfo = { head: headExport.head, uncommittedUnderBackendSrc: [], source: 'git HEAD only (working tree ignored)' };
  }
  const jsonPath = path.resolve(o.json || path.join(repoDir, 'docs', 'migration', 'manifest.render.json'));
  const mdPath = path.resolve(o.md || path.join(repoDir, 'docs', 'migration', 'manifest.render.md'));
  let manifest;
  try {
    manifest = generateManifest({ backendDir, git: !o.backendDir, gitInfo });
  } finally {
    if (headExport) fs.rmSync(headExport.tmp, { recursive: true, force: true });
  }
  const log = o.quiet ? () => {} : console.log;
  printSummary(manifest, log);
  const jsonText = JSON.stringify(manifest, null, 2) + '\n';
  if (o.check) {
    let stale = true;
    try {
      // git provenance (uncommitted-file list) changes with unrelated work; ignore it when checking staleness
      const strip = (obj) => { const c = JSON.parse(JSON.stringify(obj)); delete c.generator.git; return JSON.stringify(c); };
      stale = strip(JSON.parse(fs.readFileSync(jsonPath, 'utf8'))) !== strip(manifest);
    } catch (e) { /* missing or unreadable -> stale */ }
    console.log(stale ? `STALE: ${jsonPath} differs from a fresh generation` : `up to date: ${jsonPath}`);
    return stale ? 4 : 0;
  }
  if (o.write) {
    fs.mkdirSync(path.dirname(jsonPath), { recursive: true });
    fs.writeFileSync(jsonPath, jsonText);
    fs.writeFileSync(mdPath, renderMarkdown(manifest).replace(/\r?\n/g, '\n') + '\n');
    log(`\nwrote ${jsonPath}\nwrote ${mdPath}`);
  }
  if (o.assert && !manifest.sanity.allMatch) {
    console.error('\nDISCREPANCY: at least one derived count differs from the ADR (see MISMATCH lines above)' + (o.write ? '; outputs were still written' : '') + '. The ADR numbers were NOT forced.');
    return 3;
  }
  return 0;
}

module.exports = { generateManifest, renderMarkdown, analyseShadowing, ADR_EXPECTED, SCHEMA, SCHEMA_VERSION };

if (require.main === module) process.exitCode = main(process.argv.slice(2));
