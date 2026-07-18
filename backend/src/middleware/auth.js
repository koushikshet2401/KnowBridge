const logger = require('../utils/logger');
const axios = require('axios');

/**
 * Authentication Middleware - Laravel Token Validation
 * 
 * ENHANCED VERSION with comprehensive logging
 * Location: backend/src/middleware/auth.js
 */

const getLaravelAppUrl = (req) => {
  const referer = req.headers.referer;

  // 1. Try to extract from Referer to support subdirectory-based tenants IF the browser sends the full path
  if (referer && referer.includes('/public/')) {
    try {
      const url = new URL(referer);
      const basePath = url.pathname.substring(0, url.pathname.indexOf('/public/') + 7);
      return `${url.protocol}//${url.host}${basePath}`;
    } catch (e) {
      // Ignore parsing errors
    }
  }

  // 2. If the path is stripped (e.g., Strict-Origin policy), use the environment variable directly.
  // Ensure we strip any trailing slashes to prevent //api/chat/verify
  let appUrl = process.env.LARAVEL_APP_URL || 'http://127.0.0.1:8000';
  return appUrl.replace(/\/$/, '');
};

const CHAT_AUTH_SECRET = process.env.CHAT_AUTH_SECRET || 'KnowBridge-chat-secret-2026';

const jwt = require('jsonwebtoken');
const Agent = require('../models/Agent');

/**
 * Validate Laravel-issued authentication token OR local JWT
 */
const authenticate = async (req, res, next) => {
  try {
    logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    logger.info('🔐 AUTHENTICATION MIDDLEWARE TRIGGERED');
    logger.info(`📍 Route: ${req.method} ${req.path}`);
    logger.info(`🌐 Origin: ${req.headers.origin || 'none'}`);
    logger.info(`📨 Referer: ${req.headers.referer || 'none'}`);
    
    // Get token from header
    const tokenFromHeader = req.headers['x-knowbridge-token'];
    const tokenFromAuth = req.headers['authorization']?.replace('Bearer ', '');
    const token = tokenFromHeader || tokenFromAuth;
    
    logger.info(`🔑 Headers received:`);
    logger.info(`   - x-KnowBridge-token: ${tokenFromHeader ? tokenFromHeader.substring(0, 20) + '...' : 'NOT PROVIDED'}`);
    logger.info(`   - authorization: ${tokenFromAuth ? tokenFromAuth.substring(0, 20) + '...' : 'NOT PROVIDED'}`);
    logger.info(`   - Final token: ${token ? token.substring(0, 20) + '... (length: ' + token.length + ')' : 'NONE'}`);
    
    if (!token) {
      logger.error('❌ AUTHENTICATION FAILED: No token provided');
      logger.error('   Available headers:', Object.keys(req.headers));
      logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      return res.status(401).json({
        success: false,
        error: 'Authentication required. Please provide a valid token.',
        debug: {
          headersReceived: Object.keys(req.headers),
          expectedHeaders: ['x-KnowBridge-token', 'authorization']
        }
      });
    }

    // SPECIAL CASE: Allow demo-token for standalone Admin Dashboard (Port 3000)
    if (token === 'demo-token') {
      logger.info('🔓 Auth: Using demo-token (Staff Panel)');
      // Fetch a valid agent ID from the DB to prevent foreign key errors
      const pool = require('../config/database');
      const agentRes = await pool.query('SELECT id, name, email FROM agents LIMIT 1');
      const validAgent = agentRes.rows[0];

      req.agent = {
        id: validAgent ? validAgent.id : null,
        name: validAgent ? validAgent.name : 'Staff Admin (Demo)',
        email: validAgent ? validAgent.email : 'dev@test.com',
        role: 'super_admin',
        permissions: { view_all_chats: true, manage_chats: true }
      };
      logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      return next();
    }

    // OPTION 1: Try local JWT (for Staff Panel Login)
    try {
      logger.info('🔍 Attempting JWT verification...');
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret');
      
      const agent = await Agent.findById(decoded.id);
      if (agent) {
        req.agent = agent;
        logger.info(`✅ Authenticated via JWT: ${req.agent.email} (${req.agent.role})`);
        logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        return next();
      }
    } catch (jwtError) {
      logger.info(`⚠️ JWT verification failed: ${jwtError.message}`);
      logger.info('   Trying Laravel SSO...');
    }

    // OPTION 2: Validate token with Laravel backend (SSO)
    try {
      const targetLaravelUrl = getLaravelAppUrl(req);
      const verifyUrl = `${targetLaravelUrl}/api/chat/verify`;
      
      logger.info(`🔍 Laravel SSO Verification:`);
      logger.info(`   URL: ${verifyUrl}`);
      logger.info(`   Secret: ${CHAT_AUTH_SECRET.substring(0, 10)}...`);
      logger.info(`   Token: ${token.substring(0, 20)}...`);
      
      const response = await axios.post(verifyUrl, {
        token: token
      }, {
        timeout: 5000,
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'X-Chat-Secret': CHAT_AUTH_SECRET
        }
      });

      logger.info(`📥 Laravel Response:`);
      logger.info(`   Status: ${response.status}`);
      logger.info(`   Data:`, JSON.stringify(response.data, null, 2));

      if (!response.data || !response.data.success || !response.data.user) {
        logger.error('❌ AUTHENTICATION FAILED: Invalid Laravel response');
        logger.error('   Response:', response.data);
        logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        return res.status(401).json({
          success: false,
          error: 'Invalid or expired token. Please login again.',
          debug: {
            laravelResponse: response.data,
            verifyUrl: verifyUrl
          }
        });
      }

      // Token is valid - attach user info to request
      req.agent = {
        id: response.data.user.id,
        name: response.data.user.name,
        email: response.data.user.email,
        role: response.data.user.role,
        permissions: response.data.user.permissions || {}
      };

      logger.info(`✅ AUTHENTICATION SUCCESS via Laravel SSO`);
      logger.info(`   User: ${req.agent.email}`);
      logger.info(`   Role: ${req.agent.role}`);
      logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      next();

    } catch (validationError) {
      logger.error('❌ LARAVEL VERIFICATION ERROR:');
      logger.error(`   Message: ${validationError.message}`);
      
      if (validationError.response) {
        logger.error(`   HTTP Status: ${validationError.response.status}`);
        logger.error(`   Response Data:`, validationError.response.data);
      }
      
      if (validationError.code === 'ECONNREFUSED') {
        logger.error('   ⚠️ Cannot connect to Laravel API');
        logger.error('   ⚠️ Is Laravel running on the correct port?');
        logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        return res.status(503).json({
          success: false,
          error: 'Authentication service unavailable. Please try again later.',
          debug: {
            laravelUrl: getLaravelAppUrl(req),
            error: 'Laravel API not reachable'
          }
        });
      }

      logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      return res.status(401).json({
        success: false,
        error: 'Invalid authentication token',
        debug: {
          error: validationError.message,
          code: validationError.code
        }
      });
    }

  } catch (error) {
    logger.error('❌ AUTHENTICATION MIDDLEWARE CRITICAL ERROR:', error);
    logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    return res.status(500).json({
      success: false,
      error: 'Internal server error during authentication'
    });
  }
};

const requirePermission = (permission) => {
  return (req, res, next) => {
    if (!req.agent) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    if (!req.agent.permissions || !req.agent.permissions[permission]) {
      logger.warn(`❌ Permission denied: ${req.agent.email} lacks '${permission}'`);
      return res.status(403).json({
        success: false,
        error: 'You do not have permission to perform this action'
      });
    }

    next();
  };
};

const requireRole = (roles) => {
  const allowedRoles = Array.isArray(roles) ? roles : [roles];
  
  return (req, res, next) => {
    if (!req.agent) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    if (!allowedRoles.includes(req.agent.role)) {
      logger.warn(`❌ Access denied: ${req.agent.email} role '${req.agent.role}' not in [${allowedRoles.join(', ')}]`);
      return res.status(403).json({
        success: false,
        error: 'Access denied. Insufficient privileges.'
      });
    }

    next();
  };
};

const bypassAuth = async (req, res, next) => {
  if (process.env.NODE_ENV === 'production') {
    logger.error('❌ CRITICAL: bypassAuth middleware used in PRODUCTION!');
    return res.status(500).json({
      error: 'Invalid configuration'
    });
  }

  logger.warn('⚠️ DEV MODE: Authentication bypassed!');
  
  // Fetch a valid agent ID from the DB to prevent foreign key errors
  const pool = require('../config/database');
  let validAgent = null;
  try {
    const agentRes = await pool.query('SELECT id, name, email FROM agents LIMIT 1');
    validAgent = agentRes.rows[0];
  } catch (e) {
    logger.warn('Failed to fetch valid agent in bypassAuth:', e.message);
  }
  
  req.agent = {
    id: validAgent ? validAgent.id : null,
    name: validAgent ? validAgent.name : 'Development Admin',
    email: validAgent ? validAgent.email : 'dev@test.com',
    role: 'super_admin',
    permissions: {
      view_all_chats: true,
      assign_chats: true,
      delete_chats: true,
      manage_team: true,
      manage_settings: true,
      view_analytics: true,
      manage_knowledge_base: true
    }
  };
  
  next();
};

if (process.env.MOCK_LARAVEL_AUTH === 'true' && process.env.NODE_ENV !== 'production') {
  module.exports = {
    authenticate: bypassAuth,
    requirePermission: (permission) => (req, res, next) => next(),
    requireRole: (roles) => (req, res, next) => next(),
    bypassAuth
  };
} else {
  module.exports = {
    authenticate,
    requirePermission,
    requireRole,
    bypassAuth
  };
}
