import React, { useEffect, useRef, useState } from 'react';
import ChatBubble from './ChatBubble';
import ChatWindow from './ChatWindow';
import ConversationsList from './ConversationsList';
import { connectSocket, disconnectSocket } from '../services/socket';
import { initEmbedSound, playDropSound, playMessageSound } from '../utils/sound';
import './ChatWidget.css';

const ChatWidget = ({
  tenantId: propTenantId,
  userId,
  userName,
  userEmail,
  apiUrl     = '',    // ✅ empty — NOT 'http://127.0.0.1:5000'
  theme      = 'purple',
  position   = 'bottom-right',
  customTrigger = false,
  isOpen    = false,
  onToggle,
  onClose,
}) => {
  const [chatId, setChatId]           = useState(null);
  const [agentMessages, setAgentMessages] = useState([]);
  const [isConnected, setIsConnected] = useState(false);
  const [activeSocket, setActiveSocket] = useState(null);
  const [unreadCount, setUnreadCount] = useState(0);
  
  // New States for Conversations Feature
  const [currentView, setCurrentView] = useState('conversations'); // 'conversations' | 'chat'
  const [conversations, setConversations] = useState([]);
  const [isExpanded, setIsExpanded] = useState(false);

  const socketRef     = useRef(null);
  const agentMsgIdsRef = useRef(new Set());

  const safeIsOpen       = Boolean(isOpen);
  const safeCustomTrigger = Boolean(customTrigger);
  const safeTheme        = String(theme    || 'purple');
  const safePosition     = String(position || 'bottom-right');

  // Trigger drop sound on widget embed / load
  useEffect(() => {
    initEmbedSound();
  }, []);

  // Fetch conversation history
  useEffect(() => {
    if (safeIsOpen && currentView === 'conversations') {
      import('../services/api').then(api => {
        api.getUserChats(userId || 'anonymous')
          .then(data => {
            if (data && data.chats) {
              setConversations(data.chats);
            }
          })
          .catch(err => console.error("Failed to fetch conversations", err));
      });
    }
  }, [safeIsOpen, userId, currentView]);

  useEffect(() => {
    if (typeof window.updateChatUnreadCount === 'function') {
      window.updateChatUnreadCount(Number(unreadCount) || 0);
    }
  }, [unreadCount]);

  useEffect(() => {
    if (safeIsOpen && !isConnected) {
      const socket = connectSocket(String(apiUrl || ''), String(userId || ''), propTenantId);

      if (!socket) {
        console.error('Chaty: Socket connection failed — apiUrl may be missing');
        return;
      }

      socketRef.current = socket;
      setActiveSocket(socket);

      if (socket.connected) {
        setIsConnected(true);
      }

      socket.on('connect', () => {
        console.log('✅ Chat socket connected');
        setIsConnected(true);
        if (chatId) {
          socket.emit('join-chat', { chatId: String(chatId) });
        }
      });
      socket.on('disconnect', () => { console.log('❌ Chat socket disconnected'); setIsConnected(false); });

      socket.on('new-message', (data) => {
        let msg = data;
        if (data && typeof data === 'object' && data.message) msg = data.message;

        // ✅ Only add AGENT messages — skip user/ai (ChatWindow handles those)
        if (!msg || msg.sender_type === 'user' || msg.sender_type === 'ai') return;

        const msgId = String(msg.id || '');
        if (msgId && agentMsgIdsRef.current.has(msgId)) return;
        if (msgId) agentMsgIdsRef.current.add(msgId);

        setAgentMessages(prev => [...prev, msg]);

        if (!safeIsOpen) {
          setUnreadCount(prev => (Number(prev) || 0) + 1);
          playMessageSound(0.25);
        }

        if (Notification.permission === 'granted' && !safeIsOpen) {
          new Notification('New message from support', {
            body: String(msg.content || '').slice(0, 80),
            icon: '/favicon.ico'
          });
        }
      });

      socket.on('agent_typing', (payload) => {
        console.log('Agent typing:', Boolean(payload?.isTyping));
      });

      return () => {
        disconnectSocket();
        setIsConnected(false);
        setActiveSocket(null);
      };
    }
  }, [safeIsOpen, apiUrl, userId, propTenantId]);

  useEffect(() => {
    if (safeIsOpen) {
      setUnreadCount(0);
      if (Notification.permission === 'default') Notification.requestPermission();
    }
  }, [safeIsOpen]);

  useEffect(() => {
    const s = activeSocket || socketRef.current;
    if (isConnected && s && chatId) {
      console.log(`🔗 Joining chat room: ${chatId}`);
      s.emit('join-chat', { chatId: String(chatId) });
    }
  }, [isConnected, chatId, activeSocket]);

  const handleChatCreated = (newChatId) => {
    const safeChatId = newChatId ? String(newChatId) : null;
    setChatId(safeChatId);
    const s = activeSocket || socketRef.current;
    if (s && safeChatId) {
      s.emit('join-chat', { chatId: safeChatId });
    }
  };

  const handleSelectChat = (selectedId) => {
    setChatId(selectedId);
    setCurrentView('chat');
    // Clear agent messages when opening a new chat window
    setAgentMessages([]);
  };

  const handleNewChat = () => {
    setChatId(null);
    setCurrentView('chat');
    setAgentMessages([]);
  };

  const handleBubbleToggle = () => {
    if (!safeIsOpen) {
      playDropSound(0.20);
    }
    if (onToggle) onToggle();
  };

  return (
    <div className={`chat-widget theme-${safeTheme} position-${safePosition} ${safeCustomTrigger ? 'custom-trigger-mode' : ''} ${isExpanded ? 'chaty-chat-expanded' : ''}`}>
      {!safeCustomTrigger && (
        <ChatBubble
          isOpen={safeIsOpen}
          onClick={handleBubbleToggle}
          unreadCount={Number(unreadCount) || 0}
          isConnected={Boolean(isConnected)}
        />
      )}
      {safeIsOpen && currentView === 'conversations' && (
        <ConversationsList
          conversations={conversations}
          onSelectChat={handleSelectChat}
          onNewChat={handleNewChat}
          onClose={onClose}
        />
      )}
      {safeIsOpen && currentView === 'chat' && (
        <ChatWindow
          userId={userId    ? String(userId)    : ''}
          userName={userName ? String(userName)  : ''}
          userEmail={userEmail ? String(userEmail) : ''}
          chatId={chatId    ? String(chatId)    : null}
          messages={agentMessages}
          apiUrl={apiUrl    ? String(apiUrl)    : ''}
          socket={activeSocket || socketRef.current}
          isConnected={Boolean(isConnected)}
          onClose={onClose}
          onBack={() => setCurrentView('conversations')}
          isExpanded={isExpanded}
          onToggleExpand={() => setIsExpanded(!isExpanded)}
          onChatCreated={handleChatCreated}
          onNewMessage={null}
        />
      )}
    </div>
  );
};

export default ChatWidget;
