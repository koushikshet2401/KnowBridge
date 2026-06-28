const pool   = require('../config/database');
const bcrypt = require('bcrypt');
const logger = require('../utils/logger');

// ═══════════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════════

exports.getDashboardStats = async (req, res) => {
  try {
    const agent = req.agent;
    logger.info(`📊 Fetching dashboard stats for ${agent.email} (${agent.role})`);

    // Run all queries safely — individual try/catch so one failure doesn't break all
    const safeCount = async (query, params = []) => {
      try {
        const r = await pool.query(query, params);
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
      closedChats,
      totalReviews,
      positiveReviews,
      negativeReviews,
    ] = await Promise.all([
      safeCount(`SELECT COUNT(*) as count FROM chats`),
      safeCount(`SELECT COUNT(*) as count FROM agents`),
      safeCount(`SELECT COUNT(*) as count FROM messages WHERE sender_type = 'user'`),
      safeCount(`SELECT COUNT(*) as count FROM chats WHERE status = 'active'`),
      safeCount(`SELECT COUNT(*) as count FROM chats WHERE status = 'pending'`),
      safeCount(`SELECT COUNT(*) as count FROM chats WHERE status = 'closed'`),
      safeCount(`SELECT COUNT(*) as count FROM feedback`),
      safeCount(`SELECT COUNT(*) as count FROM feedback WHERE rating = 'positive'`),
      safeCount(`SELECT COUNT(*) as count FROM feedback WHERE rating = 'negative'`),
    ]);

    // Recent chats
    let recentChats = [];
    try {
      const r = await pool.query(`
        SELECT c.id, c.status, c.created_at, c.updated_at, c.client_domain,
               u.name as user_name, u.email as user_email
        FROM chats c
        LEFT JOIN users u ON c.user_id = u.id
        ORDER BY c.updated_at DESC LIMIT 5
      `);
      recentChats = r.rows;
    } catch (e) {
      logger.warn('Recent chats query failed:', e.message);
    }

    logger.info(`✅ Dashboard stats generated successfully for ${agent.email}`);

    res.status(200).json({
      success: true,
      stats: {
        totalChats,
        totalAgents,
        totalMessages,
        activeChats,
        pendingChats,
        closedChats,
        totalReviews,
        positiveReviews,
        negativeReviews,
      },
      recentChats
    });
  } catch (error) {
    logger.error('Dashboard stats error:', error.message || error);
    res.status(500).json({ success: false, error: error.message || 'Failed to get dashboard stats' });
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
      WHERE created_at >= NOW() - INTERVAL '${days} days'
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `);
    res.status(200).json({ success: true, charts: result.rows });
  } catch (error) {
    logger.error('Dashboard charts error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to get chart data' });
  }
};

exports.getChatStatsByDateRange = async (req, res) => {
  try {
    const { startDate = '1970-01-01', endDate = new Date() } = req.query;
    const result = await pool.query(`
      SELECT DATE(created_at) as date,
             COUNT(*) as total_chats,
             COUNT(*) FILTER (WHERE status = 'closed') as closed_chats,
             COUNT(*) FILTER (WHERE status = 'active') as active_chats
      FROM chats
      WHERE created_at >= $1 AND created_at <= $2
      GROUP BY DATE(created_at)
      ORDER BY date DESC
    `, [startDate, endDate]);
    res.status(200).json({ success: true, stats: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to get statistics' });
  }
};

// ═══════════════════════════════════════════════
// CHAT MANAGEMENT
// ═══════════════════════════════════════════════

exports.getAllChats = async (req, res) => {
  try {
    const { status, page = 1, limit = 50, search = '' } = req.query;

    const conditions = [];
    const params     = [];
    let   p          = 1;

    if (status && status !== 'all') {
      conditions.push(`c.status = $${p++}`);
      params.push(status);
    }
    if (search) {
      conditions.push(`(u.name ILIKE $${p} OR u.email ILIKE $${p} OR c.client_domain ILIKE $${p})`);
      params.push(`%${search}%`);
      p++;
    }

    const where  = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    const offset = (parseInt(page) - 1) * parseInt(limit);
    params.push(parseInt(limit), offset);

    const result = await pool.query(`
      SELECT c.id, c.status, c.channel, c.client_domain,
             c.created_at, c.updated_at, c.assigned_to,
             u.name as user_name, u.email as user_email,
             a.name as agent_name,
             (SELECT content FROM messages
              WHERE chat_id = c.id AND sender_type = 'user'
              ORDER BY created_at DESC LIMIT 1) as last_message,
             (SELECT COUNT(*) FROM messages WHERE chat_id = c.id) as message_count
      FROM chats c
      LEFT JOIN users  u ON c.user_id     = u.id
      LEFT JOIN agents a ON c.assigned_to = a.id
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
    logger.error('Get all chats error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to get chats' });
  }
};

exports.getMyChats = async (req, res) => {
  try {
    const agentId = req.agent.id;
    const { status } = req.query;

    let query  = `
      SELECT c.id, c.status, c.client_domain, c.created_at, c.updated_at,
             u.name as user_name, u.email as user_email,
             (SELECT content FROM messages WHERE chat_id = c.id
              ORDER BY created_at DESC LIMIT 1) as last_message
      FROM chats c LEFT JOIN users u ON c.user_id = u.id
      WHERE c.assigned_to = $1
    `;
    const params = [agentId];
    if (status && status !== 'all') { params.push(status); query += ` AND c.status = $${params.length}`; }
    query += ` ORDER BY c.updated_at DESC`;

    const result = await pool.query(query, params);
    res.status(200).json({ success: true, chats: result.rows });
  } catch (error) {
    logger.error('Get my chats error:', error.message);
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
      LEFT JOIN agents a ON c.assigned_to = a.id
      WHERE c.id = $1
    `, [chatId]);

    if (!chatResult.rows[0]) {
      return res.status(404).json({ success: false, error: 'Chat not found' });
    }

    const messagesResult = await pool.query(`
      SELECT m.*, a.name as agent_name
      FROM messages m
      LEFT JOIN agents a ON m.sender_id = a.id AND m.sender_type = 'agent'
      WHERE m.chat_id = $1
      ORDER BY m.created_at ASC LIMIT 200
    `, [chatId]);

    res.status(200).json({ success: true, chat: chatResult.rows[0], messages: messagesResult.rows });
  } catch (error) {
    logger.error('Get chat details error:', error.message);
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

    const agentCheck = await pool.query('SELECT id, name FROM agents WHERE id = $1', [agentId]);
    if (!agentCheck.rows[0]) return res.status(404).json({ success: false, error: 'Agent not found' });

    const result = await pool.query(`
      UPDATE chats SET assigned_to = $1, status = 'active', updated_at = NOW()
      WHERE id = $2 RETURNING *
    `, [agentId, chatId]);

    if (!result.rows[0]) return res.status(404).json({ success: false, error: 'Chat not found' });

    if (global.io) {
      global.io.to('admin-room').emit('chat-assigned', { chatId, agentName: agentCheck.rows[0].name });
    }
    res.status(200).json({ success: true, chat: result.rows[0] });
  } catch (error) {
    logger.error('Assign chat error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to assign chat' });
  }
};

exports.unassignChat = async (req, res) => {
  try {
    const { chatId }  = req.params;

    const result = await pool.query(`
      UPDATE chats SET assigned_to = NULL, status = 'active', updated_at = NOW()
      WHERE id = $1 RETURNING *
    `, [chatId]);

    if (!result.rows[0]) return res.status(404).json({ success: false, error: 'Chat not found' });

    if (global.io) {
      global.io.to('admin-room').emit('chat-assigned', { chatId, agentName: null });
    }
    res.status(200).json({ success: true, chat: result.rows[0] });
  } catch (error) {
    logger.error('Unassign chat error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to unassign chat' });
  }
};

exports.updateChatStatus = async (req, res) => {
  try {
    const { chatId } = req.params;
    const { status } = req.body;
    if (!['active', 'pending', 'closed'].includes(status)) {
      return res.status(400).json({ success: false, error: 'Invalid status' });
    }
    const result = await pool.query(`
      UPDATE chats
      SET status = $1,
          updated_at = CASE WHEN $1::varchar = 'closed' THEN updated_at ELSE NOW() END,
          closed_at = CASE WHEN $1::varchar = 'closed' THEN NOW() ELSE closed_at END
      WHERE id = $2 RETURNING *
    `, [status, chatId]);
    if (!result.rows[0]) return res.status(404).json({ success: false, error: 'Chat not found' });
    if (global.io) global.io.to(`chat_${chatId}`).emit('chat-status-changed', { chatId, status });
    res.status(200).json({ success: true, chat: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to update status' });
  }
};

exports.closeChat = async (req, res) => {
  try {
    const { chatId } = req.params;
    const result = await pool.query(`
      UPDATE chats SET status = 'closed', closed_at = NOW()
      WHERE id = $1 RETURNING *
    `, [chatId]);
    if (!result.rows[0]) return res.status(404).json({ success: false, error: 'Chat not found' });
    if (global.io) global.io.to(`chat_${chatId}`).emit('chat-closed', { chatId });
    res.status(200).json({ success: true, chat: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to close chat' });
  }
};

// ═══════════════════════════════════════════════
// MESSAGES
// ═══════════════════════════════════════════════

exports.replyToChat = async (req, res) => {
  try {
    const { chatId }  = req.params;
    const { content } = req.body;
    const agent       = req.agent;

    logger.info(`===== REPLYING TO CHAT ${chatId} =====`);
    logger.info(`Agent ID: ${agent?.id}`);
    
    if (!content?.trim()) return res.status(400).json({ success: false, error: 'Message content required' });

    const result = await pool.query(`
      INSERT INTO messages (chat_id, sender_type, sender_id, content, created_at)
      VALUES ($1, 'agent', $2, $3, NOW()) RETURNING *
    `, [chatId, agent?.id || null, content.trim()]);

    // Auto-assign to the agent and mark as active so AI stops responding
    await pool.query(`
      UPDATE chats SET assigned_to = COALESCE(assigned_to, $1), status = 'active', updated_at = NOW() WHERE id = $2
    `, [agent?.id || null, chatId]);

    const message = { ...result.rows[0], agent_name: agent?.name || 'Agent' };

    if (global.io) global.io.to(`chat_${chatId}`).emit('new-message', { chatId, message });

    res.status(201).json({ success: true, message });
  } catch (error) {
    console.error('===== REPLY TO CHAT ERROR =====');
    console.error(error);
    logger.error('Reply to chat error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to send reply', details: error.message });
  }
};

exports.replyToChatWithAttribution = exports.replyToChat;

// ═══════════════════════════════════════════════
// AGENT MANAGEMENT
// ═══════════════════════════════════════════════

exports.getAllAgents = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, name, email, role, status, is_available, max_concurrent_chats, created_at, updated_at
      FROM agents ORDER BY created_at DESC
    `);
    res.status(200).json({ success: true, agents: result.rows });
  } catch (error) {
    logger.error('Get agents error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to get agents' });
  }
};

exports.getAgentStats = async (req, res) => {
  try {
    const id = req.params.agentId || req.params.id;
    const [assigned, closed, messages] = await Promise.all([
      pool.query('SELECT COUNT(*) FROM chats WHERE assigned_to = $1', [id]),
      pool.query("SELECT COUNT(*) FROM chats WHERE assigned_to = $1 AND status = 'closed'", [id]),
      pool.query("SELECT COUNT(*) FROM messages WHERE sender_id = $1 AND sender_type = 'agent'", [id]),
    ]);
    res.status(200).json({
      success: true,
      stats: {
        total_chats:   parseInt(assigned.rows[0].count),
        closed_chats:  parseInt(closed.rows[0].count),
        messages_sent: parseInt(messages.rows[0].count),
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to get agent stats' });
  }
};

exports.createAgent = async (req, res) => {
  try {
    const { name, email, password, role = 'agent' } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ success: false, error: 'Name, email and password required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ success: false, error: 'Password must be at least 6 characters' });
    }
    const existing = await pool.query('SELECT id FROM agents WHERE email = $1', [email]);
    if (existing.rows[0]) return res.status(400).json({ success: false, error: 'Email already exists' });

    const hash   = await bcrypt.hash(password, 10);
    const result = await pool.query(`
      INSERT INTO agents (name, email, password_hash, role, status, is_available, created_at, updated_at)
      VALUES ($1, $2, $3, $4, 'online', true, NOW(), NOW())
      RETURNING id, name, email, role, status, is_available, created_at
    `, [name, email, hash, role]);

    res.status(201).json({ success: true, agent: result.rows[0], message: 'Agent created successfully' });
  } catch (error) {
    logger.error('Create agent error:', error.message);
    res.status(500).json({ success: false, error: error.message || 'Failed to create agent' });
  }
};

exports.updateAgent = async (req, res) => {
  try {
    const id   = req.params.id || req.params.agentId;
    const { name, email, role, password, is_available } = req.body;

    const sets = []; const params = []; let p = 1;
    if (name)              { sets.push(`name = $${p++}`);         params.push(name); }
    if (email)             { sets.push(`email = $${p++}`);        params.push(email); }
    if (role)              { sets.push(`role = $${p++}`);         params.push(role); }
    if (is_available != null) { sets.push(`is_available = $${p++}`); params.push(is_available); }
    if (password) {
      const h = await bcrypt.hash(password, 10);
      sets.push(`password_hash = $${p++}`); params.push(h);
    }
    if (!sets.length) return res.status(400).json({ success: false, error: 'No fields to update' });
    sets.push(`updated_at = NOW()`); params.push(id);

    const result = await pool.query(
      `UPDATE agents SET ${sets.join(', ')} WHERE id = $${p} RETURNING id, name, email, role`,
      params
    );
    if (!result.rows[0]) return res.status(404).json({ success: false, error: 'Agent not found' });
    res.status(200).json({ success: true, agent: result.rows[0] });
  } catch (error) {
    logger.error('Update agent error:', error.message);
    res.status(500).json({ success: false, error: error.message || 'Failed to update agent' });
  }
};

exports.deleteAgent = async (req, res) => {
  try {
    const id = req.params.id || req.params.agentId;

    const check = await pool.query('SELECT id, role FROM agents WHERE id = $1', [id]);
    if (!check.rows[0]) return res.status(404).json({ success: false, error: 'Agent not found' });
    if (check.rows[0].role === 'super_admin') {
      return res.status(403).json({ success: false, error: 'Cannot delete super admin' });
    }

    // Handle FK constraints
    await pool.query(`UPDATE chats   SET assigned_to = NULL WHERE assigned_to = $1`, [id]);
    await pool.query(`DELETE FROM notifications WHERE user_id = $1`, [id]);
    await pool.query(`DELETE FROM agents WHERE id = $1`, [id]);

    res.status(200).json({ success: true, message: 'Agent deleted successfully' });
  } catch (error) {
    logger.error('Delete agent error:', error.message);
    res.status(500).json({ success: false, error: error.message || 'Failed to delete agent' });
  }
};

// ═══════════════════════════════════════════════
// ✅ PASSWORD CHANGE — finds agent by email (works in dev mode too)
// ═══════════════════════════════════════════════

exports.changePassword = async (req, res) => {
  try {
    const { email, currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, error: 'Both current and new password are required' });
    }
    if (!email) {
      return res.status(400).json({ success: false, error: 'Email address is required' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ success: false, error: 'New password must be at least 6 characters' });
    }

    // ✅ Find agent by EMAIL provided in the form
    const agentEmail = email.trim();

    logger.info(`🔑 Password change attempt for: ${agentEmail}`);

    const agentResult = await pool.query(
      `SELECT id, password_hash, email, name FROM agents WHERE email = $1 LIMIT 1`,
      [agentEmail]
    );

    if (!agentResult.rows[0]) {
      // List available agents to help debug
      const allAgents = await pool.query(`SELECT email FROM agents LIMIT 5`);
      logger.warn(`Agent ${agentEmail} not found. Available: ${allAgents.rows.map(a => a.email).join(', ')}`);
      return res.status(404).json({
        success: false,
        error: `Admin account "${agentEmail}" not found in database. Please create it first.`
      });
    }

    const agent   = agentResult.rows[0];
    const isValid = await bcrypt.compare(currentPassword, agent.password_hash);

    if (!isValid) {
      return res.status(400).json({ success: false, error: 'Current password is incorrect' });
    }

    const newHash = await bcrypt.hash(newPassword, 10);
    await pool.query(
      `UPDATE agents SET password_hash = $1, updated_at = NOW() WHERE id = $2`,
      [newHash, agent.id]
    );

    logger.info(`✅ Password changed successfully for ${agentEmail}`);
    res.status(200).json({ success: true, message: `Password changed successfully for ${agent.name || agentEmail}` });
  } catch (error) {
    logger.error('Change password error:', error.message);
    res.status(500).json({ success: false, error: error.message || 'Failed to change password' });
  }
};

// ═══════════════════════════════════════════════
// REVIEWS & FEEDBACK
// ═══════════════════════════════════════════════

exports.getReviews = async (req, res) => {
  try {
    const { rating, limit = 50, page = 1, period = 'all' } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const conditions = []; const params = []; let p = 1;
    if (rating) { conditions.push(`f.rating = $${p++}`); params.push(rating); }
    if (period === 'today')  conditions.push(`DATE(f.created_at) = CURRENT_DATE`);
    if (period === '7days')  conditions.push(`f.created_at >= NOW() - INTERVAL '7 days'`);
    if (period === '30days') conditions.push(`f.created_at >= NOW() - INTERVAL '30 days'`);

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    params.push(parseInt(limit), offset);

    const result = await pool.query(`
      SELECT f.id, f.rating, f.comment, f.created_at, f.chat_id,
             COALESCE(f.resolved, false) as resolved,
             f.resolved_at, f.resolution_note,
             m.content as message_content,
             c.client_domain, c.status as chat_status,
             u.name as user_name, u.email as user_email
      FROM feedback f
      LEFT JOIN messages m ON f.message_id = m.id
      LEFT JOIN chats c    ON f.chat_id    = c.id
      LEFT JOIN users u    ON c.user_id    = u.id
      ${where}
      ORDER BY f.created_at DESC
      LIMIT $${p} OFFSET $${p + 1}
    `, params);

    const countResult = await pool.query(`
      SELECT COUNT(*) as total,
             COUNT(*) FILTER (WHERE rating = 'positive') as positive,
             COUNT(*) FILTER (WHERE rating = 'negative') as negative
      FROM feedback
    `);

    const c    = countResult.rows[0];
    const total    = parseInt(c.total)    || 0;
    const positive = parseInt(c.positive) || 0;
    const negative = parseInt(c.negative) || 0;

    res.status(200).json({
      success: true,
      reviews: result.rows,
      stats: { total, positive, negative, satisfactionRate: total > 0 ? Math.round((positive / total) * 100) : 0 }
    });
  } catch (error) {
    logger.error('Get reviews error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to get reviews' });
  }
};

exports.getFeedbackAnalysis = async (req, res) => {
  try {
    const [daily, domains] = await Promise.all([
      pool.query(`
        SELECT DATE(created_at) as date,
               COUNT(*) FILTER (WHERE rating = 'positive') as positive,
               COUNT(*) FILTER (WHERE rating = 'negative') as negative,
               COUNT(*) as total
        FROM feedback WHERE created_at >= NOW() - INTERVAL '7 days'
        GROUP BY DATE(created_at) ORDER BY date ASC
      `),
      pool.query(`
        SELECT c.client_domain,
               COUNT(*) FILTER (WHERE f.rating = 'negative') as negative_count,
               COUNT(*) FILTER (WHERE f.rating = 'positive') as positive_count,
               COUNT(*) as total
        FROM feedback f LEFT JOIN chats c ON f.chat_id = c.id
        WHERE c.client_domain IS NOT NULL
        GROUP BY c.client_domain ORDER BY negative_count DESC LIMIT 10
      `)
    ]);
    res.status(200).json({ success: true, daily: daily.rows, domains: domains.rows });
  } catch (error) {
    logger.error('Feedback analysis error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to get analysis' });
  }
};

exports.resolveReview = async (req, res) => {
  try {
    const { id }   = req.params;
    const { note } = req.body;
    try {
      await pool.query(
        `UPDATE feedback SET resolved = true, resolved_at = NOW(), resolution_note = $1 WHERE id = $2`,
        [note || '', id]
      );
    } catch (e) {
      logger.warn('resolved column missing:', e.message);
    }
    res.status(200).json({ success: true, message: 'Review resolved' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to resolve review' });
  }
};

// ═══════════════════════════════════════════════
// SETTINGS
// ═══════════════════════════════════════════════

exports.getSettings = async (req, res) => {
  res.status(200).json({
    success: true,
    settings: {
      appName:      process.env.APP_NAME || 'KnowBridge Support',
      mockAuth:     process.env.MOCK_LARAVEL_AUTH === 'true',
      emailEnabled: process.env.ENABLE_EMAIL_NOTIFICATIONS === 'true',
      nodeEnv:      process.env.NODE_ENV || 'development',
    }
  });
};

exports.updateSettings = async (req, res) => {
  res.status(200).json({ success: true, message: 'Settings saved' });
};

module.exports = exports;