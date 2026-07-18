const logger = require('../utils/logger');

/**
 * Setup chat socket handlers for user-facing chat
 */
function setupChatSocket(io) {
  io.on('connection', (socket) => {
    // Get user and tenant info from handshake
    const userId = socket.handshake.auth?.userId || socket.handshake.query?.userId;
    const chatId = socket.handshake.auth?.chatId || socket.handshake.query?.chatId;
    const clientDomain = socket.handshake.auth?.clientDomain || socket.handshake.query?.clientDomain || 'unknown';

    logger.info(`Chat socket connected: ${socket.id} (User: ${userId}, Tenant: ${clientDomain})`);

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

    /**
     * Send message (from user)
     */
    socket.on('send-message', ({ chatId: msgChatId, message }) => {
      const room = msgChatId || chatId;
      if (room && message) {
        // Broadcast to all in chat room (including agents)
        io.to(`chat_${room}`).emit('new-message', {
          chatId: room,
          message,
          senderType: 'user',
          timestamp: new Date()
        });
        
        logger.info(`Message sent in chat ${room}`);
      }
    });

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
