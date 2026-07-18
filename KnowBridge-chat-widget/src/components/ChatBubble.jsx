import React from 'react';
import './ChatWidget.css';

/**
 * Chat Bubble - Floating Button
 * 
 * Bottom-right floating button to open/close chat
 * Shows unread count badge
 */

const ChatBubble = ({ isOpen, onClick, unreadCount, isConnected }) => {
  // Ensure we have primitive values for rendering
  const safeIsOpen = Boolean(isOpen);
  const safeIsConnected = Boolean(isConnected);
  
  // Safely extract a number or string for unread count
  let safeUnreadCount = 0;
  if (typeof unreadCount === 'number') safeUnreadCount = unreadCount;
  else if (typeof unreadCount === 'string') safeUnreadCount = parseInt(unreadCount, 10) || 0;
  else if (unreadCount) safeUnreadCount = 1; // Fallback if it's a truthy object

  return (
    <div 
      className={`chat-bubble ${safeIsOpen ? 'open' : ''}`}
      onClick={onClick}
      title={safeIsOpen ? 'Close chat' : 'Open chat'}
    >
      {/* Unread badge */}
      {!safeIsOpen && safeUnreadCount > 0 && (
        <div className="unread-badge">
          {safeUnreadCount > 9 ? '9+' : String(safeUnreadCount)}
        </div>
      )}

      {/* Connection status indicator */}
      {safeIsConnected && !safeIsOpen && (
        <div className="connection-indicator connected"></div>
      )}

      {/* Icon */}
      <div className="bubble-icon">
        {safeIsOpen ? (
          // Close icon
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path 
              d="M18 6L6 18M6 6l12 12" 
              stroke="currentColor" 
              strokeWidth="2" 
              strokeLinecap="round" 
              strokeLinejoin="round"
            />
          </svg>
        ) : (
          // Chat icon
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
            <path 
              d="M16 4L18.5 11.5L26 14L18.5 16.5L16 24L13.5 16.5L6 14L13.5 11.5L16 4Z" 
              fill="currentColor"
            />
            <path 
              d="M24 8L25 11L28 12L25 13L24 16L23 13L20 12L23 11L24 8Z" 
              fill="currentColor"
              opacity="0.7"
            />
            <path 
              d="M8 20L9 23L12 24L9 25L8 28L7 25L4 24L7 23L8 20Z" 
              fill="currentColor"
              opacity="0.7"
            />
          </svg>
        )}
      </div>

      {/* Pulse animation when new message */}
      {!safeIsOpen && safeUnreadCount > 0 && (
        <div className="pulse-ring"></div>
      )}
    </div>
  );
};

export default ChatBubble;
