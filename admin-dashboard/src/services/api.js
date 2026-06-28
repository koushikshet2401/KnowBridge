import axios from 'axios'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000'

const api = axios.create({
  baseURL: `${API_URL}/api`,  // http://localhost:5000/api
  headers: {
    'Content-Type': 'application/json',
  },
})

// Add KnowBridge token to ALL requests
api.interceptors.request.use((config) => {
  // 1. Check local storage (Standalone Staff Panel Login)
  // 2. Check window object (Laravel Integration)
  const token = localStorage.getItem('knowbridge_admin_token') || 
                window.KNOWBRIDGE_AUTH?.token;
  
  if (token) {
    config.headers['X-KnowBridge-Token'] = token
  }
  
  return config
})

// Handle errors globally
api.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error('API Error:', error.message)
    
    // Automatically log out if token is expired/invalid
    if (error.response?.status === 401) {
      localStorage.removeItem('knowbridge_admin_token')
      window.location.href = '/login'
    }
    
    return Promise.reject(error)
  }
)

export default api