const cache = require('../config/redis');
const logger = require('../utils/logger');

/**
 * Cache Middleware
 * 
 * Location: backend/src/middleware/cache.js
 * 
 * Automatically caches API responses
 */

/**
 * Cache middleware
 * 
 * Usage:
 * router.get('/stats', cacheMiddleware(300), getStatsController);
 * 
 * @param {number} ttl - Time to live in seconds (default: 300 = 5 min)
 * @param {Function} keyGenerator - Custom key generator function
 */
const cacheMiddleware = (ttl = 300, keyGenerator = null) => {
  return async (req, res, next) => {
    // Skip caching if Redis disabled
    if (!cache.isEnabled()) {
      return next();
    }

    // Skip caching for non-GET requests
    if (req.method !== 'GET') {
      return next();
    }

    // Generate cache key
    const cacheKey = keyGenerator
      ? keyGenerator(req)
      : `api:${req.path}:${JSON.stringify(req.query)}:${req.agent?.id || 'anonymous'}`;

    try {
      // Try to get from cache
      const cachedResponse = await cache.get(cacheKey);

      if (cachedResponse) {
        logger.debug(`🎯 Cache HIT: ${cacheKey}`);
        return res.json(cachedResponse);
      }

      // Cache miss - store original res.json function
      const originalJson = res.json.bind(res);

      // Override res.json to cache the response
      res.json = (body) => {
        // Only cache successful responses
        if (res.statusCode >= 200 && res.statusCode < 300 && body.success !== false) {
          cache.set(cacheKey, body, ttl)
            .then(() => {
              logger.debug(`✅ Cache SET: ${cacheKey} (TTL: ${ttl}s)`);
            })
            .catch((err) => {
              logger.error(`Cache SET error: ${err.message}`);
            });
        }

        // Send the response
        return originalJson(body);
      };

      next();

    } catch (error) {
      logger.error('Cache middleware error:', error);
      next(); // Continue without cache on error
    }
  };
};

/**
 * Invalidate cache for specific patterns
 * 
 * Usage in controllers:
 * await invalidateCache('dashboard:*');
 */
const invalidateCache = async (pattern) => {
  try {
    const deleted = await cache.deletePattern(pattern);
    logger.info(`🗑️ Cache invalidated: ${pattern} (${deleted} keys)`);
    return deleted;
  } catch (error) {
    logger.error('Cache invalidation error:', error);
    return 0;
  }
};

/**
 * Cache key generators for specific use cases
 */
const keyGenerators = {
  // Dashboard stats - per user
  dashboardStats: (req) => `dashboard:stats:${req.agent.id}`,

  // Chat list - per user and status
  chatList: (req) => `chats:list:${req.agent.id}:${req.query.status || 'all'}`,

  // Agent list
  agentList: (req) => 'agents:list:all',

  // Knowledge base documents
  kbDocuments: (req) => 'kb:documents:all'
};

/**
 * Cache invalidation patterns for different operations
 */
const invalidationPatterns = {
  // When chat is created/updated
  onChatUpdate: async (chatId, agentId) => {
    await invalidateCache('dashboard:*');
    await invalidateCache('chats:list:*');
    if (agentId) {
      await invalidateCache(`chats:list:${agentId}:*`);
    }
  },

  // When agent is created/updated
  onAgentUpdate: async () => {
    await invalidateCache('agents:*');
    await invalidateCache('dashboard:*');
  },

  // When knowledge base is updated
  onKnowledgeBaseUpdate: async () => {
    await invalidateCache('kb:*');
  },

  // Clear all cache
  clearAll: async () => {
    await cache.flushAll();
  }
};

module.exports = {
  cacheMiddleware,
  invalidateCache,
  keyGenerators,
  invalidationPatterns
};