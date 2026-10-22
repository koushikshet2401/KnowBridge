require('dns').setDefaultResultOrder('ipv4first');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const logger = require('./src/utils/logger');
const pool = require('./src/config/database');

/**
 * Express Server Setup
 *
 * Location: backend/server.js
 */

// Load environment variables
require('dotenv').config();

// Validate critical environment variables
const requiredEnvVars = ['PORT', 'DB_HOST', 'DB_PORT', 'DB_NAME'];
const missingVars = requiredEnvVars.filter(v => !process.env[v]);

if (missingVars.length > 0) {
  logger.error('❌ Missing required environment variables:', missingVars);
  logger.error('Please check your .env file');
  process.exit(1);
}

const app = express();
app.set('trust proxy', 1); // Trust first proxy for express-rate-limit behind Nginx
const server = http.createServer(app);

// CORS origins handling
const configuredOrigins = (process.env.CORS_ORIGIN || process.env.SOCKET_IO_CORS_ORIGIN || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

const isAllowedOrigin = (origin) => {
  if (!origin) return true;
  if (process.env.NODE_ENV !== 'production') {
    if (origin === 'null') return true;
    if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return true;
  }
  if (configuredOrigins.length === 0 || configuredOrigins.includes('*') || configuredOrigins.includes(origin)) {
    return true;
  }
  return false;
};

// ----------------
// Socket.IO Setup
// ----------------
const io = socketIo(server, {
  cors: {
    origin: (origin, callback) => {
      if (isAllowedOrigin(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Origin not allowed by Socket.IO CORS'));
      }
    },
    methods: ['GET', 'POST'],
    credentials: true
  },
  path: process.env.SOCKET_IO_PATH || '/socket.io'
});

// Make io available globally for socket handlers
global.io = io;
app.set('io', io);

// ----------------
// Middleware
// ----------------
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }, // Allow cross-origin images/resources if needed
}));

// CORS
app.use(cors({
  origin: (origin, callback) => {
    if (isAllowedOrigin(origin)) {
      callback(null, true);
    } else {
      callback(null, false);
    }
  },
  credentials: process.env.CORS_CREDENTIALS !== 'false',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: process.env.CORS_ALLOWED_HEADERS?.split(',') || ['Content-Type', 'Authorization', 'X-Chaty-Token', 'X-Client-Domain', 'X-Tenant-ID']
}));

const {
  apiLimiter,
  chatMessageLimiter,
  newChatLimiter
} = require('./src/middleware/rateLimiter');

// Apply to all API routes
app.use('/api', apiLimiter);

// Body parsers
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve the widget static files
app.use('/widget', express.static(path.join(__dirname, 'public')));

// Request logging middleware
app.use((req, res, next) => {
  logger.http(`${req.method} ${req.path} - IP: ${req.ip}`);
  next();
});

// ----------------
// Health Check Endpoint (No Auth Required)
// ----------------
app.get('/health', async (req, res) => {
  try {
    // Check database connection
    const dbHealth = await pool.checkHealth();
    
    const health = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development',
      database: dbHealth.healthy ? 'connected' : 'disconnected',
      services: {
        express: 'running',
        socketio: 'running',
        database: dbHealth.healthy ? 'healthy' : 'unhealthy'
      }
    };

    const statusCode = dbHealth.healthy ? 200 : 503;
    res.status(statusCode).json(health);
  } catch (error) {
    logger.error('Health check failed:', error);
    res.status(503).json({
      status: 'error',
      message: 'Service unhealthy',
      error: error.message
    });
  }
});

// API version info
app.get('/api', (req, res) => {
  res.json({
    name: 'Chaty Chat Support API',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      health: '/health',
      admin: '/api/admin/*',
      chat: '/api/chat/*',
      knowledge: '/api/knowledge-base/*'
    },
    authentication: 'JWT (POST /api/auth/login)',
    documentation: '/api/docs'
  });
});

// ----------------
// API Routes
// ----------------

// Auth + admin routes (admin routes require a JWT from /api/auth/login)
const authRoutes = require('./src/routes/auth.routes');
const adminRoutes = require('./src/routes/admin.routes');
const notificationRoutes = require('./src/routes/notification.routes');

app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/admin/notifications', notificationRoutes);

// Chat routes (public, used by the embeddable widget)
const chatRoutes = require('./src/routes/chat.routes');
app.use('/api/chat', chatRoutes);

// AI & Knowledge Base routes (Implementation)
const aiRoutes = require('./src/routes/ai.routes');
app.use('/api', aiRoutes);

// ----------------
// Socket.IO Event Handlers
// ----------------
const { setupChatSocket } = require('./src/socket/chatSocket');
const { setupAdminSocket } = require('./src/socket/adminSocket');

// Initialize socket handlers (they set up their own io.on('connection') listeners)
setupChatSocket(io);
setupAdminSocket(io);

io.on('connection', (socket) => {
  logger.info(`🔌 New socket connection: ${socket.id}`);
  
  socket.on('disconnect', () => {
    logger.info(`🔌 Socket disconnected: ${socket.id}`);
  });
});

// ----------------
// Error Handling
// ----------------

// 404 Handler
app.use((req, res) => {
  logger.warn(`404 Not Found: ${req.method} ${req.path}`);
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    path: req.path,
    method: req.method,
    message: 'The requested resource does not exist'
  });
});

// Global Error Handler
const { globalErrorHandler } = require('./src/utils/asyncHandler');
app.use(globalErrorHandler);

// ----------------
// Start Server
// ----------------
const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  logger.info('='.repeat(60));
  logger.info('🚀 Chaty Chat Support Backend Started');
  logger.info('='.repeat(60));
  logger.info(`📍 Server running on: http://localhost:${PORT}`);
  logger.info(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  logger.info(`💾 Database: ${process.env.DB_NAME} @ ${process.env.DB_HOST}:${process.env.DB_PORT}`);
  logger.info(`🔌 Socket.IO: Enabled`);
  logger.info('='.repeat(60));
  logger.info('Available endpoints:');
  logger.info(`  GET  /health           - Health check`);
  logger.info(`  GET  /api              - API info`);
  logger.info(`  POST /api/admin/*      - Admin routes (requires login token)`);
  logger.info(`  POST /api/chat/*       - Widget chat routes`);
  logger.info(`  GET  /api/knowledge-base/* - Knowledge base`);
  logger.info('='.repeat(60));
  
});

// Graceful shutdown
const gracefulShutdown = async (signal) => {
  logger.info(`\n${signal} received. Starting graceful shutdown...`);
  
  // Stop accepting new connections
  server.close(async () => {
    logger.info('HTTP server closed');
    
    // Close database pool
    try {
      await pool.end();
      logger.info('Database pool closed');
    } catch (error) {
      logger.error('Error closing database pool:', error);
    }
    
    // Close Socket.IO
    io.close(() => {
      logger.info('Socket.IO closed');
      logger.info('✅ Graceful shutdown complete');
      process.exit(0);
    });
  });
  
  // Force shutdown after 10 seconds
  setTimeout(() => {
    logger.error('❌ Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('❌ Uncaught Exception:', error);
  gracefulShutdown('UNCAUGHT_EXCEPTION');
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  gracefulShutdown('UNHANDLED_REJECTION');
});

module.exports = { app, server, io };















