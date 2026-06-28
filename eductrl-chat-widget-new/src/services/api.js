import axios from 'axios';

/**
 * API Service - Backend Communication
 * ✅ NO hardcoded URLs — reads from window.CHAT_CONFIG only
 */

const getApiUrl = () => {
  const base = (window.CHAT_CONFIG && window.CHAT_CONFIG.apiUrl)
    ? window.CHAT_CONFIG.apiUrl
    : '';
  if (!base) {
    console.error('KnowBridge: CHAT_CONFIG.apiUrl is not set! Check blade template .env CHAT_BACKEND_URL');
    return '/api';
  }
  return base.replace(/\/$/, '') + '/api';
};

const createApi = () => axios.create({
  baseURL:         getApiUrl(),
  headers:         { 'Content-Type': 'application/json' },
  withCredentials: true,
  timeout:         45000
});

const addInterceptors = (instance) => {
  instance.interceptors.request.use((config) => {
    const token = (window.CHAT_CONFIG && window.CHAT_CONFIG.authToken)
      || localStorage.getItem('knowbridge_chat_token')
      || null;
    if (token) config.headers['X-KnowBridge-Token'] = token;
    if (!config.headers['X-Client-Domain']) {
      config.headers['X-Client-Domain'] =
        (window.CHAT_CONFIG && window.CHAT_CONFIG.client_domain)
        || window.location.host;
    }
    return config;
  });

  instance.interceptors.response.use(
    (response) => response,
    (error) => {
      if (error.response?.status === 401) {
        console.warn('KnowBridge Chat: Auth token rejected (401). Chat continues without history saving.');
      }
      return Promise.reject(error);
    }
  );
  return instance;
};

const getApi = () => addInterceptors(createApi());

export const startChat = async (message, userId, userName, userEmail) => {
  const response = await getApi().post('/chat/start', {
    message,
    user_id:       userId,
    user_name:     userName,
    user_email:    userEmail,
    client_domain: (window.CHAT_CONFIG && window.CHAT_CONFIG.client_domain) || window.location.host
  });
  return response.data;
};

export const sendMessage = async (chatId, message) => {
  const response = await getApi().post('/chat/message', {
    chat_id:       chatId,
    message,
    client_domain: (window.CHAT_CONFIG && window.CHAT_CONFIG.client_domain) || window.location.host
  });
  return response.data;
};

export const getChatMessages = async (chatId) => {
  const response = await getApi().get(`/chat/${chatId}/messages`);
  return response.data;
};

export const getChatById = async (chatId) => {
  const response = await getApi().get(`/chat/${chatId}`);
  return response.data;
};

export const getUserChats = async (userId) => {
  const response = await getApi().get(`/chat/user/${userId}/history`);
  return response.data;
};

export const closeChat = async (chatId, rating, feedback) => {
  const response = await getApi().post('/chat/close', { chat_id: chatId, rating, feedback });
  return response.data;
};

export const submitFeedback = async ({ messageId, chatId, userId, rating, comment = null }) => {
  try {
    const response = await getApi().post('/chat/feedback', {
      messageId, chatId, userId, rating, comment
    });
    return response.data;
  } catch (error) {
    console.error('Submit feedback error:', error);
    throw error;
  }
};

export const searchKnowledgeBase = async (query) => {
  try {
    const response = await getApi().post('/knowledge-base/query', {
      query, limit: 5, threshold: 0.7
    });
    return (response.data.success && response.data.results) ? response.data.results : [];
  } catch (error) {
    console.error('KB search error:', error);
    return [];
  }
};

export const getKnowledgeBase = async () => {
  const response = await getApi().get('/knowledge-base/documents');
  return response.data;
};

export const checkHealth = async () => {
  const response = await getApi().get('/health');
  return response.data;
};

export default getApi();