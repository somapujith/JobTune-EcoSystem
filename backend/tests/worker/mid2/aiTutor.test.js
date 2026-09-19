'use strict';

/**
 * routes/aiTutor.js: GET /topics, POST /chat, POST /doubt (requirePlan(1)) and the five
 * /conversations endpoints (authenticateToken only) backed by tutorHistoryService.
 */
const { build, quietConsole, USER_ID, OTHER_USER_ID } = require('./helpers');

quietConsole();

const TOPIC_IDS = ['frontend', 'backend', 'dsa', 'dbms', 'os', 'networks', 'system-design', 'devops'];
const FRONTEND_SUBTOPICS = ['HTML & CSS Basics', 'JavaScript ES6+', 'React.js'];

describe('GET /api/ai-tutor/topics', () => {
  it('returns the 8 topic definitions', async () => {
    const H = build({ plan: 1 });
    const res = await H.get('/api/ai-tutor/topics');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Object.keys(body)).toEqual(['topics']);
    const { topics } = body;
    expect(topics.map((t) => t.id)).toEqual(TOPIC_IDS);
    for (const t of topics) {
      expect(Object.keys(t)).toEqual(['id', 'name', 'icon', 'subtopics']);
      expect(t.subtopics).toHaveLength(8);
    }
    expect(topics[0]).toMatchObject({ name: 'Frontend Development', icon: 'web' });
    expect(topics[6]).toMatchObject({ name: 'System Design', icon: 'architecture' });
  });
});

describe('POST /api/ai-tutor/chat', () => {
  const chat = (H, body) => H.post('/api/ai-tutor/chat', body);

  it('400 for a missing / blank message, without calling the AI', async () => {
    const H = build({ plan: 1 });
    for (const body of [{}, { message: '' }, { message: '   ' }, { topic: 'dsa' }]) {
      const res = await chat(H, body);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'Message is required' });
    }
    expect(H.ai.callAI).not.toHaveBeenCalled();
  });

  it('no body or a non-string message is a masked 500 (uncaught TypeError -> next(err) in Express)', async () => {
    const H = build({ plan: 1 });
    for (const body of [undefined, { message: 123 }]) {
      const res = await chat(H, body);
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: 'Internal Server Error' });
    }
  });

  it('AI success: returns reply + suggestedTopics with ai_powered true; builds the prompt from topic and the last 6 history turns', async () => {
    const H = build({ plan: 1, env: { LM_STUDIO_MODEL_TUTOR: 'tutor-model-x' } });
    H.ai.callAI.mockResolvedValueOnce({ ok: true, data: JSON.stringify({ reply: 'Trees are graphs.', suggestedTopics: ['Graphs'] }) });
    const history = Array.from({ length: 8 }, (_, i) => ({ role: i % 2 === 0 ? 'user' : 'assistant', content: `m${i + 1}` }));

    const res = await chat(H, { topic: 'dsa', message: 'Explain trees', history });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Object.keys(body)).toEqual(['reply', 'suggestedTopics', 'ai_powered']);
    expect(body).toEqual({ reply: 'Trees are graphs.', suggestedTopics: ['Graphs'], ai_powered: true });

    const args = H.ai.callAI.mock.calls[0][0];
    expect(args).toMatchObject({ maxTokens: 1024, temperature: 0.6, structuredJson: true, model: 'tutor-model-x', cache: false });
    expect(args.systemPrompt).toContain('world-class CS educator');
    // last 6 = m3..m8; user -> Student, anything else -> Tutor
    expect(args.userPrompt).toBe(
      "The student is studying: dsa.\n\n\nPrevious conversation:\nStudent: m3\n\nTutor: m4\n\nStudent: m5\n\nTutor: m6\n\nStudent: m7\n\nTutor: m8\n\nStudent's current question: Explain trees"
    );
  });

  it('with no topic and no history the prompt is just the question', async () => {
    const H = build({ plan: 1 });
    await chat(H, { message: 'hi there' });
    expect(H.ai.callAI.mock.calls[0][0].userPrompt).toBe("Student's current question: hi there");
    await chat(H, { message: 'hi', history: [] });
    expect(H.ai.callAI.mock.calls[1][0].userPrompt).toBe("Student's current question: hi");
  });

  it('AI JSON without suggestedTopics -> []', async () => {
    const H = build({ plan: 1 });
    H.ai.callAI.mockResolvedValueOnce({ ok: true, data: '{"reply":"R"}' });
    expect(await (await chat(H, { message: 'q' })).json()).toEqual({ reply: 'R', suggestedTopics: [], ai_powered: true });
  });

  it('AI text that is not JSON is used as the reply; suggestions come from the topic id or the generic trio', async () => {
    const H = build({ plan: 1 });
    H.ai.callAI.mockResolvedValueOnce({ ok: true, data: 'plain words' });
    const a = await (await chat(H, { topic: 'os', message: 'q' })).json();
    expect(a).toEqual({
      reply: 'plain words',
      suggestedTopics: ['Process Management', 'Threads & Concurrency', 'Memory Management'],
      ai_powered: true,
    });
    H.ai.callAI.mockResolvedValueOnce({ ok: true, data: 'plain words' });
    const b = await (await chat(H, { topic: 'no-such-topic', message: 'q' })).json();
    expect(b.suggestedTopics).toEqual(['JavaScript Basics', 'React Fundamentals', 'DSA Patterns']);
  });

  describe('AI unavailable: fallback replies', () => {
    it.each([
      ['What is a promise?', 'Great question! Let me break this down for you.'],
      ['please explain hoisting', 'Great question! Let me break this down for you.'],
      ['how does it work', 'Great question! Let me break this down for you.'],
      ['show me some code', "Here's a practical example to illustrate the concept:"],
      ['an implementation please', "Here's a practical example to illustrate the concept:"],
      ['interview tips', 'For interview preparation on this topic, focus on:'],
      ['I need to prepare', 'For interview preparation on this topic, focus on:'],
      ['hello', "That's an interesting question! Let me help you understand this better."],
      ['what is the code for an interview', 'Great question! Let me break this down for you.'], // "what is" wins over code/interview
    ])('message %j starts "%s"', async (message, start) => {
      const H = build({ plan: 1 });
      const body = await (await chat(H, { topic: 'backend', message })).json();
      expect(body.reply.startsWith(start)).toBe(true);
      expect(body.ai_powered).toBe(false);
      expect(body.suggestedTopics).toEqual(['Node.js & Express', 'REST API Design', 'Authentication & JWT']);
    });

    it('the first branch names the topic (or "This concept"), matching topic ids and topic-name substrings', async () => {
      const H = build({ plan: 1 });
      const named = await (await chat(H, { topic: 'networks', message: 'what is dns' })).json();
      expect(named.reply).toContain('**networks** is a fundamental topic in computer science.');
      expect(named.suggestedTopics).toEqual(['OSI Model', 'TCP/IP', 'HTTP & HTTPS']);

      const byName = await (await chat(H, { topic: 'Operating', message: 'what is x' })).json(); // substring of "Operating Systems"
      expect(byName.suggestedTopics).toEqual(['Process Management', 'Threads & Concurrency', 'Memory Management']);

      const none = await (await chat(H, { message: 'what is x' })).json();
      expect(none.reply).toContain('**This concept** is a fundamental topic');
      // preserved quirk: an empty topic matches every topic name via includes(''), so the FIRST topic is chosen
      expect(none.suggestedTopics).toEqual(FRONTEND_SUBTOPICS);

      const unknown = await (await chat(H, { topic: 'zzz-unknown', message: 'what is x' })).json();
      expect(unknown.suggestedTopics).toEqual(['JavaScript Fundamentals', 'Data Structures Basics', 'System Design Intro']);
    });
  });

  it('an AI client that throws is a masked 500', async () => {
    const H = build({ plan: 1 });
    H.ai.callAI.mockRejectedValueOnce(new Error('upstream exploded: secret-host'));
    const res = await chat(H, { message: 'q' });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal Server Error' });
  });
});

describe('POST /api/ai-tutor/doubt', () => {
  const doubt = (H, body) => H.post('/api/ai-tutor/doubt', body);

  it('400 for a missing / blank doubt', async () => {
    const H = build({ plan: 1 });
    for (const body of [{}, { doubt: '  ' }, { category: 'JS' }]) {
      const res = await doubt(H, body);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'Doubt description is required' });
    }
    expect(H.ai.callAI).not.toHaveBeenCalled();
  });

  it('no body or a non-string doubt is a masked 500', async () => {
    const H = build({ plan: 1 });
    for (const body of [undefined, { doubt: 5 }]) {
      const res = await doubt(H, body);
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: 'Internal Server Error' });
    }
  });

  it('builds the prompt (category default General, optional fenced snippet) and calls the AI without a cache flag', async () => {
    const H = build({ plan: 1, env: { LM_STUDIO_MODEL_TUTOR: 'tutor-model-x' } });
    await doubt(H, { doubt: 'why undefined?' });
    let args = H.ai.callAI.mock.calls[0][0];
    expect(args.userPrompt).toBe("Category: General\n\nStudent's doubt: why undefined?");
    expect(args).toMatchObject({ maxTokens: 1200, temperature: 0.5, structuredJson: true, model: 'tutor-model-x' });
    expect('cache' in args).toBe(false); // unlike /chat, /doubt does not pass cache:false (preserved)
    expect(args.systemPrompt).toContain('expert debugging mentor');

    await doubt(H, { doubt: 'why?', category: 'React', codeSnippet: 'const a = 1;' });
    args = H.ai.callAI.mock.calls[1][0];
    expect(args.userPrompt).toBe("Category: React\n\nStudent's doubt: why?\n\nCode snippet the student is confused about:\n```\nconst a = 1;\n```");

    await doubt(H, { doubt: 'why?', codeSnippet: '   ' });
    expect(H.ai.callAI.mock.calls[2][0].userPrompt).toBe("Category: General\n\nStudent's doubt: why?");
  });

  it('AI success: returns the AI fields; absent optional fields are omitted from the JSON, relatedTopics defaults to []', async () => {
    const H = build({ plan: 1 });
    H.ai.callAI.mockResolvedValueOnce({ ok: true, data: JSON.stringify({ concept: 'TDZ', explanation: 'because' }) });
    const res = await doubt(H, { doubt: 'why?' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ concept: 'TDZ', explanation: 'because', relatedTopics: [], ai_powered: true });

    H.ai.callAI.mockResolvedValueOnce({
      ok: true,
      data: JSON.stringify({ concept: 'C', explanation: 'E', example: 'X', practiceQuestion: 'P', relatedTopics: ['R'] }),
    });
    const full = await (await doubt(H, { doubt: 'why?' })).json();
    expect(Object.keys(full)).toEqual(['concept', 'explanation', 'example', 'practiceQuestion', 'relatedTopics', 'ai_powered']);
  });

  it('AI JSON missing concept/explanation, or not JSON, falls back (ai_powered stays true in that case)', async () => {
    const H = build({ plan: 1 });
    H.ai.callAI.mockResolvedValueOnce({ ok: true, data: '{"concept":"only"}' });
    const a = await (await doubt(H, { doubt: 'recursion?' })).json();
    expect(a.concept).toBe('Recursion');
    expect(a.ai_powered).toBe(true);
    H.ai.callAI.mockResolvedValueOnce({ ok: true, data: 'nothing parseable' });
    expect((await (await doubt(H, { doubt: 'recursion?' })).json()).concept).toBe('Recursion');
  });

  describe('AI unavailable: fallback resolutions by keyword (first matching branch wins)', () => {
    it.each([
      ['what is a closure', 'Closures & Lexical Scope', ['Lexical Scope', 'IIFE Pattern', 'Module Pattern', 'Higher-Order Functions']],
      ['variable scope', 'Closures & Lexical Scope', undefined],
      ['await in a loop', 'Async/Await & Promises', ['Event Loop', 'Callback Hell', 'Promise.all vs Promise.race', 'Error Handling in Async Code']],
      ['my promise never resolves', 'Async/Await & Promises', undefined],
      ['recursive function overflows', 'Recursion', ['Stack Overflow & Base Cases', 'Tail Recursion', 'Memoization', 'Iterative vs Recursive Solutions']],
      ['a weird bug', 'Debugging & Error Handling', ['Try-Catch Patterns', 'Optional Chaining', 'Error Boundaries in React', 'Logging Best Practices']],
      ['how to debug', 'Debugging & Error Handling', undefined],
      ['tell me about design', 'Software Engineering Fundamentals', ['Clean Code Principles', 'SOLID Principles', 'Design Patterns', 'Code Review Best Practices']],
      ['scope of an async fn', 'Closures & Lexical Scope', undefined], // closure/scope is checked before async
      ['async error', 'Async/Await & Promises', undefined], // async before error
    ])('%j -> %s', async (text, concept, related) => {
      const H = build({ plan: 1 });
      const res = await H.post('/api/ai-tutor/doubt', { doubt: text });
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.concept).toBe(concept);
      expect(body.ai_powered).toBe(false);
      expect(Object.keys(body)).toEqual(['concept', 'explanation', 'example', 'practiceQuestion', 'relatedTopics', 'ai_powered']);
      expect(body.example.startsWith('```javascript')).toBe(true);
      expect(typeof body.practiceQuestion).toBe('string');
      if (related) expect(body.relatedTopics).toEqual(related);
    });

    it('a code snippet longer than 10 characters wraps the explanation with debugging context', async () => {
      const H = build({ plan: 1 });
      const plain = await (await H.post('/api/ai-tutor/doubt', { doubt: 'recursion', codeSnippet: 'short' })).json();
      const wrapped = await (await H.post('/api/ai-tutor/doubt', { doubt: 'recursion', codeSnippet: 'function f() { f(); }' })).json();
      expect(plain.explanation.startsWith('Recursion is when a function calls itself')).toBe(true);
      expect(wrapped.explanation.startsWith("Looking at your code snippet, here's what I see:\n\nRecursion is when a function calls itself")).toBe(true);
      expect(wrapped.explanation.endsWith('Understanding what each variable holds at each point is key to finding issues.')).toBe(true);
    });

    it('the async sample code keeps the exact fetch-response text (written with a hex escape in the source)', async () => {
      const H = build({ plan: 1 });
      const body = await (await H.post('/api/ai-tutor/doubt', { doubt: 'promise' })).json();
      expect(body.example).toContain('.then(res => res.json())');
      expect(body.example).toContain('const user = await res.json();');
    });
  });
});

describe('/api/ai-tutor/conversations (authenticateToken only, real tutorHistoryService over the fake db)', () => {
  const messages = [{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'hello' }];

  it('POST saves for the caller, defaults title to topic and messages to [], and returns {success, conversation:{id, created_at}}', async () => {
    const H = build(); // no plan needed
    const res = await H.post('/api/ai-tutor/conversations', { topic: 'React hooks', messages });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Object.keys(body)).toEqual(['success', 'conversation']);
    expect(body.success).toBe(true);
    expect(Object.keys(body.conversation)).toEqual(['id', 'created_at']);
    expect(body.conversation.id).toBe(1);

    const row = H.db.tables.tutor_conversations[0];
    expect(row).toMatchObject({ user_id: USER_ID, topic: 'React hooks', title: 'React hooks', messages });
    const insert = H.db.mid2Calls.find((c) => c.sql.startsWith('INSERT INTO tutor_conversations'));
    expect(insert.params).toEqual([USER_ID, 'React hooks', 'React hooks', JSON.stringify(messages)]);

    await H.post('/api/ai-tutor/conversations', { topic: 'T', title: 'My title' });
    expect(H.db.tables.tutor_conversations[1]).toMatchObject({ title: 'My title', messages: [] });
  });

  it('POST with no body is a masked 500', async () => {
    const H = build();
    const res = await H.post('/api/ai-tutor/conversations', undefined);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal Server Error' });
  });

  it('GET list returns only the caller\'s conversations, newest update first, with message_count, limit 20', async () => {
    const H = build();
    const t = (n) => new Date(Date.UTC(2026, 0, n));
    H.db.add('tutor_conversations', { id: 1, user_id: USER_ID, topic: 'a', title: 'A', messages, created_at: t(1), updated_at: t(1) });
    H.db.add('tutor_conversations', { id: 2, user_id: USER_ID, topic: 'b', title: 'B', messages: [], created_at: t(2), updated_at: t(5) });
    H.db.add('tutor_conversations', { id: 3, user_id: OTHER_USER_ID, topic: 'c', title: 'C', messages, created_at: t(3), updated_at: t(9) });

    const res = await H.get('/api/ai-tutor/conversations');
    expect(res.status).toBe(200);
    const { conversations } = await res.json();
    expect(conversations.map((c) => c.id)).toEqual([2, 1]);
    expect(Object.keys(conversations[0])).toEqual(['id', 'topic', 'title', 'created_at', 'updated_at', 'message_count']);
    expect(conversations.map((c) => c.message_count)).toEqual([0, 2]);
    expect(H.db.mid2Calls[H.db.mid2Calls.length - 1].params).toEqual([USER_ID, 20]);
  });

  it('GET :id returns the full row for the owner; 404 for someone else\'s or a missing id', async () => {
    const H = build();
    H.db.add('tutor_conversations', { id: 1, user_id: USER_ID, topic: 'a', title: 'A', messages, created_at: new Date(), updated_at: new Date() });
    H.db.add('tutor_conversations', { id: 2, user_id: OTHER_USER_ID, topic: 'b', title: 'B', messages, created_at: new Date(), updated_at: new Date() });

    const own = await H.get('/api/ai-tutor/conversations/1');
    expect(own.status).toBe(200);
    const { conversation } = await own.json();
    expect(conversation).toMatchObject({ id: 1, user_id: USER_ID, topic: 'a', title: 'A', messages });

    for (const id of ['2', '999']) {
      const res = await H.get(`/api/ai-tutor/conversations/${id}`);
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: 'Conversation not found' });
    }
    // the other user sees theirs
    const theirs = await H.get('/api/ai-tutor/conversations/2', { token: H.otherToken });
    expect(theirs.status).toBe(200);
  });

  it('a non-numeric id reaches Postgres and fails: masked 500 (preserved), never the driver text', async () => {
    const H = build();
    const res = await H.get('/api/ai-tutor/conversations/abc');
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal Server Error' });
  });

  it('PUT replaces the messages of the caller\'s conversation and always answers {success:true}', async () => {
    const H = build();
    H.db.add('tutor_conversations', { id: 1, user_id: USER_ID, topic: 'a', title: 'A', messages: [], created_at: new Date(), updated_at: new Date(0) });
    H.db.add('tutor_conversations', { id: 2, user_id: OTHER_USER_ID, topic: 'b', title: 'B', messages: [], created_at: new Date(), updated_at: new Date(0) });

    const res = await H.put('/api/ai-tutor/conversations/1', { messages });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
    expect(H.db.tables.tutor_conversations[0].messages).toEqual(messages);
    const update = H.db.mid2Calls.find((c) => c.sql.startsWith('UPDATE tutor_conversations'));
    expect(update.params).toEqual([JSON.stringify(messages), '1', USER_ID]);

    // someone else's id: no row matches, still {success:true} (preserved), and their data is untouched
    const other = await H.put('/api/ai-tutor/conversations/2', { messages });
    expect(await other.json()).toEqual({ success: true });
    expect(H.db.tables.tutor_conversations[1].messages).toEqual([]);
  });

  it('PUT without "messages" writes NULL (JSON.stringify(undefined) becomes a NULL parameter): preserved', async () => {
    const H = build();
    H.db.add('tutor_conversations', { id: 1, user_id: USER_ID, topic: 'a', title: 'A', messages, created_at: new Date(), updated_at: new Date(0) });
    const res = await H.put('/api/ai-tutor/conversations/1', {});
    expect(res.status).toBe(200);
    const update = H.db.mid2Calls.find((c) => c.sql.startsWith('UPDATE tutor_conversations'));
    expect(update.params[0]).toBeUndefined();
    expect(H.db.tables.tutor_conversations[0].messages).toBeNull();
    // with no body at all the destructure throws first: masked 500
    const noBody = await H.put('/api/ai-tutor/conversations/1', undefined);
    expect(noBody.status).toBe(500);
  });

  it('DELETE removes the caller\'s conversation only and answers {success:true} either way', async () => {
    const H = build();
    H.db.add('tutor_conversations', { id: 1, user_id: USER_ID, topic: 'a', title: 'A', messages, created_at: new Date(), updated_at: new Date() });
    H.db.add('tutor_conversations', { id: 2, user_id: OTHER_USER_ID, topic: 'b', title: 'B', messages, created_at: new Date(), updated_at: new Date() });

    const foreign = await H.del('/api/ai-tutor/conversations/2');
    expect(await foreign.json()).toEqual({ success: true });
    expect(H.db.tables.tutor_conversations.map((r) => r.id)).toEqual([1, 2]);

    const own = await H.del('/api/ai-tutor/conversations/1');
    expect(own.status).toBe(200);
    expect(await own.json()).toEqual({ success: true });
    expect(H.db.tables.tutor_conversations.map((r) => r.id)).toEqual([2]);
  });

  it('database failures are masked 500s on every conversation endpoint', async () => {
    const H = build();
    H.db.failWhen((sql) => /tutor_conversations/.test(sql), new Error('relation "tutor_conversations" does not exist'));
    const calls = [
      H.get('/api/ai-tutor/conversations'),
      H.get('/api/ai-tutor/conversations/1'),
      H.post('/api/ai-tutor/conversations', { topic: 't' }),
      H.put('/api/ai-tutor/conversations/1', { messages }),
      H.del('/api/ai-tutor/conversations/1'),
    ];
    for (const res of await Promise.all(calls)) {
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: 'Internal Server Error' });
    }
  });

  it('works end to end through the service registry when the service is not overridden', async () => {
    const H = build({ registryTutorHistory: true });
    const res = await H.post('/api/ai-tutor/conversations', { topic: 'reg', messages });
    expect(res.status).toBe(200);
    expect((await res.json()).conversation.id).toBe(1);
  });
});
