const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { pool } = require('../config/database');
const { callAI } = require('../utils/aiClient');
const { embedText, findTopSimilarChunks, chunkText } = require('../utils/embeddings');

// ── Embed and store a resume's text chunks ─────────────────────────────────
async function embedAndStoreResume(userId, resumeId, resumeText) {
  try {
    // Clear old embeddings for this resume
    await pool.query('DELETE FROM resume_embeddings WHERE resume_id = $1', [resumeId]);

    // Chunk the resume text
    const chunks = chunkText(resumeText, 500);

    // Embed each chunk
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const embedding = await embedText(chunk);

      if (embedding) {
        await pool.query(
          'INSERT INTO resume_embeddings (user_id, resume_id, chunk_index, chunk_text, embedding) VALUES ($1, $2, $3, $4, $5)',
          [userId, resumeId, i, chunk, JSON.stringify(embedding)]
        );
      }
    }

  } catch (err) {
    console.error('Error embedding resume:', err.message);
  }
}

// ── POST /api/resume/chat - Chat with resume using RAG ─────────────────────
router.post('/chat', authenticateToken, async (req, res) => {
  try {
    const { question, resumeId } = req.body;
    const userId = req.user.id;

    if (!question || !resumeId) {
      return res.status(400).json({ error: 'Question and resumeId are required' });
    }

    // Fetch all embeddings for this resume
    const embeddings = await pool.query(
      'SELECT chunk_text, embedding FROM resume_embeddings WHERE user_id = $1 AND resume_id = $2 ORDER BY chunk_index',
      [userId, resumeId]
    );

    if (embeddings.rows.length === 0) {
      return res.status(404).json({ error: 'Resume embeddings not found. Please re-upload your resume.' });
    }

    // Parse embeddings (stored as JSON strings)
    const chunks = embeddings.rows.map(e => ({
      text: e.chunk_text,
      embedding: typeof e.embedding === 'string' ? JSON.parse(e.embedding) : e.embedding
    }));

    // Find most relevant chunks
    const topChunks = await findTopSimilarChunks(question, chunks, 3);

    if (topChunks.length === 0) {
      return res.status(400).json({ error: 'No relevant resume content found for your question.' });
    }

    // Build context from top chunks
    const context = topChunks.map(c => c.text).join('\n---\n');

    // Use LLM to answer the question with context
    const systemPrompt = `You are a career advisor analyzing a user's resume. Answer questions about their qualifications,
experience, and skills based ONLY on the provided resume content. Be helpful and specific. If the resume doesn't contain
relevant information, say so clearly.`;

    const userPrompt = `Resume Content:
${context}

Question: ${question}

Provide a helpful answer based on the resume above.`;

    const aiResult = await callAI({
      systemPrompt,
      userPrompt,
      maxTokens: 500,
      temperature: 0.5,
      model: process.env.LM_STUDIO_MODEL_INTERVIEW // Use interview model for conversational response
    });

    if (!aiResult.ok) {
      return res.status(502).json({ error: aiResult.error || 'AI service unavailable' });
    }

    // Return answer with sources
    res.json({
      answer: aiResult.data,
      sources: topChunks.map((c, i) => `Source ${i + 1}: ${c.text.substring(0, 100)}...`)
    });
  } catch (err) {
    console.error('Resume chat error:', err.message);
    res.status(500).json({ error: 'Failed to process your question' });
  }
});

// ── POST /api/resume/embed - Embed a resume when uploaded ───────────────────
// Called by resume.js after upload
router.post('/embed', authenticateToken, async (req, res) => {
  try {
    const { resumeId, resumeText } = req.body;
    const userId = req.user.id;

    if (!resumeId || !resumeText) {
      return res.status(400).json({ error: 'resumeId and resumeText are required' });
    }

    // Embed in background (don't wait for response)
    embedAndStoreResume(userId, resumeId, resumeText).catch(err => {
      console.error('Background embedding failed:', err);
    });

    res.json({ message: 'Resume embedding started' });
  } catch (err) {
    console.error('Resume embed endpoint error:', err.message);
    res.status(500).json({ error: 'Failed to start embedding' });
  }
});

module.exports = router;
module.exports.embedAndStoreResume = embedAndStoreResume;
