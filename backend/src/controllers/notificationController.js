const logger = require('../utils/logger');
const Notification = require('../models/Notification');

exports.getNotifications = async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 10, 50);
    const [notifications, unreadCount] = await Promise.all([
      Notification.findAll(req.agent.id, { limit }),
      Notification.getUnreadCount(req.agent.id)
    ]);
    res.status(200).json({ success: true, notifications, unreadCount });
  } catch (error) {
    logger.error('Get notifications error:', error);
    res.status(500).json({ success: false, error: 'Failed to load notifications' });
  }
};

exports.markAsRead = async (req, res) => {
  try {
    const id = req.params.id || req.params.notificationId;
    const notification = await Notification.markAsRead(id, req.agent.id);
    if (!notification) return res.status(404).json({ success: false, error: 'Notification not found' });
    res.status(200).json({ success: true, notification });
  } catch (error) {
    logger.error('Mark notification read error:', error);
    res.status(500).json({ success: false, error: 'Failed to update notification' });
  }
};

exports.markChatNotificationsAsRead = async (req, res) => {
  try {
    const { chatId } = req.params;
    if (!chatId) return res.status(400).json({ success: false, error: 'Chat ID required' });
    const updated = await Notification.markChatNotificationsAsRead(chatId, req.agent.id);
    if (global.io && req.agent) {
      global.io.of('/admin').to(`agent:${req.agent.id}`).emit('notifications-updated', { chatId });
    }
    res.status(200).json({ success: true, updated: updated ? updated.length : 0 });
  } catch (error) {
    logger.error('Mark chat notifications read error:', error);
    res.status(500).json({ success: false, error: 'Failed to update notifications' });
  }
};

exports.markAllAsRead = async (req, res) => {
  try {
    const updated = await Notification.markAllAsRead(req.agent.id);
    if (global.io && req.agent) {
      global.io.of('/admin').to(`agent:${req.agent.id}`).emit('notifications-updated', { all: true });
    }
    res.status(200).json({ success: true, updated: updated.length });
  } catch (error) {
    logger.error('Mark all notifications read error:', error);
    res.status(500).json({ success: false, error: 'Failed to update notifications' });
  }
};

exports.deleteNotification = async (req, res) => {
  try {
    const id = req.params.id || req.params.notificationId;
    const notification = await Notification.delete(id, req.agent.id);
    if (!notification) return res.status(404).json({ success: false, error: 'Notification not found' });
    res.status(200).json({ success: true });
  } catch (error) {
    logger.error('Delete notification error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete notification' });
  }
};

exports.createNotification = async (userId, type, message, chatId = null) => {
  return Notification.create({ userId, type, message, chatId });
};

module.exports = exports;
