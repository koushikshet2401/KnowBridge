const pool   = require('../config/database');
const bcrypt = require('bcryptjs');
const logger = require('../utils/logger');
const { emitToChat } = require('../socket/emit');
const { normalizeDomain } = require('../utils/domain');

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
      closedChats,
      totalReviews,
      positiveReviews,
      negativeReviews
    ] = await Promise.all([
      safeCount(`SELECT COUNT(*) as count FROM chats WHERE tenant_id = $1`, [tenantId]),
      safeCount(`SELECT COUNT(*) as count FROM agents WHERE tenant_id = $1`, [tenantId]),
      safeCount(`SELECT COUNT(*) as count FROM messages WHERE tenant_id = $1 AND sender_type = 'user'`, [tenantId]),
      safeCount(`SELECT COUNT(*) as count FROM chats WHERE tenant_id = $1 AND status = 'active'`, [tenantId]),
      safeCount(`SELECT COUNT(*) as count FROM chats WHERE tenant_id = $1 AND status = 'pending'`, [tenantId]),
      safeCount(`SELECT COUNT(*) as count FROM chats WHERE tenant_id = $1 AND status = 'closed'`, [tenantId]),
      safeCount(`SELECT COUNT(*) as count FROM feedback f LEFT JOIN chats c ON f.chat_id = c.id WHERE COALESCE(f.tenant_id, c.tenant_id) = $1`, [tenantId]),
      safeCount(`SELECT COUNT(*) as count FROM feedback f LEFT JOIN chats c ON f.chat_id = c.id WHERE COALESCE(f.tenant_id, c.tenant_id) = $1 AND f.rating = 'positive'`, [tenantId]),
      safeCount(`SELECT COUNT(*) as count FROM feedback f LEFT JOIN chats c ON f.chat_id = c.id WHERE COALESCE(f.tenant_id, c.tenant_id) = $1 AND f.rating = 'negative'`, [tenantId])
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
        closedChats,
        totalReviews,
        positiveReviews,
        negativeReviews
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

    // Auto-mark notifications for this chat as read for this agent
    try {
      const readRes = await pool.query(
        `UPDATE notifications SET is_read = true WHERE chat_id = $1 AND (user_id = $2 OR agent_id = $2) AND is_read = false RETURNING id`,
        [chatId, req.agent.id]
      );
      if (readRes.rows.length > 0 && global.io && req.agent) {
        global.io.of('/admin').to(`agent:${req.agent.id}`).emit('notifications-updated', { chatId });
      }
    } catch (e) {
      logger.warn(`Failed to auto-mark notifications read on chat open: ${e.message}`);
    }

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

    const agentRes = await pool.query('SELECT id, name, email FROM agents WHERE id = $1', [agentId]);
    const agent = agentRes.rows[0];

    if (global.io) {
      const statusPayload = {
        chatId,
        status: 'active',
        assignedAgentId: agentId,
        agentName: agent ? agent.name : 'Support Agent'
      };
      emitToChat(chatId, 'chat-status-changed', statusPayload);
      emitToChat(chatId, 'chat-assigned', {
        chatId,
        agentId,
        agentName: agent ? agent.name : 'Support Agent'
      });
      global.io.of('/admin').to(`tenant_room_${req.tenant_id}`).emit('chat-status-changed', statusPayload);
      global.io.of('/admin').to(`tenant_room_${req.tenant_id}`).emit('chat-assigned', {
        chatId,
        agentId,
        agentName: agent ? agent.name : 'Support Agent'
      });
    }

    res.status(200).json({ success: true, chat: result.rows[0], agent });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to assign chat' });
  }
};

exports.unassignChat = async (req, res) => {
  try {
    const { chatId } = req.params;

    const result = await pool.query(`
      UPDATE chats 
      SET assigned_agent_id = NULL, status = 'active', updated_at = NOW()
      WHERE id = $1 AND tenant_id = $2 RETURNING *
    `, [chatId, req.tenant_id]);

    if (!result.rows[0]) return res.status(404).json({ success: false, error: 'Chat not found' });

    // Insert a system message recording the handover back to AI
    const msgResult = await pool.query(`
      INSERT INTO messages (tenant_id, chat_id, sender_type, content, created_at)
      VALUES ($1, $2, 'system', 'Support agent returned conversation to AI assistant.', NOW())
      RETURNING *
    `, [req.tenant_id, chatId]);

    const sysMessage = msgResult.rows[0];

    if (global.io) {
      const unassignPayload = {
        chatId,
        status: 'active',
        assignedAgentId: null,
        agentName: null,
        isAi: true
      };
      emitToChat(chatId, 'chat-status-changed', unassignPayload);
      emitToChat(chatId, 'new-message', {
        chatId,
        message: sysMessage
      });
      global.io.of('/admin').to(`tenant_room_${req.tenant_id}`).emit('chat-status-changed', unassignPayload);
    }

    res.status(200).json({ success: true, chat: result.rows[0], message: sysMessage });
  } catch (error) {
    logger.error('Failed to return chat to AI:', error);
    res.status(500).json({ success: false, error: 'Failed to return chat to AI' });
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

    if (!result.rows[0]) return res.status(404).json({ success: false, error: 'Chat not found' });

    if (global.io) {
      const statusPayload = { chatId, status };
      emitToChat(chatId, 'chat-status-changed', statusPayload);
      global.io.of('/admin').to(`tenant_room_${req.tenant_id}`).emit('chat-status-changed', statusPayload);
    }

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
      emitToChat(chatId, 'new-message', { chatId, message });
      emitToChat(chatId, 'chat-status-changed', {
        chatId,
        status: 'active',
        assignedAgentId: agent.id,
        agentName: agent.name
      });
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
    // Default to the authenticated user's email if none or empty provided
    const targetEmail = (email && email.trim()) ? email.trim() : req.agent?.email;

    if (!targetEmail) {
      return res.status(400).json({ success: false, error: 'Email is required' });
    }

    const agentResult = await pool.query(
      `SELECT id, password_hash, email, name, tenant_id FROM agents WHERE email = $1 LIMIT 1`,
      [targetEmail]
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
  try {
    const result = await pool.query('SELECT name, domain FROM tenants WHERE id = $1', [req.tenant_id]);
    if (!result.rows[0]) return res.status(404).json({ success: false, error: 'Tenant not found' });
    res.status(200).json({ success: true, settings: result.rows[0] });
  } catch (error) {
    logger.error('Get settings error:', error);
    res.status(500).json({ success: false, error: 'Failed to load settings' });
  }
};

exports.updateSettings = async (req, res) => {
  try {
    if (!['admin', 'super_admin'].includes(req.agent?.role)) {
      return res.status(403).json({ success: false, error: 'Only admins can change website settings' });
    }
    const { name, domain } = req.body;
    const updates = [];
    const values = [];

    if (name !== undefined) {
      if (!String(name).trim()) return res.status(400).json({ success: false, error: 'Company name cannot be empty' });
      values.push(String(name).trim());
      updates.push(`name = $${values.length}`);
    }
    if (domain !== undefined) {
      const normalized = normalizeDomain(domain);
      if (normalized === undefined) {
        return res.status(400).json({ success: false, error: 'Please enter a valid website domain, e.g. acme.com' });
      }
      if (normalized) {
        const taken = await pool.query('SELECT 1 FROM tenants WHERE domain = $1 AND id <> $2', [normalized, req.tenant_id]);
        if (taken.rows.length > 0) {
          return res.status(400).json({ success: false, error: 'This website domain is already registered' });
        }
      }
      values.push(normalized);
      updates.push(`domain = $${values.length}`);
    }
    if (updates.length === 0) return res.status(400).json({ success: false, error: 'Nothing to update' });

    values.push(req.tenant_id);
    const result = await pool.query(
      `UPDATE tenants SET ${updates.join(', ')} WHERE id = $${values.length} RETURNING name, domain`,
      values
    );
    res.status(200).json({ success: true, settings: result.rows[0] });
  } catch (error) {
    logger.error('Update settings error:', error);
    res.status(500).json({ success: false, error: 'Failed to save settings' });
  }
};

exports.closeChat = async (req, res) => {
  try {
    const { chatId } = req.params;
    const result = await pool.query(
      `UPDATE chats SET status = 'closed', closed_at = NOW(), resolved_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2 RETURNING *`,
      [chatId, req.tenant_id]
    );
    if (!result.rows[0]) return res.status(404).json({ success: false, error: 'Chat not found' });
    emitToChat(chatId, 'chat-closed', { chatId, message: 'This chat has been closed', timestamp: new Date() });
    res.status(200).json({ success: true, chat: result.rows[0] });
  } catch (error) {
    logger.error('Close chat error:', error);
    res.status(500).json({ success: false, error: 'Failed to close chat' });
  }
};

exports.deleteChat = async (req, res) => {
  try {
    const { chatId } = req.params;
    // Verify chat belongs to this tenant before deleting
    const check = await pool.query(
      `SELECT id FROM chats WHERE id = $1 AND tenant_id = $2`,
      [chatId, req.tenant_id]
    );
    if (!check.rows[0]) return res.status(404).json({ success: false, error: 'Chat not found' });

    // Delete notifications, messages first (FK constraints), then the chat
    await pool.query(`DELETE FROM notifications WHERE chat_id = $1`, [chatId]);
    await pool.query(`DELETE FROM messages WHERE chat_id = $1`, [chatId]);
    await pool.query(`DELETE FROM chats WHERE id = $1 AND tenant_id = $2`, [chatId, req.tenant_id]);

    // Notify all admin sockets that this chat was deleted
    const io = req.app.get('io');
    if (io) io.emit('chat-deleted', { chatId });

    res.status(200).json({ success: true, message: 'Chat deleted successfully' });
  } catch (error) {
    logger.error('Delete chat error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete chat' });
  }
};

// Added missing stubs to prevent router crash, but they return 501 Not Implemented in production
exports.getChatStatsByDateRange = async (req, res) => { res.status(501).json({ success: false, error: 'Not Implemented' }); };
exports.getMyChats = async (req, res) => { res.status(501).json({ success: false, error: 'Not Implemented' }); };
exports.updateAgent = async (req, res) => { res.status(501).json({ success: false, error: 'Not Implemented' }); };
exports.deleteAgent = async (req, res) => { res.status(501).json({ success: false, error: 'Not Implemented' }); };
exports.getAgentStats = async (req, res) => { res.status(501).json({ success: false, error: 'Not Implemented' }); };
exports.getReviews = async (req, res) => {
  try {
    const tenantId = req.tenant_id;
    const { rating, period, page = 1, limit = 50 } = req.query;

    const conditions = ['COALESCE(f.tenant_id, c.tenant_id) = $1'];
    const params = [tenantId];

    if (rating && rating !== 'all') {
      params.push(rating);
      conditions.push(`f.rating = $${params.length}`);
    }

    if (period && period !== 'all') {
      if (period === 'today') {
        conditions.push(`f.created_at >= CURRENT_DATE`);
      } else if (period === '7days') {
        conditions.push(`f.created_at >= NOW() - INTERVAL '7 days'`);
      } else if (period === '30days') {
        conditions.push(`f.created_at >= NOW() - INTERVAL '30 days'`);
      }
    }

    const whereClause = conditions.join(' AND ');

    // 1. Fetch filtered reviews list
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit) || 50));
    const offset = (pageNum - 1) * limitNum;

    params.push(limitNum, offset);

    const query = `
      SELECT f.id, f.rating, f.is_positive, f.comment, f.resolved, f.resolved_at, f.resolution_note,
             f.created_at, f.chat_id, f.message_id,
             u.name as user_name, u.email as user_email,
             c.client_domain,
             m.content as message_content
      FROM feedback f
      LEFT JOIN chats c ON f.chat_id = c.id
      LEFT JOIN users u ON f.user_id = u.id
      LEFT JOIN messages m ON f.message_id = m.id
      WHERE ${whereClause}
      ORDER BY f.created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `;

    const result = await pool.query(query, params);

    // 2. Compute summary stats respecting the current period filter
    const statsConditions = ['COALESCE(f.tenant_id, c.tenant_id) = $1'];
    const statsParams = [tenantId];
    if (period && period !== 'all') {
      if (period === 'today') {
        statsConditions.push(`f.created_at >= CURRENT_DATE`);
      } else if (period === '7days') {
        statsConditions.push(`f.created_at >= NOW() - INTERVAL '7 days'`);
      } else if (period === '30days') {
        statsConditions.push(`f.created_at >= NOW() - INTERVAL '30 days'`);
      }
    }

    const statsQuery = `
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE f.rating = 'positive') as positive,
        COUNT(*) FILTER (WHERE f.rating = 'negative') as negative
      FROM feedback f
      LEFT JOIN chats c ON f.chat_id = c.id
      WHERE ${statsConditions.join(' AND ')}
    `;

    const statsResult = await pool.query(statsQuery, statsParams);
    const total = parseInt(statsResult.rows[0]?.total || 0, 10);
    const positive = parseInt(statsResult.rows[0]?.positive || 0, 10);
    const negative = parseInt(statsResult.rows[0]?.negative || 0, 10);
    const satisfactionRate = total > 0 ? Math.round((positive / total) * 100) : 0;

    res.status(200).json({
      success: true,
      reviews: result.rows,
      stats: {
        total,
        positive,
        negative,
        satisfactionRate
      }
    });
  } catch (error) {
    logger.error('Get reviews error:', error.message || error);
    res.status(500).json({ success: false, error: 'Failed to get reviews' });
  }
};

exports.resolveReview = async (req, res) => {
  try {
    const { id } = req.params;
    const { note } = req.body;
    const tenantId = req.tenant_id;

    // Verify review belongs to this tenant
    const reviewCheck = await pool.query(`
      SELECT f.id 
      FROM feedback f
      LEFT JOIN chats c ON f.chat_id = c.id
      WHERE f.id = $1 AND COALESCE(f.tenant_id, c.tenant_id) = $2
    `, [id, tenantId]);

    if (reviewCheck.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Review not found' });
    }

    const result = await pool.query(
      `UPDATE feedback 
       SET resolved = true, resolved_at = NOW(), resolution_note = $1 
       WHERE id = $2 RETURNING *`,
      [note || '', id]
    );

    res.status(200).json({ success: true, message: 'Review resolved', review: result.rows[0] });
  } catch (error) {
    logger.error('Resolve review error:', error.message || error);
    res.status(500).json({ success: false, error: 'Failed to resolve review' });
  }
};

exports.getFeedbackAnalysis = async (req, res) => {
  try {
    const tenantId = req.tenant_id;
    const [daily, domains] = await Promise.all([
      pool.query(`
        SELECT DATE(f.created_at) as date,
               COUNT(*) FILTER (WHERE f.rating = 'positive') as positive,
               COUNT(*) FILTER (WHERE f.rating = 'negative') as negative,
               COUNT(*) as total
        FROM feedback f
        LEFT JOIN chats c ON f.chat_id = c.id
        WHERE COALESCE(f.tenant_id, c.tenant_id) = $1 AND f.created_at >= NOW() - INTERVAL '7 days'
        GROUP BY DATE(f.created_at)
        ORDER BY date ASC
      `, [tenantId]),
      pool.query(`
        SELECT c.client_domain,
               COUNT(*) FILTER (WHERE f.rating = 'negative') as negative_count,
               COUNT(*) FILTER (WHERE f.rating = 'positive') as positive_count,
               COUNT(*) as total
        FROM feedback f
        JOIN chats c ON f.chat_id = c.id
        WHERE c.tenant_id = $1 AND c.client_domain IS NOT NULL
        GROUP BY c.client_domain
        ORDER BY negative_count DESC
        LIMIT 10
      `, [tenantId])
    ]);

    res.status(200).json({ success: true, daily: daily.rows, domains: domains.rows });
  } catch (error) {
    logger.error('Feedback analysis error:', error.message || error);
    res.status(500).json({ success: false, error: 'Failed to get feedback analysis' });
  }
};

module.exports = exports;
