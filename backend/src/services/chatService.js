const pool         = require('../config/database');
const logger       = require('../utils/logger');
const aiService    = require('./aiService');
const emailService = require('./emailService');

class ChatService {

  // ── Start new chat ──────────────────────────────
  async startChat({ clientDomain, userId, userName, userEmail, channel, message }) {
    try {
      let user = null;
      if (userId) {
        const r = await pool.query(
          `SELECT * FROM users WHERE external_id = $1 AND client_domain = $2`,
          [String(userId), clientDomain]
        );
        user = r.rows[0];
      }

      if (!user) {
        const r = await pool.query(
          `INSERT INTO users (external_id, name, email, client_domain, created_at, updated_at)
           VALUES ($1, $2, $3, $4, NOW(), NOW())
           ON CONFLICT (client_domain, external_id) DO UPDATE
           SET name = EXCLUDED.name, email = EXCLUDED.email, updated_at = NOW()
           RETURNING *`,
          [String(userId || `guest_${Date.now()}`), userName || 'Guest', userEmail || null, clientDomain]
        );
        user = r.rows[0];
      }

      // Create new chat
      const chatResult = await pool.query(
        `INSERT INTO chats (user_id, status, channel, client_domain, created_at, updated_at)
         VALUES ($1, 'active', $2, $3, NOW(), NOW()) RETURNING *`,
        [user.id, channel || 'web', clientDomain]
      );
      const chat = chatResult.rows[0];

      // Greeting
      const hour     = new Date().getHours();
      const timeOfDay = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : hour < 20 ? 'evening' : 'day';
      const greeting  = await aiService.generateGreeting({ userName, timeOfDay });

      const greetingMsg = await pool.query(
        `INSERT INTO messages (chat_id, sender_type, content, created_at) VALUES ($1, 'ai', $2, NOW()) RETURNING *`,
        [chat.id, greeting]
      );
      let messages = [greetingMsg.rows[0]];

      if (message) {
        const result = await this.processMessage({ chatId: chat.id, content: message, userId: user.id });
        if (result.userMessage) messages.push(result.userMessage);
        if (result.aiMessage)   messages.push(result.aiMessage);
      }

      return { chat, messages, user };
    } catch (error) {
      logger.error('Start chat error:', error.message);
      throw error;
    }
  }

  // ── Process message ─────────────────────────────
  async processMessage({ chatId, content, attachments = [], userId }) {
    try {
      // Allow AI to continue responding even if chat is pending/escalated
      // ── Save user message ────────────────────────
      const userMsg = await pool.query(
        `INSERT INTO messages (chat_id, sender_type, content, created_at) VALUES ($1, 'user', $2, NOW()) RETURNING *`,
        [chatId, content]
      );
      const userMessage = userMsg.rows[0];

      if (global.io) {
        global.io.to(`chat_${chatId}`).emit('new-message', { chatId, message: { ...userMessage, chatId } });
      }

      // ── Check for pending escalation confirmation ──
      // ── Check if human agent is assigned ───────────
      const chatRes = await pool.query(`SELECT status, assigned_to, metadata FROM chats WHERE id = $1`, [chatId]);
      const chatRow = chatRes.rows[0] || {};
      const metadata = chatRow.metadata || {};

      if (chatRow.assigned_to || chatRow.status === 'pending' || chatRow.status === 'closed') {
        // Human agent is handling this chat, it's waiting for one, or it's closed. Do not generate an AI response.
        return {
          message: null,
          userMessage,
          aiMessage: null,
          suggestions: [],
          escalated: false
        };
      }
      
      if (metadata.pending_escalation_confirmation) {
        const lowerMsg = content.toLowerCase().trim();
        metadata.pending_escalation_confirmation = false;
        await pool.query(`UPDATE chats SET metadata = $1 WHERE id = $2`, [JSON.stringify(metadata), chatId]);
        
        if (['yes', 'yeah', 'yep', 'sure', 'ok', 'okay', 'please', 'i need'].some(k => lowerMsg.includes(k))) {
          this.escalateChatToHuman({
            chatId,
            userQuestion: "User confirmed handover after consecutive negative feedback",
            reason: 'Consecutive thumbs down'
          }).catch(e => logger.error('Escalation error:', e.message));
          
          const confirmMsg = await pool.query(
            `INSERT INTO messages (chat_id, sender_type, content, created_at) VALUES ($1, 'ai', $2, NOW()) RETURNING *`,
            [chatId, "I'm connecting you with a human support agent who can help you right away. Please wait a moment..."]
          );
          if (global.io) {
            global.io.to(`chat_${chatId}`).emit('new-message', { chatId, message: { ...confirmMsg.rows[0], chatId } });
          }
          return {
            message: confirmMsg.rows[0],
            userMessage,
            aiMessage: confirmMsg.rows[0],
            suggestions: [],
            escalated: true
          };
        } else if (['no', 'nope', 'nah', 'not now'].some(k => lowerMsg.includes(k))) {
          const cancelMsg = await pool.query(
            `INSERT INTO messages (chat_id, sender_type, content, created_at) VALUES ($1, 'ai', $2, NOW()) RETURNING *`,
            [chatId, "Okay, no problem! Is there anything else you need help with?"]
          );
          if (global.io) {
            global.io.to(`chat_${chatId}`).emit('new-message', { chatId, message: { ...cancelMsg.rows[0], chatId } });
          }
          return {
            message: cancelMsg.rows[0],
            userMessage,
            aiMessage: cancelMsg.rows[0],
            suggestions: [],
            escalated: false
          };
        }
      }

      // ── Conversation history ─────────────────────
      const historyResult = await pool.query(
        `SELECT sender_type, content FROM messages WHERE chat_id = $1 ORDER BY created_at DESC LIMIT 10`,
        [chatId]
      );
      const conversationHistory = historyResult.rows.reverse();

      // ── Generate AI response ─────────────────────
      let aiResult;
      try {
        aiResult = await aiService.generateResponse({
          userMessage: content,
          conversationHistory,
          knowledgeBaseContext: null
        });
      } catch (aiError) {
        logger.error('AI response generation failed:', aiError.message);
        aiResult = {
          response: "I'm having trouble connecting to my AI services right now. Let me connect you to a human agent.",
          needsEscalation: true
        };
      }

      // ✅ If escalation needed: update status to pending IMMEDIATELY
      // This prevents any concurrent request from sending another AI response
      if (aiResult.needsEscalation) {
        await pool.query(`UPDATE chats SET status = 'pending', updated_at = NOW() WHERE id = $1`, [chatId]);
        logger.info(`🔔 Chat ${chatId} status → pending (escalation triggered)`);
      }

      // ── Save AI response ─────────────────────────
      const aiMsg = await pool.query(
        `INSERT INTO messages (chat_id, sender_type, content, created_at) VALUES ($1, 'ai', $2, NOW()) RETURNING *`,
        [chatId, aiResult.response]
      );
      const aiMessage = aiMsg.rows[0];

      if (global.io) {
        global.io.to(`chat_${chatId}`).emit('new-message', {
          chatId,
          message: { ...aiMessage, chatId, suggestions: aiResult.suggestions || [] }
        });
      }

      // ── Handle escalation (email + socket notify) ─
      if (aiResult.needsEscalation) {
        this.escalateChatToHuman({
          chatId,
          userQuestion: content,
          reason: 'User explicitly requested a human agent'
        }).catch(e => logger.error('Escalation error:', e.message));
      }

      return {
        message:     aiMessage,
        userMessage,
        aiMessage,
        suggestions: aiResult.suggestions || [],
        escalated:   aiResult.needsEscalation || false
      };
    } catch (error) {
      logger.error('Process message error:', error.message);
      throw error;
    }
  }

  // ── Escalate to human ───────────────────────────
  async escalateChatToHuman({ chatId, userQuestion, reason }) {
    try {
      // Get chat and user info
      const chatResult = await pool.query(
        `SELECT c.*, u.name as user_name, u.email as user_email
         FROM chats c LEFT JOIN users u ON c.user_id = u.id WHERE c.id = $1`,
        [chatId]
      );
      const chat = chatResult.rows[0];

      // Extract domain to find tenant agents
      let tenantDomain = '';
      if (chat && chat.client_domain) {
        try {
          // e.g. "http://test.com" -> "test.com", "localhost:5500" -> "localhost"
          tenantDomain = chat.client_domain.replace(/^https?:\/\//, '').split(':')[0];
        } catch (e) {
          tenantDomain = chat.client_domain;
        }
      }

      // Get all admin agents for this tenant + super admins
      const agentsResult = await pool.query(
        `SELECT id, email, name, role FROM agents WHERE (role = 'super_admin' OR email = 'admin@demo.com' OR (role = 'admin' AND website_domain = $1)) AND email IS NOT NULL`,
        [tenantDomain]
      );
      
      const agentEmails = agentsResult.rows.map(a => a.email).filter(Boolean);

      logger.info(`🔔 Escalating chat ${chatId} — notifying ${agentEmails.length} agents`);

      // Send email
      if (agentEmails.length > 0 && process.env.ENABLE_EMAIL_NOTIFICATIONS === 'true') {
        try {
          await emailService.sendEscalationEmail({
            agentEmails,
            userQuestion,
            chatId,
            clientDomain: chat?.client_domain || 'unknown',
            userName:     chat?.user_name     || 'Anonymous',
            userEmail:    chat?.user_email    || 'Not provided'
          });
        } catch (emailErr) {
          logger.error('Email notification failed:', emailErr.message);
        }
      }

      // Save notification in DB
      for (const agent of agentsResult.rows) {
        try {
          await pool.query(
            `INSERT INTO notifications (user_id, type, message, chat_id, is_read, created_at)
             VALUES ($1, 'escalation', $2, $3, false, NOW())`,
            [agent.id, `Human support needed: "${userQuestion.slice(0, 100)}"`, chatId]
          );
        } catch (e) {
          logger.warn(`Could not save notification for ${agent.email}:`, e.message);
        }
      }

      // Socket notification
      if (global.io) {
        global.io.to('admin-room').emit('chat-escalated', {
          chatId,
          userQuestion,
          clientDomain: chat?.client_domain || 'unknown',
          userName:     chat?.user_name     || 'Anonymous',
          message:      'Chat needs human support'
        });
      }

      logger.info(`✅ Chat ${chatId} escalated to human agents`);
    } catch (error) {
      logger.error('Escalation error:', error.message);
    }
  }

  // ── Handle feedback ─────────────────────────────
  async handleFeedback({ messageId, chatId, userId, rating, comment }) {
    try {
      let feedback;
      try {
        const chatCheck = await pool.query(`SELECT user_id FROM chats WHERE id = $1`, [chatId]);
        const validUserId = chatCheck.rows[0]?.user_id || null;
        const r = await pool.query(
          `INSERT INTO feedback (message_id, chat_id, user_id, rating, comment, created_at)
           VALUES ($1, $2, $3, $4, $5, NOW()) RETURNING *`,
          [messageId, chatId, validUserId, rating, comment]
        );
        feedback = r.rows[0];
      } catch (e) {
        logger.warn('Could not save feedback:', e.message);
        feedback = { messageId, rating };
      }

      let action         = 'recorded';
      let improvedMessage = null;

      if (rating === 'negative') {
        try {
          // Check for 2 consecutive negative feedbacks
          const recentAIFeedback = await pool.query(
            `SELECT m.id, f.rating
             FROM messages m
             LEFT JOIN feedback f ON m.id = f.message_id
             WHERE m.chat_id = $1 AND m.sender_type = 'ai'
             ORDER BY m.created_at DESC LIMIT 2`,
            [chatId]
          );

          const lastTwo = recentAIFeedback.rows;
          const consecutiveNegatives = lastTwo.length === 2 && lastTwo[0].rating === 'negative' && lastTwo[1].rating === 'negative';

          if (consecutiveNegatives) {
            // Set pending_escalation_confirmation flag
            const chatMetadataRes = await pool.query(`SELECT metadata FROM chats WHERE id = $1`, [chatId]);
            const metadata = chatMetadataRes.rows[0]?.metadata || {};
            metadata.pending_escalation_confirmation = true;
            await pool.query(`UPDATE chats SET metadata = $1 WHERE id = $2`, [JSON.stringify(metadata), chatId]);

            const promptMsg = "I'm sorry I couldn't resolve your issue. Would you like to connect with a human support agent?";
            const promptRow = await pool.query(
              `INSERT INTO messages (chat_id, sender_type, content, created_at)
               VALUES ($1, 'ai', $2, NOW()) RETURNING *`,
              [chatId, promptMsg]
            );
            improvedMessage = promptRow.rows[0];

            if (global.io) {
              global.io.to(`chat_${chatId}`).emit('new-message', {
                chatId,
                message: { ...improvedMessage, chatId }
              });
            }
            action = 'escalation_prompt';
            return { feedback, action, improvedMessage };
          }
        } catch (e) {
          logger.warn('Feedback processing failed:', e.message);
        }
      }

      return { feedback, action, improvedMessage };
    } catch (error) {
      logger.error('Handle feedback error:', error.message);
      throw error;
    }
  }

  // ── Manual escalate ─────────────────────────────
  async escalateChat({ chatId, reason }) {
    const r = await pool.query(
      `UPDATE chats SET status = 'pending', updated_at = NOW() WHERE id = $1 RETURNING *`,
      [chatId]
    );
    if (!r.rows[0]) throw new Error('Chat not found');
    return r.rows[0];
  }

  // ── Reopen chat ─────────────────────────────────
  async reopenChat({ chatId }) {
    const r = await pool.query(
      `UPDATE chats SET status = 'active', updated_at = NOW() WHERE id = $1 RETURNING *`,
      [chatId]
    );
    if (!r.rows[0]) throw new Error('Chat not found');
    return r.rows[0];
  }
}

const chatServiceInstance = new ChatService();
module.exports = { ChatService: chatServiceInstance };
