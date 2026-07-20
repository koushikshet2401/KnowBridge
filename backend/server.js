require('dns').setDefaultResultOrder('ipv4first');
const express = require('express');
const cors = require('cors');
const http = require('http');
const socketIo = require('socket.io');
const logger = require('./src/utils/logger');
const pool = require('./src/config/database');

/**
 * Express Server Setup - FIXED VERSION
 * 
 * Location: backend/server.js
 * Replace your existing server.js with this file
 * 
 * KEY CHANGES:
 * - Removed standalone auth routes (Laravel handles authentication)
 * - Added health check endpoint
 * - Improved error handling
 * - Better environment variable validation
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

// ----------------
// Socket.IO Setup
// ----------------
const io = socketIo(server, {
  cors: {
    origin: process.env.SOCKET_IO_CORS_ORIGIN?.split(',') || ['http://localhost:3000', 'http://localhost:8000', 'https://knowbridge-dashboard.onrender.com'],
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

// CORS
app.use(cors({
  origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3000', 'http://localhost:8000', 'https://knowbridge-dashboard.onrender.com'],
  credentials: process.env.CORS_CREDENTIALS !== 'false',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-KnowBridge-Token', 'X-Student-Token', 'X-Student-Id', 'X-Client-Domain']
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
    name: 'KnowBridge Chat Support API',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      health: '/health',
      admin: '/api/admin/*',
      chat: '/api/chat/*',
      knowledge: '/api/knowledge-base/*'
    },
    authentication: 'Laravel SSO',
    documentation: '/api/docs'
  });
});

// ----------------
// API Routes
// ----------------

// REMOVED: Standalone authentication routes
// Authentication is handled by Laravel
// const authRoutes = require('./src/routes/auth.routes'); ❌ REMOVED

// Admin routes (require Laravel token)
const authRoutes = require('./src/routes/auth.routes');
const adminRoutes = require('./src/routes/admin.routes');
const notificationRoutes = require('./src/routes/notification.routes');

app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/admin/notifications', notificationRoutes);

// Chat routes (for students)
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
  logger.info('🚀 KnowBridge Chat Support Backend Started');
  logger.info('='.repeat(60));
  logger.info(`📍 Server running on: http://localhost:${PORT}`);
  logger.info(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  logger.info(`💾 Database: ${process.env.DB_NAME} @ ${process.env.DB_HOST}:${process.env.DB_PORT}`);
  if (process.env.LARAVEL_API_URL) logger.info(`🔗 Laravel API: ${process.env.LARAVEL_API_URL}`);
  else logger.info(`🔗 Laravel API: Disabled (Standalone mode)`);
  logger.info(`🔌 Socket.IO: Enabled`);
  logger.info('='.repeat(60));
  logger.info('Available endpoints:');
  logger.info(`  GET  /health           - Health check`);
  logger.info(`  GET  /api              - API info`);
  logger.info(`  POST /api/admin/*      - Admin routes (requires Laravel token)`);
  logger.info(`  POST /api/chat/*       - Student chat routes`);
  logger.info(`  GET  /api/knowledge-base/* - Knowledge base`);
  logger.info('='.repeat(60));
  
  // Warn if in demo/development mode
  if (process.env.MOCK_LARAVEL_AUTH === 'true') {
    logger.warn('⚠️  WARNING: Mock authentication is ENABLED');
    logger.warn('⚠️  This should NEVER be enabled in production!');
  }
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