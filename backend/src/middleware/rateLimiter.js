const rateLimit = require('express-rate-limit');

// ✅ Very relaxed limits for admin panel
const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: process.env.NODE_ENV === 'production' ? 200 : 10000, // Very high in dev
  message: { success: false, error: 'Too many requests. Please slow down and try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting in development
    if (process.env.NODE_ENV !== 'production') return true;
    // Skip for admin routes
    if (req.path.startsWith('/api/admin')) return true;
    return false;
  }
});

const chatMessageLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 60 : 10000,
  message: { success: false, error: 'Too many messages. Please slow down.' },
  skip: () => process.env.NODE_ENV !== 'production'
});

const newChatLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 20 : 10000,
  message: { success: false, error: 'Too many chat sessions started.' },
  skip: () => process.env.NODE_ENV !== 'production'
});

module.exports = { apiLimiter, chatMessageLimiter, newChatLimiter };
