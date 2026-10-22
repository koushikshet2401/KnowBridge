import { io } from 'socket.io-client';

/**
 * Socket.IO Service
 * ✅ NO hardcoded URLs — reads from passed apiUrl or CHAT_CONFIG only
 */

let socket = null;
let currentTenantId = null;

export const connectSocket = (apiUrl, userId, passedTenantId) => {
  const base = apiUrl
    || (window.CHAT_CONFIG && window.CHAT_CONFIG.apiUrl)
    || (window.ChatyConfig && window.ChatyConfig.apiUrl)
    || '';

  if (!base) {
    console.error('Chaty Socket: No apiUrl provided! Set apiUrl in window.ChatyConfig.');
    return null;
  }

  const socketUrl = base.replace(/\/api\/?$/, '').replace(/\/$/, '');
  const tenantId  = passedTenantId
    || (window.CHAT_CONFIG && window.CHAT_CONFIG.tenantId)
    || (window.ChatyConfig && window.ChatyConfig.tenantId)
    || localStorage.getItem('demo_site_tenant_id')
    || localStorage.getItem('chaty_tenant_id')
    || currentTenantId;

  if (tenantId) {
    currentTenantId = tenantId;
  }

  const token = (window.CHAT_CONFIG && window.CHAT_CONFIG.authToken)
    || (window.ChatyConfig && window.ChatyConfig.authToken)
    || localStorage.getItem('chaty_chat_token')
    || null;

  if (socket && socket.connected) {
    console.log('♻️ Reusing existing socket connection to:', socketUrl);
    return socket;
  }

  if (socket) {
    socket.disconnect();
    socket = null;
  }

  console.log('🔌 Connecting socket to:', socketUrl, '| Tenant:', tenantId);

  socket = io(socketUrl, {
    auth:  { token, tenantId },
    query: { userId: String(userId || ''), tenantId: String(tenantId || '') },
    transports:           ['websocket', 'polling'],
    reconnection:         true,
    reconnectionDelay:    1000,
    reconnectionAttempts: 10,
    timeout:              10000
  });

  socket.on('connect',       ()    => console.log('✅ Socket.IO connected to:', socketUrl, '| ID:', socket.id));
  socket.on('disconnect',    (r)   => console.log('❌ Socket.IO disconnected:', r));
  socket.on('connect_error', (err) => console.error('❌ Socket.IO connection error:', err.message, '| URL was:', socketUrl, '| tenantId:', tenantId));
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
