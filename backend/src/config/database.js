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

const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingEnvVars.length > 0) {
  logger.error('❌ Missing required environment variables:', missingEnvVars);
  logger.error('Please check your .env file in the backend directory');
  process.exit(1);
}

// Create PostgreSQL connection pool with environment variables
const pool = new Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT, 10),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  
  // Connection pool settings
  max: parseInt(process.env.DB_POOL_MAX || '20', 10), // Maximum connections in pool
  min: parseInt(process.env.DB_POOL_MIN || '2', 10),  // Minimum connections
  idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT || '30000', 10),
  connectionTimeoutMillis: parseInt(process.env.DB_CONNECT_TIMEOUT || '10000', 10),
  
  // SSL configuration (important for production)
  ssl: process.env.DB_SSL === 'true' ? {
    rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false'
  } : false
});

// Test database connection on startup
pool.connect((err, client, release) => {
  if (err) {
    logger.error('❌ Database connection failed:', err.message);
    logger.error('Please ensure PostgreSQL is running and credentials are correct');
    process.exit(1);
  }
  
  logger.info('✅ Database connected successfully');
  logger.info(`📊 Database: ${process.env.DB_NAME} @ ${process.env.DB_HOST}:${process.env.DB_PORT}`);
  
  // Release the client back to the pool
  release();
});

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