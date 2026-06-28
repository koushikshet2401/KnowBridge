const axios = require('axios');
const cheerio = require('cheerio');
const { URL } = require('url');
const pool = require('../config/database');
const logger = require('../utils/logger');
const { generateEmbeddings, splitTextByTokens } = require('./embeddingService');

const SKIP_TAGS = ['script','style','noscript','header','footer','nav','aside','form','iframe','svg'];
const SKIP_EXTENSIONS = ['.jpg','.jpeg','.png','.gif','.svg','.webp','.pdf','.zip','.css','.js','.xml','.json','.ico'];

function extractCleanText(html) {
  const $ = cheerio.load(html);
  SKIP_TAGS.forEach(tag => $(tag).remove());
  return $.text().replace(/\s+/g, ' ').trim();
}

function extractLinks(html, baseUrl, startUrl) {
  const $ = cheerio.load(html);
  const links = new Set();

  let parsedStart, parsedBase;
  try {
    parsedStart = new URL(startUrl);
    parsedBase = new URL(baseUrl);
  } catch (e) { return []; }

  const startPath = parsedStart.pathname.replace(/\/$/, '');

  $('a[href]').each((_, el) => {
    const href = $(el).attr('href')?.trim();
    if (!href || href.startsWith('#') || href.startsWith('mailto:') ||
        href.startsWith('tel:') || href.startsWith('javascript:')) return;

    try {
      const fullUrl = new URL(href, baseUrl).href.split('#')[0];
      const parsed = new URL(fullUrl);
      if (SKIP_EXTENSIONS.some(ext => parsed.pathname.toLowerCase().endsWith(ext))) return;
      if (parsed.hostname !== parsedBase.hostname) return;
      if (!['http:', 'https:'].includes(parsed.protocol)) return;
      if (startPath && !parsed.pathname.startsWith(startPath)) return;
      links.add(fullUrl);
    } catch (e) {}
  });

  return [...links];
}

function urlToFilename(url) {
  try {
    const parsed = new URL(url);
    const path = (parsed.hostname + parsed.pathname).replace(/[^\w-]/g, '_').slice(0, 100);
    return `crawl_${path}.txt`;
  } catch (e) {
    return `crawl_${Date.now()}.txt`;
  }
}

async function storeDocumentWithEmbeddings(text, url) {
  const filename = urlToFilename(url);

  // Remove existing doc for this URL
  await pool.query(`
    DELETE FROM document_chunks WHERE document_id IN (
      SELECT id FROM documents WHERE source_url = $1
    )`, [url]);
  await pool.query(`DELETE FROM documents WHERE source_url = $1`, [url]);

  // Insert new document
// REPLACE WITH:
const docResult = await pool.query(
  `INSERT INTO documents (title, source_type, source_url, file_path, file_size, content, is_active, created_at, updated_at)
   VALUES ($1, 'web', $2, $3, $4, $5, true, NOW(), NOW()) RETURNING id`,
  [
    filename.replace('crawl_', '').replace('.txt', '').replace(/_/g, ' ').slice(0, 100),
    url,
    filename,
    Buffer.byteLength(text, 'utf8'),
    text.slice(0, 100000)  // Store first 100KB of content
  ]
);
  const docId = docResult.rows[0].id;

  // Create chunks and store embeddings
  const chunks = splitTextByTokens(text, 200, 40);
  if (chunks.length > 0) {
    for (let i = 0; i < chunks.length; i += 5) {
      const batch = chunks.slice(i, i + 5);
      try {
        const batch = chunks.slice(i, i + 5);
        const embeddings = await generateEmbeddings(batch.map(c => c.content));
        for (let j = 0; j < batch.length; j++) {
          await pool.query(
            `INSERT INTO document_chunks (document_id, content, embedding, chunk_index, token_count)
             VALUES ($1, $2, $3::vector, $4, $5)`,
            [docId, batch[j].content, JSON.stringify(embeddings[j]), i + j, batch[j].tokenCount]
          );
        }
      } catch (embeddingError) {
        console.error(`Embedding batch ${i} failed:`, embeddingError);
        logger.error(`Embedding batch ${i} failed:`, embeddingError);
      }
    }
  }
  return docId;
}

async function runCrawl(jobId) {
  try {
    const jobResult = await pool.query('SELECT * FROM crawl_jobs WHERE id = $1', [jobId]);
    if (!jobResult.rows[0]) return;

    await pool.query(`UPDATE crawl_jobs SET status = 'crawling', stop_requested = false WHERE id = $1`, [jobId]);

    const job = jobResult.rows[0];
    const startUrl = job.base_url;
    const maxPages = job.max_pages || 20;
    
    // Safely parse skip_patterns (handles old string formats, JSON arrays, and raw strings)
    let skipPatterns = [];
    if (job.skip_patterns) {
      if (Array.isArray(job.skip_patterns)) {
        skipPatterns = job.skip_patterns;
      } else if (typeof job.skip_patterns === 'string') {
        try {
          const parsed = JSON.parse(job.skip_patterns);
          if (Array.isArray(parsed)) {
            skipPatterns = parsed;
          } else if (typeof parsed === 'string') {
            skipPatterns = parsed.split(/[\n,]+/).map(s => s.trim()).filter(Boolean);
          }
        } catch (e) {
          skipPatterns = job.skip_patterns.split(/[\n,]+/).map(s => s.trim()).filter(Boolean);
        }
      }
    }

    const visited = new Set();
    const toVisit = [startUrl];

    while (toVisit.length > 0 && visited.size < maxPages) {
      // Check stop flag
      const check = await pool.query('SELECT stop_requested FROM crawl_jobs WHERE id = $1', [jobId]);
      if (check.rows[0]?.stop_requested) {
        await pool.query(`UPDATE crawl_jobs SET status = 'stopped', completed_at = NOW() WHERE id = $1`, [jobId]);
        return;
      }

      const url = toVisit.shift();
      if (visited.has(url)) continue;
      visited.add(url);

      // Skip patterns
      const shouldSkip = skipPatterns.some(pattern => {
        const regex = new RegExp(pattern.replace(/\*/g, '.*'));
        return regex.test(url);
      });
      if (shouldSkip) continue;

      const pageResult = await pool.query(
        `INSERT INTO crawl_pages (job_id, url, status) VALUES ($1, $2, 'crawling') RETURNING id`,
        [jobId, url]
      );
      const pageId = pageResult.rows[0].id;

      try {
        const response = await axios.get(url, {
          timeout: 8000,
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; KnowledgeBot/1.0)' }
        });

        const html = response.data;

        if (visited.size < maxPages) {
          const links = extractLinks(html, url, startUrl);
          links.forEach(link => {
            if (!visited.has(link) && !toVisit.includes(link)) toVisit.push(link);
          });
        }

        const text = extractCleanText(html);
        if (text.length > 100) {
          await storeDocumentWithEmbeddings(text, url);
        }

        await pool.query(
          `UPDATE crawl_pages SET status = 'done', word_count = $1, crawled_at = NOW() WHERE id = $2`,
          [text.split(' ').length, pageId]
        );
        await pool.query(`UPDATE crawl_jobs SET pages_crawled = pages_crawled + 1 WHERE id = $1`, [jobId]);

      } catch (error) {
        await pool.query(
          `UPDATE crawl_pages SET status = 'failed', error = $1, crawled_at = NOW() WHERE id = $2`,
          [error.message?.slice(0, 200) || 'Unknown error', pageId]
        );
        await pool.query(`UPDATE crawl_jobs SET pages_failed = pages_failed + 1 WHERE id = $1`, [jobId]);
      }

      await pool.query(`UPDATE crawl_jobs SET pages_found = pages_crawled + pages_failed WHERE id = $1`, [jobId]);
    }

    await pool.query(`UPDATE crawl_jobs SET status = 'done', completed_at = NOW() WHERE id = $1`, [jobId]);
    logger.info(`✅ Crawl completed for job ${jobId}`);

  } catch (error) {
    logger.error(`❌ Crawl failed for job ${jobId}:`, error);
    await pool.query(
      `UPDATE crawl_jobs SET status = 'failed', error = $1, completed_at = NOW() WHERE id = $2`,
      [error.message?.slice(0, 300), jobId]
    );
  }
}

module.exports = { runCrawl, extractCleanText, storeDocumentWithEmbeddings };