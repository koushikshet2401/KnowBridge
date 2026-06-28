import { useState, useEffect } from 'react'
import api from '../services/api'
import {
  ThumbsUp, ThumbsDown, MessageSquare, ExternalLink,
  CheckCircle, RefreshCw, TrendingUp, Globe, AlertCircle, Loader
} from 'lucide-react'
import { format, formatDistanceToNow } from 'date-fns'
import { useNavigate } from 'react-router-dom'

const Reviews = () => {
  const [reviews, setReviews]     = useState([])
  const [stats, setStats]         = useState({ total: 0, positive: 0, negative: 0, satisfactionRate: 0 })
  const [filter, setFilter]       = useState('all')
  const [period, setPeriod]       = useState('all')
  const [loading, setLoading]     = useState(true)
  const [resolveModal, setResolveModal] = useState(null)
  const [resolveNote, setResolveNote]   = useState('')
  const [resolving, setResolving]       = useState(false)
  const navigate = useNavigate()

// Add to useEffect:
useEffect(() => {
  fetchReviews()
}, [filter, period])

// Add socket listener for new feedback (add inside Reviews component):
useEffect(() => {
  // Auto refresh every 30 seconds to catch new reviews
  const interval = setInterval(() => {
    fetchReviews()
  }, 30000)
  return () => clearInterval(interval)
}, [filter, period])

  const fetchReviews = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (filter !== 'all') params.append('rating', filter)
      if (period !== 'all') params.append('period', period)

      const response = await api.get(`/admin/reviews?${params.toString()}`)
      setReviews(response.data.reviews || [])
      setStats(response.data.stats || { total: 0, positive: 0, negative: 0, satisfactionRate: 0 })
    } catch (error) {
      console.error('Failed to fetch reviews:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleResolve = async (reviewId) => {
    setResolving(true)
    try {
      await api.patch(`/admin/reviews/${reviewId}/resolve`, { note: resolveNote })
      setResolveModal(null)
      setResolveNote('')
      fetchReviews()
    } catch (error) {
      alert('Failed to resolve review')
    } finally {
      setResolving(false)
    }
  }

  const handleViewChat = (chatId) => {
    if (chatId) navigate(`/chats/${chatId}`)
  }

  const getRatingBadge = (rating) =>
    rating === 'positive'
      ? 'bg-green-100 text-green-800'
      : 'bg-red-100 text-red-800'

  const periodOptions = [
    { key: 'all',    label: 'Overall'     },
    { key: 'today',  label: 'Today'       },
    { key: '7days',  label: 'Last 7 Days' },
    { key: '30days', label: 'Last 30 Days'},
  ]

  const filterTabs = [
    { key: 'all',      label: `All Reviews (${stats.total})`  },
    { key: 'positive', label: `👍 Positive (${stats.positive})` },
    { key: 'negative', label: `👎 Negative (${stats.negative})` },
  ]

  return (
    <div className="space-y-6">

      {/* ── Header ──────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Reviews &amp; Feedback</h1>
          <p className="text-sm text-gray-500 mt-1">Monitor user satisfaction and resolve issues</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Period selector */}
          {periodOptions.map(p => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                period === p.key
                  ? 'bg-primary-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {p.label}
            </button>
          ))}
          <button
            onClick={fetchReviews}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors ml-1"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* ── Stats Cards ─────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Total Reviews</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">{stats.total}</p>
            </div>
            <div className="bg-blue-100 p-3 rounded-xl">
              <MessageSquare className="h-6 w-6 text-blue-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Positive</p>
              <p className="text-3xl font-bold text-green-600 mt-1">{stats.positive}</p>
            </div>
            <div className="bg-green-100 p-3 rounded-xl">
              <ThumbsUp className="h-6 w-6 text-green-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Negative</p>
              <p className="text-3xl font-bold text-red-600 mt-1">{stats.negative}</p>
            </div>
            <div className="bg-red-100 p-3 rounded-xl">
              <ThumbsDown className="h-6 w-6 text-red-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Satisfaction</p>
              <TrendingUp className="h-5 w-5 text-primary-500" />
            </div>
            <p className="text-3xl font-bold text-primary-600">{stats.satisfactionRate}%</p>
            <div className="mt-2 w-full bg-gray-100 rounded-full h-2">
              <div
                className="bg-green-500 rounded-full h-2 transition-all duration-500"
                style={{ width: `${stats.satisfactionRate}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* ── Main Table ──────────────────────────────── */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">

        {/* Filter Tabs */}
        <div className="border-b border-gray-200 px-6 pt-4">
          <nav className="flex space-x-6">
            {filterTabs.map(tab => (
              <button
                key={tab.key}
                onClick={() => setFilter(tab.key)}
                className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  filter === tab.key
                    ? 'border-primary-600 text-primary-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Reviews list */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader className="h-8 w-8 animate-spin text-primary-600" />
          </div>
        ) : reviews.length === 0 ? (
          <div className="text-center py-16">
            <MessageSquare className="mx-auto h-12 w-12 text-gray-300 mb-3" />
            <h3 className="text-sm font-medium text-gray-900">No reviews yet</h3>
            <p className="text-sm text-gray-500 mt-1">
              Reviews will appear here when users submit feedback
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {reviews.map(review => (
              <div
                key={review.id}
                className={`p-6 transition-colors hover:bg-gray-50 ${review.resolved ? 'opacity-60' : ''}`}
              >
                <div className="flex items-start justify-between gap-4">

                  {/* ── Left: Review content ─────────── */}
                  <div className="flex-1 min-w-0 space-y-3">

                    {/* Top row */}
                    <div className="flex items-center gap-2 flex-wrap">
                      {/* Rating badge */}
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${getRatingBadge(review.rating)}`}>
                        {review.rating === 'positive'
                          ? <><ThumbsUp className="h-3 w-3" /> Positive</>
                          : <><ThumbsDown className="h-3 w-3" /> Negative</>
                        }
                      </span>

                      {/* Client domain */}
                      {review.client_domain && (
                        <span className="flex items-center gap-1 text-xs text-blue-700 bg-blue-50 border border-blue-100 px-2 py-1 rounded-full">
                          <Globe className="h-3 w-3" />
                          {review.client_domain}
                        </span>
                      )}

                      {/* User */}
                      {review.user_name && (
                        <span className="text-xs text-gray-500">
                          by <strong>{review.user_name}</strong>
                          {review.user_email && ` · ${review.user_email}`}
                        </span>
                      )}

                      {/* Date */}
                      <span className="text-xs text-gray-400 ml-auto flex-shrink-0">
                        {review.created_at
                          ? formatDistanceToNow(new Date(review.created_at), { addSuffix: true })
                          : ''
                        }
                      </span>
                    </div>

                    {/* AI message that was rated */}
                    {review.message_content && (
                      <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                        <p className="text-xs text-gray-500 font-medium mb-1">AI Response rated:</p>
                        <p className="text-sm text-gray-700 line-clamp-3">
                          {review.message_content}
                        </p>
                      </div>
                    )}

                    {/* User comment */}
                    {review.comment && (
                      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                        <p className="text-xs text-amber-700 font-medium mb-1">User Comment:</p>
                        <p className="text-sm text-amber-900">"{review.comment}"</p>
                      </div>
                    )}

                    {/* Resolved badge */}
                    {review.resolved && (
                      <span className="inline-flex items-center gap-1.5 text-xs text-green-700 bg-green-50 border border-green-200 px-2.5 py-1 rounded-full">
                        <CheckCircle className="h-3 w-3" />
                        Resolved
                        {review.resolved_at && (
                          <span className="text-green-500">
                            · {format(new Date(review.resolved_at), 'MMM d')}
                          </span>
                        )}
                      </span>
                    )}
                    {review.resolution_note && (
                      <p className="text-xs text-gray-500 italic">Note: {review.resolution_note}</p>
                    )}
                  </div>

                  {/* ── Right: Action buttons ─────────── */}
                  <div className="flex flex-col gap-2 flex-shrink-0 min-w-[110px]">
                    {/* View Chat */}
                    {review.chat_id && (
                      <button
                        onClick={() => handleViewChat(review.chat_id)}
                        className="flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors"
                      >
                        <ExternalLink className="h-3 w-3" />
                        View Chat
                      </button>
                    )}

                    {/* Resolve (negative + unresolved only) */}
                    {review.rating === 'negative' && !review.resolved && (
                      <button
                        onClick={() => { setResolveModal(review); setResolveNote('') }}
                        className="flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-lg hover:bg-green-100 transition-colors"
                      >
                        <CheckCircle className="h-3 w-3" />
                        Resolve
                      </button>
                    )}
                  </div>

                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Resolve Modal ────────────────────────────── */}
      {resolveModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="bg-green-100 p-2.5 rounded-xl">
                <CheckCircle className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Resolve Issue</h3>
                <p className="text-sm text-gray-500">Mark this negative review as resolved</p>
              </div>
            </div>

            {/* Show the review being resolved */}
            {resolveModal.message_content && (
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 mb-4">
                <p className="text-xs text-gray-500 mb-1 font-medium">AI Response:</p>
                <p className="text-sm text-gray-700 line-clamp-3">
                  {resolveModal.message_content}
                </p>
              </div>
            )}

            {resolveModal.comment && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
                <p className="text-xs text-red-600 mb-1 font-medium">User Complaint:</p>
                <p className="text-sm text-red-800">"{resolveModal.comment}"</p>
              </div>
            )}

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Resolution Note <span className="text-gray-400">(optional)</span>
              </label>
              <textarea
                value={resolveNote}
                onChange={e => setResolveNote(e.target.value)}
                placeholder="e.g. Updated knowledge base with correct information..."
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 text-sm resize-none"
              />
            </div>

            <div className="flex gap-3">
              {resolveModal.chat_id && (
                <button
                  onClick={() => { handleViewChat(resolveModal.chat_id); setResolveModal(null) }}
                  className="flex-1 py-2.5 text-sm border border-primary-600 text-primary-600 rounded-xl hover:bg-primary-50 font-medium"
                >
                  View Chat First
                </button>
              )}
              <button
                onClick={() => { setResolveModal(null); setResolveNote('') }}
                className="flex-1 py-2.5 text-sm border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => handleResolve(resolveModal.id)}
                disabled={resolving}
                className="flex-1 py-2.5 text-sm bg-green-600 text-white rounded-xl hover:bg-green-700 font-medium disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                {resolving
                  ? <><Loader className="h-3.5 w-3.5 animate-spin" /> Resolving...</>
                  : <><CheckCircle className="h-3.5 w-3.5" /> Mark Resolved</>
                }
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}

export default Reviews