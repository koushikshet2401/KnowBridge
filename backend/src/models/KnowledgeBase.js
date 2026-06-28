const pool = require('../config/database');
const { v4: uuidv4 } = require('uuid');

class KnowledgeBase {
  /**
   * Create new document record
   */
  static async create({ filename, filePath, fileSize, uploadedBy }) {
    const id = uuidv4();
    
    const result = await pool.query(
      `INSERT INTO knowledge_base_documents 
       (id, filename, file_path, file_size, status, uploaded_by)
       VALUES ($1, $2, $3, $4, 'processing', $5)
       RETURNING *`,
      [id, filename, filePath, fileSize, uploadedBy]
    );
    
    return result.rows[0];
  }

  /**
   * Get document by ID
   */
  static async findById(id) {
    const result = await pool.query(
      `SELECT kb.*,
              u.name as uploaded_by_name
       FROM knowledge_base_documents kb
       LEFT JOIN users u ON kb.uploaded_by = u.id
       WHERE kb.id = $1`,
      [id]
    );
    return result.rows[0] || null;
  }

  /**
   * Get all documents
   */
  static async getAll({ status = null, limit = 50 }) {
    let statusCondition = status ? 'WHERE status = $1' : '';
    let params = status ? [status, limit] : [limit];
    let limitIndex = status ? 2 : 1;

    const result = await pool.query(
      `SELECT kb.*,
              u.name as uploaded_by_name,
              u.email as uploaded_by_email
       FROM knowledge_base_documents kb
       LEFT JOIN users u ON kb.uploaded_by = u.id
       ${statusCondition}
       ORDER BY kb.uploaded_at DESC
       LIMIT $${limitIndex}`,
      params
    );
    
    return result.rows;
  }

  /**
   * Update document status
   */
  static async updateStatus(id, status, chunksCount = null) {
    const updates = ['status = $2'];
    const params = [id, status];
    let paramCount = 3;

    if (chunksCount !== null) {
      updates.push(`chunks_count = $${paramCount++}`);
      params.push(chunksCount);
    }

    const result = await pool.query(
      `UPDATE knowledge_base_documents 
       SET ${updates.join(', ')}
       WHERE id = $1
       RETURNING *`,
      params
    );
    
    return result.rows[0] || null;
  }

  /**
   * Delete document
   */
  static async delete(id) {
    const result = await pool.query(
      'DELETE FROM knowledge_base_documents WHERE id = $1 RETURNING *',
      [id]
    );
    return result.rows[0] || null;
  }

  /**
   * Get document count by status
   */
  static async getStats() {
    const result = await pool.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'processing') as processing,
        COUNT(*) FILTER (WHERE status = 'processed') as processed,
        COUNT(*) FILTER (WHERE status = 'error') as error_count,
        SUM(file_size) as total_size,
        SUM(chunks_count) as total_chunks
      FROM knowledge_base_documents
    `);
    
    return result.rows[0];
  }

  /**
   * Search documents by filename
   */
  static async search(searchTerm, { limit = 20 }) {
    const result = await pool.query(
      `SELECT kb.*,
              u.name as uploaded_by_name
       FROM knowledge_base_documents kb
       LEFT JOIN users u ON kb.uploaded_by = u.id
       WHERE kb.filename ILIKE $1
       ORDER BY kb.uploaded_at DESC
       LIMIT $2`,
      [`%${searchTerm}%`, limit]
    );
    
    return result.rows;
  }
}

module.exports = KnowledgeBase;