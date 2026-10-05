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
   * Find user by external ID (from a specific tenant)
   */
  static async findByExternalId(tenantId, externalId) {
    const result = await pool.query(
      'SELECT * FROM users WHERE tenant_id = $1 AND external_id = $2',
      [tenantId, externalId]
    );
    return result.rows[0] || null;
  }

  /**
   * Find user by email inside a specific tenant
   */
  static async findByEmail(tenantId, email) {
    const result = await pool.query(
      'SELECT * FROM users WHERE tenant_id = $1 AND email = $2',
      [tenantId, email]
    );
    return result.rows[0] || null;
  }

  /**
   * Create new user with tenant isolation
   */
  static async create({ tenantId, externalId, name, email, avatarUrl = null, metadata = {} }) {
    if (!tenantId) throw new Error('tenantId is required');
    const id = uuidv4();
    
    const result = await pool.query(
      `INSERT INTO users (id, tenant_id, external_id, name, email, avatar_url, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [id, tenantId, externalId, name, email, avatarUrl, JSON.stringify(metadata)]
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
   * Find or create user with tenant safety
   */
  static async findOrCreate(tenantId, userData) {
    if (!tenantId) throw new Error('tenantId is required');
    try {
      const extId = userData.externalId || userData.id || null;
      
      const result = await pool.query(
        `INSERT INTO users (id, tenant_id, external_id, name, email, avatar_url, metadata, created_at)
         VALUES (uuid_generate_v4(), $1, $2, $3, $4, $5, $6, NOW())
         ON CONFLICT (tenant_id, external_id) DO UPDATE SET 
           name = EXCLUDED.name,
           email = EXCLUDED.email,
           avatar_url = EXCLUDED.avatar_url,
           metadata = EXCLUDED.metadata,
           updated_at = NOW()
         RETURNING *`,
        [
          tenantId,
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
        const existing = await this.findByExternalId(tenantId, extId);
        if (existing) return existing;
      }
      
      logger.error('Find or create user error:', error);
      throw error;
    }
  }

  /**
   * Get all users with tenant filter and pagination
   */
  static async getAll({ tenantId, page = 1, limit = 20, search = '' }) {
    if (!tenantId) throw new Error('tenantId is required');
    const offset = (page - 1) * limit;
    let conditions = ['tenant_id = $1'];
    
    // We'll map params to SQL manually for safety
    let params = [tenantId];
    let paramCount = 2;

    if (search) {
      conditions.push(`(name ILIKE $${paramCount} OR email ILIKE $${paramCount})`);
      params.push(`%${search}%`);
      paramCount++;
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;
    params.push(limit, offset);

    const result = await pool.query(
      `SELECT * FROM users 
       ${whereClause}
       ORDER BY created_at DESC 
       LIMIT $${paramCount} OFFSET $${paramCount + 1}`,
      params
    );

    const countParams = params.slice(0, -2);
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
