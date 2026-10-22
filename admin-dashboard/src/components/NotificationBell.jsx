import { useState, useEffect, useRef } from 'react'
import { Bell, MessageSquare, UserPlus, AlertCircle, CheckCircle, Check, Sparkles } from 'lucide-react'
import api from '../services/api'
import { getSocket } from '../services/socket'
import { formatDistanceToNow } from 'date-fns'
import { useNavigate } from 'react-router-dom'

const NotificationBell = () => {
  const [notifications, setNotifications] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [isOpen, setIsOpen] = useState(false)
  const [activeTab, setActiveTab] = useState('unread') // 'unread' | 'all'
  const [loading, setLoading] = useState(false)
  const dropdownRef = useRef(null)
  const navigate = useNavigate()

  useEffect(() => {
    fetchNotifications()
    const cleanup = setupSocketListeners()

    // Request browser notification permission
    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'default') {
        Notification.requestPermission()
      }
    }

    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      if (cleanup) cleanup()
    }
  }, [])

  const fetchNotifications = async () => {
    try {
      const response = await api.get('/admin/notifications?limit=20')
      setNotifications(response.data.notifications || [])
      setUnreadCount(response.data.unreadCount || 0)
    } catch (error) {
      console.error('Failed to fetch notifications:', error)
    }
  }

  const setupSocketListeners = () => {
    const socket = getSocket()
    if (!socket) return () => {}

    if (!socket.connected) {
      socket.connect()
    }

    const handleNotificationsUpdated = () => {
      fetchNotifications()
    }

    // General notification
    const handleNotification = (data) => {
      setNotifications(prev => [data, ...prev].slice(0, 25))
      setUnreadCount(prev => prev + 1)
      if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
        new Notification('New Notification', {
          body: data.message,
          icon: '/favicon.ico'
        })
      }
    }

    // Chat assigned
    const handleChatAssigned = (data) => {
      const notification = {
        id: `local-${Date.now()}`,
        type: 'assignment',
        message: `New chat assigned from ${data.userName || 'a customer'}`,
        chat_id: data.chatId,
        is_read: false,
        created_at: new Date().toISOString()
      }
      setNotifications(prev => [notification, ...prev].slice(0, 25))
      setUnreadCount(prev => prev + 1)

      if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
        new Notification('💬 New Chat Assigned', {
          body: notification.message,
          icon: '/favicon.ico'
        })
      }
    }

    // Chat escalated - Human support needed
    const handleChatEscalated = (data) => {
      const notification = {
        id: `local-${Date.now()}`,
        type: 'escalation',
        message: `Human support requested: "${(data.preview || data.userQuestion || 'Customer needs assistance').slice(0, 60)}"`,
        chat_id: data.chatId,
        is_read: false,
        created_at: new Date().toISOString()
      }
      setNotifications(prev => [notification, ...prev].slice(0, 25))
      setUnreadCount(prev => prev + 1)

      if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
        const browserNotif = new Notification('🔔 Human Support Needed!', {
          body: `${data.userName || 'Customer'} needs assistance.\n"${(data.preview || data.userQuestion || '').slice(0, 80)}"`,
          icon: '/favicon.ico',
          requireInteraction: true
        })
        browserNotif.onclick = () => {
          window.focus()
          navigate(`/chats/${data.chatId}`)
        }
      }
    }

    socket.on('notifications-updated', handleNotificationsUpdated)
    socket.on('notification', handleNotification)
    socket.on('chat-assigned', handleChatAssigned)
    socket.on('chat-escalated', handleChatEscalated)

    return () => {
      socket.off('notifications-updated', handleNotificationsUpdated)
      socket.off('notification', handleNotification)
      socket.off('chat-assigned', handleChatAssigned)
      socket.off('chat-escalated', handleChatEscalated)
    }
  }

  const markAsRead = async (notificationId) => {
    try {
      if (typeof notificationId === 'string' && notificationId.startsWith('local-')) {
        setNotifications(prev =>
          prev.map(n => (n.id === notificationId ? { ...n, is_read: true } : n))
        )
        setUnreadCount(prev => Math.max(0, prev - 1))
        return
      }
      await api.put(`/admin/notifications/${notificationId}/read`)
      setNotifications(prev =>
        prev.map(n => (n.id === notificationId ? { ...n, is_read: true } : n))
      )
      setUnreadCount(prev => Math.max(0, prev - 1))
    } catch (error) {
      setNotifications(prev =>
        prev.map(n => (n.id === notificationId ? { ...n, is_read: true } : n))
      )
      setUnreadCount(prev => Math.max(0, prev - 1))
    }
  }

  const handleNotificationClick = (notification) => {
    markAsRead(notification.id)
    const chatId = notification.chat_id || notification.chatId
    if (chatId) {
      navigate(`/chats/${chatId}`)
      setIsOpen(false)
    }
  }

  const markAllAsRead = async () => {
    try {
      await api.put('/admin/notifications/read-all')
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
      setUnreadCount(0)
    } catch (error) {
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
      setUnreadCount(0)
    }
  }

  const getNotificationIcon = (type) => {
    switch (type) {
      case 'assignment':
        return (
          <div className="w-8 h-8 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
            <UserPlus className="h-4 w-4" />
          </div>
        )
      case 'escalation':
        return (
          <div className="w-8 h-8 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
            <AlertCircle className="h-4 w-4" />
          </div>
        )
      case 'message':
        return (
          <div className="w-8 h-8 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <MessageSquare className="h-4 w-4" />
          </div>
        )
      default:
        return (
          <div className="w-8 h-8 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center shrink-0">
            <Bell className="h-4 w-4" />
          </div>
        )
    }
  }

  const displayedNotifications = activeTab === 'unread'
    ? notifications.filter(n => !n.is_read)
    : notifications

  return (
    <div className="relative inline-block" ref={dropdownRef}>
      {/* Bell Button */}
      <button
        onClick={() => {
          setIsOpen(!isOpen)
          if (!isOpen) fetchNotifications()
        }}
        aria-label="Notifications"
        className="relative p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-100/80 rounded-lg transition-colors focus:outline-none"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute top-1.5 right-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white ring-2 ring-white animate-in zoom-in-50">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown Panel */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-96 max-w-[calc(100vw-2rem)] bg-white rounded-xl shadow-2xl border border-gray-100 z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
          {/* Header */}
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between bg-white">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-gray-900">Notifications</span>
              {unreadCount > 0 && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-600 border border-red-100">
                  {unreadCount} unread
                </span>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                className="text-xs font-medium text-blue-600 hover:text-blue-800 transition-colors flex items-center gap-1"
              >
                <Check className="h-3.5 w-3.5" />
                Mark all read
              </button>
            )}
          </div>

          {/* Tabs Filter */}
          <div className="flex border-b border-gray-100 bg-gray-50/70 px-4 pt-1 gap-4 text-xs font-medium">
            <button
              onClick={() => setActiveTab('unread')}
              className={`pb-2.5 transition-colors border-b-2 relative ${
                activeTab === 'unread'
                  ? 'border-blue-600 text-blue-600 font-semibold'
                  : 'border-transparent text-gray-500 hover:text-gray-800'
              }`}
            >
              Unread ({unreadCount})
            </button>
            <button
              onClick={() => setActiveTab('all')}
              className={`pb-2.5 transition-colors border-b-2 relative ${
                activeTab === 'all'
                  ? 'border-blue-600 text-blue-600 font-semibold'
                  : 'border-transparent text-gray-500 hover:text-gray-800'
              }`}
            >
              All Notifications
            </button>
          </div>

          {/* Notifications List */}
          <div className="max-h-[380px] overflow-y-auto divide-y divide-gray-50">
            {loading ? (
              <div className="flex items-center justify-center py-10">
                <div className="animate-spin rounded-full h-5 w-5 border-2 border-blue-600 border-t-transparent" />
              </div>
            ) : displayedNotifications.length === 0 ? (
              <div className="text-center py-10 px-4">
                <div className="w-10 h-10 rounded-full bg-gray-50 text-gray-400 mx-auto flex items-center justify-center mb-2">
                  <CheckCircle className="h-5 w-5" />
                </div>
                <p className="text-xs font-medium text-gray-700">
                  {activeTab === 'unread' ? 'No unread notifications' : 'No notifications yet'}
                </p>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  You are all caught up!
                </p>
              </div>
            ) : (
              displayedNotifications.map((notification) => {
                const isUnread = !notification.is_read
                return (
                  <div
                    key={notification.id}
                    onClick={() => handleNotificationClick(notification)}
                    className={`p-3.5 flex items-start gap-3 cursor-pointer transition-colors text-left ${
                      isUnread
                        ? 'bg-blue-50/30 hover:bg-blue-50/60'
                        : 'bg-white hover:bg-gray-50/80'
                    }`}
                  >
                    {getNotificationIcon(notification.type)}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className={`text-xs leading-snug line-clamp-2 ${
                          isUnread ? 'font-semibold text-gray-900' : 'text-gray-700 font-normal'
                        }`}>
                          {notification.message}
                        </p>
                        {isUnread && (
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-600 shrink-0" />
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-1.5 text-[11px] text-gray-400">
                        <span>
                          {notification.created_at
                            ? formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })
                            : 'Just now'}
                        </span>
                        {notification.type === 'escalation' && (
                          <span className="text-[10px] font-medium text-amber-700 bg-amber-50 px-1.5 py-0.2 rounded">
                            Action required
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default NotificationBell