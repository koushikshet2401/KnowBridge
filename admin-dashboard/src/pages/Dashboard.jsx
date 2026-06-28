import { useState, useEffect } from 'react'
import api from '../services/api'
import { useNavigate } from 'react-router-dom'
import {
  MessageSquare, Users, TrendingUp, Clock, AlertCircle,
  RefreshCw, ThumbsUp, ThumbsDown
} from 'lucide-react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend
} from 'recharts'
import { formatDistanceToNow, format } from 'date-fns'

const Dashboard = () => {
  const [stats, setStats]   = useState(null)
  const [charts, setCharts] = useState([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    fetchAll()
  }, [])

  const fetchAll = async () => {
    setLoading(true)
    try {
      const [statsRes, chartsRes] = await Promise.all([
        api.get('/admin/dashboard/stats'),
        api.get('/admin/dashboard/charts?days=7')
      ])
      setStats(statsRes.data.stats)
      // Normalize chart data
      const raw = chartsRes.data.charts || []
      setCharts(raw.map(row => ({
        date:     format(new Date(row.date), 'MMM d'),
        Total:    parseInt(row.total)   || 0,
        Resolved: parseInt(row.resolved)|| 0,
        Active:   parseInt(row.active)  || 0,
        Pending:  parseInt(row.pending) || 0,
      })))
    } catch (error) {
      console.error('Dashboard fetch error:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[400px]">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600" />
      </div>
    )
  }

  const statCards = [
    {
      label:   'Total Chats',
      value:   stats?.totalChats ?? 0,
      icon:    <MessageSquare className="h-6 w-6 text-blue-600" />,
      bg:      'bg-blue-100',
      color:   'text-blue-600',
      onClick: () => navigate('/chats')
    },
    {
      label:   'Active Chats',
      value:   stats?.activeChats ?? 0,
      icon:    <TrendingUp className="h-6 w-6 text-green-600" />,
      bg:      'bg-green-100',
      color:   'text-green-600',
      onClick: () => navigate('/chats?status=active')
    },
    {
      label:   'Pending (Escalated)',
      value:   stats?.pendingChats ?? 0,
      icon:    <AlertCircle className="h-6 w-6 text-yellow-600" />,
      bg:      'bg-yellow-100',
      color:   'text-yellow-600',
      onClick: () => navigate('/chats?status=pending')
    },
    {
      label:   'Total Agents',
      value:   stats?.totalAgents ?? 0,
      icon:    <Users className="h-6 w-6 text-purple-600" />,
      bg:      'bg-purple-100',
      color:   'text-purple-600',
      onClick: () => navigate('/team')
    },
    {
      label:   'Total Reviews',
      value:   stats?.totalReviews ?? 0,
      icon:    <ThumbsUp className="h-6 w-6 text-primary-600" />,
      bg:      'bg-primary-100',
      color:   'text-primary-600',
      onClick: () => navigate('/reviews')
    },
    {
      label:   'Positive Reviews',
      value:   stats?.positiveReviews ?? 0,
      icon:    <ThumbsUp className="h-6 w-6 text-green-600" />,
      bg:      'bg-green-100',
      color:   'text-green-600',
      onClick: () => navigate('/reviews?rating=positive')
    },
    {
      label:   'Negative Reviews',
      value:   stats?.negativeReviews ?? 0,
      icon:    <ThumbsDown className="h-6 w-6 text-red-600" />,
      bg:      'bg-red-100',
      color:   'text-red-600',
      onClick: () => navigate('/reviews?rating=negative')
    },
    {
      label:   'Closed Chats',
      value:   stats?.closedChats ?? 0,
      icon:    <Clock className="h-6 w-6 text-gray-600" />,
      bg:      'bg-gray-100',
      color:   'text-gray-600',
      onClick: () => navigate('/chats?status=closed')
    },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">
            Overview of your support system performance
          </p>
        </div>
        <button
          onClick={fetchAll}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </div>

      {/* ── Stat Cards ─────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card, i) => (
          <button
            key={i}
            onClick={card.onClick}
            className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 text-left hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 cursor-pointer"
          >
            <div className="flex items-center justify-between mb-3">
              <div className={`${card.bg} p-2.5 rounded-xl`}>
                {card.icon}
              </div>
            </div>
            <div className={`text-3xl font-bold ${card.color} mb-1`}>
              {card.value.toLocaleString()}
            </div>
            <div className="text-sm text-gray-500 font-medium">
              {card.label}
            </div>
          </button>
        ))}
      </div>

      {/* ── Chat Activity Chart ─────────────────── */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="font-semibold text-gray-900">Chat Activity</h3>
            <p className="text-sm text-gray-500 mt-0.5">Last 7 days</p>
          </div>
          {charts.length === 0 && (
            <span className="text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded-lg">
              No data yet — start some chats!
            </span>
          )}
        </div>

        {charts.length === 0 ? (
          // ✅ Empty state instead of blank chart
          <div className="flex flex-col items-center justify-center h-48 text-gray-300">
            <TrendingUp className="h-12 w-12 mb-3" />
            <p className="text-sm font-medium text-gray-400">No chat data in the last 7 days</p>
            <p className="text-xs text-gray-400 mt-1">Charts will appear once conversations start</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={charts} margin={{ top: 5, right: 20, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#4f46e5" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorResolved" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorPending" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 12, fill: '#9ca3af' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 12, fill: '#9ca3af' }}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
              />
              <Tooltip
                contentStyle={{
                  background: '#1f2937',
                  border: 'none',
                  borderRadius: '10px',
                  color: '#f9fafb',
                  fontSize: '13px',
                  padding: '10px 14px'
                }}
                itemStyle={{ color: '#d1d5db' }}
                cursor={{ stroke: '#e5e7eb' }}
              />
              <Legend
                iconType="circle"
                iconSize={8}
                wrapperStyle={{ fontSize: '12px', paddingTop: '16px' }}
              />
              <Area
                type="monotone"
                dataKey="Total"
                stroke="#4f46e5"
                strokeWidth={2.5}
                fill="url(#colorTotal)"
                dot={{ fill: '#4f46e5', r: 3 }}
                activeDot={{ r: 5 }}
              />
              <Area
                type="monotone"
                dataKey="Resolved"
                stroke="#10b981"
                strokeWidth={2.5}
                fill="url(#colorResolved)"
                dot={{ fill: '#10b981', r: 3 }}
                activeDot={{ r: 5 }}
              />
              <Area
                type="monotone"
                dataKey="Pending"
                stroke="#f59e0b"
                strokeWidth={2.5}
                fill="url(#colorPending)"
                dot={{ fill: '#f59e0b', r: 3 }}
                activeDot={{ r: 5 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* ── Recent Chats ────────────────────────── */}
      {stats?.recentChats?.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b flex items-center justify-between">
            <h3 className="font-semibold text-gray-900">Recent Conversations</h3>
            <button
              onClick={() => navigate('/chats')}
              className="text-xs text-primary-600 hover:text-primary-700 font-medium"
            >
              View all →
            </button>
          </div>
          <div className="divide-y divide-gray-100">
            {stats.recentChats.map(chat => (
              <div
                key={chat.id}
                onClick={() => navigate(`/chats/${chat.id}`)}
                className="px-6 py-3.5 flex items-center justify-between hover:bg-gray-50 cursor-pointer transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 bg-primary-100 rounded-full flex items-center justify-center text-xs font-bold text-primary-700">
                    {(chat.user_name || '?')[0].toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {chat.user_name || 'Anonymous'}
                    </p>
                    <p className="text-xs text-gray-400">{chat.client_domain}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                    chat.status === 'active'  ? 'bg-green-100 text-green-700' :
                    chat.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                                                'bg-gray-100 text-gray-600'
                  }`}>
                    {chat.status}
                  </span>
                  <span className="text-xs text-gray-400">
                    {chat.updated_at
                      ? formatDistanceToNow(new Date(chat.updated_at), { addSuffix: true })
                      : ''
                    }
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default Dashboard