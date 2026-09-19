'use strict';

/**
 * Source-level parity between the Express file (read-only reference) and the Worker port, for the things a
 * behavioural test can miss: the 600-line data block and prompts, the exact SQL text and its order, every
 * status-code + error-message pair, the guard arguments per route, log messages, and the absence of
 * anything the Worker forbids (boot DDL, timers, ambient globals). Nothing here executes Express code.
 */
const { read, EXPRESS_FILE, WORKER_FILE, dataBlock, sqlList } = require('./helpers/expressReference');

const express = read(EXPRESS_FILE);
const worker = read(WORKER_FILE);

// only the handlers, not the data block or the boot IIFE
const routesPart = (src) => src.slice(src.indexOf('// ── Routes'));

describe('routes/practice.js parity with the Express source', () => {
  it('the data block (fallback problems, assessments, AI prompts, generateFallbackHint) is byte-identical', () => {
    const a = dataBlock(express);
    const b = dataBlock(worker);
    expect(a.length).toBeGreaterThan(40000); // guards against comparing two empty strings
    expect(b).toBe(a);
  });

  it('issues exactly the same SQL statements in the same order (no interpolation, $n params kept)', () => {
    const a = sqlList(routesPart(express));
    const b = sqlList(routesPart(worker));
    expect(a).toHaveLength(16); // 3 + 2 + 1 + 1 + 1 + 1 + 5 + 3 across the 10 handlers
    expect(b).toEqual(a);
    expect(b.every((s) => !/\$\{/.test(s))).toBe(true);
  });

  it('the boot-time CREATE TABLE statements are the ONLY SQL not ported (ADR 6.5)', () => {
    const boot = sqlList(express.slice(0, express.indexOf('// ── Fallback Problems')));
    expect(boot).toHaveLength(3);
    expect(boot.every((s) => /^CREATE TABLE IF NOT EXISTS (practice_submissions|assessment_submissions|practice_bookmarks)\b/.test(s))).toBe(true);
    expect(worker).not.toMatch(/CREATE TABLE/i);
    expect(worker).not.toMatch(/practice table migration/i);
  });

  it('same guards per route, same order, same n', () => {
    const guards = (src) =>
      [...routesPart(src).matchAll(/router\.(get|post|put|patch|delete)\('([^']+)',\s*([^{]*?)\s*async\s*\(/g)].map((m) => `${m[1].toUpperCase()} ${m[2]} :: ${m[3].replace(/\s+/g, ' ').replace(/,\s*$/, '')}`);
    const a = guards(express);
    const b = guards(worker);
    expect(a).toHaveLength(10);
    expect(b).toEqual(a);
    expect(a.every((g) => g.endsWith(':: authenticateToken, requirePlan(1)'))).toBe(true);
  });

  it('same (status, error message) pairs in the same order', () => {
    const exp = [...routesPart(express).matchAll(/res\.status\((\d+)\)\.json\(\{ error: '([^']*)' \}\)/g)].map((m) => `${m[1]} ${m[2]}`);
    const wrk = [...routesPart(worker).matchAll(/c\.json\(\{ error: '([^']*)' \}, (\d+)\)/g)].map((m) => `${m[2]} ${m[1]}`);
    expect(exp).toHaveLength(19); // 10 x 500, 6 x 404, 3 x 400
    expect(wrk).toEqual(exp);
  });

  it('logs the same messages', () => {
    const logs = (src) => [...routesPart(src).matchAll(/console\.error\('([^']*)'/g)].map((m) => m[1]);
    expect(logs(worker)).toEqual(logs(express));
    expect(logs(express)).toHaveLength(12); // 10 handler catch blocks + 2 swallowed save failures
  });

  it('same number of successful responses (one `res.json(` becomes one `return c.json(`)', () => {
    const okExp = (routesPart(express).match(/\n\s+res\.json\(/g) || []).length;
    const okWrk = (routesPart(worker).match(/return c\.json\((?!\{ error:)/g) || []).length;
    expect(okWrk).toBe(okExp);
    expect(okExp).toBe(11); // 10 handlers + the bookmark toggle's second branch
  });

  it('only the aiClient contract (callAI, extractJSON) is used from the injected service', () => {
    const uses = new Set([...worker.matchAll(/aiClient\.(\w+)/g)].map((m) => m[1]));
    expect([...uses].sort()).toEqual(['callAI', 'extractJSON']);
    // same four option keys the Express file passed, per call site
    expect((worker.match(/aiClient\.callAI\(\{/g) || []).length).toBe(3);
  });

  describe('Worker-forbidden constructs are absent', () => {
    it.each([
      ['boot DDL / table creation', /CREATE TABLE/i],
      ['timers', /\bsetTimeout\b|\bsetInterval\b/],
      ['ambient process access', /\bprocess\.(?:env|exit|cwd|argv|nextTick)\b/],
      ['fs / path', /require\('(?:node:)?(?:fs|path)'\)/],
      ['dynamic require', /require\(\s*[^'"\s]/],
      ['the shared pool', /\bpool\b/],
      ['the Express modules', /require\('\.\.\/(?:middleware\/(?!auth'|requirePlan')|services|utils|config)/],
      ['IP / connection globals', /\breq\.ip\b|remoteAddress/],
      ['module-scope immediately-invoked async work', /^\(async \(\) => \{/m],
    ])('no %s', (_l, re) => {
      const codeOnly = worker.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      expect(codeOnly).not.toMatch(re);
    });

    it('only exports the router', () => {
      expect(worker).toMatch(/module\.exports = router;\s*$/);
      expect(worker.match(/module\.exports/g)).toHaveLength(1);
    });
  });
});
