const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');
const Agent = require('../models/Agent');

/**
 * Authentication Middleware
 *
 * Validates the JWT issued by POST /api/auth/login or /api/auth/signup.
 * The token is read from the X-Chaty-Token header or "Authorization: Bearer <token>".
 * On success, req.agent and req.tenant_id are set from the agent's database record,
 * so the tenant can never be chosen by the client.
 */
const authenticate = async (req, res, next) => {
  if (!process.env.JWT_SECRET) {
    logger.error('CRITICAL: Missing JWT_SECRET environment variable.');
    return res.status(500).json({ success: false, error: 'Server configuration error' });
  }

  const token = req.headers['x-chaty-token'] || req.headers['authorization']?.replace('Bearer ', '');
  if (!token) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required. Please provide a valid token.'
    });
  }

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (jwtError) {
    logger.info(`Auth: JWT verification failed on ${req.method} ${req.path}: ${jwtError.message}`);
    return res.status(401).json({ success: false, error: 'Invalid or expired token. Please login again.' });
  }

  let agent;
  try {
    agent = await Agent.findById(decoded.id);
  } catch (error) {
    if (error.message && (error.message.includes('Connection terminated') || error.message.includes('closed') || error.code === 'ECONNRESET')) {
      try {
        logger.warn('Auth: Pool connection dropped, retrying lookup with fresh connection...');
        agent = await Agent.findById(decoded.id);
      } catch (retryError) {
        logger.error('Authentication lookup retry failed:', retryError);
        return res.status(500).json({ success: false, error: 'Internal server error during authentication' });
      }
    } else {
      logger.error('Authentication lookup failed:', error);
      return res.status(500).json({ success: false, error: 'Internal server error during authentication' });
    }
  }

  if (!agent) {
    return res.status(401).json({ success: false, error: 'Account no longer exists. Please login again.' });
  }
  req.agent = agent;
  req.tenant_id = agent.tenant_id;
  next();
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

module.exports = {
  authenticate,
  requirePermission,
  requireRole
};
