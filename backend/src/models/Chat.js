const pool = require('../config/database');
const { v4: uuidv4 } = require('uuid');

class Chat {
  /**
   * Create new chat session with tenant context
   */
  static async create({ tenantId, userId, channel = 'web', priority = 'normal', metadata = {} }) {
    if (!tenantId) throw new Error('tenantId is required');
    const id = uuidv4();
    
    const result = await pool.query(
      `INSERT INTO chats (id, tenant_id, user_id, channel, priority, status, metadata)
       VALUES ($1, $2, $3, $4, $5, 'active', $6)
       RETURNING *`,
      [id, tenantId, userId, channel, priority, JSON.stringify(metadata)]
    );
    
    return result.rows[0];
  }

  /**
   * Find chat by ID
   */
  static async findById(id) {
    const result = await pool.query(
      `SELECT c.*, 
              u.name as user_name, 
              u.email as user_email,
              a.name as agent_name,
              a.email as agent_email
       FROM chats c
       LEFT JOIN users u ON c.user_id = u.id
       LEFT JOIN agents a ON c.assigned_agent_id = a.id
       WHERE c.id = $1`,
       [id]
    );
    return result.rows[0] || null;
  }

  /**
   * Get user's active chat under a specific tenant
   */
  static async getUserActiveChat(tenantId, userId) {
    const result = await pool.query(
      `SELECT * FROM chats 
       WHERE tenant_id = $1 AND user_id = $2 AND status = 'active'
       ORDER BY created_at DESC 
       LIMIT 1`,
      [tenantId, userId]
    );
    return result.rows[0] || null;
  }

  /**
   * Update chat status
   */
  static async updateStatus(id, status) {
    const result = await pool.query(
      `UPDATE chats 
       SET status = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING *`,
      [status, id]
    );
    return result.rows[0] || null;
  }

  /**
   * Assign chat to agent
   */
  static async assignToAgent(chatId, agentId) {
    const result = await pool.query(
      `UPDATE chats 
       SET assigned_agent_id = $1,
           status = CASE WHEN status = 'pending' THEN 'active' ELSE status END,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING *`,
      [agentId, chatId]
    );
    return result.rows[0] || null;
  }

  /**
   * Escalate chat to human
   */
  static async escalate(chatId, reason) {
    const result = await pool.query(
      `UPDATE chats 
       SET status = 'pending',
           escalated_at = CURRENT_TIMESTAMP,
           metadata = jsonb_set(metadata, '{escalation_reason}', $1::jsonb),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING *`,
      [JSON.stringify(reason), chatId]
    );
    return result.rows[0] || null;
  }

  /**
   * Close chat
   */
  static async close(chatId, rating = null, ratingComment = null) {
    const result = await pool.query(
      `UPDATE chats 
       SET status = 'closed',
           closed_at = CURRENT_TIMESTAMP,
           resolved_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
      [chatId]
    );
    return result.rows[0] || null;
  }

  /**
   * Reopen chat
   */
  static async reopen(chatId) {
    const result = await pool.query(
      `UPDATE chats 
       SET status = 'active',
           closed_at = NULL,
           resolved_at = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
      [chatId]
    );
    return result.rows[0] || null;
  }

  /**
   * Get all chats (optionally filtered by tenantId)
   */
  static async getAll({ tenantId, status, page = 1, limit = 20, search = '' }) {
    if (!tenantId) throw new Error('tenantId is required for getAll');
    const offset = (page - 1) * limit;
    const conditions = ['c.tenant_id = $1'];
    const params = [tenantId];
    let paramCount = 2;

    if (status) {
      conditions.push(`c.status = $${paramCount++}`);
      params.push(status);
    }

    if (search) {
      conditions.push(`(u.name ILIKE $${paramCount} OR u.email ILIKE $${paramCount})`);
      params.push(`%${search}%`);
      paramCount++;
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;
    params.push(limit, offset);

    const result = await pool.query(
      `SELECT c.*, 
              u.name as user_name, 
              u.email as user_email,
              a.name as agent_name,
              a.email as agent_email,
              (SELECT content FROM messages WHERE chat_id = c.id ORDER BY created_at DESC LIMIT 1) as latest_message
       FROM chats c
       LEFT JOIN users u ON c.user_id = u.id
       LEFT JOIN agents a ON c.assigned_agent_id = a.id
       ${whereClause}
       ORDER BY c.updated_at DESC 
       LIMIT $${paramCount} OFFSET $${paramCount + 1}`,
      params
    );

    const countParams = params.slice(0, -2);
    const countResult = await pool.query(
      `SELECT COUNT(*) 
       FROM chats c
       LEFT JOIN users u ON c.user_id = u.id
       ${whereClause}`,
      countParams
    );

    return {
      chats: result.rows,
      total: parseInt(countResult.rows[0].count),
      page,
      totalPages: Math.ceil(countResult.rows[0].count / limit)
    };
  }
}

module.exports = Chat;
