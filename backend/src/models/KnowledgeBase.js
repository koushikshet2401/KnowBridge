const pool = require('../config/database');
const { v4: uuidv4 } = require('uuid');

class KnowledgeBase {
  /**
   * Create new document record
   */
  static async create({ tenantId, title, content = '', type = 'uploaded', sourceUrl = null, metadata = {} }) {
    if (!tenantId) throw new Error('tenantId is required');
    const id = uuidv4();
    
    const result = await pool.query(
      `INSERT INTO documents 
       (id, tenant_id, title, content, type, source_url, status, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, 'processing', $7)
       RETURNING *`,
      [id, tenantId, title, content, type, sourceUrl, JSON.stringify(metadata)]
    );
    
    return result.rows[0];
  }

  /**
   * Get document by ID
   */
  static async findById(id) {
    const result = await pool.query(
      `SELECT * FROM documents WHERE id = $1`,
      [id]
    );
    return result.rows[0] || null;
  }

  /**
   * Get all documents
   */
  static async getAll({ tenantId, status = null, limit = 50 }) {
    if (!tenantId) throw new Error('tenantId is required');
    
    let conditions = ['tenant_id = $1'];
    let params = [tenantId];
    let paramCount = 2;

    if (status) {
      conditions.push(`status = $${paramCount++}`);
      params.push(status);
    }
    
    params.push(limit);

    const result = await pool.query(
      `SELECT * FROM documents
       WHERE ${conditions.join(' AND ')}
       ORDER BY created_at DESC
       LIMIT $${paramCount}`,
      params
    );
    
    return result.rows;
  }

  /**
   * Update document status
   */
  static async updateStatus(id, status) {
    const result = await pool.query(
      `UPDATE documents 
       SET status = $2, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
      [id, status]
    );
    
    return result.rows[0] || null;
  }

  /**
   * Delete document
   */
  static async delete(id) {
    const result = await pool.query(
      'DELETE FROM documents WHERE id = $1 RETURNING *',
      [id]
    );
    return result.rows[0] || null;
  }

  /**
   * Get document count by status
   */
  static async getStats(tenantId) {
    if (!tenantId) throw new Error('tenantId is required');
    const result = await pool.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'processing') as processing,
        COUNT(*) FILTER (WHERE status = 'processed') as processed,
        COUNT(*) FILTER (WHERE status = 'error') as error_count
      FROM documents
      WHERE tenant_id = $1
    `, [tenantId]);
    
    return result.rows[0];
  }

  /**
   * Search documents by title
   */
  static async search(tenantId, searchTerm, { limit = 20 }) {
    if (!tenantId) throw new Error('tenantId is required');
    const result = await pool.query(
      `SELECT * FROM documents
       WHERE tenant_id = $1 AND title ILIKE $2
       ORDER BY created_at DESC
       LIMIT $3`,
      [tenantId, `%${searchTerm}%`, limit]
    );
    
    return result.rows;
  }
}

module.exports = KnowledgeBase;
