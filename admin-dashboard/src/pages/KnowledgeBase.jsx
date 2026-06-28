import { useState, useEffect, useRef } from 'react'
import api from '../services/api'
import {
  Upload, File, Trash2, Globe, AlertCircle, CheckCircle,
  Loader, RefreshCw, Square, Plus, FileText, ChevronDown,
  ChevronUp, Database, Ban
} from 'lucide-react'
import { format } from 'date-fns'

const KnowledgeBase = () => {
  const [documents, setDocuments]         = useState([])
  const [crawlJobs, setCrawlJobs]         = useState([])
  const [uploading, setUploading]         = useState(false)
  const [loading, setLoading]             = useState(true)
  const [dragActive, setDragActive]       = useState(false)
  const [uploadProgress, setUploadProgress] = useState(null)
  const [activeTab, setActiveTab]         = useState('documents')
  const [crawlUrl, setCrawlUrl]           = useState('')
  const [maxPages, setMaxPages]           = useState(100)
  const [crawling, setCrawling]           = useState(false)
  const [restrictedUrls, setRestrictedUrls] = useState(
    '/privacy-policy\n/terms\n/terms-of-service\n/admin\n/login\n/logout\n/register\n/contact\n/blog\n/pricing\n/about'
  )
  const [pasteTitle, setPasteTitle]       = useState('')
  const [pasteContent, setPasteContent]   = useState('')
  const [pasting, setPasting]             = useState(false)
  const [expandedJob, setExpandedJob]     = useState(null)
  const [jobPages, setJobPages]           = useState({})
  const [stats, setStats]                 = useState(null)
  const pollRef = useRef(null)

  useEffect(() => {
    fetchDocuments()
    fetchCrawlJobs()
    fetchStats()
    return () => clearInterval(pollRef.current)
  }, [])

  // ── Fetch documents ───────────────────────────
  const fetchDocuments = async () => {
    try {
      const response = await api.get('/admin/knowledge-base')
      setDocuments(response.data.documents || [])
    } catch (error) {
      console.error('Failed to fetch documents:', error)
    } finally {
      setLoading(false)
    }
  }

  // ── Fetch crawl jobs ──────────────────────────
  const fetchCrawlJobs = async () => {
    try {
      const response = await api.get('/admin/knowledge-base/crawl/jobs')
      setCrawlJobs(response.data.jobs || [])
    } catch (error) {
      console.error('Failed to fetch crawl jobs:', error)
    }
  }

  // ── Fetch stats ───────────────────────────────
  const fetchStats = async () => {
    try {
      const response = await api.get('/admin/knowledge-base/stats')
      setStats(response.data)
    } catch (error) {
      console.error('Failed to fetch stats:', error)
    }
  }

  // ── Fetch job page details ────────────────────
  const fetchJobDetails = async (jobId) => {
    try {
      const response = await api.get(`/admin/knowledge-base/crawl/jobs/${jobId}`)
      setJobPages(prev => ({ ...prev, [jobId]: response.data.pages || [] }))
    } catch (error) {
      console.error('Failed to fetch job details:', error)
    }
  }

  // ── Poll active jobs (every 5s to avoid 429) ──
  const startPolling = () => {
    clearInterval(pollRef.current)
    pollRef.current = setInterval(async () => {
      try {
        const res  = await api.get('/admin/knowledge-base/crawl/jobs')
        const jobs = res.data.jobs || []
        setCrawlJobs(jobs)

        if (expandedJob) fetchJobDetails(expandedJob)

        const hasCrawling = jobs.some(j => j.status === 'crawling' || j.status === 'pending')
        if (!hasCrawling) {
          clearInterval(pollRef.current)
          fetchDocuments()
          fetchStats()
        }
      } catch (err) {
        console.error('Poll error:', err.message)
      }
    }, 5000)
  }

  // ── Upload PDF ────────────────────────────────
  const handleDrag = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(e.type === 'dragenter' || e.type === 'dragover')
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setDragActive(false)
    if (e.dataTransfer.files[0]) handleFiles(e.dataTransfer.files)
  }

  const handleFiles = async (files) => {
    const file = files[0]
    if (!file.name.toLowerCase().endsWith('.pdf')) return alert('PDF files only')
    if (file.size > 10 * 1024 * 1024) return alert('Max file size is 10MB')

    setUploading(true)
    setUploadProgress({ name: file.name, status: 'uploading' })

    const formData = new FormData()
    formData.append('file', file)

    try {
      const response = await api.post('/admin/knowledge-base/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      setUploadProgress({
        name:   file.name,
        status: 'success',
        chunks: response.data.document?.chunks || 0
      })
      setTimeout(() => { setUploadProgress(null); fetchDocuments(); fetchStats() }, 3000)
    } catch (error) {
      setUploadProgress({
        name:    file.name,
        status:  'error',
        message: error.response?.data?.error || 'Upload failed'
      })
      setTimeout(() => setUploadProgress(null), 6000)
    } finally {
      setUploading(false)
    }
  }

  // ── Start Crawl ───────────────────────────────
  const handleStartCrawl = async (e) => {
    e.preventDefault()
    if (!crawlUrl.trim()) return alert('Please enter a URL')
    if (!crawlUrl.startsWith('http://') && !crawlUrl.startsWith('https://')) {
      return alert('URL must start with http:// or https://')
    }

    // Parse restricted URLs
    const skipPatterns = restrictedUrls
      .split('\n')
      .map(u => u.trim())
      .filter(Boolean)

    setCrawling(true)
    try {
      await api.post('/admin/knowledge-base/crawl', {
        url:           crawlUrl.trim(),
        max_pages:     maxPages,
        skip_patterns: skipPatterns
      })
      setCrawlUrl('')
      setActiveTab('crawler')
      fetchCrawlJobs()
      startPolling()
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to start crawl')
    } finally {
      setCrawling(false)
    }
  }

  // ── Stop Crawl ────────────────────────────────
  const handleStopCrawl = async (jobId) => {
    try {
      await api.post(`/admin/knowledge-base/crawl/jobs/${jobId}/stop`)
      fetchCrawlJobs()
    } catch (error) {
      alert('Failed to stop crawl')
    }
  }

  // ── Delete Job (cascades to docs + chunks) ────
  const handleDeleteJob = async (jobId) => {
    if (!confirm('Delete this crawl job?\n\nThis will also remove all documents and chunks from the Knowledge Base that were created by this crawl.')) return
    try {
      await api.delete(`/admin/knowledge-base/crawl/jobs/${jobId}`)
      setCrawlJobs(prev => prev.filter(j => j.id !== jobId))
      if (expandedJob === jobId) setExpandedJob(null)
      fetchDocuments()
      fetchStats()
    } catch (error) {
      alert('Failed to delete crawl job')
    }
  }

  // ── Paste Text ────────────────────────────────
  const handlePasteText = async (e) => {
    e.preventDefault()
    if (!pasteTitle.trim()) return alert('Title is required')
    if (pasteContent.length < 50) return alert('Content must be at least 50 characters')

    setPasting(true)
    try {
      await api.post('/admin/knowledge-base/paste', {
        title:   pasteTitle.trim(),
        content: pasteContent.trim()
      })
      setPasteTitle('')
      setPasteContent('')
      fetchDocuments()
      fetchStats()
      alert('Text saved and indexed successfully!')
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to save text')
    } finally {
      setPasting(false)
    }
  }

  // ── Delete Document ───────────────────────────
  const handleDeleteDoc = async (docId, title) => {
    if (!confirm(`Delete "${title}"?\n\nThis will remove all associated chunks from the Knowledge Base.`)) return
    try {
      await api.delete(`/admin/knowledge-base/${docId}`)
      setDocuments(prev => prev.filter(d => d.id !== docId))
      fetchStats()
    } catch (error) {
      alert('Failed to delete document')
    }
  }

  // ── Helpers ───────────────────────────────────
  const formatBytes = (bytes) => {
    if (!bytes) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return `${Math.round(bytes / Math.pow(k, i) * 10) / 10} ${sizes[i]}`
  }

  const getJobStatusStyle = (status) => ({
    done:     'bg-green-100 text-green-800',
    crawling: 'bg-blue-100 text-blue-800',
    pending:  'bg-yellow-100 text-yellow-800',
    failed:   'bg-red-100 text-red-800',
    stopped:  'bg-gray-100 text-gray-700',
  }[status] || 'bg-gray-100 text-gray-700')

  const getSourceIcon = (type) => {
    if (type === 'pdf')  return <File      className="h-5 w-5 text-red-500   flex-shrink-0" />
    if (type === 'web')  return <Globe     className="h-5 w-5 text-blue-500  flex-shrink-0" />
    return                      <FileText  className="h-5 w-5 text-green-500 flex-shrink-0" />
  }

  const getPageDot = (status) => ({
    done:     'bg-green-400',
    failed:   'bg-red-400',
    crawling: 'bg-blue-400 animate-pulse',
    pending:  'bg-gray-300',
  }[status] || 'bg-gray-300')

  const estimateChunks = (wordCount) =>
    wordCount ? Math.max(1, Math.ceil(wordCount / 150)) : null

  // ─────────────────────────────────────────────
  return (
    <div className="space-y-6">

      {/* ── Header ─────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Knowledge Base</h1>
          <p className="text-sm text-gray-500 mt-1">
            Train the AI with PDFs, web pages, and text content
          </p>
        </div>
        <div className="flex items-center gap-3">
          {stats && (
            <>
              <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-2 text-center min-w-[70px]">
                <div className="text-xl font-bold text-blue-700">{stats.totalDocuments || 0}</div>
                <div className="text-xs text-blue-500">Documents</div>
              </div>
              <div className="bg-purple-50 border border-purple-200 rounded-xl px-4 py-2 text-center min-w-[70px]">
                <div className="text-xl font-bold text-purple-700">{stats.totalChunks || 0}</div>
                <div className="text-xs text-purple-500">Chunks</div>
              </div>
            </>
          )}
          <button
            onClick={() => { fetchDocuments(); fetchCrawlJobs(); fetchStats() }}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"
            title="Refresh"
          >
            <RefreshCw className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* ── Tabs ───────────────────────────────── */}
      <div className="border-b border-gray-200">
        <nav className="flex space-x-6">
          {[
            { key: 'documents', label: `📄 Documents (${documents.length})` },
            { key: 'crawler',   label: `🕷️ URL Crawler (${crawlJobs.length})` },
            { key: 'paste',     label: '📝 Paste Text' },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.key
                  ? 'border-primary-600 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* ══════════════════════════════════════════════ */}
      {/* DOCUMENTS TAB                                  */}
      {/* ══════════════════════════════════════════════ */}
      {activeTab === 'documents' && (
        <div className="space-y-5">

          {/* Upload area */}
          <div
            className={`border-2 border-dashed rounded-2xl p-10 text-center transition-all cursor-pointer ${
              dragActive
                ? 'border-primary-500 bg-primary-50 scale-[1.01]'
                : 'border-gray-300 hover:border-primary-400 bg-white'
            }`}
            onDragEnter={handleDrag} onDragLeave={handleDrag}
            onDragOver={handleDrag}  onDrop={handleDrop}
          >
            <Upload className="mx-auto h-10 w-10 text-gray-400 mb-3" />
            <label htmlFor="file-upload" className="cursor-pointer">
              <span className="text-primary-600 font-semibold hover:text-primary-700">
                Upload a PDF
              </span>
              <input
                id="file-upload"
                type="file"
                className="sr-only"
                accept=".pdf"
                onChange={e => e.target.files[0] && handleFiles(e.target.files)}
                disabled={uploading}
              />
            </label>
            <span className="text-gray-500 text-sm"> or drag and drop</span>
            <p className="text-xs text-gray-400 mt-2">
              PDF up to 10MB • Text-based PDFs only (not scanned images)
            </p>

            {/* Upload progress/feedback */}
            {uploadProgress && (
              <div className="mt-4 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border bg-gray-50">
                {uploadProgress.status === 'uploading' && (
                  <>
                    <Loader className="h-4 w-4 text-primary-600 animate-spin" />
                    <span className="text-sm text-gray-700">Processing & generating embeddings...</span>
                  </>
                )}
                {uploadProgress.status === 'success' && (
                  <>
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <span className="text-sm text-green-700 font-medium">
                      ✅ {uploadProgress.name} uploaded!
                      {uploadProgress.chunks > 0 && (
                        <span className="ml-1 text-purple-600">({uploadProgress.chunks} chunks created)</span>
                      )}
                    </span>
                  </>
                )}
                {uploadProgress.status === 'error' && (
                  <>
                    <AlertCircle className="h-4 w-4 text-red-600" />
                    <span className="text-sm text-red-700">{uploadProgress.message}</span>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Document list */}
          <div className="bg-white shadow-sm rounded-2xl border border-gray-100 overflow-hidden">
            <div className="px-6 py-4 border-b flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">
                All Documents ({documents.length})
              </h3>
            </div>

            {loading ? (
              <div className="flex justify-center py-12">
                <Loader className="h-8 w-8 animate-spin text-primary-600" />
              </div>
            ) : documents.length === 0 ? (
              <div className="text-center py-14 text-gray-400">
                <Database className="mx-auto h-12 w-12 text-gray-300 mb-3" />
                <p className="font-medium text-gray-500">No documents yet</p>
                <p className="text-sm mt-1">Upload a PDF or crawl a website to get started</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {documents.map(doc => (
                  <div
                    key={doc.id}
                    className="px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors group"
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      {getSourceIcon(doc.source_type)}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {doc.title || doc.file_path}
                        </p>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded capitalize">
                            {doc.source_type || 'pdf'}
                          </span>
                          {doc.source_url && (
                            <span className="text-xs text-blue-400 truncate max-w-[200px]">
                              {doc.source_url}
                            </span>
                          )}
                          <span className="text-xs text-gray-400">{formatBytes(doc.file_size)}</span>
                          {/* Chunk count */}
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                            (doc.chunk_count || 0) > 0
                              ? 'text-purple-700 bg-purple-50 border border-purple-200'
                              : 'text-red-600 bg-red-50 border border-red-200'
                          }`}>
                            {doc.chunk_count || 0} chunks
                          </span>
                          <span className="text-xs text-gray-400">
                            {doc.created_at ? format(new Date(doc.created_at), 'MMM d, yyyy') : ''}
                          </span>
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => handleDeleteDoc(doc.id, doc.title || doc.file_path)}
                      className="p-2 text-gray-300 group-hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors ml-3 flex-shrink-0"
                      title="Delete document"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Info box */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
            <div className="flex gap-3">
              <AlertCircle className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-blue-700">
                <p className="font-semibold mb-1">How it works</p>
                <p>Documents are split into ~200-token chunks and stored as vector embeddings. The AI searches these chunks to give accurate, context-aware answers.</p>
                <p className="mt-1 text-blue-500 text-xs">
                  ⚠️ Only text-based PDFs are supported. For scanned PDFs → use the "Paste Text" tab.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════ */}
      {/* CRAWLER TAB                                    */}
      {/* ══════════════════════════════════════════════ */}
      {activeTab === 'crawler' && (
        <div className="space-y-5">

          {/* Crawl form */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <h3 className="font-semibold text-gray-900 mb-1 flex items-center gap-2">
              <Globe className="h-5 w-5 text-blue-500" />
              Crawl a Website
            </h3>
            <p className="text-sm text-gray-500 mb-5">
              Automatically extract and index content from any website into the Knowledge Base.
            </p>

            <form onSubmit={handleStartCrawl} className="space-y-5">

              {/* URL input */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Website URL <span className="text-red-500">*</span>
                </label>
                <input
                  type="url"
                  value={crawlUrl}
                  onChange={e => setCrawlUrl(e.target.value)}
                  placeholder="https://www.knowbridge.com/knowledgebase"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  required
                />
                <p className="text-xs text-gray-400 mt-1.5">
                  Only pages under this URL path will be crawled (child pages only)
                </p>
              </div>

              {/* Max Pages - Number input */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Max Pages to Crawl
                  <span className="text-xs text-gray-400 font-normal ml-2">
                    (Recommended: 100 for complete knowledgebase)
                  </span>
                </label>
                <input
                  type="number"
                  min="1"
                  max="500"
                  value={maxPages}
                  onChange={e => setMaxPages(Math.max(1, Math.min(500, parseInt(e.target.value) || 1)))}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 text-center text-lg font-bold"
                  placeholder="100"
                />
                {/* Quick select buttons */}
                <div className="flex gap-2 mt-2">
                  {[20, 50, 100, 200].map(n => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setMaxPages(n)}
                      className={`flex-1 py-1.5 text-xs rounded-lg font-medium transition-colors border ${
                        maxPages === n
                          ? 'bg-primary-600 text-white border-primary-600'
                          : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>

              {/* Restricted URLs */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5 flex items-center gap-1.5">
                  <Ban className="h-4 w-4 text-red-500" />
                  Restricted URLs
                  <span className="text-xs text-gray-400 font-normal ml-1">
                    (one per line — will NOT be crawled)
                  </span>
                </label>
                <textarea
                  value={restrictedUrls}
                  onChange={e => setRestrictedUrls(e.target.value)}
                  rows={5}
                  placeholder={`/privacy-policy\n/terms\n/admin\n/login\n/contact`}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 font-mono text-xs resize-y"
                />
                <p className="text-xs text-gray-400 mt-1.5">
                  URLs containing these patterns will be skipped during crawl
                </p>
              </div>

              {/* Submit button */}
              <button
                type="submit"
                disabled={crawling}
                className="w-full py-3 bg-primary-600 text-white rounded-xl hover:bg-primary-700 disabled:opacity-50 flex items-center justify-center gap-2 font-semibold text-sm transition-colors"
              >
                {crawling
                  ? <><Loader className="h-4 w-4 animate-spin" /> Starting crawl...</>
                  : <><Globe className="h-4 w-4" /> Start Crawl ({maxPages} pages max)</>
                }
              </button>
            </form>
          </div>

          {/* Crawl jobs list */}
          <div className="bg-white shadow-sm rounded-2xl border border-gray-100 overflow-hidden">
            <div className="px-6 py-4 border-b flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">
                Crawl Jobs ({crawlJobs.length})
              </h3>
              <button
                onClick={fetchCrawlJobs}
                className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                title="Refresh jobs"
              >
                <RefreshCw className="h-4 w-4" />
              </button>
            </div>

            {crawlJobs.length === 0 ? (
              <div className="text-center py-14 text-gray-400">
                <Globe className="mx-auto h-12 w-12 text-gray-300 mb-3" />
                <p className="font-medium text-gray-500">No crawl jobs yet</p>
                <p className="text-sm mt-1">Enter a URL above to start crawling</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {crawlJobs.map(job => (
                  <div key={job.id} className="p-6">

                    {/* Job header */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        {/* URL + status */}
                        <div className="flex items-center gap-2 flex-wrap mb-2">
                          <p className="text-sm font-semibold text-gray-900 truncate max-w-lg">
                            {job.base_url}
                          </p>
                          <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium flex items-center gap-1 flex-shrink-0 ${getJobStatusStyle(job.status)}`}>
                            {job.status}
                            {(job.status === 'crawling' || job.status === 'pending') && (
                              <Loader className="h-3 w-3 animate-spin" />
                            )}
                          </span>
                        </div>

                        {/* Stats row */}
                        <div className="flex items-center gap-4 text-xs flex-wrap">
                          <span className="flex items-center gap-1 text-green-600 font-medium">
                            <CheckCircle className="h-3 w-3" />
                            {job.pages_crawled} crawled
                          </span>
                          <span className="flex items-center gap-1 text-red-500">
                            <AlertCircle className="h-3 w-3" />
                            {job.pages_failed} failed
                          </span>
                          <span className="text-gray-500">Max: {job.max_pages}</span>
                          {job.created_at && (
                            <span className="text-gray-400">
                              {format(new Date(job.created_at), 'MMM d, h:mm a')}
                            </span>
                          )}
                        </div>

                        {/* Progress bar */}
                        {(job.status === 'crawling' || job.status === 'done') && job.max_pages > 0 && (
                          <div className="mt-3">
                            <div className="w-full bg-gray-100 rounded-full h-2">
                              <div
                                className={`rounded-full h-2 transition-all duration-500 ${
                                  job.status === 'done' ? 'bg-green-500' : 'bg-primary-600'
                                }`}
                                style={{
                                  width: `${Math.min(100, ((job.pages_crawled + job.pages_failed) / job.max_pages) * 100)}%`
                                }}
                              />
                            </div>
                            <p className="text-xs text-gray-400 mt-1">
                              {job.pages_crawled + job.pages_failed} / {job.max_pages} pages processed
                              {job.status === 'done' && (
                                <span className="text-green-600 font-medium ml-2">✅ Complete</span>
                              )}
                            </p>
                          </div>
                        )}

                        {job.error && (
                          <p className="text-xs text-red-500 mt-2 bg-red-50 px-3 py-1.5 rounded-lg">
                            ❌ {job.error}
                          </p>
                        )}
                      </div>

                      {/* Action buttons */}
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {/* Stop */}
                        {(job.status === 'crawling' || job.status === 'pending') && (
                          <button
                            onClick={() => handleStopCrawl(job.id)}
                            className="p-1.5 text-orange-500 hover:bg-orange-50 rounded-lg transition-colors"
                            title="Stop crawl"
                          >
                            <Square className="h-4 w-4" />
                          </button>
                        )}

                        {/* Expand/collapse */}
                        <button
                          onClick={() => {
                            if (expandedJob === job.id) {
                              setExpandedJob(null)
                            } else {
                              setExpandedJob(job.id)
                              fetchJobDetails(job.id)
                            }
                          }}
                          className="p-1.5 text-gray-400 hover:bg-gray-100 rounded-lg transition-colors"
                          title={expandedJob === job.id ? 'Collapse' : 'View pages'}
                        >
                          {expandedJob === job.id
                            ? <ChevronUp className="h-4 w-4" />
                            : <ChevronDown className="h-4 w-4" />
                          }
                        </button>

                        {/* Delete */}
                        {job.status !== 'crawling' && job.status !== 'pending' && (
                          <button
                            onClick={() => handleDeleteJob(job.id)}
                            className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                            title="Delete job and all its documents"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Expanded pages list */}
                    {expandedJob === job.id && jobPages[job.id] && (
                      <div className="mt-4 border border-gray-100 rounded-xl overflow-hidden">
                        <div className="bg-gray-50 px-4 py-2 border-b flex items-center justify-between">
                          <p className="text-xs font-semibold text-gray-600">
                            Pages ({jobPages[job.id].length})
                          </p>
                          <button
                            onClick={() => fetchJobDetails(job.id)}
                            className="text-gray-400 hover:text-gray-600"
                          >
                            <RefreshCw className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <div className="max-h-72 overflow-y-auto">
                          {jobPages[job.id].length === 0 ? (
                            <p className="text-xs text-gray-400 text-center py-6">No pages yet</p>
                          ) : (
                            jobPages[job.id].map(page => (
                              <div
                                key={page.id}
                                className="flex items-center gap-2.5 px-4 py-2.5 border-b last:border-0 hover:bg-gray-50 transition-colors"
                              >
                                {/* Status dot */}
                                <span className={`h-2 w-2 rounded-full flex-shrink-0 ${getPageDot(page.status)}`} />

                                {/* URL */}
                                <span className="text-xs text-gray-600 truncate flex-1 font-mono">
                                  {page.url}
                                </span>

                                {/* Chunk estimate */}
                                {page.status === 'done' && estimateChunks(page.word_count) && (
                                  <span className="text-xs font-semibold text-purple-600 bg-purple-50 border border-purple-100 px-2 py-0.5 rounded-full flex-shrink-0">
                                    ~{estimateChunks(page.word_count)} chunks
                                  </span>
                                )}

                                {/* Word count */}
                                {page.word_count && page.status === 'done' && (
                                  <span className="text-xs text-gray-400 flex-shrink-0">
                                    {page.word_count.toLocaleString()} words
                                  </span>
                                )}

                                {/* Error */}
                                {page.error && (
                                  <span className="text-xs text-red-400 flex-shrink-0 max-w-[140px] truncate" title={page.error}>
                                    ❌ {page.error}
                                  </span>
                                )}
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════ */}
      {/* PASTE TEXT TAB                                 */}
      {/* ══════════════════════════════════════════════ */}
      {activeTab === 'paste' && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <h3 className="font-semibold text-gray-900 mb-1 flex items-center gap-2">
            <FileText className="h-5 w-5 text-green-500" />
            Add Text to Knowledge Base
          </h3>
          <p className="text-sm text-gray-500 mb-5">
            Paste content directly — perfect for scanned PDFs, internal documents, or custom answers.
          </p>

          <form onSubmit={handlePasteText} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Title <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={pasteTitle}
                onChange={e => setPasteTitle(e.target.value)}
                placeholder="e.g. Fee Management Guide, Refund Policy"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Content <span className="text-red-500">*</span>
                <span className="font-normal text-gray-400 ml-1.5 text-xs">
                  {pasteContent.length} characters
                  {pasteContent.length >= 50
                    ? <span className="text-green-600"> ✓ ready</span>
                    : <span className="text-amber-500"> (need {50 - pasteContent.length} more)</span>
                  }
                </span>
              </label>
              <textarea
                value={pasteContent}
                onChange={e => setPasteContent(e.target.value)}
                placeholder="Paste or type the knowledge base content here. The more detailed the content, the better the AI can answer related questions."
                rows={14}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 font-mono text-sm resize-y"
                required
              />
            </div>

            <button
              type="submit"
              disabled={pasting || pasteContent.length < 50}
              className="w-full py-3 bg-green-600 text-white rounded-xl hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2 font-semibold text-sm transition-colors"
            >
              {pasting
                ? <><Loader className="h-4 w-4 animate-spin" /> Saving & indexing...</>
                : <><Plus className="h-4 w-4" /> Save to Knowledge Base</>
              }
            </button>
          </form>
        </div>
      )}

    </div>
  )
}

export default KnowledgeBase