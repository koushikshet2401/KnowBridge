const express = require('express');
const router = express.Router();
const kbController = require('../controllers/kbController');
const { authenticate } = require('../middleware/auth');
const upload = require('../middleware/upload');

// Public routes (for AI queries)
router.post('/search', kbController.searchKnowledgeBase);
router.get('/documents/:id', kbController.getDocument);

// Protected routes (require authentication)
router.use(authenticate);

// Document management
router.get('/documents', kbController.getAllDocuments);
router.post('/documents/upload', upload.single('file'), kbController.uploadDocument);
router.post('/documents/text', kbController.createTextDocument);
router.put('/documents/:id', kbController.updateDocument);
router.delete('/documents/:id', kbController.deleteDocument);
router.get('/documents/:id/chunks', kbController.getDocumentChunks);

// Website crawling
router.post('/crawl', kbController.startCrawl);
router.get('/crawl/jobs', kbController.getCrawlJobs);
router.get('/crawl/jobs/:jobId', kbController.getCrawlJobStatus);
router.delete('/crawl/jobs/:jobId', kbController.cancelCrawlJob);

// Embeddings management
router.post('/embeddings/regenerate', kbController.regenerateEmbeddings);
router.get('/embeddings/stats', kbController.getEmbeddingStats);

// Categories & tags
router.get('/categories', kbController.getCategories);
router.get('/tags', kbController.getTags);

module.exports = router;
