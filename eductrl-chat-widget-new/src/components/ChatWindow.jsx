import React, { useState, useEffect, useRef } from 'react';
import { sendMessage, startChat, submitFeedback, getChatMessages, getChatById } from '../services/api';

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

// ── ChatWindow ───────────────────────────────────
const ChatWindow = ({
  userId, userName, userEmail,
  chatId: initialChatId,
  messages: externalMessages,
  socket, isConnected,
  onClose, onChatCreated, onNewMessage,
  onBack, isExpanded, onToggleExpand,
  apiUrl, laravelUrl
}) => {
  const [messages, setMessages]     = useState([]);
  const [inputText, setInputText]   = useState('');
  const [chatId, setChatId]         = useState(initialChatId ? String(initialChatId) : null);
  const [chatStatus, setChatStatus] = useState('active');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const messagesEndRef              = useRef(null);
  const messageIdsRef               = useRef(new Set());
  const isSubmittingRef             = useRef(false);

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
          if (chatData && chatData.chat && chatData.chat.status) {
            setChatStatus(chatData.chat.status);
          }
        })
        .catch(err => console.error("Failed to fetch chat details", err))
        .finally(() => setIsAnalyzing(false));
    }
  }, [initialChatId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (socket && chatId) {
      const handleStatusChange = (payload) => {
        if (payload && String(payload.chatId) === String(chatId) && payload.status) {
          setChatStatus(payload.status);
        }
      };
      socket.on('chat-status-changed', handleStatusChange);
      return () => {
        socket.off('chat-status-changed', handleStatusChange);
      };
    }
  }, [socket, chatId]);

  // ── Add message (deduplication) ──────────────────
  const addMessage = (msg) => {
    if (!msg) return;
    const id = String(msg.id || '');
    if (id && messageIdsRef.current.has(id)) return;
    if (id) messageIdsRef.current.add(id);
    setMessages(prev => [...prev, msg]);
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

    try {
      let currentChatId = chatId;

      if (!currentChatId) {
        const startResponse = await startChat(
          text, String(userId || ''), String(userName || ''), String(userEmail || '')
        );
        currentChatId = startResponse?.chat?.id ? String(startResponse.chat.id) : null;
        if (currentChatId) {
          setChatId(currentChatId);
          if (onChatCreated) onChatCreated(currentChatId);
        }
        // Since startChat already processed the user's message, we can return early
        return;
      }

      if (currentChatId) {
        const response = await sendMessage(currentChatId, text);
        if (response?.success && response?.message) {
          addMessage({
            ...response.message,
            suggestions: response.suggestions || response.message.suggestions || []
          });
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
          <div className="bot-avatar-header"><Bot size={20} /></div>
          <div>
            <div className="bot-name">KnowBridge Support</div>
            <div className="bot-status">
              <span className="status-dot" style={{ color: isConnected ? '#10b981' : '#6b7280' }}>●</span>
              {isConnected ? 'Online' : 'Connecting...'}
            </div>
          </div>
        </div>
        <div className="header-actions">
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

        {isAnalyzing && (
          <div className="analyzing-state">
            <div className="bot-avatar-small"><Bot size={16} /></div>
            <div className="analyzing-content">
              <div className="analyzing-label">KnowBridge</div>
              <div className="analyzing-text">
                <span className="analyzing-icon">✓</span> Analyzing...
              </div>
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

      <div className="chat-footer">KnowBridge can make mistakes. Double-check replies.</div>
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
          <div className="message-sender">KnowBridge</div>
          <div className="message-bubble bot-bubble">
            <div className="message-text">{String(message)}</div>
          </div>
        </div>
      </div>
    );
  }

  const isUser = message.sender_type === 'user';
  const isAI   = message.sender_type === 'ai';
  const isGreeting = String(message.id || '').startsWith('greeting') || String(message.id || '') === 'welcome';

  const getContent = () => {
    const c = message.content;
    if (c === null || c === undefined) return '';
    if (typeof c === 'string') return c;
    try { return JSON.stringify(c); } catch { return '[Content]'; }
  };

  const formatMessage = (text) =>
    String(text || '')
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
        <div className="message-avatar"><Bot size={16} /></div>
      )}

      <div className="message-content-wrapper">
        {!isUser && <div className="message-sender">KnowBridge</div>}

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

      {isUser && (
        <div className="message-avatar user-avatar"><User size={16} /></div>
      )}
    </div>
  );
};

export default ChatWindow;