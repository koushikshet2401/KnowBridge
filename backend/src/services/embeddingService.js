const OpenAI = require('openai');
const logger = require('../utils/logger');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function splitTextByTokens(text, chunkSize = 200, overlap = 40) {
  const words = text.split(/\s+/).filter(w => w.length > 0);
  const chunks = [];
  const step = chunkSize - overlap;

  for (let i = 0; i < words.length; i += step) {
    const chunk = words.slice(i, i + chunkSize).join(' ');
    if (chunk.trim().length > 50) {
      chunks.push({
        content: chunk,
        tokenCount: Math.ceil(chunk.length / 4)
      });
    }
    if (i + chunkSize >= words.length) break;
  }
  return chunks;
}

async function generateEmbeddings(texts) {
  try {
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: texts
    });
    return response.data.map(e => e.embedding);
  } catch (error) {
    logger.error('Embedding generation failed:', error.message);
    throw error;
  }
}

async function searchSimilarChunks(query, limit = 5) {
  const pool = require('../config/database');
  try {
    const queryEmbedding = await generateEmbeddings([query]);
    const embedding = queryEmbedding[0];

    const result = await pool.query(
      `SELECT dc.content, dc.chunk_index, d.title, d.source_url,
              1 - (dc.embedding <=> $1::vector) as similarity
       FROM document_chunks dc
       JOIN documents d ON dc.document_id = d.id
       WHERE d.is_active = true
         AND 1 - (dc.embedding <=> $1::vector) > 0.3
       ORDER BY dc.embedding <=> $1::vector
       LIMIT $2`,
      [JSON.stringify(embedding), limit]
    );
    return result.rows;
  } catch (error) {
    logger.error('Similarity search failed:', error.message);
    return [];
  }
}

module.exports = { generateEmbeddings, splitTextByTokens, searchSimilarChunks };