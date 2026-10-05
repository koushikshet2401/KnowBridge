const logger = require('../utils/logger');

exports.getNotifications = async (req, res) => {
  res.status(501).json({ success: false, error: 'Not implemented', notifications: [], unreadCount: 0 });
};

exports.markAsRead = async (req, res) => {
  res.status(501).json({ success: false, error: 'Not implemented' });
};

exports.markAllAsRead = async (req, res) => {
  res.status(501).json({ success: false, error: 'Not implemented' });
};

exports.deleteNotification = async (req, res) => {
  res.status(501).json({ success: false, error: 'Not implemented' });
};

exports.createNotification = async (userId, type, message, chatId = null) => {
  // Stub for internal calls
  return {};
};

module.exports = exports;
