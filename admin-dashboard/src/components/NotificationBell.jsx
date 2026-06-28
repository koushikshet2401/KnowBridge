import { useState, useEffect, useRef } from 'react'
import { Bell, MessageSquare, UserPlus, AlertCircle, CheckCircle, X } from 'lucide-react'
import api from '../services/api'
import { getSocket } from '../services/socket'
import { formatDistanceToNow } from 'date-fns'
import { useNavigate } from 'react-router-dom'

const NotificationBell = () => {
  const [notifications, setNotifications] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [isOpen, setIsOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const dropdownRef = useRef(null)
  const navigate = useNavigate()

  useEffect(() => {
    fetchNotifications()
    setupSocketListeners()

    // Request browser notification permission
    if (Notification.permission === 'default') {
      Notification.requestPermission()
    }

    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const fetchNotifications = async () => {
    setLoading(true)
    try {
      const response = await api.get('/admin/notifications?limit=10')
      setNotifications(response.data.notifications || [])
      setUnreadCount(response.data.unreadCount || 0)
    } catch (error) {
      console.error('Failed to fetch notifications:', error)
    } finally {
      setLoading(false)
    }
  }

  const setupSocketListeners = () => {
    const socket = getSocket()
    if (!socket) return

    // General notification
    socket.on('notification', (data) => {
      setNotifications(prev => [data, ...prev].slice(0, 10))
      setUnreadCount(prev => prev + 1)
      if (Notification.permission === 'granted') {
        new Notification('New Notification', {
          body: data.message,
          icon: '/favicon.ico'
        })
      }
    })

    // Chat assigned
    socket.on('chat-assigned', (data) => {
      const notification = {
        id: Date.now(),
        type: 'assignment',
        message: `New chat assigned from ${data.userName || 'a user'}`,
        chat_id: data.chatId,
        is_read: false,
        created_at: new Date().toISOString()
      }
      setNotifications(prev => [notification, ...prev].slice(0, 10))
      setUnreadCount(prev => prev + 1)

      if (Notification.permission === 'granted') {
        new Notification('💬 New Chat Assigned', {
          body: notification.message,
          icon: '/favicon.ico'
        })
      }
    })

    // ✅ Chat escalated - Human support needed
    socket.on('chat-escalated', (data) => {
      const notification = {
        id: Date.now(),
        type: 'escalation',
        message: `Human support needed: "${(data.userQuestion || '').slice(0, 60)}..."`,
        chat_id: data.chatId,
        is_read: false,
        created_at: new Date().toISOString()
      }
      setNotifications(prev => [notification, ...prev].slice(0, 10))
      setUnreadCount(prev => prev + 1)

      // Browser notification
      if (Notification.permission === 'granted') {
        const browserNotif = new Notification('🔔 Human Support Needed!', {
          body: `${data.userName || 'A user'} needs human assistance.\nQuestion: "${(data.userQuestion || '').slice(0, 80)}"`,
          icon: '/favicon.ico',
          requireInteraction: true
        })
        browserNotif.onclick = () => {
          window.focus()
          navigate(`/chats/${data.chatId}`)
        }
      }

      // Auto-open notification dropdown
      setIsOpen(true)
    })
  }

  const markAsRead = async (notificationId) => {
    try {
      await api.put(`/admin/notifications/${notificationId}/read`)
      setNotifications(prev =>
        prev.map(n => (n.id === notificationId ? { ...n, is_read: true } : n))
      )
      setUnreadCount(prev => Math.max(0, prev - 1))
    } catch (error) {
      // Mark locally even if API fails
      setNotifications(prev =>
        prev.map(n => (n.id === notificationId ? { ...n, is_read: true } : n))
      )
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
      case 'assignment': return <UserPlus className="h-5 w-5 text-blue-600" />
      case 'escalation': return <AlertCircle className="h-5 w-5 text-red-500" />
      case 'message': return <MessageSquare className="h-5 w-5 text-green-600" />
      default: return <Bell className="h-5 w-5 text-gray-600" />
    }
  }

  const getNotificationBg = (notification) => {
    if (notification.is_read) return ''
    if (notification.type === 'escalation') return 'bg-red-50 border-l-4 border-red-400'
    return 'bg-blue-50'
  }

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell Icon */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
      >
        <Bell className="h-6 w-6" />
        {unreadCount > 0 && (
          <span className="absolute top-0 right-0 inline-flex items-center justify-center px-1.5 py-0.5 text-xs font-bold leading-none text-white bg-red-600 rounded-full min-w-[18px]">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-96 bg-white rounded-xl shadow-xl border border-gray-200 z-50">
          {/* Header */}
          <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-gray-900">Notifications</h3>
              {unreadCount > 0 && (
                <span className="bg-red-100 text-red-700 text-xs px-2 py-0.5 rounded-full font-medium">
                  {unreadCount} new
                </span>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                className="text-xs text-primary-600 hover:text-primary-700 font-medium"
              >
                Mark all read
              </button>
            )}
          </div>

          {/* Notifications List */}
          <div className="max-h-[480px] overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600" />
              </div>
            ) : notifications.length === 0 ? (
              <div className="text-center py-8">
                <CheckCircle className="mx-auto h-8 w-8 text-gray-300" />
                <p className="mt-2 text-sm text-gray-500">All caught up!</p>
              </div>
            ) : (
              notifications.map((notification) => (
                <div
                  key={notification.id}
                  onClick={() => handleNotificationClick(notification)}
                  className={`px-4 py-3 border-b border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors ${getNotificationBg(notification)}`}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 mt-0.5">
                      {getNotificationIcon(notification.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm ${!notification.is_read ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>
                        {notification.message}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })}
                      </p>
                      {notification.type === 'escalation' && !notification.is_read && (
                        <span className="inline-flex items-center mt-1 text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">
                          ⚡ Click to open chat
                        </span>
                      )}
                    </div>
                    {!notification.is_read && (
                      <div className="w-2 h-2 bg-primary-600 rounded-full flex-shrink-0 mt-1.5" />
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default NotificationBell