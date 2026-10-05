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

async function storeDocumentWithEmbeddings(text, url, tenantId) {
  const filename = urlToFilename(url);

  // Remove existing doc for this URL and Tenant
  await pool.query(`
    DELETE FROM document_chunks WHERE document_id IN (
      SELECT id FROM documents WHERE source_url = $1 AND tenant_id = $2
    ) AND tenant_id = $2
  `, [url, tenantId]);
  await pool.query(`DELETE FROM documents WHERE source_url = $1 AND tenant_id = $2`, [url, tenantId]);

  // Insert new document
  const docResult = await pool.query(
    `INSERT INTO documents (tenant_id, title, type, source_url, content, created_at, updated_at)
     VALUES ($1, $2, 'scraped', $3, $4, NOW(), NOW()) RETURNING id`,
    [
      tenantId,
      filename.replace('crawl_', '').replace('.txt', '').replace(/_/g, ' ').slice(0, 100),
      url,
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
        const embeddings = await generateEmbeddings(batch.map(c => c.content));
        for (let j = 0; j < batch.length; j++) {
          await pool.query(
            `INSERT INTO document_chunks (tenant_id, document_id, content, embedding, chunk_index, token_count)
             VALUES ($1, $2, $3, $4::vector, $5, $6)`,
            [tenantId, docId, batch[j].content, JSON.stringify(embeddings[j]), i + j, batch[j].tokenCount]
          );
        }
      } catch (embeddingError) {
        logger.error(`Embedding batch ${i} failed:`, embeddingError);
      }
    }
  }
  return docId;
}

async function runCrawl(jobId, tenantId) {
  try {
    const jobResult = await pool.query('SELECT * FROM crawl_jobs WHERE id = $1 AND tenant_id = $2', [jobId, tenantId]);
    if (!jobResult.rows[0]) return;

    await pool.query(`UPDATE crawl_jobs SET status = 'crawling' WHERE id = $1 AND tenant_id = $2`, [jobId, tenantId]);

    const job = jobResult.rows[0];
    const startUrl = job.base_url;
    const maxPages = job.max_pages || 20;
    
    const visited = new Set();
    const toVisit = [startUrl];
    let pagesCrawled = 0;

    while (toVisit.length > 0 && visited.size < maxPages) {
      // Check if job was cancelled
      const check = await pool.query('SELECT status FROM crawl_jobs WHERE id = $1', [jobId]);
      if (check.rows[0]?.status === 'cancelled') {
        return;
      }

      const url = toVisit.shift();
      if (visited.has(url)) continue;
      visited.add(url);

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
          await storeDocumentWithEmbeddings(text, url, tenantId);
        }

        pagesCrawled++;
        await pool.query(`UPDATE crawl_jobs SET pages_crawled = $1 WHERE id = $2 AND tenant_id = $3`, [pagesCrawled, jobId, tenantId]);

      } catch (error) {
        logger.error(`Error crawling ${url}: ${error.message}`);
      }
    }

    await pool.query(`UPDATE crawl_jobs SET status = 'done' WHERE id = $1 AND tenant_id = $2`, [jobId, tenantId]);
    logger.info(`✅ Crawl completed for job ${jobId}`);

  } catch (error) {
    logger.error(`❌ Crawl failed for job ${jobId}:`, error);
    await pool.query(
      `UPDATE crawl_jobs SET status = 'failed' WHERE id = $1 AND tenant_id = $2`,
      [jobId, tenantId]
    );
  }
}

module.exports = { runCrawl, extractCleanText, storeDocumentWithEmbeddings };
