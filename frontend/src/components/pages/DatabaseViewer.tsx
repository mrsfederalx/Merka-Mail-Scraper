import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Database,
  Download,
  RefreshCw,
  Filter,
  Trash2,
  Eye,
  Copy,
  Globe,
  Mail,
  ChevronLeft,
  ChevronRight,
  Search,
  X,
  FileSpreadsheet,
  Share2,
  ExternalLink,
  Check,
  Linkedin,
  UserCheck,
} from 'lucide-react'
import StatCard from '../layout/StatCard'
import { useAuth } from '../../contexts/AuthContext'
import { useApi } from '../../hooks/useApi'

// ── Types ────────────────────────────────────────────────────────────

interface EmailRecord {
  id: number
  email: string
  source: string | null
  tier: number | null
  classification: string | null
  is_decision_maker: boolean
  verification_status: string | null
}

interface SocialLink {
  id: number
  platform: string
  url: string
  source: string | null
}

interface ContactRecord {
  id: number
  full_name: string | null
  first_name: string | null
  last_name: string | null
  role: string | null
  linkedin_url: string | null
  source: string | null
  score: number
  email_found: string | null
  email_verified: boolean
}

interface DomainResult {
  id: number
  domain: string
  status: string
  platform: string | null
  method: string | null
  error_message: string | null
  processing_time_ms: number | null
  has_cloudflare: boolean
  created_at: string
  processed_at: string | null
  emails?: EmailRecord[]
  social_links?: SocialLink[]
  contacts?: ContactRecord[]
}

interface ResultsStats {
  total: number
  completed: number
  failed: number
  pending: number
  processing: number
  skipped: number
}

interface EmailsStats {
  total: number
  tier_1_junk: number
  tier_2_generic: number
  tier_3_department: number
  tier_4_personal: number
  decision_makers: number
  verified: number
}

// ── Constants ────────────────────────────────────────────────────────

const STATUS_OPTIONS = ['All', 'completed', 'pending', 'processing', 'failed', 'skipped'] as const
const PAGE_SIZE = 50

const SOCIAL_COLORS: Record<string, { bg: string; text: string; hover: string }> = {
  facebook:  { bg: 'bg-blue-500/10',   text: 'text-blue-400',  hover: 'hover:bg-blue-500/20' },
  linkedin:  { bg: 'bg-sky-500/10',    text: 'text-sky-400',   hover: 'hover:bg-sky-500/20' },
  twitter:   { bg: 'bg-cyan-500/10',   text: 'text-cyan-300',  hover: 'hover:bg-cyan-500/20' },
  instagram: { bg: 'bg-pink-500/10',   text: 'text-pink-400',  hover: 'hover:bg-pink-500/20' },
  youtube:   { bg: 'bg-red-500/10',    text: 'text-red-400',   hover: 'hover:bg-red-500/20' },
}

const SOCIAL_LABELS: Record<string, string> = {
  facebook: 'FB', linkedin: 'LI', twitter: 'TW', instagram: 'IG', youtube: 'YT',
}

// ── Component ────────────────────────────────────────────────────────

export default function DatabaseViewer() {
  const { user } = useAuth()
  const { get, del, loading } = useApi()

  const [results, setResults] = useState<DomainResult[]>([])
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const [statusFilter, setStatusFilter] = useState('All')
  const [searchQuery, setSearchQuery] = useState('')
  const [detailRecord, setDetailRecord] = useState<DomainResult | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const [resultStats, setResultStats] = useState<ResultsStats>({
    total: 0, completed: 0, failed: 0, pending: 0, processing: 0, skipped: 0,
  })
  const [emailStats, setEmailStats] = useState<EmailsStats>({
    total: 0, tier_1_junk: 0, tier_2_generic: 0, tier_3_department: 0,
    tier_4_personal: 0, decision_makers: 0, verified: 0,
  })

  const prevClientRef = useRef(user?.client_id)

  // ── Fetch helpers ──────────────────────────────────────────────────

  const fetchResults = useCallback(
    async (p: number, status: string, search: string) => {
      const params = new URLSearchParams()
      params.set('page', String(p))
      params.set('limit', String(PAGE_SIZE))
      if (status !== 'All') params.set('status', status)
      if (search.trim()) params.set('search', search.trim())

      const res = await get(`/results?${params.toString()}`) as unknown as Record<string, unknown>
      if (res.success) {
        setResults((res.data as DomainResult[]) ?? [])
        setTotalCount((res.total as number) ?? 0)
        setTotalPages((res.total_pages as number) ?? 1)
        setPage((res.page as number) ?? p)
      } else {
        setResults([])
        setTotalCount(0)
        setTotalPages(1)
      }
    },
    [get],
  )

  const fetchStats = useCallback(async () => {
    const [resultRes, emailRes] = await Promise.all([
      get('/results/stats'),
      get('/emails/stats'),
    ])
    if (resultRes.success && resultRes.data) setResultStats(resultRes.data as ResultsStats)
    if (emailRes.success && emailRes.data) setEmailStats(emailRes.data as EmailsStats)
  }, [get])

  const loadAll = useCallback(
    async (p = 1, status = statusFilter, search = searchQuery) => {
      await Promise.all([fetchResults(p, status, search), fetchStats()])
    },
    [fetchResults, fetchStats, statusFilter, searchQuery],
  )

  useEffect(() => { loadAll(1) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (prevClientRef.current !== user?.client_id) {
      prevClientRef.current = user?.client_id
      setPage(1); setStatusFilter('All'); setSearchQuery('')
      loadAll(1, 'All', '')
    }
  }, [user?.client_id]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Handlers ───────────────────────────────────────────────────────

  const handleRefresh = () => loadAll(page)
  const handleApplyFilters = () => { setPage(1); loadAll(1, statusFilter, searchQuery) }
  const handlePageChange = (p: number) => { setPage(p); fetchResults(p, statusFilter, searchQuery) }
  const downloadFile = async (url: string, filename: string) => {
    const token = localStorage.getItem('access_token')
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) return
    const blob = await res.blob()
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(a.href)
  }

  const handleExportCSV = () => downloadFile('/api/export/csv', 'export.csv')
  const handleExportExcel = () => downloadFile('/api/export/excel', 'export.xlsx')
  const handleDelete = async (id: number) => {
    const res = await del(`/results/${id}`)
    if (res.success) await loadAll(page)
  }
  const handleView = (id: number) => {
    const r = results.find((x) => x.id === id)
    if (r) setDetailRecord(r)
  }
  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(key)
      setTimeout(() => setCopiedId(null), 1500)
    }).catch(() => {})
  }

  // ── Helpers ────────────────────────────────────────────────────────

  const statusColor = (s: string) => {
    const m: Record<string, string> = {
      completed: 'bg-emerald-500/10 text-emerald-400',
      processing: 'bg-cyan-500/10 text-cyan-400',
      pending: 'bg-amber-500/10 text-amber-400',
      failed: 'bg-red-500/10 text-red-400',
      skipped: 'bg-gray-500/10 text-gray-400',
    }
    return m[s] || 'bg-gray-500/10 text-gray-400'
  }

  const CopyBtn = ({ text, id, size = 10 }: { text: string; id: string; size?: number }) => (
    <button
      onClick={(e) => { e.stopPropagation(); handleCopy(text, id) }}
      className="p-0.5 rounded text-gray-600 hover:text-gray-300 transition-colors flex-shrink-0"
      title="Copy"
    >
      {copiedId === id ? <Check size={size} className="text-emerald-400" /> : <Copy size={size} />}
    </button>
  )

  // ── Render ─────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-100">Database Viewer</h2>
          <p className="text-sm text-gray-500 mt-1">
            Browse and manage scraped data &mdash;{' '}
            <span className="text-cyan-400">{user?.name || user?.email}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleRefresh} disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 border border-gray-700 text-sm text-gray-300 hover:text-gray-100 disabled:opacity-50 transition-colors">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
          <button onClick={handleExportCSV}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 border border-gray-700 text-sm text-gray-300 hover:text-gray-100 transition-colors">
            <Download size={14} />
            CSV
          </button>
          <button onClick={handleExportExcel}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gradient-to-r from-green-500 to-emerald-500 text-white text-sm font-medium hover:from-green-400 hover:to-emerald-400 transition-all shadow-lg shadow-emerald-500/20">
            <FileSpreadsheet size={14} />
            XLSX
          </button>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard title="Total Domains" value={resultStats.total} icon={Globe} color="cyan" />
        <StatCard title="Total Emails" value={emailStats.total} icon={Mail} color="emerald" />
        <StatCard title="Completed" value={resultStats.completed} icon={Database} color="blue" />
        <StatCard title="Failed" value={resultStats.failed} icon={Trash2} color="red" />
      </div>

      {/* Filter Bar */}
      <div className="glass rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <Filter size={14} className="text-gray-500" />
          <span className="text-xs text-gray-500 font-medium uppercase tracking-wide">Filters</span>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-200 outline-none focus:border-cyan-500">
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>{s === 'All' ? 'All Status' : s}</option>
            ))}
          </select>
          <div className="flex-1 min-w-[200px] relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input type="text" value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleApplyFilters() }}
              placeholder="Search domains..."
              className="w-full pl-9 pr-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-200 outline-none focus:border-cyan-500 placeholder-gray-600" />
          </div>
          <button onClick={handleApplyFilters} disabled={loading}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-500 text-white text-sm font-medium hover:from-cyan-400 hover:to-blue-400 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-cyan-500/20">
            <Filter size={14} />
            Apply
          </button>
        </div>
      </div>

      {/* ── Results Table ─ fixed columns, NO horizontal scroll ──────── */}
      <div className="glass rounded-xl p-5">
        {results.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Database size={40} className="text-gray-700 mb-3" />
            <p className="text-sm text-gray-500">No records to display.</p>
            <p className="text-xs text-gray-600 mt-1">Process domains first or adjust your filters.</p>
          </div>
        ) : (
          <table className="w-full text-left table-fixed">
            <colgroup>
              <col className="w-[22%]" />    {/* Domain */}
              <col className="w-[9%]" />     {/* Status */}
              <col className="w-[40%]" />    {/* Emails */}
              <col className="w-[15%]" />    {/* Social */}
              <col className="w-[14%]" />    {/* Actions */}
            </colgroup>
            <thead>
              <tr className="border-b border-gray-800">
                <th className="text-xs text-gray-500 font-medium pb-3">Domain</th>
                <th className="text-xs text-gray-500 font-medium pb-3 text-center">Status</th>
                <th className="text-xs text-gray-500 font-medium pb-3">
                  <span className="flex items-center gap-1"><Mail size={11} className="text-emerald-500/60" />Emails</span>
                </th>
                <th className="text-xs text-gray-500 font-medium pb-3">
                  <span className="flex items-center gap-1"><Share2 size={11} className="text-blue-500/60" />Social</span>
                </th>
                <th className="text-xs text-gray-500 font-medium pb-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {results.map((row) => {
                const emails = row.emails ?? []
                const socials = row.social_links ?? []
                return (
                  <tr key={row.id}
                    className="border-b border-gray-800/50 hover:bg-gray-800/30 group cursor-pointer"
                    onClick={() => handleView(row.id)}>

                    {/* ── Domain ────────────────────────────── */}
                    <td className="py-2.5 pr-2">
                      <div className="flex items-center gap-1 min-w-0">
                        <span className="text-sm font-mono text-gray-200 truncate" title={row.domain}>
                          {row.domain}
                        </span>
                        <CopyBtn text={row.domain} id={`d-${row.id}`} size={11} />
                      </div>
                      {row.error_message && (
                        <p className="text-[10px] text-red-400/60 mt-0.5 truncate" title={row.error_message}>
                          {row.error_message}
                        </p>
                      )}
                    </td>

                    {/* ── Status ────────────────────────────── */}
                    <td className="py-2.5 text-center">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${statusColor(row.status)}`}>
                        {row.status}
                      </span>
                    </td>

                    {/* ── Emails ── single cell, max 2 visible ─── */}
                    <td className="py-2.5 pr-2">
                      {emails.length > 0 ? (
                        <div className="flex flex-col gap-0.5">
                          {emails.slice(0, 2).map((em, i) => (
                            <div key={em.id} className="flex items-center gap-1 min-w-0">
                              <span className="text-[10px] text-gray-600 w-3 flex-shrink-0 text-right">{i + 1}.</span>
                              <span className="text-xs font-mono text-emerald-300/90 truncate" title={em.email}>
                                {em.email}
                              </span>
                              <CopyBtn text={em.email} id={`e-${em.id}`} />
                              {em.tier != null && em.tier > 0 && (
                                <span className="text-[9px] px-1 py-px rounded bg-cyan-500/10 text-cyan-400 flex-shrink-0">
                                  T{em.tier}
                                </span>
                              )}
                              {em.is_decision_maker && (
                                <span className="text-[9px] px-1 py-px rounded bg-purple-500/10 text-purple-400 flex-shrink-0">
                                  DM
                                </span>
                              )}
                            </div>
                          ))}
                          {emails.length > 2 && (
                            <span className="text-[10px] text-gray-500 pl-4">
                              +{emails.length - 2} more
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-gray-700">--</span>
                      )}
                    </td>

                    {/* ── Social ── compact icon pills, single line ── */}
                    <td className="py-2.5 pr-2">
                      {socials.length > 0 ? (
                        <div className="flex items-center gap-1">
                          {socials.slice(0, 3).map((sl) => {
                            const p = sl.platform.toLowerCase()
                            const c = SOCIAL_COLORS[p] || { bg: 'bg-gray-700/50', text: 'text-gray-400', hover: 'hover:bg-gray-700' }
                            return (
                              <a key={sl.id} href={sl.url}
                                target="_blank" rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded
                                           text-[10px] font-medium transition-colors flex-shrink-0
                                           ${c.bg} ${c.text} ${c.hover}`}
                                title={sl.url}>
                                {SOCIAL_LABELS[p] || p.slice(0, 2).toUpperCase()}
                                <ExternalLink size={7} className="opacity-60" />
                              </a>
                            )
                          })}
                          {socials.length > 3 && (
                            <span className="text-[10px] text-gray-500 flex-shrink-0">+{socials.length - 3}</span>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-gray-700">--</span>
                      )}
                    </td>

                    {/* ── Actions ───────────────────────────── */}
                    <td className="py-2.5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={(e) => { e.stopPropagation(); handleView(row.id) }}
                          className="p-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-cyan-400 transition-colors"
                          title="View details">
                          <Eye size={13} />
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); handleCopy(
                          emails.map(em => em.email).join(', '), `all-${row.id}`
                        )}}
                          className="p-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-emerald-400 transition-colors"
                          title="Copy all emails">
                          {copiedId === `all-${row.id}`
                            ? <Check size={13} className="text-emerald-400" />
                            : <Mail size={13} />}
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); handleDelete(row.id) }}
                          className="p-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-red-400 transition-colors"
                          title="Delete">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}

        {/* Pagination */}
        <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-800/50">
          <p className="text-xs text-gray-500">
            {totalCount > 0
              ? `Showing ${(page - 1) * PAGE_SIZE + 1}-${Math.min(page * PAGE_SIZE, totalCount)} of ${totalCount}`
              : 'No results'}
          </p>
          <div className="flex items-center gap-1.5">
            <button onClick={() => handlePageChange(Math.max(1, page - 1))}
              disabled={page <= 1 || loading}
              className="p-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-gray-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
              <ChevronLeft size={14} />
            </button>
            <span className="text-xs text-gray-400 px-2">Page {page} / {totalPages}</span>
            <button onClick={() => handlePageChange(Math.min(totalPages, page + 1))}
              disabled={page >= totalPages || loading}
              className="p-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-gray-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* ── Detail Modal ─────────────────────────────────────────────── */}
      {detailRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
             onClick={() => setDetailRecord(null)}>
          <div className="w-full max-w-2xl mx-4 glass rounded-xl p-6 border border-gray-700/50 shadow-2xl max-h-[85vh] overflow-y-auto custom-scrollbar"
               onClick={(e) => e.stopPropagation()}>

            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-100 truncate pr-4">{detailRecord.domain}</h3>
              <button onClick={() => setDetailRecord(null)}
                className="p-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-gray-200 transition-colors flex-shrink-0">
                <X size={14} />
              </button>
            </div>

            {/* Info grid */}
            <div className="grid grid-cols-3 gap-3 mb-4">
              {[
                { label: 'Status', value: (
                  <span className={`text-xs font-medium ${statusColor(detailRecord.status)} px-2 py-0.5 rounded-full`}>
                    {detailRecord.status}
                  </span>
                )},
                { label: 'Platform', value: detailRecord.platform || '--' },
                { label: 'Method', value: detailRecord.method || '--' },
                { label: 'Time', value: detailRecord.processing_time_ms != null ? `${detailRecord.processing_time_ms}ms` : '--' },
                { label: 'Cloudflare', value: (
                  <span className={detailRecord.has_cloudflare ? 'text-amber-400' : 'text-gray-500'}>
                    {detailRecord.has_cloudflare ? 'Yes' : 'No'}
                  </span>
                )},
                { label: 'Processed', value: <span className="text-xs">{detailRecord.processed_at || '--'}</span> },
              ].map((item) => (
                <div key={item.label} className="p-2.5 rounded-lg bg-gray-800/50 border border-gray-700/50">
                  <p className="text-[10px] text-gray-500 uppercase mb-0.5">{item.label}</p>
                  <div className="text-sm text-gray-200">{item.value}</div>
                </div>
              ))}
            </div>

            {/* Error */}
            {detailRecord.error_message && (
              <div className="mb-4 p-3 rounded-lg bg-red-500/5 border border-red-500/20">
                <p className="text-[10px] text-red-400 uppercase mb-1">Error</p>
                <p className="text-xs text-red-300 font-mono break-all">{detailRecord.error_message}</p>
              </div>
            )}

            {/* Emails */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-gray-500 uppercase flex items-center gap-1.5">
                  <Mail size={12} className="text-emerald-400" />
                  Emails ({detailRecord.emails?.length || 0})
                </p>
                {(detailRecord.emails?.length ?? 0) > 0 && (
                  <button
                    onClick={() => handleCopy(
                      (detailRecord.emails ?? []).map(e => e.email).join('\n'),
                      'modal-all-emails'
                    )}
                    className="text-[10px] text-gray-500 hover:text-emerald-400 transition-colors flex items-center gap-1">
                    {copiedId === 'modal-all-emails'
                      ? <><Check size={10} className="text-emerald-400" /> Copied!</>
                      : <><Copy size={10} /> Copy all</>}
                  </button>
                )}
              </div>
              {detailRecord.emails && detailRecord.emails.length > 0 ? (
                <div className="space-y-1.5 max-h-48 overflow-y-auto custom-scrollbar">
                  {detailRecord.emails.map((em, idx) => (
                    <div key={em.id} className="flex items-center justify-between p-2 rounded-lg bg-gray-800/50 border border-gray-700/50">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-[10px] text-gray-500 font-medium w-5 flex-shrink-0 text-right">
                          {idx + 1}.
                        </span>
                        <Mail size={12} className="text-emerald-400 flex-shrink-0" />
                        <span className="text-xs font-mono text-gray-200 truncate">{em.email}</span>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
                        {em.tier && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400">T{em.tier}</span>
                        )}
                        {em.is_decision_maker && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-500/10 text-purple-400">DM</span>
                        )}
                        <CopyBtn text={em.email} id={`m-em-${em.id}`} />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-gray-600 italic">No emails found</p>
              )}
            </div>

            {/* Social Links */}
            <div>
              <p className="text-xs text-gray-500 uppercase mb-2 flex items-center gap-1.5">
                <Share2 size={12} className="text-blue-400" />
                Social Media ({detailRecord.social_links?.length || 0})
              </p>
              {detailRecord.social_links && detailRecord.social_links.length > 0 ? (
                <div className="space-y-1.5 max-h-40 overflow-y-auto custom-scrollbar">
                  {detailRecord.social_links.map((sl) => {
                    const p = sl.platform.toLowerCase()
                    const c = SOCIAL_COLORS[p] || { bg: 'bg-gray-700/50', text: 'text-gray-400', hover: 'hover:bg-gray-700' }
                    return (
                      <div key={sl.id} className="flex items-center justify-between p-2 rounded-lg bg-gray-800/50 border border-gray-700/50">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${c.bg} ${c.text}`}>
                            {SOCIAL_LABELS[p] || p.slice(0, 2).toUpperCase()}
                          </span>
                          <span className="text-xs font-mono text-gray-400 truncate">{sl.url}</span>
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
                          <a href={sl.url} target="_blank" rel="noopener noreferrer"
                            className="p-1 rounded bg-gray-700 hover:bg-gray-600 text-gray-400 hover:text-cyan-400 transition-colors"
                            title="Open">
                            <ExternalLink size={10} />
                          </a>
                          <CopyBtn text={sl.url} id={`m-sl-${sl.id}`} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <p className="text-xs text-gray-600 italic">No social media links found</p>
              )}
            </div>

            {/* Decision Makers / Contacts */}
            <div className="mt-4">
              <p className="text-xs text-gray-500 uppercase mb-2 flex items-center gap-1.5">
                <UserCheck size={12} className="text-purple-400" />
                Karar Vericiler ({detailRecord.contacts?.length || 0})
              </p>
              {detailRecord.contacts && detailRecord.contacts.length > 0 ? (
                <div className="space-y-1.5 max-h-48 overflow-y-auto custom-scrollbar">
                  {detailRecord.contacts.map((ct) => {
                    const scoreBg = ct.score >= 80
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                      : ct.score >= 50
                        ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                        : 'bg-gray-500/10 text-gray-400 border-gray-500/30'
                    return (
                      <div key={ct.id} className="flex items-center justify-between p-2 rounded-lg bg-gray-800/50 border border-gray-700/50">
                        <div className="flex items-center gap-2 min-w-0">
                          <UserCheck size={12} className="text-purple-400 flex-shrink-0" />
                          <div className="min-w-0">
                            <span className="text-xs text-gray-200 block truncate">
                              {ct.full_name || '--'}
                            </span>
                            {ct.role && (
                              <span className="text-[10px] text-blue-400 block truncate">{ct.role}</span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-medium ${scoreBg}`}>
                            {ct.score}
                          </span>
                          {ct.email_found && (
                            <span className="text-[10px] text-emerald-400 font-mono max-w-[120px] truncate" title={ct.email_found}>
                              {ct.email_found}
                            </span>
                          )}
                          {ct.email_verified && (
                            <span className="text-[9px] px-1 py-px rounded bg-emerald-500/15 text-emerald-400">✓</span>
                          )}
                          {ct.linkedin_url && (
                            <a href={ct.linkedin_url} target="_blank" rel="noopener noreferrer"
                              className="p-1 rounded bg-gray-700 hover:bg-gray-600 text-sky-400 hover:text-sky-300 transition-colors"
                              title="LinkedIn">
                              <Linkedin size={10} />
                            </a>
                          )}
                          {ct.email_found && <CopyBtn text={ct.email_found} id={`m-ct-${ct.id}`} />}
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <p className="text-xs text-gray-600 italic">No decision makers found</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
