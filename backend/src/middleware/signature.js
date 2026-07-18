const crypto = require('crypto');
const axios = require('axios');
const logger = require('../utils/logger');

const CHAT_AUTH_SECRET = process.env.CHAT_AUTH_SECRET || 'KnowBridge-chat-secret-2026';

// Local high-speed memory cache for verified Laravel SSO tokens to minimize server-to-server API overhead
const ssoCache = new Map(); // token -> { user, expiresAt }

// Function to dynamically get the Laravel app URL from Origin/Referer headers to support multi-client environments
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

/**
 * Middleware to verify SHA256 HMAC cryptographic signatures from client integrations.
 * If a valid X-KnowBridge-Token is provided, it attempts token validation first.
 * Prevents identity/domain spoofing and replay attacks.
 */
const verifySignature = async (req, res, next) => {
  // Graceful bypass in Mock Development environment
  if (process.env.MOCK_LARAVEL_AUTH === 'true') {
    return next();
  }

  // Check if a token-based SSO session is being used (React widget is logged in)
  const token = req.headers['x-knowbridge-token'] || req.headers['authorization']?.replace('Bearer ', '');
  if (token) {
    const now = Date.now();
    if (ssoCache.has(token)) {
      const cached = ssoCache.get(token);
      if (cached.expiresAt > now) {
        req.agent = cached.user;
        logger.info(`✅ verifySignature: Token SSO bypass success via local cache for ${cached.user.email}`);
        return next();
      } else {
        ssoCache.delete(token);
      }
    }

    // Try Local JWT verification first
    try {
      const jwt = require('jsonwebtoken');
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret');
      
      const Agent = require('../models/Agent');
      const agent = await Agent.findById(decoded.id);
      
      if (agent) {
        req.agent = {
          id: agent.id,
          name: agent.name,
          email: agent.email,
          role: agent.role,
          permissions: agent.permissions || {}
        };
        logger.info(`✅ [VERIFY-FLOW] Local JWT bypass success for ${req.agent.email}`);
        return next();
      }
    } catch (jwtError) {
      logger.info(`⚠️ [VERIFY-FLOW] Local JWT verification failed: ${jwtError.message}. Trying Laravel SSO...`);
    }

    let targetLaravelUrl;
    try {
      targetLaravelUrl = getLaravelAppUrl(req);
      logger.info(`🔍 [VERIFY-FLOW] Origin: ${req.headers.origin || 'none'}, Resolving to: ${targetLaravelUrl}`);
      logger.info(`🔍 [VERIFY-FLOW] Token received: ${token.substring(0, 10)}... (length: ${token.length})`);
      
      const response = await axios.post(`${targetLaravelUrl}/api/chat/verify`, {
        token: token
      }, {
        timeout: 5000,
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'X-Chat-Secret': CHAT_AUTH_SECRET
        }
      });

      logger.info(`🔍 [VERIFY-FLOW] Laravel response status: ${response.status}`);
      logger.info(`🔍 [VERIFY-FLOW] Laravel response data:`, response.data);

      if (response.data && response.data.success && response.data.user) {
        const userData = {
          id: response.data.user.id,
          name: response.data.user.name,
          email: response.data.user.email,
          role: response.data.user.role,
          permissions: response.data.user.permissions || {}
        };

        // Cache successful token validation for 5 minutes to reduce server-to-server load
        ssoCache.set(token, {
          user: userData,
          expiresAt: Date.now() + 5 * 60 * 1000
        });

        req.agent = userData;
        logger.info(`✅ [VERIFY-FLOW] Token SSO bypass success for ${response.data.user.email}`);
        return next();
      } else {
        logger.warn(`⚠️ [VERIFY-FLOW] Laravel returned 200 OK but success was false or user missing:`, response.data);
      }
    } catch (tokenError) {
      logger.error(`❌ [VERIFY-FLOW] Laravel SSO token validation HTTP error: ${tokenError.message}`);
      if (tokenError.response) {
        logger.error(`❌ [VERIFY-FLOW] Laravel Error Status: ${tokenError.response.status}`);
        logger.error(`❌ [VERIFY-FLOW] Laravel Error Data:`, tokenError.response.data);
      }
    }
  }

  const signature = req.headers['x-knowbridge-signature'] || req.headers['x-signature'];
  const timestamp = req.headers['x-knowbridge-timestamp'] || req.headers['x-timestamp'];

  if (!signature || !timestamp) {
    logger.warn('❌ Cryptographic validation failed: Missing signature/timestamp headers AND no valid token');
    return res.status(401).json({
      success: false,
      error: 'Security signature or authentication token is required for widget connection.'
    });
  }

  // Prevent replay attacks by validating timestamp drift (5 minutes maximum)
  const currentTimestamp = Date.now();
  const requestTimestamp = parseInt(timestamp, 10);
  const drift = Math.abs(currentTimestamp - requestTimestamp);
  
  if (isNaN(requestTimestamp) || drift > 5 * 60 * 1000) {
    logger.warn(`❌ Cryptographic validation failed: Timestamp drift too high (${drift}ms)`);
    return res.status(401).json({
      success: false,
      error: 'Security signature has expired. Please refresh the widget.'
    });
  }

  // Generate local expected HMAC signature from request body and request timestamp
  let payloadStr = '';
  if (req.body && Object.keys(req.body).length > 0) {
    // Sort keys alphabetically to guarantee deterministic JSON serialization
    const sortedBody = {};
    Object.keys(req.body).sort().forEach(key => {
      sortedBody[key] = req.body[key];
    });
    payloadStr = JSON.stringify(sortedBody);
  }

  const dataToSign = `${timestamp}.${payloadStr}`;
  
  const expectedSignature = crypto
    .createHmac('sha256', CHAT_AUTH_SECRET)
    .update(dataToSign)
    .digest('hex');

  if (signature !== expectedSignature) {
    logger.warn('❌ Cryptographic validation failed: Signature HMAC mismatch');
    return res.status(401).json({
      success: false,
      error: 'Invalid security signature. Authentication verification failed.'
    });
  }

  next();
};

module.exports = { verifySignature };
