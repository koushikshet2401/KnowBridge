const logger = require('../utils/logger');
const Agent = require('../models/Agent');
const pool = require('../config/database');

const setupAdminSocket = (io) => {
  const adminNamespace = io.of('/admin');

  adminNamespace.on('connection', async (socket) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;

    if (!token) {
      logger.warn(`Admin socket connected without token: ${socket.id}`);
      return;
    }

    let agentId, tenantId;
    try {
      const jwt = require('jsonwebtoken');
      if (!process.env.JWT_SECRET) throw new Error('Server misconfiguration: JWT_SECRET missing');
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      agentId = decoded.id;
      tenantId = decoded.tenant_id;
    } catch (err) {
      logger.error(`Admin socket invalid token: ${err.message}`);
      socket.disconnect();
      return;
    }

    logger.info(`Admin socket connected: ${socket.id} (Agent: ${agentId}, Tenant: ${tenantId})`);
    
    // Join agent's personal room
    socket.join(`agent:${agentId}`);
    
    // Join strictly isolated tenant room
    socket.join(`tenant_room_${tenantId}`);
    
    // Update agent status to online (in background without blocking event registration)
    Agent.updateStatus(agentId, 'online').catch((error) => {
      logger.error('Error updating agent status:', error.message);
    });

    // Handle events
    // The dashboard sends { chatId }; older callers send the bare id
    const toChatId = (data) => (data && typeof data === 'object' ? data.chatId : data);

    socket.on('join-chat', async (data) => {
      const chatId = toChatId(data);
      logger.info(`Admin socket ${socket.id} (Agent ${agentId}) received join-chat for: ${chatId}`);
      if (!chatId) return;

      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(chatId)) {
        logger.warn(`Agent ${agentId} attempted to join invalid chat room format: ${chatId}`);
        socket.emit('joined-chat', { chatId, success: false, error: 'Invalid chat ID' });
        return;
      }

      try {
        // Agents may only watch chats that belong to their own tenant
        if (tenantId && uuidRegex.test(tenantId)) {
          const owns = await pool.query('SELECT 1 FROM chats WHERE id = $1 AND tenant_id = $2', [chatId, tenantId]);
          if (owns.rows.length === 0) {
            logger.warn(`Agent ${agentId} attempted to join chat ${chatId} not belonging to tenant ${tenantId}`);
            socket.emit('joined-chat', { chatId, success: false, error: 'Chat not found' });
            return;
          }
        }
      } catch (e) {
        logger.error(`Error validating chat access for agent ${agentId}:`, e.message);
        socket.emit('joined-chat', { chatId, success: false, error: 'Chat access validation failed' });
        return;
      }
      socket.join(`chat:${chatId}`);
      logger.info(`✅ Agent ${agentId} joined chat room: ${chatId}`);
      socket.emit('joined-chat', { chatId, success: true });
    });

    socket.on('leave-chat', (data) => {
      const chatId = toChatId(data);
      if (chatId) socket.leave(`chat:${chatId}`);
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
