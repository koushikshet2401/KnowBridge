const pool = require('../config/database');
const { v4: uuidv4 } = require('uuid');

class Feedback {
  /**
   * Create feedback
   */
  static async create({ messageId, chatId, userId, rating, comment = null, actionTaken = null, metadata = {} }) {
    const id = uuidv4();
    
    const result = await pool.query(
      `INSERT INTO feedback (id, message_id, chat_id, user_id, rating, comment, action_taken, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [id, messageId, chatId, userId, rating, comment, actionTaken, JSON.stringify(metadata)]
    );
    
    return result.rows[0];
  }

  /**
   * Find feedback by ID
   */
  static async findById(id) {
    const result = await pool.query(
      'SELECT * FROM feedback WHERE id = $1',
      [id]
    );
    return result.rows[0] || null;
  }

  /**
   * Find feedback by message ID
   */
  static async findByMessageId(messageId) {
    const result = await pool.query(
      'SELECT * FROM feedback WHERE message_id = $1',
      [messageId]
    );
    return result.rows[0] || null;
  }

  /**
   * Get all feedback for a chat
   */
  static async getChatFeedback(chatId) {
    const result = await pool.query(
      `SELECT f.*, m.content as message_content, m.sender_type
       FROM feedback f
       LEFT JOIN messages m ON f.message_id = m.id
       WHERE f.chat_id = $1
       ORDER BY f.created_at DESC`,
      [chatId]
    );
    return result.rows;
  }

  /**
   * Get feedback statistics
   */
  static async getStats({ startDate, endDate } = {}) {
    let dateCondition = '';
    const params = [];
    
    if (startDate && endDate) {
      dateCondition = 'WHERE created_at >= $1 AND created_at <= $2';
      params.push(startDate, endDate);
    }

    const result = await pool.query(`
      SELECT 
        COUNT(*) as total_feedback,
        COUNT(*) FILTER (WHERE rating = 'positive') as positive_count,
        COUNT(*) FILTER (WHERE rating = 'negative') as negative_count,
        ROUND(
          (COUNT(*) FILTER (WHERE rating = 'positive')::decimal / 
           NULLIF(COUNT(*), 0) * 100), 2
        ) as positive_percentage
      FROM feedback
      ${dateCondition}
    `, params);
    
    return result.rows[0];
  }

  /**
   * Get recent negative feedback (for monitoring)
   */
  static async getRecentNegative({ limit = 10 }) {
    const result = await pool.query(
      `SELECT f.*, 
              c.id as chat_id,
              u.name as user_name,
              m.content as message_content
       FROM feedback f
       LEFT JOIN chats c ON f.chat_id = c.id
       LEFT JOIN users u ON f.user_id = u.id
       LEFT JOIN messages m ON f.message_id = m.id
       WHERE f.rating = 'negative'
       ORDER BY f.created_at DESC
       LIMIT $1`,
      [limit]
    );
    return result.rows;
  }

  /**
   * Update feedback action taken
   */
  static async updateAction(id, actionTaken) {
    const result = await pool.query(
      `UPDATE feedback 
       SET action_taken = $1
       WHERE id = $2
       RETURNING *`,
      [actionTaken, id]
    );
    return result.rows[0] || null;
  }

  /**
   * Get feedback by rating
   */
  static async getByRating(rating, { page = 1, limit = 20 }) {
    const offset = (page - 1) * limit;
    
    const result = await pool.query(
      `SELECT f.*,
              u.name as user_name,
              m.content as message_content
       FROM feedback f
       LEFT JOIN users u ON f.user_id = u.id
       LEFT JOIN messages m ON f.message_id = m.id
       WHERE f.rating = $1
       ORDER BY f.created_at DESC
       LIMIT $2 OFFSET $3`,
      [rating, limit, offset]
    );

    const countResult = await pool.query(
      'SELECT COUNT(*) FROM feedback WHERE rating = $1',
      [rating]
    );

    return {
      feedback: result.rows,
      total: parseInt(countResult.rows[0].count),
      page,
      totalPages: Math.ceil(countResult.rows[0].count / limit)
    };
  }

  /**
   * Delete feedback
   */
  static async delete(id) {
    const result = await pool.query(
      'DELETE FROM feedback WHERE id = $1 RETURNING *',
      [id]
    );
    return result.rows[0] || null;
  }

  /**
   * Get feedback trends (daily counts)
   */
  static async getTrends({ days = 7 }) {
    const result = await pool.query(`
      SELECT 
        DATE(created_at) as date,
        COUNT(*) FILTER (WHERE rating = 'positive') as positive,
        COUNT(*) FILTER (WHERE rating = 'negative') as negative,
        COUNT(*) as total
      FROM feedback
      WHERE created_at >= CURRENT_DATE - INTERVAL '${days} days'
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `);
    return result.rows;
  }
}

module.exports = Feedback;
