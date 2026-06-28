const pool = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');

class User {
  /**
   * Find user by ID
   */
  static async findById(id) {
    const result = await pool.query(
      'SELECT * FROM users WHERE id = $1',
      [id]
    );
    return result.rows[0] || null;
  }

  /**
   * Find user by external ID (from a specific client domain)
   */
  static async findByExternalId(clientDomain, externalId) {
    const result = await pool.query(
      'SELECT * FROM users WHERE client_domain = $1 AND external_id = $2',
      [clientDomain, externalId]
    );
    return result.rows[0] || null;
  }

  /**
   * Find user by email inside a specific client domain
   */
  static async findByEmail(clientDomain, email) {
    const result = await pool.query(
      'SELECT * FROM users WHERE client_domain = $1 AND email = $2',
      [clientDomain, email]
    );
    return result.rows[0] || null;
  }

  /**
   * Create new user with client domain isolation
   */
  static async create({ clientDomain, externalId, name, email, avatarUrl = null, metadata = {} }) {
    const id = uuidv4();
    
    const result = await pool.query(
      `INSERT INTO users (id, client_domain, external_id, name, email, avatar_url, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [id, clientDomain, externalId, name, email, avatarUrl, JSON.stringify(metadata)]
    );
    
    return result.rows[0];
  }

  /**
   * Update user
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
    if (data.metadata !== undefined) {
      fields.push(`metadata = $${paramCount++}`);
      values.push(JSON.stringify(data.metadata));
    }

    if (fields.length === 0) {
      return await this.findById(id);
    }

    values.push(id);
    const result = await pool.query(
      `UPDATE users SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
       WHERE id = $${paramCount}
       RETURNING *`,
      values
    );

    return result.rows[0] || null;
  }

  /**
   * Find or create user with domain tenant safety
   */
  static async findOrCreate(clientDomain, userData) {
    try {
      const extId = userData.externalId || userData.id || null;
      
      const result = await pool.query(
        `INSERT INTO users (id, client_domain, external_id, name, email, avatar_url, metadata, created_at)
         VALUES (uuid_generate_v4(), $1, $2, $3, $4, $5, $6, NOW())
         ON CONFLICT (client_domain, external_id) DO UPDATE SET 
           name = EXCLUDED.name,
           email = EXCLUDED.email,
           avatar_url = EXCLUDED.avatar_url,
           metadata = EXCLUDED.metadata,
           updated_at = NOW()
         RETURNING *`,
        [
          clientDomain,
          extId,
          userData.name || 'Anonymous',
          userData.email || null,
          userData.avatarUrl || null,
          typeof userData.metadata === 'object' ? JSON.stringify(userData.metadata) : (userData.metadata || '{}')
        ]
      );
      
      return result.rows[0];
      
    } catch (error) {
      const extId = userData.externalId || userData.id || null;
      if (extId) {
        const existing = await this.findByExternalId(clientDomain, extId);
        if (existing) return existing;
      }
      
      logger.error('Find or create user error:', error);
      throw error;
    }
  }

  /**
   * Get all users with optional tenant filter and pagination
   */
  static async getAll({ clientDomain = null, page = 1, limit = 20, search = '' }) {
    const offset = (page - 1) * limit;
    const conditions = [];
    const params = [limit, offset];
    let paramCount = 3;

    if (clientDomain) {
      conditions.push(`client_domain = $${paramCount++}`);
      params.push(clientDomain);
    }

    if (search) {
      conditions.push(`(name ILIKE $${paramCount} OR email ILIKE $${paramCount})`);
      params.push(`%${search}%`);
      paramCount++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await pool.query(
      `SELECT * FROM users 
       ${whereClause}
       ORDER BY created_at DESC 
       LIMIT $1 OFFSET $2`,
      params.slice(0, paramCount - 1)
    );

    const countParams = params.slice(2);
    const countResult = await pool.query(
      `SELECT COUNT(*) FROM users ${whereClause}`,
      countParams
    );

    return {
      users: result.rows,
      total: parseInt(countResult.rows[0].count),
      page,
      totalPages: Math.ceil(countResult.rows[0].count / limit)
    };
  }

  /**
   * Delete user
   */
  static async delete(id) {
    const result = await pool.query(
      'DELETE FROM users WHERE id = $1 RETURNING *',
      [id]
    );
    return result.rows[0] || null;
  }
}

module.exports = User;
