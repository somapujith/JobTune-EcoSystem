'use strict';

/**
 * Worker port of backend/src/routes/resumeChat.js  (mounted at /api/resume-chat).
 * Slice: mid1 (ADR-001 Phase 3).
 *
 *   POST /chat    authenticateToken                 RAG answer over stored resume chunks
 *   POST /embed   authenticateToken                 start background embedding of a resume
 *
 * Services (injected, owned by the infra slice): getServices(c).aiClient  (callAI)
 *                                                getServices(c).embeddings (embedText, findTopSimilarChunks, chunkText)
 * Model selection: config.vars.LM_STUDIO_MODEL_INTERVIEW (was a process-environment read).
 *
 * Behaviour is otherwise identical to Express: same statuses, bodies, SQL and messages.
 *
 * PLATFORM DEVIATIONS (see docs/migration/wave/mid1.md):
 *   1. /embed: the Express handler answered immediately and let the embedding run as a floating promise.
 *      Here the job is handed to safeWaitUntil(c, ...) so the runtime keeps it alive after the response.
 *   2. The request db (db.js) closes its pool once the queries in flight at the end of the request have
 *      settled. This job alternates network calls (embedText) with queries, so a plain db.query() chain
 *      would find the pool already closed for the first INSERT. The job therefore checks out ONE pooled
 *      client synchronously (db.connect(), before the handler returns) and releases it when finished;
 *      the pool cannot end while a client is checked out, so db.release() waits for the job.
 *      UNVERIFIED against the real Neon driver (only modelled in tests).
 *   3. Express also exported embedAndStoreResume from the router module. Nothing in Express, nor any
 *      other route, imports it, so it is not exported here.
 */
const { createRouter } = require('../lib/routes');
const { authenticateToken } = require('../middleware/auth');
const { getConfig, getServices } = require('../lib/context');
const { getDb } = require('../db');
const { getBody, safeWaitUntil } = require('../lib/http');

const router = createRouter();

// ── Embed and store a resume's text chunks ─────────────────────────────────
async function embedAndStoreResume(db, embeddingsService, userId, resumeId, resumeText) {
  let client = null;
  try {
    // Hold a pooled client for the whole job (see PLATFORM DEVIATIONS 2). Falls back to the db itself
    // if it has no connect(); nothing to release in that case.
    client = typeof db.connect === 'function' ? await db.connect() : db;

    // Clear old embeddings for this resume
    await client.query('DELETE FROM resume_embeddings WHERE resume_id = $1', [resumeId]);

    // Chunk the resume text
    const chunks = embeddingsService.chunkText(resumeText, 500);

    // Embed each chunk
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const embedding = await embeddingsService.embedText(chunk);

      if (embedding) {
        await client.query(
          'INSERT INTO resume_embeddings (user_id, resume_id, chunk_index, chunk_text, embedding) VALUES ($1, $2, $3, $4, $5)',
          [userId, resumeId, i, chunk, JSON.stringify(embedding)]
        );
      }
    }
  } catch (err) {
    console.error('Error embedding resume:', err.message);
  } finally {
    if (client && client !== db && typeof client.release === 'function') {
      try {
        client.release();
      } catch (releaseErr) {
        console.error('Error releasing embedding client:', releaseErr.message);
      }
    }
  }
}

// ── POST /api/resume-chat/chat - Chat with resume using RAG ─────────────────
router.post('/chat', authenticateToken, async (c) => {
  try {
    const { question, resumeId } = getBody(c);
    const userId = c.get('user').id;

    if (!question || !resumeId) {
      return c.json({ error: 'Question and resumeId are required' }, 400);
    }

    // Fetch all embeddings for this resume
    const embeddings = await getDb(c).query(
      'SELECT chunk_text, embedding FROM resume_embeddings WHERE user_id = $1 AND resume_id = $2 ORDER BY chunk_index',
      [userId, resumeId]
    );

    if (embeddings.rows.length === 0) {
      return c.json({ error: 'Resume embeddings not found. Please re-upload your resume.' }, 404);
    }

    // Parse embeddings (stored as JSON strings)
    const chunks = embeddings.rows.map(e => ({
      text: e.chunk_text,
      embedding: typeof e.embedding === 'string' ? JSON.parse(e.embedding) : e.embedding
    }));

    // Find most relevant chunks
    const { aiClient, embeddings: embeddingsService } = getServices(c);
    const topChunks = await embeddingsService.findTopSimilarChunks(question, chunks, 3);

    if (topChunks.length === 0) {
      return c.json({ error: 'No relevant resume content found for your question.' }, 400);
    }

    // Build context from top chunks
    const context = topChunks.map(tc => tc.text).join('\n---\n');

    // Use LLM to answer the question with context
    const systemPrompt = `You are a career advisor analyzing a user's resume. Answer questions about their qualifications,
experience, and skills based ONLY on the provided resume content. Be helpful and specific. If the resume doesn't contain
relevant information, say so clearly.`;

    const userPrompt = `Resume Content:
${context}

Question: ${question}

Provide a helpful answer based on the resume above.`;

    const aiResult = await aiClient.callAI({
      systemPrompt,
      userPrompt,
      maxTokens: 500,
      temperature: 0.5,
      model: getConfig(c).vars.LM_STUDIO_MODEL_INTERVIEW, // Use interview model for conversational response
      cache: false
    });

    if (!aiResult.ok) {
      return c.json({ error: aiResult.error || 'AI service unavailable' }, 502);
    }

    // Return answer with sources
    return c.json({
      answer: aiResult.data,
      sources: topChunks.map((tc, i) => `Source ${i + 1}: ${tc.text.substring(0, 100)}...`)
    });
  } catch (err) {
    console.error('Resume chat error:', err.message);
    return c.json({ error: 'Failed to process your question' }, 500);
  }
});

// ── POST /api/resume-chat/embed - Embed a resume when uploaded ──────────────
// Called by resume.js after upload
router.post('/embed', authenticateToken, async (c) => {
  try {
    const { resumeId, resumeText } = getBody(c);
    const userId = c.get('user').id;

    if (!resumeId || !resumeText) {
      return c.json({ error: 'resumeId and resumeText are required' }, 400);
    }

    // Embed in background (don't wait for response). embedAndStoreResume runs synchronously up to its
    // first await, so its pooled client is checked out before this handler returns.
    const { embeddings: embeddingsService } = getServices(c);
    const job = embedAndStoreResume(getDb(c), embeddingsService, userId, resumeId, resumeText).catch(err => {
      console.error('Background embedding failed:', err);
    });
    safeWaitUntil(c, job);

    return c.json({ message: 'Resume embedding started' });
  } catch (err) {
    console.error('Resume embed endpoint error:', err.message);
    return c.json({ error: 'Failed to start embedding' }, 500);
  }
});

module.exports = router;
