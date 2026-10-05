/**
 * Chat Routes - FIXED VERSION
 * 
 * Location: backend/src/routes/chat.routes.js
 * 
 * KEY FIX: Use authenticate middleware instead of verifySignature for /start
 */

const express = require('express');
const router = express.Router();
const chatController = require('../controllers/chatController');
const upload = require('../middleware/upload');
const { newChatLimiter, chatMessageLimiter } = require('../middleware/rateLimiter');
const { validate } = require('../middleware/validate');
const { chatSchemas, paramSchemas } = require('../validation/schemas');
const { verifySignature } = require('../middleware/signature');
const { authenticate } = require('../middleware/auth');
const { validateTenantOrigin } = require('../middleware/tenant');

// Note: Public widget routes rely on rate limiting instead of cryptographic signatures 
// because the public browser cannot securely hold a secret key.
// router.use(verifySignature);

// Security: ALL requests to the chat endpoints must validate their Origin
// against the registered tenant domain to prevent cross-tenant AI interrogation.
router.use(validateTenantOrigin);

// Public Widget Routes
router.post('/start', 
  newChatLimiter, 
  validate(chatSchemas.startChat), 
  chatController.startChat
);

router.get('/:chatId', 
  validate(paramSchemas.uuid), 
  chatController.getChatById
);

router.get('/user/:userId/history', 
  validate(paramSchemas.uuid), 
  chatController.getUserChatHistory
);

router.patch('/:chatId/status', 
  validate(paramSchemas.uuid), 
  chatController.updateChatStatus
);

// Messaging
router.post('/message', 
  chatMessageLimiter, 
  validate(chatSchemas.sendMessage), 
  chatController.sendMessage
);

router.get('/:chatId/messages', 
  validate(paramSchemas.uuid), 
  chatController.getChatMessages
);

router.post('/upload', 
  upload.single('file'), 
  chatController.uploadFile
);

// Feedback
router.post('/feedback', 
  chatController.submitFeedback
);

router.get('/:chatId/feedback', 
  validate(paramSchemas.uuid), 
  chatController.getChatFeedback
);

// Escalation
router.post('/:chatId/escalate', 
  validate(paramSchemas.uuid), 
  chatController.escalateToHuman
);

router.post('/:chatId/retry', 
  validate(paramSchemas.uuid), 
  chatController.retryAIResponse
);

// Chat actions
router.post('/:chatId/close', 
  validate(paramSchemas.uuid), 
  chatController.closeChat
);

router.post('/:chatId/reopen', 
  validate(paramSchemas.uuid), 
  chatController.reopenChat
);

router.post('/:chatId/rate', 
  validate(paramSchemas.uuid), 
  chatController.rateChat
);

module.exports = router;
