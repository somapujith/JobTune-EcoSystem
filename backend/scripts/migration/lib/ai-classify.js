'use strict';

/**
 * Static classifier: which reference-manifest endpoints call the AI model (cost + non-determinism)?
 *
 * The manifest says where each endpoint is registered (sourceFile + line). This module reads the EXPRESS source
 * (read-only, nothing executed) and decides, per endpoint, whether its handler can reach an AI call:
 *   1. "AI modules": src files that require utils/aiClient or utils/embeddings, plus (transitively) every src file that
 *      requires an AI module (e.g. services that call callAI, and services that use those services).
 *   2. In a route file, names imported from AI modules are "AI names"; top-level functions that mention an AI name
 *      (or another AI function) are "AI functions" (fixpoint).
 *   3. An endpoint is AI when its registration call (middleware + handler) mentions an AI name or an AI function,
 *      or names a top-level handler function that does.
 * Fail-safe: an endpoint that cannot be located or a source that cannot be parsed is reported as AI ("unclassified"),
 * so it is skipped unless the operator opts in with --include-ai. The same for `--treat-as-ai <substring>` overrides.
 *
 * This is a heuristic, not a proof: a handler that reaches the model through a dynamic call it cannot see is missed,
 * which is why AI-invoking endpoints are ALSO skipped by default for mutating methods (POST/PUT/PATCH need --allow-writes).
 */

const fs = require('fs');
const path = require('path');

let parser = null;
try { parser = require('@babel/parser'); } catch (e) { parser = null; }

const AI_ROOTS = [/[\\/]utils[\\/]aiClient(\.js)?$/, /[\\/]utils[\\/]embeddings(\.js)?$/];

function resolveRequire(fromFile, source) {
  if (!source.startsWith('.')) return null;
  const base = path.resolve(path.dirname(fromFile), source);
  for (const c of [base, base + '.js', path.join(base, 'index.js')]) {
    try { if (fs.statSync(c).isFile()) return c; } catch (e) { /* next */ }
  }
  return null;
}

function listSrcFiles(dir, acc = []) {
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return acc; }
  for (const d of entries) {
    const p = path.join(dir, d.name);
    if (d.isDirectory()) { if (d.name !== 'worker' && d.name !== 'node_modules') listSrcFiles(p, acc); } else if (d.name.endsWith('.js')) acc.push(p);
  }
  return acc;
}

/** Set of absolute file paths under backend/src that can reach the model. */
function findAiModules(srcDir) {
  const files = listSrcFiles(srcDir);
  const deps = new Map();
  for (const f of files) {
    let code = '';
    try { code = fs.readFileSync(f, 'utf8'); } catch (e) { /* skip */ }
    const list = [];
    const re = /require\(\s*(['"])([^'"]+)\1\s*\)/g;
    let m;
    while ((m = re.exec(code))) { const r = resolveRequire(f, m[2]); if (r) list.push(r); }
    deps.set(f, list);
  }
  const ai = new Set();
  for (const f of files) if (AI_ROOTS.some((re) => re.test(f))) ai.add(f);
  const roots = new Set(ai);
  let changed = true;
  while (changed) {
    changed = false;
    for (const [f, list] of deps) {
      if (ai.has(f) || /[\\/](app|server)\.js$/.test(f) || /initializeTables\.js$/.test(f) || /aiCache\.js$/.test(f)) continue;
      if (list.some((d) => ai.has(d))) { ai.add(f); changed = true; }
    }
  }
  return { ai, roots };
}

function walk(node, visit) {
  if (!node || typeof node.type !== 'string') return;
  visit(node);
  for (const key of Object.keys(node)) {
    if (key === 'loc' || key === 'extra' || key === 'leadingComments' || key === 'trailingComments' || key === 'innerComments') continue;
    const v = node[key];
    if (Array.isArray(v)) v.forEach((c) => c && typeof c.type === 'string' && walk(c, visit));
    else if (v && typeof v.type === 'string') walk(v, visit);
  }
}

function identifiersIn(node) {
  const out = new Set();
  walk(node, (n) => { if (n.type === 'Identifier') out.add(n.name); });
  return out;
}

/** Per route file: Map(line -> {ai, reason}) for every registration call found at that line. */
function analyseRouteFile(abs, aiModules) {
  const code = fs.readFileSync(abs, 'utf8');
  const ast = parser.parse(code, { sourceType: 'script', allowReturnOutsideFunction: true });
  const aiNames = new Set();
  const funcs = new Map(); // top-level function name -> node
  for (const stmt of ast.program.body) {
    if (stmt.type === 'VariableDeclaration') {
      for (const d of stmt.declarations) {
        const init = d.init;
        const reqNode = init && (init.type === 'CallExpression' ? init : (init.type === 'MemberExpression' ? init.object : null));
        if (reqNode && reqNode.type === 'CallExpression' && reqNode.callee.type === 'Identifier' && reqNode.callee.name === 'require'
          && reqNode.arguments[0] && reqNode.arguments[0].type === 'StringLiteral') {
          const resolved = resolveRequire(abs, reqNode.arguments[0].value);
          if (resolved && aiModules.has(resolved)) {
            if (d.id.type === 'Identifier') aiNames.add(d.id.name);
            else if (d.id.type === 'ObjectPattern') d.id.properties.forEach((p) => { if (p.value && p.value.type === 'Identifier') aiNames.add(p.value.name); });
          }
        } else if (d.id.type === 'Identifier' && init && /Function/.test(init.type)) {
          funcs.set(d.id.name, init);
        }
      }
    } else if (stmt.type === 'FunctionDeclaration' && stmt.id) {
      funcs.set(stmt.id.name, stmt);
    }
  }
  const aiFuncs = new Set();
  let changed = true;
  while (changed) {
    changed = false;
    for (const [name, node] of funcs) {
      if (aiFuncs.has(name)) continue;
      const ids = identifiersIn(node);
      if ([...ids].some((i) => aiNames.has(i) || (aiFuncs.has(i) && i !== name))) { aiFuncs.add(name); changed = true; }
    }
  }
  const byLine = new Map();
  walk(ast.program, (n) => {
    if (n.type !== 'CallExpression' || n.callee.type !== 'MemberExpression' || n.callee.computed || n.callee.property.type !== 'Identifier') return;
    if (!['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'all'].includes(n.callee.property.name)) return;
    const line = n.callee.property.loc.start.line;
    const ids = new Set();
    n.arguments.forEach((a) => {
      identifiersIn(a).forEach((i) => ids.add(i));
      if (a.type === 'Identifier' && funcs.has(a.name)) identifiersIn(funcs.get(a.name)).forEach((i) => ids.add(i)); // handler given by name
    });
    const hit = [...ids].find((i) => aiNames.has(i) || aiFuncs.has(i));
    byLine.set(line, hit ? { ai: true, reason: `uses ${hit}` } : { ai: false, reason: 'no AI call reachable in the handler' });
  });
  return byLine;
}

/**
 * @param {object[]} endpoints manifest endpoints (need sourceFile + line)
 * @param {{repoDir: string, treatAsAi?: string[], treatAsSafe?: string[]}} opts
 * @returns {Map<string, {ai: boolean, reason: string}>} keyed by `${METHOD} ${path}`
 */
function classifyAiEndpoints(endpoints, { repoDir, treatAsAi = [], treatAsSafe = [] }) {
  const result = new Map();
  const srcDir = path.join(repoDir, 'backend', 'src');
  let aiModules = new Set();
  let usable = !!parser;
  if (usable) {
    try { aiModules = findAiModules(srcDir).ai; } catch (e) { usable = false; }
  }
  const perFile = new Map();
  for (const e of endpoints) {
    const key = `${String(e.method).toUpperCase()} ${e.path}`;
    let verdict = { ai: true, reason: 'unclassified (fail-safe: treated as AI)' };
    if (usable && e.sourceFile && e.line) {
      const abs = path.join(repoDir, e.sourceFile);
      try {
        if (!perFile.has(abs)) perFile.set(abs, analyseRouteFile(abs, aiModules));
        const v = perFile.get(abs).get(e.line);
        if (v) verdict = v;
      } catch (err) {
        verdict = { ai: true, reason: `unclassified (${String(err.message).split('\n')[0]}; fail-safe: treated as AI)` };
      }
    }
    if (treatAsAi.some((s) => key.includes(s))) verdict = { ai: true, reason: 'operator override (--treat-as-ai)' };
    else if (treatAsSafe.some((s) => key.includes(s))) verdict = { ai: false, reason: 'operator override (--treat-as-safe)' };
    result.set(key, verdict);
  }
  return result;
}

module.exports = { classifyAiEndpoints, findAiModules };
