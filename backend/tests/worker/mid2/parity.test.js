'use strict';

/**
 * Source-level fidelity check between each Express original and its Worker port (the mid2 slice).
 *
 * Green route tests prove behaviour against fakes for the inputs the tests thought of. This test proves the
 * port did not silently drift anywhere else: it parses both files (@babel/parser) and asserts that
 *
 *   1. every string literal and template segment in the Express file (SQL, prompts, error messages, route
 *      paths, fallback copy) occurs at least as many times in the Worker file, and the Worker file adds only
 *      an explicit allow-list of platform-forced literals;
 *   2. the same for every numeric literal (status codes, token limits, temperatures, slice sizes, tiers);
 *   3. every `router.<method>(path, ...guards, handler)` registration has the same method, path and
 *      guard chain (authenticateToken / requirePlan(n), in the same order), in the same order in the file.
 *
 * It reads Express source only as text. If someone edits an Express route later, this test goes red, which
 * is the intended "dual maintenance" alarm: the Worker port must be re-synced.
 */
const fs = require('fs');
const path = require('path');
const { parse } = require('@babel/parser');

const SRC = path.resolve(__dirname, '../../../src');

const PAIRS = [
  { name: 'routes/skills.js', express: 'routes/skills.js', worker: 'worker/routes/skills.js', extraStrings: ['user'] },
  { name: 'routes/dashboard.js', express: 'routes/dashboard.js', worker: 'worker/routes/dashboard.js', extraStrings: ['user'] },
  { name: 'routes/learningModules.js', express: 'routes/learningModules.js', worker: 'worker/routes/learningModules.js', extraStrings: ['trackId', 'moduleId'] },
  { name: 'routes/aiTutor.js', express: 'routes/aiTutor.js', worker: 'worker/routes/aiTutor.js', extraStrings: ['user', 'id'] },
  {
    name: 'routes/studyTools.js',
    express: 'routes/studyTools.js',
    worker: 'worker/routes/studyTools.js',
    extraStrings: ['user', 'function', 'studyHistoryService is not registered in the service container'],
  },
  {
    name: 'services/tutorHistoryService.js',
    express: 'services/tutorHistoryService.js',
    worker: 'worker/services/tutorHistoryService.js',
    extraStrings: ['function', 'createTutorHistoryService: db with a query() method is required'],
  },
];

const read = (rel) => fs.readFileSync(path.join(SRC, rel), 'utf8').replace(/\r\n/g, '\n');

function walk(node, visit, parent = null) {
  if (!node || typeof node.type !== 'string') return;
  visit(node, parent);
  for (const key of Object.keys(node)) {
    if (key === 'loc' || key === 'start' || key === 'end' || key === 'extra' || key === 'leadingComments' || key === 'trailingComments' || key === 'innerComments') continue;
    const v = node[key];
    if (Array.isArray(v)) v.forEach((n) => walk(n, visit, node));
    else if (v && typeof v === 'object') walk(v, visit, node);
  }
}

function inspect(src) {
  const ast = parse(src, { sourceType: 'script' });
  const strings = new Map();
  const numbers = new Map();
  const routes = [];
  const bump = (m, k) => m.set(k, (m.get(k) || 0) + 1);

  walk(ast.program, (node, parent) => {
    if (node.type === 'StringLiteral') {
      const isRequireArg = parent && parent.type === 'CallExpression' && parent.callee.type === 'Identifier' && parent.callee.name === 'require';
      if (!isRequireArg && node.value !== '') bump(strings, node.value);
    } else if (node.type === 'TemplateElement') {
      if (node.value.cooked) bump(strings, node.value.cooked);
    } else if (node.type === 'NumericLiteral') {
      bump(numbers, node.value);
    } else if (
      node.type === 'CallExpression' &&
      node.callee.type === 'MemberExpression' &&
      node.callee.object.type === 'Identifier' &&
      node.callee.object.name === 'router' &&
      ['get', 'post', 'put', 'patch', 'delete'].includes(node.callee.property.name)
    ) {
      const [p, ...rest] = node.arguments;
      const guards = rest.slice(0, -1).map((a) => src.slice(a.start, a.end));
      routes.push(`${node.callee.property.name.toUpperCase()} ${p.value} [${guards.join(', ')}]`);
    }
  });
  return { strings, numbers, routes };
}

function subsetReport(base, port, allowedExtra = []) {
  const missing = [];
  const unexpectedExtra = [];
  for (const [k, n] of base) {
    if ((port.get(k) || 0) < n) missing.push(`${JSON.stringify(k).slice(0, 120)} (Express ${n}, Worker ${port.get(k) || 0})`);
  }
  for (const [k, n] of port) {
    if (n > (base.get(k) || 0) && !allowedExtra.includes(k)) unexpectedExtra.push(`${JSON.stringify(k).slice(0, 120)} (Express ${base.get(k) || 0}, Worker ${n})`);
  }
  return { missing, unexpectedExtra };
}

describe.each(PAIRS)('Express -> Worker fidelity: $name', ({ express, worker, extraStrings }) => {
  const e = inspect(read(express));
  const w = inspect(read(worker));

  it('every Express string literal / template segment (SQL, prompts, messages, paths) is still present', () => {
    const { missing } = subsetReport(e.strings, w.strings);
    expect(missing).toEqual([]);
  });

  it('the Worker file adds no string literals beyond the platform-forced allow-list', () => {
    const { unexpectedExtra } = subsetReport(e.strings, w.strings, extraStrings);
    expect(unexpectedExtra).toEqual([]);
  });

  it('every numeric literal (status codes, limits, temperatures, tiers, slice sizes) is preserved, none added', () => {
    expect(subsetReport(e.numbers, w.numbers)).toEqual({ missing: [], unexpectedExtra: [] });
  });

  it('routes: same method, path, guard chain and registration order', () => {
    expect(w.routes).toEqual(e.routes);
  });
});

describe('sanity of the fidelity check itself', () => {
  it('finds the expected route counts and detects a dropped or added literal', () => {
    const skills = inspect(read('routes/skills.js'));
    expect(skills.routes).toEqual([
      'GET /questions [authenticateToken, requirePlan(1)]',
      'POST /assessment [authenticateToken, requirePlan(1)]',
      'GET /history [authenticateToken, requirePlan(1)]',
    ]);
    const tampered = new Map(skills.strings);
    tampered.set('Failed to fetch assessment history', 0);
    tampered.set('a brand new message', 1);
    const report = subsetReport(skills.strings, tampered);
    expect(report.missing).toHaveLength(1);
    expect(report.unexpectedExtra).toHaveLength(1);
  });

  it('every Express route of the five files is registered on the Worker side (22 in total)', () => {
    const total = PAIRS.filter((p) => p.name.startsWith('routes/')).reduce((n, p) => n + inspect(read(p.worker)).routes.length, 0);
    expect(total).toBe(22);
  });
});
