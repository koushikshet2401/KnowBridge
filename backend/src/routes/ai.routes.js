/**
 * AI Routes - OpenAI Integration with RAG (Retrieval-Augmented Generation)
 * 
 * Location: backend/src/routes/ai.routes.js
 * 
 * FIXED VERSION: 
 * - Lowered similarity threshold
 * - Added Keyword Fallback search
 * - Improved System Prompt
 */

const express = require('express');
const router = express.Router();
const { asyncHandler } = require('../utils/asyncHandler');
const { chatMessageLimiter } = require('../middleware/rateLimiter');
const OpenAI = require('openai');
const pool = require('../config/database');
const logger = require('../utils/logger');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/**
 * Helper: Search KB and return context string
 */
async function getKBContext(query, threshold = 0.25, limit = 4) {
  try {
    // 1. Vector Search
    const embeddingResponse = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: query
    });

    const queryEmbedding = embeddingResponse.data[0].embedding;

    const vectorResult = await pool.query(`
      SELECT 
        title,
        content,
        1 - (embedding <=> $1::vector) as similarity
      FROM kb_articles
      WHERE 1 - (embedding <=> $1::vector) > $2
      ORDER BY similarity DESC
      LIMIT $3
    `, [JSON.stringify(queryEmbedding), threshold, limit]);

    let results = vectorResult.rows;

    // 2. Keyword Fallback (if vector search finds nothing or very little)
    if (results.length < 2) {
      const keywords = query.split(' ').filter(w => w.length > 3).map(w => `%${w}%`);
      if (keywords.length > 0) {
        const keywordResult = await pool.query(`
          SELECT title, content, 0.5 as similarity
          FROM kb_articles
          WHERE title ILIKE ANY($1) OR content ILIKE ANY($1)
          LIMIT $2
        `, [keywords, limit]);
        
        // Merge results, avoiding duplicates
        const existingTitles = new Set(results.map(r => r.title));
        keywordResult.rows.forEach(r => {
          if (!existingTitles.has(r.title)) {
            results.push(r);
          }
        });
      }
    }

    if (results.length === 0) return '';

    return results.map(r => `ARTICLE: ${r.title}\nCONTENT: ${r.content}`).join('\n\n');
  } catch (error) {
    logger.error('KB Context Retrieval Error:', error);
    return '';
  }
}

const Message = require('../models/Message');

/**
 * POST /api/ai/query
 */
router.post('/ai/query', 
  chatMessageLimiter,
  asyncHandler(async (req, res) => {
    const { question, history = [], max_tokens = 500, chatId, userId } = req.body;

    if (!question) {
      return res.status(400).json({ success: false, error: 'Question is required' });
    }

    // Save user message if chatId is provided (and deduplicate if already saved by startChat)
    if (chatId) {
      try {
        const lastMessages = await Message.getChatMessages(chatId, { limit: 1 });
        const isDuplicate = lastMessages.length > 0 && 
                            lastMessages[0].sender_type === 'user' && 
                            lastMessages[0].content === question;

        if (!isDuplicate) {
          const savedUserMsg = await Message.create({
            chatId,
            senderType: 'user',
            senderId: userId,
            content: question
          });

          // Emit socket event so admin dashboard receives user message in real-time
          const io = req.app.get('io');
          if (io) {
            io.to(`chat_${chatId}`).emit('new-message', {
              chatId,
              message: savedUserMsg,
              timestamp: new Date()
            });
          }
        } else {
          logger.info('Deduplicated user message already saved by startChat:', { chatId, question });
        }
      } catch (err) {
        logger.warn('Failed to save user message to history:', err);
      }
    }

    // Get Context
    const context = await getKBContext(question);

    if (!context) {
      logger.warn(`No KB context found for question: "${question}"`);
      
      const noContextAnswer = "I'm sorry, I couldn't find any information about that in our knowledge base. Is there anything else I can help you with regarding KnowBridge?";
      
      // Save AI "no context" answer if chatId is provided
      if (chatId) {
        try {
          const savedAiMsg = await Message.create({
            chatId,
            senderType: 'ai',
            content: noContextAnswer,
            aiModel: 'no-context',
            aiConfidence: 0
          });

          // Emit socket event so admin dashboard receives "no context" AI answer in real-time
          const io = req.app.get('io');
          if (io) {
            io.to(`chat_${chatId}`).emit('new-message', {
              chatId,
              message: savedAiMsg,
              timestamp: new Date()
            });
          }
        } catch (err) {
          logger.warn('Failed to save AI no-context message:', err);
        }
      }

      return res.json({
        success: true,
        answer: noContextAnswer,
        confidence: 0,
        handoff: false // CHANGED: Never auto-handoff
      });
    }

    // Build Prompt
    const messages = [
      {
        role: 'system',
        content: `You are KnowBridge's AI Support Assistant. 
        
STRICT RULE: You MUST answer the user's question ONLY using the provided Knowledge Base context below.
If the answer is NOT in the context, politely state that you don't have that information. 
DO NOT offer to connect to a human agent unless specifically asked.

KNOWLEDGE BASE CONTEXT:
${context}

Always be friendly and professional. If the user asks something irrelevant, guide them back to KnowBridge topics.`
      }
    ];

    // History
    history.slice(-3).forEach(msg => {
      if (msg.type === 'user') messages.push({ role: 'user', content: msg.content });
      else if (msg.type === 'ai') messages.push({ role: 'assistant', content: msg.content });
    });

    messages.push({ role: 'user', content: question });

    try {
      const aiModel = process.env.OPENAI_MODEL || 'gpt-3.5-turbo';
      const completion = await openai.chat.completions.create({
        model: aiModel,
        messages: messages,
        max_tokens: max_tokens,
        temperature: 0.2
      });

      const answer = completion.choices[0].message.content;

      // Save AI answer if chatId is provided
      if (chatId) {
        try {
          const savedAiMsg = await Message.create({
            chatId,
            senderType: 'ai',
            content: answer,
            aiModel: aiModel,
            aiConfidence: 1.0
          });

          // Emit socket event so admin dashboard receives AI answer in real-time
          const io = req.app.get('io');
          if (io) {
            io.to(`chat_${chatId}`).emit('new-message', {
              chatId,
              message: savedAiMsg,
              timestamp: new Date()
            });
          }
        } catch (err) {
          logger.warn('Failed to save AI answer to history:', err);
        }
      }

      res.json({
        success: true,
        answer: answer,
        confidence: 1.0
      });

    } catch (error) {
      logger.error('OpenAI Completion Error:', error);
      res.status(500).json({ success: false, error: 'AI service error' });
    }
  })
);

/**
 * POST /api/knowledge-base/query
 */
router.post('/knowledge-base/query',
  chatMessageLimiter,
  asyncHandler(async (req, res) => {
    const { query, limit = 5 } = req.body;

    try {
      // Lower threshold for helpful articles too
      const context = await getKBContext(query, 0.2, limit);
      if (!context) return res.json({ success: true, results: [], query });

      // Parse context back into list for widget
      const results = context.split('\n\n').map(art => {
        const lines = art.split('\n');
        return {
          title: lines[0].replace('ARTICLE: ', ''),
          excerpt: lines[1].replace('CONTENT: ', '').substring(0, 150) + '...'
        };
      });

      res.json({ success: true, results, query });
    } catch (error) {
      res.json({ success: true, results: [], query });
    }
  })
);

module.exports = router;
