'use strict';

/**
 * Transcription check for the five ported route files.
 *
 * The Worker routes were re-typed from the Express files, so a dropped character in a prompt, SQL
 * statement, message or status code would otherwise only show up as a subtle behaviour change. This test
 * parses the Express source (WORKING TREE, which is what the port mirrors) and the Worker port with
 * @babel/parser (the same parser the manifest generator uses; installed transitively by jest) and compares
 * the multiset of every string / template / numeric / boolean literal, so SQL text, prompts, response
 * messages, HTTP status codes, token limits and temperatures must all match exactly.
 *
 * Intentional differences are listed explicitly below. Anything else fails.
 *
 * Note this compares literals, not control flow: ordering, middleware and branches are covered by the
 * route tests and by manifest.test.js.
 */
const fs = require('fs');
const path = require('path');
const parser = require('@babel/parser');

const BACKEND = path.resolve(__dirname, '../../..');
const FILES = ['resumeChat', 'learning', 'jobPreparation', 'careerRoadmap', 'interview'];

/** Express literals that have no Worker counterpart on purpose. */
const EXPRESS_ONLY = {
  learning: [
    // boot-time schema bootstrap dropped (ADR 6.5)
    (k) => k.includes('CREATE TABLE IF NOT EXISTS learning_roadmaps'),
    (k) => k === 'S:Learning table migration error:',
  ],
  interview: [
    (k) => k.includes('CREATE TABLE IF NOT EXISTS mock_interviews'),
    (k) => k === 'S:Mock interviews table migration error:',
  ],
};

/** Worker literals that have no Express counterpart on purpose. */
const WORKER_ONLY = {
  resumeChat: [
    // db.connect() feature test + release of the checked-out client (see routes/resumeChat.js, deviation 2)
    (k) => k === 'S:function',
    (k) => k === 'S:Error releasing embedding client:',
  ],
};

function collect(file) {
  const code = fs.readFileSync(file, 'utf8');
  const ast = parser.parse(code, { sourceType: 'script', allowReturnOutsideFunction: true });
  const out = new Map();
  const add = (key) => out.set(key, (out.get(key) || 0) + 1);

  const isCtxLookup = (node) =>
    node.type === 'CallExpression' &&
    node.callee.type === 'MemberExpression' &&
    !node.callee.computed &&
    ['get', 'param'].includes(node.callee.property.name) &&
    ((node.callee.object.type === 'Identifier' && node.callee.object.name === 'c') ||
      (node.callee.object.type === 'MemberExpression' && node.callee.object.object.name === 'c' && node.callee.object.property.name === 'req'));
  const isRequire = (node) => node.type === 'CallExpression' && node.callee.type === 'Identifier' && node.callee.name === 'require';

  (function walk(node) {
    if (!node || typeof node.type !== 'string') return;
    if (isRequire(node)) return; // module specifiers differ by design
    if (isCtxLookup(node)) {
      // c.get('user') / c.req.param('id') are the Worker spelling of req.user / req.params.id
      node.arguments.slice(1).forEach(walk);
      walk(node.callee);
      return;
    }
    switch (node.type) {
      case 'StringLiteral':
        add('S:' + node.value);
        break;
      case 'TemplateLiteral':
        add('T:' + node.quasis.map((q) => q.value.cooked).join('${}'));
        break;
      case 'NumericLiteral':
        add('N:' + node.value);
        break;
      case 'BooleanLiteral':
        add('B:' + node.value);
        break;
      default:
        break;
    }
    for (const key of Object.keys(node)) {
      const v = node[key];
      if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === 'object') walk(v);
    }
  })(ast.program);
  return out;
}

function diff(expected, actual, ignoreExpected = [], ignoreActual = []) {
  const missing = [];
  const extra = [];
  for (const [k, n] of expected) {
    if (ignoreExpected.some((f) => f(k))) continue;
    const got = actual.get(k) || 0;
    if (got < n) missing.push(`${k.slice(0, 120)} (express ${n}, worker ${got})`);
  }
  for (const [k, n] of actual) {
    if (ignoreActual.some((f) => f(k))) continue;
    const want = expected.get(k) || 0;
    if (n > want) extra.push(`${k.slice(0, 120)} (worker ${n}, express ${want})`);
  }
  return { missing, extra };
}

describe('Worker route literals match the Express originals (working tree)', () => {
  it.each(FILES)('%s.js', (name) => {
    const express = collect(path.join(BACKEND, 'src/routes', `${name}.js`));
    const worker = collect(path.join(BACKEND, 'src/worker/routes', `${name}.js`));
    expect(express.size).toBeGreaterThan(10); // guard against parsing nothing
    const { missing, extra } = diff(express, worker, EXPRESS_ONLY[name] || [], WORKER_ONLY[name] || []);
    expect({ missing, extra }).toEqual({ missing: [], extra: [] });
  });

  it('the comparison actually detects a dropped character (self-check)', () => {
    const a = new Map([['T:You are an assistant. \nnext', 1], ['N:1200', 1]]);
    const b = new Map([['T:You are an assistant.\nnext', 1], ['N:1200', 1]]);
    const { missing, extra } = diff(a, b);
    expect(missing).toHaveLength(1);
    expect(extra).toHaveLength(1);
  });
});
