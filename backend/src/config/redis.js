const Redis = require('ioredis');
const logger = require('../utils/logger');

/**
 * Redis Cache Configuration
 * 
 * Location: backend/src/config/redis.js
 * 
 * Install: npm install ioredis
 * 
 * Provides caching for heavy database queries to improve performance
 */

let redisClient = null;
let isRedisEnabled = false;

/**
 * Initialize Redis connection
 */
const initRedis = () => {
  if (process.env.REDIS_ENABLED !== 'true') {
    logger.info('📦 Redis caching: Disabled');
    return null;
  }

  try {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    
    redisClient = new Redis(redisUrl, {
      password: process.env.REDIS_PASSWORD || null,
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      maxRetriesPerRequest: 3
    });

    redisClient.on('connect', () => {
      logger.info('✅ Redis connected successfully');
      isRedisEnabled = true;
    });

    redisClient.on('error', (err) => {
      logger.error('❌ Redis connection error:', err.message);
      isRedisEnabled = false;
    });

    redisClient.on('close', () => {
      logger.warn('⚠️ Redis connection closed');
      isRedisEnabled = false;
    });

    return redisClient;

  } catch (error) {
    logger.error('❌ Failed to initialize Redis:', error);
    return null;
  }
};

/**
 * Get value from cache
 * 
 * @param {string} key - Cache key
 * @returns {Promise<any>} - Cached value or null
 */
const get = async (key) => {
  if (!isRedisEnabled || !redisClient) {
    return null;
  }

  try {
    const value = await redisClient.get(key);
    if (value) {
      logger.debug(`🎯 Cache HIT: ${key}`);
      return JSON.parse(value);
    }
    logger.debug(`❌ Cache MISS: ${key}`);
    return null;
  } catch (error) {
    logger.error(`Redis GET error for key ${key}:`, error);
    return null;
  }
};

/**
 * Set value in cache
 * 
 * @param {string} key - Cache key
 * @param {any} value - Value to cache
 * @param {number} ttl - Time to live in seconds (default: 300 = 5 min)
 * @returns {Promise<boolean>} - Success status
 */
const set = async (key, value, ttl = 300) => {
  if (!isRedisEnabled || !redisClient) {
    return false;
  }

  try {
    await redisClient.setex(key, ttl, JSON.stringify(value));
    logger.debug(`✅ Cache SET: ${key} (TTL: ${ttl}s)`);
    return true;
  } catch (error) {
    logger.error(`Redis SET error for key ${key}:`, error);
    return false;
  }
};

/**
 * Delete key from cache
 * 
 * @param {string} key - Cache key
 * @returns {Promise<boolean>} - Success status
 */
const del = async (key) => {
  if (!isRedisEnabled || !redisClient) {
    return false;
  }

  try {
    await redisClient.del(key);
    logger.debug(`🗑️ Cache DELETE: ${key}`);
    return true;
  } catch (error) {
    logger.error(`Redis DELETE error for key ${key}:`, error);
    return false;
  }
};

/**
 * Delete multiple keys matching pattern
 * 
 * @param {string} pattern - Key pattern (e.g., 'dashboard:*')
 * @returns {Promise<number>} - Number of deleted keys
 */
const deletePattern = async (pattern) => {
  if (!isRedisEnabled || !redisClient) {
    return 0;
  }

  try {
    const keys = await redisClient.keys(pattern);
    if (keys.length > 0) {
      await redisClient.del(...keys);
      logger.debug(`🗑️ Cache DELETE pattern: ${pattern} (${keys.length} keys)`);
      return keys.length;
    }
    return 0;
  } catch (error) {
    logger.error(`Redis DELETE pattern error for ${pattern}:`, error);
    return 0;
  }
};

/**
 * Check if key exists
 * 
 * @param {string} key - Cache key
 * @returns {Promise<boolean>}
 */
const exists = async (key) => {
  if (!isRedisEnabled || !redisClient) {
    return false;
  }

  try {
    const result = await redisClient.exists(key);
    return result === 1;
  } catch (error) {
    logger.error(`Redis EXISTS error for key ${key}:`, error);
    return false;
  }
};

/**
 * Get or set cached value
 * If key exists, return cached value
 * Otherwise, execute callback and cache the result
 * 
 * @param {string} key - Cache key
 * @param {Function} callback - Function to execute if cache miss
 * @param {number} ttl - Time to live in seconds
 * @returns {Promise<any>}
 */
const getOrSet = async (key, callback, ttl = 300) => {
  // Try to get from cache first
  const cached = await get(key);
  if (cached !== null) {
    return cached;
  }

  // Cache miss - execute callback
  const value = await callback();

  // Cache the result
  await set(key, value, ttl);

  return value;
};

/**
 * Flush all cache
 * 
 * @returns {Promise<boolean>}
 */
const flushAll = async () => {
  if (!isRedisEnabled || !redisClient) {
    return false;
  }

  try {
    await redisClient.flushall();
    logger.info('🗑️ Redis cache flushed');
    return true;
  } catch (error) {
    logger.error('Redis FLUSH error:', error);
    return false;
  }
};

/**
 * Close Redis connection
 */
const close = async () => {
  if (redisClient) {
    await redisClient.quit();
    logger.info('Redis connection closed');
  }
};

// Initialize Redis on module load
const redis = initRedis();

module.exports = {
  redis,
  get,
  set,
  del,
  deletePattern,
  exists,
  getOrSet,
  flushAll,
  close,
  isEnabled: () => isRedisEnabled
};
