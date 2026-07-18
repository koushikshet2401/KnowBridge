// Fix: properly destructure the ChatService export
const { ChatService } = require('./chatService');
const aiService = require('./aiService');
const emailService = require('./emailService');

module.exports = {
  AIService: aiService,
  ChatService,
  emailService
};
