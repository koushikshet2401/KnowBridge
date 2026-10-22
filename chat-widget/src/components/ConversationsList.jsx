import React, { useState, useEffect } from 'react';
import { isMuted, toggleMuted, subscribeMuteChange, playDropSound } from '../utils/sound';
import './ConversationsList.css';

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

const ConversationsList = ({ conversations, onSelectChat, onNewChat, onClose }) => {
  const [isMutedState, setIsMutedState] = useState(isMuted());

  useEffect(() => {
    return subscribeMuteChange(setIsMutedState);
  }, []);

  const toggleSound = () => {
    const next = toggleMuted();
    setIsMutedState(next);
    if (!next) playDropSound(0.2);
  };

  const handleSelect = (chatId) => {
    playDropSound(0.16);
    if (onSelectChat) onSelectChat(chatId);
  };

  const handleNew = () => {
    playDropSound(0.18);
    if (onNewChat) onNewChat();
  };

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
          <button
            className="icon-btn"
            onClick={toggleSound}
            type="button"
            aria-label={isMutedState ? "Unmute sounds" : "Mute sounds"}
            title={isMutedState ? "Unmute sounds" : "Mute sounds"}
          >
            {isMutedState ? <VolumeX size={18} /> : <Volume2 size={18} />}
          </button>
          <button className="icon-btn" onClick={onClose} aria-label="Close" type="button">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18"><path d="M18 6L6 18M6 6l12 12"></path></svg>
          </button>
        </div>
      </div>

      <div className="chaty-conversations-scroll-area">
        {conversations.length === 0 ? (
          <div className="chaty-no-conversations">
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
                className="chaty-conversation-card"
                onClick={() => handleSelect(chat.id)}
              >
                <div className="chaty-card-avatar">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h1V5.73A2 2 0 0 1 10 4a2 2 0 0 1 2-2z"></path>
                  </svg>
                </div>
                <div className="chaty-card-content">
                  <div className="chaty-card-header">
                    <div className="chaty-card-title-group">
                      <span className="chaty-card-title">Chaty Bot</span>
                      <span className="chaty-card-dot">·</span>
                      <span className="chaty-card-time">{timeStr}</span>
                    </div>
                    {chat.status === 'closed' && (
                      <span className="chaty-status-badge closed">Closed</span>
                    )}
                  </div>
                  <div className="chaty-card-preview">{preview}</div>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="conversations-footer">
        <button className="new-chat-btn" onClick={handleNew} type="button">
          Start a new chat
        </button>
        <div className="branding">
          <span>⚡ by <strong>Chaty</strong></span>
        </div>
      </div>
    </div>
  );
};

export default ConversationsList;
