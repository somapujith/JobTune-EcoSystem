/**
 * Embeddings Utility for LM Studio
 * Handles text embedding via nomic-embed-text model (OpenAI-compatible)
 * Used for Resume Chat RAG (Retrieval-Augmented Generation)
 */

const baseURL = process.env.LM_STUDIO_URL || 'http://172.19.80.1:1234/v1';
const EMBED_MODEL = process.env.LM_STUDIO_MODEL_EMBED || 'nomic-embed-text-v1.5';

/**
 * Embed a single text string using LM Studio embeddings endpoint
 * @param {string} text - Text to embed
 * @returns {Promise<number[]|null>} - Embedding vector or null if error
 */
async function embedText(text) {
  if (!text || text.trim().length === 0) {
    return null;
  }

  try {
    const response = await fetch(`${baseURL}/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: EMBED_MODEL,
        input: text
      }),
      timeout: 30000
    });

    if (!response.ok) {
      console.warn(`Embeddings API error: ${response.status}`);
      return null;
    }

    const json = await response.json();
    const embedding = json.data?.[0]?.embedding;

    if (!embedding || !Array.isArray(embedding)) {
      console.warn('No embedding in response');
      return null;
    }

    return embedding;
  } catch (err) {
    console.error('Embedding error:', err.message);
    return null;
  }
}

/**
 * Compute cosine similarity between two vectors
 * @param {number[]} a - Vector A
 * @param {number[]} b - Vector B
 * @returns {number} - Cosine similarity (-1 to 1, higher = more similar)
 */
function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) {
    return 0;
  }

  let dotProduct = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    magnitudeA += a[i] * a[i];
    magnitudeB += b[i] * b[i];
  }

  magnitudeA = Math.sqrt(magnitudeA);
  magnitudeB = Math.sqrt(magnitudeB);

  if (magnitudeA === 0 || magnitudeB === 0) {
    return 0;
  }

  return dotProduct / (magnitudeA * magnitudeB);
}

/**
 * Find top-K most similar chunks to a query
 * @param {string} query - Search query text
 * @param {Array<{text: string, embedding: number[]}>} chunks - Chunk objects with text and embedding
 * @param {number} k - Number of top results to return
 * @returns {Promise<Array<{text: string, similarity: number}>>} - Top K chunks with similarity scores
 */
async function findTopSimilarChunks(query, chunks, k = 3) {
  if (!chunks || chunks.length === 0) {
    return [];
  }

  // Embed the query
  const queryEmbedding = await embedText(query);
  if (!queryEmbedding) {
    console.warn('Could not embed query');
    return [];
  }

  // Score each chunk
  const scores = chunks.map(chunk => {
    const embedding = Array.isArray(chunk.embedding)
      ? chunk.embedding
      : (typeof chunk.embedding === 'string'
        ? JSON.parse(chunk.embedding)
        : []);

    const similarity = cosineSimilarity(queryEmbedding, embedding);
    return {
      text: chunk.text,
      similarity,
      chunkIndex: chunk.chunkIndex || 0
    };
  });

  // Sort by similarity (descending) and return top K
  return scores
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, k);
}

/**
 * Chunk text into segments of approximately maxTokens
 * Simple approach: split by newlines first, then by sentences
 * @param {string} text - Text to chunk
 * @param {number} maxTokens - Target tokens per chunk (~4 chars = 1 token, rough estimate)
 * @returns {string[]} - Array of text chunks
 */
function chunkText(text, maxTokens = 500) {
  if (!text || text.length === 0) {
    return [];
  }

  const maxChars = maxTokens * 4; // Rough estimate: 4 chars ≈ 1 token
  const chunks = [];
  let currentChunk = '';

  // Split by paragraphs (double newline) first
  const paragraphs = text.split(/\n\n+/);

  for (const para of paragraphs) {
    const sentences = para.split(/(?<=[.!?])\s+/);

    for (const sentence of sentences) {
      if ((currentChunk + sentence).length > maxChars && currentChunk.length > 0) {
        chunks.push(currentChunk.trim());
        currentChunk = sentence;
      } else {
        currentChunk += (currentChunk ? ' ' : '') + sentence;
      }
    }

    // Add paragraph breaks
    if (currentChunk) {
      currentChunk += '\n\n';
    }
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks.filter(c => c.length > 20); // Filter tiny chunks
}

module.exports = {
  embedText,
  cosineSimilarity,
  findTopSimilarChunks,
  chunkText
};
