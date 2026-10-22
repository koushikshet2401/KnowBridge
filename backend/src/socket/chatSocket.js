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
      if (!tenantId) {
        logger.warn(`Chat socket handshake rejected: Missing Tenant ID from ${socket.id}`);
        return next(new Error('Missing Tenant ID'));
      }

      const origin = socket.handshake.headers.origin || socket.handshake.headers.referer;
      if (process.env.NODE_ENV !== 'production') {
        if (!origin || origin === 'null') return next();
      } else {
        if (!origin) return next(new Error('Origin header is required'));
      }

      let hostname;
      try {
        hostname = new URL(origin).hostname;
      } catch (e) {
        hostname = origin;
      }
      
      if (process.env.NODE_ENV !== 'production') {
        if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === 'null' || hostname === '::1') {
          return next();
        }
      }
      hostname = String(hostname || '').replace('www.', '');

      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(tenantId)) {
        logger.warn(`Chat socket handshake rejected: Invalid Tenant ID format (${tenantId})`);
        return next(new Error('Invalid Tenant ID format'));
      }

      const result = await pool.query('SELECT domain FROM tenants WHERE id = $1', [tenantId]);
      if (result.rows.length === 0) {
        logger.warn(`Chat socket handshake rejected: Tenant not found (${tenantId})`);
        return next(new Error('Invalid Tenant ID'));
      }

      const tenant = result.rows[0];
      if (tenant.domain) {
        let tenantDomain = tenant.domain.replace('www.', '');
        if (tenantDomain.includes('://')) {
            try { tenantDomain = new URL(tenantDomain).hostname; } catch(e) {}
        }
        if (hostname !== tenantDomain) {
           if (process.env.NODE_ENV !== 'production') {
             logger.warn(`⚠️ SOCKET DEV WARNING: Tenant domain mismatch! Expected ${tenantDomain}, got ${hostname} (allowed in dev)`);
             return next();
           }
           logger.warn(`🚨 SOCKET SECURITY: Tenant domain mismatch! Expected ${tenantDomain}, got ${hostname}`);
           return next(new Error('Unauthorized origin for this tenant'));
        }
      } else {
        if (process.env.NODE_ENV !== 'production') return next();
        return next(new Error('Tenant domain not configured'));
      }

      next();
    } catch (e) {
      logger.error(`Chat socket tenant validation failed for ${socket.id}: ${e.message}`);
      next(new Error('Tenant validation failed'));
    }
  });

  io.on('connection', (socket) => {
    // Get user and tenant info from handshake
    const userId = socket.handshake.auth?.userId || socket.handshake.query?.userId;
    const chatId = socket.handshake.auth?.chatId || socket.handshake.query?.chatId;
    const tenantId = socket.handshake.auth?.tenantId || socket.handshake.query?.tenantId || 'unknown';

    logger.info(`✅ Chat socket connected: ${socket.id} (User: ${userId}, Tenant: ${tenantId})`);

    // ============================================
    // USER CHAT ROOM MANAGEMENT
    // ============================================

    /**
     * Join a chat room (for users)
     */
    socket.on('join-chat', async ({ chatId: roomChatId } = {}) => {
      const room = roomChatId || chatId;
      if (room) {
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(room)) {
          logger.warn(`User socket ${socket.id} tried to join invalid room UUID: ${room}`);
          socket.emit('joined-chat', { chatId: room, success: false, error: 'Invalid chat ID' });
          return;
        }

        // Only allow joining chats that belong to this socket's tenant
        try {
          if (uuidRegex.test(tenantId)) {
            const owns = await pool.query('SELECT 1 FROM chats WHERE id = $1 AND tenant_id = $2', [room, tenantId]);
            if (owns.rows.length === 0) {
              logger.warn(`User socket ${socket.id} tried to join chat ${room} not owned by tenant ${tenantId}`);
              socket.emit('joined-chat', { chatId: room, success: false, error: 'Chat not found' });
              return;
            }
          }
        } catch (e) {
          logger.error(`Error verifying chat ownership for room ${room}: ${e.message}`);
          socket.emit('joined-chat', { chatId: room, success: false, error: 'Chat not found' });
          return;
        }
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
      if (room && socket.rooms.has(`chat_${room}`)) {
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
      if (room && socket.rooms.has(`chat_${room}`)) {
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
