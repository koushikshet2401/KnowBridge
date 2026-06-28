const logger = require('../utils/logger');
const { ValidationError } = require('../utils/asyncHandler');

/**
 * Validation Middleware
 * 
 * Location: backend/src/middleware/validate.js
 * 
 * Uses Zod schemas to validate request data
 */

/**
 * Validate request against Zod schema
 * 
 * Usage:
 * const { chatSchemas } = require('../validation/schemas');
 * router.post('/start', validate(chatSchemas.startChat), startChatController);
 */
const validate = (schema) => {
  return async (req, res, next) => {
    try {
      // Validate request data
      const validated = await schema.parseAsync({
        body: req.body,
        query: req.query,
        params: req.params
      });

      // Replace request data with validated data
      req.body = validated.body || req.body;
      req.query = validated.query || req.query;
      req.params = validated.params || req.params;

      next();
    } catch (error) {
      // Zod validation error
      if (error.name === 'ZodError') {
        const zodErrors = error.errors || error.issues || [];
        const errors = zodErrors.map((err) => ({
          field: err.path ? err.path.join('.') : 'unknown',
          message: err.message
        }));

        logger.warn('⚠️ Validation failed:', {
          path: req.path,
          errors,
          agent: req.agent?.email || 'unauthenticated'
        });

        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: errors
        });
      }

      // Other errors
      next(error);
    }
  };
};

/**
 * Validate file upload
 */
const validateFile = (fieldName = 'file') => {
  return (req, res, next) => {
    const file = req.file || req.files?.[fieldName];

    if (!file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded'
      });
    }

    // Check file size
    const maxSize = parseInt(process.env.MAX_FILE_SIZE || '5242880', 10);
    if (file.size > maxSize) {
      return res.status(400).json({
        success: false,
        error: `File too large. Maximum size is ${maxSize / 1024 / 1024}MB`
      });
    }

    // Check file type
    const allowedTypes = (process.env.ALLOWED_FILE_TYPES || 'image/jpeg,image/png,image/gif,application/pdf').split(',');
    if (!allowedTypes.includes(file.mimetype)) {
      return res.status(400).json({
        success: false,
        error: 'File type not allowed',
        allowedTypes
      });
    }

    next();
  };
};

/**
 * Sanitize input to prevent XSS
 */
const sanitizeInput = (req, res, next) => {
  const sanitize = (obj) => {
    if (typeof obj === 'string') {
      // Remove potential XSS patterns
      return obj
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/javascript:/gi, '')
        .replace(/on\w+\s*=/gi, '');
    }
    if (typeof obj === 'object' && obj !== null) {
      Object.keys(obj).forEach((key) => {
        obj[key] = sanitize(obj[key]);
      });
    }
    return obj;
  };

  req.body = sanitize(req.body);
  req.query = sanitize(req.query);
  req.params = sanitize(req.params);

  next();
};

module.exports = {
  validate,
  validateFile,
  sanitizeInput
};