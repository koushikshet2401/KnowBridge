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
    const result = await pool.query(
      `SELECT id, title, source_type, source_url, file_path, mime_type,
              category, is_active, created_at, updated_at, file_size,
              (SELECT COUNT(*) FROM document_chunks WHERE document_id = documents.id) as chunk_count
       FROM documents
       WHERE is_active = true
       ORDER BY created_at DESC`
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
    if (!file) return res.status(400).json({ success: false, error: 'No file uploaded' });

    const { title, category = 'general' } = req.body;
    const docTitle = title || file.originalname;

    logger.info(`📄 Processing PDF: ${docTitle} (${file.size} bytes)`);

    // ── Extract text from PDF ──────────────────────
// In uploadDocument, replace the PDF parsing section:
let text = '';
try {
  const pdfParse = require('pdf-parse');
  const dataBuffer = require('fs').readFileSync(file.path);
  const pdfData = await pdfParse(dataBuffer);
  text = (pdfData.text || '').replace(/\s+/g, ' ').trim();
  logger.info(`✅ PDF text extracted: ${text.length} characters`);
} catch (pdfError) {
  logger.error('PDF parsing failed:', pdfError.message);
  return res.status(400).json({
    success: false,
    error: `PDF parsing failed: ${pdfError.message}`
  });
}

// ✅ Check for scanned/image PDF
if (text.length < 100) {
  return res.status(400).json({
    success: false,
    error: 'This PDF appears to be a scanned image or has no extractable text. Please use a text-based PDF, or copy-paste the content using the "Paste Text" tab instead.'
  });
}

    // ── Save document to DB ────────────────────────
    const docResult = await pool.query(
      `INSERT INTO documents (title, source_type, file_path, mime_type, file_size,
              content, category, is_active, created_at, updated_at)
       VALUES ($1, 'pdf', $2, 'application/pdf', $3, $4, $5, true, NOW(), NOW()) RETURNING id`,
      [docTitle, file.path, file.size, text.slice(0, 100000), category]
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
            `INSERT INTO document_chunks (document_id, content, embedding, chunk_index, token_count)
             VALUES ($1, $2, $3::vector, $4, $5)`,
            [docId, batch[j].content, JSON.stringify(embeddings[j]), i + j, batch[j].tokenCount]
          );
          embeddedChunks++;
        }
      } catch (embeddingError) {
        console.error(`Embedding batch ${i} failed:`, embeddingError);
        logger.error(`Embedding batch ${i} failed: ${embeddingError.stack || embeddingError.message || embeddingError}`);
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
    await pool.query(`DELETE FROM document_chunks WHERE document_id = $1`, [id]);
    await pool.query(`UPDATE documents SET is_active = false, updated_at = NOW() WHERE id = $1`, [id]);
    res.status(200).json({ success: true, message: 'Document deleted' });
  } catch (error) {
    logger.error('Delete error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to delete document' });
  }
};

// ─── Start URL crawl ──────────────────────────
exports.startCrawl = async (req, res) => {
  try {
    let { url, max_pages = 20, skip_patterns = [] } = req.body;

    if (!url) return res.status(400).json({ success: false, error: 'URL is required' });
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      return res.status(400).json({ success: false, error: 'URL must start with http:// or https://' });
    }

    // Safely handle both string and array formats for backward compatibility
    if (typeof skip_patterns === 'string') {
      try {
        const parsed = JSON.parse(skip_patterns);
        skip_patterns = Array.isArray(parsed) ? parsed : [skip_patterns];
      } catch (e) {
        skip_patterns = skip_patterns.split(/[\n,]+/).map(s => s.trim()).filter(Boolean);
      }
    } else if (!Array.isArray(skip_patterns)) {
      skip_patterns = [];
    }

    const maxPages = Math.min(Math.max(1, max_pages), 200);

    const result = await pool.query(
      `INSERT INTO crawl_jobs (base_url, max_pages, status, skip_patterns, created_at)
       VALUES ($1, $2, 'pending', $3, NOW()) RETURNING id`,
      [url, maxPages, JSON.stringify(skip_patterns)]
    );
    const jobId = result.rows[0].id;

    // Run in background
    setImmediate(() => runCrawl(jobId));

    res.status(200).json({
      success: true,
      job_id: jobId,
      message: `Crawl started for ${url}`,
      max_pages: maxPages
    });
  } catch (error) {
  logger.error('Start crawl error:', error);
  console.error('CRAWL ERROR STACK:', error.stack);
  res.status(500).json({ success: false, error: error.message || 'Failed to start crawl' });
}
};

// ─── Get all crawl jobs ───────────────────────
exports.getCrawlJobs = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, base_url, status, max_pages, pages_found, pages_crawled,
              pages_failed, stop_requested, error, created_at, completed_at,
              skip_patterns
       FROM crawl_jobs ORDER BY created_at DESC`
    );
    res.status(200).json({ success: true, jobs: result.rows, total: result.rows.length });
  } catch (error) {
  logger.error('Get crawl jobs error:', error);
  console.error('CRAWL JOBS ERROR STACK:', error.stack);
  res.status(500).json({ success: false, error: error.message || 'Failed to get crawl jobs' });
}
};

// ─── Get crawl job status ─────────────────────
exports.getCrawlJobStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const jobResult = await pool.query('SELECT * FROM crawl_jobs WHERE id = $1', [id]);
    if (!jobResult.rows[0]) return res.status(404).json({ success: false, error: 'Job not found' });

    const pagesResult = await pool.query(
      'SELECT id, url, status, word_count, error, crawled_at FROM crawl_pages WHERE job_id = $1 ORDER BY crawled_at DESC',
      [id]
    );
    res.status(200).json({ success: true, job: jobResult.rows[0], pages: pagesResult.rows });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to get job status' });
  }
};

// ─── Stop crawl job ───────────────────────────
exports.stopCrawlJob = async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query(`UPDATE crawl_jobs SET stop_requested = true WHERE id = $1`, [id]);
    res.status(200).json({ success: true, message: 'Stop requested' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to stop crawl' });
  }
};

// ─── Delete crawl job ─────────────────────────
exports.deleteCrawlJob = async (req, res) => {
  try {
    const { id } = req.params;

    // Step 1: Check job exists
    const jobCheck = await pool.query(`SELECT id, base_url FROM crawl_jobs WHERE id = $1`, [id]);
    if (!jobCheck.rows[0]) {
      return res.status(404).json({ success: false, error: 'Crawl job not found' });
    }

    // Step 2: Get document IDs from crawl_pages via document_id column
    const byDocId = await pool.query(
      `SELECT document_id FROM crawl_pages WHERE job_id = $1 AND document_id IS NOT NULL`,
      [id]
    );
    const docIds = byDocId.rows.map(r => r.document_id).filter(Boolean);

    // Step 3: Also find documents by source_url (in case document_id wasn't saved)
    const byUrl = await pool.query(
      `SELECT DISTINCT url FROM crawl_pages WHERE job_id = $1`,
      [id]
    );
    const crawledUrls = byUrl.rows.map(r => r.url).filter(Boolean);

    logger.info(`🗑️ Deleting crawl job ${id} - ${docIds.length} by ID, ${crawledUrls.length} URLs to check`);

    // Step 4: Delete chunks by document_id
    if (docIds.length > 0) {
      await pool.query(
        `DELETE FROM document_chunks WHERE document_id = ANY($1::uuid[])`,
        [docIds]
      );
      await pool.query(
        `DELETE FROM documents WHERE id = ANY($1::uuid[])`,
        [docIds]
      );
      logger.info(`✅ Deleted ${docIds.length} documents by ID`);
    }

    // Step 5: Delete documents by source_url (catches any missed by Step 4)
    if (crawledUrls.length > 0) {
      // Get IDs of docs matched by URL first
      const urlDocResult = await pool.query(
        `SELECT id FROM documents WHERE source_url = ANY($1)`,
        [crawledUrls]
      );
      const urlDocIds = urlDocResult.rows.map(r => r.id);

      if (urlDocIds.length > 0) {
        await pool.query(
          `DELETE FROM document_chunks WHERE document_id = ANY($1::uuid[])`,
          [urlDocIds]
        );
        await pool.query(
          `DELETE FROM documents WHERE id = ANY($1::uuid[])`,
          [urlDocIds]
        );
        logger.info(`✅ Deleted ${urlDocIds.length} additional documents by URL`);
      }
    }

    // Step 6: Delete crawl pages and job
    await pool.query(`DELETE FROM crawl_pages WHERE job_id = $1`, [id]);
    await pool.query(`DELETE FROM crawl_jobs WHERE id = $1`, [id]);

    const totalRemoved = docIds.length + (crawledUrls.length > 0 ? crawledUrls.length : 0);
    logger.info(`✅ Crawl job ${id} fully deleted`);

    res.status(200).json({
      success: true,
      message: `Crawl job deleted. All related documents removed from Knowledge Base.`
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
    if (!q) return res.status(400).json({ success: false, error: 'Query is required' });

    const { searchSimilarChunks } = require('../services/embeddingService');
    const chunks = await searchSimilarChunks(q, 5);
    res.status(200).json({ success: true, results: chunks });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Search failed' });
  }
};

// ─── Paste text ───────────────────────────────
exports.pasteText = async (req, res) => {
  try {
    const { title, content } = req.body;
    if (!title) return res.status(400).json({ success: false, error: 'Title is required' });
    if (!content || content.length < 50) return res.status(400).json({ success: false, error: 'Content must be at least 50 characters' });

    await storeDocumentWithEmbeddings(content, `text://${title.replace(/\s+/g, '_')}`);
    res.status(201).json({ success: true, message: 'Text saved and indexed successfully' });
  } catch (error) {
    logger.error('Paste text error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to save text' });
  }
};

// ─── Get embedding stats ──────────────────────
exports.getEmbeddingStats = async (req, res) => {
  try {
    const docs = await pool.query(`SELECT COUNT(*) FROM documents WHERE is_active = true`);
    const chunks = await pool.query(`SELECT COUNT(*) FROM document_chunks`);
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
    const result = await pool.query(`SELECT DISTINCT category FROM documents WHERE is_active = true AND category IS NOT NULL`);
    res.status(200).json({ success: true, categories: result.rows.map(r => r.category) });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to get categories' });
  }
};

exports.getDocument = async (req, res) => {
  try {
    const result = await pool.query(`SELECT * FROM documents WHERE id = $1`, [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ success: false, error: 'Not found' });
    res.status(200).json({ success: true, document: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to get document' });
  }
};

exports.createTextDocument = (req, res) => exports.pasteText(req, res);
exports.updateDocument = (req, res) => res.status(200).json({ success: true, message: 'Not implemented' });
exports.getDocumentChunks = async (req, res) => {
  try {
    const result = await pool.query(`SELECT id, content, chunk_index, token_count FROM document_chunks WHERE document_id = $1`, [req.params.id]);
    res.status(200).json({ success: true, chunks: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to get chunks' });
  }
};
exports.cancelCrawlJob = exports.stopCrawlJob;
exports.regenerateEmbeddings = (req, res) => res.status(200).json({ success: true, message: 'Not implemented' });
exports.getTags = (req, res) => res.status(200).json({ success: true, tags: [] });