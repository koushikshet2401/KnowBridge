const pool = require('../config/database');
const { ChatService } = require('../services');
const { Chat, Message, Feedback } = require('../models');
const logger = require('../utils/logger');

/**
 * Extract client tenant domain from request
 */
const getClientDomain = (req) => {
  if (req.body && req.body.client_domain) {
    return req.body.client_domain.toLowerCase().trim();
  }
  if (req.headers['x-client-domain']) {
    return req.headers['x-client-domain'].toLowerCase().trim();
  }
  const origin = req.headers.origin || req.headers.referer;
  if (origin) {
    try {
      const url = new URL(origin);
      if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
        return `${url.hostname}:${url.port}`;
      }
      return url.hostname;
    } catch (e) {}
  }
  return 'unknown';
};

// ── Start new chat ──────────────────────────────────────
exports.startChat = async (req, res) => {
  try {
    const { user_id, user_name, user_email, channel, message } = req.body;
    const clientDomain = getClientDomain(req);

    const result = await ChatService.startChat({
      clientDomain,
      userId: user_id || null,
      userName: user_name || 'Guest',
      userEmail: user_email || null,
      channel: channel || 'web',
      message
    });

    res.status(200).json({
      success: true,
      chat: result.chat,
      messages: result.messages,
      user: result.user
    });
  } catch (error) {
    logger.error('Start chat error:', error);
    res.status(500).json({ error: 'Failed to start chat', message: error.message });
  }
};

// ── Get chat by ID ──────────────────────────────────────
exports.getChatById = async (req, res) => {
  try {
    const { chatId } = req.params;
    const chat = await Chat.findById(chatId);
    if (!chat) return res.status(404).json({ error: 'Chat not found' });
    res.status(200).json({ success: true, chat });
  } catch (error) {
    logger.error('Get chat error:', error);
    res.status(500).json({ error: 'Failed to get chat' });
  }
};

// ── Get user chat history ────────────────────────────────
exports.getUserChatHistory = async (req, res) => {
  try {
    const clientDomain = getClientDomain(req);
    console.log(`[getUserChatHistory] Called. clientDomain extracted as: "${clientDomain}"`);

    // Fetch the 5 most recent domain-wide conversations as requested
    const result = await Chat.getAll({
      clientDomain,
      page: 1,
      limit: 5
    });
    
    console.log(`[getUserChatHistory] Query returned ${result.chats ? result.chats.length : 0} chats. Sending to client.`);

    res.status(200).json({ success: true, ...result });
  } catch (error) {
    logger.error('Get user chat history error:', error);
    res.status(500).json({ error: 'Failed to get chat history' });
  }
};

// ── Update chat status ───────────────────────────────────
exports.updateChatStatus = async (req, res) => {
  try {
    const { chatId } = req.params;
    const { status } = req.body;

    if (!['active', 'pending', 'closed'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const chat = await Chat.updateStatus(chatId, status);
    if (!chat) return res.status(404).json({ error: 'Chat not found' });

    res.status(200).json({ success: true, chat });
  } catch (error) {
    logger.error('Update chat status error:', error);
    res.status(500).json({ error: 'Failed to update chat status' });
  }
};

// ── Send message (from widget/student) ──────────────────
exports.sendMessage = async (req, res) => {
  try {
    const { chat_id, message, attachments } = req.body;

    if (!chat_id || !message) {
      return res.status(400).json({ error: 'chat_id and message are required' });
    }

    const result = await ChatService.processMessage({
      chatId: chat_id,
      content: message,
      attachments: attachments || []
    });

    res.status(200).json({
      success: true,
      message: result.message,
      suggestions: result.suggestions || [],
      escalated: result.escalated
    });
  } catch (error) {
    logger.error('Send message error:', error);
    res.status(500).json({ error: 'Failed to send message', message: error.message });
  }
};

// ── Get chat messages ────────────────────────────────────
exports.getChatMessages = async (req, res) => {
  try {
    const { chatId } = req.params;
    const { limit = 100 } = req.query;

    const messages = await Message.getChatMessages(chatId, {
      limit: parseInt(limit)
    });

    res.status(200).json({ success: true, messages });
  } catch (error) {
    logger.error('Get chat messages error:', error);
    res.status(500).json({ error: 'Failed to get messages' });
  }
};

// ── Upload file ──────────────────────────────────────────
exports.uploadFile = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    res.status(200).json({
      success: true,
      file: {
        filename: req.file.filename,
        originalName: req.file.originalname,
        path: `/uploads/${req.file.filename}`,
        size: req.file.size,
        mimeType: req.file.mimetype
      }
    });
  } catch (error) {
    logger.error('Upload file error:', error);
    res.status(500).json({ error: 'Failed to upload file' });
  }
};

// ── Submit feedback ──────────────────────────────────────
exports.submitFeedback = async (req, res) => {
  try {
    const { messageId, chatId, userId, rating, comment } = req.body;

    const result = await ChatService.handleFeedback({
      messageId,
      chatId,
      userId,
      rating,
      comment: comment || null
    });

    res.status(200).json({
      success: true,
      feedback: result.feedback,
      action: result.action,
      improvedMessage: result.improvedMessage || null
    });
  } catch (error) {
    logger.error('Submit feedback error:', error);
    res.status(500).json({ error: 'Failed to submit feedback' });
  }
};

// ── Get chat feedback ────────────────────────────────────
exports.getChatFeedback = async (req, res) => {
  try {
    const { chatId } = req.params;

    let feedback = [];
    try {
      feedback = await Feedback.getChatFeedback(chatId);
    } catch (e) {
      const result = await pool.query(
        `SELECT * FROM feedback WHERE chat_id = $1 ORDER BY created_at DESC`,
        [chatId]
      );
      feedback = result.rows;
    }

    res.status(200).json({ success: true, feedback });
  } catch (error) {
    logger.error('Get chat feedback error:', error);
    res.status(500).json({ error: 'Failed to get feedback' });
  }
};

// ── Escalate to human (manual) ───────────────────────────
exports.escalateToHuman = async (req, res) => {
  try {
    const { chatId } = req.params;
    const { reason } = req.body;

    const chat = await ChatService.escalateChat({
      chatId,
      reason: reason || 'User requested human support'
    });

    const io = req.app.get('io');
    if (io) {
      io.to('admin-room').emit('chat-escalated', {
        chatId,
        chat,
        reason: reason || 'User requested'
      });
    }

    res.status(200).json({
      success: true,
      chat,
      message: 'Chat escalated to human support'
    });
  } catch (error) {
    logger.error('Escalate chat error:', error);
    res.status(500).json({ error: 'Failed to escalate chat' });
  }
};

// ── Retry AI response ────────────────────────────────────
exports.retryAIResponse = async (req, res) => {
  try {
    const { chatId } = req.params;
    const { messageId, userId } = req.body;

    if (!messageId || !userId) {
      return res.status(400).json({ error: 'messageId and userId are required' });
    }

    const result = await ChatService.handleFeedback({
      messageId,
      chatId,
      userId,
      rating: 'negative',
      comment: 'User requested retry'
    });

    if (result.improvedMessage) {
      const io = req.app.get('io');
      if (io) {
        io.to(`chat_${chatId}`).emit('new-message', {
          chatId,
          message: result.improvedMessage
        });
      }
    }

    res.status(200).json({
      success: true,
      message: result.improvedMessage,
      action: result.action
    });
  } catch (error) {
    logger.error('Retry AI response error:', error);
    res.status(500).json({ error: 'Failed to retry response' });
  }
};

// ── Close chat ───────────────────────────────────────────
exports.closeChat = async (req, res) => {
  try {
    const { chatId } = req.params;
    const { rating, ratingComment } = req.body;

    const result = await pool.query(
      `UPDATE chats 
       SET status = 'closed', closed_at = NOW(), updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [chatId]
    );

    if (!result.rows[0]) {
      return res.status(404).json({ error: 'Chat not found' });
    }

    res.status(200).json({ success: true, chat: result.rows[0] });
  } catch (error) {
    logger.error('Close chat error:', error);
    res.status(500).json({ error: 'Failed to close chat' });
  }
};

// ── Reopen chat ──────────────────────────────────────────
exports.reopenChat = async (req, res) => {
  try {
    const { chatId } = req.params;
    const chat = await ChatService.reopenChat({ chatId });
    res.status(200).json({ success: true, chat, message: 'Chat reopened successfully' });
  } catch (error) {
    logger.error('Reopen chat error:', error);
    res.status(500).json({ error: 'Failed to reopen chat' });
  }
};

// ── Rate chat ────────────────────────────────────────────
exports.rateChat = async (req, res) => {
  try {
    const { chatId } = req.params;
    const { rating, comment } = req.body;

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'Rating must be between 1 and 5' });
    }

    let chat;
    try {
      chat = await Chat.close(chatId, rating, comment || null);
    } catch (e) {
      const result = await pool.query(
        `UPDATE chats SET status = 'closed', updated_at = NOW() WHERE id = $1 RETURNING *`,
        [chatId]
      );
      chat = result.rows[0];
    }

    res.status(200).json({ success: true, chat, message: 'Thank you for your feedback!' });
  } catch (error) {
    logger.error('Rate chat error:', error);
    res.status(500).json({ error: 'Failed to rate chat' });
  }
};
