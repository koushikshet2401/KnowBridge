import { io } from 'socket.io-client';

/**
 * Socket.IO Service
 * ✅ NO hardcoded URLs — reads from passed apiUrl or CHAT_CONFIG only
 */

let socket = null;

export const connectSocket = (apiUrl, userId) => {
  const base = apiUrl
    || (window.CHAT_CONFIG && window.CHAT_CONFIG.apiUrl)
    || '';

  if (!base) {
    console.error('KnowBridge Socket: No apiUrl provided! Check CHAT_BACKEND_URL in .env and blade template.');
    return null;
  }

  const socketUrl    = base.replace(/\/api\/?$/, '').replace(/\/$/, '');
  const clientDomain = (window.CHAT_CONFIG && window.CHAT_CONFIG.client_domain) || window.location.host;
  const token        = (window.CHAT_CONFIG && window.CHAT_CONFIG.authToken)
    || localStorage.getItem('KnowBridge_chat_token')
    || null;

  if (socket && socket.connected) {
    console.log('♻️ Reusing existing socket connection to:', socketUrl);
    return socket;
  }

  if (socket) {
    socket.disconnect();
    socket = null;
  }

  console.log('🔌 Connecting socket to:', socketUrl);

  socket = io(socketUrl, {
    auth:  { token, clientDomain },
    query: { userId: String(userId || ''), clientDomain },
    transports:           ['websocket', 'polling'],
    reconnection:         true,
    reconnectionDelay:    1000,
    reconnectionAttempts: 5,
    timeout:              10000
  });

  socket.on('connect',       ()    => console.log('✅ Socket.IO connected to:', socketUrl, '| ID:', socket.id));
  socket.on('disconnect',    (r)   => console.log('❌ Socket.IO disconnected:', r));
  socket.on('connect_error', (err) => console.error('Socket.IO connection error:', err.message, '| URL was:', socketUrl));
  socket.on('reconnect',     (n)   => console.log('🔄 Socket.IO reconnected after', n, 'attempt(s)'));

  return socket;
};

export const disconnectSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
    console.log('Socket.IO disconnected');
  }
};

export const joinChat  = (chatId) => socket?.connected && socket.emit('join-chat',  { chatId });
export const leaveChat = (chatId) => socket?.connected && socket.emit('leave-chat', { chatId });
export const sendTyping = (chatId, isTyping) => socket?.connected && socket.emit('typing', { chatId, isTyping });

export const getSocket          = () => socket;
export const isConnected        = () => !!(socket && socket.connected);
export const removeAllListeners = () => socket?.removeAllListeners();

export default {
  connectSocket, disconnectSocket,
  joinChat, leaveChat, sendTyping,
  getSocket, isConnected, removeAllListeners
};
