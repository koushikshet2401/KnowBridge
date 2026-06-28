const pool = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');

class Agent {
  /**
   * Create new agent
   */
  static async create({ name, email, password, role = 'agent', maxConcurrentChats = 5 }) {
    const id = uuidv4();
    const passwordHash = await bcrypt.hash(password, 10);
    
    const result = await pool.query(
      `INSERT INTO agents (id, name, email, password_hash, role, max_concurrent_chats, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'offline')
       RETURNING id, name, email, role, is_available, status, max_concurrent_chats, created_at`,
      [id, name, email, passwordHash, role, maxConcurrentChats]
    );
    
    return result.rows[0];
  }

  /**
   * Find agent by ID
   */
  static async findById(id) {
    const result = await pool.query(
      `SELECT id, name, email, role, is_available, avatar_url, status, 
              max_concurrent_chats, metadata, last_active_at, created_at
       FROM agents WHERE id = $1`,
      [id]
    );
    return result.rows[0] || null;
  }

  /**
   * Find agent by email (for login)
   */
  static async findByEmail(email) {
    const result = await pool.query(
      'SELECT * FROM agents WHERE email = $1',
      [email]
    );
    return result.rows[0] || null;
  }

  /**
   * Verify password
   */
  static async verifyPassword(agent, password) {
    return await bcrypt.compare(password, agent.password_hash);
  }

  /**
   * Update agent status
   */
  static async updateStatus(id, status) {
    const result = await pool.query(
      `UPDATE agents 
       SET status = $1, 
           last_active_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING id, name, email, role, status, is_available`,
      [status, id]
    );
    return result.rows[0] || null;
  }

  /**
   * Update agent availability
   */
  static async updateAvailability(id, isAvailable) {
    const result = await pool.query(
      `UPDATE agents 
       SET is_available = $1,
           last_active_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING id, name, email, role, status, is_available`,
      [isAvailable, id]
    );
    return result.rows[0] || null;
  }

  /**
   * Update agent profile
   */
  static async update(id, data) {
    const fields = [];
    const values = [];
    let paramCount = 1;

    if (data.name !== undefined) {
      fields.push(`name = $${paramCount++}`);
      values.push(data.name);
    }
    if (data.email !== undefined) {
      fields.push(`email = $${paramCount++}`);
      values.push(data.email);
    }
    if (data.avatarUrl !== undefined) {
      fields.push(`avatar_url = $${paramCount++}`);
      values.push(data.avatarUrl);
    }
    if (data.maxConcurrentChats !== undefined) {
      fields.push(`max_concurrent_chats = $${paramCount++}`);
      values.push(data.maxConcurrentChats);
    }
    if (data.metadata !== undefined) {
      fields.push(`metadata = $${paramCount++}`);
      values.push(JSON.stringify(data.metadata));
    }

    if (fields.length === 0) {
      return await this.findById(id);
    }

    values.push(id);
    const result = await pool.query(
      `UPDATE agents SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
       WHERE id = $${paramCount}
       RETURNING id, name, email, role, is_available, avatar_url, status, max_concurrent_chats`,
      values
    );

    return result.rows[0] || null;
  }

  /**
   * Change password
   */
  static async changePassword(id, newPassword) {
    const passwordHash = await bcrypt.hash(newPassword, 10);
    
    await pool.query(
      'UPDATE agents SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [passwordHash, id]
    );
    
    return true;
  }

  /**
   * Get all agents
   */
  static async getAll({ role, isAvailable, page = 1, limit = 20 }) {
    const offset = (page - 1) * limit;
    const conditions = [];
    const params = [];
    let paramCount = 1;

    if (role) {
      conditions.push(`role = $${paramCount++}`);
      params.push(role);
    }

    if (isAvailable !== undefined) {
      conditions.push(`is_available = $${paramCount++}`);
      params.push(isAvailable);
    }

    const whereClause = conditions.length > 0 
      ? `WHERE ${conditions.join(' AND ')}` 
      : '';

    params.push(limit, offset);

    const result = await pool.query(
      `SELECT id, name, email, role, is_available, avatar_url, status,
              max_concurrent_chats, last_active_at, created_at
       FROM agents
       ${whereClause}
       ORDER BY created_at DESC 
       LIMIT $${paramCount} OFFSET $${paramCount + 1}`,
      params
    );

    const countParams = params.slice(0, -2);
    const countResult = await pool.query(
      `SELECT COUNT(*) FROM agents ${whereClause}`,
      countParams
    );

    return {
      agents: result.rows,
      total: parseInt(countResult.rows[0].count),
      page,
      totalPages: Math.ceil(countResult.rows[0].count / limit)
    };
  }

  /**
   * Get available agents
   */
  static async getAvailable() {
    const result = await pool.query(
      `SELECT id, name, email, role, status, max_concurrent_chats
       FROM agents
       WHERE is_available = true AND status = 'online'
       ORDER BY last_active_at DESC`
    );
    return result.rows;
  }

  /**
   * Get agent with least active chats (for auto-assignment)
   */
  static async getLeastBusyAgent() {
    const result = await pool.query(`
      SELECT a.id, a.name, a.email, COUNT(c.id) as active_chats
      FROM agents a
      LEFT JOIN chats c ON c.assigned_agent_id = a.id AND c.status = 'active'
      WHERE a.is_available = true AND a.status = 'online'
      GROUP BY a.id, a.name, a.email, a.max_concurrent_chats
      HAVING COUNT(c.id) < a.max_concurrent_chats
      ORDER BY COUNT(c.id) ASC
      LIMIT 1
    `);
    return result.rows[0] || null;
  }

  /**
   * Get agent performance stats
   */
  static async getPerformanceStats(agentId, { startDate, endDate }) {
    const result = await pool.query(`
      SELECT 
        COUNT(*) FILTER (WHERE status = 'closed') as chats_closed,
        AVG(rating) FILTER (WHERE rating IS NOT NULL) as avg_rating,
        COUNT(*) FILTER (WHERE rating >= 4) as positive_ratings,
        COUNT(*) FILTER (WHERE rating <= 2) as negative_ratings
      FROM chats
      WHERE assigned_agent_id = $1
        AND created_at >= $2
        AND created_at <= $3
    `, [agentId, startDate, endDate]);
    
    return result.rows[0];
  }

  /**
   * Delete agent
   */
  static async delete(id) {
    const result = await pool.query(
      'DELETE FROM agents WHERE id = $1 RETURNING id, name, email',
      [id]
    );
    return result.rows[0] || null;
  }
}

module.exports = Agent;
