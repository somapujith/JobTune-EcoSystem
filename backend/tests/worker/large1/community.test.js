'use strict';

/**
 * routes/community.js: happy paths, fallbacks, validation and error paths per endpoint, against a
 * scripted in-memory db and a fake aiClient. Status codes and bodies are the ones the Express
 * handlers produced (see also differential.test.js, which runs both implementations side by side).
 */
const { makeLarge1, makeAiClient } = require('./helpers');

const FALLBACK_CATEGORY_IDS = ['general', 'frontend', 'backend', 'dsa', 'placements', 'projects', 'career-advice'];

let errSpy;
beforeEach(() => {
  errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

const logged = () => errSpy.mock.calls.map((a) => a.join(' ')).join('\n');

describe('GET /api/community/forums', () => {
  it('no rows: the built-in category list', async () => {
    const H = makeLarge1({ plan: 1, script: () => ({ rows: [] }) });
    const res = await H.authed('/api/community/forums');
    expect(res.status).toBe(200);
    const { categories } = await res.json();
    expect(categories.map((c) => c.id)).toEqual(FALLBACK_CATEGORY_IDS);
    expect(categories[0]).toEqual({ id: 'general', name: 'General', threadCount: 24 });
  });

  it('rows: db counts override matching categories (parseInt of the COUNT string), others keep fallback counts', async () => {
    const H = makeLarge1({
      plan: 1,
      script: (sql) => {
        if (/FROM community_threads GROUP BY category/.test(sql)) {
          return { rows: [{ category: 'dsa', thread_count: '7' }, { category: 'unknown-cat', thread_count: '3' }] };
        }
      },
    });
    const { categories } = await (await H.authed('/api/community/forums')).json();
    expect(categories.find((c) => c.id === 'dsa').threadCount).toBe(7);
    expect(categories.find((c) => c.id === 'general').threadCount).toBe(24);
    expect(categories).toHaveLength(7);
  });

  it('db error: 200 with the fallback list, error logged', async () => {
    const H = makeLarge1({ plan: 1, script: () => { throw new Error('relation does not exist'); } });
    const res = await H.authed('/api/community/forums');
    expect(res.status).toBe(200);
    expect((await res.json()).categories).toHaveLength(7);
    expect(logged()).toContain('GET /forums error: relation does not exist');
  });
});

describe('GET /api/community/forums/:category', () => {
  const rows = (n) => Array.from({ length: n }, (_, i) => ({ id: i + 1, title: `t${i}`, category: 'dsa' }));

  it('rows: threads + page + hasMore, default sort newest, params [category, 20, 0]', async () => {
    const H = makeLarge1({ plan: 1, script: (sql) => (/community_threads WHERE category/.test(sql) ? { rows: rows(3) } : undefined) });
    const res = await H.authed('/api/community/forums/dsa');
    expect(await res.json()).toEqual({ threads: rows(3), page: 1, hasMore: false });
    const q = H.db.calls.find((c) => /WHERE category/.test(c.sql));
    expect(q.sql).toBe('SELECT * FROM community_threads WHERE category = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3');
    expect(q.params).toEqual(['dsa', 20, 0]);
  });

  it('a full page (20 rows) sets hasMore', async () => {
    const H = makeLarge1({ plan: 1, script: (sql) => (/WHERE category/.test(sql) ? { rows: rows(20) } : undefined) });
    const body = await (await H.authed('/api/community/forums/dsa?page=3')).json();
    expect(body.hasMore).toBe(true);
    expect(body.page).toBe(3);
    expect(H.db.calls.find((c) => /WHERE category/.test(c.sql)).params).toEqual(['dsa', 20, 40]);
  });

  it.each([
    ['popular', 'votes DESC'],
    ['active', 'reply_count DESC'],
    ['newest', 'created_at DESC'],
    ['bogus', 'created_at DESC'],
  ])('sort=%s', async (sort, orderBy) => {
    const H = makeLarge1({ plan: 1, script: (sql) => (/WHERE category/.test(sql) ? { rows: rows(1) } : undefined) });
    await H.authed(`/api/community/forums/dsa?sort=${sort}`);
    const sql = H.db.calls.find((c) => /WHERE category/.test(c.sql)).sql;
    expect(sql).toContain(`ORDER BY ${orderBy} LIMIT`);
  });

  it('preserved quirk: sort=constructor is looked up on a plain object, so the text of the Object function is spliced into the SQL', async () => {
    const H = makeLarge1({ plan: 1, script: (sql) => { if (/WHERE category/.test(sql)) throw new Error('syntax error'); } });
    const res = await H.authed('/api/community/forums/dsa?sort=constructor');
    expect(H.db.calls.find((c) => /WHERE category/.test(c.sql)).sql).toContain('ORDER BY function Object()');
    expect(res.status).toBe(200); // the resulting SQL error is swallowed into the fallback list
  });

  it('non-numeric / zero page falls back to 1', async () => {
    const H = makeLarge1({ plan: 1, script: (sql) => (/WHERE category/.test(sql) ? { rows: rows(1) } : undefined) });
    expect((await (await H.authed('/api/community/forums/dsa?page=abc')).json()).page).toBe(1);
    expect((await (await H.authed('/api/community/forums/dsa?page=0')).json()).page).toBe(1);
  });

  it('no rows: fallback threads filtered by category, page reset to 1', async () => {
    const H = makeLarge1({ plan: 1, script: () => ({ rows: [] }) });
    const body = await (await H.authed('/api/community/forums/frontend?page=5')).json();
    expect(body.page).toBe(1);
    expect(body.hasMore).toBe(false);
    expect(body.threads.map((t) => t.id)).toEqual([1, 5]);
    const none = await (await H.authed('/api/community/forums/nothing-here')).json();
    expect(none).toEqual({ threads: [], page: 1, hasMore: false });
  });

  it('db error: fallback threads, logged', async () => {
    const H = makeLarge1({ plan: 1, script: () => { throw new Error('db down'); } });
    const res = await H.authed('/api/community/forums/dsa');
    expect(res.status).toBe(200);
    expect((await res.json()).threads.map((t) => t.id)).toEqual([4]);
    expect(logged()).toContain('GET /forums/:category error: db down');
  });
});

describe('GET /api/community/forums/thread/:id', () => {
  it('found: increments views, returns thread + replies in order', async () => {
    const thread = { id: 9, title: 'x', views: 4 };
    const replies = [{ id: 1, thread_id: 9 }, { id: 2, thread_id: 9 }];
    const H = makeLarge1({
      plan: 1,
      script: (sql) => {
        if (/^SELECT \* FROM community_threads WHERE id = \$1$/.test(sql)) return { rows: [thread] };
        if (/^UPDATE community_threads SET views/.test(sql)) return { rows: [], rowCount: 1 };
        if (/FROM community_replies WHERE thread_id/.test(sql)) return { rows: replies };
      },
    });
    const res = await H.authed('/api/community/forums/thread/9');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ thread, replies });
    expect(H.db.calls.map((c) => c.sql)).toEqual([
      'SELECT * FROM community_threads WHERE id = $1',
      'UPDATE community_threads SET views = views + 1 WHERE id = $1',
      'SELECT * FROM community_replies WHERE thread_id = $1 ORDER BY created_at ASC',
    ]);
    expect(H.db.calls.every((c) => c.params[0] === '9')).toBe(true);
  });

  it('missing in db but a fallback id: fallback thread with no replies', async () => {
    const H = makeLarge1({ plan: 1, script: () => ({ rows: [] }) });
    const body = await (await H.authed('/api/community/forums/thread/2')).json();
    expect(body.replies).toEqual([]);
    expect(body.thread.title).toBe('How I cleared Amazon SDE-1 in 3 months');
  });

  it('missing everywhere: 404 Thread not found', async () => {
    const H = makeLarge1({ plan: 1, script: () => ({ rows: [] }) });
    const res = await H.authed('/api/community/forums/thread/999');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Thread not found' });
  });

  it('db error: 200 with the matching fallback thread, or the first fallback when unknown', async () => {
    const H = makeLarge1({ plan: 1, script: () => { throw new Error('boom'); } });
    expect((await (await H.authed('/api/community/forums/thread/3')).json()).thread.id).toBe(3);
    expect((await (await H.authed('/api/community/forums/thread/abc')).json()).thread.id).toBe(1);
    expect(logged()).toContain('GET /forums/thread/:id error: boom');
  });

  it('is not shadowed by /forums/:category (thread/5 is two segments)', async () => {
    const H = makeLarge1({ plan: 1, script: () => ({ rows: [] }) });
    const body = await (await H.authed('/api/community/forums/thread/1')).json();
    expect(body).toHaveProperty('thread');
    expect(body).not.toHaveProperty('threads');
  });
});

describe('POST /api/community/forums/thread', () => {
  const okScript = () => (sql, params) => {
    if (/^SELECT full_name FROM users/.test(sql)) return { rows: [{ full_name: 'Ada Lovelace' }] };
    if (/^INSERT INTO community_threads/.test(sql)) {
      return { rows: [{ id: 11, user_id: params[0], author_name: params[1], title: params[2], body: params[3], category: params[4], tags: params[5] }] };
    }
  };

  it('creates: author name from users, category validated, tags sanitised, fields truncated', async () => {
    const H = makeLarge1({ plan: 1, script: okScript() });
    const res = await H.json('POST', '/api/community/forums/thread', {
      title: 'T'.repeat(600),
      body: 'B'.repeat(6000),
      category: 'dsa',
      tags: ['a', 5, 'x'.repeat(80), ...Array.from({ length: 20 }, (_, i) => `t${i}`)],
    });
    expect(res.status).toBe(200);
    const { thread } = await res.json();
    expect(thread.author_name).toBe('Ada Lovelace');
    expect(thread.title).toHaveLength(500);
    expect(thread.body).toHaveLength(5000);
    expect(thread.category).toBe('dsa');
    const tags = JSON.parse(thread.tags);
    expect(tags).toHaveLength(10);
    expect(tags[1]).toHaveLength(50); // 5 was dropped (non-string), 'x'*80 truncated to 50
    expect(H.db.calls[0]).toEqual({ sql: 'SELECT full_name FROM users WHERE id = $1', params: [1] });
  });

  it('unknown category becomes general; non-array tags become []; missing user row becomes Anonymous', async () => {
    const H = makeLarge1({
      plan: 1,
      script: (sql, params) => {
        if (/^SELECT full_name/.test(sql)) return { rows: [] };
        if (/^INSERT INTO community_threads/.test(sql)) return { rows: [{ category: params[4], tags: params[5], author_name: params[1] }] };
      },
    });
    const { thread } = await (await H.json('POST', '/api/community/forums/thread', { title: 't', body: 'b', category: 'nope', tags: 'x' })).json();
    expect(thread).toEqual({ category: 'general', tags: '[]', author_name: 'Anonymous' });
  });

  it.each([
    [{}],
    [{ title: 't' }],
    [{ body: 'b' }],
    [{ title: 5, body: 'b' }],
    [{ title: 't', body: { x: 1 } }],
  ])('validation: %j -> 400', async (payload) => {
    const H = makeLarge1({ plan: 1, script: okScript() });
    const res = await H.json('POST', '/api/community/forums/thread', payload);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Title and body are required' });
    expect(H.db.calls).toEqual([]); // validation happens before any SQL
  });

  it('no JSON body at all: masked 500 (destructuring undefined), exactly like Express 5', async () => {
    const H = makeLarge1({ plan: 1, script: okScript() });
    const res = await H.authed('/api/community/forums/thread', { method: 'POST' });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal Server Error' });
  });

  it('db error: 500 Failed to create thread', async () => {
    const H = makeLarge1({ plan: 1, script: () => { throw new Error('insert failed'); } });
    const res = await H.json('POST', '/api/community/forums/thread', { title: 't', body: 'b' });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Failed to create thread' });
    expect(logged()).toContain('POST /forums/thread error: insert failed');
  });
});

describe('POST /api/community/forums/thread/:id/reply', () => {
  it('replies, bumps reply_count, returns the reply', async () => {
    const H = makeLarge1({
      plan: 1,
      script: (sql, params) => {
        if (/^SELECT full_name/.test(sql)) return { rows: [{ full_name: 'Grace' }] };
        if (/^INSERT INTO community_replies/.test(sql)) return { rows: [{ id: 5, thread_id: params[0], user_id: params[1], author_name: params[2], body: params[3] }] };
        if (/^UPDATE community_threads SET reply_count/.test(sql)) return { rows: [], rowCount: 1 };
      },
    });
    const res = await H.json('POST', '/api/community/forums/thread/9/reply', { body: 'R'.repeat(6000) });
    expect(res.status).toBe(200);
    const { reply } = await res.json();
    expect(reply).toMatchObject({ id: 5, thread_id: '9', user_id: 1, author_name: 'Grace' });
    expect(reply.body).toHaveLength(5000);
    expect(H.db.calls.map((c) => c.sql.split(' ').slice(0, 3).join(' '))).toEqual(['SELECT full_name FROM', 'INSERT INTO community_replies', 'UPDATE community_threads SET']);
    expect(H.db.calls[2].params).toEqual(['9']);
  });

  it.each([[{}], [{ body: '' }], [{ body: 7 }]])('validation: %j -> 400 Reply body is required', async (payload) => {
    const H = makeLarge1({ plan: 1, script: () => ({ rows: [] }) });
    const res = await H.json('POST', '/api/community/forums/thread/9/reply', payload);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Reply body is required' });
  });

  it('db error: 500 Failed to post reply', async () => {
    const H = makeLarge1({ plan: 1, script: (sql) => { if (/community/.test(sql) || /users/.test(sql)) throw new Error('fk violation'); } });
    const res = await H.json('POST', '/api/community/forums/thread/9/reply', { body: 'hi' });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Failed to post reply' });
  });
});

describe('POST /api/community/forums/thread/:id/vote', () => {
  const script = (existing) => (sql) => {
    if (/^SELECT \* FROM community_votes/.test(sql)) return { rows: existing ? [existing] : [] };
    if (/^(INSERT INTO community_votes|UPDATE community_)/.test(sql)) return { rows: [], rowCount: 1 };
  };

  it('first vote up: insert + votes +1', async () => {
    const H = makeLarge1({ plan: 1, script: script(null) });
    const res = await H.json('POST', '/api/community/forums/thread/4/vote', { direction: 'up' });
    expect(await res.json()).toEqual({ success: true });
    expect(H.db.calls.slice(1)).toEqual([
      { sql: 'INSERT INTO community_votes (user_id, thread_id, direction) VALUES ($1, $2, $3)', params: [1, '4', 'up'] },
      { sql: 'UPDATE community_threads SET votes = votes + $1 WHERE id = $2', params: [1, '4'] },
    ]);
  });

  it('first vote down: votes -1', async () => {
    const H = makeLarge1({ plan: 1, script: script(null) });
    await H.json('POST', '/api/community/forums/thread/4/vote', { direction: 'down' });
    expect(H.db.calls[2].params).toEqual([-1, '4']);
  });

  it('same direction again: Already voted, no writes', async () => {
    const H = makeLarge1({ plan: 1, script: script({ id: 3, direction: 'up' }) });
    const res = await H.json('POST', '/api/community/forums/thread/4/vote', { direction: 'up' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ message: 'Already voted' });
    expect(H.db.calls).toHaveLength(1); // only the SELECT of the existing vote
  });

  it('flip direction: vote row updated, votes +2 / -2', async () => {
    const up = makeLarge1({ plan: 1, script: script({ id: 3, direction: 'down' }) });
    await up.json('POST', '/api/community/forums/thread/4/vote', { direction: 'up' });
    expect(up.db.calls.slice(1)).toEqual([
      { sql: 'UPDATE community_votes SET direction = $1 WHERE id = $2', params: ['up', 3] },
      { sql: 'UPDATE community_threads SET votes = votes + $1 WHERE id = $2', params: [2, '4'] },
    ]);
    const down = makeLarge1({ plan: 1, script: script({ id: 3, direction: 'up' }) });
    await down.json('POST', '/api/community/forums/thread/4/vote', { direction: 'down' });
    expect(down.db.calls[1].params).toEqual(['down', 3]);
    expect(down.db.calls[2].params).toEqual([-2, '4']);
  });

  it.each([[{}], [{ direction: 'sideways' }], [{ direction: 1 }]])('validation: %j -> 400', async (payload) => {
    const H = makeLarge1({ plan: 1, script: script(null) });
    const res = await H.json('POST', '/api/community/forums/thread/4/vote', payload);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Direction must be "up" or "down"' });
  });

  it('db error: still { success: true } (preserved: "Don\'t fail the UI")', async () => {
    const H = makeLarge1({ plan: 1, script: (sql) => { if (/community_votes/.test(sql)) throw new Error('nope'); } });
    const res = await H.json('POST', '/api/community/forums/thread/4/vote', { direction: 'up' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
    expect(logged()).toContain('POST /forums/thread/:id/vote error: nope');
  });
});

describe('study groups', () => {
  it('GET /groups: rows, else fallback (also on db error)', async () => {
    const groups = [{ id: 1, name: 'g' }];
    const rows = makeLarge1({ plan: 1, script: (sql) => (/FROM study_groups/.test(sql) ? { rows: groups } : undefined) });
    expect(await (await rows.authed('/api/community/groups')).json()).toEqual({ groups });
    expect(rows.db.calls[0].sql).toBe('SELECT * FROM study_groups ORDER BY created_at DESC LIMIT 20');

    const empty = makeLarge1({ plan: 1, script: () => ({ rows: [] }) });
    expect((await (await empty.authed('/api/community/groups')).json()).groups).toHaveLength(4);

    const broken = makeLarge1({ plan: 1, script: () => { throw new Error('x'); } });
    expect((await (await broken.authed('/api/community/groups')).json()).groups[0].name).toBe('DSA Daily Grind');
  });

  it('POST /groups: inserts with truncated fields, default max members 30, one of the palette colours', async () => {
    const COLORS = ['#6366f1', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];
    const H = makeLarge1({
      plan: 1,
      script: (sql, p) => (/^INSERT INTO study_groups/.test(sql)
        ? { rows: [{ id: 1, creator_id: p[0], name: p[1], topic: p[2], description: p[3], max_members: p[4], color: p[5] }] }
        : undefined),
    });
    const res = await H.json('POST', '/api/community/groups', { name: 'N'.repeat(300), topic: 'T'.repeat(300), description: 'D'.repeat(3000) });
    expect(res.status).toBe(200);
    const { group } = await res.json();
    expect(group.name).toHaveLength(255);
    expect(group.topic).toHaveLength(255);
    expect(group.description).toHaveLength(2000);
    expect(group.max_members).toBe(30);
    expect(group.creator_id).toBe(1);
    expect(COLORS).toContain(group.color);
  });

  it('POST /groups: maxMembers passthrough, description defaults to empty string', async () => {
    const H = makeLarge1({ plan: 1, script: (sql, p) => (/^INSERT INTO study_groups/.test(sql) ? { rows: [{ description: p[3], max_members: p[4] }] } : undefined) });
    const { group } = await (await H.json('POST', '/api/community/groups', { name: 'n', topic: 't', maxMembers: 12 })).json();
    expect(group).toEqual({ description: '', max_members: 12 });
  });

  it.each([[{}], [{ name: 'n' }], [{ topic: 't' }]])('validation: %j -> 400', async (payload) => {
    const H = makeLarge1({ plan: 1 });
    const res = await H.json('POST', '/api/community/groups', payload);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Name and topic are required' });
  });

  it('POST /groups: db error -> 500 Failed to create group; a non-string name is also that 500 (slice throws inside the try)', async () => {
    const H = makeLarge1({ plan: 1, script: () => { throw new Error('nope'); } });
    const res = await H.json('POST', '/api/community/groups', { name: 'n', topic: 't' });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Failed to create group' });
    const bad = await makeLarge1({ plan: 1 }).json('POST', '/api/community/groups', { name: 42, topic: 't' });
    expect(bad.status).toBe(500);
    expect(await bad.json()).toEqual({ error: 'Failed to create group' });
  });
});

describe('events + leaderboard', () => {
  it('GET /events: rows / fallback / db error fallback', async () => {
    const events = [{ id: 1, title: 'e' }];
    const rows = makeLarge1({ plan: 1, script: (sql) => (/FROM community_events/.test(sql) ? { rows: events } : undefined) });
    expect(await (await rows.authed('/api/community/events')).json()).toEqual({ events });
    expect(rows.db.calls[0].sql).toBe('SELECT * FROM community_events WHERE event_date >= CURRENT_DATE ORDER BY event_date ASC LIMIT 20');
    const empty = makeLarge1({ plan: 1, script: () => ({ rows: [] }) });
    expect((await (await empty.authed('/api/community/events')).json()).events).toHaveLength(3);
    const broken = makeLarge1({ plan: 1, script: () => { throw new Error('x'); } });
    expect((await (await broken.authed('/api/community/events')).json()).events[0].title).toBe('CodeSprint 2026 - National Hackathon');
  });

  it('GET /leaderboard: static list, no db access', async () => {
    const H = makeLarge1({ plan: 1 });
    const body = await (await H.authed('/api/community/leaderboard')).json();
    expect(body.leaderboard).toHaveLength(10);
    expect(body.leaderboard[0]).toEqual({ rank: 1, name: 'Priya Sharma', points: 2840, badges: 12, streak: 45 });
    expect(H.db.calls.filter((c) => /community|leader/.test(c.sql))).toEqual([]);
  });
});

describe('communication skills (tier 2)', () => {
  const goodJson = '{"overallScore": 91, "clarity": {"score": 90, "feedback": "x"}}';

  describe('POST /communication/practice', () => {
    it('validation: missing / blank content -> 400 Content is required', async () => {
      const H = makeLarge1({ plan: 2 });
      for (const payload of [{}, { content: '' }, { content: '   ' }]) {
        const res = await H.json('POST', '/api/community/communication/practice', payload);
        expect(res.status).toBe(400);
        expect(await res.json()).toEqual({ error: 'Content is required' });
      }
      expect(H.aiClient.callAI).not.toHaveBeenCalled();
    });

    it('resume presentation (default type): calls the AI with the Express prompt/params, returns fallback feedback', async () => {
      const ai = makeAiClient(async () => ({ ok: true, error: null, data: goodJson }));
      const H = makeLarge1({ plan: 2, aiClient: ai });
      const res = await H.json('POST', '/api/community/communication/practice', { content: '  Hello, I built 3 apps in 2 years.  ', scenario: 'Interview' });
      expect(res.status).toBe(200);
      expect(ai.callAI).toHaveBeenCalledTimes(1);
      const arg = ai.callAI.mock.calls[0][0];
      expect(arg).toMatchObject({ maxTokens: 1024, temperature: 0.4, structuredJson: true });
      expect(arg.systemPrompt).toContain('expert communication coach');
      expect(arg.userPrompt).toBe("Scenario: Interview\n\nUser's presentation:\nHello, I built 3 apps in 2 years.");
      const { feedback } = await res.json();
      // PRESERVED BUG: the whole { ok, data } result is handed to extractJSON, which throws,
      // so the canned fallback comes back even though the AI answered with valid JSON.
      expect(feedback.overallScore).not.toBe(91);
      expect(feedback.clarity.feedback).toMatch(/^Your presentation has a clear structure/);
      expect(logged()).toContain('Communication practice AI error: text.match is not a function');
    });

    it('default scenario text when none is given', async () => {
      const ai = makeAiClient(async () => ({ ok: false, error: 'x', data: null }));
      const H = makeLarge1({ plan: 2, aiClient: ai });
      await H.json('POST', '/api/community/communication/practice', { content: 'hi' });
      expect(ai.callAI.mock.calls[0][0].userPrompt).toBe("Scenario: Present your resume\n\nUser's presentation:\nhi");
    });

    it('fallback score formula: min(85, 40 + words/3 + 10 digits + 5 punctuation)', async () => {
      const H = makeLarge1({ plan: 2 });
      const short = (await (await H.json('POST', '/api/community/communication/practice', { content: 'hello there' })).json()).feedback;
      expect(short.overallScore).toBe(40); // 2 words, no digits, no punctuation
      expect(short.clarity.score).toBe(42);
      expect(short.professionalism.score).toBe(37);
      expect(short.impact.score).toBe(35);
      const long = (await (await H.json('POST', '/api/community/communication/practice', { content: 'word 1. '.repeat(300) })).json()).feedback;
      expect(long.overallScore).toBe(85); // capped
      expect(short.suggestions).toHaveLength(4);
    });

    it('content is trimmed and capped at 5000 chars before it reaches the prompt', async () => {
      const ai = makeAiClient();
      const H = makeLarge1({ plan: 2, aiClient: ai });
      await H.json('POST', '/api/community/communication/practice', { content: `  ${'x'.repeat(6000)}  ` });
      expect(ai.callAI.mock.calls[0][0].userPrompt.endsWith('x'.repeat(5000))).toBe(true);
      expect(ai.callAI.mock.calls[0][0].userPrompt.split('\n\n')[1]).toBe(`User's presentation:\n${'x'.repeat(5000)}`);
    });

    it('hr-communication: HR prompt, HR fallback shape', async () => {
      const ai = makeAiClient(async () => ({ ok: true, data: goodJson }));
      const H = makeLarge1({ plan: 2, aiClient: ai });
      const res = await H.json('POST', '/api/community/communication/practice', { type: 'hr-communication', content: 'Please approve leave for 3 days', scenario: 'Leave request' });
      const arg = ai.callAI.mock.calls[0][0];
      expect(arg.systemPrompt).toContain('expert HR communication coach');
      expect(arg.userPrompt).toBe("HR Scenario: Leave request\n\nUser's message:\nPlease approve leave for 3 days");
      const { feedback } = await res.json();
      expect(Object.keys(feedback)).toEqual(['overallScore', 'appropriateness', 'professionalism', 'suggestions', 'improvedVersion']);
      expect(feedback.improvedVersion).toMatch(/^Dear \[Manager\/HR\]/);
      expect(logged()).toContain('Communication practice (HR) AI error: text.match is not a function');
    });

    it('hr-communication defaults the scenario to General', async () => {
      const ai = makeAiClient();
      const H = makeLarge1({ plan: 2, aiClient: ai });
      await H.json('POST', '/api/community/communication/practice', { type: 'hr-communication', content: 'hi' });
      expect(ai.callAI.mock.calls[0][0].userPrompt).toBe("HR Scenario: General\n\nUser's message:\nhi");
    });

    it('a rejecting callAI still yields the fallback (no 500)', async () => {
      const H = makeLarge1({ plan: 2, aiClient: makeAiClient(async () => { throw new Error('network'); }) });
      const res = await H.json('POST', '/api/community/communication/practice', { content: 'hi' });
      expect(res.status).toBe(200);
      expect(logged()).toContain('Communication practice AI error: network');
    });

    it('non-string content -> masked 500 (content.trim is not a function), as on Express', async () => {
      const H = makeLarge1({ plan: 2 });
      const res = await H.json('POST', '/api/community/communication/practice', { content: 12345 });
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: 'Internal Server Error' });
    });
  });

  describe('POST /communication/email', () => {
    it('validation: missing / blank email -> 400 Email content is required', async () => {
      const H = makeLarge1({ plan: 2 });
      for (const payload of [{}, { email: '' }, { email: ' \n ' }]) {
        const res = await H.json('POST', '/api/community/communication/email', payload);
        expect(res.status).toBe(400);
        expect(await res.json()).toEqual({ error: 'Email content is required' });
      }
    });

    it('AI prompt/params as Express; response is the fallback analysis', async () => {
      const ai = makeAiClient(async () => ({ ok: true, data: goodJson }));
      const H = makeLarge1({ plan: 2, aiClient: ai });
      const res = await H.json('POST', '/api/community/communication/email', { email: 'Dear Sir, thanks for your time. Regards', subject: 'Follow up', template: 'follow-up' });
      const arg = ai.callAI.mock.calls[0][0];
      expect(arg).toMatchObject({ maxTokens: 1200, temperature: 0.4, structuredJson: true });
      expect(arg.userPrompt).toBe('Email Type: follow-up\nSubject Line: Follow up\n\nEmail Body:\nDear Sir, thanks for your time. Regards');
      const { analysis } = await res.json();
      expect(Object.keys(analysis)).toEqual(['overallScore', 'tone', 'grammar', 'professionalism', 'structure', 'subjectLine', 'improvedVersion']);
      // greeting + closing found: 35 + floor(8/5)=1 + 10 + 10 = 56
      expect(analysis.overallScore).toBe(56);
      expect(analysis.professionalism.feedback).toBe('Good use of greeting and closing.');
      expect(analysis.subjectLine.score).toBe(56);
      expect(logged()).toContain('Email analysis AI error: text.match is not a function');
    });

    it('defaults: template general, subject (none provided); no subject scores 30', async () => {
      const ai = makeAiClient();
      const H = makeLarge1({ plan: 2, aiClient: ai });
      const { analysis } = await (await H.json('POST', '/api/community/communication/email', { email: 'yo' })).json();
      expect(ai.callAI.mock.calls[0][0].userPrompt).toBe('Email Type: general\nSubject Line: (none provided)\n\nEmail Body:\nyo');
      expect(analysis.subjectLine.score).toBe(30);
      expect(analysis.professionalism.feedback).toBe('Include a proper salutation and professional closing with your full name.');
    });

    it('non-string email -> masked 500', async () => {
      const H = makeLarge1({ plan: 2 });
      const res = await H.json('POST', '/api/community/communication/email', { email: ['a'] });
      expect(res.status).toBe(500);
    });
  });
});

describe('a tier-1 user cannot reach the tier-2 communication endpoints (spot check with a real body)', () => {
  it.each(['practice', 'email'])('POST /communication/%s -> 403', async (name) => {
    const H = makeLarge1({ plan: 1 });
    const res = await H.json('POST', `/api/community/communication/${name}`, { content: 'x', email: 'x' });
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe('PLAN_UPGRADE_REQUIRED');
    expect(H.aiClient.callAI).not.toHaveBeenCalled();
  });
});
