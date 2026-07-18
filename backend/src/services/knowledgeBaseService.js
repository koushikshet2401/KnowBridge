const axios = require('axios');
const cheerio = require('cheerio');
const logger = require('../utils/logger');

class KnowledgeBaseService {
  static KB_URL = 'https://www.KnowBridge.com/knowledgebase';

  /**
   * Fetch and parse knowledge base articles
   */
  static async fetchKnowledgeBase() {
    try {
      const response = await axios.get(this.KB_URL, {
        timeout: 10000,
        headers: {
          'User-Agent': 'KnowBridge-Support-Bot/1.0'
        }
      });

      const $ = cheerio.load(response.data);
      const articles = [];

      // Parse articles (adjust selectors based on actual HTML structure)
      $('.kb-article, .knowledge-article, article').each((i, elem) => {
        const title = $(elem).find('h1, h2, h3, .title').first().text().trim();
        const content = $(elem).find('p, .content').text().trim();
        const link = $(elem).find('a').first().attr('href');

        if (title && content) {
          articles.push({
            title,
            content: content.substring(0, 500), // First 500 chars
            url: link ? `https://www.KnowBridge.com${link}` : null
          });
        }
      });

      logger.info(`Fetched ${articles.length} KB articles`);
      return articles;

    } catch (error) {
      logger.error('Failed to fetch knowledge base:', error.message);
      return [];
    }
  }

  /**
   * Search knowledge base for relevant content
   */
  static async searchKB(query) {
    const articles = await this.fetchKnowledgeBase();
    
    // Simple keyword matching (can be improved with vector search)
    const keywords = query.toLowerCase().split(' ');
    
    const scored = articles.map(article => {
      let score = 0;
      keywords.forEach(keyword => {
        if (article.title.toLowerCase().includes(keyword)) score += 3;
        if (article.content.toLowerCase().includes(keyword)) score += 1;
      });
      return { ...article, score };
    });

    return scored
      .filter(a => a.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3); // Top 3 results
  }
}

module.exports = KnowledgeBaseService;
