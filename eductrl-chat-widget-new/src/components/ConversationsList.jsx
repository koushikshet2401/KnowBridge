import React from 'react';
import './ConversationsList.css';

const ConversationsList = ({ conversations, onSelectChat, onNewChat, onClose }) => {
  return (
    <div className="chat-window">
      <div className="chat-header">
        <div className="header-left">
          <div className="bot-avatar-header">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
              <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h1V5.73A2 2 0 0 1 10 4a2 2 0 0 1 2-2z"></path>
            </svg>
          </div>
          <div>
            <div className="bot-name">Conversations</div>
          </div>
        </div>
        <div className="header-actions">
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18"><path d="M18 6L6 18M6 6l12 12"></path></svg>
          </button>
        </div>
      </div>

      <div className="knowbridge-conversations-scroll-area">
        {conversations.length === 0 ? (
          <div className="knowbridge-no-conversations">
            <p>No previous conversations.</p>
          </div>
        ) : (
          conversations.map(chat => {
            const preview = chat.latest_message 
              || (chat.messages && chat.messages.length > 0 ? chat.messages[0].content : 'Started a conversation');
            
            // Format time dynamically
            const date = new Date(chat.updated_at);
            const now = new Date();
            const diffMs = now - date;
            const diffMins = Math.floor(diffMs / 60000);
            const diffHours = Math.floor(diffMins / 60);
            const diffDays = Math.floor(diffHours / 24);
            let timeStr = '';
            if (diffMins < 1) timeStr = 'Just now';
            else if (diffMins < 60) timeStr = `${diffMins}m ago`;
            else if (diffHours < 24) timeStr = `${diffHours} hour ago`;
            else timeStr = `${diffDays}d`;

            return (
              <div 
                key={chat.id} 
                className="knowbridge-conversation-card"
                onClick={() => onSelectChat(chat.id)}
              >
                <div className="knowbridge-card-avatar">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h1V5.73A2 2 0 0 1 10 4a2 2 0 0 1 2-2z"></path>
                  </svg>
                </div>
                <div className="knowbridge-card-content">
                  <div className="knowbridge-card-header">
                    <div className="knowbridge-card-title-group">
                      <span className="knowbridge-card-title">KnowBridge Bot</span>
                      <span className="knowbridge-card-dot">·</span>
                      <span className="knowbridge-card-time">{timeStr}</span>
                    </div>
                    {chat.status === 'closed' && (
                      <span className="knowbridge-status-badge closed">Closed</span>
                    )}
                  </div>
                  <div className="knowbridge-card-preview">{preview}</div>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="conversations-footer">
        <button className="new-chat-btn" onClick={onNewChat}>
          Start a new chat
        </button>
        <div className="branding">
          <span>⚡ by <strong>KnowBridge</strong></span>
        </div>
      </div>
    </div>
  );
};

export default ConversationsList;
