const pool = require('../config/database');
const { v4: uuidv4 } = require('uuid');

class Chat {
  /**
   * Create new chat session with client domain tenant context
   */
  static async create({ clientDomain, userId, channel = 'web', priority = 'normal', metadata = {} }) {
    const id = uuidv4();
    
    const result = await pool.query(
      `INSERT INTO chats (id, client_domain, user_id, channel, priority, status, metadata)
       VALUES ($1, $2, $3, $4, $5, 'active', $6)
       RETURNING *`,
      [id, clientDomain, userId, channel, priority, JSON.stringify(metadata)]
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
              COALESCE(c.agent_name, a.name) as agent_name,
              a.email as agent_email
       FROM chats c
       LEFT JOIN users u ON c.user_id = u.id
       LEFT JOIN users a ON c.assigned_to = a.id
       WHERE c.id = $1`,
       [id]
    );
    return result.rows[0] || null;
  }

  /**
   * Get user's active chat under a specific client domain (isolated)
   */
  static async getUserActiveChat(clientDomain, userId) {
    const result = await pool.query(
      `SELECT * FROM chats 
       WHERE client_domain = $1 AND user_id = $2 AND status = 'active'
       ORDER BY created_at DESC 
       LIMIT 1`,
      [clientDomain, userId]
    );
    return result.rows[0] || null;
  }

  /**
   * Get user's chat history under a specific client domain
   */
  static async getUserChats(clientDomain, externalId, { page = 1, limit = 10 }) {
    const offset = (page - 1) * limit;
    
    const result = await pool.query(
      `SELECT c.*,
              (SELECT content FROM messages WHERE chat_id = c.id ORDER BY created_at DESC LIMIT 1) as latest_message
       FROM chats c
       JOIN users u ON c.user_id = u.id
       WHERE c.client_domain = $1 AND u.external_id = $2
       ORDER BY c.updated_at DESC 
       LIMIT $3 OFFSET $4`,
      [clientDomain, String(externalId), limit, offset]
    );

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM chats c
       JOIN users u ON c.user_id = u.id
       WHERE c.client_domain = $1 AND u.external_id = $2`,
      [clientDomain, String(externalId)]
    );

    return {
      chats: result.rows,
      total: parseInt(countResult.rows[0].count),
      page,
      totalPages: Math.ceil(countResult.rows[0].count / limit)
    };
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
  static async assignToAgent(chatId, agentId, agentName = null) {
    let name = agentName;
    if (!name && agentId) {
      const agentResult = await pool.query(
        'SELECT name FROM users WHERE id = $1',
        [agentId]
      );
      name = agentResult.rows[0]?.name || null;
    }

    const result = await pool.query(
      `UPDATE chats 
       SET assigned_to = $1,
           agent_name = $2,
           assigned_at = CURRENT_TIMESTAMP,
           status = CASE WHEN status = 'pending' THEN 'active' ELSE status END,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3
       RETURNING *`,
      [agentId, name, chatId]
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
           escalation_reason = $1,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING *`,
      [reason, chatId]
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
           rating = $1,
           rating_comment = $2,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3
       RETURNING *`,
      [rating, ratingComment, chatId]
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
   * Get all chats (Centralized Dashboard - optionally filtered by clientDomain)
   */
  static async getAll({ clientDomain = null, status, page = 1, limit = 20, search = '' }) {
    const offset = (page - 1) * limit;
    const conditions = [];
    const params = [];
    let paramCount = 1;

    if (clientDomain) {
      conditions.push(`c.client_domain = $${paramCount++}`);
      params.push(clientDomain);
    }

    if (status) {
      conditions.push(`c.status = $${paramCount++}`);
      params.push(status);
    }

    if (search) {
      conditions.push(`(u.name ILIKE $${paramCount} OR u.email ILIKE $${paramCount})`);
      params.push(`%${search}%`);
      paramCount++;
    }

    const whereClause = conditions.length > 0 
      ? `WHERE ${conditions.join(' AND ')}` 
      : '';

    params.push(limit, offset);

    const result = await pool.query(
      `SELECT c.*, 
              u.name as user_name, 
              u.email as user_email,
              COALESCE(c.agent_name, a.name) as agent_name,
              a.email as agent_email,
              (SELECT content FROM messages WHERE chat_id = c.id ORDER BY created_at DESC LIMIT 1) as latest_message
       FROM chats c
       LEFT JOIN users u ON c.user_id = u.id
       LEFT JOIN users a ON c.assigned_to = a.id
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

  /**
   * Get pending chats (optionally filtered by clientDomain)
   */
  static async getPending({ clientDomain = null, limit = 20 }) {
    const conditions = ["c.status = 'pending'", "c.assigned_to IS NULL"];
    const params = [];
    let paramCount = 1;

    if (clientDomain) {
      conditions.push(`c.client_domain = $${paramCount++}`);
      params.push(clientDomain);
    }

    params.push(limit);

    const result = await pool.query(
      `SELECT c.*, 
              u.name as user_name, 
              u.email as user_email
       FROM chats c
       LEFT JOIN users u ON c.user_id = u.id
       WHERE ${conditions.join(' AND ')}
       ORDER BY c.escalated_at ASC
       LIMIT $${paramCount}`,
      params
    );
    return result.rows;
  }

  /**
   * Get agent's assigned chats (optionally filtered by clientDomain)
   */
  static async getAgentChats(agentId, { clientDomain = null, status = null }) {
    const conditions = ["c.assigned_to = $1"];
    const params = [agentId];
    let paramCount = 2;

    if (clientDomain) {
      conditions.push(`c.client_domain = $${paramCount++}`);
      params.push(clientDomain);
    }

    if (status) {
      conditions.push(`c.status = $${paramCount++}`);
      params.push(status);
    }

    const result = await pool.query(
      `SELECT c.*, 
              u.name as user_name, 
              u.email as user_email
       FROM chats c
       LEFT JOIN users u ON c.user_id = u.id
       WHERE ${conditions.join(' AND ')}
       ORDER BY c.updated_at DESC`,
      params
    );
    return result.rows;
  }

  /**
   * Get my assigned active/pending chats (optionally filtered by clientDomain)
   */
  static async getMyChats(agentId, { clientDomain = null } = {}) {
    const conditions = ["c.assigned_to = $1", "c.status IN ('active', 'pending')"];
    const params = [agentId];
    let paramCount = 2;

    if (clientDomain) {
      conditions.push(`c.client_domain = $${paramCount++}`);
      params.push(clientDomain);
    }

    const result = await pool.query(
      `SELECT c.*, 
              u.name as user_name, 
              u.email as user_email
       FROM chats c
       LEFT JOIN users u ON c.user_id = u.id
       WHERE ${conditions.join(' AND ')}
       ORDER BY c.updated_at DESC`,
      params
    );
    return result.rows;
  }

  /**
   * Get chat statistics (optionally filtered by clientDomain)
   */
  static async getStats(clientDomain = null) {
    const params = [];
    let query = `
      SELECT 
        COUNT(*) FILTER (WHERE status = 'active') as active_count,
        COUNT(*) FILTER (WHERE status = 'pending') as pending_count,
        COUNT(*) FILTER (WHERE status = 'closed') as closed_count,
        COUNT(*) FILTER (WHERE status = 'closed' AND closed_at >= CURRENT_DATE) as closed_today,
        AVG(rating) FILTER (WHERE rating IS NOT NULL) as avg_rating
      FROM chats
    `;

    if (clientDomain) {
      query += ` WHERE client_domain = $1`;
      params.push(clientDomain);
    }

    const result = await pool.query(query, params);
    return result.rows[0];
  }

  /**
   * Get active chats (optionally filtered by clientDomain)
   */
  static async getActive({ clientDomain = null, limit = 20 } = {}) {
    const conditions = ["c.status = 'active'"];
    const params = [];
    let paramCount = 1;

    if (clientDomain) {
      conditions.push(`c.client_domain = $${paramCount++}`);
      params.push(clientDomain);
    }

    params.push(limit);

    const result = await pool.query(
      `SELECT c.*, 
              u.name as user_name, 
              u.email as user_email,
              COALESCE(c.agent_name, a.name) as agent_name
       FROM chats c
       LEFT JOIN users u ON c.user_id = u.id
       LEFT JOIN users a ON c.assigned_to = a.id
       WHERE ${conditions.join(' AND ')}
       ORDER BY c.updated_at DESC
       LIMIT $${paramCount}`,
      params
    );
    return result.rows;
  }

  /**
   * Get closed chats (optionally filtered by clientDomain)
   */
  static async getClosed({ clientDomain = null, limit = 20, page = 1 }) {
    const offset = (page - 1) * limit;
    const conditions = ["c.status = 'closed'"];
    const params = [];
    let paramCount = 1;

    if (clientDomain) {
      conditions.push(`c.client_domain = $${paramCount++}`);
      params.push(clientDomain);
    }

    params.push(limit, offset);

    const result = await pool.query(
      `SELECT c.*, 
              u.name as user_name, 
              u.email as user_email,
              COALESCE(c.agent_name, a.name) as agent_name
       FROM chats c
       LEFT JOIN users u ON c.user_id = u.id
       LEFT JOIN users a ON c.assigned_to = a.id
       WHERE ${conditions.join(' AND ')}
       ORDER BY c.closed_at DESC
       LIMIT $${paramCount} OFFSET $${paramCount + 1}`,
      params
    );
    return result.rows;
  }
}

module.exports = Chat;