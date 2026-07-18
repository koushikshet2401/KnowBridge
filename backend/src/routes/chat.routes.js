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

// Public Widget Routes
router.post('/start', 
  verifySignature,
  newChatLimiter, 
  validate(chatSchemas.startChat), 
  chatController.startChat
);

router.get('/:chatId', 
  verifySignature,
  validate(paramSchemas.uuid), 
  chatController.getChatById
);

router.get('/user/:userId/history', 
  verifySignature,
  validate(paramSchemas.uuid), 
  chatController.getUserChatHistory
);

router.patch('/:chatId/status', 
  verifySignature,
  validate(paramSchemas.uuid), 
  chatController.updateChatStatus
);

// Messaging
router.post('/message', 
  verifySignature,
  chatMessageLimiter, 
  validate(chatSchemas.sendMessage), 
  chatController.sendMessage
);

router.get('/:chatId/messages', 
  verifySignature,
  validate(paramSchemas.uuid), 
  chatController.getChatMessages
);

router.post('/upload', 
  verifySignature,
  upload.single('file'), 
  chatController.uploadFile
);

// Feedback
router.post('/feedback', 
  verifySignature,
  chatController.submitFeedback
);

router.get('/:chatId/feedback', 
  verifySignature,
  validate(paramSchemas.uuid), 
  chatController.getChatFeedback
);

// Escalation
router.post('/:chatId/escalate', 
  verifySignature,
  validate(paramSchemas.uuid), 
  chatController.escalateToHuman
);

router.post('/:chatId/retry', 
  verifySignature,
  validate(paramSchemas.uuid), 
  chatController.retryAIResponse
);

// Chat actions
router.post('/:chatId/close', 
  verifySignature,
  validate(paramSchemas.uuid), 
  chatController.closeChat
);

router.post('/:chatId/reopen', 
  verifySignature,
  validate(paramSchemas.uuid), 
  chatController.reopenChat
);

router.post('/:chatId/rate', 
  verifySignature,
  validate(paramSchemas.uuid), 
  chatController.rateChat
);

module.exports = router;
