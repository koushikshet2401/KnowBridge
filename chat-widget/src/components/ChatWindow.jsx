import React, { useState, useEffect, useRef } from 'react';
import { sendMessage, startChat, submitFeedback, getChatMessages, getChatById } from '../services/api';
import { getSocket } from '../services/socket';
import { playDropSound, playMessageSound, isMuted, toggleMuted, subscribeMuteChange } from '../utils/sound';

// ── Icons ────────────────────────────────────────
const Send = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
  </svg>
);
const Bot = ({ size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="10" rx="2" /><circle cx="12" cy="5" r="2" />
    <path d="M12 7v4" /><line x1="8" y1="16" x2="8" y2="16" /><line x1="16" y1="16" x2="16" y2="16" />
  </svg>
);
const User = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
  </svg>
);
const ThumbsUp = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
  </svg>
);
const ThumbsDown = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17" />
  </svg>
);
const X = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);
const ChevronLeft = ({ size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="15 18 9 12 15 6" />
  </svg>
);
const Maximize = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
  </svg>
);
const Minimize = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3" />
  </svg>
);
const Volume2 = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
    <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
  </svg>
);
const VolumeX = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
    <line x1="23" y1="9" x2="17" y2="15" />
    <line x1="17" y1="9" x2="23" y2="15" />
  </svg>
);

// ── ChatWindow ───────────────────────────────────
const ChatWindow = ({
  userId, userName, userEmail,
  chatId: initialChatId,
  messages: externalMessages,
  socket, isConnected,
  onClose, onChatCreated, onNewMessage,
  onBack, isExpanded, onToggleExpand,
  apiUrl
}) => {
  const [messages, setMessages]       = useState([]);
  const [inputText, setInputText]     = useState('');
  const [chatId, setChatId]           = useState(initialChatId ? String(initialChatId) : null);
  const [chatStatus, setChatStatus]   = useState('active');
  const [assignedAgent, setAssignedAgent] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isMutedState, setIsMutedState] = useState(isMuted());
  const messagesEndRef                = useRef(null);
  const messageIdsRef                 = useRef(new Set());
  const isSubmittingRef               = useRef(false);

  useEffect(() => {
    return subscribeMuteChange(setIsMutedState);
  }, []);

  const toggleSound = () => {
    const next = toggleMuted();
    setIsMutedState(next);
    if (!next) {
      playDropSound(0.20);
    }
  };

  // ── Only merge NEW external messages (agent replies) ──
  useEffect(() => {
    if (externalMessages && Array.isArray(externalMessages) && externalMessages.length > 0) {
      setMessages(prev => {
        const existingIds = new Set(prev.map(m => String(m.id)));
        const newOnes     = externalMessages.filter(m => m.id && !existingIds.has(String(m.id)));
        if (!newOnes.length) return prev;
        newOnes.forEach(m => messageIdsRef.current.add(String(m.id)));
        return [...prev, ...newOnes];
      });
    }
  }, [externalMessages]);

  useEffect(() => {
    const cid = initialChatId ? String(initialChatId) : null;
    setChatId(cid);
    
    if (!cid) {
      const gid = 'greeting-' + Date.now();
      messageIdsRef.current = new Set([gid]); // Reset tracking
      setMessages([{
        id: gid,
        content: 'Hello! 👋\n\nHow can I help you today?',
        sender_type: 'ai',
        created_at: new Date().toISOString()
      }]);
      setChatStatus('active');
      setAssignedAgent(null);
    } else {
      // Fetch existing messages and chat details for the selected chat
      setIsAnalyzing(true);
      
      Promise.all([
        getChatMessages(cid),
        getChatById(cid).catch(() => null)
      ])
        .then(([msgData, chatData]) => {
          if (msgData && msgData.messages) {
            const msgs = msgData.messages;
            const ids = new Set(msgs.map(m => String(m.id)));
            messageIdsRef.current = ids;
            setMessages(msgs);
          }
          if (chatData && chatData.chat) {
            setChatStatus(chatData.chat.status || 'active');
            if (chatData.chat.agent_name || chatData.chat.assigned_agent_id) {
              setAssignedAgent({
                name: chatData.chat.agent_name || 'Support Agent',
                id: chatData.chat.assigned_agent_id
              });
            } else {
              setAssignedAgent(null);
            }
          }
        })
        .catch(err => console.error("Failed to fetch chat details", err))
        .finally(() => setIsAnalyzing(false));
    }
  }, [initialChatId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const activeSocket = socket || getSocket();

  useEffect(() => {
    const s = activeSocket;
    if (s && chatId) {
      const handleStatusChange = (payload) => {
        console.log('🔔 Received chat-status-changed in widget:', payload);
        if (payload && String(payload.chatId) === String(chatId)) {
          if (payload.status) setChatStatus(payload.status);
          if (payload.agentName || payload.assignedAgentId) {
            setAssignedAgent({
              name: payload.agentName || 'Support Agent',
              id: payload.assignedAgentId
            });
          } else if (payload.isAi || !payload.assignedAgentId) {
            setAssignedAgent(null);
          }
        }
      };

      const handleAssigned = (payload) => {
        console.log('🔔 Received chat-assigned in widget:', payload);
        if (payload && String(payload.chatId) === String(chatId)) {
          setChatStatus('active');
          const agentName = payload.agentName || 'Support Agent';
          setAssignedAgent({
            name: agentName,
            id: payload.agentId
          });
          addMessage({
            id: 'assigned-' + Date.now(),
            content: `You are now connected with ${agentName}.`,
            sender_type: 'system',
            created_at: new Date().toISOString()
          });
        }
      };

      const handleEscalated = (payload) => {
        console.log('🔔 Received chat-escalated in widget:', payload);
        if (payload && String(payload.chatId) === String(chatId)) {
          if (payload.status) setChatStatus(payload.status);
          if (payload.agentName) {
            setAssignedAgent({
              name: payload.agentName,
              id: payload.assignedAgentId
            });
          }
        }
      };

      const handleNewMessage = (payload) => {
        console.log('💬 Received new-message in widget:', payload);
        const msg = (payload && payload.message) ? payload.message : payload;
        const msgChatId = (payload && payload.chatId) || (msg && (msg.chat_id || msg.chatId));
        if (msgChatId && String(msgChatId) !== String(chatId)) return;
        if (!msg) return;

        // Whenever an AI or Agent message arrives, stop analyzing immediately and play message chime
        if (msg.sender_type === 'ai' || msg.sender_type === 'agent') {
          setIsAnalyzing(false);
          playMessageSound(0.24);
        }

        // Deduplicate user messages: replace matching optimistic temp message
        if (msg.sender_type === 'user') {
          setMessages(prev => {
            if (msg.id && prev.some(m => String(m.id) === String(msg.id))) return prev;
            const tempIdx = prev.findIndex(m => m.id && String(m.id).startsWith('temp-') && m.content === msg.content);
            if (tempIdx !== -1) {
              const updated = [...prev];
              updated[tempIdx] = msg;
              messageIdsRef.current.delete(String(prev[tempIdx].id));
              if (msg.id) messageIdsRef.current.add(String(msg.id));
              return updated;
            }
            if (msg.id && messageIdsRef.current.has(String(msg.id))) return prev;
            if (msg.id) messageIdsRef.current.add(String(msg.id));
            return [...prev, msg];
          });
          return;
        }

        addMessage(msg);

        // If an agent message arrives, ensure the waiting banner is dismissed and agent status is shown
        if (msg.sender_type === 'agent') {
          setChatStatus('active');
          if (msg.agent_name || msg.sender_id) {
            setAssignedAgent(prev => ({
              name: msg.agent_name || prev?.name || 'Support Agent',
              id: msg.sender_id || prev?.id
            }));
          }
        }
      };

      const handleJoined = (res) => {
        console.log('✅ Widget joined chat room confirmation:', res);
      };

      const joinChatRoom = () => {
        console.log(`📡 Widget emitting join-chat for room: ${chatId}`);
        s.emit('join-chat', { chatId: String(chatId) });
      };

      if (s.connected) {
        joinChatRoom();
      }
      s.on('connect', joinChatRoom);
      s.on('joined-chat', handleJoined);
      s.on('chat-status-changed', handleStatusChange);
      s.on('chat-assigned', handleAssigned);
      s.on('chat-escalated', handleEscalated);
      s.on('new-message', handleNewMessage);

      return () => {
        s.off('connect', joinChatRoom);
        s.off('joined-chat', handleJoined);
        s.off('chat-status-changed', handleStatusChange);
        s.off('chat-assigned', handleAssigned);
        s.off('chat-escalated', handleEscalated);
        s.off('new-message', handleNewMessage);
      };
    }
  }, [activeSocket, chatId]);

  // ── Add message (deduplication) ──────────────────
  const addMessage = (msg) => {
    if (!msg) return;
    const id = String(msg.id || '');
    if (id && messageIdsRef.current.has(id)) return;
    if (id) messageIdsRef.current.add(id);
    setMessages(prev => {
      if (id && prev.some(m => String(m.id) === id)) return prev;
      return [...prev, msg];
    });
  };

  // ── Send message ─────────────────────────────────
  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (isSubmittingRef.current) return;
    
    const text = String(inputText || '').trim();
    if (!text) return;

    isSubmittingRef.current = true;
    setIsAnalyzing(true);

    // Add user message immediately
    const tempId = 'temp-' + Date.now();
    messageIdsRef.current.add(tempId);
    setMessages(prev => [...prev, {
      id: tempId, content: text, sender_type: 'user',
      created_at: new Date().toISOString()
    }]);
    setInputText('');
    playDropSound(0.18);

    try {
      let currentChatId = chatId;

      if (!currentChatId) {
        const startResponse = await startChat(
          text, String(userId || ''), String(userName || ''), String(userEmail || '')
        );
        setIsAnalyzing(false);
        currentChatId = startResponse?.chat?.id ? String(startResponse.chat.id) : null;
        if (currentChatId) {
          // Immediately show the messages from startChat
          if (startResponse.messages && startResponse.messages.length > 0) {
            setMessages(startResponse.messages);
            messageIdsRef.current = new Set(startResponse.messages.map(m => String(m.id)));
            // Check if there was an AI greeting/reply
            if (startResponse.messages.some(m => m.sender_type === 'ai')) {
              playMessageSound(0.24);
            }
          }
          setChatId(currentChatId);
          if (startResponse.chat?.status) {
            setChatStatus(startResponse.chat.status);
          }
          if (startResponse.chat?.agent_name || startResponse.chat?.assigned_agent_id) {
            setAssignedAgent({
              name: startResponse.chat.agent_name || 'Support Agent',
              id: startResponse.chat.assigned_agent_id
            });
          }
          if (onChatCreated) onChatCreated(currentChatId);
        }
        return;
      }

      if (currentChatId) {
        const response = await sendMessage(currentChatId, text);
        setIsAnalyzing(false);
        // Replace temp message with server message if available
        if (response?.userMessage) {
          setMessages(prev => prev.map(m => m.id === tempId ? response.userMessage : m));
          messageIdsRef.current.delete(tempId);
          messageIdsRef.current.add(String(response.userMessage.id));
        }
        if (response?.success && response?.message) {
          const isNew = !messageIdsRef.current.has(String(response.message.id));
          addMessage({
            ...response.message,
            suggestions: response.suggestions || response.message.suggestions || []
          });
          if (isNew) {
            playMessageSound(0.24);
          }
        }
        if (response?.escalated || response?.status === 'pending') {
          setChatStatus(response.status || 'pending');
          if (response.assignedAgent) {
            setAssignedAgent(response.assignedAgent);
          } else if (response.status === 'pending') {
            setAssignedAgent(null);
          }
        } else if (response?.status) {
          setChatStatus(response.status);
          if (response.assignedAgent) {
            setAssignedAgent(response.assignedAgent);
          } else if (response.status === 'active' && !response.assignedAgent) {
            setAssignedAgent(null);
          }
        }
      }
    } catch (error) {
      console.error('Failed to send message:', error);
      addMessage({
        id: 'err-' + Date.now(),
        content: 'Something went wrong. Please try again.',
        sender_type: 'ai',
        created_at: new Date().toISOString()
      });
    } finally {
      isSubmittingRef.current = false;
      setIsAnalyzing(false);
    }
  };

  const handleSuggestionClick = (suggestion) => {
    const text = typeof suggestion === 'string' ? suggestion
      : suggestion?.text || suggestion?.label || String(suggestion || '');
    setInputText(text);
    playDropSound(0.15);
  };

  // ✅ FIX: Optimistic update — update UI immediately, THEN call API
  const handleFeedback = async (messageId, rating) => {
    // ✅ Update UI IMMEDIATELY regardless of API result
    setMessages(prev =>
      prev.map(msg => msg.id === messageId ? { ...msg, userFeedback: rating } : msg)
    );

    try {
      const response = await submitFeedback({ messageId, chatId, userId, rating });
      // Add the improved message if backend sends one
      if (response && response.improvedMessage) {
        addMessage({
          ...response.improvedMessage,
          suggestions: []
        });
      }
    } catch (error) {
      console.error('Feedback API error (UI already updated):', error);
      // Don't revert UI — user already saw confirmation
    }
  };

    return (
    <div className="chat-window">
      {/* Header */}
      <div className="chat-header">
        <div className="header-left">
          <button onClick={onBack} className="icon-btn" type="button" aria-label="Back">
            <ChevronLeft size={20} />
          </button>
          <div className="bot-avatar-header">
            {assignedAgent ? <User size={20} /> : <Bot size={20} />}
          </div>
          <div>
            <div className="bot-name">
              {assignedAgent ? (assignedAgent.name || 'Support Agent') : 'Chaty Support'}
            </div>
            <div className="bot-status">
              {chatStatus === 'pending' ? (
                <>
                  <span className="status-dot" style={{ color: '#f59e0b' }}>●</span>
                  Connecting you to a support agent...
                </>
              ) : assignedAgent ? (
                <>
                  <span className="status-dot" style={{ color: '#10b981' }}>●</span>
                  Connected to support agent
                </>
              ) : chatStatus === 'closed' ? (
                <>
                  <span className="status-dot" style={{ color: '#9ca3af' }}>●</span>
                  Closed
                </>
              ) : (
                <>
                  <span className="status-dot" style={{ color: isConnected ? '#10b981' : '#6b7280' }}>●</span>
                  {isConnected ? 'Online' : 'Connecting...'}
                </>
              )}
            </div>
          </div>
        </div>
        <div className="header-actions">
          <button
            onClick={toggleSound}
            className="icon-btn"
            type="button"
            aria-label={isMutedState ? "Unmute sounds" : "Mute sounds"}
            title={isMutedState ? "Unmute sounds" : "Mute sounds"}
          >
            {isMutedState ? <VolumeX size={18} /> : <Volume2 size={18} />}
          </button>
          <button onClick={onToggleExpand} className="icon-btn" type="button" aria-label="Expand">
            {isExpanded ? <Minimize size={18} /> : <Maximize size={18} />}
          </button>
          <button onClick={onClose} className="icon-btn" type="button" aria-label="Close">
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="chat-messages">
        {messages.map((message, idx) => {
          const key = message?.id ? String(message.id) : `msg-${idx}`;
          return (
            <MessageBubble
              key={key}
              message={message}
              onFeedback={handleFeedback}
              onSuggestionClick={handleSuggestionClick}
            />
          );
        })}

        {isAnalyzing && chatStatus !== 'pending' && (
          <div className="analyzing-state">
            <div className="bot-avatar-small"><Bot size={16} /></div>
            <div className="analyzing-content">
              <div className="analyzing-label">Chaty</div>
              <div className="analyzing-text">
                <span className="typing-dots">
                  <span></span><span></span><span></span>
                </span>
                <span className="analyzing-subtext">Thinking...</span>
              </div>
            </div>
          </div>
        )}

        {chatStatus === 'pending' && (
          <div className="queue-banner" style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            backgroundColor: '#fffbeb',
            border: '1px solid #fef3c7',
            color: '#92400e',
            padding: '10px 14px',
            borderRadius: '10px',
            fontSize: '12px',
            margin: '8px 0',
            lineHeight: '1.4'
          }}>
            <span style={{ fontSize: '16px' }}>⏳</span>
            <div>
              <strong>Waiting for an agent...</strong>
              <div>You are in the queue. A support agent will connect with you shortly.</div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      {chatStatus === 'closed' ? (
        <div className="chat-input-form" style={{ justifyContent: 'center', padding: '16px', color: '#6b7280', fontSize: '14px', background: '#f9fafb', borderTop: '1px solid #e5e7eb' }}>
          This chat is closed. Please start a new chat.
        </div>
      ) : (
        <form className="chat-input-form" onSubmit={handleSendMessage}>
          <input
            type="text"
            value={inputText}
            onChange={e => setInputText(e.target.value)}
            placeholder="Ask anything..."
            className="chat-input"
            disabled={isAnalyzing}
          />
          <button
            type="submit"
            className="send-button"
            disabled={!inputText.trim() || isAnalyzing}
          >
            <Send size={18} />
          </button>
        </form>
      )}

      <div className="chat-footer">Chaty can make mistakes. Double-check replies.</div>
    </div>
  );
};

// ── MessageBubble ────────────────────────────────
const MessageBubble = ({ message, onFeedback, onSuggestionClick }) => {
  if (!message) return null;

  if (typeof message !== 'object') {
    return (
      <div className="message-wrapper bot">
        <div className="message-avatar"><Bot size={16} /></div>
        <div className="message-content-wrapper">
          <div className="message-sender">Chaty</div>
          <div className="message-bubble bot-bubble">
            <div className="message-text">{String(message)}</div>
          </div>
        </div>
      </div>
    );
  }

  const getContent = () => {
    const c = message.content;
    if (c === null || c === undefined) return '';
    if (typeof c === 'string') return c;
    try { return JSON.stringify(c); } catch { return '[Content]'; }
  };

  if (message.sender_type === 'system') {
    return (
      <div style={{ textAlign: 'center', margin: '8px 0', fontSize: '12px', color: '#6b7280' }}>
        <span style={{ backgroundColor: '#f3f4f6', padding: '4px 10px', borderRadius: '12px' }}>
          {getContent()}
        </span>
      </div>
    );
  }

  const isUser  = message.sender_type === 'user';
  const isAgent = message.sender_type === 'agent';
  const isAI    = message.sender_type === 'ai';
  const isGreeting = String(message.id || '').startsWith('greeting') || String(message.id || '') === 'welcome';

  const escapeHtml = (unsafe) => {
    return String(unsafe)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  };

  const formatMessage = (text) =>
    escapeHtml(String(text || ''))
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n/g, '<br/>');

  const getSuggestions = () => {
    const raw = Array.isArray(message.suggestions) ? message.suggestions
      : Array.isArray(message.metadata?.suggestions) ? message.metadata.suggestions
      : [];
    return raw.map(s =>
      typeof s === 'string' ? s : s?.text || s?.label || String(s || '')
    ).filter(Boolean);
  };

  const suggestions = getSuggestions();

  return (
    <div className={`message-wrapper ${isUser ? 'user' : 'bot'}`}>
      {!isUser && (
        <div className="message-avatar">
          {isAgent ? <User size={16} /> : <Bot size={16} />}
        </div>
      )}

      <div className="message-content-wrapper">
        {!isUser && (
          <div className="message-sender">
            {isAgent ? (message.agent_name || 'Support Agent') : 'Chaty'}
          </div>
        )}

        <div className={`message-bubble ${isUser ? 'user-bubble' : 'bot-bubble'}`}>
          <div
            className="message-text"
            dangerouslySetInnerHTML={{ __html: formatMessage(getContent()) }}
          />
        </div>

        {/* ✅ Feedback buttons — both fully clickable */}
        {isAI && !message.userFeedback && !isGreeting && (
          <div className="feedback-buttons" style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
            <button
              type="button"
              className="feedback-btn"
              onClick={() => onFeedback(message.id, 'positive')}
              style={{ cursor: 'pointer', pointerEvents: 'all' }}
              title="Helpful"
            >
              <ThumbsUp size={14} />
            </button>
            <button
              type="button"
              className="feedback-btn"
              onClick={() => onFeedback(message.id, 'negative')}
              style={{ cursor: 'pointer', pointerEvents: 'all' }}
              title="Not helpful"
            >
              <ThumbsDown size={14} />
            </button>
          </div>
        )}

        {/* Thank you after feedback */}
        {message.userFeedback && (
          <div className="feedback-confirmed">
            {message.userFeedback === 'positive' ? '✓ Thank you! 😊' : '✓ Thanks for feedback!'}
          </div>
        )}

        {/* Suggestions */}
        {isAI && suggestions.length > 0 && (
          <div className="suggestions-container">
            {suggestions.map((sug, idx) => (
              <button
                key={`sug-${idx}`}
                type="button"
                className="suggestion-chip"
                onClick={() => onSuggestionClick(sug)}
              >
                ↗ {sug}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ChatWindow;
