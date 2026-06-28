const Notification = require('../models/Notification');
const logger = require('../utils/logger');

exports.getNotifications = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const userId = req.agent.id;

    const notifications = await Notification.findAll(userId, { 
      limit,
      includeRead: true 
    });

    const unreadCount = await Notification.getUnreadCount(userId);

    res.status(200).json({
      success: true,
      notifications,
      unreadCount
    });
  } catch (error) {
    logger.error('Get notifications error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get notifications'
    });
  }
};

exports.markAsRead = async (req, res) => {
  try {
    const { notificationId } = req.params;
    const userId = req.agent.id;

    const notification = await Notification.markAsRead(notificationId, userId);

    if (!notification) {
      return res.status(404).json({
        success: false,
        error: 'Notification not found'
      });
    }

    res.status(200).json({
      success: true,
      notification
    });
  } catch (error) {
    logger.error('Mark as read error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to mark notification as read'
    });
  }
};

exports.markAllAsRead = async (req, res) => {
  try {
    const userId = req.agent.id;

    const count = await Notification.markAllAsRead(userId);

    res.status(200).json({
      success: true,
      count
    });
  } catch (error) {
    logger.error('Mark all as read error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to mark all as read'
    });
  }
};

exports.deleteNotification = async (req, res) => {
  try {
    const { notificationId } = req.params;
    const userId = req.agent.id;

    const notification = await Notification.delete(notificationId, userId);

    if (!notification) {
      return res.status(404).json({
        success: false,
        error: 'Notification not found'
      });
    }

    res.status(200).json({
      success: true
    });
  } catch (error) {
    logger.error('Delete notification error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete notification'
    });
  }
};

exports.createNotification = async (userId, type, message, chatId = null) => {
  try {
    const notification = await Notification.create({
      userId,
      type,
      message,
      chatId
    });

    return notification;
  } catch (error) {
    logger.error('Create notification error:', error);
    throw error;
  }
};

module.exports = exports;