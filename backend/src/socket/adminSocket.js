const logger = require('../utils/logger');
const Agent = require('../models/Agent');

const setupAdminSocket = (io) => {
  const adminNamespace = io.of('/admin');

  adminNamespace.on('connection', async (socket) => {
    // Get agent info from handshake
    const agentId = socket.handshake.auth?.agentId || 
                    socket.handshake.query?.agentId;
    const token = socket.handshake.auth?.token ||
                  socket.handshake.query?.token;

    if (!agentId) {
      logger.warn(`Admin socket connected without agentId: ${socket.id}`);
      // Don't disconnect - allow connection but limit features
    } else {
      logger.info(`Admin socket connected: ${socket.id} (Agent: ${agentId})`);
      
      // Join agent's personal room
      socket.join(`agent:${agentId}`);
      
      // Update agent status to online
      try {
        await Agent.updateStatus(agentId, 'online');
      } catch (error) {
        logger.error('Error updating agent status:', error.message);
      }
    }

    // Join admin room
    socket.join('admin-room');

    // Handle events
    socket.on('join-chat', (chatId) => {
      socket.join(`chat:${chatId}`);
      logger.info(`Agent ${agentId} joined chat room: ${chatId}`);
    });

    socket.on('leave-chat', (chatId) => {
      socket.leave(`chat:${chatId}`);
    });

    socket.on('typing', ({ chatId, isTyping }) => {
      socket.to(`chat:${chatId}`).emit('agent-typing', {
        chatId,
        isTyping,
        agentId
      });
    });

    socket.on('disconnect', async () => {
      logger.info(`Admin socket disconnected: ${socket.id}`);
      
      if (agentId) {
        try {
          await Agent.updateStatus(agentId, 'offline');
        } catch (error) {
          logger.error('Error updating agent status on disconnect:', error.message);
        }
      }
    });
  });
};

module.exports = { setupAdminSocket };
