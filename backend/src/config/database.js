const { Pool } = require('pg');
const logger = require('../utils/logger');

/**
 * PostgreSQL Database Configuration
 * 
 * FIXED VERSION - Uses environment variables instead of hardcoded credentials
 * Location: backend/src/config/database.js
 * 
 * Replace your existing database.js with this file
 */

// Load environment variables
require('dotenv').config();

// Validate required environment variables
const requiredEnvVars = [
  'DB_HOST',
  'DB_PORT',
  'DB_USER',
  'DB_PASSWORD',
  'DB_NAME'
];

if (!process.env.DATABASE_URL) {
  const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);

  if (missingEnvVars.length > 0) {
    logger.error('❌ Missing required environment variables:', missingEnvVars);
    logger.error('Please provide DATABASE_URL or individual DB_* variables');
    process.exit(1);
  }
}

// Create PostgreSQL connection pool with environment variables
const poolConfig = {
  // Connection pool settings (min: 0 is essential for Supabase Pooler / Supavisor)
  max: parseInt(process.env.DB_POOL_MAX || '10', 10),
  min: parseInt(process.env.DB_POOL_MIN || '0', 10),
  idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT || '10000', 10),
  connectionTimeoutMillis: parseInt(process.env.DB_CONNECT_TIMEOUT || '15000', 10),
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000,
  
  // SSL configuration (important for production)
  ssl: process.env.DB_SSL === 'true' ? {
    rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false'
  } : false
};

if (process.env.DATABASE_URL) {
  poolConfig.connectionString = process.env.DATABASE_URL;
} else {
  poolConfig.host = process.env.DB_HOST;
  poolConfig.port = parseInt(process.env.DB_PORT, 10);
  poolConfig.user = process.env.DB_USER;
  poolConfig.password = process.env.DB_PASSWORD;
  poolConfig.database = process.env.DB_NAME;
}

const pool = new Pool(poolConfig);

// Test database connection on startup with retries (handles Supabase waking up from paused state)
const testConnectionWithRetry = (retries = 5, delayMs = 3000) => {
  pool.connect((err, client, release) => {
    if (err) {
      if (retries > 0) {
        logger.warn(`⚠️ Database connection attempt failed (${err.message}). Retrying in ${delayMs / 1000}s... (${retries} attempts left)`);
        setTimeout(() => testConnectionWithRetry(retries - 1, delayMs), delayMs);
      } else {
        console.error(err);
        logger.error('❌ Database connection failed after multiple retries:', err);
        logger.error('Please ensure PostgreSQL is running, unpaused, and credentials are correct');
        process.exit(1);
      }
      return;
    }

    logger.info('✅ Database connected successfully');
    logger.info(`📊 Database: ${process.env.DB_NAME} @ ${process.env.DB_HOST}:${process.env.DB_PORT}`);
    release();
  });
};

testConnectionWithRetry();

// Handle pool errors
pool.on('error', (err) => {
  logger.error('Unexpected database pool error:', err);
  // Don't exit process - just log the error
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM signal received: closing database pool');
  await pool.end();
  logger.info('Database pool closed');
});

process.on('SIGINT', async () => {
  logger.info('SIGINT signal received: closing database pool');
  await pool.end();
  logger.info('Database pool closed');
  process.exit(0);
});

// Export pool for use in other modules
module.exports = pool;

// Export helper function to check database health
module.exports.checkHealth = async () => {
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT NOW()');
    client.release();
    return {
      healthy: true,
      timestamp: result.rows[0].now
    };
  } catch (error) {
    logger.error('Database health check failed:', error);
    return {
      healthy: false,
      error: error.message
    };
  }
};
