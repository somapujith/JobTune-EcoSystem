'use strict';

/**
 * Differential test: the ORIGINAL Express routers (community / projectBuilder / courses) and their Worker
 * ports are driven with the same requests over the same scripted database, and must agree on
 *   - HTTP status and the JSON response body (deep equality),
 *   - the exact sequence of SQL statements and bound parameters,
 *   - the arguments handed to callAI,
 *   - the console.error / console.warn messages.
 *
 * Only the Express *dependencies* are replaced (pool, auth/plan middleware, callAI); the route code under
 * test is the real Express source, read but never modified. It proves logic parity for the scripted
 * cases. It does not prove SQL against Postgres/Neon or anything about the Workers runtime.
 * Gating (authenticateToken + requirePlan) is compared separately in manifest.test.js.
 */
const http = require('http');
const net = require('net');
const request = require('supertest');

const mockQuery = jest.fn();
const mockCallAI = jest.fn();
jest.mock('../../../src/config/database', () => ({ pool: { query: (...a) => mockQuery(...a) } }));
jest.mock('../../../src/middleware/auth', () => ({
  authenticateToken: (req, res, next) => {
    req.user = { id: 1 };
    next();
  },
}));
jest.mock('../../../src/middleware/requirePlan', () => ({ requirePlan: () => (req, res, next) => next() }));
jest.mock('../../../src/utils/aiClient', () => {
  const actual = jest.requireActual('../../../src/utils/aiClient');
  return { ...actual, callAI: (...a) => mockCallAI(...a) };
});

const express = require('express');
const { errorHandler } = require('../../../src/middleware/errorHandler');
const { extractJSON: realExtractJSON } = jest.requireActual('../../../src/utils/aiClient');
const { makeLarge1, norm } = require('./helpers');

const CRLF = String.fromCharCode(13, 10);
const FIXED_NOW = new Date('2026-09-19T12:00:00Z');
const ALL_BUT_DATE = ['nextTick', 'setImmediate', 'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval', 'clearImmediate', 'queueMicrotask', 'hrtime', 'performance'];

let expressApp;
let saved;

beforeAll(async () => {
  saved = { p: process.env.LM_STUDIO_MODEL_PROJECT, m: process.env.LM_STUDIO_MODEL };
  process.env.LM_STUDIO_MODEL_PROJECT = 'project-model';
  process.env.LM_STUDIO_MODEL = 'default-model';

  // the Express files run their table bootstrap at require time; let it finish and forget it
  mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  const projectBuilder = require('../../../src/routes/projectBuilder');
  const courses = require('../../../src/routes/courses');
  const community = require('../../../src/routes/community');
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));
  jest.restoreAllMocks();
  mockQuery.mockReset();

  expressApp = express();
  expressApp.use(express.json({ limit: '1mb' }));
  expressApp.use('/api/project-builder', projectBuilder);
  expressApp.use('/api/courses', courses);
  expressApp.use('/api/community', community);
  expressApp.use(errorHandler);
});

afterAll(() => {
  if (saved.p === undefined) delete process.env.LM_STUDIO_MODEL_PROJECT;
  else process.env.LM_STUDIO_MODEL_PROJECT = saved.p;
  if (saved.m === undefined) delete process.env.LM_STUDIO_MODEL;
  else process.env.LM_STUDIO_MODEL = saved.m;
});

beforeEach(() => {
  jest.useFakeTimers({ now: FIXED_NOW, doNotFake: ALL_BUT_DATE });
  jest.spyOn(Math, 'random').mockReturnValue(0.5);
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
  mockQuery.mockReset();
  mockCallAI.mockReset();
});

const stripStamp = (s) => s.replace(/^\[[^\]]+\] /, '');

/** Wrap a scenario db handler: unscripted SQL throws the same error on both sides. */
const wrapHandler = (handler) => async (sql, params) => {
  const out = await handler(sql, params);
  if (out === undefined) throw new Error(`unscripted SQL: ${sql}`);
  return out;
};

async function runExpress(sc) {
  const calls = [];
  const logs = [];
  jest.spyOn(console, 'error').mockImplementation((...a) => logs.push(stripStamp(a.join(' '))));
  jest.spyOn(console, 'warn').mockImplementation((...a) => logs.push(stripStamp(a.join(' '))));
  const handler = wrapHandler(sc.db || (() => undefined));
  mockQuery.mockImplementation(async (text, params = []) => {
    const sql = norm(text);
    calls.push({ sql, params });
    const out = await handler(sql, params);
    if (Array.isArray(out)) return { rows: out, rowCount: out.length };
    return { rowCount: out.rows ? out.rows.length : 0, ...out };
  });
  mockCallAI.mockImplementation(sc.ai || (async () => ({ ok: false, error: 'no ai', data: null })));

  let req = request(expressApp)[sc.method.toLowerCase()](sc.path);
  req = req.set('Content-Type', 'application/json');
  const res = sc.body === undefined ? await req : await req.send(sc.body);
  jest.restoreAllMocks();
  jest.spyOn(Math, 'random').mockReturnValue(0.5);
  return { status: res.status, body: res.body, calls, logs, ai: mockCallAI.mock.calls.map((c) => c[0]) };
}

async function runWorker(sc) {
  const logs = [];
  jest.spyOn(console, 'error').mockImplementation((...a) => logs.push(stripStamp(a.join(' '))));
  jest.spyOn(console, 'warn').mockImplementation((...a) => logs.push(stripStamp(a.join(' '))));
  const callAI = jest.fn(sc.ai || (async () => ({ ok: false, error: 'no ai', data: null })));
  const H = makeLarge1({
    plan: 3,
    script: wrapHandler(sc.db || (() => undefined)),
    aiClient: { callAI, extractJSON: realExtractJSON },
    envOverrides: { LM_STUDIO_MODEL_PROJECT: 'project-model', LM_STUDIO_MODEL: 'default-model' },
  });
  // A request without a payload: supertest/Node (and browsers) send `Content-Length: 0`, which Express parses as `{}`.
  const res =
    sc.body === undefined
      ? await H.json(sc.method, sc.path, undefined, { headers: { 'Content-Length': '0' } })
      : await H.json(sc.method, sc.path, sc.body);
  const text = await res.text();
  jest.restoreAllMocks();
  jest.spyOn(Math, 'random').mockReturnValue(0.5);
  return { status: res.status, body: text ? JSON.parse(text) : undefined, calls: H.db.calls, logs, ai: callAI.mock.calls.map((c) => c[0]) };
}

const S = (name, method, path, body, db, extra = {}) => ({ name, method, path, body, db, ...extra });

const okAi = (data) => async () => ({ ok: true, error: null, data });
const failAi = async () => ({ ok: false, error: 'provider down', data: null });
const throwAi = async () => { throw new Error('socket hang up'); };
const dbError = (msg = 'boom') => () => { throw new Error(msg); };
const thread = (id, extra = {}) => ({ id, user_id: 2, author_name: 'A', title: `T${id}`, body: 'b', category: 'dsa', tags: [], votes: 0, views: 0, reply_count: 0, created_at: '2026-09-01T00:00:00.000Z', ...extra });

// ─────────────────────────────── community ───────────────────────────────
const CM = '/api/community';
const communityScenarios = [
  S('forums: db counts', 'GET', `${CM}/forums`, undefined, (sql) => (/GROUP BY category/.test(sql) ? [{ category: 'dsa', thread_count: '7' }, { category: 'backend', thread_count: '2' }] : undefined)),
  S('forums: empty', 'GET', `${CM}/forums`, undefined, () => []),
  S('forums: db error', 'GET', `${CM}/forums`, undefined, dbError('relation "community_threads" does not exist')),
  S('forums/:category rows page 2 sorted popular', 'GET', `${CM}/forums/dsa?page=2&sort=popular`, undefined, () => [thread(1), thread(2)]),
  S('forums/:category full page', 'GET', `${CM}/forums/dsa`, undefined, () => Array.from({ length: 20 }, (_, i) => thread(i + 1))),
  S('forums/:category empty -> fallback', 'GET', `${CM}/forums/frontend?page=4&sort=active`, undefined, () => []),
  S('forums/:category bad page/sort', 'GET', `${CM}/forums/dsa?page=abc&sort=bogus`, undefined, () => []),
  S('forums/:category sort=constructor (sql error)', 'GET', `${CM}/forums/dsa?sort=constructor`, undefined, (sql) => { if (/function Object/.test(sql)) throw new Error('syntax error at or near "function"'); }),
  S('forums/:category repeated page key', 'GET', `${CM}/forums/dsa?page=2&page=3`, undefined, () => []),
  S('forums/:category db error', 'GET', `${CM}/forums/backend`, undefined, dbError()),
  S('thread found', 'GET', `${CM}/forums/thread/9`, undefined, (sql) => {
    if (/^SELECT \* FROM community_threads/.test(sql)) return [thread(9)];
    if (/^UPDATE community_threads SET views/.test(sql)) return { rows: [], rowCount: 1 };
    if (/FROM community_replies/.test(sql)) return [{ id: 1, thread_id: 9, body: 'r' }];
  }),
  S('thread fallback id', 'GET', `${CM}/forums/thread/3`, undefined, () => []),
  S('thread 404', 'GET', `${CM}/forums/thread/999`, undefined, () => []),
  S('thread db error known id', 'GET', `${CM}/forums/thread/4`, undefined, dbError()),
  S('thread db error unknown id', 'GET', `${CM}/forums/thread/abc`, undefined, dbError()),
  S('create thread ok', 'POST', `${CM}/forums/thread`, { title: 'Hello', body: 'World', category: 'dsa', tags: ['a', 3, 'b'.repeat(70)] }, (sql, p) => {
    if (/^SELECT full_name/.test(sql)) return [{ full_name: 'Ada' }];
    if (/^INSERT INTO community_threads/.test(sql)) return [{ id: 1, author_name: p[1], title: p[2], category: p[4], tags: p[5] }];
  }),
  S('create thread bad category + no user row', 'POST', `${CM}/forums/thread`, { title: 'Hello', body: 'World', category: 'zzz', tags: 'nope' }, (sql, p) => {
    if (/^SELECT full_name/.test(sql)) return [];
    if (/^INSERT INTO community_threads/.test(sql)) return [{ author_name: p[1], category: p[4], tags: p[5] }];
  }),
  S('create thread truncation', 'POST', `${CM}/forums/thread`, { title: 'T'.repeat(700), body: 'B'.repeat(7000) }, (sql, p) => {
    if (/^SELECT full_name/.test(sql)) return [{ full_name: 'Ada' }];
    return [{ title_len: p[2].length, body_len: p[3].length }];
  }),
  S('create thread missing title', 'POST', `${CM}/forums/thread`, { body: 'x' }, () => []),
  S('create thread non-string body', 'POST', `${CM}/forums/thread`, { title: 't', body: 5 }, () => []),
  S('create thread empty body (Content-Length: 0)', 'POST', `${CM}/forums/thread`, undefined, () => []),
  S('create thread db error', 'POST', `${CM}/forums/thread`, { title: 't', body: 'b' }, dbError('insert failed')),
  S('reply ok', 'POST', `${CM}/forums/thread/9/reply`, { body: 'Nice' }, (sql, p) => {
    if (/^SELECT full_name/.test(sql)) return [{ full_name: 'Grace' }];
    if (/^INSERT INTO community_replies/.test(sql)) return [{ id: 4, thread_id: p[0], body: p[3] }];
    if (/^UPDATE community_threads/.test(sql)) return { rows: [], rowCount: 1 };
  }),
  S('reply invalid', 'POST', `${CM}/forums/thread/9/reply`, { body: '' }, () => []),
  S('reply empty body (Content-Length: 0)', 'POST', `${CM}/forums/thread/9/reply`, undefined, () => []),
  S('reply db error', 'POST', `${CM}/forums/thread/9/reply`, { body: 'x' }, dbError('fk')),
  S('vote new up', 'POST', `${CM}/forums/thread/9/vote`, { direction: 'up' }, (sql) => (/^SELECT \* FROM community_votes/.test(sql) ? [] : { rows: [], rowCount: 1 })),
  S('vote new down', 'POST', `${CM}/forums/thread/9/vote`, { direction: 'down' }, (sql) => (/^SELECT \* FROM community_votes/.test(sql) ? [] : { rows: [], rowCount: 1 })),
  S('vote same', 'POST', `${CM}/forums/thread/9/vote`, { direction: 'up' }, (sql) => (/^SELECT \* FROM community_votes/.test(sql) ? [{ id: 2, direction: 'up' }] : undefined)),
  S('vote flip', 'POST', `${CM}/forums/thread/9/vote`, { direction: 'down' }, (sql) => (/^SELECT \* FROM community_votes/.test(sql) ? [{ id: 2, direction: 'up' }] : { rows: [], rowCount: 1 })),
  S('vote invalid', 'POST', `${CM}/forums/thread/9/vote`, { direction: 'left' }, () => []),
  S('vote empty body (Content-Length: 0)', 'POST', `${CM}/forums/thread/9/vote`, undefined, () => []),
  S('vote db error', 'POST', `${CM}/forums/thread/9/vote`, { direction: 'up' }, dbError('nope')),
  S('groups rows', 'GET', `${CM}/groups`, undefined, () => [{ id: 1, name: 'g' }]),
  S('groups empty', 'GET', `${CM}/groups`, undefined, () => []),
  S('groups db error', 'GET', `${CM}/groups`, undefined, dbError()),
  S('create group ok', 'POST', `${CM}/groups`, { name: 'N', topic: 'T', description: 'D', maxMembers: 12 }, (sql, p) => [{ params: p }]),
  S('create group defaults + truncation', 'POST', `${CM}/groups`, { name: 'N'.repeat(300), topic: 'T'.repeat(300), description: 'D'.repeat(2500) }, (sql, p) => [{ lens: [p[1].length, p[2].length, p[3].length], max: p[4], color: p[5] }]),
  S('create group invalid', 'POST', `${CM}/groups`, { name: 'N' }, () => []),
  S('create group non-string name', 'POST', `${CM}/groups`, { name: 12, topic: 'T' }, () => []),
  S('create group db error', 'POST', `${CM}/groups`, { name: 'N', topic: 'T' }, dbError()),
  S('events rows', 'GET', `${CM}/events`, undefined, () => [{ id: 1, title: 'e' }]),
  S('events empty', 'GET', `${CM}/events`, undefined, () => []),
  S('events db error', 'GET', `${CM}/events`, undefined, dbError()),
  S('leaderboard', 'GET', `${CM}/leaderboard`, undefined, () => []),
  S('practice default (AI valid JSON is ignored: preserved bug)', 'POST', `${CM}/communication/practice`, { content: 'I built 3 apps in 2 years. Then I shipped.', scenario: 'Interview' }, undefined, { ai: okAi('{"overallScore": 90}') }),
  S('practice default, AI failure', 'POST', `${CM}/communication/practice`, { content: 'hello' }, undefined, { ai: failAi }),
  S('practice default, AI throws', 'POST', `${CM}/communication/practice`, { content: 'hello there' }, undefined, { ai: throwAi }),
  S('practice hr', 'POST', `${CM}/communication/practice`, { type: 'hr-communication', content: 'Please approve my leave for 3 days.', scenario: 'Leave' }, undefined, { ai: okAi('{"overallScore": 70}') }),
  S('practice hr no scenario', 'POST', `${CM}/communication/practice`, { type: 'hr-communication', content: 'x' }, undefined, { ai: throwAi }),
  S('practice blank', 'POST', `${CM}/communication/practice`, { content: '   ' }, undefined),
  S('practice missing content', 'POST', `${CM}/communication/practice`, {}, undefined),
  S('practice non-string content', 'POST', `${CM}/communication/practice`, { content: 5 }, undefined),
  S('practice long content is capped', 'POST', `${CM}/communication/practice`, { content: 'w '.repeat(4000) }, undefined),
  S('email ok', 'POST', `${CM}/communication/email`, { email: 'Dear Sir, thank you for your time. Best regards', subject: 'Follow up', template: 'follow-up' }, undefined, { ai: okAi('{"overallScore": 88}') }),
  S('email no subject/template', 'POST', `${CM}/communication/email`, { email: 'yo' }, undefined, { ai: failAi }),
  S('email blank', 'POST', `${CM}/communication/email`, { email: '  ' }, undefined),
  S('email non-string', 'POST', `${CM}/communication/email`, { email: {} }, undefined),
];

// ─────────────────────────────── projectBuilder ───────────────────────────────
const PB = '/api/project-builder';
const goodPlan = { name: 'AI Plan', techStack: { frontend: ['React'] }, description: 'd' };
const plan = { name: 'Shop', description: 'A store', techStack: { frontend: ['React'], backend: ['Node.js'], database: ['PostgreSQL'], tools: ['JWT'] }, features: [{ name: 'Cart', description: 'Buy' }], apiEndpoints: [{ method: 'GET', path: '/x', description: 'X' }], folderStructure: [{ path: 'src/', type: 'dir', depth: 0 }, { path: 'src/a.js', type: 'file', depth: 1 }] };
const workspaceRow = { id: 3, name: 'P', plan: {}, status: 'Planning', tasks: [], notes: '', created_at: 'a', updated_at: 'b' };
const projectBuilderScenarios = [
  S('templates', 'GET', `${PB}/templates`, undefined, () => []),
  S('generate: AI ok', 'POST', `${PB}/generate`, { description: 'A habit tracker', difficulty: 'Beginner' }, undefined, { ai: okAi('```json\n' + JSON.stringify(goodPlan) + '\n```') }),
  S('generate: template + AI failure', 'POST', `${PB}/generate`, { template: 'ecommerce' }, undefined, { ai: failAi }),
  S('generate: unknown template', 'POST', `${PB}/generate`, { template: 'nope', difficulty: 'Advanced' }, undefined, { ai: failAi }),
  S('generate: AI unparsable', 'POST', `${PB}/generate`, { description: 'x' }, undefined, { ai: okAi('nonsense') }),
  S('generate: AI incomplete json', 'POST', `${PB}/generate`, { description: 'x' }, undefined, { ai: okAi('{"name":"only"}') }),
  S('generate: AI throws', 'POST', `${PB}/generate`, { description: 'x' }, undefined, { ai: throwAi }),
  S('generate: validation', 'POST', `${PB}/generate`, {}, undefined),
  S('generate: empty body (Content-Length: 0)', 'POST', `${PB}/generate`, undefined, undefined),
  S('readme: AI text', 'POST', `${PB}/readme`, { projectPlan: plan }, undefined, { ai: okAi('# AI readme') }),
  S('readme: AI failure -> fallback', 'POST', `${PB}/readme`, { projectPlan: plan }, undefined, { ai: failAi }),
  S('readme: AI empty -> fallback', 'POST', `${PB}/readme`, { projectPlan: { name: 'Bare Bones' } }, undefined, { ai: okAi('') }),
  S('readme: validation', 'POST', `${PB}/readme`, {}, undefined),
  S('readme: AI throws', 'POST', `${PB}/readme`, { projectPlan: plan }, undefined, { ai: throwAi }),
  S('deployment: AI guide', 'POST', `${PB}/deployment`, { projectPlan: plan, platform: 'railway' }, undefined, { ai: okAi('{"platform":"railway","steps":[{"title":"s","command":null,"description":"d"}],"notes":[]}') }),
  S('deployment: fallback render', 'POST', `${PB}/deployment`, { projectPlan: plan, platform: 'render' }, undefined, { ai: failAi }),
  S('deployment: unknown platform', 'POST', `${PB}/deployment`, { projectPlan: plan, platform: 'heroku' }, undefined, { ai: okAi('{"steps":[]}') }),
  S('deployment: validation', 'POST', `${PB}/deployment`, { platform: 'render' }, undefined),
  S('deployment: AI throws', 'POST', `${PB}/deployment`, { projectPlan: plan }, undefined, { ai: throwAi }),
  S('workspace list', 'GET', `${PB}/workspace`, undefined, () => [workspaceRow]),
  S('workspace list db error', 'GET', `${PB}/workspace`, undefined, dbError('no table')),
  S('workspace save defaults', 'POST', `${PB}/workspace`, { name: 'My Project' }, (sql, p) => [{ ...workspaceRow, params: p }]),
  S('workspace save full', 'POST', `${PB}/workspace`, { name: 'n', plan: { a: 1 }, status: 'Building', tasks: [{ t: 1 }], notes: 'hi' }, (sql, p) => [{ params: p }]),
  S('workspace save validation', 'POST', `${PB}/workspace`, { status: 'x' }, () => []),
  S('workspace save db error', 'POST', `${PB}/workspace`, { name: 'n' }, dbError('unique')),
  S('workspace update some fields', 'PUT', `${PB}/workspace/3`, { status: 'Done', notes: 'shipped' }, () => [workspaceRow]),
  S('workspace update all fields', 'PUT', `${PB}/workspace/3`, { status: '', tasks: [], notes: '' }, () => [workspaceRow]),
  S('workspace update none', 'PUT', `${PB}/workspace/3`, {}, () => []),
  S('workspace update 404', 'PUT', `${PB}/workspace/99`, { status: 'x' }, () => []),
  S('workspace update db error', 'PUT', `${PB}/workspace/abc`, { status: 'x' }, dbError('bad id')),
  S('workspace update empty body (Content-Length: 0)', 'PUT', `${PB}/workspace/3`, undefined, () => []),
];

// ─────────────────────────────── courses ───────────────────────────────
const CO = '/api/courses';
const emptyTables = (extra = {}) => (sql, p) => {
  if (extra.courses && /^SELECT \* FROM courses ORDER BY id$/.test(sql)) return extra.courses;
  if (extra.paths && /^SELECT \* FROM learning_paths/.test(sql)) return extra.paths;
  if (/^SELECT \* FROM courses ORDER BY id$/.test(sql)) return extra.failCourses ? dbError('no courses')() : [];
  if (/^SELECT \* FROM learning_paths ORDER BY id$/.test(sql)) return [];
  if (/FROM course_enrollments WHERE user_id = \$1 AND course_id = \$2/.test(sql)) return (extra.enrollments || []).filter((e) => e.course_id === p[1]);
  if (/FROM course_enrollments WHERE user_id = \$1/.test(sql)) return extra.failEnrollments ? dbError('no enrollments')() : (extra.enrollments || []);
  if (/^SELECT \* FROM learning_streaks/.test(sql)) return extra.failStreak ? dbError('no streak')() : (extra.streak ? [extra.streak] : []);
  if (/^(INSERT|UPDATE)/.test(sql)) return { rows: [], rowCount: 1 };
};
const dbCourses = [
  { id: 1, title: 'DB Course 1', instructor: 'X', category: 'Frontend', difficulty: 'Beginner', duration_hrs: 10, lesson_count: 4, skills: ['s'], syllabus: [{ id: 'l1' }, { id: 'l2' }] },
  { id: 2, title: 'DB Course 2', instructor: 'Y', category: 'Backend', difficulty: 'Advanced', duration_hrs: 5, lesson_count: 3, skills: [], syllabus: '[{"id":"a"},{"id":"b"},{"id":"c"}]' },
];
const coursesScenarios = [
  S('list built-ins page 1', 'GET', CO, undefined, emptyTables()),
  S('list built-ins page 2', 'GET', `${CO}?page=2`, undefined, emptyTables()),
  S('list beyond last page', 'GET', `${CO}?page=9`, undefined, emptyTables()),
  S('list bad page', 'GET', `${CO}?page=abc`, undefined, emptyTables()),
  S('list db courses', 'GET', CO, undefined, emptyTables({ courses: dbCourses })),
  S('list courses table missing', 'GET', CO, undefined, emptyTables({ failCourses: true })),
  S('list filter category+difficulty', 'GET', `${CO}?category=Cloud&difficulty=Advanced`, undefined, emptyTables()),
  S('list filter All', 'GET', `${CO}?category=All&difficulty=All`, undefined, emptyTables()),
  S('list search', 'GET', `${CO}?search=REACT`, undefined, emptyTables()),
  S('list search by instructor', 'GET', `${CO}?search=sarah&category=Frontend`, undefined, emptyTables()),
  S('list search array', 'GET', `${CO}?search=a&search=b`, undefined, emptyTables()),
  S('progress empty', 'GET', `${CO}/progress`, undefined, emptyTables()),
  S('progress with enrollments + streak', 'GET', `${CO}/progress`, undefined, emptyTables({ streak: { current: 3, longest: 9, last_date: '2026-09-18', daily_goal: 45 }, enrollments: [{ course_id: 1, progress: 50, enrolled_at: 'E1' }, { course_id: 2, progress: 100, enrolled_at: 'E2' }, { course_id: 999, progress: 5, enrolled_at: 'E3' }] })),
  S('progress tables missing', 'GET', `${CO}/progress`, undefined, emptyTables({ failEnrollments: true, failStreak: true })),
  S('paths built-ins', 'GET', `${CO}/paths`, undefined, emptyTables({ enrollments: [{ course_id: 9, progress: 100 }, { course_id: 1, progress: 50 }] })),
  S('paths db rows with string course_ids', 'GET', `${CO}/paths`, undefined, emptyTables({ paths: [{ id: 1, title: 'P', course_ids: '[1, 999]' }, { id: 2, title: 'Q', course_ids: [] }] })),
  S('paths malformed course_ids', 'GET', `${CO}/paths`, undefined, emptyTables({ paths: [{ id: 1, course_ids: '{oops' }] })),
  S('paths/:id chain', 'GET', `${CO}/paths/3`, undefined, emptyTables({ enrollments: [{ course_id: 9, progress: 100 }, { course_id: 1, progress: 40 }] })),
  S('paths/:id unlocked chain', 'GET', `${CO}/paths/1`, undefined, emptyTables({ enrollments: [{ course_id: 9, progress: 100 }] })),
  S('paths/:id 404', 'GET', `${CO}/paths/99`, undefined, emptyTables()),
  S('paths/:id non-numeric', 'GET', `${CO}/paths/abc`, undefined, emptyTables()),
  S('course not enrolled', 'GET', `${CO}/2`, undefined, emptyTables()),
  S('course enrolled', 'GET', `${CO}/2`, undefined, emptyTables({ enrollments: [{ course_id: 2, progress: 25, completed_lessons: ['l1', 'l2'] }] })),
  S('course enrolled null lessons', 'GET', `${CO}/2`, undefined, emptyTables({ enrollments: [{ course_id: 2, progress: 0, completed_lessons: null }] })),
  S('course 404', 'GET', `${CO}/999`, undefined, emptyTables()),
  S('course non-numeric', 'GET', `${CO}/abc`, undefined, emptyTables()),
  S('course enrollments table missing', 'GET', `${CO}/1`, undefined, emptyTables({ failEnrollments: true })),
  S('enroll ok', 'POST', `${CO}/3/enroll`, undefined, emptyTables()),
  S('enroll 404', 'POST', `${CO}/999/enroll`, undefined, emptyTables()),
  S('enroll insert fails', 'POST', `${CO}/3/enroll`, undefined, (sql, p) => (/^INSERT INTO course_enrollments/.test(sql) ? dbError('constraint')() : emptyTables()(sql, p))),
  S('progress post: auto-enroll + first streak', 'POST', `${CO}/4/progress`, { lessonId: 'l1', completed: true }, emptyTables()),
  S('progress post: complete existing', 'POST', `${CO}/4/progress`, { lessonId: 'l2', completed: true }, emptyTables({ enrollments: [{ course_id: 4, progress: 20, completed_lessons: '["l1"]' }], streak: { current: 4, longest: 6, last_date: '2026-09-19' } })),
  S('progress post: uncomplete', 'POST', `${CO}/4/progress`, { lessonId: 'l1', completed: false }, emptyTables({ enrollments: [{ course_id: 4, progress: 40, completed_lessons: ['l1', 'l2'] }], streak: { current: 4, longest: 6, last_date: '2026-09-18' } })),
  S('progress post: completed omitted', 'POST', `${CO}/4/progress`, { lessonId: 'l2' }, emptyTables({ enrollments: [{ course_id: 4, progress: 40, completed_lessons: ['l1', 'l2'] }], streak: { current: 4, longest: 6, last_date: '2026-08-01' } })),
  S('progress post: duplicate lesson', 'POST', `${CO}/4/progress`, { lessonId: 'l1', completed: true }, emptyTables({ enrollments: [{ course_id: 4, progress: 20, completed_lessons: ['l1'] }], streak: { current: 1, longest: 1, last_date: null } })),
  S('progress post: reaches 100', 'POST', `${CO}/4/progress`, { lessonId: 'l5', completed: true }, emptyTables({ enrollments: [{ course_id: 4, progress: 80, completed_lessons: ['l1', 'l2', 'l3', 'l4'] }], streak: { current: 4, longest: 6, last_date: '2026-09-18' } })),
  S('progress post: db course with json syllabus', 'POST', `${CO}/2/progress`, { lessonId: 'a', completed: true }, emptyTables({ courses: dbCourses })),
  S('progress post: streak failure swallowed', 'POST', `${CO}/4/progress`, { lessonId: 'l1', completed: true }, emptyTables({ failStreak: true })),
  S('progress post: enrollment select fails', 'POST', `${CO}/4/progress`, { lessonId: 'l1', completed: true }, emptyTables({ failEnrollments: true })),
  S('progress post: missing lessonId', 'POST', `${CO}/4/progress`, { completed: true }, emptyTables()),
  S('progress post: 404', 'POST', `${CO}/999/progress`, { lessonId: 'l1' }, emptyTables()),
  S('progress post: update fails', 'POST', `${CO}/4/progress`, { lessonId: 'l1', completed: true }, (sql, p) => (/^UPDATE course_enrollments/.test(sql) ? dbError('deadlock')() : emptyTables()(sql, p))),
  S('progress post: empty body (Content-Length: 0)', 'POST', `${CO}/4/progress`, undefined, emptyTables()),
];

const ALL = [...communityScenarios, ...projectBuilderScenarios, ...coursesScenarios];

describe('Express original vs Worker port: same requests, same scripted db', () => {
  it('covers every one of the 26 endpoints', () => {
    const seen = new Set(ALL.map((s) => `${s.method} ${s.path.split('?')[0].replace(/\/\d+(?=\/|$)/g, '/:id').replace(/\/(abc|999)(?=\/|$)/g, '/:id')}`));
    const expected = [
      'GET /api/community/forums', 'GET /api/community/forums/dsa', 'GET /api/community/forums/thread/:id', 'POST /api/community/forums/thread',
      'POST /api/community/forums/thread/:id/reply', 'POST /api/community/forums/thread/:id/vote', 'GET /api/community/groups', 'POST /api/community/groups',
      'GET /api/community/events', 'GET /api/community/leaderboard', 'POST /api/community/communication/practice', 'POST /api/community/communication/email',
      'POST /api/project-builder/generate', 'POST /api/project-builder/readme', 'POST /api/project-builder/deployment', 'GET /api/project-builder/workspace',
      'POST /api/project-builder/workspace', 'PUT /api/project-builder/workspace/:id', 'GET /api/project-builder/templates',
      'GET /api/courses', 'GET /api/courses/progress', 'GET /api/courses/paths', 'GET /api/courses/paths/:id', 'GET /api/courses/:id',
      'POST /api/courses/:id/enroll', 'POST /api/courses/:id/progress',
    ];
    for (const e of expected) expect(seen).toContain(e);
  });

  it.each(ALL.map((s) => [s.name, s]))('%s', async (_name, sc) => {
    const ex = await runExpress(sc);
    const wk = await runWorker(sc);

    expect({ status: wk.status, body: wk.body }).toEqual({ status: ex.status, body: ex.body });
    expect(wk.calls).toEqual(ex.calls);
    expect(wk.ai).toEqual(ex.ai);
    expect(wk.logs).toEqual(ex.logs);
  });

  // supertest/Node always send Content-Length: 0 for a payload-less POST, which Express parses as {}. A request with
  // neither Content-Length nor Transfer-Encoding leaves the parsed body undefined on Express 5; prove the Worker
  // matches that too (the README's getBody contract) using a raw socket against the real Express router.
  it.each([
    ['POST', '/api/community/forums/thread'],
    ['POST', '/api/project-builder/generate'],
    ['PUT', '/api/project-builder/workspace/3'],
    ['POST', '/api/courses/4/progress'],
  ])('a truly bodyless %s %s: Express and the Worker answer identically', async (method, path) => {
    const server = http.createServer(expressApp);
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const { port } = server.address();
    const raw = await new Promise((resolve, reject) => {
      const sock = net.connect(port, '127.0.0.1', () => {
        sock.write([`${method} ${path} HTTP/1.1`, 'Host: t', 'Content-Type: application/json', 'Connection: close', '', ''].join(CRLF));
      });
      let data = '';
      sock.on('data', (d) => { data += d; });
      sock.on('end', () => resolve(data));
      sock.on('error', reject);
    });
    await new Promise((r) => server.close(r));
    const status = Number(raw.split(' ')[1]);
    const bodyText = raw.slice(raw.indexOf(CRLF + CRLF) + 4);
    const expressBody = JSON.parse(bodyText.slice(bodyText.indexOf('{'), bodyText.lastIndexOf('}') + 1));

    jest.spyOn(console, 'error').mockImplementation(() => {});
    const H = makeLarge1({ plan: 3, script: wrapHandler(() => []) });
    const res = await H.authed(path, { method, headers: { 'Content-Type': 'application/json' } });
    expect({ status: res.status, body: await res.json() }).toEqual({ status, body: expressBody });
    expect(status).toBe(500);
  });

  it('sanity: the harness would notice a difference (guards against comparing nothing)', async () => {
    const ex = await runExpress(S('x', 'GET', `${CM}/leaderboard`, undefined, () => []));
    expect(ex.status).toBe(200);
    expect(ex.body.leaderboard).toHaveLength(10);
    const wk = await runWorker(S('x', 'GET', `${CM}/forums`, undefined, () => []));
    expect(wk.body).not.toEqual(ex.body);
  });
});
