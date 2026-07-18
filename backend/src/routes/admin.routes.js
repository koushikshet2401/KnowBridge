const express = require('express');
const router  = express.Router();
const { authenticate } = require('../middleware/auth');
const adminController  = require('../controllers/adminController');
const chatController   = require('../controllers/chatController');
const kbController     = require('../controllers/kbController');
const notificationController = require('../controllers/notificationController');

// All routes require authentication
router.use(authenticate);

// ── Dashboard ────────────────────────────────
router.get('/dashboard/stats',  adminController.getDashboardStats);
router.get('/dashboard/charts', adminController.getDashboardCharts);
router.get('/dashboard/date-range', adminController.getChatStatsByDateRange);

// ── Chats ────────────────────────────────────
router.get('/chats',              adminController.getAllChats);
router.get('/chats/my-chats',     adminController.getMyChats);
router.get('/chats/:chatId',      adminController.getChatDetails);
router.get('/chats/:chatId/messages', chatController.getChatMessages);
router.post('/chats/:chatId/assign',  adminController.assignChat);
router.post('/chats/:chatId/unassign', adminController.unassignChat);
router.patch('/chats/:chatId/assign', adminController.assignChat);
router.post('/chats/:chatId/close',   adminController.closeChat);
router.post('/chats/:chatId/messages', adminController.replyToChat);
router.patch('/chats/:chatId/status', adminController.updateChatStatus);

// ── ✅ CRAWLER ROUTES FIRST (before :id routes!) ──
router.post('/knowledge-base/crawl',                       kbController.startCrawl);
router.get('/knowledge-base/crawl/jobs',                   kbController.getCrawlJobs);
router.get('/knowledge-base/crawl/jobs/:id',               kbController.getCrawlJobStatus);
router.post('/knowledge-base/crawl/jobs/:id/stop',         kbController.stopCrawlJob);
router.delete('/knowledge-base/crawl/jobs/:id',            kbController.deleteCrawlJob);

// ── Knowledge Base static routes ─────────────
router.get('/knowledge-base',             kbController.getAllDocuments);
router.get('/knowledge-base/stats',       kbController.getEmbeddingStats);
router.get('/knowledge-base/categories',  kbController.getCategories);
router.get('/knowledge-base/search',      kbController.searchKnowledgeBase);
router.post('/knowledge-base/upload',     kbController.uploadMiddleware, kbController.uploadDocument);
router.post('/knowledge-base/paste',      kbController.pasteText);

// ── Knowledge Base dynamic :id routes (LAST!) ─
router.get('/knowledge-base/:id',         kbController.getDocument);
router.get('/knowledge-base/:id/chunks',  kbController.getDocumentChunks);
router.delete('/knowledge-base/:id',      kbController.deleteDocument);

// ── Agents ───────────────────────────────────
router.get('/agents',            adminController.getAllAgents);
router.post('/agents',           adminController.createAgent);
router.put('/agents/:id',        adminController.updateAgent);
router.patch('/agents/:id',      adminController.updateAgent);
router.delete('/agents/:id',     adminController.deleteAgent);
router.get('/agents/:agentId/stats', adminController.getAgentStats);

// ── ✅ Password change route ──────────────────
router.post('/agents/change-password', adminController.changePassword);

// ── Reviews & Feedback ───────────────────────
router.get('/reviews',            adminController.getReviews);
router.patch('/reviews/:id/resolve', adminController.resolveReview);
router.get('/feedback/analysis',  adminController.getFeedbackAnalysis);

// ── Notifications ────────────────────────────
router.get('/notifications',               notificationController.getNotifications);
router.put('/notifications/:id/read',      notificationController.markAsRead);
router.put('/notifications/read-all',      notificationController.markAllAsRead);

// ── Settings ─────────────────────────────────
router.get('/settings',  adminController.getSettings);
router.put('/settings',  adminController.updateSettings);

module.exports = router;
