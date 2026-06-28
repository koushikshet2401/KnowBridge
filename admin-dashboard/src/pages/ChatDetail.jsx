import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../services/api'
import { getSocket } from '../services/socket'
import { ArrowLeft, Send, User, Bot, UserCheck, AlertCircle } from 'lucide-react'
import { format, formatDistanceToNow } from 'date-fns'

const ChatDetail = () => {
  const { chatId } = useParams()
  const navigate = useNavigate()
  const [chat, setChat] = useState(null)
  const [messages, setMessages] = useState([])
  const [agents, setAgents] = useState([])
  const [domainChats, setDomainChats] = useState([])
  const [loading, setLoading] = useState(true)
  const [replyText, setReplyText] = useState('')
  const [sending, setSending] = useState(false)
  const [assigning, setAssigning] = useState(false)
  const messagesEndRef = useRef(null)
  const messageIdsRef = useRef(new Set()) // ✅ Track message IDs to prevent duplicates

  useEffect(() => {
    fetchChatDetails()
    fetchAgents()
    const cleanup = setupSocketListeners()
    return cleanup
  }, [chatId])

  useEffect(() => {
    if (chat?.client_domain) {
      fetchDomainChats(chat.client_domain)
    }
  }, [chat?.client_domain])

  const fetchDomainChats = async (domain) => {
    try {
      const response = await api.get(`/admin/chats?search=${encodeURIComponent(domain)}`)
      const strictlyDomain = (response.data.chats || []).filter(c => c.client_domain === domain)
      setDomainChats(strictlyDomain)
    } catch (error) {
      console.error('Failed to fetch domain chats:', error)
    }
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  const setupSocketListeners = () => {
    const socket = getSocket()
    if (!socket) return () => {}

    socket.emit('join-chat', { chatId })

    const handleNewMessage = (data) => {
      const message = data.message || data
      const msgChatId = data.chatId || message.chat_id
      
      if (String(msgChatId) !== String(chatId)) return
      
      // ✅ Prevent duplicate messages using ID tracking
      if (message.id && messageIdsRef.current.has(message.id)) return
      if (message.id) messageIdsRef.current.add(message.id)

      setMessages(prev => [...prev, message])
    }

    socket.on('new-message', handleNewMessage)

    return () => {
      socket.off('new-message', handleNewMessage)
    }
  }

  const fetchChatDetails = async () => {
    try {
      const response = await api.get(`/admin/chats/${chatId}`)
      const chatData = response.data.chat
      const messagesData = response.data.messages || []
      
      setChat(chatData)
      
      // ✅ Initialize message ID tracking set
      const idSet = new Set(messagesData.map(m => m.id).filter(Boolean))
      messageIdsRef.current = idSet
      setMessages(messagesData)
    } catch (error) {
      console.error('Failed to fetch chat:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchAgents = async () => {
    try {
      const response = await api.get('/admin/agents')
      setAgents(response.data.agents || [])
    } catch (error) {
      console.error('Failed to fetch agents:', error)
    }
  }

  // ✅ Fixed: No fetchChatDetails() after send - socket handles it
  const handleSendReply = async (e) => {
    e.preventDefault()
    if (!replyText.trim() || sending) return

    const messageText = replyText.trim()
    setSending(true)
    setReplyText('')

    try {
      const response = await api.post(`/admin/chats/${chatId}/messages`, {
        content: messageText
      })
      // The backend auto-assigns the chat to the responding agent and sets status to active.
      // We must update the local state so the "Return to AI" button appears immediately!
      if (!chat.assigned_to || chat.status !== 'active') {
        const agentId = JSON.parse(localStorage.getItem('knowbridge_admin_user') || '{}').id;
        setChat(prev => ({ ...prev, assigned_to: prev.assigned_to || agentId, status: 'active' }));
      }
      // ✅ Don't call fetchChatDetails() - socket delivers the new message
    } catch (error) {
      console.error('Failed to send reply:', error)
      setReplyText(messageText) // Restore text on failure
      alert('Failed to send message')
    } finally {
      setSending(false)
    }
  }

  const handleAssignChat = async (agentId) => {
    if (!agentId) return
    setAssigning(true)
    try {
      await api.patch(`/admin/chats/${chatId}/assign`, { agentId })
      fetchChatDetails()
    } catch (error) {
      console.error('Failed to assign chat:', error)
      alert('Failed to assign chat')
    } finally {
      setAssigning(false)
    }
  }

  const handleUnassignChat = async () => {
    setAssigning(true)
    try {
      await api.post(`/admin/chats/${chatId}/unassign`)
      fetchChatDetails()
    } catch (error) {
      console.error('Failed to unassign chat:', error)
      alert('Failed to return chat to AI')
    } finally {
      setAssigning(false)
    }
  }

  const handleCloseChat = async () => {
    if (!confirm('Are you sure you want to close this chat?')) return
    try {
      await api.post(`/admin/chats/${chatId}/close`)
      fetchChatDetails()
    } catch (error) {
      console.error('Failed to close chat:', error)
    }
  }

  const getMessageSenderName = (message) => {
    if (message.sender_type === 'user') return chat?.user_name || 'User'
    if (message.sender_type === 'ai') return 'AI Assistant'
    return message.agent_name || 'Agent'
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600" />
      </div>
    )
  }

  if (!chat) {
    return (
      <div className="text-center py-12">
        <h3 className="text-lg font-medium text-gray-900">Chat not found</h3>
      </div>
    )
  }

  return (
    <div className="flex h-[calc(100vh-8rem)]">
      {/* Left Panel: Domain Conversations */}
      <div className="w-80 bg-white border-r border-gray-200 flex flex-col hidden lg:flex shadow-sm z-10">
        <div className="p-4 border-b border-gray-200 bg-gray-50">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
            Domain: {chat?.client_domain || 'Unknown'}
          </h2>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {domainChats.map(c => (
            <button
              key={c.id}
              onClick={() => navigate(`/chats/${c.id}`)}
              className={`w-full text-left p-3 rounded-xl border transition-all ${
                String(c.id) === String(chatId) 
                  ? 'bg-primary-50 border-primary-200 shadow-sm' 
                  : 'bg-white border-transparent hover:bg-gray-50 hover:border-gray-200'
              }`}
            >
              <div className="flex justify-between items-start mb-1">
                <span className={`font-semibold text-sm ${String(c.id) === String(chatId) ? 'text-primary-700' : 'text-gray-900'}`}>
                  Conversation #{c.id}
                </span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium uppercase tracking-wide ${
                  c.status === 'open' || c.status === 'active' 
                    ? 'bg-green-100 text-green-700' 
                    : c.status === 'pending'
                    ? 'bg-yellow-100 text-yellow-700'
                    : 'bg-gray-100 text-gray-600'
                }`}>
                  {c.status}
                </span>
              </div>
              <div className="text-xs text-gray-500 flex items-center justify-between">
                <span className="truncate pr-2">{c.user_name || 'Anonymous'}</span>
                <span className="flex-shrink-0 opacity-75">{formatDistanceToNow ? formatDistanceToNow(new Date(c.created_at)) : ''}</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Center Panel: Main Chat View */}
      <div className="flex-1 flex flex-col bg-white overflow-hidden">
        {/* Header */}
      <div className="bg-white shadow-sm px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={() => navigate('/chats')} className="text-gray-500 hover:text-gray-700">
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div>
              <h1 className="text-lg font-semibold text-gray-900">{chat.user_name || 'Anonymous'}</h1>
              <p className="text-sm text-gray-500">{chat.user_email}</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Escalation badge */}
            {chat.status === 'pending' && (
              <span className="flex items-center gap-1 px-3 py-1 bg-red-100 text-red-700 rounded-full text-sm font-medium animate-pulse">
                <AlertCircle className="h-4 w-4" />
                Needs Human Support
              </span>
            )}

            {/* Assignment */}
            <select
              value={chat.assigned_to || ''}
              onChange={e => handleAssignChat(e.target.value)}
              disabled={assigning || chat.status === 'closed'}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-50"
            >
              <option value="">Assign to...</option>
              {agents.map(agent => (
                <option key={agent.id} value={agent.id}>
                  {agent.name} {agent.is_available ? '✓' : '(unavailable)'}
                </option>
              ))}
            </select>

            {/* Handover to AI button */}
            {(chat.assigned_to || chat.status === 'pending') && chat.status !== 'closed' && (
              <button
                onClick={handleUnassignChat}
                disabled={assigning}
                className="px-3 py-1.5 text-sm bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 focus:outline-none disabled:opacity-50 font-medium whitespace-nowrap"
              >
                Return to AI
              </button>
            )}

            {/* Status */}
            <span className={`px-3 py-1 rounded-full text-sm font-medium whitespace-nowrap ${
              chat.status === 'active' ? 'bg-green-100 text-green-800' :
              chat.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
              'bg-gray-100 text-gray-800'
            }`}>
              {chat.status}
            </span>

            {/* Close button */}
            {chat.status !== 'closed' && (
              <button
                onClick={handleCloseChat}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700"
              >
                Close Chat
              </button>
            )}
          </div>
        </div>

        {chat.agent_name && (
          <div className="mt-2 flex items-center text-sm text-gray-500">
            <UserCheck className="h-4 w-4 mr-1" />
            Assigned to: <span className="font-medium ml-1">{chat.agent_name}</span>
          </div>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto bg-gray-50 px-6 py-4">
        <div className="space-y-4">
          {messages.map((message, index) => (
            <div
              key={message.id || index}
              className={`flex ${message.sender_type === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div className={`flex max-w-lg ${message.sender_type === 'user' ? 'flex-row-reverse' : 'flex-row'} items-start gap-2`}>
                {/* Avatar */}
                <div className={`flex-shrink-0 h-8 w-8 rounded-full flex items-center justify-center ${
                  message.sender_type === 'user' ? 'bg-primary-500' :
                  message.sender_type === 'ai' ? 'bg-purple-500' : 'bg-green-500'
                }`}>
                  {message.sender_type === 'user' ? <User className="h-4 w-4 text-white" /> :
                   message.sender_type === 'ai' ? <Bot className="h-4 w-4 text-white" /> :
                   <UserCheck className="h-4 w-4 text-white" />}
                </div>

                {/* Message bubble */}
                <div className={message.sender_type === 'user' ? 'mr-2' : 'ml-2'}>
                  <div className={`rounded-xl px-4 py-2.5 ${
                    message.sender_type === 'user'
                      ? 'bg-primary-600 text-white'
                      : 'bg-white text-gray-900 shadow-sm border border-gray-100'
                  }`}>
                    <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                  </div>
                  <div className={`mt-1 text-xs text-gray-400 px-1 ${message.sender_type === 'user' ? 'text-right' : 'text-left'}`}>
                    <span className="font-medium">{getMessageSenderName(message)}</span>
                    {' · '}
                    <span>{format(new Date(message.created_at), 'MMM d, h:mm a')}</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Reply Box */}
      {chat.status !== 'closed' && (
        <div className="bg-white border-t px-6 py-4">
          {chat.status === 'pending' && (
            <div className="mb-3 flex items-center gap-2 text-sm text-orange-600 bg-orange-50 px-3 py-2 rounded-lg">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <span>This chat was escalated — AI couldn't answer. Please reply manually.</span>
            </div>
          )}
          <form onSubmit={handleSendReply} className="flex gap-3">
            <input
              type="text"
              value={replyText}
              onChange={e => setReplyText(e.target.value)}
              placeholder={chat.status === 'pending' ? 'Reply to user...' : 'Type your message...'}
              className="flex-1 px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500"
              autoFocus
            />
            <button
              type="submit"
              disabled={sending || !replyText.trim()}
              className="px-6 py-2.5 bg-primary-600 text-white rounded-xl hover:bg-primary-700 disabled:opacity-50 flex items-center gap-2 font-medium"
            >
              <Send className="h-4 w-4" />
              {sending ? 'Sending...' : 'Send'}
            </button>
          </form>
        </div>
      )}
      </div>
    </div>
  )
}

export default ChatDetail