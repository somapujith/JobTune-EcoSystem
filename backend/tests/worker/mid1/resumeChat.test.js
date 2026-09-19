'use strict';

const { build, waitFor } = require('./helpers');
const { signToken } = require('../helpers/harness');
const { createRequestDb } = require('../../../src/worker/db');

const seedEmbeddings = (H, rows) => {
  H.store.state.resume_embeddings.push(...rows);
};

describe('worker routes/resumeChat.js (mounted at /api/resume-chat)', () => {
  beforeEach(() => jest.spyOn(console, 'error').mockImplementation(() => {}));
  afterEach(() => jest.restoreAllMocks());

  describe('auth parity (authenticateToken only, NO plan gate)', () => {
    it.each([
      ['/api/resume-chat/chat', { question: 'q', resumeId: 1 }],
      ['/api/resume-chat/embed', { resumeId: 1, resumeText: 'text' }],
    ])('POST %s: 401 without a token', async (path, body) => {
      const H = build({ plan: 3 });
      const res = await H.post(path, body, { auth: false });
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: 'Unauthorized' });
    });

    it('a user with no subscription is served (no requirePlan on either route)', async () => {
      const H = build();
      expect((await H.post('/api/resume-chat/chat', { question: 'q', resumeId: 1 })).status).toBe(404); // not 403
      expect((await H.post('/api/resume-chat/embed', { resumeId: 1, resumeText: 'text' })).status).toBe(200);
      await H.drain();
    });
  });

  describe('POST /chat', () => {
    it.each([
      ['question missing', { resumeId: 1 }],
      ['resumeId missing', { question: 'What skills?' }],
      ['both empty', { question: '', resumeId: 0 }],
    ])('400 when %s', async (_l, body) => {
      const H = build();
      const res = await H.post('/api/resume-chat/chat', body);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'Question and resumeId are required' });
    });

    it('404 when no embeddings are stored for this user/resume', async () => {
      const H = build();
      seedEmbeddings(H, [{ user_id: 2, resume_id: 1, chunk_index: 0, chunk_text: 'someone else', embedding: '[1]' }]);
      const res = await H.post('/api/resume-chat/chat', { question: 'q', resumeId: 1 });
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: 'Resume embeddings not found. Please re-upload your resume.' });
    });

    it('200: RAG answer + sources; stored embeddings parsed (string) or passed through (array); k = 3', async () => {
      const H = build({ env: { LM_STUDIO_MODEL_INTERVIEW: 'interview-model' } });
      const long = 'x'.repeat(150);
      seedEmbeddings(H, [
        { user_id: 1, resume_id: 7, chunk_index: 1, chunk_text: long, embedding: [0.3, 0.4] },
        { user_id: 1, resume_id: 7, chunk_index: 0, chunk_text: 'Experienced React developer', embedding: JSON.stringify([0.1, 0.2]) },
      ]);
      H.embeddings.findTopSimilarChunks.mockResolvedValueOnce([{ text: 'Experienced React developer' }, { text: long }]);
      H.aiClient.callAI.mockResolvedValueOnce({ ok: true, data: 'You know React.' });

      const res = await H.post('/api/resume-chat/chat', { question: 'What are my skills?', resumeId: 7 });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        answer: 'You know React.',
        sources: ['Source 1: Experienced React developer...', `Source 2: ${'x'.repeat(100)}...`],
      });

      // rows come back ORDER BY chunk_index; embeddings normalised to arrays
      expect(H.embeddings.findTopSimilarChunks).toHaveBeenCalledWith(
        'What are my skills?',
        [
          { text: 'Experienced React developer', embedding: [0.1, 0.2] },
          { text: long, embedding: [0.3, 0.4] },
        ],
        3
      );

      const args = H.aiClient.callAI.mock.calls[0][0];
      expect(args).toMatchObject({ maxTokens: 500, temperature: 0.5, model: 'interview-model', cache: false });
      expect(args.userPrompt).toBe(
        `Resume Content:\nExperienced React developer\n---\n${long}\n\nQuestion: What are my skills?\n\nProvide a helpful answer based on the resume above.`
      );
      expect(args.systemPrompt).toBe(
        "You are a career advisor analyzing a user's resume. Answer questions about their qualifications,\nexperience, and skills based ONLY on the provided resume content. Be helpful and specific. If the resume doesn't contain\nrelevant information, say so clearly."
      );
      expect(H.store.calls.find((c) => c.sql.startsWith('SELECT chunk_text')).params).toEqual([1, 7]);
    });

    it('400 when no chunk is relevant', async () => {
      const H = build();
      seedEmbeddings(H, [{ user_id: 1, resume_id: 1, chunk_index: 0, chunk_text: 't', embedding: '[1]' }]);
      H.embeddings.findTopSimilarChunks.mockResolvedValueOnce([]);
      const res = await H.post('/api/resume-chat/chat', { question: 'q', resumeId: 1 });
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'No relevant resume content found for your question.' });
      expect(H.aiClient.callAI).not.toHaveBeenCalled();
    });

    it('502 with the AI error text, or the default text when there is none', async () => {
      const H = build();
      seedEmbeddings(H, [{ user_id: 1, resume_id: 1, chunk_index: 0, chunk_text: 't', embedding: '[1]' }]);
      H.aiClient.callAI.mockResolvedValueOnce({ ok: false, error: 'LM Studio is down' });
      let res = await H.post('/api/resume-chat/chat', { question: 'q', resumeId: 1 });
      expect(res.status).toBe(502);
      expect(await res.json()).toEqual({ error: 'LM Studio is down' });

      H.aiClient.callAI.mockResolvedValueOnce({ ok: false });
      res = await H.post('/api/resume-chat/chat', { question: 'q', resumeId: 1 });
      expect(res.status).toBe(502);
      expect(await res.json()).toEqual({ error: 'AI service unavailable' });
    });

    it('500 {error:"Failed to process your question"} on DB failure, on service failure, and with no body', async () => {
      const H = build();
      H.store.failWhen((sql) => sql.startsWith('SELECT chunk_text'), new Error('down'));
      let res = await H.post('/api/resume-chat/chat', { question: 'q', resumeId: 1 });
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: 'Failed to process your question' });

      const H2 = build();
      seedEmbeddings(H2, [{ user_id: 1, resume_id: 1, chunk_index: 0, chunk_text: 't', embedding: '[1]' }]);
      H2.embeddings.findTopSimilarChunks.mockRejectedValueOnce(new Error('embedding server down'));
      res = await H2.post('/api/resume-chat/chat', { question: 'q', resumeId: 1 });
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: 'Failed to process your question' });

      res = await build().post('/api/resume-chat/chat', undefined); // req body undefined -> TypeError inside try
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: 'Failed to process your question' });
    });
  });

  describe('POST /embed', () => {
    it.each([
      ['resumeId missing', { resumeText: 'content' }],
      ['resumeText missing', { resumeId: 1 }],
      ['resumeText empty', { resumeId: 1, resumeText: '' }],
    ])('400 when %s', async (_l, body) => {
      const H = build();
      const res = await H.post('/api/resume-chat/embed', body);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'resumeId and resumeText are required' });
      expect(H.store.calls.filter((c) => /resume_embeddings/.test(c.sql))).toHaveLength(0);
    });

    it('500 {error:"Failed to start embedding"} when there is no body', async () => {
      const H = build();
      const res = await H.post('/api/resume-chat/embed', undefined);
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: 'Failed to start embedding' });
    });

    it('answers immediately; the job runs under waitUntil and stores the chunks; old rows for that resume are replaced', async () => {
      const H = build();
      seedEmbeddings(H, [
        { id: 90, user_id: 1, resume_id: 5, chunk_index: 0, chunk_text: 'OLD', embedding: '[9]' },
        { id: 91, user_id: 1, resume_id: 6, chunk_index: 0, chunk_text: 'other resume', embedding: '[8]' },
      ]);
      let releaseEmbed;
      H.embeddings.embedText.mockImplementationOnce(
        (chunk) => new Promise((resolve) => { releaseEmbed = () => resolve([chunk.length, 1]); })
      );

      const res = await H.post('/api/resume-chat/embed', { resumeId: 5, resumeText: 'Alpha\n\nBeta\n\nGamma' });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ message: 'Resume embedding started' });

      // the response is out while the job is still parked inside embedText: nothing inserted yet
      await waitFor(() => H.embeddings.embedText.mock.calls.length === 1);
      expect(H.store.state.resume_embeddings.filter((r) => r.resume_id === 5)).toHaveLength(0); // DELETE already ran
      expect(H.ctx.waits.length).toBeGreaterThan(0);

      releaseEmbed();
      await H.drain();

      const stored = H.store.state.resume_embeddings.filter((r) => r.resume_id === 5);
      expect(stored.map((r) => [r.user_id, r.chunk_index, r.chunk_text, r.embedding])).toEqual([
        [1, 0, 'Alpha', JSON.stringify([5, 1])],
        [1, 1, 'Beta', JSON.stringify([4, 1])],
        [1, 2, 'Gamma', JSON.stringify([5, 1])],
      ]);
      expect(H.store.state.resume_embeddings.find((r) => r.id === 91)).toBeDefined(); // other resume untouched
      expect(H.embeddings.chunkText).toHaveBeenCalledWith('Alpha\n\nBeta\n\nGamma', 500);
    });

    it('a chunk whose embedding is null is skipped (chunk_index keeps its gap)', async () => {
      const H = build();
      H.embeddings.embedText.mockImplementation(async (chunk) => (chunk === 'Beta' ? null : [1]));
      await H.post('/api/resume-chat/embed', { resumeId: 1, resumeText: 'Alpha\n\nBeta\n\nGamma' });
      await H.drain();
      expect(H.store.state.resume_embeddings.map((r) => [r.chunk_index, r.chunk_text])).toEqual([[0, 'Alpha'], [2, 'Gamma']]);
    });

    it('job failures are logged and swallowed; the response is already 200 and the client is released', async () => {
      const H = build();
      H.embeddings.embedText.mockRejectedValue(new Error('embedding server down'));
      const res = await H.post('/api/resume-chat/embed', { resumeId: 1, resumeText: 'Alpha' });
      expect(res.status).toBe(200);
      await H.drain();
      expect(console.error).toHaveBeenCalledWith('Error embedding resume:', 'embedding server down');
      const pool = H.store.pools[H.store.pools.length - 1];
      expect(pool.checkedOut).toBe(0);
      expect(pool.ended).toBe(true);
    });

    it('a failing DELETE (db error) is logged and swallowed', async () => {
      const H = build();
      H.store.failWhen((sql) => sql.startsWith('DELETE FROM resume_embeddings'), new Error('db error'));
      const res = await H.post('/api/resume-chat/embed', { resumeId: 1, resumeText: 'Alpha' });
      expect(res.status).toBe(200);
      await H.drain();
      expect(console.error).toHaveBeenCalledWith('Error embedding resume:', 'db error');
      expect(H.embeddings.embedText).not.toHaveBeenCalled();
    });

    it('DB LIFETIME: the request pool is not ended until the background job releases its client', async () => {
      const H = build();
      let releaseEmbed;
      H.embeddings.embedText.mockImplementationOnce(() => new Promise((resolve) => { releaseEmbed = () => resolve([1]); }));

      const res = await H.post('/api/resume-chat/embed', { resumeId: 3, resumeText: 'Alpha' });
      expect(res.status).toBe(200);
      await waitFor(() => H.embeddings.embedText.mock.calls.length === 1);
      // let db.release() (scheduled after the response) run and finish waiting on in-flight queries
      await new Promise((r) => setTimeout(r, 20));
      const pool = H.store.pools[H.store.pools.length - 1];
      expect(pool.checkedOut).toBe(1); // the job still holds its client...
      expect(pool.ended).toBe(true); // ...pool.end() has been called and is waiting for it, not returned yet

      releaseEmbed();
      await H.drain();
      expect(pool.checkedOut).toBe(0);
      expect(H.store.state.resume_embeddings).toHaveLength(1); // the INSERT after the network gap succeeded
    });

    it('WHY THE CLIENT IS HELD: a plain db.query chain across a network gap finds the pool already closed (real createRequestDb)', async () => {
      const H = build();
      const db = createRequestDb(() => H.store.newPool());
      const sleep = () => new Promise((r) => setTimeout(r, 15));
      const job = (async () => {
        await db.query('DELETE FROM resume_embeddings WHERE resume_id = $1', [1]);
        await sleep(); // stands for embedText's HTTP call
        return db.query('DELETE FROM resume_embeddings WHERE resume_id = $1', [2]);
      })();
      const release = db.release(); // what dbMiddleware schedules right after the response
      await expect(job).rejects.toThrow('db used after release');
      await release;
    });

    it('with no ExecutionContext (unit-test invocation) the route still answers 200', async () => {
      const H = build();
      const res = await H.app.request(
        '/api/resume-chat/embed',
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${signToken({ id: 1 })}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ resumeId: 1, resumeText: 'Alpha' }),
        },
        H.env // no 4th argument: c.executionCtx would throw; safeWaitUntil must cope
      );
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ message: 'Resume embedding started' });
      await waitFor(() => H.store.state.resume_embeddings.length === 1);
    });
  });
});
