const pool = require('../config/database');
const { v4: uuidv4 } = require('uuid');

class Message {
  /**
   * Create new message
   */
  static async create({
    chatId,
    senderType,
    senderId,
    content,
    contentType = 'text',
    attachments = [],
    aiModel = null,
    aiConfidence = null,
    kbSources = [],
    metadata = {},
    isInternal = false,
    // NEW: Agent attribution fields
    agentId = null,
    agentName = null
  }) {
    const id = uuidv4();
    
    const result = await pool.query(
      `INSERT INTO messages (
        id, chat_id, sender_type, sender_id, content, content_type,
        attachments, ai_model, ai_confidence, kb_sources, metadata, is_internal,
        agent_id, agent_name
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *`,
      [
        id, chatId, senderType, senderId, content, contentType,
        JSON.stringify(attachments), aiModel, aiConfidence,
        JSON.stringify(kbSources), JSON.stringify(metadata), isInternal,
        agentId, agentName
      ]
    );
    
    // Update chat's updated_at timestamp
    await pool.query(
      'UPDATE chats SET updated_at = CURRENT_TIMESTAMP WHERE id = $1',
      [chatId]
    );
    
    return result.rows[0];
  }

  /**
   * Get message by ID
   */
  static async findById(id) {
    const result = await pool.query(
      'SELECT * FROM messages WHERE id = $1',
      [id]
    );
    return result.rows[0] || null;
  }

  /**
   * Get all messages in a chat
   */
  static async getChatMessages(chatId, { includeInternal = false, limit = 100 }) {
    let internalCondition = includeInternal ? '' : 'AND is_internal = false';
    
    const result = await pool.query(
      `SELECT * FROM messages 
       WHERE chat_id = $1 ${internalCondition}
       ORDER BY created_at ASC
       LIMIT $2`,
      [chatId, limit]
    );
    
    return result.rows;
  }

  /**
   * Get latest message in chat
   */
  static async getLatestMessage(chatId) {
    const result = await pool.query(
      `SELECT * FROM messages 
       WHERE chat_id = $1 AND is_internal = false
       ORDER BY created_at DESC 
       LIMIT 1`,
      [chatId]
    );
    return result.rows[0] || null;
  }

  /**
   * Get AI messages in a chat (for context)
   */
  static async getAIMessages(chatId, { limit = 10 }) {
    const result = await pool.query(
      `SELECT * FROM messages 
       WHERE chat_id = $1 AND sender_type = 'ai'
       ORDER BY created_at DESC 
       LIMIT $2`,
      [chatId, limit]
    );
    return result.rows.reverse();
  }

  /**
   * Update message
   */
  static async update(id, data) {
    const fields = [];
    const values = [];
    let paramCount = 1;

    if (data.content !== undefined) {
      fields.push(`content = $${paramCount++}`);
      values.push(data.content);
    }
    if (data.metadata !== undefined) {
      fields.push(`metadata = $${paramCount++}`);
      values.push(JSON.stringify(data.metadata));
    }
    // NEW: Allow updating agent info
    if (data.agentId !== undefined) {
      fields.push(`agent_id = $${paramCount++}`);
      values.push(data.agentId);
    }
    if (data.agentName !== undefined) {
      fields.push(`agent_name = $${paramCount++}`);
      values.push(data.agentName);
    }

    if (fields.length === 0) {
      return await this.findById(id);
    }

    values.push(id);
    const result = await pool.query(
      `UPDATE messages SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
       WHERE id = $${paramCount}
       RETURNING *`,
      values
    );

    return result.rows[0] || null;
  }

  /**
   * Delete message
   */
  static async delete(id) {
    const result = await pool.query(
      'DELETE FROM messages WHERE id = $1 RETURNING *',
      [id]
    );
    return result.rows[0] || null;
  }

  /**
   * Get message count for chat
   */
  static async getMessageCount(chatId) {
    const result = await pool.query(
      'SELECT COUNT(*) FROM messages WHERE chat_id = $1 AND is_internal = false',
      [chatId]
    );
    return parseInt(result.rows[0].count);
  }

  /**
   * Get conversation context (for AI)
   */
  static async getConversationContext(chatId, { limit = 10 }) {
    const result = await pool.query(
      `SELECT sender_type, content, created_at
       FROM messages 
       WHERE chat_id = $1 AND is_internal = false
       ORDER BY created_at DESC 
       LIMIT $2`,
      [chatId, limit]
    );
    
    // Return in chronological order for AI context
    return result.rows.reverse().map(msg => ({
      role: msg.sender_type === 'user' ? 'user' : 'assistant',
      content: msg.content,
      timestamp: msg.created_at
    }));
  }

  /**
   * Search messages
   */
  static async search({ chatId, searchText, limit = 50 }) {
    const result = await pool.query(
      `SELECT * FROM messages 
       WHERE chat_id = $1 
       AND content ILIKE $2
       AND is_internal = false
       ORDER BY created_at DESC 
       LIMIT $3`,
      [chatId, `%${searchText}%`, limit]
    );
    return result.rows;
  }

  /**
   * NEW: Get messages with agent attribution
   */
  static async getChatMessagesWithAgents(chatId, { includeInternal = false, limit = 100 }) {
    let internalCondition = includeInternal ? '' : 'AND m.is_internal = false';
    
    const result = await pool.query(
      `SELECT m.*,
              COALESCE(m.agent_name, a.name) as agent_name
       FROM messages m
       LEFT JOIN users a ON m.agent_id = a.id
       WHERE m.chat_id = $1 ${internalCondition}
       ORDER BY m.created_at ASC
       LIMIT $2`,
      [chatId, limit]
    );
    
    return result.rows;
  }
}

module.exports = Message;
