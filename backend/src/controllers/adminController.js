const pool   = require('../config/database');
const bcrypt = require('bcryptjs');
const logger = require('../utils/logger');

// ═══════════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════════

exports.getDashboardStats = async (req, res) => {
  try {
    const tenantId = req.tenant_id;
    logger.info(`📊 Fetching dashboard stats for tenant ${tenantId}`);

    const safeCount = async (query, p = []) => {
      try {
        const r = await pool.query(query, p);
        return parseInt(r.rows[0]?.count || r.rows[0]?.total || 0) || 0;
      } catch (e) {
        logger.warn(`Query failed: ${e.message}`);
        return 0;
      }
    };

    const [
      totalChats,
      totalAgents,
      totalMessages,
      activeChats,
      pendingChats,
      closedChats
    ] = await Promise.all([
      safeCount(`SELECT COUNT(*) as count FROM chats WHERE tenant_id = $1`, [tenantId]),
      safeCount(`SELECT COUNT(*) as count FROM agents WHERE tenant_id = $1`, [tenantId]),
      safeCount(`SELECT COUNT(*) as count FROM messages WHERE tenant_id = $1 AND sender_type = 'user'`, [tenantId]),
      safeCount(`SELECT COUNT(*) as count FROM chats WHERE tenant_id = $1 AND status = 'active'`, [tenantId]),
      safeCount(`SELECT COUNT(*) as count FROM chats WHERE tenant_id = $1 AND status = 'pending'`, [tenantId]),
      safeCount(`SELECT COUNT(*) as count FROM chats WHERE tenant_id = $1 AND status = 'closed'`, [tenantId])
    ]);

    // Recent chats
    let recentChats = [];
    try {
      const r = await pool.query(`
        SELECT c.id, c.status, c.created_at, c.updated_at,
               u.name as user_name, u.email as user_email
        FROM chats c
        LEFT JOIN users u ON c.user_id = u.id
        WHERE c.tenant_id = $1
        ORDER BY c.updated_at DESC LIMIT 5
      `, [tenantId]);
      recentChats = r.rows;
    } catch (e) {
      logger.warn('Recent chats query failed:', e.message);
    }

    res.status(200).json({
      success: true,
      stats: {
        totalChats,
        totalAgents,
        totalMessages,
        activeChats,
        pendingChats,
        closedChats
      },
      recentChats
    });
  } catch (error) {
    logger.error('Dashboard stats error:', error.message || error);
    res.status(500).json({ success: false, error: 'Failed to get dashboard stats' });
  }
};

exports.getDashboardCharts = async (req, res) => {
  try {
    const days    = Math.min(Math.max(parseInt(req.query.days) || 7, 1), 90);
    const result  = await pool.query(`
      SELECT
        DATE(created_at) as date,
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'closed')  as resolved,
        COUNT(*) FILTER (WHERE status = 'active')  as active,
        COUNT(*) FILTER (WHERE status = 'pending') as pending
      FROM chats
      WHERE tenant_id = $1 AND created_at >= NOW() - ($2 || ' days')::interval
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `, [req.tenant_id, days]);
    res.status(200).json({ success: true, charts: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to get chart data' });
  }
};

exports.getAllChats = async (req, res) => {
  try {
    const { status, page = 1, limit = 50, search = '' } = req.query;

    const conditions = ['c.tenant_id = $1'];
    const params     = [req.tenant_id];
    let   p          = 2;

    if (status && status !== 'all') {
      conditions.push(`c.status = $${p++}`);
      params.push(status);
    }
    if (search) {
      conditions.push(`(u.name ILIKE $${p} OR u.email ILIKE $${p})`);
      params.push(`%${search}%`);
      p++;
    }

    const where  = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    const offset = (parseInt(page) - 1) * parseInt(limit);
    params.push(parseInt(limit), offset);

    const result = await pool.query(`
      SELECT c.id, c.status, c.channel,
             c.created_at, c.updated_at, c.assigned_agent_id as assigned_to,
             u.name as user_name, u.email as user_email,
             a.name as agent_name,
             (SELECT content FROM messages
              WHERE chat_id = c.id AND sender_type = 'user'
              ORDER BY created_at DESC LIMIT 1) as last_message,
             (SELECT COUNT(*) FROM messages WHERE chat_id = c.id) as message_count
      FROM chats c
      LEFT JOIN users  u ON c.user_id     = u.id
      LEFT JOIN agents a ON c.assigned_agent_id = a.id
      ${where}
      ORDER BY c.updated_at DESC
      LIMIT $${p} OFFSET $${p + 1}
    `, params);

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM chats c LEFT JOIN users u ON c.user_id = u.id ${where}`,
      params.slice(0, p - 1)
    );

    res.status(200).json({
      success:    true,
      chats:      result.rows,
      total:      parseInt(countResult.rows[0].count) || 0,
      pagination: { page: parseInt(page), limit: parseInt(limit), total: parseInt(countResult.rows[0].count) || 0 }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to get chats' });
  }
};

exports.getChatDetails = async (req, res) => {
  try {
    const { chatId } = req.params;

    const chatResult = await pool.query(`
      SELECT c.*, u.name as user_name, u.email as user_email, a.name as agent_name
      FROM chats c
      LEFT JOIN users  u ON c.user_id     = u.id
      LEFT JOIN agents a ON c.assigned_agent_id = a.id
      WHERE c.id = $1 AND c.tenant_id = $2
    `, [chatId, req.tenant_id]);

    if (!chatResult.rows[0]) {
      return res.status(404).json({ success: false, error: 'Chat not found' });
    }

    const messagesResult = await pool.query(`
      SELECT m.*, a.name as agent_name
      FROM messages m
      LEFT JOIN agents a ON m.sender_id = a.id AND m.sender_type = 'agent'
      WHERE m.chat_id = $1 AND m.tenant_id = $2
      ORDER BY m.created_at ASC LIMIT 200
    `, [chatId, req.tenant_id]);

    res.status(200).json({ success: true, chat: chatResult.rows[0], messages: messagesResult.rows });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to get chat details' });
  }
};

exports.getChatDetailsWithAgents = exports.getChatDetails;
exports.getActiveChats  = async (req, res) => { req.query.status = 'active';  return exports.getAllChats(req, res); };
exports.getPendingChats = async (req, res) => { req.query.status = 'pending'; return exports.getAllChats(req, res); };
exports.getClosedChats  = async (req, res) => { req.query.status = 'closed';  return exports.getAllChats(req, res); };

exports.assignChat = async (req, res) => {
  try {
    const { chatId }  = req.params;
    const { agentId } = req.body;
    if (!agentId) return res.status(400).json({ success: false, error: 'Agent ID required' });

    const result = await pool.query(`
      UPDATE chats SET assigned_agent_id = $1, status = 'active', updated_at = NOW()
      WHERE id = $2 AND tenant_id = $3 RETURNING *
    `, [agentId, chatId, req.tenant_id]);

    if (!result.rows[0]) return res.status(404).json({ success: false, error: 'Chat not found' });
    res.status(200).json({ success: true, chat: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to assign chat' });
  }
};

exports.unassignChat = async (req, res) => {
  try {
    const { chatId }  = req.params;

    const result = await pool.query(`
      UPDATE chats SET assigned_agent_id = NULL, status = 'active', updated_at = NOW()
      WHERE id = $1 AND tenant_id = $2 RETURNING *
    `, [chatId, req.tenant_id]);

    if (!result.rows[0]) return res.status(404).json({ success: false, error: 'Chat not found' });
    res.status(200).json({ success: true, chat: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to unassign chat' });
  }
};

exports.updateChatStatus = async (req, res) => {
  try {
    const { chatId } = req.params;
    const { status } = req.body;
    const result = await pool.query(`
      UPDATE chats
      SET status = $1, updated_at = NOW()
      WHERE id = $2 AND tenant_id = $3 RETURNING *
    `, [status, chatId, req.tenant_id]);
    res.status(200).json({ success: true, chat: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to update status' });
  }
};

exports.replyToChat = async (req, res) => {
  try {
    const { chatId }  = req.params;
    const { content } = req.body;
    const agent       = req.agent;

    if (!content?.trim()) return res.status(400).json({ success: false, error: 'Message content required' });

    const result = await pool.query(`
      INSERT INTO messages (tenant_id, chat_id, sender_type, sender_id, content, created_at)
      VALUES ($1, $2, 'agent', $3, $4, NOW()) RETURNING *
    `, [req.tenant_id, chatId, agent.id, content.trim()]);

    await pool.query(`
      UPDATE chats SET assigned_agent_id = COALESCE(assigned_agent_id, $1), status = 'active', updated_at = NOW() 
      WHERE id = $2 AND tenant_id = $3
    `, [agent.id, chatId, req.tenant_id]);

    const message = { ...result.rows[0], agent_name: agent.name };

    // Emit to specific tenant room
    if (global.io) {
      global.io.to(`chat_${chatId}`).emit('new-message', { chatId, message });
    }

    res.status(201).json({ success: true, message });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to send reply' });
  }
};

exports.getAllAgents = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, name, email, role, status, is_available, max_concurrent_chats, created_at, updated_at
      FROM agents WHERE tenant_id = $1 ORDER BY created_at DESC
    `, [req.tenant_id]);
    res.status(200).json({ success: true, agents: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to get agents' });
  }
};

exports.createAgent = async (req, res) => {
  try {
    const { name, email, password, role = 'agent' } = req.body;
    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(`
      INSERT INTO agents (tenant_id, name, email, password_hash, role)
      VALUES ($1, $2, $3, $4, $5) RETURNING id, name, email, role
    `, [req.tenant_id, name, email, hash, role]);
    res.status(201).json({ success: true, agent: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to create agent' });
  }
};

exports.changePassword = async (req, res) => {
  try {
    const { email, currentPassword, newPassword } = req.body;
    const agentEmail = email.trim();

    const agentResult = await pool.query(
      `SELECT id, password_hash, email, name, tenant_id FROM agents WHERE email = $1 LIMIT 1`,
      [agentEmail]
    );

    if (!agentResult.rows[0] || agentResult.rows[0].tenant_id !== req.tenant_id) {
       return res.status(404).json({ success: false, error: 'Admin account not found' });
    }

    const agent = agentResult.rows[0];
    const isValid = await bcrypt.compare(currentPassword, agent.password_hash);

    if (!isValid) return res.status(400).json({ success: false, error: 'Current password is incorrect' });

    const newHash = await bcrypt.hash(newPassword, 10);
    await pool.query(`UPDATE agents SET password_hash = $1 WHERE id = $2`, [newHash, agent.id]);
    res.status(200).json({ success: true, message: 'Password changed successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to change password' });
  }
};

exports.getSettings = async (req, res) => {
  res.status(200).json({ success: true, settings: {} });
};

// Added missing stubs to prevent router crash, but they return 501 Not Implemented in production
exports.getChatStatsByDateRange = async (req, res) => { res.status(501).json({ success: false, error: 'Not Implemented' }); };
exports.getMyChats = async (req, res) => { res.status(501).json({ success: false, error: 'Not Implemented' }); };
exports.updateAgent = async (req, res) => { res.status(501).json({ success: false, error: 'Not Implemented' }); };
exports.deleteAgent = async (req, res) => { res.status(501).json({ success: false, error: 'Not Implemented' }); };
exports.getAgentStats = async (req, res) => { res.status(501).json({ success: false, error: 'Not Implemented' }); };
exports.getReviews = async (req, res) => { res.status(501).json({ success: false, error: 'Not Implemented' }); };
exports.resolveReview = async (req, res) => { res.status(501).json({ success: false, error: 'Not Implemented' }); };
exports.getFeedbackAnalysis = async (req, res) => { res.status(501).json({ success: false, error: 'Not Implemented' }); };
exports.updateSettings = async (req, res) => { res.status(501).json({ success: false, error: 'Not Implemented' }); };
exports.closeChat = async (req, res) => { res.status(501).json({ success: false, error: 'Not Implemented' }); };

module.exports = exports;
