const pool = require('../config/database');

class Notification {
  static async findAll(agentId, options = {}) {
    try {
      // Handle both number and object params
      const limit = typeof options === 'object' ? (options.limit || 10) : (options || 10);

      const result = await pool.query(
        `SELECT 
          id,
          user_id,
          chat_id,
          message,
          type,
          is_read,
          created_at
        FROM notifications
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT $2`,
        [agentId, limit]
      );
      return result.rows;
    } catch (error) {
      console.error('Notification.findAll error:', error.message);
      throw error;
    }
  }

  static async markAsRead(notificationId, agentId) {
    try {
      const result = await pool.query(
        `UPDATE notifications 
        SET is_read = true
        WHERE id = $1 AND user_id = $2
        RETURNING *`,
        [notificationId, agentId]
      );
      return result.rows[0];
    } catch (error) {
      console.error('Notification.markAsRead error:', error.message);
      throw error;
    }
  }

  static async markAllAsRead(agentId) {
    try {
      const result = await pool.query(
        `UPDATE notifications 
        SET is_read = true
        WHERE user_id = $1 AND is_read = false
        RETURNING *`,
        [agentId]
      );
      return result.rows;
    } catch (error) {
      console.error('Notification.markAllAsRead error:', error.message);
      throw error;
    }
  }

  static async getUnreadCount(agentId) {
    try {
      const result = await pool.query(
        `SELECT COUNT(*) as count 
        FROM notifications 
        WHERE user_id = $1 AND is_read = false`,
        [agentId]
      );
      return parseInt(result.rows[0].count);
    } catch (error) {
      console.error('Notification.getUnreadCount error:', error.message);
      throw error;
    }
  }

  static async create({ userId, type, message, chatId = null }) {
    try {
      const result = await pool.query(
        `INSERT INTO notifications 
        (agent_id, chat_id, type, message, is_read, created_at)
        VALUES ($1, $2, $3, $4, false, NOW())
        RETURNING *`,
        [userId, chatId, type, message]
      );
      return result.rows[0];
    } catch (error) {
      console.error('Notification.create error:', error.message);
      throw error;
    }
  }

  static async delete(notificationId, agentId) {
    try {
      const result = await pool.query(
        `DELETE FROM notifications
        WHERE id = $1 AND agent_id = $2
        RETURNING *`,
        [notificationId, agentId]
      );
      return result.rows[0];
    } catch (error) {
      console.error('Notification.delete error:', error.message);
      throw error;
    }
  }
}

module.exports = Notification;
