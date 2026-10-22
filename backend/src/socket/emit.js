const logger = require('../utils/logger');

function emitToChat(chatId, event, payload) {
  const io = global.io;
  if (!io || !chatId) {
    logger.warn(`emitToChat called without io or chatId (chatId: ${chatId})`);
    return;
  }
  logger.info(`📡 [SOCKET EMIT] chat_${chatId} & admin chat:${chatId} -> event: "${event}"`);
  io.to(`chat_${chatId}`).emit(event, payload);
  io.of('/admin').to(`chat:${chatId}`).emit(event, payload);
}

module.exports = { emitToChat };

