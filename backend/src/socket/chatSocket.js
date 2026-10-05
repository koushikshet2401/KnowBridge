const logger = require('../utils/logger');
const pool = require('../config/database');

/**
 * Setup chat socket handlers for user-facing chat
 */
function setupChatSocket(io) {
  
  // Security: Prevent malicious origins from connecting to tenant websockets
  io.use(async (socket, next) => {
    try {
      const tenantId = socket.handshake.auth?.tenantId || socket.handshake.query?.tenantId;
      if (!tenantId) return next(new Error('Missing Tenant ID'));

      const origin = socket.handshake.headers.origin || socket.handshake.headers.referer;
      if (!origin && process.env.NODE_ENV !== 'production') return next(); // Allow Postman in dev
      if (!origin) return next(new Error('Origin header is required'));

      let hostname;
      try {
        hostname = new URL(origin).hostname;
      } catch (e) {
        hostname = origin;
      }
      
      if (hostname === 'localhost' || hostname === '127.0.0.1') return next();
      hostname = hostname.replace('www.', '');

      const result = await pool.query('SELECT domain FROM tenants WHERE id = $1', [tenantId]);
      if (result.rows.length === 0) return next(new Error('Invalid Tenant ID'));

      const tenant = result.rows[0];
      if (tenant.domain) {
        let tenantDomain = tenant.domain.replace('www.', '');
        if (tenantDomain.includes('://')) {
            try { tenantDomain = new URL(tenantDomain).hostname; } catch(e) {}
        }
        if (hostname !== tenantDomain) {
           logger.warn(`🚨 SOCKET SECURITY: Tenant domain mismatch! Expected ${tenantDomain}, got ${hostname}`);
           return next(new Error('Unauthorized origin for this tenant'));
        }
      } else {
        return next(new Error('Tenant domain not configured'));
      }

      next();
    } catch (e) {
      next(new Error('Tenant validation failed'));
    }
  });

  io.on('connection', (socket) => {
    // Get user and tenant info from handshake
    const userId = socket.handshake.auth?.userId || socket.handshake.query?.userId;
    const chatId = socket.handshake.auth?.chatId || socket.handshake.query?.chatId;
    const tenantId = socket.handshake.auth?.tenantId || socket.handshake.query?.tenantId || 'unknown';

    logger.info(`Chat socket connected: ${socket.id} (User: ${userId}, Tenant: ${tenantId})`);

    // ============================================
    // USER CHAT ROOM MANAGEMENT
    // ============================================

    /**
     * Join a chat room (for users)
     */
    socket.on('join-chat', ({ chatId: roomChatId }) => {
      const room = roomChatId || chatId;
      if (room) {
        socket.join(`chat_${room}`);
        logger.info(`User socket ${socket.id} joined chat: ${room}`);
        
        socket.emit('joined-chat', { 
          chatId: room, 
          success: true,
          timestamp: new Date()
        });
      }
    });

    /**
     * Leave a chat room
     */
    socket.on('leave-chat', ({ chatId: roomChatId }) => {
      const room = roomChatId || chatId;
      if (room) {
        socket.leave(`chat_${room}`);
        logger.info(`User socket ${socket.id} left chat: ${room}`);
      }
    });

    // NOTE: 'send-message' was intentionally removed.
    // ALL messages MUST be sent via the REST API (POST /api/chat/message) 
    // to enforce database persistence, rate limiting, and signature verification.
    // Emitting messages directly via socket bypasses backend security.

    /**
     * User typing indicator
     */
    socket.on('typing', ({ chatId: typingChatId }) => {
      const room = typingChatId || chatId;
      if (room) {
        socket.to(`chat_${room}`).emit('user-typing', {
          chatId: room,
          isTyping: true,
          timestamp: new Date()
        });
      }
    });

    /**
     * User stopped typing
     */
    socket.on('stop-typing', ({ chatId: typingChatId }) => {
      const room = typingChatId || chatId;
      if (room) {
        socket.to(`chat_${room}`).emit('user-typing', {
          chatId: room,
          isTyping: false,
          timestamp: new Date()
        });
      }
    });

    // ============================================
    // DISCONNECT
    // ============================================

    socket.on('disconnect', (reason) => {
      logger.info(`Chat socket disconnected: ${socket.id}, reason: ${reason}`);
    });

    socket.on('error', (error) => {
      logger.error(`Chat socket error (${socket.id}):`, error);
    });
  });
}

/**
 * Helper function to emit message to chat room
 */
function emitMessageToChat(io, chatId, message) {
  io.to(`chat_${chatId}`).emit('new-message', {
    ...message,
    timestamp: new Date()
  });
  logger.info(`Message emitted to chat ${chatId}`);
}

/**
 * Emit chat escalation to user
 */
function emitChatEscalatedToUser(io, chatId, agentName) {
  io.to(`chat_${chatId}`).emit('chat-escalated', {
    chatId,
    agentName,
    message: 'Your chat has been escalated to a human agent',
    timestamp: new Date()
  });
}

/**
 * Emit chat closed notification to user
 */
function emitChatClosedToUser(io, chatId) {
  io.to(`chat_${chatId}`).emit('chat-closed', {
    chatId,
    message: 'This chat has been closed',
    timestamp: new Date()
  });
}

module.exports = {
  setupChatSocket,
  emitMessageToChat,
  emitChatEscalatedToUser,
  emitChatClosedToUser
};
