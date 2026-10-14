import React    from 'react';
import ReactDOM from 'react-dom';
import ChatWidget from './components/ChatWidget';
import './components/ChatWidget.css';

/**
 * Chaty Chat Widget — Universal Entry Point
 * Compatible with Node, PHP, Rails, Rust, Java, React, HTML.
 */

let _setOpen = null;

const initWidget = (customConfig) => {
  const config = Object.assign({}, window.CHAT_CONFIG || window.ChatyConfig || {}, customConfig || {});

  const tenantId = config.tenantId;
  const apiUrl   = config.apiUrl || 'http://localhost:5000';
  const theme    = config.theme || 'purple';
  const position = config.position || 'bottom-right';

  if (!tenantId) {
    console.error('Chaty Chat: tenantId is missing! Please provide it in window.ChatyConfig.');
    return;
  }

  let userId = (config.user && config.user.id) || config.userId || '';
  if (!userId) {
    const domainKey = `chaty_guest_id_${tenantId}`;
    userId = localStorage.getItem(domainKey);
    if (!userId) {
      userId = `guest_${Math.random().toString(36).substring(2, 15)}_${Date.now()}`;
      localStorage.setItem(domainKey, userId);
    }
  }

  const userName  = (config.user && config.user.name)  || config.userName  || 'Guest';
  const userEmail = (config.user && config.user.email) || config.userEmail || '';

  // Auto-inject root element if it doesn't exist
  let rootEl = document.getElementById('chaty-chat-root');
  if (!rootEl) {
    rootEl = document.createElement('div');
    rootEl.id = 'chaty-chat-root';
    document.body.appendChild(rootEl);
  }

  const WidgetWrapper = () => {
    const [isOpen, setIsOpen] = React.useState(false);
    _setOpen = setIsOpen;
    return (
      <ChatWidget
        tenantId={tenantId}
        userId={userId}
        userName={userName}
        userEmail={userEmail}
        apiUrl={apiUrl}
        theme={theme}
        position={position}
        isOpen={isOpen}
        onToggle={() => setIsOpen(p => !p)}
        onClose={() => setIsOpen(false)}
      />
    );
  };

  ReactDOM.render(<WidgetWrapper />, rootEl);
  console.log('✅ Chaty Chat Widget mounted | Tenant:', tenantId);
};

window.ChatyChat = {
  init:    initWidget,
  toggle:  () => _setOpen ? _setOpen(p => !p) : console.warn('Chaty: call init() first'),
  open:    () => _setOpen && _setOpen(true),
  close:   () => _setOpen && _setOpen(false),
  version: '2.0.0'
};

// Auto-init if config is already present
if (window.ChatyConfig || window.CHAT_CONFIG) {
  initWidget();
}
