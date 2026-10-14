/**
 * Emit a chat event to everyone watching a chat:
 * - the end user's widget (default namespace, room `chat_<id>`)
 * - agents viewing the chat in the admin dashboard (`/admin` namespace, room `chat:<id>`)
 */
function emitToChat(chatId, event, payload) {
  const io = global.io;
  if (!io || !chatId) return;
  io.to(`chat_${chatId}`).emit(event, payload);
  io.of('/admin').to(`chat:${chatId}`).emit(event, payload);
}

module.exports = { emitToChat };
