import React from 'react';

/**
 * Chat Header Component
 */
export const ChatHeader = ({ onClose, isConnected }) => (
  <div className="chat-header">
    <div className="header-left">
      <div className="bot-avatar">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <path
            d="M12 4L14 10L20 12L14 14L12 20L10 14L4 12L10 10L12 4Z"
            fill="currentColor"
          />
        </svg>
      </div>
      <div className="header-info">
        <h3>KnowBridge Support</h3>
        <span className={`status ${isConnected ? 'online' : 'offline'}`}>
          {isConnected ? '● Online' : '○ Offline'}
        </span>
      </div>
    </div>
    <button type="button" className="close-button" onClick={onClose} title="Close">
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <path
          d="M15 5L5 15M5 5l10 10"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    </button>
  </div>
);

/**
 * Message List Component
 */
export const MessageList = ({ messages, isAgentTyping, onConnectHuman }) => (
  <div className="message-list">
    {messages.map(msg => (
      <div key={msg.id} className={`message message-${msg.type}`}>
        {(msg.type === 'system' || msg.type === 'ai') && (
          <div className="message-avatar">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
              <path d="M10 2L11.5 7.5L17 9L11.5 10.5L10 16L8.5 10.5L3 9L8.5 7.5L10 2Z" />
            </svg>
          </div>
        )}

        <div className="message-content">
          <div className="message-text">{msg.content}</div>

          {msg.showHumanButton && (
            <button
              type="button"
              className="human-button"
              onClick={onConnectHuman}
            >
              Connect with our team
            </button>
          )}

          {msg.confidence && (
            <div className="confidence-indicator">
              AI Response ({Math.round(msg.confidence * 100)}% confident)
            </div>
          )}
        </div>
      </div>
    ))}

    {isAgentTyping && (
      <div className="message message-agent">
        <div className="typing-indicator">
          <span></span>
          <span></span>
          <span></span>
        </div>
      </div>
    )}
  </div>
);

/**
 * Message Input Component
 */
export const MessageInput = ({ value, onChange, onSend, disabled, placeholder }) => {
  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  return (
    <div className="message-input-container">
      <textarea
        className="message-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyPress={handleKeyPress}
        placeholder={placeholder}
        disabled={disabled}
        rows={1}
      />
      <button
        type="button"
        className="send-button"
        onClick={() => onSend()}
        disabled={disabled || !value.trim()}
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <path d="M18 10L2 2L5 10L2 18L18 10Z" fill="currentColor" />
        </svg>
      </button>
    </div>
  );
};

/**
 * Suggestion Buttons Component
 */
export const SuggestionButtons = ({ onSuggestionClick }) => {
  const suggestions = [
    { text: 'What is KnowBridge?' },
    { text: 'How to add student leads?' },
    { text: 'Show me pricing plans' },
    { text: 'Talk to support agent' },
  ];

  return (
    <div className="suggestion-buttons">
      <div className="suggestions-grid">
        {suggestions.map((suggestion, index) => (
          <button
            key={index}
            type="button"
            className="suggestion-button"
            onClick={() => onSuggestionClick(suggestion.text)}
          >
            <span className="suggestion-text">{suggestion.text}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

// REMOVED: KnowledgeBaseResults component - no more "Helpful Articles" popup!
