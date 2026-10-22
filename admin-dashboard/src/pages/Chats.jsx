import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import api from '../services/api'
import { getSocket } from '../services/socket'
import {
  MessageSquare, User, Clock, Search,
  RefreshCw, CheckCircle, AlertCircle, XCircle,
  MoreVertical, Copy, Trash2
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

const Chats = () => {
  const [chats, setChats]           = useState([])
  const [loading, setLoading]       = useState(true)
  const [activeTab, setActiveTab]   = useState('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [total, setTotal]           = useState(0)
  const [openKebab, setOpenKebab]   = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting, setDeleting]     = useState(false)
  const [copyFeedback, setCopyFeedback] = useState(null)
  const navigate = useNavigate()

  const shortId = (id) => id ? id.slice(-6).toUpperCase() : '?'

  useEffect(() => {
    fetchChats()

    const socket = getSocket()
    if (!socket) return

    const handleUpdate = () => {
      fetchChats()
    }

    socket.on('chat-escalated', handleUpdate)
    socket.on('chat-status-changed', handleUpdate)
    socket.on('chat-assigned', handleUpdate)

    const handleDeleted = (data) => {
      if (!data?.chatId) return
      setChats(prev => prev.filter(c => String(c.id) !== String(data.chatId)))
      setTotal(prev => Math.max(0, prev - 1))
    }
    socket.on('chat-deleted', handleDeleted)

    return () => {
      socket.off('chat-escalated', handleUpdate)
      socket.off('chat-status-changed', handleUpdate)
      socket.off('chat-assigned', handleUpdate)
      socket.off('chat-deleted', handleDeleted)
    }
  }, [activeTab])

  const fetchChats = async () => {
    setLoading(true)
    try {
      // ✅ Single endpoint with status param - correct way
      const params = new URLSearchParams()
      if (activeTab !== 'all') params.append('status', activeTab)
      if (searchTerm.trim())  params.append('search', searchTerm.trim())

      const response = await api.get(`/admin/chats?${params.toString()}`)
      setChats(response.data.chats || [])
      setTotal(response.data.total || response.data.chats?.length || 0)
    } catch (error) {
      console.error('Failed to fetch chats:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSearch = (e) => {
    e.preventDefault()
    fetchChats()
  }

  const handleCopyId = (id, e) => {
    e?.preventDefault()
    e?.stopPropagation()
    navigator.clipboard.writeText(id).catch(() => {})
    setCopyFeedback(id)
    setTimeout(() => setCopyFeedback(null), 2000)
    setOpenKebab(null)
  }

  const handleDeleteChat = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await api.delete(`/admin/chats/${deleteTarget.id}`)
      setChats(prev => prev.filter(c => String(c.id) !== String(deleteTarget.id)))
      setTotal(prev => Math.max(0, prev - 1))
    } catch (err) {
      console.error('Delete chat failed:', err)
      alert(err.response?.data?.error || 'Failed to delete chat')
    } finally {
      setDeleting(false)
      setDeleteTarget(null)
    }
  }

  // Client-side search filter (instant feedback)
  const filteredChats = chats.filter(chat => {
    if (!searchTerm.trim()) return true
    const term = searchTerm.toLowerCase()
    return (
      chat.user_name?.toLowerCase().includes(term)   ||
      chat.user_email?.toLowerCase().includes(term)  ||
      chat.client_domain?.toLowerCase().includes(term)
    )
  })

  const getStatusBadge = (status) => {
    switch (status) {
      case 'active':  return 'bg-green-100 text-green-800'
      case 'pending': return 'bg-yellow-100 text-yellow-800'
      case 'closed':  return 'bg-gray-100 text-gray-700'
      default:        return 'bg-blue-100 text-blue-800'
    }
  }

  const getStatusIcon = (status) => {
    switch (status) {
      case 'active':  return <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
      case 'pending': return <AlertCircle className="h-4 w-4 text-yellow-500 flex-shrink-0" />
      case 'closed':  return <XCircle     className="h-4 w-4 text-gray-400 flex-shrink-0" />
      default:        return <MessageSquare className="h-4 w-4 text-blue-400 flex-shrink-0" />
    }
  }

  const tabs = [
    { id: 'all',     label: 'All Chats' },
    { id: 'active',  label: 'Active'    },
    { id: 'pending', label: 'Pending'   },
    { id: 'closed',  label: 'Closed'    },
  ]

  return (
    <>
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Conversations</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage all customer conversations ({total})
          </p>
        </div>
        <button
          onClick={fetchChats}
          className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <RefreshCw className="h-5 w-5" />
        </button>
      </div>

      {/* Search */}
      <form onSubmit={handleSearch} className="flex gap-3">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search by name, email or domain..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
        <button
          type="submit"
          className="px-5 py-2.5 bg-primary-600 text-white rounded-xl hover:bg-primary-700 font-medium"
        >
          Search
        </button>
      </form>

      {/* Filter Tabs + List */}
      <div className="bg-white shadow-sm rounded-xl border border-gray-100 overflow-hidden">
        {/* Tabs */}
        <div className="border-b border-gray-200 px-6 pt-4">
          <nav className="flex space-x-8">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id)
                  setSearchTerm('')
                }}
                className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'border-primary-500 text-primary-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Chat List */}
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600" />
          </div>
        ) : filteredChats.length === 0 ? (
          <div className="text-center py-16">
            <MessageSquare className="mx-auto h-12 w-12 text-gray-300 mb-3" />
            <h3 className="text-sm font-medium text-gray-900">No conversations found</h3>
            <p className="mt-1 text-sm text-gray-500">
              {searchTerm
                ? 'Try adjusting your search'
                : activeTab !== 'all'
                  ? `No ${activeTab} conversations`
                  : 'No conversations yet'
              }
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {filteredChats.map(chat => (
              <li key={chat.id} className="relative group">
                <Link
                  to={`/chats/${chat.id}`}
                  className="block hover:bg-gray-50 transition-colors"
                >
                  <div className="px-6 py-4 pr-12">
                    <div className="flex items-center justify-between gap-4">
                      {/* Left: user info */}
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className="h-10 w-10 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0">
                          <User className="h-5 w-5 text-primary-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-semibold text-gray-900">
                              {chat.user_name || 'Anonymous'}
                            </p>
                            <span className="text-[11px] font-mono text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
                              #{shortId(chat.id)}
                            </span>
                            {chat.client_domain && (
                              <span className="text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                                {chat.client_domain}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            {chat.user_email && (
                              <p className="text-xs text-gray-500 truncate">{chat.user_email}</p>
                            )}
                          </div>
                          {chat.last_message && (
                            <p className="text-xs text-gray-400 truncate mt-0.5 max-w-sm">
                              {chat.last_message}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Right: status + time + assigned */}
                      <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                        <div className="flex items-center gap-2">
                          {getStatusIcon(chat.status)}
                          <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusBadge(chat.status)}`}>
                            {chat.status}
                          </span>
                        </div>
                        <div className="flex items-center text-xs text-gray-400 gap-1">
                          <Clock className="h-3 w-3" />
                          {chat.updated_at
                            ? formatDistanceToNow(new Date(chat.updated_at), { addSuffix: true })
                            : '—'
                          }
                        </div>
                        {chat.agent_name && (
                          <p className="text-xs text-gray-400">
                            Agent: {chat.agent_name}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </Link>

                {/* 3-dot kebab menu — visible on hover */}
                <div className="absolute top-4 right-4">
                  <button
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpenKebab(openKebab === chat.id ? null : chat.id) }}
                    className={`w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-200 transition-all ${
                      openKebab === chat.id ? 'opacity-100 bg-gray-200' : 'opacity-0 group-hover:opacity-100'
                    }`}
                    title="Options"
                  >
                    <MoreVertical className="h-4 w-4" />
                  </button>

                  {openKebab === chat.id && (
                    <div
                      className="absolute right-0 top-8 z-50 w-48 bg-white rounded-xl shadow-lg border border-gray-100 py-1 text-sm"
                      onClick={e => { e.preventDefault(); e.stopPropagation() }}
                    >
                      <button
                        onClick={(e) => handleCopyId(chat.id, e)}
                        className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-gray-700 hover:bg-gray-50 transition-colors"
                      >
                        <Copy className="h-4 w-4 text-gray-400" />
                        {copyFeedback === chat.id ? '✅ Copied!' : 'Copy Chat ID'}
                      </button>
                      <div className="border-t border-gray-100 my-1" />
                      <button
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setDeleteTarget({ id: chat.id, shortId: shortId(chat.id) }); setOpenKebab(null) }}
                        className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-red-600 hover:bg-red-50 transition-colors"
                      >
                        <Trash2 className="h-4 w-4" />
                        Delete Chat
                      </button>
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>

    {/* Click-outside to close kebab */}
    {openKebab && (
      <div className="fixed inset-0 z-40" onClick={() => setOpenKebab(null)} />
    )}

    {/* Delete Confirmation Modal */}
    {deleteTarget && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
        <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm mx-4">
          <div className="flex items-center justify-center w-12 h-12 rounded-full bg-red-100 mx-auto mb-4">
            <Trash2 className="h-6 w-6 text-red-600" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900 text-center mb-1">Delete Conversation?</h2>
          <p className="text-sm text-gray-500 text-center mb-6">
            Chat <span className="font-mono font-semibold text-gray-800">#{deleteTarget.shortId}</span> and all its messages will be permanently deleted. This cannot be undone.
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => setDeleteTarget(null)}
              disabled={deleting}
              className="flex-1 px-4 py-2.5 border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50 font-medium text-sm transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleDeleteChat}
              disabled={deleting}
              className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-xl hover:bg-red-700 font-medium text-sm transition-colors disabled:opacity-50"
            >
              {deleting ? 'Deleting...' : 'Delete'}
            </button>
          </div>
        </div>
      </div>
    )}
  </>
  )
}

export default Chats