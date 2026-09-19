'use strict';

/**
 * Behavioural tests for routes/practice.js (Worker port), run through the full Worker stack
 * (createApp middleware chain -> authenticateToken -> requirePlan(1) -> handler) against the in-memory fakes.
 * Reference data (problems, assessments, prompts, fallback-hint text) is read from the EXPRESS source, so
 * a response that matches here matches what Render would send for the same data.
 *
 * Expectations were written from reading the Express handler, including its quirks. The quirks marked
 * PRESERVED BUG are pre-existing Express behaviour that the port must NOT fix (ADR 4.3, brief rule 4).
 * Proves ported logic only: NOT SQL correctness, Neon, or the Workers runtime.
 */
const { buildPractice, makeAiClient, USER_ID } = require('./helpers/practiceHarness');
const { data } = require('./helpers/expressReference');

const {
  FALLBACK_PROBLEMS: PROBLEMS,
  FALLBACK_ASSESSMENTS: ASSESSMENTS,
  SYSTEM_PROMPT_RUN,
  SYSTEM_PROMPT_SUBMIT,
  SYSTEM_PROMPT_HINT,
  generateFallbackHint,
} = data();

const problem = (id) => PROBLEMS.find((p) => p.id === id);
const OTHER_USER = 99;

let errSpy;
beforeEach(() => {
  errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});
const loggedErrors = () => errSpy.mock.calls.map((c) => c.join(' '));

const json = async (res) => res.json();

// ---------------------------------------------------------------------------------------------------
describe('GET /api/practice/problems', () => {
  it('lists every fallback problem, summary fields only, in data order (no DB rows: all New, none bookmarked)', async () => {
    const H = buildPractice();
    const res = await H.get('/api/practice/problems');
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(Object.keys(body)).toEqual(['problems', 'total', 'page', 'totalPages']);
    expect(body).toMatchObject({ total: PROBLEMS.length, page: 1, totalPages: 1 });
    expect(body.problems).toEqual(
      PROBLEMS.map((p) => ({
        id: p.id, title: p.title, difficulty: p.difficulty, category: p.category,
        acceptance: p.acceptance, tags: p.tags, status: 'New', bookmarked: false,
      }))
    );
    expect(Object.keys(body.problems[0])).toEqual(['id', 'title', 'difficulty', 'category', 'acceptance', 'tags', 'status', 'bookmarked']);
    expect(body.problems[0]).not.toHaveProperty('description');
    expect(body.problems[0]).not.toHaveProperty('starterCode');
  });

  it('issues exactly the three per-user status queries, in order, with the user id', async () => {
    const H = buildPractice();
    await H.get('/api/practice/problems');
    expect(H.db.practiceCalls).toEqual([
      { sql: 'SELECT DISTINCT problem_id FROM practice_submissions WHERE user_id = $1 AND passed = true', params: [USER_ID] },
      { sql: 'SELECT DISTINCT problem_id FROM practice_submissions WHERE user_id = $1', params: [USER_ID] },
      { sql: 'SELECT problem_id FROM practice_bookmarks WHERE user_id = $1', params: [USER_ID] },
    ]);
  });

  it('annotates Solved / Attempted / New and bookmarked from the DB, only for THIS user', async () => {
    const H = buildPractice();
    const t = H.db.practice;
    t.submissions.push(
      { id: 1, user_id: USER_ID, problem_id: 'two-sum', passed: true, created_at: new Date() },
      { id: 2, user_id: USER_ID, problem_id: 'two-sum', passed: false, created_at: new Date() },
      { id: 3, user_id: USER_ID, problem_id: 'reverse-string', passed: false, created_at: new Date() },
      { id: 4, user_id: OTHER_USER, problem_id: 'binary-search', passed: true, created_at: new Date() }
    );
    t.bookmarks.push({ id: 1, user_id: USER_ID, problem_id: 'binary-search' }, { id: 2, user_id: OTHER_USER, problem_id: 'two-sum' });
    const { problems } = await json(await H.get('/api/practice/problems'));
    const by = (id) => problems.find((p) => p.id === id);
    expect(by('two-sum')).toMatchObject({ status: 'Solved', bookmarked: false }); // solved wins over attempted
    expect(by('reverse-string')).toMatchObject({ status: 'Attempted', bookmarked: false });
    expect(by('binary-search')).toMatchObject({ status: 'New', bookmarked: true }); // other user's solve ignored
    expect(by('valid-parentheses')).toMatchObject({ status: 'New', bookmarked: false });
  });

  it.each([
    ['category=Strings', { category: 'Strings' }, (p) => p.category === 'Strings'],
    ['difficulty=Hard', { difficulty: 'Hard' }, (p) => p.difficulty === 'Hard'],
    ['category=All is no filter', { category: 'All' }, () => true],
    ['difficulty=All is no filter', { difficulty: 'All' }, () => true],
    ['category + difficulty', { category: 'Arrays', difficulty: 'Easy' }, (p) => p.category === 'Arrays' && p.difficulty === 'Easy'],
    ['search matches title (case-insensitive)', { search: 'TWO SUM' }, (p) => p.title.toLowerCase().includes('two sum')],
    ['search matches category', { search: 'sql' }, (p) => p.category.toLowerCase().includes('sql')],
    ['search matches tag', { search: 'sliding' }, (p) => p.tags.some((t) => t.toLowerCase().includes('sliding'))],
    ['search with no hit', { search: 'zzz-nothing' }, () => false],
    ['empty search is no filter', { search: '' }, () => true],
    ['unknown category', { category: 'Nope' }, () => false],
  ])('filters: %s', async (_label, query, predicate) => {
    const H = buildPractice();
    const qs = new URLSearchParams(query).toString();
    const body = await json(await H.get(`/api/practice/problems?${qs}`));
    const want = PROBLEMS.filter(predicate);
    expect(body.problems.map((p) => p.id)).toEqual(want.map((p) => p.id));
    expect(body.total).toBe(want.length);
    expect(body.totalPages).toBe(Math.ceil(want.length / 20));
  });

  it('status filter runs after annotation: Solved / Attempted / New / All', async () => {
    const H = buildPractice();
    H.db.practice.submissions.push(
      { id: 1, user_id: USER_ID, problem_id: 'two-sum', passed: true, created_at: new Date() },
      { id: 2, user_id: USER_ID, problem_id: 'binary-search', passed: false, created_at: new Date() }
    );
    const ids = async (q) => (await json(await H.get(`/api/practice/problems?${q}`))).problems.map((p) => p.id);
    expect(await ids('status=Solved')).toEqual(['two-sum']);
    expect(await ids('status=Attempted')).toEqual(['binary-search']);
    expect(await ids('status=New')).toHaveLength(PROBLEMS.length - 2);
    expect(await ids('status=All')).toHaveLength(PROBLEMS.length);
    expect(await ids('status=bogus')).toEqual([]);
  });

  it('pagination: perPage 20; page past the end is an empty page; page echoes Number(page)', async () => {
    const H = buildPractice();
    const p1 = await json(await H.get('/api/practice/problems?page=1'));
    expect(p1.problems).toHaveLength(Math.min(20, PROBLEMS.length));
    const p2 = await json(await H.get('/api/practice/problems?page=2'));
    expect(p2).toEqual({ problems: [], total: PROBLEMS.length, page: 2, totalPages: Math.ceil(PROBLEMS.length / 20) });
  });

  it('PRESERVED QUIRKS: page=0 and page=abc return an empty list; NaN page serialises as null; negative page too', async () => {
    const H = buildPractice();
    expect(await json(await H.get('/api/practice/problems?page=0'))).toMatchObject({ problems: [], page: 0 });
    expect(await json(await H.get('/api/practice/problems?page=abc'))).toMatchObject({ problems: [], page: null });
    expect(await json(await H.get('/api/practice/problems?page=-1'))).toMatchObject({ problems: [], page: -1 });
  });

  it('PRESERVED BUG: a repeated `search` param (array) makes .toLowerCase throw -> 500 Failed to fetch problems', async () => {
    const H = buildPractice();
    const res = await H.get('/api/practice/problems?search=a&search=b');
    expect(res.status).toBe(500);
    expect(await json(res)).toEqual({ error: 'Failed to fetch problems' });
    expect(loggedErrors().join('\n')).toMatch(/GET \/problems error: .*toLowerCase/);
  });

  it('DB unavailable: still 200, everything New and unbookmarked (the queries are swallowed)', async () => {
    const H = buildPractice();
    H.db.failPractice('practice_');
    const res = await H.get('/api/practice/problems');
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.problems.every((p) => p.status === 'New' && p.bookmarked === false)).toBe(true);
    expect(body.total).toBe(PROBLEMS.length);
  });

  it('a failure in only the bookmarks query keeps the statuses', async () => {
    const H = buildPractice();
    H.db.practice.submissions.push({ id: 1, user_id: USER_ID, problem_id: 'two-sum', passed: true, created_at: new Date() });
    H.db.failPractice('FROM practice_bookmarks');
    const { problems } = await json(await H.get('/api/practice/problems'));
    expect(problems.find((p) => p.id === 'two-sum')).toMatchObject({ status: 'Solved', bookmarked: false });
  });

  it('trailing slash still routes (Express is non-strict)', async () => {
    const H = buildPractice();
    expect((await H.get('/api/practice/problems/')).status).toBe(200);
  });
});

// ---------------------------------------------------------------------------------------------------
describe('GET /api/practice/problems/:id', () => {
  it('returns the full problem plus bookmarked and previousSubmissions (empty by default)', async () => {
    const H = buildPractice();
    const res = await H.get('/api/practice/problems/two-sum');
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body).toEqual({ ...problem('two-sum'), bookmarked: false, previousSubmissions: [] });
    expect(Object.keys(body)).toEqual([...Object.keys(problem('two-sum')), 'bookmarked', 'previousSubmissions']);
  });

  it('shows the bookmark and the latest 5 submissions of THIS user for THIS problem, newest first', async () => {
    const H = buildPractice();
    const t = H.db.practice;
    t.bookmarks.push({ id: 1, user_id: USER_ID, problem_id: 'two-sum' });
    for (let i = 1; i <= 7; i++) {
      t.submissions.push({ id: i, user_id: USER_ID, problem_id: 'two-sum', language: 'python', passed: i % 2 === 0, feedback: `f${i}`, code: 'secret', created_at: new Date(Date.UTC(2026, 0, i)) });
    }
    t.submissions.push({ id: 50, user_id: OTHER_USER, problem_id: 'two-sum', language: 'java', passed: true, feedback: 'other', created_at: new Date(Date.UTC(2026, 5, 1)) });
    t.submissions.push({ id: 51, user_id: USER_ID, problem_id: 'binary-search', language: 'java', passed: true, feedback: 'wrong problem', created_at: new Date(Date.UTC(2026, 5, 1)) });
    const body = await json(await H.get('/api/practice/problems/two-sum'));
    expect(body.bookmarked).toBe(true);
    expect(body.previousSubmissions.map((s) => s.id)).toEqual([7, 6, 5, 4, 3]);
    expect(Object.keys(body.previousSubmissions[0])).toEqual(['id', 'language', 'passed', 'feedback', 'created_at']);
    expect(body.previousSubmissions[0]).toEqual({ id: 7, language: 'python', passed: false, feedback: 'f7', created_at: '2026-01-07T00:00:00.000Z' });
    expect(JSON.stringify(body)).not.toContain('secret'); // the stored code is never selected
  });

  it('404 {"error":"Problem not found"} for an unknown id, without touching the DB', async () => {
    const H = buildPractice();
    const res = await H.get('/api/practice/problems/nope');
    expect(res.status).toBe(404);
    expect(await json(res)).toEqual({ error: 'Problem not found' });
    expect(H.db.practiceCalls).toEqual([]);
  });

  it('DB unavailable: still 200 with bookmarked false and no submissions', async () => {
    const H = buildPractice();
    H.db.failPractice('practice_');
    const body = await json(await H.get('/api/practice/problems/binary-search'));
    expect(body).toEqual({ ...problem('binary-search'), bookmarked: false, previousSubmissions: [] });
  });

  it('a static sibling path is not swallowed by the :id route (/problems/x/run is POST only)', async () => {
    const H = buildPractice();
    const res = await H.get('/api/practice/problems/two-sum/run');
    expect(res.status).toBe(404);
    expect(res.headers.get('content-type')).toContain('text/html');
    expect(await res.text()).toContain('<pre>Cannot GET /api/practice/problems/two-sum/run</pre>');
  });
});

// ---------------------------------------------------------------------------------------------------
describe('AI-backed endpoints share one contract', () => {
  // callAI resolves { ok, error, data } in the real client; extractJSON(object) throws TypeError
  const REAL_SHAPE = async () => ({ ok: true, error: null, data: '{"hint":"a real model hint","level":2}' });

  describe('POST /api/practice/problems/:id/run', () => {
    const URL = '/api/practice/problems/two-sum/run';
    const BODY = { code: 'function twoSum(){}', language: 'javascript' };
    const fallbackRun = (p) => ({
      results: p.testCases.map((tc, i) => ({ testCase: i + 1, input: tc.input, expected: tc.expected, actual: 'Unable to evaluate (AI unavailable)', passed: false })),
      summary: 'AI evaluation is currently unavailable. Please try again later.',
    });

    it('404 for an unknown problem', async () => {
      const H = buildPractice();
      const res = await H.post('/api/practice/problems/nope/run', BODY);
      expect(res.status).toBe(404);
      expect(await json(res)).toEqual({ error: 'Problem not found' });
      expect(H.ai.callAI).not.toHaveBeenCalled();
    });

    it.each([
      ['code missing', { language: 'javascript' }],
      ['language missing', { code: 'x' }],
      ['code empty', { code: '', language: 'javascript' }],
      ['language empty', { code: 'x', language: '' }],
      ['empty object', {}],
    ])('400 Code and language are required when %s', async (_l, body) => {
      const H = buildPractice();
      const res = await H.post(URL, body);
      expect(res.status).toBe(400);
      expect(await json(res)).toEqual({ error: 'Code and language are required' });
      expect(H.ai.callAI).not.toHaveBeenCalled();
    });

    it('PRESERVED: a request with no JSON body destructures undefined -> 500 Failed to run code', async () => {
      const H = buildPractice();
      const res = await H.post(URL, undefined);
      expect(res.status).toBe(500);
      expect(await json(res)).toEqual({ error: 'Failed to run code' });
      expect(loggedErrors().join('\n')).toMatch(/POST \/problems\/:id\/run error:/);
    });

    it('calls callAI once with exactly the Express prompt and options', async () => {
      const H = buildPractice();
      await H.post(URL, BODY);
      expect(H.ai.callAI).toHaveBeenCalledTimes(1);
      const p = problem('two-sum');
      expect(H.ai.callAI.mock.calls[0][0]).toEqual({
        systemPrompt: SYSTEM_PROMPT_RUN,
        userPrompt: `Problem: ${p.title}
Description: ${p.description}
Test Cases:
${p.testCases.map((tc, i) => `Test ${i + 1}: Input: ${tc.input} | Expected: ${tc.expected}`).join('\n')}

User's Code (javascript):
function twoSum(){}

Evaluate this code against the test cases.`,
        maxTokens: 800,
        temperature: 0.2,
        structuredJson: true,
      });
    });

    it('PRESERVED BUG: callAI resolves an { ok, data } object, extractJSON(object) throws, so the fallback is ALWAYS returned (AI output is never used)', async () => {
      const H = buildPractice({ aiClient: makeAiClient({ callAI: jest.fn(REAL_SHAPE) }) });
      const res = await H.post(URL, BODY);
      expect(res.status).toBe(200);
      expect(await json(res)).toEqual(fallbackRun(problem('two-sum')));
    });

    it('callAI rejecting gives the same fallback (200)', async () => {
      const H = buildPractice({ aiClient: makeAiClient({ callAI: jest.fn(async () => { throw new Error('provider down'); }) }) });
      const res = await H.post(URL, BODY);
      expect(res.status).toBe(200);
      expect(await json(res)).toEqual(fallbackRun(problem('two-sum')));
    });

    it('no aiClient service registered at all also degrades to the fallback (same catch), never a 500', async () => {
      const H = buildPractice({ aiClient: null });
      const res = await H.post(URL, BODY);
      expect(res.status).toBe(200);
      expect(await json(res)).toEqual(fallbackRun(problem('two-sum')));
    });

    it('if callAI DID resolve raw text (a fixed client), the extracted JSON is returned untouched, fenced or not', async () => {
      const payload = { results: [{ testCase: 1, passed: true }], summary: 'ok' };
      for (const text of [JSON.stringify(payload), '```json\n' + JSON.stringify(payload) + '\n```', 'sure: ' + JSON.stringify(payload) + ' done']) {
        const H = buildPractice({ aiClient: makeAiClient({ callAI: jest.fn(async () => text) }) });
        const res = await H.post(URL, BODY);
        expect(res.status).toBe(200);
        expect(await json(res)).toEqual(payload);
      }
    });

    it('unparseable raw text: extractJSON returns null and the body is a literal null (200)', async () => {
      const H = buildPractice({ aiClient: makeAiClient({ callAI: jest.fn(async () => 'no json here') }) });
      const res = await H.post(URL, BODY);
      expect(res.status).toBe(200);
      expect(await res.text()).toBe('null');
    });

    it('does not touch the database', async () => {
      const H = buildPractice();
      await H.post(URL, BODY);
      expect(H.db.practiceCalls).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------------------------------
  describe('POST /api/practice/problems/:id/submit', () => {
    const URL = '/api/practice/problems/two-sum/submit';
    const BODY = { code: 'return [0,1]', language: 'python' };
    const fallbackEval = (p) => ({
      passed: false,
      results: p.testCases.map((tc, i) => ({ testCase: i + 1, input: tc.input, expected: tc.expected, actual: 'Unable to evaluate', passed: false })),
      feedback: 'AI evaluation is currently unavailable. Your submission has been recorded.',
      timeComplexity: 'N/A',
      spaceComplexity: 'N/A',
      suggestions: ['Try again when AI evaluation is available.'],
    });

    it('404 unknown problem; 400 missing code/language; no body -> 500 Failed to submit solution', async () => {
      const H = buildPractice();
      expect((await H.post('/api/practice/problems/nope/submit', BODY)).status).toBe(404);
      const bad = await H.post(URL, { code: 'x' });
      expect(bad.status).toBe(400);
      expect(await json(bad)).toEqual({ error: 'Code and language are required' });
      const none = await H.post(URL, undefined);
      expect(none.status).toBe(500);
      expect(await json(none)).toEqual({ error: 'Failed to submit solution' });
      expect(H.db.practice.submissions).toEqual([]);
      expect(H.ai.callAI).not.toHaveBeenCalled();
    });

    it('calls callAI once with exactly the Express prompt (incl. constraints) and options', async () => {
      const H = buildPractice();
      await H.post(URL, BODY);
      const p = problem('two-sum');
      expect(H.ai.callAI).toHaveBeenCalledTimes(1);
      expect(H.ai.callAI.mock.calls[0][0]).toEqual({
        systemPrompt: SYSTEM_PROMPT_SUBMIT,
        userPrompt: `Problem: ${p.title}
Description: ${p.description}
Constraints: ${p.constraints.join(', ')}
Test Cases:
${p.testCases.map((tc, i) => `Test ${i + 1}: Input: ${tc.input} | Expected: ${tc.expected}`).join('\n')}

User's Solution (python):
return [0,1]

Evaluate this solution thoroughly.`,
        maxTokens: 1200,
        temperature: 0.3,
        structuredJson: true,
      });
    });

    it('PRESERVED BUG: real-shaped callAI result -> fallback evaluation returned AND recorded', async () => {
      const H = buildPractice({ aiClient: makeAiClient({ callAI: jest.fn(REAL_SHAPE) }) });
      const res = await H.post(URL, BODY);
      expect(res.status).toBe(200);
      const body = await json(res);
      expect(body).toEqual(fallbackEval(problem('two-sum')));
      expect(H.db.practice.submissions).toHaveLength(1);
      expect(H.db.practiceCalls[0]).toEqual({
        sql: 'INSERT INTO practice_submissions (user_id, problem_id, code, language, passed, results, feedback) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        params: [USER_ID, 'two-sum', 'return [0,1]', 'python', false, JSON.stringify(body.results), body.feedback],
      });
    });

    it('a resolved raw JSON evaluation passes through and is saved with its own passed/results/feedback', async () => {
      const evaluation = { passed: true, results: [{ testCase: 1, passed: true }], feedback: 'nice', timeComplexity: 'O(n)', spaceComplexity: 'O(n)', suggestions: [] };
      const H = buildPractice({ aiClient: makeAiClient({ callAI: jest.fn(async () => JSON.stringify(evaluation)) }) });
      const res = await H.post(URL, BODY);
      expect(await json(res)).toEqual(evaluation);
      expect(H.db.practice.submissions[0]).toMatchObject({ user_id: USER_ID, problem_id: 'two-sum', passed: true, feedback: 'nice', results: JSON.stringify(evaluation.results) });
    });

    it('a missing `passed` is stored as false; a missing `results` is stored as undefined (JSON.stringify(undefined))', async () => {
      const H = buildPractice({ aiClient: makeAiClient({ callAI: jest.fn(async () => '{"feedback":"meh"}') }) });
      await H.post(URL, BODY);
      const [, , , , passed, results, feedback] = H.db.practiceCalls[0].params;
      expect([passed, results, feedback]).toEqual([false, undefined, 'meh']);
    });

    it('a DB insert failure is logged and swallowed: still 200 with the evaluation', async () => {
      const H = buildPractice();
      H.db.failPractice('INSERT INTO practice_submissions', new Error('disk full'));
      const res = await H.post(URL, BODY);
      expect(res.status).toBe(200);
      expect(await json(res)).toEqual(fallbackEval(problem('two-sum')));
      expect(loggedErrors()).toContain('Failed to save submission: disk full');
    });

    it('PRESERVED: unparseable AI text -> evaluation null -> nothing saved (TypeError swallowed by the save try) and body is a literal null', async () => {
      const H = buildPractice({ aiClient: makeAiClient({ callAI: jest.fn(async () => 'garbage') }) });
      const res = await H.post(URL, BODY);
      expect(res.status).toBe(200);
      expect(await res.text()).toBe('null');
      expect(H.db.practice.submissions).toEqual([]);
      expect(loggedErrors().join('\n')).toMatch(/Failed to save submission: .*(passed|null)/);
    });

    it('a saved submission shows up in the problem detail and in stats', async () => {
      const H = buildPractice();
      await H.post(URL, BODY);
      const detail = await json(await H.get('/api/practice/problems/two-sum'));
      expect(detail.previousSubmissions).toHaveLength(1);
      expect(detail.previousSubmissions[0]).toMatchObject({ language: 'python', passed: false });
      const stats = await json(await H.get('/api/practice/stats'));
      expect(stats.totalAttempted).toBe(1);
      expect(stats.totalSolved).toBe(0);
    });
  });

  // -------------------------------------------------------------------------------------------------
  describe('POST /api/practice/problems/:id/hint', () => {
    const URL = '/api/practice/problems/two-sum/hint';

    it('404 unknown problem', async () => {
      const H = buildPractice();
      const res = await H.post('/api/practice/problems/nope/hint', {});
      expect(res.status).toBe(404);
      expect(await json(res)).toEqual({ error: 'Problem not found' });
    });

    it('PRESERVED: no JSON body destructures undefined -> 500 Failed to get hint', async () => {
      const H = buildPractice();
      const res = await H.post(URL, undefined);
      expect(res.status).toBe(500);
      expect(await json(res)).toEqual({ error: 'Failed to get hint' });
    });

    it('an empty body defaults hintLevel to 1', async () => {
      const H = buildPractice();
      const body = await json(await H.post(URL, {}));
      expect(body).toEqual({ hint: generateFallbackHint(problem('two-sum'), 1), level: 1 });
      expect(H.ai.callAI.mock.calls[0][0].userPrompt).toContain('Please provide a Level 1 hint for this problem.');
    });

    it.each([
      [1, 1], [2, 2], [3, 3], ['2', 2], [0, 1], [-5, 1], [99, 3], [true, 1], [null, 1],
    ])('hintLevel %p -> clamped level %p', async (input, level) => {
      const H = buildPractice();
      const res = await H.post(URL, { hintLevel: input });
      expect(res.status).toBe(200);
      expect(await json(res)).toEqual({ hint: generateFallbackHint(problem('two-sum'), level), level });
    });

    it('PRESERVED QUIRKS: hintLevel "abc" -> NaN level (serialised null) with the level-1 text; 2.5 -> level 2.5 with the level-1 text', async () => {
      const H = buildPractice();
      const nan = await json(await H.post(URL, { hintLevel: 'abc' }));
      expect(nan).toEqual({ hint: generateFallbackHint(problem('two-sum'), 1), level: null });
      const frac = await json(await H.post(URL, { hintLevel: 2.5 }));
      expect(frac).toEqual({ hint: generateFallbackHint(problem('two-sum'), 1), level: 2.5 });
    });

    it('calls callAI once with exactly the Express prompt and options', async () => {
      const H = buildPractice();
      await H.post(URL, { hintLevel: 3 });
      const p = problem('two-sum');
      expect(H.ai.callAI.mock.calls[0][0]).toEqual({
        systemPrompt: SYSTEM_PROMPT_HINT,
        userPrompt: `Problem: ${p.title}
Description: ${p.description}
Category: ${p.category}
Difficulty: ${p.difficulty}
Tags: ${p.tags.join(', ')}

Please provide a Level 3 hint for this problem.`,
        maxTokens: 400,
        temperature: 0.5,
        structuredJson: true,
      });
    });

    it('PRESERVED BUG: the real callAI result shape never yields the AI hint; a raw-text client would', async () => {
      const real = buildPractice({ aiClient: makeAiClient({ callAI: jest.fn(REAL_SHAPE) }) });
      expect(await json(await real.post(URL, { hintLevel: 2 }))).toEqual({ hint: generateFallbackHint(problem('two-sum'), 2), level: 2 });
      const raw = buildPractice({ aiClient: makeAiClient({ callAI: jest.fn(async () => '{"hint":"model hint","level":2}') }) });
      expect(await json(await raw.post(URL, { hintLevel: 2 }))).toEqual({ hint: 'model hint', level: 2 });
    });

    it('does not touch the database', async () => {
      const H = buildPractice();
      await H.post(URL, { hintLevel: 1 });
      expect(H.db.practiceCalls).toEqual([]);
    });
  });
});

// ---------------------------------------------------------------------------------------------------
describe('GET /api/practice/assessments', () => {
  it('lists the assessments without questions; bestScore null and attempts 0 with no submissions', async () => {
    const H = buildPractice();
    const res = await H.get('/api/practice/assessments');
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(Object.keys(body)).toEqual(['assessments']);
    expect(body.assessments).toEqual(
      ASSESSMENTS.map((a) => ({
        id: a.id, title: a.title, type: a.type, duration: a.duration, questionCount: a.questionCount,
        difficulty: a.difficulty, topics: a.topics, bestScore: null, attempts: 0,
      }))
    );
    expect(Object.keys(body.assessments[0])).toEqual(['id', 'title', 'type', 'duration', 'questionCount', 'difficulty', 'topics', 'bestScore', 'attempts']);
    expect(H.db.practiceCalls).toEqual([
      {
        sql: 'SELECT assessment_id, MAX(score) as best_score, COUNT(*) as attempts FROM assessment_submissions WHERE user_id = $1 GROUP BY assessment_id',
        params: [USER_ID],
      },
    ]);
  });

  it('reports this user\'s best score and attempt count per assessment as numbers (pg returns strings)', async () => {
    const H = buildPractice();
    H.db.practice.assessments.push(
      { id: 1, user_id: USER_ID, assessment_id: 'ds-arrays-basics', score: 60 },
      { id: 2, user_id: USER_ID, assessment_id: 'ds-arrays-basics', score: 90 },
      { id: 3, user_id: USER_ID, assessment_id: 'skill-javascript', score: 33.5 },
      { id: 4, user_id: OTHER_USER, assessment_id: 'algo-mock-exam-1', score: 100 }
    );
    const { assessments } = await json(await H.get('/api/practice/assessments'));
    const by = (id) => assessments.find((a) => a.id === id);
    expect(by('ds-arrays-basics')).toMatchObject({ bestScore: 90, attempts: 2 });
    expect(by('skill-javascript')).toMatchObject({ bestScore: 33.5, attempts: 1 });
    expect(by('algo-mock-exam-1')).toMatchObject({ bestScore: null, attempts: 0 });
  });

  it('a best score of 0 is kept (?? not ||), not turned into null', async () => {
    const H = buildPractice();
    H.db.practice.assessments.push({ id: 1, user_id: USER_ID, assessment_id: 'ds-arrays-basics', score: 0 });
    const { assessments } = await json(await H.get('/api/practice/assessments'));
    expect(assessments.find((a) => a.id === 'ds-arrays-basics')).toMatchObject({ bestScore: 0, attempts: 1 });
  });

  it('DB unavailable: still 200 with defaults', async () => {
    const H = buildPractice();
    H.db.failPractice('assessment_submissions');
    const res = await H.get('/api/practice/assessments');
    expect(res.status).toBe(200);
    expect((await json(res)).assessments.every((a) => a.bestScore === null && a.attempts === 0)).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------------
describe('GET /api/practice/assessments/:id', () => {
  const ID = 'ds-arrays-basics';
  const assessment = ASSESSMENTS.find((a) => a.id === ID);

  it('exam mode (default) hides correct answers and explanations', async () => {
    const H = buildPractice();
    const res = await H.get(`/api/practice/assessments/${ID}`);
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(Object.keys(body)).toEqual(['id', 'title', 'type', 'duration', 'questionCount', 'difficulty', 'topics', 'questions']);
    expect(body).toMatchObject({ id: ID, title: assessment.title, questionCount: assessment.questionCount });
    expect(body.questions).toHaveLength(assessment.questions.length);
    for (const [i, q] of body.questions.entries()) {
      const src = assessment.questions[i];
      expect(q).toEqual(src.options ? { id: src.id, type: src.type, text: src.text, options: src.options } : { id: src.id, type: src.type, text: src.text });
      expect(q).not.toHaveProperty('correct');
      expect(q).not.toHaveProperty('explanation');
    }
    // the short-answer question has no options key at all
    expect(body.questions.find((q) => q.type === 'short-answer')).not.toHaveProperty('options');
  });

  it('mode=practice adds correct + explanation, in that key order', async () => {
    const H = buildPractice();
    const body = await json(await H.get(`/api/practice/assessments/${ID}?mode=practice`));
    for (const [i, q] of body.questions.entries()) {
      const src = assessment.questions[i];
      expect(q.correct).toBe(src.correct);
      expect(q.explanation).toBe(src.explanation);
    }
    expect(Object.keys(body.questions[0])).toEqual(['id', 'type', 'text', 'options', 'correct', 'explanation']);
  });

  it.each([['exam'], ['Practice'], ['bogus'], ['']])('mode=%p is treated as exam mode', async (mode) => {
    const H = buildPractice();
    const body = await json(await H.get(`/api/practice/assessments/${ID}?mode=${mode}`));
    expect(body.questions[0]).not.toHaveProperty('correct');
  });

  it('404 {"error":"Assessment not found"}', async () => {
    const H = buildPractice();
    const res = await H.get('/api/practice/assessments/nope');
    expect(res.status).toBe(404);
    expect(await json(res)).toEqual({ error: 'Assessment not found' });
  });

  it('does not touch the database', async () => {
    const H = buildPractice();
    await H.get(`/api/practice/assessments/${ID}`);
    expect(H.db.practiceCalls).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------------
describe('POST /api/practice/assessments/:id/submit', () => {
  const ID = 'ds-arrays-basics';
  const URL = `/api/practice/assessments/${ID}/submit`;
  const assessment = ASSESSMENTS.find((a) => a.id === ID);
  const perfect = () => Object.fromEntries(assessment.questions.map((q) => [q.id, q.correct]));
  /** first k answers right, the rest wrong */
  const withCorrect = (k) => Object.fromEntries(assessment.questions.map((q, i) => [q.id, i < k ? q.correct : 'definitely wrong']));

  it('404 unknown assessment', async () => {
    const H = buildPractice();
    const res = await H.post('/api/practice/assessments/nope/submit', { answers: {} });
    expect(res.status).toBe(404);
    expect(await json(res)).toEqual({ error: 'Assessment not found' });
  });

  it.each([
    ['answers missing', {}],
    ['answers null', { answers: null }],
    ['answers a string', { answers: 'abc' }],
    ['answers a number', { answers: 5 }],
    ['answers 0', { answers: 0 }],
    ['answers empty string', { answers: '' }],
    ['answers false', { answers: false }],
  ])('400 Answers are required when %s', async (_l, body) => {
    const H = buildPractice();
    const res = await H.post(URL, body);
    expect(res.status).toBe(400);
    expect(await json(res)).toEqual({ error: 'Answers are required' });
    expect(H.db.practice.assessments).toEqual([]);
  });

  it('PRESERVED: no JSON body destructures undefined -> 500 Failed to submit assessment', async () => {
    const H = buildPractice();
    const res = await H.post(URL, undefined);
    expect(res.status).toBe(500);
    expect(await json(res)).toEqual({ error: 'Failed to submit assessment' });
  });

  it('grades a perfect submission: 100, percentile 95, per-question results with the exact key order', async () => {
    const H = buildPractice();
    const res = await H.post(URL, { answers: perfect(), timeTaken: 600 });
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(Object.keys(body)).toEqual(['score', 'correct', 'total', 'percentile', 'timeTaken', 'results']);
    expect(body).toMatchObject({ score: 100, correct: 10, total: 10, percentile: 95, timeTaken: 600 });
    expect(Object.keys(body.results[0])).toEqual(['questionId', 'text', 'type', 'userAnswer', 'correctAnswer', 'isCorrect', 'explanation']);
    expect(body.results[0]).toEqual({
      questionId: 'q1', text: assessment.questions[0].text, type: 'mcq', userAnswer: 'O(1)', correctAnswer: 'O(1)', isCorrect: true, explanation: assessment.questions[0].explanation,
    });
  });

  it.each([
    [10, 100, 95], [9, 90, 95], [8, 80, 85], [7, 70, 70], [6, 60, 55], [5, 50, 40], [4, 40, 25], [0, 0, 25],
  ])('%i/10 correct -> score %i, percentile %i', async (k, score, percentile) => {
    const H = buildPractice();
    const body = await json(await H.post(URL, { answers: withCorrect(k) }));
    expect(body).toMatchObject({ score, correct: k, total: 10, percentile, timeTaken: null });
  });

  it('compares trimmed and case-insensitively; unanswered questions are recorded with userAnswer ""', async () => {
    const H = buildPractice();
    const answers = { q1: '  o(1)  ', q3: 'TRUE', q5: 'stack', q6: ' N-1 ' };
    const body = await json(await H.post(URL, { answers }));
    expect(body.correct).toBe(4);
    expect(body.results.find((r) => r.questionId === 'q1')).toMatchObject({ userAnswer: '  o(1)  ', isCorrect: true });
    expect(body.results.find((r) => r.questionId === 'q2')).toMatchObject({ userAnswer: '', isCorrect: false });
  });

  it('PRESERVED QUIRKS: an array or an empty object is an accepted `answers` (typeof object) and scores 0', async () => {
    const H = buildPractice();
    for (const answers of [{}, []]) {
      const res = await H.post(URL, { answers });
      expect(res.status).toBe(200);
      expect(await json(res)).toMatchObject({ score: 0, correct: 0, percentile: 25 });
    }
  });

  it('timeTaken is echoed, but a falsy one (0, missing) becomes null', async () => {
    const H = buildPractice();
    expect((await json(await H.post(URL, { answers: {}, timeTaken: 0 }))).timeTaken).toBeNull();
    expect((await json(await H.post(URL, { answers: {} }))).timeTaken).toBeNull();
    expect((await json(await H.post(URL, { answers: {}, timeTaken: 95 }))).timeTaken).toBe(95);
  });

  it('saves the submission with the exact column order and JSON-stringified answers/results', async () => {
    const H = buildPractice();
    const answers = withCorrect(7);
    const body = await json(await H.post(URL, { answers, timeTaken: 321 }));
    expect(H.db.practiceCalls).toEqual([
      {
        sql: 'INSERT INTO assessment_submissions (user_id, assessment_id, answers, score, total, time_taken, results) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        params: [USER_ID, ID, JSON.stringify(answers), 70, 10, 321, JSON.stringify(body.results)],
      },
    ]);
  });

  it('a DB insert failure is logged and swallowed: still 200 with the graded result', async () => {
    const H = buildPractice();
    H.db.failPractice('INSERT INTO assessment_submissions', new Error('read-only replica'));
    const res = await H.post(URL, { answers: perfect() });
    expect(res.status).toBe(200);
    expect((await json(res)).score).toBe(100);
    expect(loggedErrors()).toContain('Failed to save assessment submission: read-only replica');
  });

  it('the submission then shows up in the assessments list and in stats', async () => {
    const H = buildPractice();
    await H.post(URL, { answers: perfect() });
    await H.post(URL, { answers: withCorrect(5) });
    const list = await json(await H.get('/api/practice/assessments'));
    expect(list.assessments.find((a) => a.id === ID)).toMatchObject({ bestScore: 100, attempts: 2 });
    const stats = await json(await H.get('/api/practice/stats'));
    expect(stats).toMatchObject({ assessmentsCompleted: 1, averageScore: 75 });
  });
});

// ---------------------------------------------------------------------------------------------------
describe('GET /api/practice/stats', () => {
  const DEFAULT_STATS = {
    totalSolved: 0, totalAttempted: 0, easySolved: 0, mediumSolved: 0, hardSolved: 0, streak: 0,
    assessmentsCompleted: 0, averageScore: 0, recentSubmissions: [], categoryBreakdown: {},
  };
  // Only Date is faked (the route uses `new Date()`); timers/microtasks stay real so the async stack runs.
  const NOW = new Date(2026, 2, 15, 10, 30, 0); // local time, so setHours(0,0,0,0) logic is timezone independent
  const freezeClock = () =>
    jest.useFakeTimers({
      now: NOW,
      doNotFake: ['hrtime', 'nextTick', 'performance', 'queueMicrotask', 'requestAnimationFrame', 'cancelAnimationFrame', 'requestIdleCallback', 'cancelIdleCallback', 'setImmediate', 'clearImmediate', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'],
    });
  const daysAgo = (n, hour = 15) => new Date(2026, 2, 15 - n, hour, 0, 0);
  const sub = (id, problem_id, passed, created_at, user_id = USER_ID) => ({ id, user_id, problem_id, language: 'python', passed, feedback: null, created_at });

  it('a brand-new user gets the default zeros (200) with the five-query sequence', async () => {
    const H = buildPractice();
    const res = await H.get('/api/practice/stats');
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body).toEqual(DEFAULT_STATS);
    expect(Object.keys(body)).toEqual(Object.keys(DEFAULT_STATS));
    expect(H.db.practiceSql()).toEqual([
      'SELECT DISTINCT problem_id FROM practice_submissions WHERE user_id = $1 AND passed = true',
      'SELECT DISTINCT problem_id FROM practice_submissions WHERE user_id = $1',
      'SELECT DISTINCT DATE(created_at) as day FROM practice_submissions WHERE user_id = $1 ORDER BY day DESC LIMIT 30',
      'SELECT problem_id, language, passed, created_at FROM practice_submissions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 10',
      'SELECT COUNT(DISTINCT assessment_id) as completed, AVG(score) as avg_score FROM assessment_submissions WHERE user_id = $1',
    ]);
  });

  it('counts solved by difficulty and category, attempted, recent (with titles) and assessment stats', async () => {
    freezeClock();
    const H = buildPractice();
    const t = H.db.practice;
    t.submissions.push(
      sub(1, 'two-sum', true, daysAgo(0)),                       // Easy Arrays
      sub(2, 'two-sum', true, daysAgo(0, 16)),                   // duplicate solve counts once (DISTINCT)
      sub(3, 'longest-common-subsequence', true, daysAgo(0, 17)), // Medium DP
      sub(4, 'median-sorted-arrays', true, daysAgo(1)),          // Hard Arrays
      sub(5, 'binary-search', false, daysAgo(1)),                // attempted only
      sub(6, 'legacy-removed-problem', true, daysAgo(2)),        // solved, but not in the fallback data
      sub(7, 'reverse-string', true, daysAgo(0), OTHER_USER)     // someone else
    );
    t.assessments.push(
      { id: 1, user_id: USER_ID, assessment_id: 'ds-arrays-basics', score: 80 },
      { id: 2, user_id: USER_ID, assessment_id: 'ds-arrays-basics', score: 60 },
      { id: 3, user_id: USER_ID, assessment_id: 'skill-javascript', score: 100 },
      { id: 4, user_id: OTHER_USER, assessment_id: 'skill-python-basics', score: 10 }
    );
    const body = await json(await H.get('/api/practice/stats'));
    expect(body).toMatchObject({
      totalSolved: 4, // two-sum, LCS, median, legacy id (DISTINCT)
      totalAttempted: 5,
      easySolved: 1, mediumSolved: 1, hardSolved: 1,
      categoryBreakdown: { Arrays: 2, DP: 1 }, // legacy id contributes to neither
      assessmentsCompleted: 2,
      averageScore: 80, // (80+60+100)/3
    });
    // most recent first, capped at 10, title falls back to the id for unknown problems
    expect(body.recentSubmissions.map((r) => r.problem_id)).toEqual([
      'longest-common-subsequence', 'two-sum', 'two-sum', 'median-sorted-arrays', 'binary-search', 'legacy-removed-problem',
    ].slice(0, 6));
    const titles = Object.fromEntries(body.recentSubmissions.map((r) => [r.problem_id, r.title]));
    expect(titles['two-sum']).toBe('Two Sum');
    expect(titles['legacy-removed-problem']).toBe('legacy-removed-problem');
    expect(Object.keys(body.recentSubmissions[0])).toEqual(['problem_id', 'language', 'passed', 'created_at', 'title']);
  });

  it('caps recent submissions at 10', async () => {
    freezeClock();
    const H = buildPractice();
    for (let i = 1; i <= 14; i++) H.db.practice.submissions.push(sub(i, 'two-sum', false, new Date(2026, 2, 1, i)));
    const body = await json(await H.get('/api/practice/stats'));
    expect(body.recentSubmissions).toHaveLength(10);
  });

  describe('streak (consecutive days, today or yesterday may start it)', () => {
    const streakFor = async (offsets) => {
      freezeClock();
      const H = buildPractice();
      offsets.forEach((n, i) => H.db.practice.submissions.push(sub(i + 1, 'two-sum', false, daysAgo(n))));
      return (await json(await H.get('/api/practice/stats'))).streak;
    };

    it.each([
      ['no submissions', [], 0],
      ['today only', [0], 1],
      ['yesterday only (streak still alive)', [1], 1],
      ['today, yesterday, the day before', [0, 1, 2], 3],
      ['yesterday and the day before', [1, 2], 2],
      ['a 2+ day gap breaks it', [0, 1, 4], 2],
      ['PRESERVED QUIRK: one skipped day is tolerated once (diff === i + 1)', [0, 1, 3], 3],
      ['PRESERVED QUIRK: today then two days ago still counts 2', [0, 2], 2],
      ['only 2 days ago (streak lost)', [2], 0],
      ['old activity only', [10, 11], 0],
    ])('%s -> %i', async (_l, offsets, want) => {
      expect(await streakFor(offsets)).toBe(want);
    });
  });

  it('PARTIAL RESULTS ARE KEPT when a later query fails (stats is mutated as it goes; one try/catch)', async () => {
    const H = buildPractice();
    H.db.practice.submissions.push(sub(1, 'two-sum', true, new Date()), sub(2, 'binary-search', false, new Date()));
    H.db.failPractice('DATE(created_at)');
    const res = await H.get('/api/practice/stats');
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({
      ...DEFAULT_STATS, totalSolved: 1, totalAttempted: 2, easySolved: 1, categoryBreakdown: { Arrays: 1 },
    });
  });

  it('DB entirely unavailable: 200 with the default zeros', async () => {
    const H = buildPractice();
    H.db.failPractice('practice_submissions');
    const res = await H.get('/api/practice/stats');
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual(DEFAULT_STATS);
  });

  it('AVG(score) null (no assessments) and COUNT string "0" both become 0', async () => {
    const H = buildPractice();
    const body = await json(await H.get('/api/practice/stats'));
    expect(body.assessmentsCompleted).toBe(0);
    expect(body.averageScore).toBe(0);
  });
});

// ---------------------------------------------------------------------------------------------------
describe('POST /api/practice/problems/:id/bookmark', () => {
  it('toggles: first call bookmarks, second removes, third bookmarks again', async () => {
    const H = buildPractice();
    const url = '/api/practice/problems/two-sum/bookmark';
    const r1 = await H.post(url, {});
    expect(r1.status).toBe(200);
    expect(await json(r1)).toEqual({ bookmarked: true });
    expect(H.db.practice.bookmarks).toEqual([{ id: 1, user_id: USER_ID, problem_id: 'two-sum' }]);
    expect(await json(await H.post(url, {}))).toEqual({ bookmarked: false });
    expect(H.db.practice.bookmarks).toEqual([]);
    expect(await json(await H.post(url, {}))).toEqual({ bookmarked: true });
  });

  it('issues SELECT then INSERT / DELETE with [userId, problemId]', async () => {
    const H = buildPractice();
    await H.post('/api/practice/problems/binary-search/bookmark', {});
    await H.post('/api/practice/problems/binary-search/bookmark', {});
    expect(H.db.practiceCalls).toEqual([
      { sql: 'SELECT id FROM practice_bookmarks WHERE user_id = $1 AND problem_id = $2', params: [USER_ID, 'binary-search'] },
      { sql: 'INSERT INTO practice_bookmarks (user_id, problem_id) VALUES ($1, $2)', params: [USER_ID, 'binary-search'] },
      { sql: 'SELECT id FROM practice_bookmarks WHERE user_id = $1 AND problem_id = $2', params: [USER_ID, 'binary-search'] },
      { sql: 'DELETE FROM practice_bookmarks WHERE user_id = $1 AND problem_id = $2', params: [USER_ID, 'binary-search'] },
    ]);
  });

  it('only touches this user\'s bookmark', async () => {
    const H = buildPractice();
    H.db.practice.bookmarks.push({ id: 1, user_id: OTHER_USER, problem_id: 'two-sum' });
    expect(await json(await H.post('/api/practice/problems/two-sum/bookmark', {}))).toEqual({ bookmarked: true });
    expect(H.db.practice.bookmarks).toHaveLength(2);
  });

  it('PRESERVED: there is no 404 / validation: any id string is bookmarked, even an unknown one', async () => {
    const H = buildPractice();
    const res = await H.post('/api/practice/problems/not-a-real-problem/bookmark', {});
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ bookmarked: true });
  });

  it('works without a request body (the handler never reads one)', async () => {
    const H = buildPractice();
    const res = await H.post('/api/practice/problems/two-sum/bookmark', undefined);
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ bookmarked: true });
  });

  it('the bookmark shows in the list and detail endpoints', async () => {
    const H = buildPractice();
    await H.post('/api/practice/problems/two-sum/bookmark', {});
    const list = await json(await H.get('/api/practice/problems'));
    expect(list.problems.find((p) => p.id === 'two-sum').bookmarked).toBe(true);
    expect((await json(await H.get('/api/practice/problems/two-sum'))).bookmarked).toBe(true);
  });

  it('NOT swallowed: a DB failure is a 500 Failed to toggle bookmark (unlike the read endpoints)', async () => {
    const H = buildPractice();
    H.db.failPractice('practice_bookmarks', new Error('connection reset'));
    const res = await H.post('/api/practice/problems/two-sum/bookmark', {});
    expect(res.status).toBe(500);
    expect(await json(res)).toEqual({ error: 'Failed to toggle bookmark' });
    expect(loggedErrors()).toContain('POST /problems/:id/bookmark error: connection reset');
  });

  it('a failing INSERT after a successful SELECT is also a 500', async () => {
    const H = buildPractice();
    H.db.failPractice('INSERT INTO practice_bookmarks');
    const res = await H.post('/api/practice/problems/two-sum/bookmark', {});
    expect(res.status).toBe(500);
    expect(await json(res)).toEqual({ error: 'Failed to toggle bookmark' });
  });
});

// ---------------------------------------------------------------------------------------------------
describe('routing edge cases', () => {
  it('unknown paths and wrong methods under the prefix fall through to the default 404', async () => {
    const H = buildPractice();
    for (const [method, path] of [['GET', '/api/practice'], ['GET', '/api/practice/nothing'], ['POST', '/api/practice/problems'], ['DELETE', '/api/practice/problems/two-sum'], ['PUT', '/api/practice/stats']]) {
      const res = await H.authed(path, { method });
      expect(res.status).toBe(404);
      expect(await res.text()).toContain(`<pre>Cannot ${method} ${path}</pre>`);
    }
  });

  it('a percent-encoded id is decoded before matching', async () => {
    const H = buildPractice();
    const res = await H.get('/api/practice/problems/two%2Dsum');
    expect(res.status).toBe(200);
    expect((await json(res)).id).toBe('two-sum');
  });

  // KNOWN PLATFORM DIFFERENCES (Hono vs Express routing), pinned here so nobody is surprised. Verified against a
  // scratch Express router: it answers 400 {"error":"Failed to decode param '%E0%A4%A'"} at routing time (even before
  // authentication) and matches paths case-insensitively. Hono passes the raw string through and is case-sensitive.
  // A faithful fix belongs in a global middleware in app.js (orchestrator), not in one route. See the notes file.
  it('DIFFERENCE vs Express: a malformed percent sequence in :id is 404 Problem not found (Express: 400 Failed to decode param)', async () => {
    const H = buildPractice();
    const res = await H.get('/api/practice/problems/%E0%A4%A');
    expect(res.status).toBe(404);
    expect(await json(res)).toEqual({ error: 'Problem not found' });
  });

  it('DIFFERENCE vs Express: route matching is case-sensitive (Express matched /api/practice/Problems)', async () => {
    const H = buildPractice();
    expect((await H.get('/api/practice/Problems')).status).toBe(404);
  });
});

// ---------------------------------------------------------------------------------------------------
describe('integration with the REAL infra aiClient service (sleep stubbed to zero, global fetch stubbed to fail)', () => {
  const { createAiClient } = require('../../../src/worker/services/aiClient');
  const realClient = (vars) => createAiClient({ config: { vars }, sleep: async () => {} });

  beforeEach(() => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('no network in tests'));
  });

  const CALLS = [
    ['run', '/api/practice/problems/two-sum/run', { code: 'x', language: 'python' }, (b) => expect(b.summary).toBe('AI evaluation is currently unavailable. Please try again later.')],
    ['submit', '/api/practice/problems/two-sum/submit', { code: 'x', language: 'python' }, (b) => expect(b.feedback).toBe('AI evaluation is currently unavailable. Your submission has been recorded.')],
    ['hint', '/api/practice/problems/two-sum/hint', { hintLevel: 2 }, (b) => expect(b).toEqual({ hint: generateFallbackHint(problem('two-sum'), 2), level: 2 })],
  ];

  it.each(CALLS)('%s: MOCK_AI mode resolves { ok: true, data } and the route STILL returns the fallback (preserved extractJSON bug), never touching fetch', async (_n, url, body, check) => {
    const H = buildPractice({ aiClient: realClient({ MOCK_AI: 'true' }) });
    const res = await H.post(url, body);
    expect(res.status).toBe(200);
    check(await json(res));
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it.each(CALLS)('%s: an unreachable provider (callAI resolves { ok: false }) also yields the fallback with 200', async (_n, url, body, check) => {
    const H = buildPractice({ aiClient: realClient({}) });
    const res = await H.post(url, body);
    expect(res.status).toBe(200);
    check(await json(res));
    expect(globalThis.fetch).toHaveBeenCalled(); // it really did try LM Studio (3 attempts), through the injected client
  });
});
