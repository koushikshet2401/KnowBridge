const pool = require('../config/database');
const logger = require('../utils/logger');
const { runCrawl, storeDocumentWithEmbeddings } = require('../services/crawlerService');
const { generateEmbeddings, splitTextByTokens } = require('../services/embeddingService');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// File upload config
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '../../uploads/documents');
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}_${file.originalname}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') cb(null, true);
    else cb(new Error('Only PDF files allowed'));
  }
});

exports.uploadMiddleware = upload.single('file');

// ─── Get all documents ───────────────────────
exports.getAllDocuments = async (req, res) => {
  try {
    const tenantId = req.tenant_id;
    const result = await pool.query(
      `SELECT id, title, source_type, source_url, file_path, category, is_active, created_at, updated_at,
              (SELECT COUNT(*) FROM document_chunks WHERE document_id = documents.id) as chunk_count
       FROM documents
       WHERE tenant_id = $1 AND is_active = true
       ORDER BY created_at DESC`,
      [tenantId]
    );
    res.status(200).json({ success: true, documents: result.rows, total: result.rows.length });
  } catch (error) {
    logger.error('Get documents error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to get documents' });
  }
};

// ─── Upload PDF ───────────────────────────────
exports.uploadDocument = async (req, res) => {
  try {
    const file = req.file;
    const tenantId = req.tenant_id;
    if (!file) return res.status(400).json({ success: false, error: 'No file uploaded' });

    const { title, category = 'general' } = req.body;
    const docTitle = title || file.originalname;

    logger.info(`📄 Processing PDF: ${docTitle} (${file.size} bytes) for Tenant: ${tenantId}`);

    let text = '';
    try {
      const pdfParse = require('pdf-parse');
      const dataBuffer = require('fs').readFileSync(file.path);
      const pdfData = await pdfParse(dataBuffer);
      text = (pdfData.text || '').replace(/\s+/g, ' ').trim();
      logger.info(`✅ PDF text extracted: ${text.length} characters`);
    } catch (pdfError) {
      logger.error('PDF parsing failed:', pdfError.message);
      return res.status(400).json({ success: false, error: `PDF parsing failed: ${pdfError.message}` });
    }

    if (text.length < 100) {
      return res.status(400).json({
        success: false,
        error: 'This PDF appears to be a scanned image or has no extractable text. Please use a text-based PDF.'
      });
    }

    // ── Save document to DB ────────────────────────
    const docResult = await pool.query(
      `INSERT INTO documents (tenant_id, title, source_type, file_path, content, category, is_active, created_at, updated_at)
       VALUES ($1, $2, 'pdf', $3, $4, $5, true, NOW(), NOW()) RETURNING id`,
      [tenantId, docTitle, file.path, text.slice(0, 100000), category]
    );
    const docId = docResult.rows[0].id;
    logger.info(`✅ Document saved: ${docId}`);

    // ── Create chunks + embeddings ─────────────────
    const chunks = splitTextByTokens(text, 200, 40);
    logger.info(`📦 Creating ${chunks.length} chunks for document`);

    let embeddedChunks = 0;
    for (let i = 0; i < chunks.length; i += 5) {
      const batch = chunks.slice(i, i + 5);
      try {
        const embeddings = await generateEmbeddings(batch.map(c => c.content));
        for (let j = 0; j < batch.length; j++) {
          await pool.query(
            `INSERT INTO document_chunks (tenant_id, document_id, content, embedding, chunk_index, token_count)
             VALUES ($1, $2, $3, $4::vector, $5, $6)`,
            [tenantId, docId, batch[j].content, JSON.stringify(embeddings[j]), i + j, batch[j].tokenCount]
          );
          embeddedChunks++;
        }
      } catch (embeddingError) {
        logger.error(`Embedding batch ${i} failed: ${embeddingError.message}`);
      }
    }

    logger.info(`✅ PDF processed: ${embeddedChunks} chunks embedded`);

    res.status(201).json({
      success: true,
      message: `Document uploaded and indexed successfully (${embeddedChunks} chunks)`,
      document: { id: docId, title: docTitle, chunks: embeddedChunks }
    });
  } catch (error) {
    logger.error('Upload error:', error.message);
    res.status(500).json({ success: false, error: error.message || 'Failed to upload document' });
  }
};

// ─── Delete document ──────────────────────────
exports.deleteDocument = async (req, res) => {
  try {
    const { id } = req.params;
    const tenantId = req.tenant_id;
    await pool.query(`DELETE FROM document_chunks WHERE document_id = $1 AND tenant_id = $2`, [id, tenantId]);
    await pool.query(`UPDATE documents SET is_active = false, updated_at = NOW() WHERE id = $1 AND tenant_id = $2`, [id, tenantId]);
    res.status(200).json({ success: true, message: 'Document deleted' });
  } catch (error) {
    logger.error('Delete error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to delete document' });
  }
};

// ─── Start URL crawl ──────────────────────────
exports.startCrawl = async (req, res) => {
  try {
    const tenantId = req.tenant_id;
    let { url, max_pages = 20 } = req.body;

    if (!url) return res.status(400).json({ success: false, error: 'URL is required' });
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      return res.status(400).json({ success: false, error: 'URL must start with http:// or https://' });
    }

    const maxPages = Math.min(Math.max(1, max_pages), 200);

    const result = await pool.query(
      `INSERT INTO crawl_jobs (tenant_id, base_url, max_pages, status, created_at)
       VALUES ($1, $2, $3, 'pending', NOW()) RETURNING id`,
      [tenantId, url, maxPages]
    );
    const jobId = result.rows[0].id;

    // Run in background (assuming crawlerService is updated to handle tenant_id internally)
    setImmediate(() => runCrawl(jobId, tenantId));

    res.status(200).json({
      success: true,
      job_id: jobId,
      message: `Crawl started for ${url}`,
      max_pages: maxPages
    });
  } catch (error) {
    logger.error('Start crawl error:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to start crawl' });
  }
};

// ─── Get all crawl jobs ───────────────────────
exports.getCrawlJobs = async (req, res) => {
  try {
    const tenantId = req.tenant_id;
    const result = await pool.query(
      `SELECT id, base_url, status, max_pages, pages_crawled, 0 as pages_failed, created_at
       FROM crawl_jobs WHERE tenant_id = $1 ORDER BY created_at DESC`,
      [tenantId]
    );
    res.status(200).json({ success: true, jobs: result.rows, total: result.rows.length });
  } catch (error) {
    logger.error('Get crawl jobs error:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to get crawl jobs' });
  }
};

// ─── Get crawl job status ─────────────────────
exports.getCrawlJobStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const tenantId = req.tenant_id;
    const jobResult = await pool.query('SELECT * FROM crawl_jobs WHERE id = $1 AND tenant_id = $2', [id, tenantId]);
    if (!jobResult.rows[0]) return res.status(404).json({ success: false, error: 'Job not found' });

    res.status(200).json({ success: true, job: jobResult.rows[0], pages: [] });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to get job status' });
  }
};

// ─── Stop crawl job ───────────────────────────
exports.stopCrawlJob = async (req, res) => {
  try {
    const { id } = req.params;
    const tenantId = req.tenant_id;
    await pool.query(`UPDATE crawl_jobs SET status = 'cancelled' WHERE id = $1 AND tenant_id = $2`, [id, tenantId]);
    res.status(200).json({ success: true, message: 'Stop requested' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to stop crawl' });
  }
};

// ─── Delete crawl job ─────────────────────────
exports.deleteCrawlJob = async (req, res) => {
  try {
    const { id } = req.params;
    const tenantId = req.tenant_id;

    // We no longer have crawl_pages in the Phase 1 schema, only documents.
    // In a real system, we'd need to link documents to the job or just delete the job entry.
    await pool.query(`DELETE FROM crawl_jobs WHERE id = $1 AND tenant_id = $2`, [id, tenantId]);

    res.status(200).json({
      success: true,
      message: `Crawl job deleted.`
    });
  } catch (error) {
    logger.error('Delete crawl job error:', error.message);
    res.status(500).json({ success: false, error: error.message || 'Failed to delete crawl job' });
  }
};

// ─── Search KB ────────────────────────────────
exports.searchKnowledgeBase = async (req, res) => {
  try {
    const { q } = req.query;
    const tenantId = req.tenant_id;
    if (!q) return res.status(400).json({ success: false, error: 'Query is required' });

    const { searchSimilarChunks } = require('../services/embeddingService');
    const chunks = await searchSimilarChunks(q, 5, tenantId);
    res.status(200).json({ success: true, results: chunks });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Search failed' });
  }
};

// ─── Paste text ───────────────────────────────
exports.pasteText = async (req, res) => {
  try {
    const { title, content } = req.body;
    const tenantId = req.tenant_id;
    if (!title) return res.status(400).json({ success: false, error: 'Title is required' });
    if (!content || content.length < 50) return res.status(400).json({ success: false, error: 'Content must be at least 50 characters' });

    await storeDocumentWithEmbeddings(content, `text://${title.replace(/\s+/g, '_')}`, tenantId);
    res.status(201).json({ success: true, message: 'Text saved and indexed successfully' });
  } catch (error) {
    logger.error('Paste text error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to save text' });
  }
};

// ─── Get embedding stats ──────────────────────
exports.getEmbeddingStats = async (req, res) => {
  try {
    const tenantId = req.tenant_id;
    const docs = await pool.query(`SELECT COUNT(*) FROM documents WHERE is_active = true AND tenant_id = $1`, [tenantId]);
    const chunks = await pool.query(`SELECT COUNT(*) FROM document_chunks WHERE tenant_id = $1`, [tenantId]);
    res.status(200).json({
      success: true,
      totalDocuments: parseInt(docs.rows[0].count),
      totalChunks: parseInt(chunks.rows[0].count)
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to get stats' });
  }
};

exports.getCategories = async (req, res) => {
  try {
    const tenantId = req.tenant_id;
    const result = await pool.query(`SELECT DISTINCT category FROM documents WHERE is_active = true AND category IS NOT NULL AND tenant_id = $1`, [tenantId]);
    res.status(200).json({ success: true, categories: result.rows.map(r => r.category) });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to get categories' });
  }
};

exports.getDocument = async (req, res) => {
  try {
    const tenantId = req.tenant_id;
    const result = await pool.query(`SELECT * FROM documents WHERE id = $1 AND tenant_id = $2`, [req.params.id, tenantId]);
    if (!result.rows[0]) return res.status(404).json({ success: false, error: 'Not found' });
    res.status(200).json({ success: true, document: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to get document' });
  }
};

exports.createTextDocument = (req, res) => exports.pasteText(req, res);
exports.updateDocument = (req, res) => res.status(501).json({ success: false, error: 'Not implemented' });
exports.getDocumentChunks = async (req, res) => {
  try {
    const tenantId = req.tenant_id;
    const result = await pool.query(`SELECT id, content, chunk_index, token_count FROM document_chunks WHERE document_id = $1 AND tenant_id = $2`, [req.params.id, tenantId]);
    res.status(200).json({ success: true, chunks: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to get chunks' });
  }
};
exports.cancelCrawlJob = exports.stopCrawlJob;
exports.regenerateEmbeddings = (req, res) => res.status(501).json({ success: false, error: 'Not implemented' });
exports.getTags = (req, res) => res.status(501).json({ success: false, error: 'Not implemented', tags: [] });

module.exports = exports;
