const logger = require('./logger');

/**
 * Async Handler Wrapper
 * 
 * Location: backend/src/utils/asyncHandler.js
 * 
 * Wraps async controller functions to automatically catch errors
 * and pass them to the global error handler.
 * 
 * Eliminates the need for try-catch in every controller function!
 */

/**
 * Async Handler - Wraps async functions to catch errors
 * 
 * Usage:
 * Before:
 *   exports.getUsers = async (req, res) => {
 *     try {
 *       const users = await User.findAll();
 *       res.json(users);
 *     } catch (error) {
 *       logger.error('Error:', error);
 *       res.status(500).json({ error: 'Internal server error' });
 *     }
 *   };
 * 
 * After:
 *   exports.getUsers = asyncHandler(async (req, res) => {
 *     const users = await User.findAll();
 *     res.json(users);
 *   });
 */
const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next))
      .catch((error) => {
        // Log the error
        logger.error('❌ Async Handler caught error:', {
          error: error.message,
          stack: error.stack,
          path: req.path,
          method: req.method,
          agent: req.agent?.email || 'unauthenticated'
        });

        // Pass to global error handler
        next(error);
      });
  };
};

/**
 * Global Error Handler Middleware
 * 
 * Usage in server.js:
 * app.use(globalErrorHandler);
 */
const globalErrorHandler = (err, req, res, next) => {
  // Set default status code
  const statusCode = err.statusCode || err.status || 500;
  
  // Determine error type and message
  let message = err.message || 'Internal server error';
  let errorType = 'ServerError';

  // Handle specific error types
  if (err.name === 'ValidationError') {
    errorType = 'ValidationError';
    message = err.message;
  } else if (err.name === 'UnauthorizedError') {
    errorType = 'AuthenticationError';
    message = 'Authentication failed';
  } else if (err.code === '23505') {
    // PostgreSQL unique constraint violation
    errorType = 'DuplicateError';
    message = 'A record with this information already exists';
  } else if (err.code === '23503') {
    // PostgreSQL foreign key violation
    errorType = 'ReferenceError';
    message = 'Referenced record does not exist';
  } else if (err.code === 'ECONNREFUSED') {
    errorType = 'DatabaseError';
    message = 'Database connection failed';
  }

  // Log error details
  logger.error('🚨 Global Error Handler:', {
    errorType,
    message: err.message,
    statusCode,
    path: req.path,
    method: req.method,
    agent: req.agent?.email || 'unauthenticated',
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });

  // Prepare error response
  const errorResponse = {
    success: false,
    error: message,
    type: errorType
  };

  // Include stack trace in development only
  if (process.env.NODE_ENV === 'development') {
    errorResponse.stack = err.stack;
    errorResponse.details = err.details || null;
  }

  // Send error response
  res.status(statusCode).json(errorResponse);
};

/**
 * Custom Error Classes
 */

class AppError extends Error {
  constructor(message, statusCode = 500) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

class ValidationError extends AppError {
  constructor(message) {
    super(message, 400);
    this.name = 'ValidationError';
  }
}

class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(message, 404);
    this.name = 'NotFoundError';
  }
}

class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized access') {
    super(message, 401);
    this.name = 'UnauthorizedError';
  }
}

class ForbiddenError extends AppError {
  constructor(message = 'Access forbidden') {
    super(message, 403);
    this.name = 'ForbiddenError';
  }
}

class ConflictError extends AppError {
  constructor(message = 'Resource conflict') {
    super(message, 409);
    this.name = 'ConflictError';
  }
}

module.exports = {
  asyncHandler,
  globalErrorHandler,
  AppError,
  ValidationError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
  ConflictError
};
