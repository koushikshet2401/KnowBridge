import React    from 'react';
import ReactDOM from 'react-dom';
import ChatWidget from './components/ChatWidget';
import './components/ChatWidget.css';

/**
 * KnowBridge Chat Widget — Entry Point
 * ✅ NO hardcoded URLs — reads entirely from window.CHAT_CONFIG
 */

let _setOpen = null;

const initWidget = (customConfig) => {
  const config = Object.assign({}, window.CHAT_CONFIG || {}, customConfig || {});

  // ✅ NO hardcoded fallback — empty string if not set
  const apiUrl     = config.apiUrl     || '';
  const laravelUrl = config.laravelUrl || window.location.origin;
  const theme      = config.theme      || 'purple';
  const position   = config.position   || 'bottom-right';
  const clientDomain = config.client_domain || window.location.host;

  let userId    = (config.user && config.user.id)    || config.userId    || '';
  if (!userId) {
    const domainKey = `KnowBridge_guest_id_${clientDomain}`;
    userId = localStorage.getItem(domainKey);
    if (!userId) {
      userId = `guest_${Math.random().toString(36).substring(2, 15)}_${Date.now()}`;
      localStorage.setItem(domainKey, userId);
    }
  }

  const userName  = (config.user && config.user.name)  || config.userName  || 'Guest';
  const userEmail = (config.user && config.user.email) || config.userEmail || '';

  if (!apiUrl) {
    console.error('KnowBridge Chat: apiUrl is missing! Add CHAT_BACKEND_URL to .env and set window.CHAT_CONFIG in blade.');
    return;
  }

  window.CHAT_CONFIG = Object.assign({}, window.CHAT_CONFIG || {}, {
    apiUrl,
    laravelUrl,
    client_domain: clientDomain,
    user: { id: userId, name: userName, email: userEmail }
  });

  console.log('🚀 KnowBridge Chat init | API:', apiUrl, '| User:', userName);

  const rootEl = document.getElementById('KnowBridge-chat-root');
  if (!rootEl) {
    console.error('KnowBridge: #KnowBridge-chat-root div not found in page HTML.');
    return;
  }

  const fetchTokenAndMount = () => {
    if (config.authToken) {
      window.CHAT_CONFIG = Object.assign({}, window.CHAT_CONFIG, { authToken: config.authToken });
      console.log('✅ Auth token injected from config');
      mountWidget();
      return;
    }

    const csrfMeta  = document.querySelector('meta[name="csrf-token"]');
    const csrfToken = csrfMeta ? csrfMeta.content : '';

    fetch(`${laravelUrl}/api/chat/token`, {
      method: 'POST', credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'Accept':       'application/json',
        'X-CSRF-TOKEN': csrfToken
      }
    })
      .then(res => res.ok ? res.json() : Promise.reject(res.status))
      .then(data => {
        if (data.success && data.token) {
          window.CHAT_CONFIG = Object.assign({}, window.CHAT_CONFIG, { authToken: data.token });
          console.log('✅ Auth token obtained from laravel');
        }
      })
      .catch(err => console.warn('KnowBridge: Token fetch failed:', err))
      .finally(() => mountWidget());
  };

  const mountWidget = () => {
    const WidgetWrapper = () => {
      const [isOpen, setIsOpen] = React.useState(false);
      _setOpen = setIsOpen;
      return (
        <ChatWidget
          userId={userId}
          userName={userName}
          userEmail={userEmail}
          apiUrl={apiUrl}
          laravelUrl={laravelUrl}
          theme={theme}
          position={position}
          customTrigger={Boolean(config.customTrigger)}
          isOpen={isOpen}
          onToggle={() => setIsOpen(p => !p)}
          onClose={() => setIsOpen(false)}
        />
      );
    };
    ReactDOM.render(<WidgetWrapper />, rootEl);
    console.log('✅ KnowBridge Chat Widget mounted | API:', apiUrl);
  };

  fetchTokenAndMount();
};

window.KnowBridgeChat = {
  init:    initWidget,
  toggle:  () => _setOpen ? _setOpen(p => !p) : console.warn('KnowBridge: call init() first'),
  open:    () => _setOpen && _setOpen(true),
  close:   () => _setOpen && _setOpen(false),
  version: '1.3.0'
};
